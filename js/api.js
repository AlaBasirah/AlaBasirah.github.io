// طبقة الاتصال بالخادم، مع وضع معاينة يعمل دون خادم
import { CONFIG } from "./config.js";

export const DEMO = !CONFIG.SUPABASE_URL;
let sb = null;

export async function client() {
  if (DEMO) return null;
  if (!sb) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return sb;
}

/** كل زائر يحصل على جلسة مجهولة تلقائيًا (بلا تسجيل) لحفظ أسئلته في متصفحه */
export async function ensureSession() {
  const c = await client();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  if (data.session) return data.session;
  const { data: d, error } = await c.auth.signInAnonymously();
  if (error) throw error;
  return d.session;
}

export async function currentUser() {
  const c = await client();
  if (!c) return null;
  const { data } = await c.auth.getUser();
  return data.user ?? null;
}

export async function fn(name, body = {}) {
  await ensureSession();
  const c = await client();
  const { data, error } = await c.functions.invoke(name, { body });
  if (error) {
    let msg = "حدث خطأ غير متوقع، حاول مرة أخرى.";
    try {
      const j = await error.context.json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

/* ------------------------- بيانات وضع المعاينة ------------------------- */
const demoCites = [
  { n: 1, book: "مثال: درء تعارض العقل والنقل", author: "ابن تيمية", volume: "1", page: 12,
    excerpt: "هذا نص تجريبي يوضح كيف يظهر المقطع المقتبس من الكتاب، مع اسم الكتاب والجزء والصفحة، حتى يتحقق الزائر من المصدر بنفسه." },
  { n: 2, book: "مثال: مفتاح دار السعادة", author: "ابن القيم", volume: null, page: 204,
    excerpt: "نص تجريبي ثانٍ. في الموقع الحقيقي تظهر هنا العبارة كما وردت في الكتاب المعتمد." },
];

export const demo = {
  faq: [
    { id: 1, title: "ما الدليل على أن القرآن كلام الله؟", ask_count: 42, status: "featured" },
    { id: 2, title: "هل يصح القول بتناسخ الأرواح؟", ask_count: 37, status: "auto" },
    { id: 3, title: "ما معنى التوحيد عند أهل السنة؟", ask_count: 31, status: "auto" },
    { id: 4, title: "لماذا كان محمد ﷺ خاتم الأنبياء؟", ask_count: 26, status: "auto" },
    { id: 5, title: "ما حكم التأويل الباطني للنصوص؟", ask_count: 19, status: "auto" },
    { id: 6, title: "هل العقل يعارض النقل الصحيح؟", ask_count: 17, status: "auto" },
    { id: 7, title: "ما الفرق بين الإسلام والإيمان والإحسان؟", ask_count: 12, status: "auto" },
    { id: 8, title: "كيف تكون الصلاة والعبادة لله وحده؟", ask_count: 9, status: "auto" },
    { id: 9, title: "ما معنى الحكمة من خلق الإنسان؟", ask_count: 6, status: "auto" },
  ].map((f) => ({
    ...f,
    answer: "هذه إجابة تجريبية لعرض الشكل فقط [1]. في الموقع الحقيقي تُكتب الإجابة من المقاطع المسترجعة من الكتب المعتمدة وحدها، وكل معلومة تنتهي برقم مصدرها [2].",
    citations: demoCites,
  })),
  answer: (q) => ({
    found: true,
    answer: `هذه إجابة تجريبية لأن الموقع لم يُربط بالخادم بعد [1]. عند الربط سيبحث الموقع في الكتب التي حددتها فقط، ثم يصوغ الإجابة منها مع رقم المقطع بعد كل معلومة [2]. وإن لم يجد نصًّا يجيب عن السؤال اعتذر بوضوح ولم يجب من خارج المصادر.`,
    citations: demoCites,
  }),
  books: [
    { title: "بدائع الفوائد", author: "ابن القيم", volume: null },
    { title: "مدارج السالكين", author: "ابن القيم", volume: "1" },
    { title: "درء تعارض العقل والنقل", author: "ابن تيمية", volume: "1" },
  ],
};
