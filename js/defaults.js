// القيم الافتراضية لكل ما يمكن تخصيصه من لوحة المدير.
// أي قيمة لا يغيرها المدير تبقى على ما هنا.

export const DEFAULT_SITE = {
  brand: {
    name: "بصيرة",
    tagline: "اسأل عمّا يشكل عليك في الدين… وخذ الجواب من كتب أهل العلم بالمصدر والصفحة",
    logo_url: "",
    favicon_url: "",
    logo_size: 112,
    footer_quote: "«قُلْ هَٰذِهِ سَبِيلِي أَدْعُو إِلَى اللَّهِ ۚ عَلَىٰ بَصِيرَةٍ»",
    about: "«بصيرة» مساحة هادئة ومحترمة لكل من يريد أن يسأل عن الإسلام وما يشكل عليه في أمور الدين.\n\nتُستخرج الإجابات من كتب أهل العلم المعتمدة في الموقع فقط، ويُذكر مع كل معلومة مصدرها بالكتاب والجزء والصفحة، فإن لم يوجد في المصادر نص يجيب عن السؤال قيل ذلك بوضوح.\n\nلا يلزمك تسجيل الدخول، ولا نطلب اسمك. وإن أحببت الحديث مع إنسان فاضغط «تحدّث مع إنسان».",
  },
  colors: {
    primary1: "#14B8A6",
    primary2: "#0E7C86",
    primary3: "#0B4F6C",
    sun1: "#FFD97A",
    sun2: "#FFC24B",
    sun3: "#FF7E5F",
    rose: "#F7648B",
    bg: "#FFFBF4",
    ink: "#1E2B33",
  },
  fonts: { body: "Readex Pro", quote: "Amiri" },
  style: {
    pattern: true,
    pattern_opacity: 0.07,
    radius: 28,
    hero_glow: true,
    animations: true,
  },
  texts: {
    faq_title: "أكثر ما سأل عنه الزوّار",
    faq_more: "عرض المزيد",
    faq_empty: "لا توجد أسئلة بعد… كن أول من يسأل!",
    human_btn: "تحدّث مع إنسان",
    placeholder: "اكتب سؤالك هنا…",
    hint: "لا يلزمك تسجيل الدخول. الإجابات مأخوذة من المصادر المعتمدة في الموقع فقط، مع ذكر الكتاب والصفحة.",
    loading: "نبحث لك في الكتب…",
    related_note: "لم نجد نصًّا يجيب عن سؤالك بلفظه، وهذا أقرب ما ورد في الكتب المعتمدة من معناه:",
    btn_more: "استزد من الإجابة",
    more_title: "مزيد من الإجابة",
    more_none: "لم نجد في الكتب المعتمدة مزيدًا يتصل بسؤالك.",
    btn_short: "اختصر الإجابة",
    btn_simple: "بسّط الإجابة",
    btn_full: "الإجابة الكاملة",
    disclaimer_found: "هذه الإجابة مستخرجة آليًّا من المصادر المعتمدة في الموقع فقط. راجع النصوص أعلاه، وإن بقي لديك إشكال فاضغط «تحدّث مع إنسان».",
    disclaimer_notfound: "يمكنك الضغط على «تحدّث مع إنسان» ليتواصل معك أحد المشرفين.",
    searching_staff: "نبحث عن مشرف متاح…",
    waiting_title: "أرسلنا طلبك إلى المشرفين",
    waiting_sub: "سينضم إليك أحدهم خلال لحظات. يمكنك كتابة سؤالك الآن ليقرأه فور دخوله.",
    staff_label: "المشرف",
    joined: "انضم إليك أحد المشرفين الآن. تفضّل بالحديث.",
    ended: "انتهت المحادثة. شكرًا لك، ونسأل الله لنا ولك الهداية والتوفيق.",
    apology: "نعتذر منك، لا يوجد أحد من المشرفين متاح في الوقت الحالي.",
    apology_limit: "نعتذر، لقد طلبت المحادثة عدة مرات خلال ساعة. يمكنك ترك استفسارك مكتوبًا هنا.",
    inquiry_label: "اكتب استفسارك وسيقوم أحد المشرفين بالرد عليك بأقرب وقت ممكن",
    inquiry_btn: "إرسال الاستفسار",
    inquiry_thanks: "وصل استفسارك، وسيقوم أحد المشرفين بالرد عليك في أقرب وقت ممكن. ستجد الرد في صفحة «أسئلتي» من هذا المتصفح.",
    mine_btn: "أسئلتي",
    account_btn: "حسابي",
    sources_link: "المصادر المعتمدة",
    about_link: "عن الموقع",
    footer_note: "",
  },
  features: {
    show_faq: true,
    faq_visible: 8,
    show_counts: true,
    human_chat: true,
    accounts: true,
    show_mine: true,
    show_sources: true,
    show_about: true,
    show_citations: true,
    rewrite_buttons: true,
    more_button: true,
  },
};

export const DEFAULT_SERVER = {
  provider: "gemini",
  model: "gemini-3.6-flash",
  extra_instructions: "",
  not_found_message: "",
  top_k: 12,
  ask_limit: 30,
  human_limit: 4,
  wait_seconds: 300,
  faq_auto_publish: true,
  human_chat: true,
};

export const PRESETS = [
  { name: "فيروزي مشمس", colors: DEFAULT_SITE.colors },
  { name: "بنفسجي وردي", colors: { primary1: "#A78BFA", primary2: "#7C3AED", primary3: "#4C1D95", sun1: "#FFE08A", sun2: "#FBBF24", sun3: "#F472B6", rose: "#EC4899", bg: "#FCFAFF", ink: "#251F35" } },
  { name: "زيتوني ذهبي", colors: { primary1: "#84CC16", primary2: "#4D7C0F", primary3: "#29481A", sun1: "#FDE68A", sun2: "#EAB308", sun3: "#F97316", rose: "#E11D48", bg: "#FCFBF3", ink: "#1F2A1A" } },
  { name: "أزرق ليلي مرجاني", colors: { primary1: "#38BDF8", primary2: "#1D4ED8", primary3: "#1E1B4B", sun1: "#FED7AA", sun2: "#FDBA74", sun3: "#FB7185", rose: "#F43F5E", bg: "#F8FAFF", ink: "#172033" } },
  { name: "عنّابي ذهبي", colors: { primary1: "#F43F5E", primary2: "#9F1239", primary3: "#4C0519", sun1: "#FDE68A", sun2: "#F5B33B", sun3: "#EA580C", rose: "#DB2777", bg: "#FFF9F5", ink: "#2B1A1E" } },
  { name: "نعناعي هادئ", colors: { primary1: "#5EEAD4", primary2: "#10B981", primary3: "#065F46", sun1: "#FEF3C7", sun2: "#FCD34D", sun3: "#FB923C", rose: "#F472B6", bg: "#F7FFFB", ink: "#16302A" } },
];

export const BODY_FONTS = ["Readex Pro", "Cairo", "Tajawal", "IBM Plex Sans Arabic", "Almarai", "Noto Kufi Arabic", "Changa", "El Messiri", "Baloo Bhaijaan 2", "Rubik"];
export const QUOTE_FONTS = ["Amiri", "Noto Naskh Arabic", "Scheherazade New", "Lateef", "Aref Ruqaa", "Reem Kufi", "Markazi Text"];

/** دمج عميق: يأخذ قيم المدير ويكمل الناقص من الافتراضي */
export function merge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) && v && typeof v === "object" ? merge(base[k], v) : v;
  }
  return out;
}
