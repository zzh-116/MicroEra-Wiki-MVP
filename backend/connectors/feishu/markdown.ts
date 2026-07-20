export function documentToMarkdown(title: string, rawContent: string): string {
  return "# " + title + "\n\n" + rawContent;
}

export function tableToMarkdown(title: string, rows: string[][]): string {
  var lines = ["# " + title, ""];
  if (rows.length < 2) return lines.join("\n");
  var headers = rows[0];
  lines.push("| " + headers.join(" | ") + " |");
  lines.push("| " + headers.map(function() { return "---"; }).join(" | ") + " |");
  for (var i = 1; i < rows.length; i++) {
    lines.push("| " + rows[i].join(" | ") + " |");
  }
  return lines.join("\n");
}
