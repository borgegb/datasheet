alter table public.production_kanban_cards
alter column footer_code set default 'L0050';

update public.production_kanban_cards
set footer_code = 'L0050'
where footer_code is null or btrim(footer_code) = '';
