-- =====================================================================
--  بصيرة — الإعدادات والتخصيص من لوحة المدير
--  نفّذه بعد 001_schema.sql من: Supabase → SQL Editor
-- =====================================================================

-- 1) إعدادات الواجهة (الهوية، الألوان، الخطوط، النصوص، المزايا) — يقرؤها الجميع
create table if not exists public.site_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict do nothing;
alter table public.site_settings enable row level security;
create policy site_settings_public_read on public.site_settings for select using (true);

-- 2) إعدادات الخادم (الذكاء الاصطناعي، الحدود، المهلة) — لا يقرؤها إلا المدير والخادم
create table if not exists public.server_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
insert into public.server_settings (id) values (1) on conflict do nothing;
alter table public.server_settings enable row level security;
create policy server_settings_admin_read on public.server_settings for select using (public.is_admin());

create or replace function public.save_settings(p_site jsonb, p_server jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_site is not null then
    update public.site_settings set data = p_site, updated_at = now() where id = 1;
  end if;
  if p_server is not null then
    update public.server_settings set data = p_server, updated_at = now() where id = 1;
  end if;
end $$;
revoke all on function public.save_settings(jsonb, jsonb) from public, anon;
grant execute on function public.save_settings(jsonb, jsonb) to authenticated;

-- قيمة رقمية من إعدادات الخادم مع قيمة افتراضية
create or replace function public.server_int(k text, dflt int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (data ->> k)::int from public.server_settings where id = 1), dflt)
$$;

-- 3) تفعيل/تعطيل كل كتاب كمصدر
alter table public.books add column if not exists enabled boolean not null default true;

create or replace function public.set_book_enabled(p_id bigint, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.books set enabled = p_enabled where id = p_id;
end $$;
revoke all on function public.set_book_enabled(bigint, boolean) from public, anon;
grant execute on function public.set_book_enabled(bigint, boolean) to authenticated;

drop policy if exists books_public_read on public.books;
create policy books_public_read on public.books for select using (enabled or public.is_staff());

-- البحث يتجاهل الكتب المعطّلة
create or replace function public.search_chunks(terms text[], k int default 12)
returns table (id bigint, book_title text, author text, volume text, page int, content text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare
  q text;
  tq tsquery;
begin
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
    where b.enabled and c.tsv @@ tq
    order by rank desc
    limit greatest(1, least(k, 30));
end $$;
revoke all on function public.search_chunks(text[], int) from public, anon, authenticated;

drop function if exists public.book_stats();
create or replace function public.book_stats()
returns table (id bigint, title text, author text, volume text, enabled boolean, chunks bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query
    select b.id, b.title, b.author, b.volume, b.enabled, count(c.id)
    from public.books b left join public.chunks c on c.book_id = b.id
    group by b.id order by b.author, b.title, b.volume;
end $$;
revoke all on function public.book_stats() from public, anon;
grant execute on function public.book_stats() to authenticated;

-- 4) الأسئلة الشائعة: خيار «بانتظار الموافقة» قبل الظهور للزوار
alter table public.faq drop constraint if exists faq_status_check;
alter table public.faq add constraint faq_status_check check (status in ('auto', 'featured', 'hidden', 'pending'));
drop policy if exists faq_public_read on public.faq;
create policy faq_public_read on public.faq for select
  using (status in ('auto', 'featured') or public.is_staff());

create or replace function public.bump_faq(p_title text, p_answer text, p_citations jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_status text := case when coalesce((select (data ->> 'faq_auto_publish')::boolean from public.server_settings where id = 1), true)
                        then 'auto' else 'pending' end;
begin
  insert into public.faq (title, norm, answer, citations, status)
  values (p_title, public.ar_norm(p_title), p_answer, p_citations, v_status)
  on conflict (norm) do update
     set ask_count = public.faq.ask_count + 1, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.bump_faq(text, text, jsonb) from public, anon, authenticated;

create or replace function public.delete_faq(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  update public.asks set faq_id = null where faq_id = p_id;
  delete from public.faq where id = p_id;
end $$;
revoke all on function public.delete_faq(bigint) from public, anon;
grant execute on function public.delete_faq(bigint) to authenticated;

-- 5) مهلة الانتظار قبل نموذج الرسالة المكتوبة صارت من الإعدادات (الافتراضي 300 ثانية)
create or replace function public.mark_missed(sid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  update public.chat_sessions set status = 'missed', closed_at = now()
   where id = sid and visitor_id = auth.uid() and status = 'waiting'
     and created_at <= now() - make_interval(secs => public.server_int('wait_seconds', 300));
  select status into st from public.chat_sessions where id = sid and visitor_id = auth.uid();
  return st;
end $$;

-- 6) نظرة عامة للمدير
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'asks_today',      (select count(*) from asks where created_at >= date_trunc('day', now())),
    'asks_week',       (select count(*) from asks where created_at >= now() - interval '7 days'),
    'asks_total',      (select count(*) from asks),
    'found_rate',      (select round(100.0 * avg(a.found::int)) from asks a where created_at >= now() - interval '30 days'),
    'visitors_week',   (select count(distinct user_id) from asks where created_at >= now() - interval '7 days'),
    'chats_week',      (select count(*) from chat_sessions where created_at >= now() - interval '7 days'),
    'chats_answered',  (select count(*) from chat_sessions where created_at >= now() - interval '7 days' and claimed_at is not null),
    'chats_missed',    (select count(*) from chat_sessions where created_at >= now() - interval '7 days' and status = 'missed'),
    'chats_waiting',   (select count(*) from chat_sessions where status = 'waiting'),
    'inquiries_open',  (select count(*) from inquiries where status = 'open'),
    'faq_pending',     (select count(*) from faq where status = 'pending'),
    'books',           (select count(*) from books where enabled),
    'chunks',          (select count(*) from chunks),
    'staff_available', (select count(*) from staff where is_available),
    'daily',           (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from (
                          select to_char(g::date, 'MM-DD') as d,
                                 (select count(*) from asks where created_at::date = g::date) as n
                          from generate_series(now() - interval '13 days', now(), interval '1 day') g) x),
    'unanswered',      (select coalesce(jsonb_agg(q), '[]') from (
                          select a.question as q from asks a where not a.found
                          order by created_at desc limit 15) u)
  );
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- 7) تخزين الشعار والأيقونة (رفع من لوحة المدير)
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
on conflict (id) do nothing;
create policy branding_public_read on storage.objects for select using (bucket_id = 'branding');
create policy branding_admin_write on storage.objects for insert with check (bucket_id = 'branding' and public.is_admin());
create policy branding_admin_update on storage.objects for update using (bucket_id = 'branding' and public.is_admin());
create policy branding_admin_delete on storage.objects for delete using (bucket_id = 'branding' and public.is_admin());
