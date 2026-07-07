import fs from 'node:fs';
import path from 'node:path';
import { DocumentChunk, ParsedProperty } from '../types.js';
import { config } from '../config.js';

const DATA_DIR = path.resolve(config.dataDir, 'documents');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(id: string): string {
  ensureDir();
  return path.join(DATA_DIR, `${id}.json`);
}

export class DocumentStore {
  save(entryId: number, properties: ParsedProperty[]): DocumentChunk[] {
    ensureDir();
    const chunks: DocumentChunk[] = properties.map((p) => ({
      id: `${entryId}_${p.code}`,
      entryId,
      text: this.buildSearchText(p),
      metadata: {
        code: p.code,
        section: p.section,
        category: p.category,
        nameZh: p.nameZh,
        nameEn: p.nameEn,
        symbol: p.symbol,
        definition: p.definition,
        preferredUnit: p.preferredUnit,
        methods: p.methods,
      },
    }));

    // Save all chunks for this entry in one JSON file
    fs.writeFileSync(filePath(`entry_${entryId}`), JSON.stringify(chunks, null, 2), 'utf-8');
    return chunks;
  }

  load(entryId: number): DocumentChunk[] {
    const fp = filePath(`entry_${entryId}`);
    if (!fs.existsSync(fp)) return [];
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  }

  loadAll(): DocumentChunk[] {
    ensureDir();
    const chunks: DocumentChunk[] = [];
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.endsWith('.json')) {
        chunks.push(...JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')));
      }
    }
    return chunks;
  }

  private buildSearchText(p: ParsedProperty): string {
    return [
      `[${p.code}] ${p.nameZh}`,
      p.nameEn,
      `符号: ${p.symbol}`,
      `定义: ${p.definition}`,
      `单位: ${p.preferredUnit}`,
      p.alternativeUnits ? `其他单位: ${p.alternativeUnits}` : '',
      p.valueRange ? `值域: ${p.valueRange}` : '',
      p.methods ? `方法: ${p.methods}` : '',
      p.notes ? `备注: ${p.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

export const documentStore = new DocumentStore();
