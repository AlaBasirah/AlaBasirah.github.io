// تطبيق إعدادات المدير على الصفحة: الألوان، الخطوط، الشعار، النصوص، والمزايا
import { DEFAULT_SITE, merge } from "./defaults.js";

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs>
<linearGradient id="gStar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{p1}"/><stop offset=".55" stop-color="{p2}"/><stop offset="1" stop-color="{p3}"/></linearGradient>
<linearGradient id="gSun" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{s3}"/><stop offset="1" stop-color="{s2}"/></linearGradient>
<linearGradient id="gPage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFEFD6"/></linearGradient>
</defs>
<polygon points="100.0,8.0 126.9,34.9 165.1,34.9 165.1,73.1 192.0,100.0 165.1,126.9 165.1,165.1 126.9,165.1 100.0,192.0 73.1,165.1 34.9,165.1 34.9,126.9 8.0,100.0 34.9,73.1 34.9,34.9 73.1,34.9" fill="url(#gStar)" stroke="{s1}" stroke-width="4" stroke-linejoin="round"/>
<polygon points="126.8,35.3 137.9,62.1 164.7,73.2 153.6,100.0 164.7,126.8 137.9,137.9 126.8,164.7 100.0,153.6 73.2,164.7 62.1,137.9 35.3,126.8 46.4,100.0 35.3,73.2 62.1,62.1 73.2,35.3 100.0,46.4" fill="none" stroke="{s2}" stroke-width="3" stroke-linejoin="round" opacity=".9"/>
<circle cx="100" cy="98" r="22" fill="url(#gSun)"/>
<g stroke="{s2}" stroke-width="4" stroke-linecap="round"><line x1="100" y1="60" x2="100" y2="68"/><line x1="73" y1="72" x2="79" y2="78"/><line x1="127" y1="72" x2="121" y2="78"/><line x1="62" y1="98" x2="70" y2="98"/><line x1="138" y1="98" x2="130" y2="98"/></g>
<path d="M100 112 C86 103 68 102 54 106 L54 142 C68 138 86 139 100 148 Z" fill="url(#gPage)"/>
<path d="M100 112 C114 103 132 102 146 106 L146 142 C132 138 114 139 100 148 Z" fill="url(#gPage)"/>
<path d="M100 112 L100 148" stroke="{p3}" stroke-width="2.5" stroke-linecap="round"/>
<path d="M64 116 C74 114 84 115 92 119 M64 125 C74 123 84 124 92 128 M108 119 C116 115 126 114 136 116 M108 128 C116 124 126 123 136 125" stroke="{p2}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".55"/>
</svg>`;

/** الشعار الافتراضي مُلوَّنًا بألوان الموقع الحالية */
export function markDataUrl(c) {
  const svg = MARK.replace(/\{p1\}/g, c.primary1).replace(/\{p2\}/g, c.primary2).replace(/\{p3\}/g, c.primary3)
    .replace(/\{s1\}/g, c.sun1).replace(/\{s2\}/g, c.sun2).replace(/\{s3\}/g, c.sun3);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const VAR_MAP = {
  primary1: "--teal-400", primary2: "--teal-600", primary3: "--teal-800",
  sun1: "--gold-300", sun2: "--gold-400", sun3: "--coral-400", rose: "--rose-400",
  bg: "--cream-50", ink: "--ink-900",
};

const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v));
const safeFont = (f) => String(f).replace(/[^\w\s؀-ۿ-]/g, "").trim();

export function applySite(raw, doc = document) {
  const s = merge(DEFAULT_SITE, raw || {});
  const root = doc.documentElement;

  // الألوان
  for (const [k, v] of Object.entries(VAR_MAP)) {
    if (isColor(s.colors[k])) root.style.setProperty(v, s.colors[k]);
  }
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", s.colors.primary2);

  // الشكل
  root.style.setProperty("--radius-lg", `${Math.min(40, Math.max(6, Number(s.style.radius) || 28))}px`);
  root.style.setProperty("--pattern-opacity", String(Math.min(0.3, Math.max(0, Number(s.style.pattern_opacity) || 0))));
  doc.body.classList.toggle("no-pattern", !s.style.pattern);
  doc.body.classList.toggle("no-glow", !s.style.hero_glow);
  doc.body.classList.toggle("no-anim", !s.style.animations);

  // الخطوط
  const body = safeFont(s.fonts.body) || "Readex Pro";
  const quote = safeFont(s.fonts.quote) || "Amiri";
  root.style.setProperty("--font", `"${body}", "Noto Sans Arabic", Tahoma, sans-serif`);
  root.style.setProperty("--font-quote", `"${quote}", "Noto Naskh Arabic", serif`);
  const fam = (f, w) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${w}`;
  const href = `https://fonts.googleapis.com/css2?${fam(body, "300;400;500;600;700;800")}&${fam(quote, "400;700")}&display=swap`
    .replace(/:wght@300;400;500;600;700;800(?=&)/, (m) => (["El Messiri", "Changa", "Cairo", "Tajawal", "Readex Pro", "IBM Plex Sans Arabic", "Noto Kufi Arabic", "Rubik", "Baloo Bhaijaan 2", "Almarai"].includes(body) ? m : ":wght@400;700"));
  let link = doc.getElementById("fontLink");
  if (!link) { link = doc.createElement("link"); link.id = "fontLink"; link.rel = "stylesheet"; doc.head.append(link); }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);

  // الهوية
  const name = s.brand.name || DEFAULT_SITE.brand.name;
  doc.title = `${name} — ${s.brand.tagline}`.slice(0, 90);
  const logo = s.brand.logo_url || markDataUrl(s.colors);
  doc.querySelectorAll("[data-logo]").forEach((img) => { img.src = logo; img.alt = `شعار ${name}`; });
  const size = Math.min(220, Math.max(48, Number(s.brand.logo_size) || 112));
  root.style.setProperty("--logo-size", `${size}px`);
  let icon = doc.querySelector('link[rel="icon"]');
  if (icon) { icon.href = s.brand.favicon_url || s.brand.logo_url || markDataUrl(s.colors); icon.removeAttribute("type"); }

  const set = (sel, v) => doc.querySelectorAll(sel).forEach((n) => (n.textContent = v));
  set("[data-brand=name]", name);
  set("[data-brand=tagline]", s.brand.tagline);
  set("[data-brand=footer_quote]", s.brand.footer_quote);

  // النصوص
  doc.querySelectorAll("[data-t]").forEach((n) => { const v = s.texts[n.dataset.t]; if (v != null) n.textContent = v; });
  doc.querySelectorAll("[data-tp]").forEach((n) => { const v = s.texts[n.dataset.tp]; if (v != null) n.placeholder = v; });

  // المزايا
  doc.querySelectorAll("[data-f]").forEach((n) => n.classList.toggle("hidden", !s.features[n.dataset.f]));
  return s;
}
