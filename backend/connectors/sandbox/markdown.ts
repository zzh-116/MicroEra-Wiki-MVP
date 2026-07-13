// Sandbox Markdown — converts Sandbox structured JSON to unified Markdown.
// Output format is consistent with Docling output so downstream chunking
// treats both sources identically.

import type { SandboxDetail, SandboxOperatorDetail, SandboxDotDetail, SandboxDatasetDetail } from './types.js';

// ---- Display Title Generation ----

/** Weak/generic names that should be overridden by description-based generation */
const GENERIC_NAMES = /^(dot\.\w+|\w+-\w+-\d+|post-\w+|test-\w+|untitled|未命名|新建|new\s+\w+)$/i;

/**
 * Generate a human-readable display title from Sandbox detail data.
 *
 * Priority:
 *   1. `name` — the primary business-meaningful field in Sandbox
 *   2. `originalName` — original uploaded filename (often descriptive)
 *   3. Auto-generated from `description` (first 20 chars, cleaned)
 *   4. ObjectId as final fallback
 */
export function getDisplayTitle(detail: SandboxDetail): string {
  // 1. Use `name` if it's non-empty and not generic
  if (detail.name && typeof detail.name === 'string' && detail.name.trim()) {
    const name = detail.name.trim();
    if (!GENERIC_NAMES.test(name)) {
      return name;
    }
  }

  // 2. Use `originalName` (uploaded filename stripped of extension)
  if ((detail as any).originalName && typeof (detail as any).originalName === 'string') {
    const orig = (detail as any).originalName.trim();
    const withoutExt = orig.replace(/\.[^.]+$/, '');
    if (withoutExt.length > 2) {
      return withoutExt;
    }
  }

  // 3. Generate from description — take first sentence or first ~30 chars
  if (detail.description && detail.description.trim()) {
    const desc = detail.description.trim();
    // Try to get the first sentence (ending with 。or ；or . or ；)
    const firstSentence = desc.match(/^(.+?)[。；.;]{1}/);
    if (firstSentence) {
      const s = firstSentence[1].trim();
      if (s.length >= 6 && s.length <= 60) return s;
    }
    // Fallback: first N chars
    const snippet = desc.slice(0, 30).replace(/\s+/g, ' ').trim();
    if (snippet.length >= 4) return snippet;
  }

  // 4. Fallback to ID
  return `Sandbox ${detail.id}`;
}

// ---- Markdown Conversion ----

function section(heading: string, content: string | undefined | null): string {
  if (!content || (typeof content === 'string' && !content.trim())) return '';
  return `## ${heading}\n\n${content}\n\n`;
}

function kvTable(rows: [string, string][]): string {
  if (rows.length === 0) return '';
  let md = '| Key | Value |\n|-----|-------|\n';
  for (const [k, v] of rows) {
    md += `| ${k} | ${v.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`;
  }
  return md + '\n';
}

function jsonBlock(label: string, obj: Record<string, unknown> | undefined | null): string {
  if (!obj || Object.keys(obj).length === 0) return '';
  return `### ${label}\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n\n`;
}

function tagsSection(tags: string[] | undefined | null): string {
  if (!tags || tags.length === 0) return '';
  return `## Tags\n\n${tags.map((t) => `- ${t}`).join('\n')}\n\n`;
}

function referencesSection(refs: string[] | undefined | null): string {
  if (!refs || refs.length === 0) return '';
  return `## References\n\n${refs.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n`;
}

function stepsSection(steps: { order: number; name: string; description?: string }[] | undefined | null): string {
  if (!steps || steps.length === 0) return '';
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  let md = '## Steps\n\n';
  for (const s of sorted) {
    md += `### Step ${s.order}: ${s.name}\n\n${s.description || ''}\n\n`;
  }
  return md;
}

/** Convert a Sandbox detail to unified Markdown */
export function toMarkdown(detail: SandboxDetail): string {
  const displayTitle = getDisplayTitle(detail);
  let md = `# ${displayTitle}\n\n`;

  // Description
  if (detail.description) {
    md += `${detail.description}\n\n`;
  }

  // Tags
  md += tagsSection(detail.tags);

  // Author / Project
  if (detail.author || detail.project) {
    const rows: [string, string][] = [];
    if (detail.author) rows.push(['Author', detail.author]);
    if (detail.project?.projectTitle) rows.push(['Project', detail.project.projectTitle]);
    if (detail.project?.projectId) rows.push(['Project ID', detail.project.projectId]);
    if (detail.updateTime) rows.push(['Updated', detail.updateTime]);
    md += '## Metadata\n\n';
    md += kvTable(rows);
  }

  // Environment (operators)
  if ('environment' in detail && detail.environment) {
    md += jsonBlock('Environment', detail.environment as Record<string, unknown>);
  }

  // Input / Output (operators & dots)
  if ('input' in detail && detail.input) {
    md += jsonBlock('Input Schema', detail.input as Record<string, unknown>);
  }
  if ('output' in detail && detail.output) {
    md += jsonBlock('Output Schema', detail.output as Record<string, unknown>);
  }

  // Steps (operators)
  if ('steps' in detail && detail.steps) {
    md += stepsSection((detail as SandboxOperatorDetail).steps);
  }

  // Property (operators)
  if ('property' in detail && detail.property) {
    md += jsonBlock('Properties', detail.property as Record<string, unknown>);
  }

  // References
  md += referencesSection(detail.references);

  // Data records (datasets)
  if ('datarecords' in detail && detail.datarecords) {
    md += `## Data Records\n\n${detail.datarecords.length} record(s)\n\n`;
    md += '```json\n' + JSON.stringify(detail.datarecords.slice(0, 20), null, 2) + '\n```\n\n';
  }

  // Source attribution — includes ObjectId for developers
  md += '\n---\n\n';
  md += `*Imported from Sandbox • ObjectId: \`${detail.id}\` • ${detail.updateTime || 'unknown date'}*\n`;

  return md;
}
