// لوحة الإشراف — للمدير والمشرفين فقط. لا يوجد أي رابط إليها من الموقع العام.
import { CONFIG } from "../js/config.js";
import { renderAI, renderCustomize, renderOverview } from "./settings.js";

const DEMO = !CONFIG.SUPABASE_URL;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "value") n.value = v;
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const fmt = (d) => d ? new Date(d).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" }) : "";
const ago = (d) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  return s < 60 ? `منذ ${s} ث` : s < 3600 ? `منذ ${Math.floor(s / 60)} د` : fmt(d);
};
function toast(t) { const n = el("div", { class: "toast" }, t); document.body.append(n); setTimeout(() => n.remove(), 3000); }

// نلتقط الرابط قبل أن تعالجه مكتبة الدخول (روابط الدعوة واستعادة كلمة المرور وروابط البريد)
const initialHash = location.hash;
const authType = /type=(invite|recovery)/.exec(initialHash)?.[1] ?? null;
const deep = /(chat|inquiry)=([0-9a-f-]{36})/.exec(initialHash);
if (deep) sessionStorage.setItem("basira-deep", JSON.stringify({ kind: deep[1], id: deep[2] }));

let c = null;            // عميل Supabase بجلسة منفصلة عن جلسة الزوار
let me = { role: null, id: null };
let tab = "chats";
let selected = null;
let rtChannel = null;
let msgChannel = null;
let seenWaiting = new Set();
let leaveGuard = null;   // يمنع مغادرة صفحة التخصيص بتعديلات غير محفوظة

/* ============================ طبقة البيانات ============================ */
const demoState = {
  sessions: [
    { id: "d1", status: "waiting", created_at: new Date(Date.now() - 70e3).toISOString() },
    { id: "d2", status: "active", created_at: new Date(Date.now() - 900e3).toISOString(), claimed_at: new Date().toISOString() },
    { id: "d3", status: "missed", created_at: new Date(Date.now() - 86e6).toISOString() },
  ],
  claims: { d2: "me" },
  messages: { d1: [{ id: 1, sender: "visitor", body: "السلام عليكم، عندي سؤال عن معنى التوحيد" }],
              d2: [{ id: 2, sender: "visitor", body: "هل يمكن أن نتحدث عن مسألة التقمص؟" }, { id: 3, sender: "staff", body: "وعليكم السلام، تفضّل بكل سرور." }] },
  inquiries: [{ id: "i1", body: "لم يتوفر أحد عند طلبي للمحادثة، سؤالي: ما الفرق بين الحكمة والعقل؟", status: "open", created_at: new Date().toISOString() }],
  faq: [{ id: 1, title: "ما الدليل على أن القرآن كلام الله؟", ask_count: 42, status: "featured" }, { id: 2, title: "هل يصح القول بتناسخ الأرواح؟", ask_count: 37, status: "auto" }],
  staff: [{ user_id: "me", role: "admin", notify_email: "admin@example.com", is_available: true }, { user_id: "s2", role: "supervisor", notify_email: "sup1@example.com", is_available: false }],
  books: [{ id: 1, title: "مدارج السالكين", author: "ابن القيم", volume: "1", enabled: true, chunks: 812 }, { id: 2, title: "زاد المعاد", author: "ابن القيم", volume: "3", enabled: true, chunks: 640 }, { id: 3, title: "الصواعق المرسلة", author: "ابن القيم", volume: "1", enabled: false, chunks: 0 }],
};

const api = {
  async sessions() {
    if (DEMO) return { sessions: demoState.sessions, claims: demoState.claims };
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ data: s }, { data: cl }] = await Promise.all([
      c.from("chat_sessions").select("id,status,created_at,claimed_at,closed_at")
        .or(`status.in.(waiting,active),created_at.gte.${since}`).order("created_at", { ascending: false }).limit(80),
      c.from("chat_claims").select("session_id,staff_id"),
    ]);
    return { sessions: s ?? [], claims: Object.fromEntries((cl ?? []).map((x) => [x.session_id, x.staff_id])) };
  },
  async messages(sid) {
    if (DEMO) return demoState.messages[sid] ?? [];
    const { data } = await c.from("chat_messages").select("id,sender,body,created_at").eq("session_id", sid).order("id");
    return data ?? [];
  },
  async send(sid, body) {
    if (DEMO) { const m = { id: Date.now(), sender: "staff", body }; (demoState.messages[sid] ??= []).push(m); return m; }
    const { data, error } = await c.from("chat_messages").insert({ session_id: sid, sender: "staff", body }).select("id,sender,body").single();
    if (error) throw error;
    return data;
  },
  async claim(sid) {
    if (DEMO) { const s = demoState.sessions.find((x) => x.id === sid); if (s.status !== "waiting") return false; s.status = "active"; demoState.claims[sid] = "me"; return true; }
    const { data, error } = await c.rpc("claim_session", { sid });
    if (error) throw error;
    return data;
  },
  async close(sid) {
    if (DEMO) { demoState.sessions.find((x) => x.id === sid).status = "closed"; return; }
    await c.rpc("close_session", { sid });
  },
  async inquiries() {
    if (DEMO) return demoState.inquiries;
    const { data } = await c.from("inquiries").select("id,body,reply,status,created_at,replied_at").order("status").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  },
  async reply(iid, txt) {
    if (DEMO) { Object.assign(demoState.inquiries.find((x) => x.id === iid), { reply: txt, status: "answered" }); return; }
    const { error } = await c.rpc("reply_inquiry", { iid, txt });
    if (error) throw error;
    c.functions.invoke("notify-visitor", { body: { inquiry_id: iid } }).catch(() => {});
  },
  async faq() {
    if (DEMO) return demoState.faq;
    const { data } = await c.from("faq").select("id,title,ask_count,status,updated_at").order("ask_count", { ascending: false }).limit(300);
    return data ?? [];
  },
  async moderate(id, status, title) {
    if (DEMO) return;
    const { error } = await c.rpc("moderate_faq", { p_id: id, p_status: status, p_title: title });
    if (error) throw error;
  },
  async staff(action, extra = {}) {
    if (DEMO) return action === "list" ? { staff: demoState.staff, me: "me" } : { ok: true };
    const { data, error } = await c.functions.invoke("admin-staff", { body: { action, ...extra } });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { /* */ } throw new Error(m); }
    return data;
  },
  async books() {
    if (DEMO) return demoState.books;
    const { data } = await c.rpc("book_stats");
    return data ?? [];
  },
  async deleteFaq(id) {
    if (DEMO) { demoState.faq = demoState.faq.filter((f) => f.id !== id); return; }
    const { error } = await c.rpc("delete_faq", { p_id: id });
    if (error) throw error;
  },
  async setBook(id, enabled) {
    if (DEMO) { demoState.books.find((b) => b.id === id).enabled = enabled; return; }
    const { error } = await c.rpc("set_book_enabled", { p_id: id, p_enabled: enabled });
    if (error) throw error;
  },
  async setAvail(v) {
    if (DEMO) return;
    await c.rpc("set_availability", { avail: v });
  },
};

/* ============================ الدخول ============================ */
async function boot() {
  if (DEMO) {
    me = { role: "admin", id: "me" };
    return startDashboard(true);
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  c = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { storageKey: "basira-staff", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await c.auth.getSession();
  const session = data.session;
  if (session && authType) return setPasswordView();
  if (!session || session.user.is_anonymous) return loginView();
  me.id = session.user.id;
  const { data: st } = await c.rpc("my_staff");
  if (!st?.length) {
    $("#app").innerHTML = "";
    $("#app").append(el("div", { class: "card login" }, el("p", {}, "هذا الحساب ليس من طاقم الإشراف."),
      el("button", { class: "btn ghost", onclick: async () => { await c.auth.signOut(); location.reload(); } }, "خروج")));
    return;
  }
  me.role = st[0].role;
  startDashboard(st[0].is_available);
}

function loginView(msg = "") {
  const app = $("#app");
  app.innerHTML = "";
  const email = el("input", { class: "input", type: "email", dir: "ltr", required: true, id: "le" });
  const pass = el("input", { class: "input", type: "password", dir: "ltr", required: true, id: "lp" });
  const err = el("p", { class: "error" }, msg);
  const btn = el("button", { class: "btn", type: "submit" }, "دخول");
  app.append(el("div", { class: "card login" },
    el("h2", { style: "margin-top:0" }, "دخول الطاقم"),
    el("form", {
      onsubmit: async (e) => {
        e.preventDefault(); btn.disabled = true; err.textContent = "";
        const { error } = await c.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        btn.disabled = false;
        if (error) { err.textContent = "بيانات الدخول غير صحيحة."; return; }
        boot();
      },
    },
      el("div", { class: "field" }, el("label", { for: "le" }, "البريد"), email),
      el("div", { class: "field" }, el("label", { for: "lp" }, "كلمة المرور"), pass),
      err,
      el("div", { class: "row" }, btn,
        el("button", {
          class: "btn ghost", type: "button",
          onclick: async () => {
            if (!email.value.trim()) { err.textContent = "اكتب بريدك أولًا."; return; }
            await c.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
            err.textContent = "إن كان البريد مسجلًا فستصلك رسالة لتعيين كلمة المرور.";
          },
        }, "نسيت كلمة المرور")))));
}

function setPasswordView() {
  const app = $("#app");
  app.innerHTML = "";
  const p1 = el("input", { class: "input", type: "password", minlength: 10, required: true, dir: "ltr", id: "p1" });
  const err = el("p", { class: "error" });
  app.append(el("div", { class: "card login" },
    el("h2", { style: "margin-top:0" }, authType === "invite" ? "مرحبًا بك في فريق الإشراف" : "تعيين كلمة مرور جديدة"),
    el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        const { error } = await c.auth.updateUser({ password: p1.value });
        if (error) { err.textContent = error.message; return; }
        history.replaceState(null, "", location.pathname);
        location.reload();
      },
    }, el("div", { class: "field" }, el("label", { for: "p1" }, "كلمة المرور (10 أحرف على الأقل)"), p1), err,
      el("button", { class: "btn", type: "submit" }, "حفظ"))));
}

/* ============================ اللوحة ============================ */
function startDashboard(avail) {
  $("#logout").classList.remove("hidden");
  $("#logout").onclick = async () => { if (!DEMO) { await api.setAvail(false); await c.auth.signOut(); } location.reload(); };
  const box = $("#avail");
  $("#availWrap").classList.remove("hidden");
  const paint = () => ($("#availTxt").textContent = box.checked ? "متاح لاستقبال المحادثات" : "غير متاح");
  box.checked = Boolean(avail); paint();
  box.onchange = async () => { await api.setAvail(box.checked); paint(); toast(box.checked ? "ستصلك طلبات المحادثة على بريدك" : "لن تصلك طلبات المحادثة"); };

  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});

  const d = JSON.parse(sessionStorage.getItem("basira-deep") || "null");
  sessionStorage.removeItem("basira-deep");
  if (me.role === "admin") tab = "overview";
  if (d?.kind === "inquiry") tab = "inquiries";
  if (d?.kind === "chat") { tab = "chats"; selected = d.id; autoClaim = d.id; }
  history.replaceState(null, "", location.pathname);

  if (!DEMO) {
    rtChannel = c.channel("staff-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, () => tab === "chats" && renderTab(true))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inquiries" }, () => { toast("استفسار مكتوب جديد"); tab === "inquiries" && renderTab(true); })
      .subscribe();
    setInterval(() => tab === "chats" && renderTab(true), 20000);
  }
  renderTab();
}
let autoClaim = null;

function tabs(counts = {}) {
  const defs = [["chats", "المحادثات المباشرة"], ["inquiries", "الاستفسارات المكتوبة"], ["faq", "الأسئلة الشائعة"], ["books", "المصادر"]];
  if (me.role === "admin") {
    defs.unshift(["overview", "نظرة عامة"]);
    defs.push(["staff", "الطاقم"], ["customize", "تخصيص الموقع"], ["ai", "الذكاء الاصطناعي والحدود"]);
  }
  return el("nav", { class: "adm-tabs" }, defs.map(([k, t]) =>
    el("button", { class: `${tab === k ? "on" : ""} ${["customize", "ai", "overview"].includes(k) ? "admin-only" : ""}`, onclick: () => {
      if (leaveGuard && !leaveGuard()) return;
      leaveGuard = null; window.onbeforeunload = null;
      tab = k; selected = null; renderTab();
    } }, t,
      counts[k] ? el("span", { class: "count" }, counts[k]) : null)));
}

async function renderTab(soft = false) {
  const app = $("#app");
  try {
    if (tab === "chats") return await renderChats(app, soft);
    if (tab === "inquiries") return await renderInquiries(app);
    if (tab === "faq") return await renderFaq(app);
    if (tab === "books") return await renderBooks(app);
    if (tab === "staff") return await renderStaff(app);
    const ctx = { c, DEMO, tabs: () => tabs(), toast, onLeave: (fn) => (leaveGuard = fn) };
    if (tab === "overview") return await renderOverview(app, ctx);
    if (tab === "customize") return await renderCustomize(app, ctx);
    if (tab === "ai") return await renderAI(app, ctx);
  } catch (e) {
    console.error(e);
    toast("تعذّر التحميل");
  }
}

/* ---------- المحادثات ---------- */
async function renderChats(app, soft) {
  const { sessions, claims } = await api.sessions();
  const waiting = sessions.filter((s) => s.status === "waiting");
  for (const s of waiting) {
    if (!seenWaiting.has(s.id) && soft) {
      try { new Notification("زائر ينتظر محادثة"); } catch { /* */ }
      beep();
    }
    seenWaiting.add(s.id);
  }
  if (soft && selected && document.activeElement?.closest?.(".panel")) {
    // لا نعيد رسم لوحة المحادثة أثناء الكتابة
    const listHost = $("#sessList");
    if (listHost) { listHost.replaceWith(sessionList(sessions, claims)); return; }
  }
  app.innerHTML = "";
  app.append(tabs({ chats: waiting.length }));
  const panel = el("section", { class: "panel", id: "chatPanel" }, el("p", { class: "muted" }, "اختر محادثة من القائمة."));
  app.append(el("div", { class: "split" }, sessionList(sessions, claims), panel));
  if (selected) openChat(selected, sessions, claims);
}

function sessionList(sessions, claims) {
  const label = { waiting: "بانتظار مشرف", active: "جارية", closed: "منتهية", missed: "تحولت لاستفسار مكتوب" };
  const group = (title, arr) => arr.length ? [el("h4", {}, title), ...arr.map((s) =>
    el("button", { class: `item ${s.status === "waiting" ? "waiting" : ""} ${selected === s.id ? "sel" : ""}`, onclick: () => { selected = s.id; renderTab(); } },
      el("div", {}, el("span", { class: `dot ${s.status}` }), label[s.status],
        claims[s.id] === me.id ? el("span", { class: "tag ok", style: "margin-inline-start:6px" }, "لديك") : null),
      el("div", { class: "meta" }, ago(s.created_at))))] : [];
  return el("div", { class: "list", id: "sessList" },
    group("بانتظار مشرف", sessions.filter((s) => s.status === "waiting")),
    group("جارية", sessions.filter((s) => s.status === "active")),
    group("السابقة (7 أيام)", sessions.filter((s) => ["closed", "missed"].includes(s.status))),
    sessions.length ? null : el("p", { class: "muted" }, "لا توجد محادثات."));
}

async function openChat(sid, sessions, claims) {
  const panel = $("#chatPanel");
  let s = sessions.find((x) => x.id === sid);
  if (!s) { panel.innerHTML = ""; panel.append(el("p", { class: "muted" }, "المحادثة غير موجودة.")); return; }

  if (autoClaim === sid && s.status === "waiting") {
    autoClaim = null;
    const ok = await api.claim(sid);
    if (ok) { s = { ...s, status: "active" }; claims[sid] = me.id; toast("استلمت المحادثة"); }
  } else if (autoClaim === sid) {
    autoClaim = null;
    if (s.status === "missed") toast("انتهت مهلة هذه المحادثة (5 دقائق) وتحولت إلى استفسار مكتوب");
    else if (claims[sid] !== me.id) toast("استلم هذه المحادثة مشرف آخر");
  }

  const mine = claims[sid] === me.id;
  const log = el("div", { class: "chat-log" });
  const draw = (m) => log.append(el("div", { class: `msg ${m.sender === "staff" ? "me" : "them"}` },
    el("span", { class: "who" }, m.sender === "staff" ? "المشرف" : "الزائر"), m.body));
  let lastId = 0;
  const add = (m) => { if (m.id > lastId) { lastId = m.id; draw(m); log.scrollTop = log.scrollHeight; } };
  (await api.messages(sid)).forEach(add);

  const actions = el("div", { class: "row", style: "margin-bottom:10px" },
    el("strong", { style: "flex:1" }, "محادثة مع زائر"),
    s.status === "waiting" ? el("button", { class: "btn sun", onclick: async () => {
      const ok = await api.claim(sid);
      toast(ok ? "استلمت المحادثة" : "استلمها مشرف آخر أو انتهت المهلة");
      renderTab();
    } }, "استلام المحادثة") : null,
    s.status === "active" && (mine || me.role === "admin") ? el("button", { class: "btn ghost", onclick: async () => {
      if (!confirm("إنهاء المحادثة؟")) return;
      await api.close(sid); renderTab();
    } }, "إنهاء المحادثة") : null);

  panel.innerHTML = "";
  panel.append(actions, log);

  if (s.status === "active" && mine) {
    const ta = el("textarea", { class: "textarea", rows: 2, maxlength: 4000, placeholder: "اكتب ردك… (لن يظهر للزائر إلا «المشرف»)" });
    const form = el("form", { class: "composer", style: "margin-top:10px", onsubmit: async (e) => {
      e.preventDefault();
      const body = ta.value.trim(); if (!body) return;
      ta.value = "";
      try { add(await api.send(sid, body)); } catch { toast("تعذّر الإرسال"); ta.value = body; }
    } }, ta, el("button", { class: "btn", type: "submit" }, "إرسال"));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    panel.append(form);
    ta.focus();
  } else if (s.status === "missed") {
    panel.append(el("div", { class: "note" }, "لم تُستلم المحادثة خلال 5 دقائق، فعُرض على الزائر نموذج الاستفسار المكتوب. راجع تبويب «الاستفسارات المكتوبة»."));
  }

  if (!DEMO) {
    if (msgChannel) c.removeChannel(msgChannel);
    msgChannel = c.channel(`adm-${sid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sid}` }, (p) => add(p.new))
      .subscribe();
  }
}

function beep() {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .25);
  } catch { /* */ }
}

/* ---------- الاستفسارات ---------- */
async function renderInquiries(app) {
  const rows = await api.inquiries();
  app.innerHTML = "";
  app.append(tabs({ inquiries: rows.filter((r) => r.status === "open").length }));
  if (!rows.length) { app.append(el("p", { class: "muted" }, "لا توجد استفسارات.")); return; }
  app.append(el("div", { class: "list" }, rows.map((r) => {
    const ta = el("textarea", { class: "textarea", placeholder: "اكتب الرد…" });
    ta.value = r.reply ?? "";
    return el("div", { class: "card", style: "margin:0" },
      el("div", { class: "row" }, el("span", { class: `tag ${r.status === "answered" ? "ok" : ""}` }, r.status === "answered" ? "تم الرد" : "بانتظار الرد"),
        el("span", { class: "small muted" }, fmt(r.created_at))),
      el("p", { style: "white-space:pre-wrap" }, r.body),
      ta,
      el("div", { class: "row", style: "margin-top:8px" }, el("button", { class: "btn", onclick: async (e) => {
        e.target.disabled = true;
        try { await api.reply(r.id, ta.value); toast("أُرسل الرد"); renderTab(); } catch (ex) { toast(ex.message); e.target.disabled = false; }
      } }, r.reply ? "تحديث الرد" : "إرسال الرد")));
  })));
}

/* ---------- الأسئلة الشائعة ---------- */
async function renderFaq(app) {
  const rows = await api.faq();
  app.innerHTML = "";
  app.append(tabs(), el("p", { class: "muted small" },
    "تُضاف الأسئلة هنا تلقائيًا إذا أُجيبت من المصادر ولم تكن خاصة. «مثبّت» يظهر أولًا، و«مخفي» لا يظهر للزوار. يمكنك تعديل صياغة العنوان."));
  app.append(el("table", { class: "grid" },
    el("thead", {}, el("tr", {}, el("th", {}, "السؤال"), el("th", {}, "مرات السؤال"), el("th", {}, "الحالة"), el("th", {}, ""))),
    el("tbody", {}, rows.map((r) => {
      const t = el("input", { class: "input", value: r.title });
      const s = el("select", { class: "input" },
        [["auto", "ظاهر"], ["featured", "مثبّت"], ["pending", "بانتظار الموافقة"], ["hidden", "مخفي"]].map(([v, l]) => el("option", { value: v, selected: r.status === v }, l)));
      return el("tr", { class: r.status === "pending" ? "pending-row" : "" }, el("td", {}, t), el("td", {}, r.ask_count), el("td", {}, s),
        el("td", { class: "row" },
          el("button", { class: "btn ghost sm", onclick: async () => { await api.moderate(r.id, s.value, t.value); toast("حُفظ"); } }, "حفظ"),
          el("button", { class: "btn ghost sm danger", onclick: async () => { if (!confirm("حذف هذا السؤال من القائمة نهائيًا؟")) return; await api.deleteFaq(r.id); renderTab(); } }, "حذف")));
    }))));
}

/* ---------- المصادر ---------- */
async function renderBooks(app) {
  const rows = await api.books();
  app.innerHTML = "";
  app.append(tabs(), el("p", { class: "muted small" }, "تُضاف الكتب بأداة الإدخال (tools/ingest.py) كما في دليل التشغيل. يمكن للمدير إيقاف أي كتاب فلا يُستخدم في الإجابات ولا يظهر في قائمة المصادر."));
  app.append(el("table", { class: "grid" },
    el("thead", {}, el("tr", {}, el("th", {}, "مفعّل"), el("th", {}, "المؤلف"), el("th", {}, "الكتاب"), el("th", {}, "الجزء"), el("th", {}, "عدد المقاطع"))),
    el("tbody", {}, rows.map((b) => {
      const box = el("input", { type: "checkbox" });
      box.checked = b.enabled !== false;
      box.disabled = me.role !== "admin";
      box.addEventListener("change", async () => { try { await api.setBook(b.id, box.checked); toast(box.checked ? "صار الكتاب مصدرًا للإجابات" : "لن يُستخدم الكتاب في الإجابات"); } catch (e) { toast(e.message); box.checked = !box.checked; } });
      return el("tr", { class: b.enabled === false ? "off-row" : "" },
        el("td", {}, el("label", { class: "tg" }, box, el("span", { class: "tg-track" }, el("span", { class: "tg-knob" })))),
        el("td", {}, b.author), el("td", {}, b.title), el("td", {}, b.volume ?? "—"),
        el("td", {}, b.chunks > 0 ? Number(b.chunks).toLocaleString("ar") : el("span", { class: "error" }, "0 — لم يُفهرس")));
    }))));
}

/* ---------- الطاقم ---------- */
async function renderStaff(app) {
  const { staff } = await api.staff("list");
  app.innerHTML = "";
  app.append(tabs());
  const email = el("input", { class: "input", type: "email", dir: "ltr", placeholder: "بريد المشرف", required: true });
  const role = el("select", { class: "input", style: "max-width:160px" }, el("option", { value: "supervisor" }, "مشرف"), el("option", { value: "admin" }, "مدير"));
  app.append(el("div", { class: "card", style: "margin-bottom:14px" },
    el("h3", { style: "margin-top:0" }, "إضافة عضو"),
    el("p", { class: "small muted" }, "ستصل إلى البريد دعوة لتعيين كلمة المرور. هذا البريد هو الذي تصله تنبيهات المحادثات، ولا يظهر لأي زائر."),
    el("form", { class: "row", onsubmit: async (e) => {
      e.preventDefault();
      try { await api.staff("invite", { email: email.value, role: role.value }); toast("أُرسلت الدعوة"); renderTab(); } catch (ex) { toast(ex.message); }
    } }, email, role, el("button", { class: "btn", type: "submit" }, "دعوة"))));

  app.append(el("table", { class: "grid" },
    el("thead", {}, el("tr", {}, el("th", {}, "بريد التنبيهات"), el("th", {}, "الدور"), el("th", {}, "متاح"), el("th", {}, ""))),
    el("tbody", {}, staff.map((s) => {
      const self = s.user_id === me.id;
      return el("tr", {},
        el("td", { dir: "ltr", style: "text-align:right" }, s.notify_email, self ? " (أنت)" : ""),
        el("td", {}, self ? (s.role === "admin" ? "مدير" : "مشرف") :
          el("select", { class: "input", onchange: async (e) => { await api.staff("set_role", { user_id: s.user_id, role: e.target.value }); toast("حُفظ"); } },
            el("option", { value: "supervisor", selected: s.role === "supervisor" }, "مشرف"),
            el("option", { value: "admin", selected: s.role === "admin" }, "مدير"))),
        el("td", {}, s.is_available ? "✓" : "—"),
        el("td", {}, self ? null : el("button", { class: "btn ghost", onclick: async () => {
          if (!confirm("إزالة هذا العضو من الطاقم؟")) return;
          await api.staff("remove", { user_id: s.user_id }); renderTab();
        } }, "إزالة")));
    }))));
}

boot();
