// دالة الإجابة: تبحث في المصادر المعتمدة فقط، ثم تطلب من الذكاء الاصطناعي الإجابة من المقاطع المسترجعة حصرًا
import { admin, claudeTool, cors, json, requireUser, serverSettings } from "../_shared/util.ts";


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
6. الأسلوب: عربي فصيح سهل، محترم ودود، بلا تجريح للسائل ولا لطائفته ولا لعائلته. خاطب العقل بالدليل، ولا تفترض شيئًا عن خلفية السائل ولا جنسه، فلا تقل «أخي» أو «أختي». ابدأ بالجواب مباشرة بلا تحية ولا ختام.
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
