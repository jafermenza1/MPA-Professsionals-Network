import { deflateRawSync, inflateRawSync } from "node:zlib";

function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function xmlDecode(value) {
  return String(value ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function columnIndex(letters) { let result = 0; for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64; return result - 1; }
function columnName(index) { let value = index + 1, result = ""; while (value) { const rem = (value - 1) % 26; result = String.fromCharCode(65 + rem) + result; value = Math.floor((value - 1) / 26); } return result; }

function unzip(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("The XLSX file is not a valid ZIP-based Excel workbook.");
  const count = buffer.readUInt16LE(eocd + 10), centralOffset = buffer.readUInt32LE(eocd + 16);
  const files = new Map(); let offset = centralOffset, totalUncompressed = 0;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("The XLSX central directory is invalid.");
    const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20), uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > 25 * 1024 * 1024 || totalUncompressed > 50 * 1024 * 1024) throw new Error("The XLSX workbook expands beyond the allowed import size.");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("The XLSX file contains an invalid entry.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error("The XLSX file uses an unsupported ZIP compression method.");
    if (data.length !== uncompressedSize) throw new Error("The XLSX entry length is invalid.");
    files.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function entryText(files, name) { const value = files.get(name); return value ? value.toString("utf8") : ""; }
export function parseXlsxRows(input) {
  const files = unzip(input);
  const workbook = entryText(files, "xl/workbook.xml");
  const relationships = entryText(files, "xl/_rels/workbook.xml.rels");
  const firstSheet = workbook.match(/<sheet\\b[^>]*\\br:id="([^"]+)"/);
  const target = firstSheet && relationships.match(new RegExp("<Relationship\\\\b(?=[^>]*\\\\bId=\\""+firstSheet[1]+"\\")(?=[^>]*\\\\bTarget=\\"([^"]+)\\")[^>]*/>"));
  const sheetTarget = target?.[1] || "worksheets/sheet1.xml";
  const sheetPath = sheetTarget.startsWith("/") ? sheetTarget.slice(1) : "xl/" + sheetTarget.replace(/^\\.\\//, "");
  const sheet = entryText(files, sheetPath);
  if (!sheet) throw new Error("The XLSX workbook has no readable first worksheet.");
  const sharedXml = entryText(files, "xl/sharedStrings.xml");
  const shared = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(part => xmlDecode(part[1])).join("")
  );
  const matrix = [];
  for (const rowMatch of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const values = [];
    const rowXml = rowMatch[1];
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    for (const cellMatch of rowXml.matchAll(cellPattern)) {
      const attrs = cellMatch[1], body = cellMatch[2] || "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/), type = attrs.match(/\bt="([^"]+)"/);
      if (!ref) continue;
      const index = columnIndex(ref[1]);
      const valueMatch = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
      const inline = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xmlDecode(m[1])).join("");
      let value = valueMatch ? xmlDecode(valueMatch[1]) : inline;
      if (type?.[1] === "s") value = shared[Number(value)] ?? "";
      else if (type?.[1] === "b") value = value === "1" ? "true" : "false";
      values[index] = value;
    }
    matrix.push(values.map(value => value ?? ""));
  }
  if (!matrix.length) throw new Error("The first worksheet contains no rows.");
  const headers = matrix[0].map(value => String(value).trim());
  if (!headers.some(Boolean)) throw new Error("The first worksheet must have a header row.");
  const rows = matrix.slice(1).filter(row => row.some(value => String(value ?? "").trim())).map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]).filter(([header]) => header))
  );
  return { headers, rows };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const localParts = [], centralParts = []; let offset = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, source] of Object.entries(files)) {
    const filename = Buffer.from(name), data = Buffer.from(source, "utf8"), compressed = deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, filename, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const central = Buffer.concat(centralParts), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}
export function createXlsx(rows, headers) {
  const columns = headers || Object.keys(rows[0] || {});
  const allRows = [columns, ...rows.map(row => columns.map(key => row[key] ?? ""))];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = columnName(columnIndex) + (rowIndex + 1);
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
    }).join("");
    return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>';
  }).join("");
  const files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Reference data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows + '</sheetData></worksheet>'
  };
  return zip(files);
}
