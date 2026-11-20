#!/usr/bin/env python3
"""
أداة إدخال الكتب إلى قاعدة معرفة «بصيرة».

تقرأ ملفات PDF أو نصوص (txt / md / نصوص OpenITI)، وتصحح النص العربي المقلوب
(مشكلة شائعة في ملفات PDF القديمة)، وتستبعد الصفحات التالفة، ثم تقسم النص إلى
مقاطع مع رقم الصفحة وترفعها إلى Supabase.

الاستعمال:
    pip install pypdf          # مطلوب لملفات PDF فقط
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="..."      # المفتاح السري — لا تضعه في الموقع أبدًا
    python tools/ingest.py --author "ابن القيم" "sources/ابن القيم"
    python tools/ingest.py --author "ابن تيمية" "sources/ابن تيمية" --replace

خيارات:
    --dry-run     افحص الجودة واطبع التقرير دون رفع شيء
    --replace     احذف مقاطع الكتاب القديمة قبل رفع الجديدة
    --min-quality نسبة الصفحات السليمة الدنيا لقبول الكتاب (الافتراضي 0.6)

يُستخرج اسم الكتاب ورقم الجزء من اسم الملف، مثل:
    «٣٠- زاد المعاد ج٣.pdf»  ←  الكتاب: زاد المعاد، الجزء: 3
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
AR_LETTER = re.compile(r"[ء-ي]")
CHUNK_MIN, CHUNK_TARGET, CHUNK_MAX = 120, 1100, 1600


# ----------------------------------------------------------------- الأسماء
def parse_name(path: Path):
    stem = path.stem.translate(AR_DIGITS).strip()
    stem = re.sub(r"^\s*\d+\s*[-_.)]\s*", "", stem)          # ترقيم في أول الاسم
    vol = None
    m = re.search(r"\s*(?:ج|الجزء|جزء|vol\.?|v)\s*(\d+)\s*$", stem, re.I)
    if m:
        vol = str(int(m.group(1)))
        stem = stem[: m.start()]
    title = re.sub(r"\s*\((?:المتن)\)\s*$", " - المتن", stem).strip(" -_")
    return title, vol


# ----------------------------------------------------------------- القراءة
def pages_from_pdf(path: Path):
    """يفضّل pdftotext -raw لأنه يحفظ ترتيب الكلمات العربية ومسافاتها؛ وإلا يستخدم pypdf."""
    import shutil
    import subprocess
    if shutil.which("pdftotext"):
        out = subprocess.run(["pdftotext", "-raw", "-enc", "UTF-8", str(path), "-"],
                             capture_output=True, check=False).stdout.decode("utf-8", "ignore")
        for i, page in enumerate(out.split("\f"), start=1):
            lines = [l.strip() for l in page.splitlines() if l.strip()]
            # كثير من ملفات الكتب يخرج فيها سطر لكل كلمة: نعيد ضمّها بمسافات
            if lines and sum(len(l.split()) <= 2 for l in lines) / len(lines) > 0.6:
                text = " ".join(lines)
            else:
                text = "\n".join(lines)
            if text.strip():
                yield i, text
        return
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("ثبّت المكتبة أولًا:  pip install pypdf")
    reader = PdfReader(str(path))
    for i, page in enumerate(reader.pages, start=1):
        try:
            yield i, page.extract_text() or ""
        except Exception:
            yield i, ""


OPENITI_PAGE = re.compile(r"PageV(\d+)P(\d+)")
BRACKET_PAGE = re.compile(r"^\s*[\[(]\s*(?:ص|صفحة|ص\.)\s*:?\s*(\d+)\s*[\])]\s*$", re.M)


def pages_from_text(path: Path):
    raw = path.read_text(encoding="utf-8", errors="ignore").translate(AR_DIGITS)
    raw = "\n".join(l for l in raw.splitlines() if not l.startswith(("#META#", "######OpenITI")))
    if OPENITI_PAGE.search(raw):                                   # نصوص OpenITI: العلامة في نهاية الصفحة
        parts = OPENITI_PAGE.split(raw)
        # parts = [text, vol, page, text, vol, page, ...]
        for i in range(0, len(parts) - 2, 3):
            yield int(parts[i + 2]), parts[i].replace("~~", " ").replace("# ", "")
        return
    if BRACKET_PAGE.search(raw):                                   # علامات [ص 12] في بداية الصفحة
        parts = BRACKET_PAGE.split(raw)
        if parts[0].strip():
            yield None, parts[0]
        for i in range(1, len(parts) - 1, 2):
            yield int(parts[i]), parts[i + 1]
        return
    if "\f" in raw:
        for i, p in enumerate(raw.split("\f"), start=1):
            yield i, p
        return
    yield None, raw


# ----------------------------------------------------------------- التصحيح
def looks_reversed(text: str) -> bool:
    words = re.findall(r"[ء-ي]{3,}", text)
    if len(words) < 8:
        return False
    starts = sum(w.startswith("ال") for w in words)
    ends = sum(w.endswith("لا") for w in words)
    return ends > max(4, starts * 1.5)


def fix_page(text: str) -> str:
    text = text.translate(AR_DIGITS)
    text = re.sub(r"[‎‏‪-‮]", "", text)
    if looks_reversed(text):
        text = "\n".join(line[::-1] for line in text.splitlines())
    text = re.sub(r"-\n(?=\S)", "", text)                         # كلمات مقطوعة بين السطرين
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def page_ok(text: str) -> bool:
    letters = len(AR_LETTER.findall(text))
    visible = len(re.sub(r"\s", "", text))
    if visible < 60 or letters / max(visible, 1) < 0.6:
        return False
    words = re.findall(r"[ء-ي]+", text)
    if not words:
        return False
    avg = sum(map(len, words)) / len(words)
    single = sum(len(w) == 1 for w in words) / len(words)
    return 2.5 <= avg <= 8 and single < 0.25                    # يستبعد مخرجات التعرف الضوئي المهشمة


def chunk(text: str):
    paras = [p.strip() for p in re.split(r"\n\s*\n|(?<=[.!؟:])\n", text) if p.strip()]
    buf = ""
    for p in paras:
        p = p.replace("\n", " ")
        while len(p) > CHUNK_MAX:                                  # فقرة طويلة جدًا: اقطعها عند نهاية جملة
            cut = max(p.rfind(".", 0, CHUNK_TARGET), p.rfind("،", 0, CHUNK_TARGET), p.rfind(" ", 0, CHUNK_TARGET))
            cut = cut if cut > CHUNK_MIN else CHUNK_TARGET
            if buf:
                yield buf; buf = ""
            yield p[: cut + 1].strip()
            p = p[cut + 1:].strip()
        if len(buf) + len(p) + 1 > CHUNK_TARGET and len(buf) >= CHUNK_MIN:
            yield buf
            buf = p
        else:
            buf = f"{buf} {p}".strip()
    if len(buf) >= CHUNK_MIN // 2:
        yield buf


# ----------------------------------------------------------------- الرفع
class Supa:
    def __init__(self, url, key):
        self.url, self.key = url.rstrip("/"), key

    def req(self, method, path, body=None, prefer=None):
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        r = urllib.request.Request(f"{self.url}/rest/v1/{path}", data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(r, timeout=120) as resp:
                txt = resp.read().decode()
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            sys.exit(f"خطأ من الخادم {e.code}: {e.read().decode()[:400]}")

    def book_id(self, title, author, volume):
        rows = self.req("POST", "books?on_conflict=title,author,volume",
                        [{"title": title, "author": author, "volume": volume}],
                        prefer="resolution=merge-duplicates,return=representation")
        if rows:
            return rows[0]["id"]
        q = f"books?select=id&title=eq.{urllib.parse.quote(title)}&author=eq.{urllib.parse.quote(author)}"
        q += f"&volume=eq.{urllib.parse.quote(volume)}" if volume else "&volume=is.null"
        return self.req("GET", q)[0]["id"]


def main():
    ap = argparse.ArgumentParser(description="إدخال الكتب إلى قاعدة معرفة بصيرة")
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--author", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--replace", action="store_true")
    ap.add_argument("--min-quality", type=float, default=0.6)
    a = ap.parse_args()

    files = []
    for p in map(Path, a.paths):
        files += sorted(x for x in (p.rglob("*") if p.is_dir() else [p]) if x.suffix.lower() in (".pdf", ".txt", ".md") or not x.suffix and x.is_file())
    if not files:
        sys.exit("لم أجد ملفات PDF أو نصوص.")

    supa = None
    if not a.dry_run:
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            sys.exit("اضبط SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY أولًا.")
        supa = Supa(url, key)

    report = []
    for f in files:
        title, vol = parse_name(f)
        reader = pages_from_pdf(f) if f.suffix.lower() == ".pdf" else pages_from_text(f)
        total = good = reversed_pages = 0
        rows = []
        for page, raw in reader:
            total += 1
            if looks_reversed(raw):
                reversed_pages += 1
            text = fix_page(raw)
            if not page_ok(text):
                continue
            good += 1
            rows += [{"page": page, "content": c} for c in chunk(text)]
        quality = good / max(total, 1)
        status = "مقبول" if quality >= a.min_quality and rows else "مرفوض (جودة النص ضعيفة)"
        report.append((f.name, title, vol, total, good, reversed_pages, len(rows), status))
        print(f"• {title}{' ج' + vol if vol else ''}: صفحات {total}، سليمة {good} ({quality:.0%})، مقلوبة صُححت {reversed_pages}، مقاطع {len(rows)} → {status}")

        if supa and status == "مقبول":
            bid = supa.book_id(title, a.author, vol)
            if a.replace:
                supa.req("DELETE", f"chunks?book_id=eq.{bid}")
            for i in range(0, len(rows), 400):
                supa.req("POST", "chunks", [{**r, "book_id": bid} for r in rows[i:i + 400]], prefer="return=minimal")
            print(f"  ↑ رُفع إلى قاعدة المعرفة (book_id={bid})")

    rejected = [r for r in report if r[-1] != "مقبول"]
    print(f"\nالخلاصة: {len(report) - len(rejected)} مقبول، {len(rejected)} مرفوض.")
    if rejected:
        print("الكتب المرفوضة نصها المستخرج تالف (صور ممسوحة أو تعرف ضوئي رديء). استبدلها بنسخة نصية من الكتاب نفسه:")
        for r in rejected:
            print("  -", r[0])


if __name__ == "__main__":
    main()
