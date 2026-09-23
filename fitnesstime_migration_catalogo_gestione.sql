-- =====================================================================
-- Fitness Time Club — Migrazione: Catalogo Esercizi + Gestione (Delete/Update)
-- =====================================================================
-- Database CONDIVISO con "ASD Eternal Body Concept" (project ref:
-- gsuyrptpycrgznqjtbtx). Tocca SOLO oggetti prefissati `fitnesstime_` —
-- nessun'altra tabella del progetto (clienti, southside_*, ecc.) e'
-- toccata.
--
-- Contenuto:
--   1) Nuova tabella fitnesstime_catalogo_esercizi (lookup precaricato,
--      estratto dal modulo cartaceo "Scheda base" della palestra),
--      usata dal modal "+ Esercizio" per la selezione rapida a click.
--   2) Policy RLS "demo/anon" di UPDATE e DELETE su fitnesstime_schede,
--      fitnesstime_sessioni, fitnesstime_esercizi — mancavano dalla
--      migrazione precedente (che concedeva solo SELECT+INSERT), quindi
--      non era possibile eliminare una scheda/sessione/esercizio ne'
--      aggiornarne i campi (es. "scheda attiva") dall'app in demo mode.
--
-- Nota di sicurezza (invariata rispetto alle scorse migrazioni): queste
-- policy riguardano SOLO le tabelle fitnesstime_* e sono coerenti con lo
-- stato pre-lancio a soli dati demo (nessun atleta reale ancora
-- registrato). Il CASCADE su DELETE scheda -> sessioni -> esercizi era
-- gia' presente negli FK originali di fitnesstime_schema.sql (on delete
-- cascade), quindi non richiede modifiche allo schema.
--
-- Idempotente: rieseguibile senza effetti distruttivi.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) TABELLA fitnesstime_catalogo_esercizi
-- ---------------------------------------------------------------------
create table if not exists public.fitnesstime_catalogo_esercizi (
  id                uuid primary key default gen_random_uuid(),
  gruppo_muscolare  text not null
                      check (gruppo_muscolare in (
                        'Cardio', 'Addominali', 'Lombari', 'Pettorali', 'Dorsali',
                        'Gambe/Glutei', 'Spalle', 'Bicipiti', 'Tricipiti'
                      )),
  nome              text not null,
  ordine            integer not null default 1,
  created_at        timestamptz not null default now(),
  unique (gruppo_muscolare, nome)
);

comment on table public.fitnesstime_catalogo_esercizi is
  'Libreria precaricata di esercizi standard per gruppo muscolare, estratta dal modulo cartaceo "Scheda base" della palestra. Usata dal modal "+ Esercizio" per la selezione rapida a click (no digitazione manuale).';

create index if not exists fitnesstime_catalogo_esercizi_gruppo_idx
  on public.fitnesstime_catalogo_esercizi (gruppo_muscolare, ordine);

alter table public.fitnesstime_catalogo_esercizi enable row level security;

-- Lettura libera: e' un semplice elenco di riferimento, nessun dato
-- personale o sensibile — serve sia in demo (anon) sia a login reale.
drop policy if exists fitnesstime_catalogo_esercizi_select on public.fitnesstime_catalogo_esercizi;
create policy fitnesstime_catalogo_esercizi_select on public.fitnesstime_catalogo_esercizi
  for select
  using (true);

-- Scrittura riservata allo staff (admin/trainer autenticati) per futura
-- gestione del catalogo da pannello coach.
drop policy if exists fitnesstime_catalogo_esercizi_staff_write on public.fitnesstime_catalogo_esercizi;
create policy fitnesstime_catalogo_esercizi_staff_write on public.fitnesstime_catalogo_esercizi
  for all
  using (public.fitnesstime_is_staff())
  with check (public.fitnesstime_is_staff());

grant select on public.fitnesstime_catalogo_esercizi to anon;
grant select on public.fitnesstime_catalogo_esercizi to authenticated;
grant insert, update, delete on public.fitnesstime_catalogo_esercizi to authenticated;

-- ---------------------------------------------------------------------
-- 2) POPOLAMENTO CATALOGO (da "Scheda base/s1.jpg" .. "s4.jpg")
-- ---------------------------------------------------------------------
insert into public.fitnesstime_catalogo_esercizi (gruppo_muscolare, nome, ordine) values
  -- Cardio
  ('Cardio', 'Cyclette', 1),
  ('Cardio', 'Tapis Roulant', 2),
  ('Cardio', 'Step', 3),
  ('Cardio', 'Ellittica', 4),

  -- Addominali
  ('Addominali', 'Crunch Machine', 1),
  ('Addominali', 'Crunch Inverso', 2),
  ('Addominali', 'Crunch', 3),
  ('Addominali', 'Torsioni con Bastone', 4),
  ('Addominali', 'Piegamenti Laterali', 5),

  -- Lombari
  ('Lombari', 'Iperextension', 1),
  ('Lombari', 'Stacchi a Gambe Tese', 2),
  ('Lombari', 'Good Morning', 3),

  -- Pettorali
  ('Pettorali', 'Croci', 1),
  ('Pettorali', 'Distensioni Panca Bassa', 2),
  ('Pettorali', 'Croci ai Cavi', 3),
  ('Pettorali', 'Tirate ai Cavi Alti', 4),
  ('Pettorali', 'Distensioni Panca Alta', 5),
  ('Pettorali', 'Pectoral Machine', 6),
  ('Pettorali', 'Pull Over', 7),
  ('Pettorali', 'Tirate ai Cavi Bassi', 8),
  ('Pettorali', 'Distensioni Panca Piana', 9),
  ('Pettorali', 'Croci Panca Alta', 10),
  ('Pettorali', 'Parallele', 11),
  ('Pettorali', 'Croci ai Cavi Alti', 12),

  -- Dorsali
  ('Dorsali', 'Rematore', 1),
  ('Dorsali', 'Rematore con Bilanciere', 2),
  ('Dorsali', 'Trazione Inversa', 3),
  ('Dorsali', 'Lat Machine', 4),
  ('Dorsali', 'Rematore con Manubrio', 5),
  ('Dorsali', 'T-Bar', 6),
  ('Dorsali', 'Trazioni alla Sbarra', 7),
  ('Dorsali', 'Lat Machine Inverso', 8),
  ('Dorsali', 'Lat Machine Avanti', 9),

  -- Gambe/Glutei
  ('Gambe/Glutei', 'Affondi', 1),
  ('Gambe/Glutei', 'Adductor', 2),
  ('Gambe/Glutei', 'Pressa 45°', 3),
  ('Gambe/Glutei', 'Squat Machine', 4),
  ('Gambe/Glutei', 'Abductor', 5),
  ('Gambe/Glutei', 'Calf', 6),
  ('Gambe/Glutei', 'Squat', 7),
  ('Gambe/Glutei', 'Leg Curling', 8),
  ('Gambe/Glutei', 'Stacchi a Gambe Tese', 9),
  ('Gambe/Glutei', 'Glutei', 10),

  -- Spalle
  ('Spalle', 'Alzate Verticali', 1),
  ('Spalle', 'Deltoide Posteriore', 2),
  ('Spalle', 'Alzate Laterali 90°', 3),
  ('Spalle', 'Lento Dietro', 4),
  ('Spalle', 'Chest Deltoids', 5),
  ('Spalle', 'Deltoids Machine', 6),

  -- Bicipiti
  ('Bicipiti', 'Curl Manubri da Seduto', 1),
  ('Bicipiti', 'Curl ai Cavi Alti', 2),
  ('Bicipiti', 'Curl con Manubri', 3),
  ('Bicipiti', 'Curl ai Cavi', 4),
  ('Bicipiti', 'Curl Hummer', 5),
  ('Bicipiti', 'Curl con Bilanciere', 6),
  ('Bicipiti', 'Curl Larry Scott', 7),
  ('Bicipiti', 'Curl Concentrato', 8),

  -- Tricipiti
  ('Tricipiti', 'Tricipiti su Panca', 1),
  ('Tricipiti', 'Tricipiti alle Parallele', 2),
  ('Tricipiti', 'Tricipiti Pulley', 3),
  ('Tricipiti', 'Tricipiti 90°', 4),
  ('Tricipiti', 'French Press', 5),
  ('Tricipiti', 'Tricipiti con Manubrio', 6),
  ('Tricipiti', 'Tricipiti Inverso', 7)
on conflict (gruppo_muscolare, nome) do update set ordine = excluded.ordine;

-- ---------------------------------------------------------------------
-- 3) POLICY RLS "DEMO/ANON" — UPDATE + DELETE mancanti
-- ---------------------------------------------------------------------
-- fitnesstime_schede: serve per "Elimina scheda" ed "Rendi attiva"
-- (disattiva le altre schede dell'atleta prima di attivarne una nuova).
grant update, delete on public.fitnesstime_schede to anon;

drop policy if exists fitnesstime_demo_anon_schede_update on public.fitnesstime_schede;
create policy fitnesstime_demo_anon_schede_update on public.fitnesstime_schede
  for update to anon
  using (true)
  with check (true);

drop policy if exists fitnesstime_demo_anon_schede_delete on public.fitnesstime_schede;
create policy fitnesstime_demo_anon_schede_delete on public.fitnesstime_schede
  for delete to anon
  using (true);

-- fitnesstime_sessioni: nessuna UI di modifica diretta oggi, ma serve
-- per completare il CASCADE lato client (DELETE su scheda innesca gia'
-- il CASCADE lato database sulle sue righe collegate) e per usi futuri
-- (rinominare/riordinare i giorni della scheda).
grant update, delete on public.fitnesstime_sessioni to anon;

drop policy if exists fitnesstime_demo_anon_sessioni_update on public.fitnesstime_sessioni;
create policy fitnesstime_demo_anon_sessioni_update on public.fitnesstime_sessioni
  for update to anon
  using (true)
  with check (true);

drop policy if exists fitnesstime_demo_anon_sessioni_delete on public.fitnesstime_sessioni;
create policy fitnesstime_demo_anon_sessioni_delete on public.fitnesstime_sessioni
  for delete to anon
  using (true);

-- fitnesstime_esercizi: serve per "Rimuovi esercizio" (x/cestino nella
-- lista) ed eventuali modifiche future ai singoli esercizi.
grant update, delete on public.fitnesstime_esercizi to anon;

drop policy if exists fitnesstime_demo_anon_esercizi_update on public.fitnesstime_esercizi;
create policy fitnesstime_demo_anon_esercizi_update on public.fitnesstime_esercizi
  for update to anon
  using (true)
  with check (true);

drop policy if exists fitnesstime_demo_anon_esercizi_delete on public.fitnesstime_esercizi;
create policy fitnesstime_demo_anon_esercizi_delete on public.fitnesstime_esercizi
  for delete to anon
  using (true);

commit;

-- =====================================================================
-- FINE fitnesstime_migration_catalogo_gestione.sql
-- Verifica rapida dopo l'esecuzione:
--   select gruppo_muscolare, count(*) from public.fitnesstime_catalogo_esercizi group by 1 order by 1;
--   select tablename, policyname, cmd from pg_policies where tablename like 'fitnesstime_%' and cmd in ('UPDATE','DELETE') order by 1,3;
-- =====================================================================
