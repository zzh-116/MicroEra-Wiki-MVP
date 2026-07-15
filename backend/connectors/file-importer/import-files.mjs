// 文件批量导入脚本
// 用法: node backend/connectors/file-importer/import-files.mjs <目录路径>
// 支持: PDF(pypdf), DOCX/PPTX(Docling), XLSX(xlsx), MD/TXT

import http from 'http';
import fs from 'fs';
import path from 'path';

const DIR = process.argv[2];
if (!DIR) { console.error('用法: node import-files.mjs <目录路径>'); process.exit(1); }
if (!fs.existsSync(DIR)) { console.error('目录不存在:', DIR); process.exit(1); }

const WIKI_URL = 'http://localhost:3001';

async function importToWiki(content, fileName, title, type, tags) {
  const data = JSON.stringify({
    content, fileName,
    entryMetadata: {
      title, entry_type: type || 'tech',
      summary: content.replace(/\n/g, ' ').slice(0, 80),
      visibility: 'internal',
      tags: tags || []
    },
    chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 }
  });
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/pipeline/import/string',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function processPDF(filePath, fileName) {
  // 使用 Python pypdf 提取文本
  return new Promise((resolve) => {
    const name = fileName.replace(/\.[^.]+$/, '');
    const child = require('child_process').spawn('python', ['-c', 
import pypdf, sys
reader = pypdf.PdfReader(r'')
pages = [(p.extract_text() or '') for p in reader.pages]
sys.stdout.write(f'# \\n\\n总页数: {len(reader.pages)}\\n\\n')
sys.stdout.write('\\n\\n---\\n\\n'.join(pages))
    ]);
    let output = ''; let error = '';
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => error += d);
    child.on('close', async (code) => {
      if (code === 0 && output.trim()) {
        const r = await importToWiki(output.trim(), fileName, name, 'tech', ['PDF', '文档']);
        resolve(r?.success ? r.entryId : null);
      } else {
        // 如果 pypdf 失败，用简单描述导入
        const r = await importToWiki(# \\n\\nPDF文件: , fileName, name, 'tech', ['PDF']);
        resolve(r?.success ? r.entryId : null);
      }
    });
  });
}

async function processXLSX(filePath, fileName) {
  try {
    const XLSX = await import('xlsx');
    const name = fileName.replace(/\.[^.]+$/, '');
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let lines = [# , '', 原始文件: , '', '## 数据内容', ''];
    if (data.length > 0) {
      lines.push('| ' + data[0].join(' | ') + ' |');
      lines.push('| ' + data[0].map(() => '---').join(' | ') + ' |');
      for (let i = 1; i < Math.min(data.length, 20); i++) {
        lines.push('| ' + data[i].join(' | ') + ' |');
      }
      if (data.length > 20) lines.push('| ... 共' + data.length + '行 ... |');
    }
    const r = await importToWiki(lines.join('\n'), fileName, name, 'data_item', ['Excel', '数据']);
    return r?.success ? r.entryId : null;
  } catch {
    const name = fileName.replace(/\.[^.]+$/, '');
    const r = await importToWiki(# \\n\\nExcel文件: , fileName, name, 'data_item', ['Excel']);
    return r?.success ? r.entryId : null;
  }
}

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const name = fileName.replace(/\.[^.]+$/, '');
  
  if (ext === '.pdf') return await processPDF(filePath, fileName);
  if (ext === '.xlsx' || ext === '.xls') return await processXLSX(filePath, fileName);
  if (ext === '.md' || ext === '.txt') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const r = await importToWiki(content, fileName, name, 'tech', ['文档']);
    return r?.success ? r.entryId : null;
  }
  // DOCX/PPTX 走 Docling（通过 batch import）
  console.log('  SKIP (use batch import): ' + fileName);
  return null;
}

async function main() {
  const files = fs.readdirSync(DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.md', '.txt'].includes(ext);
  });
  console.log('共 ' + files.length + ' 个文件\\n');
  let success = 0, fail = 0;
  for (const file of files) {
    process.stdout.write('[' + (success + fail + 1) + '/' + files.length + '] ' + file + ' ... ');
    const fp = path.join(DIR, file);
    const id = await processFile(fp);
    if (id) { console.log('OK ID=' + id); success++; }
    else { console.log('FAIL'); fail++; }
  }
  console.log('\\n完成: ' + success + ' 成功, ' + fail + ' 失败');
}
main();
