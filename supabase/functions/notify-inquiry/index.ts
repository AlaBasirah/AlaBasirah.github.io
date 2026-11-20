// تنبيه المشرفين برسالة مكتوبة جديدة (بريد فيه رابط فقط، بلا نص الرسالة)
import { admin, cors, json, mailTemplate, requireUser, sendMail, siteUrl } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let id = "";
  try { id = String((await req.json()).inquiry_id ?? ""); } catch { /* ignore */ }
  const db = admin();

  // نتحقق أن الرسالة لهذا الزائر ولم يُنبَّه بها من قبل (منع الإزعاج)
  const { data: inq } = await db.from("inquiries").update({ notified_at: new Date().toISOString() })
    .eq("id", id).eq("visitor_id", user.id).is("notified_at", null).select("id").maybeSingle();
  if (!inq) return json({ ok: true });

  const { data: staff } = await db.from("staff").select("notify_email");
  const html = mailTemplate(
    "رسالة جديدة من زائر",
    "ترك أحد الزوار استفسارًا مكتوبًا بانتظار الرد.",
    `${siteUrl()}/admin/#inquiry=${inq.id}`,
    "عرض الاستفسار والرد",
  );
  await Promise.allSettled((staff ?? []).map((s: { notify_email: string }) => sendMail(s.notify_email, "استفسار جديد بانتظار الرد", html)));
  return json({ ok: true });
});
