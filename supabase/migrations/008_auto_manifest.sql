-- =====================================================================
--  بصيرة — استيراد تلقائي دائم: قاعدة البيانات تقرأ data-manifest.txt من GitHub كل دقيقة
--  وتستورد أي كتاب جديد مذكور فيه، فلا حاجة لتشغيل أوامر SQL عند إضافة كتب لاحقًا.
-- =====================================================================
create or replace function public.import_next() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  u   text;
  res text;
  m   extensions.http_response;
begin
  select url into u from public.import_queue
   where status = 'pending' order by url limit 1 for update skip locked;

  if u is null then
    begin
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');
      select * into m from extensions.http_get(
        'https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/main/data-manifest.txt');
      if m.status = 200 then
        insert into public.import_queue (url)
        select btrim(l) from regexp_split_to_table(m.content, E'\n') l
         where btrim(l) like 'https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/%.json'
        on conflict (url) do nothing;
      end if;
    exception when others then
      null;
    end;
    return 'idle';
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

select cron.schedule('basira-import', '* * * * *', 'select public.import_next()');
select public.import_next();
