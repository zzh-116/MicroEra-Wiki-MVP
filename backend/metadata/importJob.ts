import fs from 'node:fs';
import { markdownParser } from '../parser/markdown.js';
import { metadataStore } from './store.js';
import { documentStore } from '../document/store.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import { milvusClient } from '../vector/milvus.js';
import { memoryVectorStore } from '../vector/memory.js';
import { ParsedProperty } from '../types.js';

export class ImportJob {
  /**
   * Full import pipeline:
   * Markdown → Parser → Metadata + Document + Embedding → Vector
   */
  async importFromFile(filePath: string): Promise<{ entryIds: number[]; propertyCount: number }> {
    console.log(`[ImportJob] Starting import: ${filePath}`);

    // Step 1: Parse
    const markdown = fs.readFileSync(filePath, 'utf-8');
    const properties = markdownParser.parse(markdown);
    console.log(`[ImportJob] Parsed ${properties.length} properties`);

    // Group properties by section for entry creation
    const groups = this.groupBySection(properties);

    const entryIds: number[] = [];

    for (const [section, props] of groups) {
      // Step 2: Create metadata entries
      const firstProp = props[0];
      const title = `[${firstProp.category}] ${section}`;
      const summary = `${props.length} 个属性定义，涵盖 ${props.map((p) => p.nameZh).slice(0, 5).join('、')}等`;
      const content = this.buildEntryContent(props);

      const entry = metadataStore.createEntry({
        title,
        entry_type: 'data_item',
        summary,
        content,
        visibility: 'internal',
        tags: this.extractTags(props),
        category_id: 5, // 数据条目
      });
      entryIds.push(entry.id);

      // Step 3: Save document chunks
      const chunks = documentStore.save(entry.id, props);
      console.log(`[ImportJob] Entry #${entry.id} "${title}" — ${chunks.length} chunks`);

      // Step 4: Generate embeddings
      try {
        const texts = props.map((p) => markdownParser.buildEmbeddingText(p));
        const vectors = await ollamaEmbedder.embedBatch(texts);

        // Step 5: Insert into vector store (Milvus or memory)
        const records = props.map((p, i) => ({
          entry_id: entry.id,
          embedding: vectors[i] || [],
        }));
        const store = milvusClient.isReady() ? milvusClient : memoryVectorStore;
        await store.insert(records);
        console.log(`[ImportJob] Embedded ${vectors.length} vectors for entry #${entry.id}`);
      } catch (err: any) {
        console.warn(`[ImportJob] Embedding/vector step skipped for entry #${entry.id}: ${err.message}`);
        // Continue without vectors — AI search will fall back to keyword
      }
    }

    console.log(`[ImportJob] Import complete: ${entryIds.length} entries, ${properties.length} properties`);
    return { entryIds, propertyCount: properties.length };
  }

  /**
   * Import from raw markdown string (API-triggered)
   */
  async importFromString(markdown: string, sourceName = 'api_import'): Promise<{ entryIds: number[]; propertyCount: number }> {
    // Save to temp file then import
    const tmpPath = `./backend/data/tmp_${sourceName}_${Date.now()}.md`;
    fs.mkdirSync('./backend/data', { recursive: true });
    fs.writeFileSync(tmpPath, markdown, 'utf-8');
    const result = await this.importFromFile(tmpPath);
    fs.unlinkSync(tmpPath);
    return result;
  }

  private groupBySection(properties: ParsedProperty[]): Map<string, ParsedProperty[]> {
    const map = new Map<string, ParsedProperty[]>();
    for (const p of properties) {
      const key = `${p.category}:${p.section}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }

  private extractTags(properties: ParsedProperty[]): string[] {
    const tags = new Set<string>(['材料性质', '元数据']);
    for (const p of properties) {
      if (p.category === 'computational') tags.add('DFT');
      if (p.category === 'experimental') tags.add('实验数据');
      if (p.methods.includes('吸附')) tags.add('吸附分离');
      if (p.methods.includes('传感') || p.section.includes('传感')) tags.add('传感');
      if (p.methods.includes('催化') || p.section.includes('催化')) tags.add('催化');
      if (p.nameZh.includes('MOF') || p.nameEn.includes('MOF')) tags.add('MOF');
    }
    return [...tags].slice(0, 10);
  }

  private buildEntryContent(properties: ParsedProperty[]): string {
    let md = `| # | 中文名称 | 英文名称 | 符号 | 首选单位 | 方法 | 备注 |\n`;
    md += `|---|---------|---------|------|---------|------|------|\n`;
    for (const p of properties) {
      md += `| ${p.code} | ${p.nameZh} | ${p.nameEn} | ${p.symbol} | ${p.preferredUnit} | ${p.methods || '—'} | ${p.notes || '—'} |\n`;
    }
    return md;
  }
}

export const importJob = new ImportJob();
