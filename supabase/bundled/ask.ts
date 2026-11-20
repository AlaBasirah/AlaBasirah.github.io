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

// ===================== ask =====================
// دالة الإجابة: تبحث في المصادر المعتمدة فقط، ثم تطلب من الذكاء الاصطناعي الإجابة من المقاطع المسترجعة حصرًا


const DEFAULT_NOT_FOUND =
  "لم أجد في المصادر المعتمدة لدينا نصًّا يجيب عن سؤالك إجابةً موثّقة، ولا أستطيع أن أجيب من خارجها. " +
  "يمكنك إعادة صياغة السؤال بكلمات أخرى، أو الضغط على زر «تحدّث مع إنسان» ليتواصل معك أحد المشرفين.";

const TERMS_SYSTEM = `أنت مساعد بحث في كتب التراث الإسلامي العربية (كتب ابن تيمية وابن القيم ونحوها).
مهمتك الوحيدة: تحويل سؤال الزائر إلى كلمات وعبارات بحث قصيرة تُستخدم للبحث النصي في هذه الكتب.
- اكتب 4 إلى 10 عبارات، كل عبارة كلمة أو كلمتان أو ثلاث على الأكثر.
- استعمل المصطلحات التي يستعملها العلماء المتقدمون في كتبهم (مثل: التناسخ، الحلول، الاتحاد، الباطنية، الإمامة، التأويل، القرامطة، الإسماعيلية، النبوة، الشفاعة…) إضافة إلى ألفاظ السائل.
- اكتب صيغًا بديلة للكلمة نفسها عند الحاجة (مفرد/جمع، مصدر/فعل).
- لا تجب عن السؤال.`;

const ANSWER_SYSTEM = `أنت «بصيرة»: محاور علمي هادئ ولطيف، يجيب زوّار الموقع (وأكثرهم من أبناء الطائفة الدرزية) عن أسئلتهم في الدين.

قواعد ملزمة لا يجوز مخالفتها بأي حال:
1. لا تجب إلا من المقاطع المرقّمة المرفقة تحت عنوان «المقاطع». هي مصدرك الوحيد. لا تستعمل معلوماتك العامة ولا أي مصدر آخر، ولا تضف آية أو حديثًا أو قولًا أو معلومة غير موجودة نصًّا في المقاطع.
2. كل جملة فيها معلومة يجب أن تنتهي بإحالة إلى رقم المقطع بهذا الشكل: [1] أو [2][5].
3. إن لم تكن في المقاطع إجابة واضحة عن السؤال نفسه، فاجعل found = false ولا تكتب إجابة من عندك. الأمانة مقدَّمة على الإجابة.
4. إن أجابت المقاطع عن جزء من السؤال فقط، فأجب عن هذا الجزء وصرّح بأن باقي السؤال لم تجد له نصًّا في المصادر.
5. انقل المعنى بأمانة دون تحريف أو اقتطاع مخلّ للسياق. يجوز الاقتباس الحرفي القصير بين علامتي «».
6. الأسلوب: عربي فصيح سهل، محترم ودود، بلا تجريح للسائل ولا لطائفته ولا لعائلته. خاطب العقل بالدليل، ولا تفترض شيئًا عن خلفية السائل.
7. لا تُصدر فتوى في نازلة شخصية لم تنص عليها المقاطع، ولا تحكم على شخص بعينه.
8. لا تذكر أنك نموذج ذكاء اصطناعي ولا أسماء أي جهات أو أشخاص يديرون الموقع.
9. إن كان السؤال خارج الدين تمامًا أو طلبًا مسيئًا، فاجعل found = false.

حقول إضافية:
- is_private: اجعلها true إذا تضمن السؤال معلومات شخصية أو عائلية أو اسمًا أو مكانًا محددًا أو ظرفًا خاصًا بالسائل، أو كان مما لا يحسن عرضه للعامة. وإلا false.
- faq_title: صياغة عامة مختصرة للسؤال (أقل من 90 حرفًا) خالية من أي تفاصيل شخصية، تصلح لقائمة «أكثر الأسئلة».`;

type Terms = { terms: string[] };
type Answer = { found: boolean; answer: string; cited: number[]; is_private: boolean; faq_title: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let question = "";
  try {
    question = String((await req.json()).question ?? "").trim();
  } catch { /* ignore */ }
  if (question.length < 3) return json({ error: "السؤال قصير جدًا" }, 400);
  if (question.length > 1000) return json({ error: "السؤال طويل جدًا، اختصره من فضلك" }, 400);

  const db = admin();
  const cfg = await serverSettings();
  const MAX_PER_HOUR = cfg.ask_limit ?? Number(Deno.env.get("ASK_LIMIT_PER_HOUR") ?? "30");
  const NOT_FOUND = cfg.not_found_message?.trim() || DEFAULT_NOT_FOUND;
  const model = cfg.model?.trim() || undefined;
  const provider = cfg.provider || undefined;
  const system = cfg.extra_instructions?.trim()
    ? `${ANSWER_SYSTEM}\n\nتعليمات إضافية من إدارة الموقع (لا تُلغي القواعد الملزمة أعلاه):\n${cfg.extra_instructions.trim()}`
    : ANSWER_SYSTEM;

  // حد الاستخدام لكل زائر
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("asks").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return json({ error: "وصلت إلى الحد المسموح من الأسئلة في الساعة. حاول بعد قليل." }, 429);
  }

  try {
    // 1) استخراج عبارات البحث
    const { terms } = await claudeTool<Terms>({
      system: TERMS_SYSTEM,
      user: `سؤال الزائر:\n${question}`,
      toolName: "search_terms",
      toolDescription: "عبارات البحث في الكتب",
      schema: {
        type: "object",
        properties: { terms: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 } },
        required: ["terms"],
      },
      maxTokens: 300,
      model,
      provider,
    });

    // 2) البحث في المصادر المعتمدة فقط
    const { data: hits, error } = await db.rpc("search_chunks", {
      terms: [question, ...terms].slice(0, 14),
      k: Math.min(Math.max(cfg.top_k ?? 12, 4), 30),
    });
    if (error) throw error;

    const passages = (hits ?? []) as Array<{
      id: number; book_title: string; author: string; volume: string | null; page: number | null; content: string;
    }>;

    let result: Answer = { found: false, answer: NOT_FOUND, cited: [], is_private: true, faq_title: "" };

    if (passages.length) {
      const block = passages.map((p, i) =>
        `[${i + 1}] (${p.author} — ${p.book_title}${p.volume ? " ج" + p.volume : ""}${p.page ? " ص" + p.page : ""})\n${p.content}`
      ).join("\n\n");

      result = await claudeTool<Answer>({
        system,
        model,
        provider,
        user: `المقاطع:\n${block}\n\n———\nسؤال الزائر:\n${question}`,
        toolName: "answer",
        toolDescription: "الإجابة المقيدة بالمقاطع",
        schema: {
          type: "object",
          properties: {
            found: { type: "boolean" },
            answer: { type: "string", description: "نص الإجابة مع الإحالات [n]. اتركه فارغًا إن كانت found=false" },
            cited: { type: "array", items: { type: "integer" }, description: "أرقام المقاطع المستشهد بها" },
            is_private: { type: "boolean" },
            faq_title: { type: "string" },
          },
          required: ["found", "answer", "cited", "is_private", "faq_title"],
        },
        maxTokens: 2500,
      });
    }

    // 3) تحقق صارم: لا إجابة بلا إحالات صحيحة إلى المقاطع
    const valid = new Set(passages.map((_, i) => i + 1));
    const usedInText = [...(result.answer ?? "").matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const cited = [...new Set([...(result.cited ?? []), ...usedInText])].filter((n) => valid.has(n)).sort((a, b) => a - b);
    const badRefs = usedInText.some((n) => !valid.has(n));

    if (!result.found || !cited.length || badRefs || !(result.answer ?? "").trim()) {
      result = { found: false, answer: NOT_FOUND, cited: [], is_private: true, faq_title: "" };
    }

    const citations = result.found
      ? cited.map((n) => {
          const p = passages[n - 1];
          return { n, book: p.book_title, author: p.author, volume: p.volume, page: p.page, excerpt: p.content };
        })
      : [];

    // 4) الحفظ والأسئلة الشائعة
    let faq_id: number | null = null;
    if (result.found && !result.is_private && result.faq_title?.trim()) {
      const { data } = await db.rpc("bump_faq", {
        p_title: result.faq_title.trim().slice(0, 120),
        p_answer: result.answer,
        p_citations: citations,
      });
      faq_id = (data as number) ?? null;
    }

    const { data: saved } = await db.from("asks").insert({
      user_id: user.id,
      question,
      answer: result.answer,
      citations,
      found: result.found,
      is_private: result.is_private,
      faq_id,
    }).select("id, created_at").single();

    return json({ id: saved?.id, found: result.found, answer: result.answer, citations });
  } catch (e) {
    console.error(e);
    const busy = String(e).includes("quota");
    return json({ error: busy ? "الموقع مزدحم الآن، حاول بعد دقيقة من فضلك." : "تعذّر إعداد الإجابة الآن. حاول مرة أخرى بعد قليل." }, busy ? 429 : 500);
  }
});
