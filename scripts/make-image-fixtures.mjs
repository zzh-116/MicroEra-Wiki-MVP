// Generate image-bearing PDF + DOCX fixtures for the B-2 Docling image-wiring
// acceptance tests. Uses only Node built-ins (zlib + manual CRC32/ZIP/PDF) so it
// runs anywhere; no external libraries.
//
//   tests/fixtures/real-pdf-image.pdf   — a valid PDF whose page draws an 8x8
//                                         FlateDecode RGB image XObject.
//   tests/fixtures/real-docx-image.docx — a valid DOCX (ZIP) with an inline
//                                         PNG in word/media/image1.png.
//
// Both embed the token "Zephyrquasar Image Fixture" in body text so a parse can
// be asserted to have actually read the file.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'tests', 'fixtures');

// ---- CRC32 ----
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

// ---- PNG (8x8 RGB gradient, deterministic) ----
function makePng(w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      raw[o++] = Math.round((x * 255) / (w - 1));
      raw[o++] = Math.round((y * 255) / (h - 1));
      raw[o++] = Math.round(((x + y) * 255) / (w + h - 2));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, c]);
  };
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- PDF ----
function makePdf() {
  const w = 8;
  const h = 8;
  const raw = Buffer.alloc(w * h * 3);
  let o = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      raw[o++] = Math.round((x * 255) / (w - 1));
      raw[o++] = Math.round((y * 255) / (h - 1));
      raw[o++] = Math.round(((x + y) * 255) / (w + h - 2));
    }
  }
  const imgStream = zlib.deflateSync(raw);

  const chunks = [];
  const offsets = new Map();
  chunks.push(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'));

  const addObj = (num, body) => {
    offsets.set(num, Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${num} 0 obj\n`, 'latin1'));
    chunks.push(body);
    chunks.push(Buffer.from('\nendobj\n', 'latin1'));
  };

  addObj(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  addObj(2, Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'));
  addObj(3, Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im1 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>', 'latin1'));
  const imgHeader = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imgStream.length} >>\nstream\n`, 'latin1');
  addObj(4, Buffer.concat([imgHeader, imgStream, Buffer.from('\nendstream', 'latin1')]));

  // Content stream: draw the image, plus a text label (Helvetica) so the page has
  // searchable body text alongside the image.
  const text = 'Zephyrquasar Image Fixture';
  const contentStr =
    'q\n100 0 0 100 0 100 cm\n/Im1 Do\nQ\n' +
    'BT\n/F1 12 Tf\n10 20 Td\n(Zephyrquasar Image Fixture) Tj\nET\n';
  const content = Buffer.from(contentStr, 'latin1');
  const contentHeader = Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1');
  addObj(5, Buffer.concat([contentHeader, content, Buffer.from('\nendstream', 'latin1')]));

  // Font (Helvetica base-14, no embedding needed).
  addObj(6, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1'));

  const xrefOffset = Buffer.concat(chunks).length;
  const n = 7;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) xref += `${String(offsets.get(i)).padStart(10, '0')} 00000 n \n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  chunks.push(Buffer.from(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'latin1'));

  return Buffer.concat(chunks);
}

// ---- DOCX (ZIP with inline PNG) ----
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const method = compressed.length < data.length ? 8 : 0;
    const payload = method === 8 ? compressed : data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(Buffer.concat([local, nameBuf, payload]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += locals[locals.length - 1].length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, end]);
}

function makeDocx(png) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p><w:r><w:t>Zephyrquasar Image Fixture</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><wp:extent cx="100000" cy="100000"/><wp:docPr id="1" name="image1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="image1"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
</w:body>
</w:document>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

  return zip([
    ['[Content_Types].xml', Buffer.from(contentTypes, 'utf8')],
    ['_rels/.rels', Buffer.from(rels, 'utf8')],
    ['word/document.xml', Buffer.from(documentXml, 'utf8')],
    ['word/_rels/document.xml.rels', Buffer.from(documentRels, 'utf8')],
    ['word/media/image1.png', png],
  ]);
}

const png = makePng(8, 8);
const pdf = makePdf();
const docx = makeDocx(png);

fs.mkdirSync(FIXTURES, { recursive: true });
fs.writeFileSync(path.join(FIXTURES, 'real-pdf-image.pdf'), pdf);
fs.writeFileSync(path.join(FIXTURES, 'real-docx-image.docx'), docx);

console.log(`wrote real-pdf-image.pdf (${pdf.length} bytes)`);
console.log(`wrote real-docx-image.docx (${docx.length} bytes)`);
