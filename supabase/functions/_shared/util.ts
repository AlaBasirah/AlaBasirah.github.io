// أدوات مشتركة لدوال الخادم (Supabase Edge Functions — Deno)
import { createClient, SupabaseClient, User } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "*";

export const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** يتحقق من هوية مستدعي الدالة (زائر مجهول أو مسجل أو مشرف) */
export async function requireUser(req: Request): Promise<User | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
}

/**
 * إرسال بريد عبر Resend. الرسالة لا تحتوي أي محتوى من الزائر ولا أي معلومات عنه:
 * فقط تنبيه عام ورابط آمن، ويُرسل لكل مشرف بريد مستقل (لا نسخ مكشوفة).
 */
export async function sendMail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM") ?? "Basira <noreply@example.com>";
  if (!key) {
    console.warn("RESEND_API_KEY not set; skipping email");
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) console.error("mail failed", r.status, await r.text());
}

export function mailTemplate(title: string, line: string, link: string, cta: string) {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#FFF8EC;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #F1E3C8">
    <div style="background:linear-gradient(135deg,#14B8A6,#0B4F6C);padding:22px;color:#fff;font-size:20px;font-weight:bold">${title}</div>
    <div style="padding:24px;color:#1E2B33;font-size:16px;line-height:1.9">
      <p style="margin:0 0 18px">${line}</p>
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#FFC24B,#FF7E5F);color:#3a1d00;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold">${cta}</a>
      <p style="margin:22px 0 0;font-size:13px;color:#6b7a80">لا تحتوي هذه الرسالة أي معلومات عن الزائر أو نص سؤاله. الدخول يتطلب تسجيل دخولك في لوحة الإشراف.</p>
    </div>
  </div></body></html>`;
}

/** استدعاء Claude مع إلزامه بإخراج منظّم عبر أداة واحدة */
export async function claudeTool<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model || Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5",
      max_tokens: opts.maxTokens ?? 2000,
      temperature: 0,
      system: opts.system,
      tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.schema }],
      tool_choice: { type: "tool", name: opts.toolName },
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const block = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!block) throw new Error("no structured output");
  return block.input as T;
}

/** إعدادات الخادم التي يضبطها المدير من لوحة التحكم */
export type ServerSettings = {
  model?: string;
  extra_instructions?: string;
  not_found_message?: string;
  top_k?: number;
  ask_limit?: number;
  human_limit?: number;
  wait_seconds?: number;
  faq_auto_publish?: boolean;
  human_chat?: boolean;
};
export async function serverSettings(): Promise<ServerSettings> {
  const { data } = await admin().from("server_settings").select("data").eq("id", 1).maybeSingle();
  return (data?.data ?? {}) as ServerSettings;
}
