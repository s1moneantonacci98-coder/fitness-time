-- =====================================================================
-- Fitness Time Club — Migrazione: categoria atleti + Dashboard Istruttore
-- =====================================================================
-- Aggiunge la colonna `categoria` (sala_pesi / personal / nuoto) e popola
-- 8 atleti demo distribuiti tra i 3 filoni, alcuni con scheda attiva e
-- altri senza, per popolare la nuova Dashboard Istruttore.
-- Idempotente: rieseguibile senza duplicare righe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) COLONNA categoria su fitnesstime_profiles
-- ---------------------------------------------------------------------
alter table public.fitnesstime_profiles
  add column if not exists categoria text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fitnesstime_profiles_categoria_check'
  ) then
    alter table public.fitnesstime_profiles
      add constraint fitnesstime_profiles_categoria_check
      check (categoria is null or categoria in ('sala_pesi', 'personal', 'nuoto'));
  end if;
end $$;

comment on column public.fitnesstime_profiles.categoria is
  'Filone atleta per la Dashboard Istruttore: sala_pesi | personal | nuoto. NULL per staff (trainer/admin).';

-- ---------------------------------------------------------------------
-- 1) IL PROFILO "DEMO" DIVENTA IL TRAINER (senza categoria, e' staff)
-- ---------------------------------------------------------------------
update public.fitnesstime_profiles
set categoria = null
where id = '11111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------
-- 2) 8 ATLETI DEMO — 3 sala_pesi, 3 personal, 2 nuoto
-- ---------------------------------------------------------------------
insert into public.fitnesstime_profiles (id, user_id, ruolo, nome, cognome, email, telefono, categoria, note, attivo)
values
  ('a0000001-0000-4000-8000-000000000001', null, 'athlete', 'Marco',  'Rossi',   'marco.rossi.demo@fitnesstime.local',   '333 1110001', 'sala_pesi', 'Obiettivo: ipertrofia generale.', true),
  ('a0000001-0000-4000-8000-000000000002', null, 'athlete', 'Giulia', 'Bianchi', 'giulia.bianchi.demo@fitnesstime.local', '333 1110002', 'sala_pesi', 'Nuova iscritta, scheda da assegnare.', true),
  ('a0000001-0000-4000-8000-000000000003', null, 'athlete', 'Elena',  'Conti',   'elena.conti.demo@fitnesstime.local',    '333 1110003', 'sala_pesi', 'Ricomposizione corporea.', true),
  ('a0000001-0000-4000-8000-000000000004', null, 'athlete', 'Luca',   'Verdi',   'luca.verdi.demo@fitnesstime.local',     '333 1110004', 'personal',  'Personal training 2x/settimana.', true),
  ('a0000001-0000-4000-8000-000000000005', null, 'athlete', 'Sara',   'Neri',    'sara.neri.demo@fitnesstime.local',      '333 1110005', 'personal',  'Prima valutazione fatta, scheda in preparazione.', true),
  ('a0000001-0000-4000-8000-000000000006', null, 'athlete', 'Davide', 'Galli',   'davide.galli.demo@fitnesstime.local',   '333 1110006', 'personal',  'In attesa di assegnazione scheda.', true),
  ('a0000001-0000-4000-8000-000000000007', null, 'athlete', 'Anna',   'Russo',   'anna.russo.demo@fitnesstime.local',     '333 1110007', 'nuoto',     'Corso avanzato, 3 vasche/settimana.', true),
  ('a0000001-0000-4000-8000-000000000008', null, 'athlete', 'Paolo',  'Ferrari', 'paolo.ferrari.demo@fitnesstime.local',  '333 1110008', 'nuoto',     'Corso base, appena iscritto.', true)
on conflict (id) do update set
  nome = excluded.nome,
  cognome = excluded.cognome,
  email = excluded.email,
  telefono = excluded.telefono,
  categoria = excluded.categoria,
  note = excluded.note,
  attivo = excluded.attivo,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 3) RIASSEGNAZIONE scheda demo esistente a Marco Rossi (sala_pesi)
-- ---------------------------------------------------------------------
update public.fitnesstime_schede
set profile_id = 'a0000001-0000-4000-8000-000000000001'
where id = '22222222-2222-4222-8222-222222222222';

-- ---------------------------------------------------------------------
-- 4) NUOVA SCHEDA — Elena Conti (sala_pesi)
-- ---------------------------------------------------------------------
insert into public.fitnesstime_schede (id, profile_id, titolo, obiettivo, settimane_durata, note_coach, attiva)
values (
  '22222222-2222-4222-8222-222222222223',
  'a0000001-0000-4000-8000-000000000003',
  'Scheda Sala Pesi — Ricomposizione 2 giorni',
  'Ricomposizione corporea',
  6,
  'Scheda di esempio (demo).',
  true
)
on conflict (id) do update set titolo = excluded.titolo, obiettivo = excluded.obiettivo, updated_at = now();

insert into public.fitnesstime_sessioni (id, scheda_id, nome, ordine, note)
values
  ('33333333-3333-4333-8333-333333333341', '22222222-2222-4222-8222-222222222223', 'Giorno A — Upper Body', 1, null),
  ('33333333-3333-4333-8333-333333333342', '22222222-2222-4222-8222-222222222223', 'Giorno B — Lower Body', 2, null)
on conflict (id) do update set nome = excluded.nome, ordine = excluded.ordine;

delete from public.fitnesstime_esercizi
where sessione_id in ('33333333-3333-4333-8333-333333333341', '33333333-3333-4333-8333-333333333342');

insert into public.fitnesstime_esercizi (sessione_id, nome, target_muscolare, ordine, schema_serie, serie, ripetizioni, tempo_recupero_secondi)
values
  ('33333333-3333-4333-8333-333333333341', 'Lat Machine', 'Dorsali', 1, 'lineare', 3, '12', 75),
  ('33333333-3333-4333-8333-333333333341', 'Distensioni Panca Piana', 'Pettorali', 2, 'lineare', 3, '10', 90),
  ('33333333-3333-4333-8333-333333333341', 'Curl Manubri', 'Bicipiti', 3, 'lineare', 3, '12', 60),
  ('33333333-3333-4333-8333-333333333342', 'Squat', 'Gambe/Glutei', 1, 'lineare', 4, '10', 100),
  ('33333333-3333-4333-8333-333333333342', 'Leg Curling', 'Gambe/Glutei', 2, 'lineare', 3, '12', 75),
  ('33333333-3333-4333-8333-333333333342', 'Crunch', 'Addominali', 3, 'lineare', 3, '20', 45);

-- ---------------------------------------------------------------------
-- 5) NUOVA SCHEDA — Luca Verdi (personal)
-- ---------------------------------------------------------------------
insert into public.fitnesstime_schede (id, profile_id, titolo, obiettivo, settimane_durata, note_coach, attiva)
values (
  '22222222-2222-4222-8222-222222222224',
  'a0000001-0000-4000-8000-000000000004',
  'Scheda Personal Training — Forza',
  'Aumento forza massimale',
  8,
  'Scheda di esempio (demo). Seguito 1:1 dal coach.',
  true
)
on conflict (id) do update set titolo = excluded.titolo, obiettivo = excluded.obiettivo, updated_at = now();

insert into public.fitnesstime_sessioni (id, scheda_id, nome, ordine, note)
values ('33333333-3333-4333-8333-333333333351', '22222222-2222-4222-8222-222222222224', 'Sessione Personal — Full Body', 1, 'Seduta seguita interamente dal coach.')
on conflict (id) do update set nome = excluded.nome, ordine = excluded.ordine;

delete from public.fitnesstime_esercizi where sessione_id = '33333333-3333-4333-8333-333333333351';

insert into public.fitnesstime_esercizi (sessione_id, nome, target_muscolare, ordine, schema_serie, serie, ripetizioni, tempo_recupero_secondi, note_tecniche)
values
  ('33333333-3333-4333-8333-333333333351', 'Squat', 'Gambe/Glutei', 1, 'piramidale', 5, '5', 150, 'Progressione di carico serie per serie.'),
  ('33333333-3333-4333-8333-333333333351', 'Distensioni Panca Piana', 'Pettorali', 2, 'piramidale', 5, '5', 150, null),
  ('33333333-3333-4333-8333-333333333351', 'Stacchi da Terra', 'Lombari', 3, 'lineare', 3, '5', 180, 'Tecnica prima del carico.');

-- ---------------------------------------------------------------------
-- 6) NUOVA SCHEDA — Anna Russo (nuoto)
-- ---------------------------------------------------------------------
insert into public.fitnesstime_schede (id, profile_id, titolo, obiettivo, settimane_durata, note_coach, attiva)
values (
  '22222222-2222-4222-8222-222222222225',
  'a0000001-0000-4000-8000-000000000007',
  'Programma Nuoto — Tecnica e Resistenza',
  'Migliorare passo gara stile libero',
  6,
  'Scheda di esempio (demo).',
  true
)
on conflict (id) do update set titolo = excluded.titolo, obiettivo = excluded.obiettivo, updated_at = now();

insert into public.fitnesstime_sessioni (id, scheda_id, nome, ordine, note)
values ('33333333-3333-4333-8333-333333333361', '22222222-2222-4222-8222-222222222225', 'Vasca A — Tecnica e Resistenza', 1, 'Riscaldamento 200m libero prima di iniziare.')
on conflict (id) do update set nome = excluded.nome, ordine = excluded.ordine;

delete from public.fitnesstime_esercizi where sessione_id = '33333333-3333-4333-8333-333333333361';

insert into public.fitnesstime_esercizi (sessione_id, nome, target_muscolare, ordine, schema_serie, serie, ripetizioni, tempo_recupero_secondi, note_tecniche)
values
  ('33333333-3333-4333-8333-333333333361', 'Stile Libero — Serie', 'Nuoto completo', 1, 'altro', 6, '50m', 30, 'Ritmo gara, cura la respirazione bilaterale.'),
  ('33333333-3333-4333-8333-333333333361', 'Gambe con Tavoletta', 'Gambe', 2, 'altro', 4, '50m', 20, null),
  ('33333333-3333-4333-8333-333333333361', 'Dorso — Tecnica', 'Nuoto completo', 3, 'altro', 4, '50m', 30, 'Focus rotazione del corpo.');

-- =====================================================================
-- 7) POLICY RLS "DEMO/COACH" — sostituiscono le policy scoped al solo
--    profilo trainer (introdotte nella migrazione precedente) con policy
--    che coprono TUTTI gli atleti demo, per far funzionare la Dashboard
--    Istruttore (che opera senza login reale, ruolo anon).
-- =====================================================================
-- Nota di sicurezza (invariata rispetto alla scorsa migrazione): il
-- progetto Supabase e' condiviso con altre app reali (ASD Eternal Body
-- Concept, Southside). Queste policy toccano SOLO le tabelle
-- fitnesstime_* (profiles/schede/sessioni/esercizi/workout_logs) e SOLO
-- concedono SELECT + INSERT (mai UPDATE/DELETE) — coerente con l'uso
-- pre-lancio a soli dati demo di questa app. Nessun'altra tabella del
-- progetto e' toccata.

grant select, insert on public.fitnesstime_profiles to anon;
grant select, insert on public.fitnesstime_schede to anon;
grant select, insert on public.fitnesstime_sessioni to anon;
grant select, insert on public.fitnesstime_esercizi to anon;
grant select, insert on public.fitnesstime_workout_logs to anon;

-- profiles: SELECT su staff + atleti; INSERT per creare nuovi atleti dal pulsante "+ Nuovo Atleta"
drop policy if exists fitnesstime_demo_anon_profiles_select on public.fitnesstime_profiles;
create policy fitnesstime_demo_anon_profiles_select on public.fitnesstime_profiles
  for select to anon
  using (true);

drop policy if exists fitnesstime_demo_anon_profiles_insert on public.fitnesstime_profiles;
create policy fitnesstime_demo_anon_profiles_insert on public.fitnesstime_profiles
  for insert to anon
  with check (ruolo = 'athlete');

-- schede: SELECT/INSERT su tutte (necessario per "+ Assegna Nuova Scheda")
drop policy if exists fitnesstime_demo_anon_schede_select on public.fitnesstime_schede;
create policy fitnesstime_demo_anon_schede_select on public.fitnesstime_schede
  for select to anon
  using (true);

drop policy if exists fitnesstime_demo_anon_schede_insert on public.fitnesstime_schede;
create policy fitnesstime_demo_anon_schede_insert on public.fitnesstime_schede
  for insert to anon
  with check (true);

-- sessioni: SELECT/INSERT su tutte (creazione giorni A/B/C per nuove schede)
drop policy if exists fitnesstime_demo_anon_sessioni_select on public.fitnesstime_sessioni;
create policy fitnesstime_demo_anon_sessioni_select on public.fitnesstime_sessioni
  for select to anon
  using (true);

drop policy if exists fitnesstime_demo_anon_sessioni_insert on public.fitnesstime_sessioni;
create policy fitnesstime_demo_anon_sessioni_insert on public.fitnesstime_sessioni
  for insert to anon
  with check (true);

-- esercizi: SELECT/INSERT su tutti (gia' presente dalla scorsa migrazione, riscritta senza lo scoping al singolo profilo)
drop policy if exists fitnesstime_demo_anon_esercizi_select on public.fitnesstime_esercizi;
create policy fitnesstime_demo_anon_esercizi_select on public.fitnesstime_esercizi
  for select to anon
  using (true);

drop policy if exists fitnesstime_demo_anon_esercizi_insert on public.fitnesstime_esercizi;
create policy fitnesstime_demo_anon_esercizi_insert on public.fitnesstime_esercizi
  for insert to anon
  with check (true);

-- workout_logs: SELECT/INSERT solo per righe legate a profili "athlete" demo
-- (necessario per "Simula Allenamento": il log delle serie usa un insert
-- diretto, non la RPC fitnesstime_log_set che richiede un login reale).
drop policy if exists fitnesstime_demo_anon_logs_select on public.fitnesstime_workout_logs;
create policy fitnesstime_demo_anon_logs_select on public.fitnesstime_workout_logs
  for select to anon
  using (
    profile_id in (select id from public.fitnesstime_profiles where ruolo = 'athlete')
  );

drop policy if exists fitnesstime_demo_anon_logs_insert on public.fitnesstime_workout_logs;
create policy fitnesstime_demo_anon_logs_insert on public.fitnesstime_workout_logs
  for insert to anon
  with check (
    profile_id in (select id from public.fitnesstime_profiles where ruolo = 'athlete')
  );
