import { ParsedProperty } from '../types.js';

/**
 * Parse the materials property metadata Markdown document.
 * Handles the specific structure of 材料性质数据元信息.md:
 * - ## sections for each property group
 * - Markdown tables with 10 columns
 * - Property codes: C## (computational), E## (experimental), X## (cross), P## (condition)
 */
export class MarkdownParser {
  parse(markdown: string): ParsedProperty[] {
    const properties: ParsedProperty[] = [];
    const lines = markdown.split('\n');

    let currentSection = '';
    let currentSectionCategory: ParsedProperty['category'] = 'computational';
    let inTable = false;
    let tableRows: string[] = [];

    for (const line of lines) {
      // Track section headers
      const sectionMatch = line.match(/^###?\s+(.+)$/);
      if (sectionMatch && !line.includes('|')) {
        currentSection = sectionMatch[1].trim();
        // Remove leading numbers like "1.1 " or "2.2.1 "
        currentSection = currentSection.replace(/^[\d.]+\s*/, '');

        // Determine category from section number
        if (line.includes('## 1.')) currentSectionCategory = 'computational';
        else if (line.includes('## 2.')) currentSectionCategory = 'experimental';
        else if (line.includes('## 3.')) currentSectionCategory = 'cross';
        else if (line.includes('## 4.')) currentSectionCategory = 'condition';
        continue;
      }

      // Table detection
      if (line.startsWith('|') && line.includes('|') && !line.startsWith('|---')) {
        // Skip header row and alignment row
        if (line.includes('中文名称') || line.includes('---')) continue;

        tableRows.push(line);
        inTable = true;
        continue;
      }

      // Table ended
      if (inTable && !line.startsWith('|')) {
        for (const row of tableRows) {
          const cells = this.parseTableRow(row);
          if (cells.length >= 8) {
            const code = cells[0].trim();
            // Only parse rows with valid property codes
            if (/^[CEXP]\d+$/.test(code)) {
              properties.push({
                code,
                section: currentSection,
                category: this.inferCategory(code, currentSectionCategory),
                nameZh: cells[1]?.trim() || '',
                nameEn: cells[2]?.trim() || '',
                symbol: cells[3]?.trim() || '',
                definition: cells[4]?.trim() || '',
                preferredUnit: cells[5]?.trim() || '',
                alternativeUnits: cells[6]?.trim() || '',
                valueRange: cells[7]?.trim() || '',
                methods: cells[8]?.trim() || '',
                notes: cells[9]?.trim() || '',
              });
            }
          }
        }
        tableRows = [];
        inTable = false;
      }
    }

    // Handle last table if file ends with one
    if (tableRows.length > 0) {
      for (const row of tableRows) {
        const cells = this.parseTableRow(row);
        if (cells.length >= 8 && /^[CEXP]\d+$/.test(cells[0].trim())) {
          properties.push({
            code: cells[0].trim(),
            section: currentSection,
            category: this.inferCategory(cells[0].trim(), currentSectionCategory),
            nameZh: cells[1]?.trim() || '',
            nameEn: cells[2]?.trim() || '',
            symbol: cells[3]?.trim() || '',
            definition: cells[4]?.trim() || '',
            preferredUnit: cells[5]?.trim() || '',
            alternativeUnits: cells[6]?.trim() || '',
            valueRange: cells[7]?.trim() || '',
            methods: cells[8]?.trim() || '',
            notes: cells[9]?.trim() || '',
          });
        }
      }
    }

    return properties;
  }

  private parseTableRow(row: string): string[] {
    // Split by | and trim, remove leading/trailing empty strings
    return row
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1); // Remove first and last empty splits
  }

  private inferCategory(
    code: string,
    sectionCategory: ParsedProperty['category']
  ): ParsedProperty['category'] {
    if (code.startsWith('C')) return 'computational';
    if (code.startsWith('E')) return 'experimental';
    if (code.startsWith('X')) return 'cross';
    if (code.startsWith('P')) return 'condition';
    return sectionCategory;
  }

  /**
   * Build a display-friendly title for a parsed property.
   * Format: "[C01] 可及表面积 (质量) — Accessible Surface Area"
   */
  buildTitle(p: ParsedProperty): string {
    return `[${p.code}] ${p.nameZh} — ${p.nameEn}`;
  }

  /**
   * Build a compact search text for embedding.
   */
  buildEmbeddingText(p: ParsedProperty): string {
    return [
      p.nameZh,
      p.nameEn,
      p.symbol,
      p.definition,
      `单位:${p.preferredUnit}`,
      p.methods ? `方法:${p.methods}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
}

export const markdownParser = new MarkdownParser();
