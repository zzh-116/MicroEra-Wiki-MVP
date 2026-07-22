import type { ArxivPaper } from "./types.js";

/** Convert an arXiv paper to Markdown for the wiki pipeline */
export function toMarkdown(paper: ArxivPaper): string {
  const authors = paper.authors.join(", ");
  const categories = paper.categories.join(", ");
  const year = paper.published ? new Date(paper.published).getFullYear() : "";

  const lines = [
    `# ${paper.title}`,
    "",
    `> **作者**: ${authors} | **年份**: ${year}`,
    `> **分类**: ${categories}`,
    "",
    `**arXiv ID**: [${paper.id}](${paper.absUrl})`,
    paper.doi ? `**DOI**: [${paper.doi}](https://doi.org/${paper.doi})` : "",
    paper.comment ? `**备注**: ${paper.comment}` : "",
    "",
    "## 摘要",
    "",
    paper.summary || "(暂无摘要)",
    "",
    "## 元数据",
    "",
    `- arXiv ID: ${paper.id}`,
    `- 标题: ${paper.title}`,
    `- 作者: ${authors}`,
    `- 主分类: ${paper.primaryCategory}`,
    `- 全部分类: ${categories}`,
    `- 发表时间: ${paper.published}`,
    `- 最后更新: ${paper.updated}`,
    `- PDF: ${paper.pdfUrl}`,
    paper.journalRef ? `- 期刊引用: ${paper.journalRef}` : "",
    paper.doi ? `- DOI: ${paper.doi}` : "",
  ];

  return lines.filter((l) => l !== null).join("\n");
}

/** Generate a one-line summary for display */
export function toSummary(paper: ArxivPaper): string {
  const authors = paper.authors.slice(0, 3).join(", ");
  const more = paper.authors.length > 3 ? ` et al.` : "";
  const year = paper.published
    ? new Date(paper.published).getFullYear()
    : "";
  return `${paper.title} — ${authors}${more} (${year})`;
}
