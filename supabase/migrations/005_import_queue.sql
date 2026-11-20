-- =====================================================================
--  بصيرة — طابور استيراد الكتب في الخلفية (كتاب كل دقيقة عبر pg_cron)
-- =====================================================================
create extension if not exists pg_cron;

create table if not exists public.import_queue (
  url        text primary key,
  status     text not null default 'pending',   -- pending | done | error
  result     text,
  updated_at timestamptz not null default now()
);
alter table public.import_queue enable row level security;

create or replace function public.import_next() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  u text;
  res text;
begin
  select url into u from public.import_queue where status = 'pending' order by url limit 1 for update skip locked;
  if u is null then
    perform cron.unschedule('basira-import');
    return 'queue empty';
  end if;
  begin
    res := public.import_book_json(u);
    update public.import_queue set status = 'done', result = res, updated_at = now() where url = u;
  exception when others then
    update public.import_queue set status = 'error', result = sqlerrm, updated_at = now() where url = u;
  end;
  return coalesce(res, 'error');
end $$;
revoke all on function public.import_next() from public, anon, authenticated;

insert into public.import_queue (url) values
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-01.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-02.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-03.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-04.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-05.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-06.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-07.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-08.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-09.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-10.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-11.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-12.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-13.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-14.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-15.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-16.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-17.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-18.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-19.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-20.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-21.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-22.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-23.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-24.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-25.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-26.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-27.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-28.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-29.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-30.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-31.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-32.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-33.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-34.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-35.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-36.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-37.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-38.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-39.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-40.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-41.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-42.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-43.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-44.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-45.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-46.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-47.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-49.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/c447fb5c0d32ed7417bdc837a6c8f05dbb59f969/aq-51.json')
on conflict (url) do update set status = 'pending';

select cron.schedule('basira-import', '* * * * *', 'select public.import_next()');
