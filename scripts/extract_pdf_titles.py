import json
import os
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
ZAOZHI = ROOT / "backend" / "data" / "zaozhi"
EXPORT = ROOT / "backend" / "data" / "metadata" / "entries_export.json"
OUT = ROOT / "scripts" / "pdf_titles.json"


def norm_key(value: str) -> str:
    value = value.replace("\u2010", "-").replace("\u2011", "-").replace("\u2012", "-")
    value = value.replace("\u2013", "-").replace("\u2014", "-").replace("\u2015", "-")
    return re.sub(r"\s+", " ", value.strip().lower())


def load_files():
    by_stem = {}
    for path in ZAOZHI.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".pdf":
            continue
        by_stem.setdefault(norm_key(path.stem), []).append(path)
    return by_stem


BAD_PREFIXES = (
    "review",
    "original paper",
    "open access",
    "contents lists available at sciencedirect",
    "article history",
    "received",
    "accepted",
    "published",
    "available online",
    "copyright",
    "this article is",
    "please cite",
    "doi:",
    "https://",
    "http://",
    "page ",
    "correspondence",
    "citation:",
    "academic editors",
    "keywords:",
    "abstract",
    "introduction",
    "highlights",
    "graphical abstract",
    "novelty",
    "industrial relevance",
    "peer-reviewed article",
    "research article",
    "original article",
    "mini-review",
    "full length article",
    "short communication",
    "case report",
    "journal of",
    "elsevier",
    "wiley",
    "springer",
    "mdpi",
    "iop conf",
    "issn",
    "e-mail",
    "tel.",
    "bioresources.cnr.ncsu.edu",
    "sciencedirect",
    "© the author",
    "creative commons",
    "volume",
    "issue",
    "pp.",
    "federation of",
    "translated from",
    "英文原刊信息",
)


def is_bad(line: str) -> bool:
    t = line.strip()
    if not t or len(t) < 8:
        return True
    if len(t) > 260:
        return True
    lower = t.lower()
    if any(lower.startswith(p) for p in BAD_PREFIXES):
        return True
    if "|" in t:
        return True
    if re.fullmatch(r"[\d\s.,:;()\-–—/\\]+", t):
        return True
    if re.match(r"^\d+\s+of\s+\d+", lower):
        return True
    if "https://" in lower or "http://" in lower:
        return True
    if "doi" in lower and len(t.split()) <= 4:
        return True
    if t == t.upper() and len(t) < 70:
        return True
    if t == t.upper() and len(t.split()) > 8:
        return True
    if "©" in t and len(t.split()) <= 8:
        return True
    return False


def extract_title(path: Path) -> str | None:
    try:
        reader = PdfReader(str(path))
        meta = getattr(reader, "metadata", None)
        if meta is not None:
            meta_title = (getattr(meta, "title", None) or "").strip()
            if is_good_meta_title(meta_title):
                return meta_title
        pages = []
        for idx in range(min(3, len(reader.pages))):
            try:
                pages.append(reader.pages[idx].extract_text() or "")
            except Exception:
                pass
    except Exception:
        return None

    text = "\n".join(pages)
    lines = [re.sub(r"\s+", " ", l).strip() for l in text.splitlines()]
    candidates = []
    for line in lines:
        if is_bad(line):
            continue
        # Prefer lines that look like a real title: mixed case, contains lowercase.
        if not any(c.islower() for c in line):
            continue
        words = line.split()
        if not (3 <= len(words) <= 40):
            continue
        candidates.append(line)
        if len(candidates) >= 5:
            break
    if not candidates:
        return None

    # Heuristic: the first candidate that is not a generic section header wins.
    generic = (
        "experimental",
        "methods",
        "results",
        "discussion",
        "conclusion",
        "materials and methods",
        "data availability",
        "author contributions",
        "conflict of interest",
        "funding",
        "acknowledg",
    )
    for c in candidates:
        if c.lower() in generic or any(c.lower().startswith(g) for g in generic):
            continue
        return c
    return candidates[0]


def is_good_meta_title(title: str) -> bool:
    if not title or len(title) < 8 or len(title) > 260:
        return False
    lower = title.lower()
    bad = (
        "microsoft word",
        "attachment",
        "untitled",
        "scan",
        "image",
        "open access proceedings",
        "journal of physics: conference series",
        "论文标题清单",
    )
    if any(b in lower for b in bad):
        return False
    if re.fullmatch(r"[\d\s.,:;()\-–—/\\]+", title):
        return False
    if title.startswith(("1-s2.0-", "CN", "US", "EP", "PCT")):
        return False
    return True


def main():
    export = json.loads(EXPORT.read_text(encoding="utf-8"))
    files_by_stem = load_files()

    groups = {}
    for entry in export["entries"]:
        title = (entry.get("title") or "").strip()
        if not title:
            continue
        if "/" not in title and not re.search(
            r"^(1-s2\.0-|CN\d|US\d|EP\d|PCT|savedrecs|Year，|wos_|main\d?$|2025-|2025_|2026_|Noor_|bbae|csir|f212|fenrg|fermentation|foaf|foods|ijms|jcs|jingxing|lactic|maximizing|paper_retrieval|polymers|s10570|s10668|s12649|s13068|s13762|s40643|s41598|s42452|s44320|sustainability|sustainable|technoeconomics|technologies|Energy Science|Engineering Lignin|Green synthesis|BC$)",
            title,
            re.IGNORECASE,
        ):
            continue
        if re.match(r"^(CN\d|US\d|EP\d|PCT)", title, re.IGNORECASE):
            continue
        key = norm_key(title)
        matches = files_by_stem.get(key, [])
        if not matches:
            # Try matching against the full file name too (some stems differ slightly).
            for stem, paths in files_by_stem.items():
                if key in stem or stem in key:
                    matches = paths
                    break
        if matches:
            groups.setdefault(key, {"exportTitle": title, "paths": matches})

    result = {}
    for key, group in groups.items():
        extracted = None
        for path in group["paths"]:
            extracted = extract_title(path)
            if extracted:
                break
        result[group["exportTitle"]] = extracted

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    found = sum(1 for v in result.values() if v)
    print(f"groups={len(result)} extracted={found} -> {OUT}")
    for export_title, title in result.items():
        print(f"{export_title} => {title}")


if __name__ == "__main__":
    main()
