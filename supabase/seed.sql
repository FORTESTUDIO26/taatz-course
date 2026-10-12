-- תוכן התחלתי לאתר הקורס. נוצר אוטומטית ע"י tools/make-seed.mjs — להרצה אחרי schema.sql. אפשר להריץ שוב בבטחה.
begin;
insert into site_settings (key, value) values ('course_title', '"קורס קציני משא״ן ע״צ"'::jsonb) on conflict (key) do nothing;
insert into site_settings (key, value) values ('org_name', '"מרכז תע״ץ"'::jsonb) on conflict (key) do nothing;
insert into site_settings (key, value) values ('home_intro', '"הקורס נועד לחזק את המקצועיות והמסוגלות של קציני משא\"ן ע\"צ, באמצעות יצירת שפה מקצועית אחידה, היכרות מעמיקה עם נהלים וסטנדרטים, ומתן כלים יישומיים לטיפול איכותי, אחראי ומדויק בעובדי צה\"ל."'::jsonb) on conflict (key) do nothing;
insert into site_settings (key, value) values ('instagram_url', '"https://www.instagram.com/ovdei.tzahal?psln=MXVlOGhvZWNnZzh0NA=="'::jsonb) on conflict (key) do nothing;
insert into site_settings (key, value) values ('facebook_url', '"https://www.facebook.com/share/g/1DJnbGDUJc/?mibextid=wwXIfr"'::jsonb) on conflict (key) do nothing;
insert into site_settings (key, value) values ('policy_url', '"https://www.idf.il/אתרי-יחידות/https-wwwidfil-d790d7aad7a8d799d79d-d79ed7a8d79bd796-d7aad7a2d7a1d795d7a7d7aa-d7a2d795d791d793d799-d7a6d794d79c/מדיניות/מדיניות/"'::jsonb) on conflict (key) do nothing;
insert into cohorts (id, name, start_date, end_date, is_active, schedule_approved) values ('6a0c6f10-0000-4000-8000-000000000006', 'מחזור ו׳', '2026-06-22', '2026-06-25', false, true) on conflict (id) do nothing;
insert into cohorts (id, name, start_date, end_date, is_active, schedule_approved) values ('6a0c6f10-0000-4000-8000-000000000007', 'מחזור ז׳', '2026-11-02', '2026-11-05', true, false) on conflict (id) do nothing;
insert into schedule_items (cohort_id, day_date, start_time, end_time, topic, block, lecturer, location, sort)
select '6a0c6f10-0000-4000-8000-000000000006', v.* from (values
  ('2026-06-22'::date, '09:30'::time, '10:30'::time, 'התכנסות וקליטה + פריסת בוקר', 'קליטה לקורס', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 0),
  ('2026-06-22'::date, '10:30'::time, '10:45'::time, 'סקירה מרכז תע"צ', 'קליטה לקורס', 'ר'' מרכז תע"ץ', 'קמפוס בה"ד 11', 1),
  ('2026-06-22'::date, '10:45'::time, '11:15'::time, 'שיחת פתיחה והצגת הקורס', 'הקשר ארגוני וזהות תפקידית', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 2),
  ('2026-06-22'::date, '11:15'::time, '12:00'::time, 'תפקיד ק.משא"ן ע"צ', 'הקשר ארגוני וזהות תפקידית', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 3),
  ('2026-06-22'::date, '12:00'::time, '12:15'::time, 'הפסקה', 'הקשר ארגוני וזהות תפקידית', null, 'קמפוס בה"ד 11', 4),
  ('2026-06-22'::date, '12:15'::time, '13:30'::time, 'תהליך הקליטה', 'הקשר ארגוני וזהות תפקידית', 'רמ"ד קליטה', 'קמפוס בה"ד 11', 5),
  ('2026-06-22'::date, '13:30'::time, '14:30'::time, 'ארוחת צהריים', 'קליטה, זכויות וקידום הפרט', null, 'חדר אוכל מרכזי', 6),
  ('2026-06-22'::date, '14:30'::time, '15:30'::time, 'זכויות והטבות הפרט', 'קליטה, זכויות וקידום הפרט', 'רמ"ד פרט', 'קמפוס בה"ד 11', 7),
  ('2026-06-23'::date, '09:00'::time, '09:30'::time, 'התכנסות + פריסת בוקר', 'קליטה, זכויות וקידום הפרט', null, 'קמפוס בה"ד 11', 8),
  ('2026-06-23'::date, '09:30'::time, '10:45'::time, 'קידום ומיקסום שכר בהסכם הקיבוצי', 'קליטה, זכויות וקידום הפרט', 'רמ"ד ביצוע השכר', 'קמפוס בה"ד 11', 9),
  ('2026-06-23'::date, '10:45'::time, '11:00'::time, 'הפסקה', 'קליטה, זכויות וקידום הפרט', null, 'קמפוס בה"ד 11', 10),
  ('2026-06-23'::date, '11:00'::time, '12:00'::time, 'מערך העבודה הסוציאלית', 'טיפול בעובד במצבים מורכבים', 'עו"ס מרכז תע"ץ', 'קמפוס בה"ד 11', 11),
  ('2026-06-23'::date, '12:00'::time, '13:30'::time, 'סיומי העסקה ועולם הפנסיה', 'טיפול בעובד במצבים מורכבים', 'רמ"ד פרישה ופנסיה', 'קמפוס בה"ד 11', 12),
  ('2026-06-23'::date, '13:30'::time, '14:30'::time, 'ארוחת צהריים', 'טיפול בעובד במצבים מורכבים', null, 'חדר אוכל מרכזי', 13),
  ('2026-06-23'::date, '14:30'::time, '15:30'::time, 'ניהול בריא לעובד חולה', 'טיפול בעובד במצבים מורכבים', 'ע.רמ"ד פרישה ופנסיה', 'קמפוס בה"ד 11', 14),
  ('2026-06-24'::date, '09:00'::time, '09:30'::time, 'התכנסות + פריסת בוקר', 'שכר', null, 'כיתת אלון מחשבים מש"א', 15),
  ('2026-06-24'::date, '09:30'::time, '10:30'::time, 'דיווחי שכר - עיוני+פרקטי', 'שכר', 'אוסנת בלו', 'כיתת אלון מחשבים מש"א', 16),
  ('2026-06-24'::date, '10:30'::time, '10:45'::time, 'הפסקה', 'שכר', null, 'כיתת אלון מחשבים מש"א', 17),
  ('2026-06-24'::date, '10:45'::time, '12:00'::time, 'דיווחי שכר - עיוני+פרקטי', 'שכר', 'אוסנת בלו', 'כיתת אלון מחשבים מש"א', 18),
  ('2026-06-24'::date, '12:00'::time, '13:00'::time, 'ארוחת צהריים', 'שכר', null, 'חדר אוכל מש"א', 19),
  ('2026-06-24'::date, '13:00'::time, '14:30'::time, 'דיווחי שכר - עיוני+פרקטי', 'שכר', 'אוסנת בלו', 'כיתת אלון מחשבים מש"א', 20),
  ('2026-06-24'::date, '14:30'::time, '14:45'::time, 'הפסקה', 'שכר', null, 'כיתת אלון מחשבים מש"א', 21),
  ('2026-06-24'::date, '14:45'::time, '16:00'::time, 'דיווחי שכר - עיוני+פרקטי', 'שכר', 'אוסנת בלו', 'כיתת אלון מחשבים מש"א', 22),
  ('2026-06-25'::date, '09:00'::time, '09:30'::time, 'התכנסות + פריסת בוקר', 'שכר', null, 'קמפוס בה"ד 11', 23),
  ('2026-06-25'::date, '09:30'::time, '10:45'::time, 'תלוש השכר ועולם הפנסיה', 'שכר', 'ע.רמ"ד תכנון השכר', 'קמפוס בה"ד 11', 24),
  ('2026-06-25'::date, '10:45'::time, '11:00'::time, 'הפסקה', 'שכר', null, 'קמפוס בה"ד 11', 25),
  ('2026-06-25'::date, '11:00'::time, '11:30'::time, 'הפעלה בחירום', 'חירום', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 26),
  ('2026-06-25'::date, '11:30'::time, '12:00'::time, 'ע"ע הכנה למבחן', 'סיכום והערכה', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 27),
  ('2026-06-25'::date, '12:00'::time, '13:00'::time, 'מבחן מסכם', 'סיכום והערכה', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 28),
  ('2026-06-25'::date, '13:00'::time, '13:30'::time, 'משוב+סיכום הקורס+חלוקת תעודות', 'סיכום והערכה', 'רמ"ד הדרכה', 'קמפוס בה"ד 11', 29)
) v where not exists (select 1 from schedule_items where cohort_id = '6a0c6f10-0000-4000-8000-000000000006');
insert into schedule_items (cohort_id, day_date, start_time, end_time, topic, block, lecturer, location, sort)
select '6a0c6f10-0000-4000-8000-000000000007', s.day_date + (date '2026-11-02' - date '2026-06-22'), s.start_time, s.end_time, s.topic, s.block, s.lecturer, s.location, s.sort
  from schedule_items s where s.cohort_id = '6a0c6f10-0000-4000-8000-000000000006'
   and not exists (select 1 from schedule_items where cohort_id = '6a0c6f10-0000-4000-8000-000000000007');
insert into resources (section, title, sort)
select v.* from (values
  ('presentations', 'סקירת מרכז תע״ץ', 0),
  ('presentations', 'הצגת הקורס', 1),
  ('presentations', 'תפקיד קצין משא״ן ע״צ', 2),
  ('presentations', 'תהליך קליטת עובדים', 3),
  ('presentations', 'זכויות והטבות הפרט', 4),
  ('presentations', 'קידום והטבות עובדים בהסכם הקיבוצי', 5),
  ('presentations', 'מערך העבודה הסוציאלית', 6),
  ('presentations', 'סיומי העסקה', 7),
  ('presentations', 'ניהול בריא לעובד חולה', 8),
  ('presentations', 'דיווחי שכר – עיוני (מושגים)', 9),
  ('presentations', 'דיווחי שכר – פרקטי', 10),
  ('presentations', 'תלוש השכר', 11),
  ('presentations', 'הפעלה בחירום', 12),
  ('book', 'ספר קצין משא״ן ע״צ', 13)
) v(section, title, sort) where not exists (select 1 from resources);
commit;
