// دالة الإجابة: تبحث في المصادر المعتمدة فقط، ثم تطلب من الذكاء الاصطناعي الإجابة من المقاطع المسترجعة حصرًا
import { admin, ANSWER_SYSTEM, claudeTool, cors, json, requireUser, serverSettings, TERMS_SYSTEM, tidy } from "../_shared/util.ts";


const DEFAULT_NOT_FOUND =
  "لم أجد في الكتب المعتمدة في الموقع كلامًا يتناول هذا السؤال. جرّب صياغته بكلمات أخرى، " +
  "أو اضغط «تحدّث مع إنسان» ليجيبك أحد المشرفين.";

type Terms = { terms: string[] };
type Answer = {
  mode: "direct" | "related" | "none";
  answer: string;
  cited: number[];
  quotes: { n: number; text: string }[];
  is_private: boolean;
  faq_title: string;
};

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
      model: provider === "claude" ? model : (cfg.terms_model || "gemini-3.5-flash-lite"),
      provider,
    });

    // 2) البحث في المصادر المعتمدة فقط
    const { data: hits, error } = await db.rpc("search_chunks", {
      terms: (terms?.length ? terms : [question]).slice(0, 10),
      k: Math.min(Math.max(cfg.top_k ?? 16, 4), 30),
    });
    if (error) throw error;

    const passages = (hits ?? []) as Array<{
      id: number; book_title: string; author: string; volume: string | null; page: number | null; content: string;
    }>;

    const EMPTY: Answer = { mode: "none", answer: "", cited: [], quotes: [], is_private: true, faq_title: "" };
    let result: Answer = EMPTY;

    if (passages.length) {
      const block = passages.map((p, i) =>
        `[${i + 1}] (${p.author} — ${p.book_title}${p.volume ? " ج" + p.volume : ""}${p.page ? " ص" + p.page : ""})\n${p.content}`
      ).join("\n\n");

      result = await claudeTool<Answer>({
        system,
        model: provider === "claude" ? model : (cfg.answer_model || model || "gemini-3.6-flash"),
        provider,
        user: `المقاطع:\n${block}\n\n———\nسؤال الزائر:\n${question}`,
        toolName: "answer",
        toolDescription: "الإجابة المقيدة بالمقاطع",
        schema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["direct", "related", "none"] },
            answer: { type: "string", description: "نص الإجابة مع الإحالات [n]. فارغ إن كانت mode=none" },
            cited: { type: "array", items: { type: "integer" }, description: "أرقام المقاطع المستشهد بها" },
            quotes: {
              type: "array",
              items: { type: "object", properties: { n: { type: "integer" }, text: { type: "string" } }, required: ["n", "text"] },
            },
            is_private: { type: "boolean" },
            faq_title: { type: "string" },
          },
          required: ["mode", "answer", "cited", "quotes", "is_private", "faq_title"],
        },
        maxTokens: 3000,
      });
      result.answer = tidy(result.answer ?? "");
    }

    // 3) تحقق صارم: لا إجابة بلا إحالات صحيحة إلى المقاطع
    const valid = new Set(passages.map((_, i) => i + 1));
    const usedInText = [...(result.answer ?? "").matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const cited = [...new Set([...(result.cited ?? []), ...usedInText])].filter((n) => valid.has(n)).sort((a, b) => a - b);
    const badRefs = usedInText.some((n) => !valid.has(n));

    const found = result.mode !== "none" && cited.length > 0 && !badRefs && !!result.answer.trim();
    if (!found) result = { ...EMPTY, answer: NOT_FOUND };
    const related = found && result.mode === "related";

    const quoteOf = new Map((result.quotes ?? []).map((q) => [q.n, String(q.text ?? "").trim()]));
    const citations = found
      ? cited.map((n) => {
          const p = passages[n - 1];
          return {
            n, book: p.book_title, author: p.author, volume: p.volume, page: p.page,
            cid: p.id,
            quote: quoteOf.get(n) || null,
            excerpt: p.content,
          };
        })
      : [];

    // 4) الحفظ والأسئلة الشائعة
    let faq_id: number | null = null;
    if (found && !related && !result.is_private && result.faq_title?.trim()) {
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
      found,
      is_private: result.is_private,
      faq_id,
    }).select("id, created_at").single();

    return json({ id: saved?.id, found, related, answer: result.answer, citations });
  } catch (e) {
    console.error(e);
    const busy = String(e).includes("quota");
    return json({ error: busy ? "الموقع مزدحم الآن، حاول بعد دقيقة من فضلك." : "تعذّر إعداد الإجابة الآن. حاول مرة أخرى بعد قليل." }, busy ? 429 : 500);
  }
});
