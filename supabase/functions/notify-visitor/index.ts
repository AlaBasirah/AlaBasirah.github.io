// تنبيه الزائر بالبريد عند الرد على استفساره (فقط إن كان له حساب ببريد). لا يُذكر أي شيء عن المشرف.
import { admin, cors, json, mailTemplate, requireUser, sendMail, siteUrl } from "../_shared/util.ts";

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
