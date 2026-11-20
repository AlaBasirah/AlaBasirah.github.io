// إدارة الطاقم (للمدير فقط): عرض، دعوة مشرف، تغيير الدور، إزالة
import { admin, cors, json, requireUser, siteUrl } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = admin();

  const { data: me } = await db.from("staff").select("role").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "list") {
    const { data } = await db.from("staff")
      .select("user_id, role, notify_email, is_available, last_seen, created_at").order("created_at");
    return json({ staff: data ?? [], me: user.id });
  }

  if (action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "supervisor";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "بريد غير صالح" }, 400);

    let uid: string | null = null;
    const { data: existing } = await db.rpc("user_id_by_email", { p_email: email });
    if (existing) {
      uid = existing as string;
    } else {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/admin/` });
      if (error) return json({ error: error.message }, 400);
      uid = data.user?.id ?? null;
    }
    if (!uid) return json({ error: "تعذر إنشاء الحساب" }, 500);

    const { error } = await db.from("staff").upsert({ user_id: uid, role, notify_email: email });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, existed: Boolean(existing) });
  }

  if (action === "set_role") {
    const role = body.role === "admin" ? "admin" : "supervisor";
    if (body.user_id === user.id) return json({ error: "لا يمكنك تغيير دورك بنفسك" }, 400);
    await db.from("staff").update({ role }).eq("user_id", body.user_id);
    return json({ ok: true });
  }

  if (action === "set_email") {
    const email = String(body.email ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "بريد غير صالح" }, 400);
    await db.from("staff").update({ notify_email: email }).eq("user_id", body.user_id);
    return json({ ok: true });
  }

  if (action === "remove") {
    if (body.user_id === user.id) return json({ error: "لا يمكنك إزالة نفسك" }, 400);
    await db.from("staff").delete().eq("user_id", body.user_id);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
