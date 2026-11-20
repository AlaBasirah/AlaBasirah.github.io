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
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-01.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-02.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-03.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-04.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-05.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-06.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-07.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-08.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-09.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-10.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-11.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-12.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-13.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-14.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-15.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-16.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-17.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-18.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-19.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-20.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-21.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-22.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-23.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-24.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-25.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-26.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-27.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-28.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-29.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-30.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-31.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-32.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-33.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-34.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-35.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-36.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-37.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-38.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-39.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-40.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-41.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-42.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-43.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-44.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-45.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-46.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-47.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-48.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-49.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-50.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-51.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-52.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-53.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/af9fb68d334487fce550d248a345b5c1ab872b1f/aq-54.json')
on conflict (url) do update set status = 'pending';

select cron.schedule('basira-import', '* * * * *', 'select public.import_next()');
