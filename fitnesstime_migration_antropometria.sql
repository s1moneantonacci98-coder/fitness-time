-- Fitness Time Club — Migrazione: Misure antropometriche (circonferenze, peso, pliche)
-- Solo oggetti prefissati fitnesstime_. Idempotente. Stesso perimetro RLS di fitnesstime_misure_bia.
-- APPLICATA su Supabase il 2026-10-08.
begin;

create table public.fitnesstime_misure_antropometriche (
  id                uuid primary key default gen_random_uuid(),
  atleta_id         uuid not null references public.fitnesstime_profiles(id) on delete cascade,
  data_rilevazione  date not null default current_date,
  peso_kg           numeric check (peso_kg is null or peso_kg > 0),
  -- circonferenze (cm)
  petto_cm          numeric check (petto_cm is null or petto_cm > 0),
  bicipiti_cm       numeric check (bicipiti_cm is null or bicipiti_cm > 0),
  interno_coscia_cm numeric check (interno_coscia_cm is null or interno_coscia_cm > 0),
  polpaccio_cm      numeric check (polpaccio_cm is null or polpaccio_cm > 0),
  vita_cm           numeric check (vita_cm is null or vita_cm > 0),
  spalle_cm         numeric check (spalle_cm is null or spalle_cm > 0),
  ginocchio_cm      numeric check (ginocchio_cm is null or ginocchio_cm > 0),
  -- pliche cutanee (%)
  plica_tricipitale numeric check (plica_tricipitale is null or plica_tricipitale >= 0),
  plica_ombelicale  numeric check (plica_ombelicale  is null or plica_ombelicale  >= 0),
  plica_iliaca      numeric check (plica_iliaca      is null or plica_iliaca      >= 0),
  plica_pettorale   numeric check (plica_pettorale   is null or plica_pettorale   >= 0),
  plica_ascellare   numeric check (plica_ascellare   is null or plica_ascellare   >= 0),
  plica_scapolare   numeric check (plica_scapolare   is null or plica_scapolare   >= 0),
  plica_gamba       numeric check (plica_gamba       is null or plica_gamba       >= 0),
  note              text,
  created_at        timestamptz not null default now(),
  unique (atleta_id, data_rilevazione)
);

comment on table public.fitnesstime_misure_antropometriche is
  'Storico misure antropometriche per atleta: peso, circonferenze (cm) e pliche cutanee. Una riga per atleta/data_rilevazione (upsert).';

create index fitnesstime_misure_antrop_atleta_idx
  on public.fitnesstime_misure_antropometriche (atleta_id, data_rilevazione desc);

alter table public.fitnesstime_misure_antropometriche enable row level security;

create policy fitnesstime_misure_antrop_select on public.fitnesstime_misure_antropometriche
  for select using (atleta_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());

create policy fitnesstime_misure_antrop_staff_write on public.fitnesstime_misure_antropometriche
  for all using (public.fitnesstime_is_staff()) with check (public.fitnesstime_is_staff());

grant select on public.fitnesstime_misure_antropometriche to authenticated;
grant insert, update, delete on public.fitnesstime_misure_antropometriche to authenticated;

-- Perimetro "demo/anon" (Dashboard Istruttore senza login reale), come per le altre tabelle fitnesstime_*
grant select, insert, update, delete on public.fitnesstime_misure_antropometriche to anon;
create policy fitnesstime_demo_anon_antrop_select on public.fitnesstime_misure_antropometriche for select to anon using (true);
create policy fitnesstime_demo_anon_antrop_insert on public.fitnesstime_misure_antropometriche for insert to anon with check (true);
create policy fitnesstime_demo_anon_antrop_update on public.fitnesstime_misure_antropometriche for update to anon using (true) with check (true);
create policy fitnesstime_demo_anon_antrop_delete on public.fitnesstime_misure_antropometriche for delete to anon using (true);

commit;
