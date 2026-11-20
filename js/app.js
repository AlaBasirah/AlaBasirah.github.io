// واجهة الزائر

// روابط دعوة المشرفين واستعادة كلمة المرور تصل إلى الصفحة الرئيسية: نحوّلها إلى لوحة الإشراف
if (/type=(invite|recovery)/.test(location.hash)) {
  location.replace(location.pathname.replace(/[^/]*$/, "") + "admin/" + location.hash);
}
import { CONFIG } from "./config.js";
import { DEMO, client, currentUser, demo, ensureSession, fn } from "./api.js";
import { DEFAULT_SITE, merge } from "./defaults.js";
import { applySite } from "./theme.js";

// الإعدادات الحالية (من لوحة المدير) — تُحمَّل من الذاكرة المحلية أولًا للعرض الفوري ثم من الخادم
let SITE = merge(DEFAULT_SITE, {});
const T = (k) => SITE.texts[k] ?? DEFAULT_SITE.texts[k] ?? "";
const F = (k) => SITE.features[k];
const PREVIEW = new URLSearchParams(location.search).has("preview");

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const fmtDate = (d) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });

function toast(text, ms = 3200) {
  const t = el("div", { class: "toast", role: "status" }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/* ======================= نافذة عامة ======================= */
function modal(title, { onClose } = {}) {
  const root = $("#modalRoot");
  root.innerHTML = "";
  const content = el("div", { class: "content" });
  const footer = el("footer", { class: "hidden" });
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", esc); onClose?.(); };
  const esc = (e) => e.key === "Escape" && close();
  const sheet = el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
    el("header", {}, el("h2", {}, title), el("button", { class: "x", "aria-label": "إغلاق", onclick: close }, "×")),
    content, footer);
  const overlay = el("div", { class: "overlay", onclick: (e) => e.target === overlay && close() }, sheet);
  root.append(overlay);
  document.addEventListener("keydown", esc);
  return { content, footer, close, sheet };
}

/* ======================= الإجابات ======================= */
function renderAnswerBody(text) {
  // نص آمن: لا HTML من الخادم إطلاقًا، والإحالات [n] تتحول إلى روابط صغيرة
  const body = el("div", { class: "body" });
  const parts = String(text).split(/(\[\d+\])/g);
  for (const p of parts) {
    const m = p.match(/^\[(\d+)\]$/);
    if (m) {
      body.append(el("sup", {}, el("a", {
        href: `#cite-${m[1]}`,
        onclick: (e) => { e.preventDefault(); const d = document.getElementById(`cite-${m[1]}`); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); } },
      }, m[1])));
    } else body.append(p);
  }
  return body;
}

function renderCitations(cites) {
  if (!cites?.length) return null;
  return el("div", { class: "cites" },
    el("div", { class: "small muted" }, "المصادر (اضغط لعرض النص):"),
    cites.map((c) => el("details", { class: "cite", id: `cite-${c.n}` },
      el("summary", {},
        el("span", { class: "n" }, c.n),
        el("span", { class: "ref" }, c.book, " ",
          el("small", {}, [c.author, c.volume ? `ج${c.volume}` : null, c.page ? `ص${c.page}` : null].filter(Boolean).join(" · ")))),
      el("blockquote", {}, c.excerpt))));
}

function showAnswer(question, res) {
  const area = $("#answerArea");
  area.innerHTML = "";
  const box = el("article", { class: `answer${res.found ? "" : " notfound"}`, "aria-live": "polite" },
    el("p", { class: "question" }, question),
    renderAnswerBody(res.answer),
    F("show_citations") ? renderCitations(res.citations) : null,
    el("div", { class: "disclaimer" },
      res.found ? T("disclaimer_found") : T("disclaimer_notfound")));
  area.append(box);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function ask(question) {
  const area = $("#answerArea");
  const btn = $("#sendBtn");
  btn.disabled = true;
  area.innerHTML = "";
  area.append(el("div", { class: "loading" }, el("span", { class: "dots" }, el("i"), el("i"), el("i")), T("loading")));
  try {
    const res = DEMO ? (await new Promise((r) => setTimeout(r, 900)), demo.answer(question)) : await fn("ask", { question });
    showAnswer(question, res);
  } catch (e) {
    area.innerHTML = "";
    area.append(el("p", { class: "error" }, e.message));
  } finally {
    btn.disabled = false;
  }
}

/* ======================= الأسئلة الشائعة ======================= */
let faqAll = [];
async function loadFaq() {
  const list = $("#faqList");
  try {
    if (DEMO) faqAll = demo.faq;
    else {
      const c = await client();
      const { data, error } = await c.from("faq").select("id,title,ask_count,status,answer,citations")
        .in("status", ["auto", "featured"]).order("ask_count", { ascending: false }).limit(40);
      if (error) throw error;
      faqAll = data ?? [];
    }
    faqAll.sort((a, b) => (b.status === "featured") - (a.status === "featured") || b.ask_count - a.ask_count);
    renderFaq(false);
  } catch {
    list.innerHTML = "";
    list.append(el("li", { class: "empty" }, "تعذر تحميل الأسئلة الآن."));
  }
}

function renderFaq(all) {
  const list = $("#faqList");
  list.innerHTML = "";
  if (!faqAll.length) {
    list.append(el("li", { class: "empty" }, T("faq_empty")));
    return;
  }
  const per = Number(F("faq_visible")) || CONFIG.FAQ_VISIBLE;
  const visible = matchMedia("(max-width: 600px)").matches ? Math.min(5, per) : per;
  const shown = all ? faqAll : faqAll.slice(0, visible);
  shown.forEach((f, i) => list.append(
    el("li", { class: `faq-item${f.status === "featured" ? " featured" : ""}` },
      el("button", {
        onclick: () => showAnswer(f.title, { found: true, answer: f.answer, citations: f.citations }),
      },
        el("span", { class: "star" }, i + 1),
        el("span", {}, el("span", { class: "q" }, f.title),
          F("show_counts") ? el("span", { class: "count" }, `سُئل ${f.ask_count} ${f.ask_count > 10 ? "مرة" : f.ask_count > 2 ? "مرات" : "مرة"}`) : null)))));
  $("#faqMore").classList.toggle("hidden", all || faqAll.length <= visible);
}

/* ======================= تحدّث مع إنسان ======================= */
function inquiryForm(m, { sessionId = null, prefill = "", reason = "none" } = {}) {
  const { content, footer } = m;
  content.innerHTML = "";
  footer.classList.add("hidden");
  const ta = el("textarea", { class: "textarea", id: "inqBody", maxlength: 5000, placeholder: "اكتب استفسارك بالتفصيل…" });
  ta.value = prefill;
  const err = el("p", { class: "error" });
  const send = el("button", { class: "btn sun", type: "submit" }, T("inquiry_btn"));
  content.append(
    el("div", { class: "note" },
      reason === "limit" ? T("apology_limit") : T("apology")),
    el("form", {
      style: "margin-top:16px",
      onsubmit: async (e) => {
        e.preventDefault();
        const body = ta.value.trim();
        if (body.length < 3) { err.textContent = "اكتب استفسارك أولًا."; return; }
        send.disabled = true;
        try {
          if (!DEMO) {
            await ensureSession();
            const c = await client();
            const { data, error } = await c.from("inquiries").insert({ body, session_id: sessionId }).select("id").single();
            if (error) throw error;
            fn("notify-inquiry", { inquiry_id: data.id }).catch(() => {});
          }
          const user = await currentUser();
          content.innerHTML = "";
          content.append(el("div", { class: "note ok" }, T("inquiry_thanks")),
            F("accounts") && (!user || user.is_anonymous)
              ? el("p", { class: "small muted", style: "margin-top:12px" },
                  "لتصلك رسالة بالبريد عند الرد، ولتطّلع على الرد من أي جهاز، يمكنك إنشاء حساب من «حسابي».")
              : null);
        } catch (ex) {
          err.textContent = ex.message || "تعذّر الإرسال.";
          send.disabled = false;
        }
      },
    },
      el("div", { class: "field" }, el("label", { for: "inqBody" }, T("inquiry_label")), ta),
      err, send));
  ta.focus();
}

async function openHumanChat() {
  let session = null;
  let timer = null;
  let poll = null;
  let channel = null;
  let lastId = 0;
  let status = "waiting";
  const myWaitingMsgs = [];

  const cleanup = async () => {
    clearInterval(timer); clearInterval(poll);
    if (channel) { const c = await client(); c?.removeChannel(channel); }
  };
  const m = modal(T("human_btn"), { onClose: cleanup });
  m.content.append(el("div", { class: "loading" }, el("span", { class: "dots" }, el("i"), el("i"), el("i")), T("searching_staff")));

  let res;
  try {
    res = DEMO ? { available: true, session_id: "demo", status: "waiting", created_at: new Date().toISOString() }
               : await fn("request-human");
  } catch (e) {
    m.content.innerHTML = "";
    m.content.append(el("p", { class: "error" }, e.message));
    return;
  }
  if (!res.available) return inquiryForm(m, { reason: res.reason });
  session = res;
  status = res.status;

  // --- واجهة المحادثة ---
  const log = el("div", { class: "chat-log", "aria-live": "polite" });
  const ringTxt = el("span", {}, "5:00");
  const ring = el("div", { class: "ring" }, ringTxt);
  const waitBox = el("div", { class: "waiting" }, ring,
    el("div", { style: "font-weight:600" }, T("waiting_title")),
    el("div", { class: "small muted" }, T("waiting_sub")));
  m.content.innerHTML = "";
  m.content.append(waitBox, log);

  const ta = el("textarea", { class: "textarea", rows: 1, maxlength: 4000, placeholder: "اكتب رسالتك…", "aria-label": "رسالتك" });
  const sendBtn = el("button", { class: "btn", type: "submit" }, "إرسال");
  const form = el("form", { class: "composer" }, ta, sendBtn);
  m.footer.classList.remove("hidden");
  m.footer.append(form);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  const addMsg = (sender, body) => {
    const mine = sender === "visitor";
    log.append(el("div", { class: `msg ${sender === "sys" ? "sys" : mine ? "me" : "them"}` },
      sender === "staff" ? el("span", { class: "who" }, T("staff_label")) : null, body));
    m.content.scrollTop = m.content.scrollHeight;
  };
  const onMessage = (row) => {
    if (row.id <= lastId) return;
    lastId = row.id;
    addMsg(row.sender, row.body);
  };
  const setStatus = (st) => {
    if (st === status) return;
    status = st;
    if (st === "active") {
      clearInterval(timer);
      waitBox.classList.add("hidden");
      addMsg("sys", T("joined"));
    } else if (st === "closed") {
      clearInterval(timer); clearInterval(poll);
      waitBox.classList.add("hidden");
      addMsg("sys", T("ended"));
      form.querySelectorAll("textarea,button").forEach((x) => (x.disabled = true));
    } else if (st === "missed") {
      cleanup();
      inquiryForm(m, { sessionId: DEMO ? null : session.session_id, prefill: myWaitingMsgs.join("\n") });
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = ta.value.trim();
    if (!body) return;
    ta.value = "";
    if (status === "waiting") myWaitingMsgs.push(body);
    if (DEMO) { addMsg("visitor", body); return; }
    const c = await client();
    const { data, error } = await c.from("chat_messages")
      .insert({ session_id: session.session_id, sender: "visitor", body }).select("id,sender,body").single();
    if (error) { toast("تعذّر إرسال الرسالة"); ta.value = body; return; }
    onMessage(data);
  });

  // --- مؤقت الانتظار (5 دقائق من لحظة الطلب) ---
  const waitSec = DEMO ? Number(new URLSearchParams(location.search).get("wait") || CONFIG.HUMAN_WAIT_SECONDS) : Number(session.wait_seconds) || CONFIG.HUMAN_WAIT_SECONDS;
  const deadline = new Date(session.created_at).getTime() + waitSec * 1000;
  const tick = async () => {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    ringTxt.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    ring.style.setProperty("--p", `${100 - (left / waitSec) * 100}%`);
    if (left === 0 && status === "waiting") {
      clearInterval(timer);
      if (DEMO) return setStatus("missed");
      const c = await client();
      // قد تتأخر ساعة الجهاز قليلًا عن الخادم: نعيد المحاولة حتى يؤكد الخادم انتهاء المهلة
      const retry = async (n) => {
        const { data } = await c.rpc("mark_missed", { sid: session.session_id });
        if (data === "waiting" && n > 0) return setTimeout(() => retry(n - 1), 5000);
        setStatus(data || "missed");
      };
      retry(6);
    }
  };
  if (status === "waiting") { tick(); timer = setInterval(tick, 1000); }
  else setStatus(status);

  if (DEMO) return;

  // --- التحديث المباشر + استطلاع احتياطي ---
  const c = await client();
  const sid = session.session_id;
  const { data: old } = await c.from("chat_messages").select("id,sender,body").eq("session_id", sid).order("id");
  (old ?? []).forEach(onMessage);
  if (status === "active") { waitBox.classList.add("hidden"); }

  channel = c.channel(`chat-${sid}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sid}` }, (p) => onMessage(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_sessions", filter: `id=eq.${sid}` }, (p) => setStatus(p.new.status))
    .subscribe();

  poll = setInterval(async () => {
    const [{ data: s }, { data: msgs }] = await Promise.all([
      c.from("chat_sessions").select("status").eq("id", sid).single(),
      c.from("chat_messages").select("id,sender,body").eq("session_id", sid).gt("id", lastId).order("id"),
    ]);
    (msgs ?? []).forEach(onMessage);
    if (s) setStatus(s.status);
  }, 8000);
}

/* ======================= حسابي ======================= */
async function openAccount() {
  const m = modal(T("account_btn"));
  const { content } = m;
  if (DEMO) {
    content.append(el("div", { class: "note" }, "في وضع المعاينة لا تعمل الحسابات. بعد ربط الخادم يمكن للزائر إنشاء حساب اختياري ببريده فقط (دون كلمة مرور) لحفظ أسئلته والردود عليها."));
    return;
  }
  await ensureSession();
  const user = await currentUser();
  const c = await client();

  if (user && !user.is_anonymous && user.email) {
    content.append(
      el("div", { class: "note ok" }, "أنت مسجّل باسم: ", el("bdi", {}, user.email)),
      el("p", { class: "small muted" }, "أسئلتك وردود المشرفين محفوظة في حسابك ويمكنك رؤيتها من أي جهاز."),
      el("button", { class: "btn ghost", onclick: async () => { await c.auth.signOut(); m.close(); toast("تم تسجيل الخروج"); } }, "تسجيل الخروج"));
    return;
  }

  const err = el("p", { class: "error" });
  const pane = el("div");
  const tabs = el("div", { class: "tabs" });
  const show = (which) => {
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === which));
    pane.innerHTML = ""; err.textContent = "";
    const email = el("input", { class: "input", type: "email", required: true, placeholder: "name@example.com", dir: "ltr", id: "accEmail" });
    const go = el("button", { class: "btn", type: "submit" }, which === "new" ? "أنشئ حسابي" : "أرسل رابط الدخول");
    pane.append(
      el("p", { class: "small muted" }, which === "new"
        ? "الحساب اختياري تمامًا. فائدته: حفظ أسئلتك والردود عليها، والاطلاع عليها من أي جهاز، وتنبيهك بالبريد عند رد المشرف. لا نطلب اسمك ولا كلمة مرور، وستُنقل إلى حسابك أسئلتك الحالية."
        : "سنرسل إلى بريدك رابطًا تدخل به مباشرة. (أسئلتك غير المحفوظة في هذا المتصفح لن تُنقل.)"),
      el("form", {
        onsubmit: async (e) => {
          e.preventDefault(); go.disabled = true; err.textContent = "";
          const redirect = location.origin + location.pathname;
          const { error } = which === "new"
            ? await c.auth.updateUser({ email: email.value.trim() }, { emailRedirectTo: redirect })
            : await c.auth.signInWithOtp({ email: email.value.trim(), options: { shouldCreateUser: false, emailRedirectTo: redirect } });
          go.disabled = false;
          if (error) { err.textContent = which === "new" && /registered|exists/i.test(error.message) ? "هذا البريد مسجّل مسبقًا، استخدم «لدي حساب»." : error.message; return; }
          pane.innerHTML = "";
          pane.append(el("div", { class: "note ok" }, "أرسلنا رسالة إلى بريدك. افتحها واضغط الرابط لإتمام العملية."));
        },
      }, el("div", { class: "field" }, el("label", { for: "accEmail" }, "البريد الإلكتروني"), email), err, go));
  };
  tabs.append(
    el("button", { "data-t": "new", onclick: () => show("new") }, "إنشاء حساب"),
    el("button", { "data-t": "login", onclick: () => show("login") }, "لدي حساب"));
  content.append(tabs, pane);
  show("new");
}

/* ======================= أسئلتي ======================= */
async function openMine() {
  const m = modal(T("mine_btn"));
  const { content } = m;
  if (DEMO) {
    content.append(el("div", { class: "note" }, "في وضع المعاينة لا تُحفظ الأسئلة. بعد ربط الخادم تظهر هنا أسئلتك السابقة وإجاباتها، واستفساراتك المكتوبة وردود المشرفين عليها."));
    return;
  }
  await ensureSession();
  const c = await client();
  const [{ data: asks }, { data: inqs }] = await Promise.all([
    c.from("asks").select("id,question,answer,citations,found,created_at").order("created_at", { ascending: false }).limit(100),
    c.from("inquiries").select("id,body,reply,status,created_at,replied_at").order("created_at", { ascending: false }).limit(50),
  ]);

  if (inqs?.length) {
    content.append(el("h3", { style: "margin:0 0 8px;font-size:16px" }, "استفساراتي للمشرفين"));
    content.append(el("ul", { class: "hist", style: "margin-bottom:18px" }, inqs.map((q) =>
      el("li", {},
        el("div", { class: "row" }, el("span", { class: `tag ${q.reply ? "ok" : ""}` }, q.reply ? "تم الرد" : "بانتظار الرد"), el("span", { class: "d" }, fmtDate(q.created_at))),
        el("div", { class: "t", style: "white-space:pre-wrap;margin-top:4px" }, q.body),
        q.reply ? el("div", { class: "note ok", style: "margin-top:8px;white-space:pre-wrap" }, el("b", {}, "رد المشرف: "), q.reply) : null))));
  }

  content.append(el("h3", { style: "margin:0 0 8px;font-size:16px" }, "أسئلتي السابقة"));
  if (!asks?.length) content.append(el("p", { class: "muted" }, "لم تطرح أسئلة بعد من هذا المتصفح."));
  else content.append(el("ul", { class: "hist" }, asks.map((a) =>
    el("li", {},
      el("button", {
        style: "all:unset;cursor:pointer;display:block;width:100%",
        onclick: () => { m.close(); showAnswer(a.question, a); },
      }, el("div", { class: "t" }, a.question), el("div", { class: "d" }, fmtDate(a.created_at), " · ", a.found ? "أُجيب من المصادر" : "لم يوجد نص"))))));

  const user = await currentUser();
  if (user?.is_anonymous) content.append(el("p", { class: "small muted", style: "margin-top:14px" }, "هذه الأسئلة محفوظة في هذا المتصفح فقط. لحفظها في حساب يمكنك إنشاء حساب من «حسابي»."));
}

/* ======================= المصادر وعن الموقع ======================= */
async function openSources() {
  const m = modal(T("sources_link"));
  let books = demo.books;
  if (!DEMO) {
    const c = await client();
    const { data } = await c.from("books").select("title,author,volume").order("author").order("title").order("volume");
    books = data ?? [];
  }
  const by = {};
  for (const b of books) (by[b.author] ??= new Map()).set(b.title, [...(by[b.author].get(b.title) ?? []), b.volume].filter(Boolean));
  m.content.append(el("p", { class: "muted small" }, "لا يجيب الموقع إلا من هذه الكتب، ويذكر الجزء والصفحة مع كل إجابة."));
  for (const [author, titles] of Object.entries(by)) {
    m.content.append(el("h3", { style: "margin:14px 0 6px;font-size:16px;color:var(--teal-800)" }, author),
      el("ul", { style: "margin:0;padding-inline-start:20px" }, [...titles].map(([t, vols]) => el("li", {}, t, vols.length ? el("span", { class: "small muted" }, ` (${vols.length} أجزاء)`) : null))));
  }
  if (!books.length) m.content.append(el("p", { class: "empty" }, "لم تُضف كتب بعد."));
}

function openAbout() {
  const m = modal(T("about_link"));
  String(SITE.brand.about || "").split(/\n\s*\n/).forEach((p) => p.trim() && m.content.append(el("p", { style: "white-space:pre-wrap" }, p.trim())));
}

/* ======================= التشغيل ======================= */
function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
}

const CACHE_KEY = "basira-site-settings";
function useSettings(data) {
  SITE = applySite(data);
  if (faqAll.length) renderFaq(false);
}
async function loadSettings() {
  try { useSettings(JSON.parse(localStorage.getItem(CACHE_KEY) || "null")); } catch { useSettings(null); }
  if (PREVIEW) return;
  try {
    let data = null;
    if (DEMO) data = JSON.parse(localStorage.getItem("basira-demo-settings") || "null");
    else {
      const c = await client();
      const { data: row } = await c.from("site_settings").select("data").eq("id", 1).maybeSingle();
      data = row?.data ?? null;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    useSettings(data);
  } catch { /* نبقى على المخزّن */ }
}

// المعاينة المباشرة داخل لوحة المدير (من النطاق نفسه فقط)
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.type !== "basira-preview") return;
  useSettings(e.data.settings);
});

function init() {
  loadSettings();
  const q = $("#q");
  q.addEventListener("input", () => autoGrow(q));
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#askForm").requestSubmit(); } });
  $("#askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = q.value.trim();
    if (v.length >= 3) ask(v);
  });
  $("#faqMore").addEventListener("click", () => renderFaq(true));
  $("#btnHuman").addEventListener("click", openHumanChat);
  $("#btnAccount").addEventListener("click", openAccount);
  $("#btnMine").addEventListener("click", openMine);
  $("#btnSources").addEventListener("click", openSources);
  $("#btnAbout").addEventListener("click", openAbout);
  loadFaq();
  if (DEMO) console.info("Basira: preview mode (no backend configured in js/config.js)");
  else if (!PREVIEW) ensureSession().catch(() => {});
  if (PREVIEW) window.parent?.postMessage({ type: "basira-preview-ready" }, location.origin);
}

init();
