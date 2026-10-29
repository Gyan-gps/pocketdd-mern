// Minimal .xlsx reader/writer (zip + SpreadsheetML) used by the category / sub-category Excel imports in
// place of maatwebsite/excel + PhpSpreadsheet. No npm dependency: zip entries are read with node:zlib.
// Reads what `Excel::import()` with `WithMultipleSheets [0 => …]` + `WithHeadingRow` (row 1, `slug` formatter)
// + `ToModel` consumes: the first sheet's cell values (`getValue()`, no formula calculation).
import zlib from 'node:zlib';

export type CellValue = string | number | boolean | null;

// ---------------------------------------------------------------- zip

function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Could not find zip member zip://' + 'xl/workbook.xml'); // PhpSpreadsheet: not a zip
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Stored (uncompressed) zip — enough for test fixtures. */
function writeZip(entries: Array<[string, string]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------------------------------------------------------------- xml helpers

const unescapeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Text of every <t> in a fragment, skipping phonetic runs (<rPh>) — RichText::getPlainText(). */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)]
    .map((m) => unescapeXml(m[1] ?? ''))
    .join('');

export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** PhpSpreadsheet numeric cell → int when it looks integral, float otherwise. */
function numeric(v: string): number | string {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

/** First worksheet as a dense grid: rows 1..highestRow, columns A..highestColumn (missing cells → null). */
export function readFirstSheet(buf: Buffer): CellValue[][] {
  const files = readZip(buf);
  const get = (p: string) => files.get(p)?.toString('utf8');
  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('Could not find zip member xl/workbook.xml');
  const sheetTag = /<(?:\w+:)?sheet\b[^>]*>/.exec(workbook)?.[0];
  if (!sheetTag) throw new Error('Your requested sheet index: 0 is out of bounds. The actual number of sheets is 0.');
  const rid = attr(sheetTag, 'r:id') ?? attr(sheetTag, 'id');
  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  let target = 'worksheets/sheet1.xml';
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) if (attr(m[0], 'Id') === rid) target = attr(m[0], 'Target') ?? target;
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheet = get(sheetPath);
  if (!sheet) throw new Error(`Could not find zip member ${sheetPath}`);

  const shared: string[] = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(textOf(m[1] ?? ''));

  const cells = new Map<number, Map<number, CellValue>>();
  let maxRow = 0;
  let maxCol = -1;
  let rowCursor = 0;
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rm[1]!, 'r') ?? rowCursor + 1);
    rowCursor = r;
    let colCursor = -1;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1]!;
      const ref = attr(a, 'r');
      const c = ref ? columnIndex(ref) : colCursor + 1;
      colCursor = c;
      const body = cm[2] ?? '';
      const t = attr(a, 't') ?? 'n';
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: CellValue = null;
      if (f !== undefined) value = '=' + unescapeXml(f);
      else if (t === 's') value = v === undefined ? null : (shared[Number(v)] ?? '');
      else if (t === 'inlineStr') value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else if (t === 'b') value = v === undefined ? null : v === '1';
      else if (t === 'str' || t === 'e') value = v === undefined ? null : unescapeXml(v);
      else value = v === undefined ? null : numeric(v);
      if (!cells.has(r)) cells.set(r, new Map());
      cells.get(r)!.set(c, value);
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    }
  }
  const grid: CellValue[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c <= maxCol; c++) row.push(cells.get(r)?.get(c) ?? null);
    grid.push(row);
  }
  return grid;
}

/** `Str::slug($value, '_')` (maatwebsite heading-row `slug` formatter) for Latin input. */
export function slugUnderscore(value: string): string {
  let s = value.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/-+/g, '_');
  s = s.split('@').join('_at_');
  s = s.toLowerCase().replace(/[^_\p{L}\p{N}\s]+/gu, '');
  s = s.replace(/[_\s]+/gu, '_');
  return s.replace(/^_+|_+$/g, '');
}

/** WithHeadingRow (row 1): rows 2..n as `heading => value` (empty heading → its column index). */
export function headingRows(grid: CellValue[][]): Array<{ rowNumber: number; row: Record<string, CellValue> }> {
  const head = (grid[0] ?? []).map((h, i) => (h === null || h === '' || h === false ? String(i) : slugUnderscore(String(h))));
  return grid.slice(1).map((cells, i) => {
    const row: Record<string, CellValue> = {};
    head.forEach((h, c) => (row[h] = cells[c] ?? null));
    return { rowNumber: i + 2, row };
  });
}

/** Build a one-sheet .xlsx (inline strings / numbers) — used by tests and parity runs. */
export function writeXlsx(rows: CellValue[][]): Buffer {
  const colName = (i: number) => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const sheetRows = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">` +
        r
          .map((v, ci) => {
            const ref = `${colName(ci)}${ri + 1}`;
            if (v === null) return '';
            if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(v))}</t></is></c>`;
          })
          .join('') +
        '</row>',
    )
    .join('');
  const ns = 'http://schemas.openxmlformats.org';
  return writeZip([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ],
    [
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
  ]);
}
