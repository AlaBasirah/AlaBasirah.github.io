// «اختصر الإجابة» و«بسّط الإجابة»: إعادة صياغة الإجابة الموثّقة نفسها، دون أي معلومة جديدة
import { admin, claudeTool, cors, json, requireUser, serverSettings } from "../_shared/util.ts";

const MODES = {
  short: {
    col: "short_answer",
    task: "اختصر الإجابة التالية في ثلاث جمل على الأكثر، تحفظ أهم ما فيها.",
  },
  simple: {
    col: "simple_answer",
    task: "أعد كتابة الإجابة التالية بلغة عربية سهلة جدًا يفهمها شخص لم يقرأ كتب العلماء قط: جمل قصيرة، وكلمات مألوفة، واشرح كل مصطلح شرعي أو قديم بكلمات بسيطة بين قوسين.",
  },
} as const;

const SYSTEM = `أنت تعيد صياغة إجابة موثّقة لزائر موقع «بصيرة». قواعد ملزمة:
1. لا تضف أي معلومة أو حكم أو دليل أو آية أو حديث غير موجود في الإجابة الأصلية. يجوز فقط شرح معنى الكلمة الصعبة بمعناها اللغوي العام.
2. لا تحذف ما يغيّر المعنى، ولا تقوّل الإجابة ما لم تقله.
3. أبقِ أرقام الإحالات بصيغتها [1] [2] بعد الجمل المستندة إليها، ولا تخترع رقمًا غير موجود في الأصل.
4. أسلوب محترم ودود، بلا تجريح لأحد.
5. ابدأ بالمضمون مباشرة: لا تحية ولا ختام ولا عبارات مثل «أرجو أن تكون الصورة واضحة»، ولا تخاطب السائل بما يفترض جنسه أو خلفيته (مثل «أخي» أو «أختي»).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "simple" ? "simple" : body.mode === "short" ? "short" : null;
  const kind = body.kind === "faq" ? "faq" : "ask";
  if (!mode || !body.id) return json({ error: "bad request" }, 400);
  const m = MODES[mode];
  const db = admin();

  let q = db.from(kind === "faq" ? "faq" : "asks").select(`answer, ${m.col}`).eq("id", body.id);
  if (kind === "ask") q = q.eq("user_id", user.id);
  else q = q.in("status", ["auto", "featured"]);
  const { data: row } = await q.maybeSingle();
  if (!row?.answer) return json({ error: "not found" }, 404);
  const cached = (row as Record<string, string | null>)[m.col];
  if (cached) return json({ text: cached });

  // حد استخدام بسيط حتى لا يُستنزف الرصيد المجاني
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("asks").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) > 60) return json({ error: "حاول بعد قليل" }, 429);

  try {
    const cfg = await serverSettings();
    const out = await claudeTool<{ text: string }>({
      system: SYSTEM,
      user: `${m.task}\n\nالإجابة الأصلية:\n${row.answer}`,
      toolName: "rewrite",
      toolDescription: "الإجابة بعد إعادة الصياغة",
      schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      maxTokens: 1200,
      model: cfg.model?.trim() || undefined,
      provider: cfg.provider || undefined,
    });
    const allowed = new Set([...String(row.answer).matchAll(/\[(\d+)\]/g)].map((x) => x[1]));
    const used = [...String(out.text ?? "").matchAll(/\[(\d+)\]/g)].map((x) => x[1]);
    if (!out.text?.trim() || used.some((n) => !allowed.has(n))) throw new Error("bad rewrite");
    await db.from(kind === "faq" ? "faq" : "asks").update({ [m.col]: out.text.trim() }).eq("id", body.id);
    return json({ text: out.text.trim() });
  } catch (e) {
    console.error(e);
    const busy = String(e).includes("quota");
    return json({ error: busy ? "الموقع مزدحم الآن، حاول بعد دقيقة." : "تعذّرت إعادة الصياغة الآن." }, busy ? 429 : 500);
  }
});
