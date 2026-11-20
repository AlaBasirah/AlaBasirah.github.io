-- =====================================================================
--  بصيرة — إدخال كتب ابن تيمية المختارة (نصوص OpenITI) عبر طابور الاستيراد
-- =====================================================================
insert into public.import_queue (url) values
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-01.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-02.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-03.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-04.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-05.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-06.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-07.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-08.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-09.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-10.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-11.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-12.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-13.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-14.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-15.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-16.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-17.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-18.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-19.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-20.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-21.json'),
  ('https://raw.githubusercontent.com/AlaBasirah/AlaBasirah.github.io/9e8c6d3eadc710689f559106c21eb1c2d7d50ced/it-22.json')
on conflict (url) do update set status = 'pending';

select cron.schedule('basira-import', '* * * * *', 'select public.import_next()');
