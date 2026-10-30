// Minimal .xlsx reader/writer (zip + SpreadsheetML) used by the category / sub-category Excel imports in
// place of maatwebsite/excel + PhpSpreadsheet. No npm dependency: zip entries are read with node:zlib.
// Reads what `Excel::import()` with `WithMultipleSheets [0 => …]` + `WithHeadingRow` (row 1, `slug` formatter)
// + `ToModel` consumes: the first sheet's cell values (`getValue()`, no formula calculation).
import zlib from 'node:zlib';

export type CellValue = string | number | boolean | null;

// ---------------------------------------------------------------- zip

function readZip(zip: Buffer): Map<string, Buffer> {
  let endOfCentralDirectory = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      endOfCentralDirectory = i;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error('Could not find zip member zip://' + 'xl/workbook.xml'); // PhpSpreadsheet: not a zip
  const count = zip.readUInt16LE(endOfCentralDirectory + 10);
  let offset = zip.readUInt32LE(endOfCentralDirectory + 16);
  const files = new Map<string, Buffer>();
  for (let entry = 0; entry < count; entry++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) break;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeader = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = zip.readUInt16LE(localHeader + 26);
    const localExtraLength = zip.readUInt16LE(localHeader + 28);
    const start = localHeader + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(start, start + compressedSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(compressed) : Buffer.from(compressed));
    offset += 46 + nameLength + extraLength + commentLength;
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
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    locals.push(localHeader, nameBuf, data);
    centrals.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

// ---------------------------------------------------------------- xml helpers

const unescapeXml = (xml: string) =>
  xml
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/_x([0-9A-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Text of every <t> in a fragment, skipping phonetic runs (<rPh>) — RichText::getPlainText(). */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)]
    .map((match) => unescapeXml(match[1] ?? ''))
    .join('');

export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** PhpSpreadsheet numeric cell → int when it looks integral, float otherwise. */
function numeric(raw: string): number | string {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : raw;
}

/** First worksheet as a dense grid: rows 1..highestRow, columns A..highestColumn (missing cells → null). */
export function readFirstSheet(workbookFile: Buffer): CellValue[][] {
  const files = readZip(workbookFile);
  const get = (entryPath: string) => files.get(entryPath)?.toString('utf8');
  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('Could not find zip member xl/workbook.xml');
  const sheetTag = /<(?:\w+:)?sheet\b[^>]*>/.exec(workbook)?.[0];
  if (!sheetTag) throw new Error('Your requested sheet index: 0 is out of bounds. The actual number of sheets is 0.');
  const relationshipId = attr(sheetTag, 'r:id') ?? attr(sheetTag, 'id');
  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  let target = 'worksheets/sheet1.xml';
  for (const relationship of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (attr(relationship[0], 'Id') === relationshipId) target = attr(relationship[0], 'Target') ?? target;
  }
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheet = get(sheetPath);
  if (!sheet) throw new Error(`Could not find zip member ${sheetPath}`);

  const shared: string[] = [];
  const sharedStrings = get('xl/sharedStrings.xml');
  if (sharedStrings) for (const item of sharedStrings.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(textOf(item[1] ?? ''));

  const cells = new Map<number, Map<number, CellValue>>();
  let maxRow = 0;
  let maxCol = -1;
  let rowCursor = 0;
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(rowMatch[1]!, 'r') ?? rowCursor + 1);
    rowCursor = rowNumber;
    let colCursor = -1;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1]!;
      const ref = attr(attributes, 'r');
      const column = ref ? columnIndex(ref) : colCursor + 1;
      colCursor = column;
      const body = cellMatch[2] ?? '';
      const type = attr(attributes, 't') ?? 'n';
      const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: CellValue = null;
      if (formula !== undefined) value = '=' + unescapeXml(formula);
      else if (type === 's') value = raw === undefined ? null : (shared[Number(raw)] ?? '');
      else if (type === 'inlineStr') value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else if (type === 'b') value = raw === undefined ? null : raw === '1';
      else if (type === 'str' || type === 'e') value = raw === undefined ? null : unescapeXml(raw);
      else value = raw === undefined ? null : numeric(raw);
      if (!cells.has(rowNumber)) cells.set(rowNumber, new Map());
      cells.get(rowNumber)!.set(column, value);
      maxRow = Math.max(maxRow, rowNumber);
      maxCol = Math.max(maxCol, column);
    }
  }
  const grid: CellValue[][] = [];
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber++) {
    const row: CellValue[] = [];
    for (let column = 0; column <= maxCol; column++) row.push(cells.get(rowNumber)?.get(column) ?? null);
    grid.push(row);
  }
  return grid;
}

/** `Str::slug($value, '_')` (maatwebsite heading-row `slug` formatter) for Latin input. */
export function slugUnderscore(value: string): string {
  let slug = value.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  slug = slug.replace(/-+/g, '_');
  slug = slug.split('@').join('_at_');
  slug = slug.toLowerCase().replace(/[^_\p{L}\p{N}\s]+/gu, '');
  slug = slug.replace(/[_\s]+/gu, '_');
  return slug.replace(/^_+|_+$/g, '');
}

/** WithHeadingRow (row 1): rows 2..n as `heading => value` (empty heading → its column index). */
export function headingRows(grid: CellValue[][]): Array<{ rowNumber: number; row: Record<string, CellValue> }> {
  const headings = (grid[0] ?? []).map((heading, i) =>
    heading === null || heading === '' || heading === false ? String(i) : slugUnderscore(String(heading)),
  );
  return grid.slice(1).map((cells, i) => {
    const row: Record<string, CellValue> = {};
    headings.forEach((heading, column) => (row[heading] = cells[column] ?? null));
    return { rowNumber: i + 2, row };
  });
}

/** Build a one-sheet .xlsx (inline strings / numbers) — used by tests and parity runs. */
export function writeXlsx(rows: CellValue[][]): Buffer {
  const colName = (index: number) => {
    let name = '';
    for (let remaining = index + 1; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
      name = String.fromCharCode(65 + ((remaining - 1) % 26)) + name;
    }
    return name;
  };
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">` +
        row
          .map((value, valueIndex) => {
            const ref = `${colName(valueIndex)}${rowIndex + 1}`;
            if (value === null) return '';
            if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
          })
          .join('') +
        '</row>',
    )
    .join('');
  const namespace = 'http://schemas.openxmlformats.org';
  return writeZip([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${namespace}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${namespace}/spreadsheetml/2006/main" xmlns:r="${namespace}/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${namespace}/package/2006/relationships"><Relationship Id="rId1" Type="${namespace}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ],
    [
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${namespace}/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${namespace}/package/2006/relationships"><Relationship Id="rId1" Type="${namespace}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
  ]);
}
