-- =====================================================================
-- Fitness Time Club — Migrazione: Modulo BIA (Bioimpedenziometria)
-- =====================================================================
-- Database CONDIVISO con "ASD Eternal Body Concept" (project ref:
-- gsuyrptpycrgznqjtbtx). Tocca SOLO oggetti prefissati `fitnesstime_` —
-- nessun'altra tabella del progetto (clienti, southside_*, ecc.) e'
-- toccata.
--
-- Contenuto:
--   1) Nuova tabella fitnesstime_misure_bia — storico rilevazioni di
--      composizione corporea (peso, % grasso, massa magra, idratazione,
--      grasso viscerale) per atleta, una riga per atleta/data_rilevazione.
--   2) RLS: stesso perimetro di sicurezza delle altre tabelle
--      fitnesstime_* — staff (admin/trainer) accesso completo; atleta
--      autenticato vede solo le proprie rilevazioni; policy "demo/anon"
--      (stesso pattern di fitnesstime_schede/sessioni/esercizi) per
--      operare senza login reale dalla Dashboard Istruttore.
--   3) Seed demo: 2 rilevazioni per Elena Conti a un mese di distanza,
--      per mostrare subito un progresso nella card BIA del profilo.
--
-- Applicata live sul progetto Supabase condiviso tramite MCP il
-- 2026-09-23 (vedi PROJECT_STATUS.md § 3quinquies). Idempotente:
-- rieseguibile senza effetti distruttivi.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) TABELLA fitnesstime_misure_bia
-- ---------------------------------------------------------------------
create table if not exists public.fitnesstime_misure_bia (
  id                  uuid primary key default gen_random_uuid(),
  atleta_id           uuid not null references public.fitnesstime_profiles(id) on delete cascade,
  data_rilevazione    date not null default current_date,
  peso_kg             numeric check (peso_kg is null or peso_kg > 0),
  massa_grassa_perc   numeric check (massa_grassa_perc is null or (massa_grassa_perc >= 0 and massa_grassa_perc <= 100)),
  massa_magra_kg      numeric check (massa_magra_kg is null or massa_magra_kg >= 0),
  acqua_perc          numeric check (acqua_perc is null or (acqua_perc >= 0 and acqua_perc <= 100)),
  grasso_viscerale    numeric check (grasso_viscerale is null or grasso_viscerale >= 0),
  note                text,
  created_at          timestamptz not null default now(),
  unique (atleta_id, data_rilevazione)
);

comment on table public.fitnesstime_misure_bia is
  'Storico rilevazioni BIA (bioimpedenziometria) per atleta: peso, % massa grassa, massa magra, % idratazione, grasso viscerale. Una riga per atleta/data_rilevazione (upsert su nuova misurazione lo stesso giorno).';

create index if not exists fitnesstime_misure_bia_atleta_idx
  on public.fitnesstime_misure_bia (atleta_id, data_rilevazione desc);

alter table public.fitnesstime_misure_bia enable row level security;

-- ---------------------------------------------------------------------
-- 2) RLS — perimetro "reale" (staff / atleta autenticato)
-- ---------------------------------------------------------------------
drop policy if exists fitnesstime_misure_bia_select on public.fitnesstime_misure_bia;
create policy fitnesstime_misure_bia_select on public.fitnesstime_misure_bia
  for select
  using (atleta_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());

drop policy if exists fitnesstime_misure_bia_staff_write on public.fitnesstime_misure_bia;
create policy fitnesstime_misure_bia_staff_write on public.fitnesstime_misure_bia
  for all
  using (public.fitnesstime_is_staff())
  with check (public.fitnesstime_is_staff());

grant select on public.fitnesstime_misure_bia to authenticated;
grant insert, update, delete on public.fitnesstime_misure_bia to authenticated;

-- ---------------------------------------------------------------------
-- 3) RLS — perimetro "demo/anon" (Dashboard Istruttore senza login reale)
-- ---------------------------------------------------------------------
-- Stesso pattern gia' in uso per fitnesstime_schede/sessioni/esercizi:
-- accesso completo in lettura/scrittura per il ruolo anon, scoping solo
-- alle tabelle fitnesstime_* — nessun'altra tabella del progetto
-- condiviso e' toccata.
grant select, insert, update, delete on public.fitnesstime_misure_bia to anon;

drop policy if exists fitnesstime_demo_anon_bia_select on public.fitnesstime_misure_bia;
create policy fitnesstime_demo_anon_bia_select on public.fitnesstime_misure_bia
  for select to anon
  using (true);

drop policy if exists fitnesstime_demo_anon_bia_insert on public.fitnesstime_misure_bia;
create policy fitnesstime_demo_anon_bia_insert on public.fitnesstime_misure_bia
  for insert to anon
  with check (true);

drop policy if exists fitnesstime_demo_anon_bia_update on public.fitnesstime_misure_bia;
create policy fitnesstime_demo_anon_bia_update on public.fitnesstime_misure_bia
  for update to anon
  using (true)
  with check (true);

drop policy if exists fitnesstime_demo_anon_bia_delete on public.fitnesstime_misure_bia;
create policy fitnesstime_demo_anon_bia_delete on public.fitnesstime_misure_bia
  for delete to anon
  using (true);

-- ---------------------------------------------------------------------
-- 4) SEED DEMO — 2 rilevazioni per Elena Conti (progresso a un mese)
-- ---------------------------------------------------------------------
insert into public.fitnesstime_misure_bia
  (atleta_id, data_rilevazione, peso_kg, massa_grassa_perc, massa_magra_kg, acqua_perc, grasso_viscerale, note)
values
  ('a0000001-0000-4000-8000-000000000003', (current_date - interval '1 month')::date, 68.4, 26.8, 50.1, 52.3, 8, 'Prima rilevazione BIA, a digiuno.'),
  ('a0000001-0000-4000-8000-000000000003', current_date, 66.9, 24.5, 50.5, 54.1, 7, 'Controllo mensile — buoni progressi.')
on conflict (atleta_id, data_rilevazione) do update set
  peso_kg = excluded.peso_kg,
  massa_grassa_perc = excluded.massa_grassa_perc,
  massa_magra_kg = excluded.massa_magra_kg,
  acqua_perc = excluded.acqua_perc,
  grasso_viscerale = excluded.grasso_viscerale,
  note = excluded.note;

commit;

-- =====================================================================
-- FINE fitnesstime_migration_bia.sql
-- Verifica rapida dopo l'esecuzione:
--   select atleta_id, data_rilevazione, peso_kg, massa_grassa_perc from public.fitnesstime_misure_bia order by data_rilevazione;
--   select tablename, policyname, cmd from pg_policies where tablename = 'fitnesstime_misure_bia' order by cmd;
-- =====================================================================
