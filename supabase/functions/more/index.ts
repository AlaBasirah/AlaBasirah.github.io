// «استزد من الإجابة»: يبحث عن مقاطع جديدة لم تُعرض بعد، ويكتب إضافة تتناول جوانب أخرى من السؤال
import { admin, ANSWER_SYSTEM, claudeTool, cors, json, requireUser, serverSettings, TERMS_SYSTEM, tidy } from "../_shared/util.ts";

const MORE_TERMS = `${TERMS_SYSTEM}
- المطلوب هنا عبارات تفتح جوانب أخرى من السؤال لم تتناولها الإجابة السابقة: أدلة أخرى، أمثلة، أقوال، ردود على شبهات، تفصيلات.`;

const MORE_SYSTEM = `${ANSWER_SYSTEM}

مهمة خاصة: الزائر قرأ الإجابة السابقة وطلب المزيد. اكتب إضافة جديدة تكمّلها:
- تناول جوانب ومعاني جديدة من المقاطع لم تذكرها الإجابة السابقة، ولا تكرر ما فيها.
- لا تبدأ بعبارات مثل «بالإضافة إلى ما سبق»؛ ابدأ بالمعنى الجديد مباشرة.
- إن لم تجد في المقاطع شيئًا جديدًا ينفع الزائر فاجعل mode = "none".`;

type Answer = { mode: "direct" | "related" | "none"; answer: string; cited: number[]; quotes: { n: number; text: string }[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, 1000);
  const previous = String(body.previous ?? "").slice(0, 6000);
  const exclude = new Set((Array.isArray(body.exclude) ? body.exclude : []).map(Number).filter(Number.isFinite));
  const startN = Math.max(1, Math.min(Number(body.start_n) || 1, 500));
  if (question.length < 3) return json({ error: "bad request" }, 400);

  const db = admin();
  const cfg = await serverSettings();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("asks").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= (cfg.ask_limit ?? 30) * 2) return json({ error: "وصلت إلى الحد المسموح في الساعة. حاول بعد قليل." }, 429);

  const provider = cfg.provider || undefined;
  const model = cfg.model?.trim() || undefined;

  try {
    const { terms } = await claudeTool<{ terms: string[] }>({
      system: MORE_TERMS,
      user: `سؤال الزائر:\n${question}\n\nالإجابة التي قرأها:\n${previous}`,
      toolName: "search_terms",
      toolDescription: "عبارات البحث في الكتب",
      schema: { type: "object", properties: { terms: { type: "array", items: { type: "string" } } }, required: ["terms"] },
      maxTokens: 300,
      model: provider === "claude" ? model : (cfg.terms_model || "gemini-3.5-flash-lite"),
      provider,
    });

    const { data: hits, error } = await db.rpc("search_chunks", { terms: (terms?.length ? terms : [question]).slice(0, 10), k: 30 });
    if (error) throw error;
    const passages = ((hits ?? []) as Array<{ id: number; book_title: string; author: string; volume: string | null; page: number | null; content: string }>)
      .filter((p) => !exclude.has(p.id)).slice(0, 12);
    if (!passages.length) return json({ found: false });

    const label = (i: number) => startN + i;
    const block = passages.map((p, i) =>
      `[${label(i)}] (${p.author} — ${p.book_title}${p.volume ? " ج" + p.volume : ""}${p.page ? " ص" + p.page : ""})\n${p.content}`).join("\n\n");

    const result = await claudeTool<Answer>({
      system: MORE_SYSTEM,
      user: `المقاطع:\n${block}\n\n———\nسؤال الزائر:\n${question}\n\n———\nالإجابة السابقة (لا تكررها):\n${previous}`,
      toolName: "answer",
      toolDescription: "إضافة جديدة مقيدة بالمقاطع",
      schema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["direct", "related", "none"] },
          answer: { type: "string" },
          cited: { type: "array", items: { type: "integer" } },
          quotes: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, text: { type: "string" } }, required: ["n", "text"] } },
        },
        required: ["mode", "answer", "cited", "quotes"],
      },
      maxTokens: 3000,
      model: provider === "claude" ? model : (cfg.answer_model || model || "gemini-3.6-flash"),
      provider,
    });

    const answer = tidy(result.answer ?? "");
    const valid = new Map(passages.map((p, i) => [label(i), p]));
    const used = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const cited = [...new Set([...(result.cited ?? []), ...used])].filter((n) => valid.has(n)).sort((a, b) => a - b);
    if (result.mode === "none" || !answer || !cited.length || used.some((n) => !valid.has(n))) return json({ found: false });

    const quoteOf = new Map((result.quotes ?? []).map((q) => [q.n, String(q.text ?? "").trim()]));
    const citations = cited.map((n) => {
      const p = valid.get(n)!;
      return { n, cid: p.id, book: p.book_title, author: p.author, volume: p.volume, page: p.page, quote: quoteOf.get(n) || null, excerpt: p.content };
    });
    return json({ found: true, answer, citations });
  } catch (e) {
    console.error(e);
    const busy = String(e).includes("quota");
    return json({ error: busy ? "الموقع مزدحم الآن، حاول بعد دقيقة." : "تعذّر جلب المزيد الآن." }, busy ? 429 : 500);
  }
});
