// طلب محادثة مع إنسان: ينشئ جلسة انتظار ويرسل لكل مشرف متاح بريدًا مستقلًا فيه رابط فقط
import { admin, cors, json, mailTemplate, requireUser, sendMail, serverSettings, siteUrl } from "../_shared/util.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = admin();
  const cfg = await serverSettings();
  if (cfg.human_chat === false) return json({ available: false, reason: "disabled" });
  const MAX_PER_HOUR = cfg.human_limit ?? Number(Deno.env.get("HUMAN_LIMIT_PER_HOUR") ?? "4");
  const waitMin = Math.round((cfg.wait_seconds ?? 300) / 60);

  // جلسة قائمة؟ أعدها بدل إنشاء جديدة
  const { data: open } = await db.from("chat_sessions").select("id, status, created_at")
    .eq("visitor_id", user.id).in("status", ["waiting", "active"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open) return json({ available: true, session_id: open.id, status: open.status, created_at: open.created_at, wait_seconds: cfg.wait_seconds ?? 300 });

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("chat_sessions").select("id", { count: "exact", head: true })
    .eq("visitor_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return json({ available: false, reason: "limit" });
  }

  const { data: staff } = await db.from("staff").select("notify_email").eq("is_available", true);
  if (!staff?.length) return json({ available: false, reason: "none" });

  const { data: session, error } = await db.from("chat_sessions")
    .insert({ visitor_id: user.id }).select("id, status, created_at").single();
  if (error || !session) return json({ error: "تعذر بدء المحادثة" }, 500);

  const link = `${siteUrl()}/admin/#chat=${session.id}`;
  const html = mailTemplate(
    "طلب محادثة جديد",
    `يوجد زائر ينتظر محادثة مباشرة الآن. سيُعرض عليه نموذج الرسالة المكتوبة إن لم تُستلم المحادثة خلال ${waitMin} دقائق.`,
    link,
    "الدخول إلى المحادثة",
  );
  await Promise.allSettled(staff.map((s: { notify_email: string }) => sendMail(s.notify_email, "طلب محادثة جديد", html)));

  return json({ available: true, session_id: session.id, status: session.status, created_at: session.created_at, wait_seconds: cfg.wait_seconds ?? 300 });
});
