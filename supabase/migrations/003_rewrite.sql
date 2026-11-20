-- =====================================================================
--  بصيرة — «اختصر الإجابة» و«بسّط الإجابة»: تخزين الصيغ المولّدة حتى لا تتكرر تكلفتها
-- =====================================================================
alter table public.asks add column if not exists short_answer  text;
alter table public.asks add column if not exists simple_answer text;
alter table public.faq  add column if not exists short_answer  text;
alter table public.faq  add column if not exists simple_answer text;
