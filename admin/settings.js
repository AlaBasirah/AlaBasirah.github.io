// لوحة تحكم المدير: نظرة عامة، تخصيص الموقع بمعاينة مباشرة، وإعدادات الذكاء الاصطناعي
import { BODY_FONTS, DEFAULT_SERVER, DEFAULT_SITE, PRESETS, QUOTE_FONTS, merge } from "../js/defaults.js";
import { markDataUrl } from "../js/theme.js";

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "value") n.value = v;
    else if (k === "checked") n.checked = Boolean(v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const getPath = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split("."); const last = ks.pop(); ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v; };

/* ============================ تحميل وحفظ ============================ */
export async function loadSettings(ctx) {
  if (ctx.DEMO) {
    return {
      site: merge(DEFAULT_SITE, JSON.parse(localStorage.getItem("basira-demo-settings") || "null") || {}),
      server: merge(DEFAULT_SERVER, JSON.parse(localStorage.getItem("basira-demo-server") || "null") || {}),
    };
  }
  const [{ data: a }, { data: b }] = await Promise.all([
    ctx.c.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    ctx.c.from("server_settings").select("data").eq("id", 1).maybeSingle(),
  ]);
  return { site: merge(DEFAULT_SITE, a?.data ?? {}), server: merge(DEFAULT_SERVER, b?.data ?? {}) };
}

async function saveSettings(ctx, site, server) {
  server.human_chat = Boolean(site.features.human_chat);       // إخفاء الزر يعني إيقاف الخدمة من الخادم أيضًا
  if (ctx.DEMO) {
    localStorage.setItem("basira-demo-settings", JSON.stringify(site));
    localStorage.setItem("basira-demo-server", JSON.stringify(server));
    localStorage.removeItem("basira-site-settings");
    return;
  }
  const { error } = await ctx.c.rpc("save_settings", { p_site: site, p_server: server });
  if (error) throw error;
}

async function uploadImage(ctx, file, kind) {
  if (!/^image\/(png|jpe?g|svg\+xml|webp|gif|x-icon|vnd\.microsoft\.icon)$/.test(file.type)) throw new Error("الملف يجب أن يكون صورة (PNG أو SVG أو JPG أو WEBP)");
  if (file.size > 2 * 1024 * 1024) throw new Error("حجم الصورة أكبر من 2 ميغابايت");
  if (ctx.DEMO) {
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${kind}-${Date.now()}.${ext}`;
  const { error } = await ctx.c.storage.from("branding").upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw error;
  return ctx.c.storage.from("branding").getPublicUrl(path).data.publicUrl;
}

/* ============================ نظرة عامة ============================ */
export async function renderOverview(app, ctx) {
  let st;
  if (ctx.DEMO) {
    st = { asks_today: 23, asks_week: 164, asks_total: 1290, found_rate: 81, visitors_week: 97, chats_week: 18, chats_answered: 14, chats_missed: 4,
      chats_waiting: 1, inquiries_open: 3, faq_pending: 2, books: 54, chunks: 61234, staff_available: 2,
      daily: Array.from({ length: 14 }, (_, i) => ({ d: `11-${String(7 + i).padStart(2, "0")}`, n: [8, 12, 9, 15, 22, 18, 11, 25, 30, 21, 19, 28, 26, 23][i] })),
      unanswered: ["ما حكم زيارة المقامات؟", "ما رأي ابن تيمية في الفارابي؟", "هل ورد ذكر جبل لبنان في الكتب؟"] };
  } else {
    const { data, error } = await ctx.c.rpc("admin_stats");
    if (error) throw error;
    st = data;
  }
  app.innerHTML = "";
  app.append(ctx.tabs());

  const card = (label, value, sub, tone = "") => el("div", { class: `stat ${tone}` },
    el("div", { class: "v" }, value ?? 0), el("div", { class: "l" }, label), sub ? el("div", { class: "s" }, sub) : null);

  app.append(el("div", { class: "stats" },
    card("سؤال اليوم", st.asks_today, `${st.asks_week} خلال 7 أيام`),
    card("زائر هذا الأسبوع", st.visitors_week, "سألوا سؤالًا واحدًا على الأقل"),
    card("نسبة الأسئلة المجابة", `${st.found_rate ?? 0}%`, "آخر 30 يومًا", (st.found_rate ?? 100) < 60 ? "warn" : "good"),
    card("محادثات مباشرة", st.chats_week, `استُلم ${st.chats_answered} · فات ${st.chats_missed}`, st.chats_missed > st.chats_answered ? "warn" : ""),
    card("ينتظر الآن", st.chats_waiting, `${st.staff_available} مشرف متاح`, st.chats_waiting ? "hot" : ""),
    card("استفسارات بلا رد", st.inquiries_open, "", st.inquiries_open ? "hot" : "good"),
    card("أسئلة بانتظار الموافقة", st.faq_pending, "لقائمة أكثر الأسئلة"),
    card("الكتب المفعّلة", st.books, `${Number(st.chunks).toLocaleString("ar")} مقطع`)));

  const max = Math.max(1, ...st.daily.map((x) => x.n));
  app.append(el("div", { class: "split2" },
    el("div", { class: "card" },
      el("h3", { class: "h3" }, "الأسئلة يوميًا (آخر 14 يومًا)"),
      el("div", { class: "bars" }, st.daily.map((x) =>
        el("div", { class: "bar", title: `${x.d}: ${x.n}` },
          el("span", { class: "n" }, x.n),
          el("i", { style: `height:${Math.max(3, (x.n / max) * 100)}%` }),
          el("span", { class: "d" }, x.d.slice(3)))))),
    el("div", { class: "card" },
      el("h3", { class: "h3" }, "أسئلة لم يُعثر لها على نص"),
      el("p", { class: "small muted" }, "تدلك على كتب أو موضوعات ينبغي إضافتها إلى المصادر."),
      st.unanswered?.length
        ? el("ul", { class: "plain" }, st.unanswered.map((q) => el("li", {}, q)))
        : el("p", { class: "muted" }, "لا يوجد — الحمد لله."))));
}

/* ============================ تخصيص الموقع ============================ */
const TEXT_GROUPS = [
  ["الصفحة الرئيسية", [["faq_title", "عنوان قائمة الأسئلة"], ["faq_more", "زر عرض المزيد"], ["faq_empty", "عند عدم وجود أسئلة"], ["human_btn", "زر التحدث مع إنسان"], ["placeholder", "النص داخل مربع السؤال"], ["hint", "التلميح تحت مربع السؤال", true], ["mine_btn", "زر «أسئلتي»"], ["account_btn", "زر «حسابي»"], ["sources_link", "رابط المصادر"], ["about_link", "رابط عن الموقع"], ["footer_note", "سطر إضافي في التذييل"]]],
  ["الإجابة", [["loading", "أثناء البحث"], ["disclaimer_found", "التنبيه تحت الإجابة", true], ["disclaimer_notfound", "التنبيه عند عدم وجود نص", true]]],
  ["المحادثة مع إنسان", [["searching_staff", "أثناء البحث عن مشرف"], ["waiting_title", "عنوان الانتظار"], ["waiting_sub", "شرح الانتظار", true], ["staff_label", "اسم المشرف الظاهر للزائر"], ["joined", "عند انضمام المشرف"], ["ended", "عند انتهاء المحادثة", true]]],
  ["عدم توفر مشرف", [["apology", "عبارة الاعتذار", true], ["apology_limit", "الاعتذار عند كثرة الطلبات", true], ["inquiry_label", "العنوان فوق مربع الاستفسار", true], ["inquiry_btn", "زر الإرسال"], ["inquiry_thanks", "رسالة الشكر بعد الإرسال", true]]],
];

const COLOR_LABELS = [
  ["primary1", "الرئيسي الفاتح"], ["primary2", "الرئيسي"], ["primary3", "الرئيسي الداكن"],
  ["sun1", "المشرق الفاتح"], ["sun2", "المشرق"], ["sun3", "المرجاني"], ["rose", "الوردي"],
  ["bg", "لون الخلفية"], ["ink", "لون النص"],
];

const FEATURES = [
  ["show_faq", "إظهار قائمة «أكثر الأسئلة»"],
  ["show_counts", "إظهار عدد مرات السؤال"],
  ["human_chat", "تفعيل «تحدّث مع إنسان»"],
  ["accounts", "السماح بالحساب الاختياري للزوار"],
  ["show_mine", "إظهار زر «أسئلتي»"],
  ["show_citations", "إظهار نصوص المصادر تحت الإجابة"],
  ["show_sources", "إظهار رابط «المصادر المعتمدة»"],
  ["show_about", "إظهار رابط «عن الموقع»"],
];

export async function renderCustomize(app, ctx) {
  const loaded = await loadSettings(ctx);
  const saved = clone(loaded);
  let site = clone(loaded.site);
  const server = clone(loaded.server);
  let dirty = false;
  const pending = renderCustomize.pending;          // «استعادة الافتراضي» تعيد بناء الحقول بالقيم الافتراضية
  if (pending) { site = pending; delete renderCustomize.pending; }

  app.innerHTML = "";
  app.append(ctx.tabs());

  // --- المعاينة ---
  const frame = el("iframe", { class: "preview-frame", src: "../index.html?preview", title: "معاينة الموقع" });
  const frameWrap = el("div", { class: "frame-wrap desk" }, frame);
  const push = () => frame.contentWindow?.postMessage({ type: "basira-preview", settings: site }, location.origin);
  frame.addEventListener("load", () => setTimeout(push, 150));
  window.addEventListener("message", (e) => e.origin === location.origin && e.data?.type === "basira-preview-ready" && push());

  const status = el("span", { class: "small muted" }, "لا توجد تعديلات");
  const changed = () => { dirty = true; status.textContent = "تعديلات غير محفوظة"; status.className = "small dirty"; push(); };

  // --- عناصر الإدخال ---
  const input = (path, attrs = {}) => {
    const n = el(attrs.multiline ? "textarea" : "input", { class: attrs.multiline ? "textarea sm" : "input", ...attrs, multiline: null, value: getPath(site, path) ?? "" });
    n.addEventListener("input", () => { setPath(site, path, attrs.type === "number" ? Number(n.value) : n.value); changed(); });
    return n;
  };
  const toggle = (path, label) => {
    const box = el("input", { type: "checkbox", checked: getPath(site, path) });
    box.addEventListener("change", () => { setPath(site, path, box.checked); changed(); });
    return el("label", { class: "tg" }, box, el("span", { class: "tg-track" }, el("span", { class: "tg-knob" })), el("span", {}, label));
  };
  const range = (path, min, max, step, fmt = (v) => v) => {
    const out = el("span", { class: "rv" }, fmt(getPath(site, path)));
    const r = el("input", { type: "range", min, max, step, value: getPath(site, path) });
    r.addEventListener("input", () => { setPath(site, path, Number(r.value)); out.textContent = fmt(Number(r.value)); changed(); });
    return el("div", { class: "range" }, r, out);
  };
  const field = (label, control, help) => el("div", { class: "field" }, el("label", {}, label), control, help ? el("div", { class: "help" }, help) : null);
  const section = (title, open, ...body) => el("details", { class: "sec", open }, el("summary", {}, title), el("div", { class: "sec-body" }, ...body));

  // الهوية والشعار
  const logoImg = el("img", { class: "logo-prev", alt: "" });
  const favImg = el("img", { class: "fav-prev", alt: "" });
  const paintLogos = () => {
    logoImg.src = site.brand.logo_url || markDataUrl(site.colors);
    favImg.src = site.brand.favicon_url || site.brand.logo_url || markDataUrl(site.colors);
  };
  paintLogos();
  const uploader = (kind, path) => {
    const f = el("input", { type: "file", accept: "image/png,image/svg+xml,image/jpeg,image/webp,image/x-icon", class: "hidden" });
    f.addEventListener("change", async () => {
      if (!f.files[0]) return;
      try { setPath(site, path, await uploadImage(ctx, f.files[0], kind)); paintLogos(); changed(); ctx.toast("رُفعت الصورة"); }
      catch (e) { ctx.toast(e.message); }
      f.value = "";
    });
    return el("span", { class: "row" }, f,
      el("button", { class: "btn ghost sm", type: "button", onclick: () => f.click() }, "رفع صورة"),
      el("button", { class: "btn ghost sm", type: "button", onclick: () => { setPath(site, path, ""); paintLogos(); changed(); } }, "الافتراضي"));
  };

  const identity = section("الهوية والشعار", true,
    field("اسم الموقع", input("brand.name", { maxlength: 40 })),
    field("العبارة التعريفية تحت الاسم", input("brand.tagline", { maxlength: 160, multiline: true })),
    el("div", { class: "logo-row" }, logoImg,
      el("div", {}, el("strong", {}, "الشعار"), el("div", { class: "help" }, "PNG شفاف أو SVG، مربع الأبعاد. الشعار الافتراضي يتلوّن تلقائيًا بألوان الموقع."), uploader("logo", "brand.logo_url"))),
    field("حجم الشعار", range("brand.logo_size", 64, 200, 4, (v) => `${v}px`)),
    el("div", { class: "logo-row" }, favImg,
      el("div", {}, el("strong", {}, "أيقونة المتصفح"), el("div", { class: "help" }, "تظهر في تبويب المتصفح. إن تُركت تُستخدم صورة الشعار."), uploader("favicon", "brand.favicon_url"))),
    field("النص في التذييل", input("brand.footer_quote", { maxlength: 200, multiline: true })),
    field("نافذة «عن الموقع»", input("brand.about", { multiline: true, rows: 6 }), "اترك سطرًا فارغًا بين الفقرات."));

  // الألوان
  const pickers = {};
  const colorGrid = el("div", { class: "colors" }, COLOR_LABELS.map(([k, label]) => {
    const p = el("input", { type: "color", value: site.colors[k] });
    const hex = el("input", { class: "input hex", value: site.colors[k], dir: "ltr", maxlength: 7 });
    p.addEventListener("input", () => { site.colors[k] = p.value; hex.value = p.value; paintLogos(); changed(); });
    hex.addEventListener("change", () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { site.colors[k] = hex.value; p.value = hex.value; paintLogos(); changed(); } });
    pickers[k] = [p, hex];
    return el("label", { class: "color" }, p, el("span", {}, label), hex);
  }));
  const applyPreset = (c) => { site.colors = { ...c }; for (const [k, [p, h]] of Object.entries(pickers)) { p.value = c[k]; h.value = c[k]; } paintLogos(); changed(); };
  const presets = el("div", { class: "presets" }, PRESETS.map((pr) => el("button", { type: "button", class: "preset", onclick: () => applyPreset(pr.colors), title: pr.name },
    el("span", { class: "sw", style: `background:linear-gradient(135deg,${pr.colors.primary1},${pr.colors.primary2} 50%,${pr.colors.primary3})` }),
    el("span", { class: "sw", style: `background:linear-gradient(135deg,${pr.colors.sun1},${pr.colors.sun2},${pr.colors.sun3})` }),
    el("span", {}, pr.name))));
  const colors = section("الألوان", false, el("div", { class: "help" }, "اختر طقمًا جاهزًا ثم عدّل ما شئت. التدرجات والزخارف تُشتق من هذه الألوان تلقائيًا."), presets, colorGrid);

  // الخطوط
  const fontSel = (path, list) => {
    const s = el("select", { class: "input" }, list.map((f) => el("option", { value: f, selected: getPath(site, path) === f }, f)));
    s.addEventListener("change", () => { setPath(site, path, s.value); changed(); });
    return s;
  };
  const fonts = section("الخطوط", false,
    field("خط الموقع", fontSel("fonts.body", BODY_FONTS)),
    field("خط النصوص المقتبسة من الكتب", fontSel("fonts.quote", QUOTE_FONTS)));

  // الشكل
  const look = section("الشكل والزخرفة", false,
    toggle("style.pattern", "إظهار الزخرفة الهندسية في الخلفية"),
    field("وضوح الزخرفة", range("style.pattern_opacity", 0, 0.2, 0.01, (v) => `${Math.round(v * 100)}%`)),
    field("استدارة الحواف", range("style.radius", 6, 40, 1, (v) => `${v}px`)),
    toggle("style.hero_glow", "إظهار الإضاءات الملونة في الترويسة"),
    toggle("style.animations", "تفعيل الحركات الخفيفة"));

  // النصوص
  const texts = section("نصوص الموقع", false,
    el("div", { class: "help" }, "كل نص يراه الزائر قابل للتعديل هنا."),
    TEXT_GROUPS.map(([g, items]) => el("fieldset", { class: "tgroup" }, el("legend", {}, g),
      items.map(([k, label, multi]) => field(label, input(`texts.${k}`, { multiline: multi, rows: multi ? 2 : null }))))));

  // المزايا
  const features = section("المزايا والأقسام", false,
    FEATURES.map(([k, label]) => toggle(`features.${k}`, label)),
    field("عدد الأسئلة الظاهرة قبل «عرض المزيد»", input("features.faq_visible", { type: "number", min: 3, max: 30 })));

  // --- شريط الحفظ ---
  const saveBtn = el("button", { class: "btn sun", onclick: async () => {
    saveBtn.disabled = true;
    try {
      await saveSettings(ctx, site, server);
      Object.assign(saved, { site: clone(site) });
      dirty = false; status.textContent = "حُفظ ونُشر على الموقع ✓"; status.className = "small ok-t";
      ctx.toast("حُفظت الإعدادات وظهرت للزوار");
    } catch (e) { ctx.toast(e.message || "تعذر الحفظ"); }
    saveBtn.disabled = false;
  } }, "حفظ ونشر");
  const undo = el("button", { class: "btn ghost", onclick: () => { if (!dirty || confirm("التراجع عن كل التعديلات غير المحفوظة؟")) renderCustomize(app, ctx); } }, "تراجع");
  const reset = el("button", { class: "btn ghost", onclick: () => {
    if (!confirm("إعادة كل التخصيصات إلى الافتراضي؟ (لن تُحفظ حتى تضغط «حفظ ونشر»)")) return;
    renderCustomize.pending = clone(DEFAULT_SITE);
    renderCustomize(app, ctx);
  } }, "استعادة الافتراضي");

  const view = (cls, label) => el("button", { type: "button", class: `vbtn ${cls === "desk" ? "on" : ""}`, onclick: (e) => {
    frameWrap.className = `frame-wrap ${cls}`;
    e.currentTarget.parentElement.querySelectorAll(".vbtn").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
  } }, label);

  const editor = el("div", { class: "editor" }, identity, colors, fonts, look, texts, features);

  app.append(el("div", { class: "custom" },
    el("div", { class: "editor-col" },
      el("div", { class: "savebar" }, saveBtn, undo, reset, status),
      editor),
    el("div", { class: "preview-col" },
      el("div", { class: "row preview-head" }, el("strong", { style: "flex:1" }, "معاينة مباشرة"), view("desk", "حاسوب"), view("mobile", "جوال")),
      frameWrap,
      el("div", { class: "help" }, "المعاينة لا تحفظ شيئًا. يرى الزوار التعديلات بعد «حفظ ونشر»."))));

  window.onbeforeunload = () => (dirty ? true : undefined);
  ctx.onLeave(() => !dirty || confirm("لديك تعديلات غير محفوظة. هل تريد المغادرة دونها؟"));

  if (pending) changed();
}

/* ============================ الذكاء الاصطناعي والخادم ============================ */
const MODELS = [
  ["gemini|gemini-3.8-flash", "Gemini 3.8 Flash — مجاني (موصى به حاليًا)"],
  ["gemini|gemini-3.6-flash", "Gemini 3.6 Flash — مجاني"],
  ["gemini|gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite — مجاني، أسرع وأقل دقة"],
  ["claude|claude-sonnet-5-5", "Claude Sonnet 5.5 — مدفوع، أدق التزامًا بالمصادر"],
  ["claude|claude-haiku-5-5", "Claude Haiku 5.5 — مدفوع، أرخص"],
  ["claude|claude-opus-5-5", "Claude Opus 5.5 — مدفوع، الأعلى دقة وتكلفة"],
];

export async function renderAI(app, ctx) {
  const { site, server } = await loadSettings(ctx);
  app.innerHTML = "";
  app.append(ctx.tabs());
  const s = clone(server);

  const num = (k, min, max, label, help, factor = 1) => {
    const n = el("input", { class: "input", type: "number", min, max, value: Math.round(s[k] / factor) });
    n.addEventListener("input", () => { s[k] = Math.min(max, Math.max(min, Number(n.value) || min)) * factor; });
    return el("div", { class: "field" }, el("label", {}, label), n, help ? el("div", { class: "help" }, help) : null);
  };
  const model = el("select", { class: "input" }, MODELS.map(([v, l]) => el("option", { value: v, selected: `${s.provider}|${s.model}` === v }, l)));
  model.addEventListener("change", () => { [s.provider, s.model] = model.value.split("|"); });
  const extra = el("textarea", { class: "textarea", rows: 6, value: s.extra_instructions, placeholder: "مثال: خاطب السائل بعبارة «أخي الكريم»، واختم الإجابة بدعاء قصير بالهداية، واجعل الإجابة في حدود 200 كلمة." });
  extra.addEventListener("input", () => (s.extra_instructions = extra.value));
  const nf = el("textarea", { class: "textarea", rows: 3, value: s.not_found_message, placeholder: "اتركه فارغًا لاستخدام العبارة الافتراضية" });
  nf.addEventListener("input", () => (s.not_found_message = nf.value));
  const autoPub = el("input", { type: "checkbox", checked: s.faq_auto_publish });
  autoPub.addEventListener("change", () => (s.faq_auto_publish = autoPub.checked));
  const topk = el("input", { type: "range", min: 4, max: 24, step: 1, value: s.top_k });
  const topkV = el("span", { class: "rv" }, s.top_k);
  topk.addEventListener("input", () => { s.top_k = Number(topk.value); topkV.textContent = topk.value; });

  app.append(el("div", { class: "ai-grid" },
    el("div", { class: "card" },
      el("h3", { class: "h3" }, "الذكاء الاصطناعي"),
      el("div", { class: "note ok", style: "margin-bottom:14px" },
        "قاعدة «لا يجيب إلا من المصادر» مكتوبة في الخادم ولا يمكن إلغاؤها من هنا. وكل إجابة لا تستند إلى مقطع حقيقي من الكتب تُحذف تلقائيًا ويظهر بدلها الاعتذار."),
      el("div", { class: "field" }, el("label", {}, "النموذج"), model,
        el("div", { class: "help" }, "نماذج Gemini تعمل بالمفتاح المجاني من Google بحدود يومية. نماذج Claude تحتاج مفتاحًا مدفوعًا من Anthropic.")),
      el("div", { class: "field" }, el("label", {}, "تعليمات إضافية لأسلوب الإجابة"), extra,
        el("div", { class: "help" }, "تُضاف إلى القواعد الأساسية ولا تلغيها: الأسلوب، الطول، طريقة المخاطبة.")),
      el("div", { class: "field" }, el("label", {}, "رسالة عدم وجود نص في المصادر"), nf),
      el("div", { class: "field" }, el("label", {}, "عدد المقاطع التي يقرؤها النموذج لكل سؤال"), el("div", { class: "range" }, topk, topkV),
        el("div", { class: "help" }, "أكثر = إجابة أشمل وتكلفة أعلى. المقترح بين 10 و 14."))),
    el("div", { class: "card" },
      el("h3", { class: "h3" }, "المحادثة والحدود"),
      num("wait_seconds", 1, 30, "مهلة انتظار المشرف قبل نموذج الرسالة المكتوبة (بالدقائق)", "طلبت أن تكون 5 دقائق.", 60),
      num("ask_limit", 5, 200, "أقصى عدد أسئلة للزائر في الساعة", "يحميك من الإساءة ومن ارتفاع التكلفة."),
      num("human_limit", 1, 20, "أقصى عدد طلبات محادثة للزائر في الساعة"),
      el("label", { class: "tg", style: "margin-top:8px" }, autoPub, el("span", { class: "tg-track" }, el("span", { class: "tg-knob" })),
        el("span", {}, "نشر الأسئلة العامة في «أكثر الأسئلة» تلقائيًا")),
      el("div", { class: "help" }, "إن أوقفته تظهر الأسئلة الجديدة في تبويب «الأسئلة الشائعة» بحالة «بانتظار الموافقة» حتى تعتمدها."),
      el("div", { class: "row", style: "margin-top:18px" },
        el("button", { class: "btn sun", onclick: async (e) => {
          e.target.disabled = true;
          try { await saveSettings(ctx, site, s); ctx.toast("حُفظت الإعدادات"); } catch (ex) { ctx.toast(ex.message || "تعذر الحفظ"); }
          e.target.disabled = false;
        } }, "حفظ")))));
}
