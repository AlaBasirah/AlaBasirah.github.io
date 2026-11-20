#!/usr/bin/env python3
"""
يبني ملف JSON لكتاب واحد: يستخرج النص من PDF صفحة صفحة، ويصحح النص المقلوب،
وما بقي تالفًا من الصفحات يُعاد قراءته بالتعرف الضوئي العربي (tesseract).
يُستخدم داخل GitHub Actions (انظر .github/workflows/ingest.yml).

    python tools/build_book.py FILE.pdf "اسم الملف الأصلي.pdf" "المؤلف" out.json
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ingest  # noqa: E402


def ocr_page(pdf: str, page: int) -> str:
    with tempfile.TemporaryDirectory() as d:
        base = f"{d}/p"
        subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "220", "-gray", "-png", pdf, base],
                       check=False, capture_output=True)
        imgs = sorted(Path(d).glob("p*.png"))
        if not imgs:
            return ""
        r = subprocess.run(["tesseract", str(imgs[0]), "-", "-l", "ara", "--psm", "6"],
                           check=False, capture_output=True)
        return r.stdout.decode("utf-8", "ignore")


def main():
    pdf, original_name, author, out = sys.argv[1:5]
    title, vol = ingest.parse_name(Path(original_name))
    n_pages = int(next((l.split()[-1] for l in subprocess.run(["pdfinfo", pdf], capture_output=True)
                         .stdout.decode().splitlines() if l.startswith("Pages:")), "0"))
    texts = {p: t for p, t in ingest.pages_from_pdf(Path(pdf))}

    chunks, stats = [], {"pages": n_pages, "text_ok": 0, "ocr_ok": 0, "bad": 0}
    for page in range(1, n_pages + 1):
        t = ingest.fix_page(texts.get(page, ""))
        if ingest.page_ok(t):
            stats["text_ok"] += 1
        else:
            t = ingest.fix_page(ocr_page(pdf, page))
            if ingest.page_ok(t):
                stats["ocr_ok"] += 1
            else:
                stats["bad"] += 1
                continue
        chunks += [{"p": page, "c": c} for c in ingest.chunk(t)]

    Path(out).write_text(json.dumps({"title": title, "author": author, "volume": vol,
                                     "stats": stats, "chunks": chunks}, ensure_ascii=False))
    print(json.dumps({"file": original_name, "title": title, "volume": vol, **stats, "chunks": len(chunks)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
