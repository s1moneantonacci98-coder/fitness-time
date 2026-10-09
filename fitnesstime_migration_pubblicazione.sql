-- =====================================================================
-- Fitness Time — pubblicazione scheda/BIA agli utenti + circonferenze
-- PARTE A (additiva): colonne e policy per utenti autenticati
-- =====================================================================

-- 1) Scheda: visibile all'atleta solo dopo "Pubblica" (Andrea)
alter table public.fitnesstime_schede
  add column if not exists pubblicata boolean not null default false;

-- 2) BIA: pubblicazione + origine (staff = Andrea, atleta = valori inseriti dall'utente)
alter table public.fitnesstime_misure_bia
  add column if not exists pubblicata boolean not null default false,
  add column if not exists inserita_da text not null default 'staff';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fitnesstime_misure_bia_inserita_da_chk') then
    alter table public.fitnesstime_misure_bia
      add constraint fitnesstime_misure_bia_inserita_da_chk check (inserita_da in ('staff', 'atleta'));
  end if;
end $$;

-- 3) Circonferenze (tabella già presente): colonne extra + una rilevazione al giorno
alter table public.fitnesstime_misure_antropometriche
  add column if not exists fianchi_cm numeric,
  add column if not exists addome_cm numeric;

create unique index if not exists fitnesstime_misure_antrop_atleta_data_uq
  on public.fitnesstime_misure_antropometriche (atleta_id, data_rilevazione);

-- 4) SELECT: l'atleta vede solo il pubblicato (lo staff vede tutto)
drop policy if exists fitnesstime_schede_select on public.fitnesstime_schede;
create policy fitnesstime_schede_select on public.fitnesstime_schede
  for select to authenticated
  using (fitnesstime_is_staff() or (profile_id = fitnesstime_profile_id() and pubblicata));

drop policy if exists fitnesstime_sessioni_select on public.fitnesstime_sessioni;
create policy fitnesstime_sessioni_select on public.fitnesstime_sessioni
  for select to authenticated
  using (
    fitnesstime_is_staff() or exists (
      select 1 from public.fitnesstime_schede sc
       where sc.id = fitnesstime_sessioni.scheda_id
         and sc.profile_id = fitnesstime_profile_id()
         and sc.pubblicata
    )
  );

drop policy if exists fitnesstime_esercizi_select on public.fitnesstime_esercizi;
create policy fitnesstime_esercizi_select on public.fitnesstime_esercizi
  for select to authenticated
  using (
    fitnesstime_is_staff() or exists (
      select 1
        from public.fitnesstime_sessioni s
        join public.fitnesstime_schede sc on sc.id = s.scheda_id
       where s.id = fitnesstime_esercizi.sessione_id
         and sc.profile_id = fitnesstime_profile_id()
         and sc.pubblicata
    )
  );

drop policy if exists fitnesstime_misure_bia_select on public.fitnesstime_misure_bia;
create policy fitnesstime_misure_bia_select on public.fitnesstime_misure_bia
  for select to authenticated
  using (
    fitnesstime_is_staff()
    or (atleta_id = fitnesstime_profile_id() and (pubblicata or inserita_da = 'atleta'))
  );

-- 5) L'atleta può inserire/correggere/eliminare SOLO i propri valori BIA
drop policy if exists fitnesstime_misure_bia_atleta_insert on public.fitnesstime_misure_bia;
create policy fitnesstime_misure_bia_atleta_insert on public.fitnesstime_misure_bia
  for insert to authenticated
  with check (atleta_id = fitnesstime_profile_id() and inserita_da = 'atleta');

drop policy if exists fitnesstime_misure_bia_atleta_update on public.fitnesstime_misure_bia;
create policy fitnesstime_misure_bia_atleta_update on public.fitnesstime_misure_bia
  for update to authenticated
  using (atleta_id = fitnesstime_profile_id() and inserita_da = 'atleta')
  with check (atleta_id = fitnesstime_profile_id() and inserita_da = 'atleta');

drop policy if exists fitnesstime_misure_bia_atleta_delete on public.fitnesstime_misure_bia;
create policy fitnesstime_misure_bia_atleta_delete on public.fitnesstime_misure_bia
  for delete to authenticated
  using (atleta_id = fitnesstime_profile_id() and inserita_da = 'atleta');

-- 6) Circonferenze: lettura per l'atleta (proprie), scrittura solo staff (policy già esistenti)
--    nessuna modifica necessaria a fitnesstime_misure_antrop_select / _staff_write.

-- =====================================================================
-- PARTE B (chiusura): fine modalità demo — via le policy anon aperte
-- Da applicare quando l'app passa al login reale (DEMO_MODE = false).
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename like 'fitnesstime\_%'
       and (policyname like 'fitnesstime\_demo\_anon\_%' or policyname = 'fitnesstime_profiles_anon_delete_atleti')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Nessun accesso per utenti non autenticati alle tabelle dell'app
revoke all on public.fitnesstime_profiles, public.fitnesstime_schede, public.fitnesstime_sessioni,
  public.fitnesstime_esercizi, public.fitnesstime_workout_logs, public.fitnesstime_misure_bia,
  public.fitnesstime_misure_antropometriche, public.fitnesstime_catalogo_esercizi from anon;

-- Igiene: gli utenti loggati non hanno bisogno di TRUNCATE/TRIGGER/REFERENCES
revoke truncate, trigger, references on public.fitnesstime_profiles, public.fitnesstime_schede,
  public.fitnesstime_sessioni, public.fitnesstime_esercizi, public.fitnesstime_workout_logs,
  public.fitnesstime_misure_bia, public.fitnesstime_misure_antropometriche,
  public.fitnesstime_catalogo_esercizi from authenticated;
