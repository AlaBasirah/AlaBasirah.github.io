// إعدادات الاتصال بالخادم (Supabase).
// ضع هنا رابط مشروعك ومفتاحه العام (anon / publishable) من: Supabase → Project Settings → API
// هذا المفتاح عام بطبيعته ومحميّ بقواعد الصلاحيات في قاعدة البيانات، فلا بأس بوضعه هنا.
// إذا تُرك الرابط فارغًا يعمل الموقع في «وضع المعاينة» ببيانات تجريبية.
export const CONFIG = {
  SUPABASE_URL: "https://krhhwimytpwjqtyqmtla.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_0uDptLhSozcDPaVFKwE6EQ_5vrk1Eic",

  // مدة انتظار رد المشرف قبل عرض نموذج الرسالة المكتوبة (بالثواني)
  HUMAN_WAIT_SECONDS: 300,

  // عدد الأسئلة الشائعة الظاهرة قبل زر «عرض المزيد»
  FAQ_VISIBLE: 8,
};
