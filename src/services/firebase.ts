// Port of App\Services\FirebaseService (FCM HTTP v1 with a hand-signed service-account JWT, no SDK).
import { createSign } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** PHP json_encode() with default flags: escapes "/" and every non-ASCII code unit as \uXXXX; empty array → []. */
export function phpJsonEncode(value: unknown): string {
  const json = JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0 ? [] : v,
  );
  return json.replace(/\//g, '\\/').replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** PHP base64UrlEncode(): rtrim(strtr(base64_encode($data), '+/', '-_'), '='). */
const base64UrlEncode = (data: string | Buffer) =>
  Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---- HTTP transport (injectable so tests never hit Google) ----
export interface HttpRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}
export interface HttpResponse {
  status: number;
  body: string;
}
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

const fetchTransport: Transport = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  return { status: res.status, body: await res.text() };
};

let transport: Transport = fetchTransport;
/** Tests: replace the HTTP layer (returns the previous one). Pass null to restore the real fetch transport. */
export function setFcmTransport(t: Transport | null): Transport {
  const prev = transport;
  transport = t ?? fetchTransport;
  return prev;
}

/** Laravel `$response->json()`: json_decode($body, true) → null on invalid JSON. */
function jsonOrNull(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// Cache::remember('fcm_access_token', 3300, ...). Laravel uses CACHE_STORE=database (PHP-serialized);
// Node keeps its own process-local cache with the same key/TTL.
const tokenCache = new Map<string, { value: string; expires: number }>();
export function clearFcmTokenCache() {
  tokenCache.clear();
}

/** PHP ErrorException raised by Laravel's error handler (warnings/notices become exceptions). */
class ErrorException extends Error {
  exceptionClass = 'ErrorException';
}

export interface FcmResult {
  success: boolean;
  message: string;
  response?: unknown;
  error?: unknown;
  status?: number;
}

type Data = Record<string, string>;

export class FirebaseService {
  protected projectId: string;
  protected serviceAccount: Record<string, any>;

  constructor() {
    // base_path(env('FIREBASE_CREDENTIALS')) — base path = Laravel project root (FIREBASE_BASE_PATH, default cwd).
    const base = process.env.FIREBASE_BASE_PATH ?? process.cwd();
    const rel = process.env.FIREBASE_CREDENTIALS ?? '';
    const file = rel ? path.join(base, rel) : base;
    let contents: string;
    try {
      if (statSync(file).isDirectory()) {
        // Laravel quirk: env missing → base_path('') is a directory → notice → ErrorException.
        throw new ErrorException('file_get_contents(): Read of 8192 bytes failed with errno=21 Is a directory');
      }
      contents = readFileSync(file, 'utf8');
    } catch (e) {
      if (e instanceof ErrorException) throw e;
      throw new ErrorException(`file_get_contents(${file}): Failed to open stream: No such file or directory`);
    }
    const decoded = jsonOrNull(contents);
    if (!decoded || typeof decoded !== 'object') {
      throw new ErrorException('Trying to access array offset on value of type null');
    }
    this.serviceAccount = decoded as Record<string, any>;
    if (!('project_id' in this.serviceAccount)) throw new ErrorException('Undefined array key "project_id"');
    this.projectId = this.serviceAccount.project_id;
  }

  /** Get OAuth 2.0 Access Token */
  protected async getAccessToken(): Promise<string> {
    const cached = tokenCache.get('fcm_access_token');
    if (cached && cached.expires > Date.now()) return cached.value;

    const now = Math.floor(Date.now() / 1000);
    const header = phpJsonEncode({ alg: 'RS256', typ: 'JWT' });
    const claimSet = phpJsonEncode({
      iss: this.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });
    const signatureInput = base64UrlEncode(header) + '.' + base64UrlEncode(claimSet);
    // An unusable private_key throws here (PHP: openssl warning → ErrorException); sendRequest catches both.
    const signer = createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(this.serviceAccount.private_key);
    const jwt = signatureInput + '.' + base64UrlEncode(signature);

    const response = await transport({
      url: 'https://oauth2.googleapis.com/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
    });
    if (response.status >= 200 && response.status < 300) {
      const token = (jsonOrNull(response.body) as Record<string, any>)?.access_token;
      tokenCache.set('fcm_access_token', { value: token, expires: Date.now() + 3300 * 1000 });
      return token;
    }
    throw new Error('Failed to get access token: ' + response.body);
  }

  private messagesUrl() {
    return `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
  }

  /** Send notification to a single device */
  async sendToDevice(fcmToken: unknown, title: string, body: string, data: Data = {}, image: string | null = null) {
    const message: Record<string, any> = { token: fcmToken, notification: { title, body }, data };
    if (image) message.notification.image = image;
    return this.sendRequest(this.messagesUrl(), { message });
  }

  /** Send notification to multiple devices (v1 API has no multicast — one request per token). */
  async sendToMultipleDevices(fcmTokens: unknown[], title: string, body: string, data: Data = {}, image: string | null = null) {
    const results = { success: 0, failed: 0, responses: [] as FcmResult[] };
    for (const token of fcmTokens) {
      const result = await this.sendToDevice(token, title, body, data, image);
      if (result.success) results.success++;
      else results.failed++;
      results.responses.push(result);
    }
    return results;
  }

  async sendToTopic(topic: string, title: string, body: string, data: Data = {}) {
    return this.sendRequest(this.messagesUrl(), { message: { topic, notification: { title, body }, data } });
  }

  async sendWithConfig(fcmToken: string, title: string, body: string, data: Data = {}) {
    return this.sendRequest(this.messagesUrl(), {
      message: {
        token: fcmToken,
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: {
            title,
            body,
            icon: 'notification_icon',
            color: '#f45342',
            sound: 'default',
            channel_id: 'high_importance_channel',
          },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { alert: { title, body }, badge: 1, sound: 'default' } },
        },
      },
    });
  }

  async sendDataOnly(fcmToken: string, data: Data) {
    return this.sendRequest(this.messagesUrl(), { message: { token: fcmToken, data } });
  }

  async sendConditional(condition: string, title: string, body: string, data: Data = {}) {
    return this.sendRequest(this.messagesUrl(), { message: { condition, notification: { title, body }, data } });
  }

  private async post(url: string, payload: unknown): Promise<HttpResponse> {
    const accessToken = await this.getAccessToken();
    return transport({
      url,
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: phpJsonEncode(payload),
    });
  }

  /** Make HTTP request to FCM v1 API */
  protected async sendRequest(url: string, payload: unknown): Promise<FcmResult> {
    try {
      const response = await this.post(url, payload);
      if (response.status >= 200 && response.status < 300) {
        return { success: true, message: 'Notification sent successfully', response: jsonOrNull(response.body) };
      }
      return {
        success: false,
        message: 'Failed to send notification',
        error: jsonOrNull(response.body),
        status: response.status,
      };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  private async topicOp(op: 'batchAdd' | 'batchRemove', fcmTokens: string[], topic: string, ok: string, fail: string) {
    try {
      const response = await this.post(`https://iid.googleapis.com/iid/v1:${op}`, {
        to: '/topics/' + topic,
        registration_tokens: fcmTokens,
      });
      if (response.status >= 200 && response.status < 300) {
        return { success: true, message: ok, response: jsonOrNull(response.body) };
      }
      return { success: false, message: fail, error: jsonOrNull(response.body) };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async subscribeToTopic(fcmTokens: string[], topic: string) {
    return this.topicOp('batchAdd', fcmTokens, topic, 'Subscribed to topic', 'Failed to subscribe');
  }

  async unsubscribeFromTopic(fcmTokens: string[], topic: string) {
    return this.topicOp('batchRemove', fcmTokens, topic, 'Unsubscribed from topic', 'Failed to unsubscribe');
  }
}
