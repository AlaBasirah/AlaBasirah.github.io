#!/usr/bin/env python3
"""
يبني ملفات JSON لكتب مختارة من نصوص مشروع OpenITI (نصوص رقمية نظيفة مأخوذة من المكتبة الشاملة).
يقرأ علامات الصفحات PageV01P012 فيحفظ رقم الجزء والصفحة المطبوعة.

    python tools/build_openiti.py AUTHOR_DIR selection.tsv "ابن تيمية" PREFIX OUT_DIR
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ingest  # noqa: E402

PAGE = re.compile(r"PageV(\d+)P(\d+)")
TAGS = [
    (re.compile(r"ms\d+"), " "),
    (re.compile(r"~~"), " "),
    (re.compile(r"^#+\s*\|*\s*", re.M), ""),
    (re.compile(r"@[A-Z0-9_]+\b"), ""),
    (re.compile(r"%~%"), " "),
    (re.compile(r"\|+"), " "),
]


def norm(s: str) -> str:
    return ingest.AR_LETTER.sub(lambda m: m.group(0), unicodedata.normalize("NFKC", s)).replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")


def meta_title(path: Path) -> str:
    with path.open(encoding="utf-8", errors="ignore") as f:
        for _ in range(200):
            line = f.readline()
            if not line:
                break
            m = re.search(r"#META#\s*\d*\.?\s*(?:TitleA|Title|BookTITLE|الكتاب)\s*::\s*(.+)", line)
            if m:
                return m.group(1).strip()
            if "#META#Header#End#" in line:
                break
    return ""


def text_files(author_dir: Path):
    for p in author_dir.rglob("*"):
        if p.is_file() and not p.suffix in (".yml", ".md") and "-ara" in p.name:
            yield p


def main():
    author_dir, sel_file, author, prefix, out_dir = sys.argv[1:6]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files = [(p, meta_title(p)) for p in text_files(Path(author_dir))]
    (out / f"{prefix}-listing.txt").write_text(
        "\n".join(f"{p.relative_to(author_dir)}\t{t}\t{p.stat().st_size}" for p, t in sorted(files)), encoding="utf-8")

    report = []
    for line in Path(sel_file).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = (line.split("\t") + ["", ""])[:3]
        key, shown, vols = parts[0].strip(), parts[1].strip(), parts[2].strip()
        want = {int(v) for v in vols.split(",") if v.strip().isdigit()}
        cands = [(p, t) for p, t in files if norm(key) in norm(t)]
        if not cands:
            report.append({"key": key, "status": "not found"})
            continue
        # أطول نسخة غالبًا هي الكاملة
        p, t = max(cands, key=lambda x: x[0].stat().st_size)
        raw = p.read_text(encoding="utf-8", errors="ignore")
        raw = raw.split("#META#Header#End#", 1)[-1]
        for rx, rep in TAGS:
            raw = rx.sub(rep, raw)
        pieces = PAGE.split(raw)
        by_vol: dict[int, list] = {}
        # pieces = [text, vol, page, text, vol, page, ...]: النص قبل العلامة ينتمي إلى صفحتها
        for i in range(0, len(pieces) - 2, 3):
            text, vol, page = pieces[i], int(pieces[i + 1]), int(pieces[i + 2])
            if want and vol not in want:
                continue
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) < 40:
                continue
            by_vol.setdefault(vol, []).extend({"p": page, "c": c} for c in ingest.chunk(text))
        multi = len({int(pieces[i + 1]) for i in range(0, len(pieces) - 2, 3)}) > 1
        for vol, chunks in sorted(by_vol.items()):
            name = f"{prefix}-{len(report):02d}-v{vol:02d}.json"
            (out / name).write_text(json.dumps({
                "title": shown or t, "author": author, "volume": str(vol) if multi else None,
                "source": str(p.name), "chunks": chunks}, ensure_ascii=False), encoding="utf-8")
            report.append({"key": key, "file": name, "matched": t, "source": p.name, "volume": vol, "chunks": len(chunks)})
        if not by_vol:
            report.append({"key": key, "status": "no pages", "matched": t})
    (out / f"{prefix}-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
