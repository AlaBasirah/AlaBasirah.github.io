// أدوات مشتركة لدوال الخادم (Supabase Edge Functions — Deno)
import { createClient, SupabaseClient, User } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "*";

export const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** المفتاح السري للخادم: يدعم المفاتيح القديمة (service_role) والجديدة (sb_secret_...) */
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] as string;
  } catch {
    return "";
  }
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false },
  });
}

/** يتحقق من هوية مستدعي الدالة (زائر مجهول أو مسجل أو مشرف) */
export async function requireUser(req: Request): Promise<User | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
}

/**
 * إرسال بريد عبر Resend. الرسالة لا تحتوي أي محتوى من الزائر ولا أي معلومات عنه:
 * فقط تنبيه عام ورابط آمن، ويُرسل لكل مشرف بريد مستقل (لا نسخ مكشوفة).
 */
export async function sendMail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM") ?? "Basira <noreply@example.com>";
  if (!key) {
    console.warn("RESEND_API_KEY not set; skipping email");
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) console.error("mail failed", r.status, await r.text());
}

export function mailTemplate(title: string, line: string, link: string, cta: string) {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#FFF8EC;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #F1E3C8">
    <div style="background:linear-gradient(135deg,#14B8A6,#0B4F6C);padding:22px;color:#fff;font-size:20px;font-weight:bold">${title}</div>
    <div style="padding:24px;color:#1E2B33;font-size:16px;line-height:1.9">
      <p style="margin:0 0 18px">${line}</p>
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#FFC24B,#FF7E5F);color:#3a1d00;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold">${cta}</a>
      <p style="margin:22px 0 0;font-size:13px;color:#6b7a80">لا تحتوي هذه الرسالة أي معلومات عن الزائر أو نص سؤاله. الدخول يتطلب تسجيل دخولك في لوحة الإشراف.</p>
    </div>
  </div></body></html>`;
}

type AIOpts = {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
  provider?: string;
};

/**
 * استدعاء الذكاء الاصطناعي مع إلزامه بإخراج منظّم (JSON).
 * المزوّد الافتراضي Gemini (له حصة مجانية)، ويمكن التحويل إلى Claude من لوحة التحكم.
 */
export async function claudeTool<T>(opts: AIOpts): Promise<T> {
  const provider = (opts.provider || Deno.env.get("AI_PROVIDER") || "gemini").toLowerCase();
  return provider === "claude" ? callClaude<T>(opts) : callGemini<T>(opts);
}

async function callClaude<T>(opts: AIOpts): Promise<T> {
  const model = opts.model?.startsWith("claude") ? opts.model : (Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: 0,
      system: opts.system,
      tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.schema }],
      tool_choice: { type: "tool", name: opts.toolName },
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const block = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!block) throw new Error("no structured output");
  return block.input as T;
}

/** يحوّل مخطط JSON Schema إلى الصيغة التي يقبلها Gemini */
function toGeminiSchema(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type") out.type = String(v).toUpperCase();
    else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as Record<string, Record<string, unknown>>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    else if (k === "items") out.items = toGeminiSchema(v as Record<string, unknown>);
    else if (["required", "description", "enum"].includes(k)) out[k] = v;
    else if (k === "minItems" || k === "maxItems") out[k] = String(v);
  }
  return out;
}

const GEMINI_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"];

/**
 * يجرب النموذج المختار، فإن كان مزدحمًا أو بطيئًا انتقل تلقائيًا إلى نموذج مجاني آخر.
 * لكل محاولة حد زمني حتى لا ينتظر الزائر بلا نهاية.
 */
async function callGemini<T>(opts: AIOpts): Promise<T> {
  const first = opts.model && !opts.model.startsWith("claude") ? opts.model : (Deno.env.get("GEMINI_MODEL") || GEMINI_FALLBACKS[0]);
  const models = [first, ...GEMINI_FALLBACKS.filter((m) => m !== first)].slice(0, 3);
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      return await geminiOnce<T>(opts, model, true);
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      if (/Gemini API 400/.test(msg) && /thinking/i.test(msg)) {
        try { return await geminiOnce<T>(opts, model, false); } catch (e2) { lastErr = e2; }
        continue;
      }
      const transient = /Gemini API (429|500|502|503|504)|quota|fetch failed|timed out|TimeoutError|aborted|no structured output|JSON/i.test(msg);
      console.warn(`gemini ${model} failed: ${msg.slice(0, 200)}`);
      if (!transient) throw e;
    }
  }
  throw new Error(`Gemini quota exceeded or unavailable: ${String(lastErr).slice(0, 300)}`);
}

async function geminiOnce<T>(opts: AIOpts, model: string, lowThinking: boolean): Promise<T> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    maxOutputTokens: Math.max(opts.maxTokens ?? 2000, 1024) * 2,
    responseMimeType: "application/json",
    responseSchema: toGeminiSchema(opts.schema),
  };
  if (lowThinking) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    signal: AbortSignal.timeout(Number(Deno.env.get("AI_TIMEOUT_MS") ?? "20000")),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig,
    }),
  });
  if (!r.ok) throw new Error(`Gemini API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    .map((p: { text: string }) => p.text).join("");
  if (!text) throw new Error(`no structured output (finish: ${data.candidates?.[0]?.finishReason ?? "?"})`);
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
}

/** إعدادات الخادم التي يضبطها المدير من لوحة التحكم */
export type ServerSettings = {
  provider?: string;
  model?: string;
  answer_model?: string;
  terms_model?: string;
  extra_instructions?: string;
  not_found_message?: string;
  top_k?: number;
  ask_limit?: number;
  human_limit?: number;
  wait_seconds?: number;
  faq_auto_publish?: boolean;
  human_chat?: boolean;
};
export async function serverSettings(): Promise<ServerSettings> {
  const { data } = await admin().from("server_settings").select("data").eq("id", 1).maybeSingle();
  return (data?.data ?? {}) as ServerSettings;
}

// ===================== notify-visitor =====================
// تنبيه الزائر بالبريد عند الرد على استفساره (فقط إن كان له حساب ببريد). لا يُذكر أي شيء عن المشرف.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = admin();
  const { data: me } = await db.from("staff").select("role").eq("user_id", user.id).maybeSingle();
  if (!me) return json({ error: "forbidden" }, 403);

  const { inquiry_id } = await req.json().catch(() => ({}));
  const { data: inq } = await db.from("inquiries").select("visitor_id, status").eq("id", inquiry_id).maybeSingle();
  if (!inq || inq.status !== "answered") return json({ ok: false });

  const { data: v } = await db.auth.admin.getUserById(inq.visitor_id);
  const email = v?.user?.email;
  if (!email || v.user.is_anonymous) return json({ ok: true, emailed: false });

  await sendMail(email, "وصلك رد على استفسارك", mailTemplate(
    "وصلك رد على استفسارك",
    "قام أحد المشرفين بالرد على استفسارك في موقع بصيرة. يمكنك قراءة الرد من صفحة «أسئلتي».",
    `${siteUrl()}/`,
    "قراءة الرد",
  ));
  return json({ ok: true, emailed: true });
});
