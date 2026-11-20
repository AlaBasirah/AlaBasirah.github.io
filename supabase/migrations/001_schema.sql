-- =====================================================================
--  بصيرة — مخطط قاعدة البيانات (Supabase / PostgreSQL)
--  نفّذ هذا الملف كاملًا مرة واحدة من: Supabase → SQL Editor
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1) أدوات تطبيع النص العربي (تُستخدم عند الفهرسة وعند البحث بالطريقة نفسها)
-- ---------------------------------------------------------------------
create or replace function public.ar_norm(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
           regexp_replace(
             translate(
               regexp_replace(coalesce(t, ''), '[ً-ٰٟـ]', '', 'g'),
               'أإآٱىةؤئ', 'اااايهوي'),
             '[^ء-ي0-9a-zA-Z]+', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- تجريد خفيف للسوابق الشائعة (ال، وال، بال، و، ب…) حتى يتطابق «بتناسخ» و«والتناسخ» مع «التناسخ».
-- يُفهرس النص بصيغتيه (الأصلية والمجرّدة) فلا يضيع شيء.
create or replace function public.ar_light(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(' ' || coalesce(t, ''),
         '\s(وال|فال|بال|كال|ولل|فلل|لل|ال|و|ف|ب|ك|ل)(?=[^\s]{3,})', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- 2) المصادر: الكتب ومقاطعها
-- ---------------------------------------------------------------------
create table if not exists public.books (
  id          bigserial primary key,
  title       text not null,
  author      text not null,
  volume      text,
  source_url  text,
  created_at  timestamptz not null default now(),
  unique (title, author, volume)
);

create table if not exists public.chunks (
  id        bigserial primary key,
  book_id   bigint not null references public.books(id) on delete cascade,
  page      int,
  content   text not null,
  tsv       tsvector generated always as
              (to_tsvector('simple', public.ar_norm(content) || ' ' || public.ar_light(public.ar_norm(content)))) stored
);
create index if not exists chunks_tsv_idx  on public.chunks using gin (tsv);
create index if not exists chunks_book_idx on public.chunks (book_id);

alter table public.books  enable row level security;
alter table public.chunks enable row level security;
-- قائمة الكتب معروضة للعامة (صفحة «مصادرنا»)، أما المقاطع فلا يقرؤها إلا الخادم
create policy books_public_read on public.books for select using (true);

-- بحث في المقاطع: لا يستدعيه إلا الخادم (service_role)
create or replace function public.search_chunks(terms text[], k int default 12)
returns table (id bigint, book_title text, author text, volume text, page int, content text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare
  q text;
  tq tsquery;
begin
  -- كل عبارة: كلماتها مربوطة بـ «و»، وكل كلمة تُبحث بصيغتها الأصلية والمجرّدة مع مطابقة البادئة
  select string_agg('(' || p || ')', ' | ') into q
  from (
    select string_agg(
             case when stem <> w and length(stem) >= 3
                  then '(' || w || ':* | ' || stem || ':*)'
                  when length(w) >= 3 then w || ':*'
                  else w end, ' & ') as p
    from (
      select t_ord, w, public.ar_light(w) as stem
      from unnest(terms) with ordinality as u(t, t_ord),
           regexp_split_to_table(public.ar_norm(t), '\s+') as w
      where length(w) >= 2
    ) words
    group by t_ord
  ) phrases
  where p is not null;

  if q is null or q = '' then
    return;
  end if;
  tq := to_tsquery('simple', q);

  return query
    select c.id, b.title, b.author, b.volume, c.page, c.content,
           ts_rank_cd(c.tsv, tq) as rank
    from public.chunks c join public.books b on b.id = c.book_id
    where c.tsv @@ tq
    order by rank desc
    limit greatest(1, least(k, 30));
end $$;
revoke all on function public.search_chunks(text[], int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) الطاقم (المدير والمشرفون) — لا يظهر منه شيء للزوار إطلاقًا
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('admin', 'supervisor')),
  notify_email  text not null,
  is_available  boolean not null default false,
  last_seen     timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.staff enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'admin')
$$;

create policy staff_read_self_or_admin on public.staff for select
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.my_staff()
returns table (role text, is_available boolean)
language sql stable security definer set search_path = public as $$
  select role, is_available from public.staff where user_id = auth.uid()
$$;

create or replace function public.set_availability(avail boolean) returns void
language sql security definer set search_path = public as $$
  update public.staff set is_available = avail, last_seen = now() where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 4) أسئلة الزوار والأسئلة الشائعة
-- ---------------------------------------------------------------------
create table if not exists public.faq (
  id          bigserial primary key,
  title       text not null,
  norm        text not null unique,
  answer      text not null,
  citations   jsonb not null default '[]',
  ask_count   int not null default 1,
  status      text not null default 'auto' check (status in ('auto', 'featured', 'hidden')),
  updated_at  timestamptz not null default now()
);
alter table public.faq enable row level security;
create policy faq_public_read on public.faq for select using (status <> 'hidden' or public.is_staff());

create table if not exists public.asks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  question    text not null,
  answer      text not null,
  citations   jsonb not null default '[]',
  found       boolean not null default false,
  is_private  boolean not null default true,
  faq_id      bigint references public.faq(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists asks_user_idx on public.asks (user_id, created_at desc);
alter table public.asks enable row level security;
create policy asks_read_own on public.asks for select using (user_id = auth.uid());
create policy asks_delete_own on public.asks for delete using (user_id = auth.uid());

-- يستدعيها الخادم فقط: تضيف سؤالًا شائعًا أو تزيد عدّاده
create or replace function public.bump_faq(p_title text, p_answer text, p_citations jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.faq (title, norm, answer, citations)
  values (p_title, public.ar_norm(p_title), p_answer, p_citations)
  on conflict (norm) do update
     set ask_count = public.faq.ask_count + 1, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.bump_faq(text, text, jsonb) from public, anon, authenticated;

create or replace function public.moderate_faq(p_id bigint, p_status text, p_title text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  update public.faq
     set status = coalesce(p_status, status),
         title  = coalesce(nullif(btrim(p_title), ''), title),
         updated_at = now()
   where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 5) المحادثة المباشرة مع إنسان
-- ---------------------------------------------------------------------
create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  visitor_id  uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'waiting' check (status in ('waiting', 'active', 'closed', 'missed')),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  closed_at   timestamptz
);
create index if not exists chat_sessions_visitor_idx on public.chat_sessions (visitor_id, created_at desc);
alter table public.chat_sessions enable row level security;
create policy chat_sessions_read on public.chat_sessions for select
  using (visitor_id = auth.uid() or public.is_staff());

-- من استلم المحادثة: جدول منفصل لا يقرؤه إلا الطاقم، حتى لا تتسرب أي هوية للزائر
create table if not exists public.chat_claims (
  session_id  uuid primary key references public.chat_sessions(id) on delete cascade,
  staff_id    uuid not null references auth.users(id) on delete cascade
);
alter table public.chat_claims enable row level security;
create policy chat_claims_staff_read on public.chat_claims for select using (public.is_staff());

create table if not exists public.chat_messages (
  id          bigserial primary key,
  session_id  uuid not null references public.chat_sessions(id) on delete cascade,
  sender      text not null check (sender in ('visitor', 'staff')),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages (session_id, id);
alter table public.chat_messages enable row level security;

create policy chat_messages_read on public.chat_messages for select using (
  public.is_staff() or exists (
    select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.visitor_id = auth.uid()));

create policy chat_messages_visitor_insert on public.chat_messages for insert with check (
  sender = 'visitor' and exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id and s.visitor_id = auth.uid() and s.status in ('waiting', 'active')));

create policy chat_messages_staff_insert on public.chat_messages for insert with check (
  sender = 'staff' and exists (
    select 1 from public.chat_claims c join public.chat_sessions s on s.id = c.session_id
    where c.session_id = chat_messages.session_id and c.staff_id = auth.uid() and s.status = 'active'));

-- المشرف يستلم المحادثة (أول من يضغط يستلمها)
create or replace function public.claim_session(sid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean := false;
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  update public.chat_sessions set status = 'active', claimed_at = now()
   where id = sid and status = 'waiting'
  returning true into ok;
  if ok then
    insert into public.chat_claims (session_id, staff_id) values (sid, auth.uid());
    update public.staff set last_seen = now() where user_id = auth.uid();
    return true;
  end if;
  return exists (select 1 from public.chat_claims where session_id = sid and staff_id = auth.uid());
end $$;

-- الزائر يعلن انتهاء مهلة الانتظار (5 دقائق) — يتحقق الخادم من مرور المهلة فعلًا
create or replace function public.mark_missed(sid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  update public.chat_sessions set status = 'missed', closed_at = now()
   where id = sid and visitor_id = auth.uid() and status = 'waiting'
     and created_at <= now() - interval '5 minutes';
  select status into st from public.chat_sessions where id = sid and visitor_id = auth.uid();
  return st;
end $$;

create or replace function public.close_session(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_sessions s set status = 'closed', closed_at = now()
   where s.id = sid and s.status in ('waiting', 'active')
     and (s.visitor_id = auth.uid()
          or exists (select 1 from public.chat_claims c where c.session_id = sid and c.staff_id = auth.uid())
          or public.is_admin());
end $$;

-- ---------------------------------------------------------------------
-- 6) الاستفسارات المكتوبة (عند عدم توفر مشرف)
-- ---------------------------------------------------------------------
create table if not exists public.inquiries (
  id           uuid primary key default gen_random_uuid(),
  visitor_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id   uuid references public.chat_sessions(id) on delete set null,
  body         text not null check (char_length(body) between 3 and 5000),
  reply        text,
  status       text not null default 'open' check (status in ('open', 'answered')),
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  replied_at   timestamptz
);
alter table public.inquiries enable row level security;
create policy inquiries_read on public.inquiries for select
  using (visitor_id = auth.uid() or public.is_staff());
create policy inquiries_insert_own on public.inquiries for insert
  with check (visitor_id = auth.uid() and reply is null and status = 'open' and notified_at is null);

create or replace function public.reply_inquiry(iid uuid, txt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  if char_length(btrim(txt)) < 2 then raise exception 'empty reply'; end if;
  update public.inquiries set reply = btrim(txt), status = 'answered', replied_at = now() where id = iid;
end $$;

-- ---------------------------------------------------------------------
-- 7) صلاحيات الدوال والبث المباشر
-- ---------------------------------------------------------------------
revoke all on function public.my_staff()                     from public, anon;
revoke all on function public.set_availability(boolean)      from public, anon;
revoke all on function public.moderate_faq(bigint,text,text) from public, anon;
revoke all on function public.claim_session(uuid)            from public, anon;
revoke all on function public.mark_missed(uuid)              from public, anon;
revoke all on function public.close_session(uuid)            from public, anon;
revoke all on function public.reply_inquiry(uuid,text)       from public, anon;
grant execute on function public.my_staff(), public.set_availability(boolean),
  public.moderate_faq(bigint,text,text), public.claim_session(uuid), public.mark_missed(uuid),
  public.close_session(uuid), public.reply_inquiry(uuid,text), public.is_staff(), public.is_admin()
  to authenticated;

-- بحث عن مستخدم بالبريد (للخادم فقط: دعوة مشرف موجود مسبقًا)
create or replace function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_sessions;
alter publication supabase_realtime add table public.inquiries;

-- إحصاءات المصادر للوحة الإشراف
create or replace function public.book_stats()
returns table (id bigint, title text, author text, volume text, chunks bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query
    select b.id, b.title, b.author, b.volume, count(c.id)
    from public.books b left join public.chunks c on c.book_id = b.id
    group by b.id order by b.author, b.title, b.volume;
end $$;
revoke all on function public.book_stats() from public, anon;
grant execute on function public.book_stats() to authenticated;
