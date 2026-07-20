import type { CrossRefWork } from "./types.js";

export function toMarkdown(work: CrossRefWork): string {
  var lines = [
    "# " + work.title,
    "",
    "> **作者**: " + work.author + " | **期刊**: " + work.journal + " | **年份**: " + work.publishedYear,
    "",
    "**DOI**: " + work.DOI,
    "",
    "## 摘要",
    "",
    work.abstract || "(暂无摘要)",
    "",
    "## 元数据",
    "",
    "- DOI: " + work.DOI,
    "- 标题: " + work.title,
    "- 作者: " + work.author,
    "- 期刊: " + work.journal,
    "- 发表年份: " + work.publishedYear,
    "- URL: " + work.url,
  ];
  return lines.join("\n");
}

export function toSummary(work: CrossRefWork): string {
  return work.title + " - " + work.author + " (" + work.publishedYear + ")";
}
