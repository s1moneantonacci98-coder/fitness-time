-- =====================================================================
-- FITNESS TIME CLUB (Adelfia, BA) — Schema applicativo
-- Database CONDIVISO con "ASD Eternal Body Concept" (project ref:
-- gsuyrptpycrgznqjtbtx). Tutti gli oggetti sono prefissati
-- `fitnesstime_` per garantire isolamento totale dai dati preesistenti
-- di ASD (clienti, log_accessi, staff, ...) e di Southside
-- (southside_*).
--
-- Script idempotente: puo' essere rieseguito piu' volte nello SQL
-- Editor di Supabase senza effetti distruttivi (IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS + CREATE).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. ESTENSIONI
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()


-- =====================================================================
-- 1. TABELLE
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1 fitnesstime_profiles — anagrafica atleti / staff
-- ---------------------------------------------------------------------
-- `id` e' la chiave applicativa; `user_id` viene collegato solo al primo
-- login (pattern identico a southside_profiles / clienti): questo
-- permette al coach di creare la scheda PRIMA che l'atleta si registri.
create table if not exists public.fitnesstime_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  ruolo           text not null default 'athlete'
                    check (ruolo in ('admin', 'trainer', 'athlete')),
  nome            text not null,
  cognome         text not null default '',
  email           text not null,
  telefono        text,
  data_nascita    date,
  note            text,               -- anamnesi / obiettivi
  attivo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.fitnesstime_profiles is
  'Anagrafica atleti e staff di Fitness Time Club. user_id e'' NULL finche'' l''atleta non completa la registrazione.';

create unique index if not exists fitnesstime_profiles_email_lower_idx
  on public.fitnesstime_profiles (lower(email));

create index if not exists fitnesstime_profiles_ruolo_idx
  on public.fitnesstime_profiles (ruolo);


-- ---------------------------------------------------------------------
-- 1.2 fitnesstime_schede — scheda di allenamento assegnata a un atleta
-- ---------------------------------------------------------------------
create table if not exists public.fitnesstime_schede (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.fitnesstime_profiles(id) on delete cascade,
  titolo            text not null,
  obiettivo         text,
  data_inizio       date not null default current_date,
  data_scadenza     date,
  settimane_durata  integer check (settimane_durata > 0),
  note_coach        text,
  attiva            boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fitnesstime_schede_date_coerenti
    check (data_scadenza is null or data_scadenza >= data_inizio)
);

comment on table public.fitnesstime_schede is
  'Scheda di allenamento (macrociclo) assegnata a un atleta.';

create index if not exists fitnesstime_schede_profile_idx
  on public.fitnesstime_schede (profile_id);

create index if not exists fitnesstime_schede_attiva_idx
  on public.fitnesstime_schede (profile_id, attiva);


-- ---------------------------------------------------------------------
-- 1.3 fitnesstime_sessioni — giorni di split della scheda (A/B/C/Full)
-- ---------------------------------------------------------------------
create table if not exists public.fitnesstime_sessioni (
  id          uuid primary key default gen_random_uuid(),
  scheda_id   uuid not null references public.fitnesstime_schede(id) on delete cascade,
  nome        text not null,             -- es. "Giorno A - Spinta/Quadricipiti"
  ordine      integer not null default 1,
  note        text,
  created_at  timestamptz not null default now(),
  unique (scheda_id, ordine)
);

comment on table public.fitnesstime_sessioni is
  'Giorno di split (Giorno A/B/C, Full Body, ...) appartenente a una scheda.';

create index if not exists fitnesstime_sessioni_scheda_idx
  on public.fitnesstime_sessioni (scheda_id);


-- ---------------------------------------------------------------------
-- 1.4 fitnesstime_esercizi — esercizi di ogni sessione
-- ---------------------------------------------------------------------
create table if not exists public.fitnesstime_esercizi (
  id                      uuid primary key default gen_random_uuid(),
  sessione_id             uuid not null references public.fitnesstime_sessioni(id) on delete cascade,
  nome                    text not null,
  target_muscolare        text,
  video_url               text,
  ordine                  integer not null default 1,
  schema_serie            text not null default 'lineare'
                            check (schema_serie in
                              ('lineare', 'piramidale', 'piramidale_inverso',
                               'stripping', 'rest-pause', 'amrap', 'altro')),
  serie                   integer not null check (serie > 0),
  ripetizioni             text not null,      -- es. "8-10", "12", "AMRAP"
  carico_target           text,               -- es. "60 kg", "corpo libero"
  percentuale_1rm         numeric(5,2) check (percentuale_1rm is null or percentuale_1rm between 0 and 150),
  rpe                     numeric(3,1) check (rpe is null or rpe between 0 and 10),
  rir                     numeric(3,1) check (rir is null or rir between 0 and 10),
  tempo_recupero_secondi  integer not null default 90 check (tempo_recupero_secondi >= 0),
  note_tecniche           text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.fitnesstime_esercizi is
  'Singolo esercizio dentro una sessione: schema serie/ripetizioni, carico target, recupero.';

create index if not exists fitnesstime_esercizi_sessione_idx
  on public.fitnesstime_esercizi (sessione_id);


-- ---------------------------------------------------------------------
-- 1.5 fitnesstime_workout_logs — log esecutivo (storico allenamenti)
-- ---------------------------------------------------------------------
create table if not exists public.fitnesstime_workout_logs (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.fitnesstime_profiles(id) on delete cascade,
  sessione_id             uuid not null references public.fitnesstime_sessioni(id) on delete cascade,
  esercizio_id            uuid references public.fitnesstime_esercizi(id) on delete set null,
  data_esecuzione         date not null default current_date,
  serie_numero            integer not null default 1 check (serie_numero > 0),
  carico_kg               numeric(6,2) check (carico_kg is null or carico_kg >= 0),
  ripetizioni_effettive   integer check (ripetizioni_effettive is null or ripetizioni_effettive >= 0),
  rpe_percepito           numeric(3,1) check (rpe_percepito is null or rpe_percepito between 0 and 10),
  note                    text,               -- sensazioni / infortuni / varianti
  created_at              timestamptz not null default now()
);

comment on table public.fitnesstime_workout_logs is
  'Storico esecutivo: carichi realmente usati e sensazioni, serie per serie, per il sovraccarico progressivo.';

create index if not exists fitnesstime_workout_logs_profile_idx
  on public.fitnesstime_workout_logs (profile_id, data_esecuzione desc);

create index if not exists fitnesstime_workout_logs_esercizio_idx
  on public.fitnesstime_workout_logs (esercizio_id);

create index if not exists fitnesstime_workout_logs_sessione_idx
  on public.fitnesstime_workout_logs (sessione_id);


-- =====================================================================
-- 2. FUNZIONI DI SUPPORTO (RUOLI, TIMESTAMP)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2.1 fitnesstime_set_updated_at — trigger generico per updated_at
-- ---------------------------------------------------------------------
create or replace function public.fitnesstime_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_fitnesstime_profiles_updated_at on public.fitnesstime_profiles;
create trigger trg_fitnesstime_profiles_updated_at
  before update on public.fitnesstime_profiles
  for each row execute function public.fitnesstime_set_updated_at();

drop trigger if exists trg_fitnesstime_schede_updated_at on public.fitnesstime_schede;
create trigger trg_fitnesstime_schede_updated_at
  before update on public.fitnesstime_schede
  for each row execute function public.fitnesstime_set_updated_at();

drop trigger if exists trg_fitnesstime_esercizi_updated_at on public.fitnesstime_esercizi;
create trigger trg_fitnesstime_esercizi_updated_at
  before update on public.fitnesstime_esercizi
  for each row execute function public.fitnesstime_set_updated_at();


-- ---------------------------------------------------------------------
-- 2.2 fitnesstime_is_staff — true se l'utente e' admin o trainer
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: legge fitnesstime_profiles bypassando la RLS della
-- tabella stessa, altrimenti le policy che la richiamano andrebbero in
-- ricorsione. Nessun parametro accettato dal client: usa sempre
-- auth.uid() della sessione corrente.
create or replace function public.fitnesstime_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
      from public.fitnesstime_profiles p
     where p.user_id = auth.uid()
       and p.ruolo in ('admin', 'trainer')
       and p.attivo
  );
$function$;

comment on function public.fitnesstime_is_staff() is
  'true se auth.uid() corrisponde a un profilo attivo con ruolo admin o trainer. Usata dalle policy RLS.';


-- ---------------------------------------------------------------------
-- 2.3 fitnesstime_profile_id — id del profilo del chiamante
-- ---------------------------------------------------------------------
create or replace function public.fitnesstime_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select p.id
    from public.fitnesstime_profiles p
   where p.user_id = auth.uid()
   limit 1;
$function$;

comment on function public.fitnesstime_profile_id() is
  'id in fitnesstime_profiles collegato all''utente autenticato corrente, o NULL.';


-- =====================================================================
-- 3. TRIGGER SU auth.users — collegamento / creazione profilo
-- =====================================================================
-- Scatta SOLO quando raw_user_meta_data->>'app' = 'fitnesstime', cosi'
-- da non interferire con le registrazioni di ASD o Southside sullo
-- stesso progetto Supabase (pattern identico a
-- southside_handle_new_user).
create or replace function public.fitnesstime_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_nome     text;
  v_cognome  text;
  v_telefono text;
begin
  if coalesce(new.raw_user_meta_data->>'app', '') <> 'fitnesstime' then
    return new;
  end if;

  v_nome     := nullif(left(trim(coalesce(new.raw_user_meta_data->>'nome', '')), 60), '');
  v_cognome  := nullif(left(trim(coalesce(new.raw_user_meta_data->>'cognome', '')), 60), '');
  v_telefono := nullif(left(trim(coalesce(new.raw_user_meta_data->>'telefono', '')), 30), '');

  -- Profilo creato dal coach prima della registrazione (scheda su carta
  -- gia' caricata): lo collega invece di duplicarlo. Ruolo e stato
  -- attivo NON vengono mai toccati dai metadati del client.
  update public.fitnesstime_profiles
     set user_id      = new.id,
         nome          = coalesce(nullif(nome, ''), v_nome, nome),
         cognome       = coalesce(nullif(cognome, ''), v_cognome, cognome),
         telefono      = coalesce(telefono, v_telefono)
   where user_id is null
     and lower(email) = lower(new.email);

  if found then
    return new;
  end if;

  -- Nessun profilo preesistente: ne creiamo uno nuovo come 'athlete'.
  -- Il ruolo admin/trainer si assegna solo manualmente da chi gestisce
  -- il database, mai in autoregistrazione.
  insert into public.fitnesstime_profiles (
    user_id, ruolo, nome, cognome, email, telefono
  )
  values (
    new.id,
    'athlete',
    coalesce(v_nome, 'Da completare'),
    coalesce(v_cognome, ''),
    new.email,
    v_telefono
  )
  on conflict (user_id) do nothing;

  return new;

exception when others then
  -- La creazione dell'account non deve mai fallire per un problema sul
  -- profilo applicativo: meglio un profilo da completare a mano.
  raise warning 'fitnesstime_handle_new_user: profilo non creato per % (%): %', new.email, new.id, sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_fitnesstime_on_auth_user_created on auth.users;
create trigger trg_fitnesstime_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fitnesstime_handle_new_user();


-- =====================================================================
-- 4. RPC APPLICATIVE
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 fitnesstime_log_set — salvataggio rapido di una serie eseguita
-- ---------------------------------------------------------------------
-- Pensata per il tap "serie completata" in sala pesi: valida che
-- l'esercizio appartenga davvero alla sessione indicata e che la
-- sessione appartenga a una scheda dell'atleta chiamante, poi inserisce
-- il log con il profilo dedotto da auth.uid() (mai passato dal client).
create or replace function public.fitnesstime_log_set(
  p_sessione_id            uuid,
  p_esercizio_id            uuid,
  p_serie_numero            integer,
  p_carico_kg               numeric,
  p_ripetizioni_effettive   integer,
  p_rpe_percepito           numeric default null,
  p_note                    text default null
)
returns public.fitnesstime_workout_logs
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile_id uuid;
  v_row        public.fitnesstime_workout_logs;
begin
  v_profile_id := public.fitnesstime_profile_id();

  if v_profile_id is null then
    raise exception 'Nessun profilo Fitness Time collegato a questo account.';
  end if;

  if not exists (
    select 1
      from public.fitnesstime_sessioni s
      join public.fitnesstime_schede sc on sc.id = s.scheda_id
     where s.id = p_sessione_id
       and sc.profile_id = v_profile_id
  ) and not public.fitnesstime_is_staff() then
    raise exception 'Sessione non trovata o non appartenente all''atleta corrente.';
  end if;

  if p_esercizio_id is not null and not exists (
    select 1 from public.fitnesstime_esercizi e
     where e.id = p_esercizio_id and e.sessione_id = p_sessione_id
  ) then
    raise exception 'Esercizio non appartenente alla sessione indicata.';
  end if;

  insert into public.fitnesstime_workout_logs (
    profile_id, sessione_id, esercizio_id, serie_numero,
    carico_kg, ripetizioni_effettive, rpe_percepito, note
  )
  values (
    v_profile_id, p_sessione_id, p_esercizio_id, p_serie_numero,
    p_carico_kg, p_ripetizioni_effettive, p_rpe_percepito, p_note
  )
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function public.fitnesstime_log_set is
  'Inserisce rapidamente il log di una serie eseguita per l''atleta autenticato corrente.';


-- ---------------------------------------------------------------------
-- 4.2 fitnesstime_record_personale — miglior carico storico su un esercizio
-- ---------------------------------------------------------------------
create or replace function public.fitnesstime_record_personale(
  p_esercizio_nome text,
  p_profile_id      uuid default null
)
returns table (
  carico_kg              numeric,
  ripetizioni_effettive  integer,
  data_esecuzione        date
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_profile_id uuid;
begin
  v_profile_id := coalesce(p_profile_id, public.fitnesstime_profile_id());

  if v_profile_id is null then
    raise exception 'Profilo non specificato e nessun profilo collegato all''account corrente.';
  end if;

  if v_profile_id <> public.fitnesstime_profile_id() and not public.fitnesstime_is_staff() then
    raise exception 'Non autorizzato a consultare i record di un altro atleta.';
  end if;

  return query
    select l.carico_kg, l.ripetizioni_effettive, l.data_esecuzione
      from public.fitnesstime_workout_logs l
      join public.fitnesstime_esercizi e on e.id = l.esercizio_id
     where l.profile_id = v_profile_id
       and l.carico_kg is not null
       and lower(e.nome) = lower(p_esercizio_nome)
     order by l.carico_kg desc, l.ripetizioni_effettive desc, l.data_esecuzione desc
     limit 1;
end;
$function$;

comment on function public.fitnesstime_record_personale is
  'Restituisce il carico massimo mai registrato dall''atleta per un dato esercizio (record personale).';


-- ---------------------------------------------------------------------
-- 4.3 fitnesstime_volume_periodo — volume di carico (kg totali) in un intervallo
-- ---------------------------------------------------------------------
create or replace function public.fitnesstime_volume_periodo(
  p_profile_id  uuid default null,
  p_data_da     date default (current_date - interval '30 days')::date,
  p_data_a      date default current_date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_profile_id uuid;
  v_totale     numeric;
begin
  v_profile_id := coalesce(p_profile_id, public.fitnesstime_profile_id());

  if v_profile_id is null then
    raise exception 'Profilo non specificato e nessun profilo collegato all''account corrente.';
  end if;

  if v_profile_id <> public.fitnesstime_profile_id() and not public.fitnesstime_is_staff() then
    raise exception 'Non autorizzato a consultare il volume di un altro atleta.';
  end if;

  select coalesce(sum(carico_kg * ripetizioni_effettive), 0)
    into v_totale
    from public.fitnesstime_workout_logs
   where profile_id = v_profile_id
     and data_esecuzione between p_data_da and p_data_a
     and carico_kg is not null
     and ripetizioni_effettive is not null;

  return v_totale;
end;
$function$;

comment on function public.fitnesstime_volume_periodo is
  'Somma carico_kg * ripetizioni_effettive nell''intervallo indicato: indicatore di volume di carico per la progressione.';


-- =====================================================================
-- 5. ROW LEVEL SECURITY
-- =====================================================================

alter table public.fitnesstime_profiles      enable row level security;
alter table public.fitnesstime_schede        enable row level security;
alter table public.fitnesstime_sessioni      enable row level security;
alter table public.fitnesstime_esercizi      enable row level security;
alter table public.fitnesstime_workout_logs  enable row level security;

-- ---------------------------------------------------------------------
-- 5.1 fitnesstime_profiles
-- ---------------------------------------------------------------------
drop policy if exists fitnesstime_profiles_select on public.fitnesstime_profiles;
create policy fitnesstime_profiles_select on public.fitnesstime_profiles
  for select
  using (user_id = auth.uid() or public.fitnesstime_is_staff());

drop policy if exists fitnesstime_profiles_insert_staff on public.fitnesstime_profiles;
create policy fitnesstime_profiles_insert_staff on public.fitnesstime_profiles
  for insert
  with check (public.fitnesstime_is_staff());

drop policy if exists fitnesstime_profiles_update on public.fitnesstime_profiles;
create policy fitnesstime_profiles_update on public.fitnesstime_profiles
  for update
  using (user_id = auth.uid() or public.fitnesstime_is_staff())
  with check (
    -- L'atleta non puo' assegnarsi da solo ruoli di staff o disattivarsi.
    (user_id = auth.uid() and ruolo = 'athlete' and attivo = true)
    or public.fitnesstime_is_staff()
  );

drop policy if exists fitnesstime_profiles_delete_staff on public.fitnesstime_profiles;
create policy fitnesstime_profiles_delete_staff on public.fitnesstime_profiles
  for delete
  using (public.fitnesstime_is_staff());

-- ---------------------------------------------------------------------
-- 5.2 fitnesstime_schede
-- ---------------------------------------------------------------------
drop policy if exists fitnesstime_schede_select on public.fitnesstime_schede;
create policy fitnesstime_schede_select on public.fitnesstime_schede
  for select
  using (profile_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());

drop policy if exists fitnesstime_schede_staff_write on public.fitnesstime_schede;
create policy fitnesstime_schede_staff_write on public.fitnesstime_schede
  for all
  using (public.fitnesstime_is_staff())
  with check (public.fitnesstime_is_staff());

-- ---------------------------------------------------------------------
-- 5.3 fitnesstime_sessioni
-- ---------------------------------------------------------------------
drop policy if exists fitnesstime_sessioni_select on public.fitnesstime_sessioni;
create policy fitnesstime_sessioni_select on public.fitnesstime_sessioni
  for select
  using (
    public.fitnesstime_is_staff()
    or exists (
      select 1 from public.fitnesstime_schede sc
       where sc.id = scheda_id
         and sc.profile_id = public.fitnesstime_profile_id()
    )
  );

drop policy if exists fitnesstime_sessioni_staff_write on public.fitnesstime_sessioni;
create policy fitnesstime_sessioni_staff_write on public.fitnesstime_sessioni
  for all
  using (public.fitnesstime_is_staff())
  with check (public.fitnesstime_is_staff());

-- ---------------------------------------------------------------------
-- 5.4 fitnesstime_esercizi
-- ---------------------------------------------------------------------
drop policy if exists fitnesstime_esercizi_select on public.fitnesstime_esercizi;
create policy fitnesstime_esercizi_select on public.fitnesstime_esercizi
  for select
  using (
    public.fitnesstime_is_staff()
    or exists (
      select 1
        from public.fitnesstime_sessioni s
        join public.fitnesstime_schede sc on sc.id = s.scheda_id
       where s.id = sessione_id
         and sc.profile_id = public.fitnesstime_profile_id()
    )
  );

drop policy if exists fitnesstime_esercizi_staff_write on public.fitnesstime_esercizi;
create policy fitnesstime_esercizi_staff_write on public.fitnesstime_esercizi
  for all
  using (public.fitnesstime_is_staff())
  with check (public.fitnesstime_is_staff());

-- ---------------------------------------------------------------------
-- 5.5 fitnesstime_workout_logs
-- ---------------------------------------------------------------------
drop policy if exists fitnesstime_workout_logs_select on public.fitnesstime_workout_logs;
create policy fitnesstime_workout_logs_select on public.fitnesstime_workout_logs
  for select
  using (profile_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());

drop policy if exists fitnesstime_workout_logs_insert on public.fitnesstime_workout_logs;
create policy fitnesstime_workout_logs_insert on public.fitnesstime_workout_logs
  for insert
  with check (profile_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());

drop policy if exists fitnesstime_workout_logs_update on public.fitnesstime_workout_logs;
create policy fitnesstime_workout_logs_update on public.fitnesstime_workout_logs
  for update
  using (profile_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff())
  with check (profile_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());

drop policy if exists fitnesstime_workout_logs_delete on public.fitnesstime_workout_logs;
create policy fitnesstime_workout_logs_delete on public.fitnesstime_workout_logs
  for delete
  using (profile_id = public.fitnesstime_profile_id() or public.fitnesstime_is_staff());


-- =====================================================================
-- 6. PERMESSI DI ESECUZIONE RPC (ruoli PostgREST standard di Supabase)
-- =====================================================================
grant execute on function public.fitnesstime_log_set              to authenticated;
grant execute on function public.fitnesstime_record_personale     to authenticated;
grant execute on function public.fitnesstime_volume_periodo       to authenticated;
grant execute on function public.fitnesstime_is_staff             to authenticated;
grant execute on function public.fitnesstime_profile_id           to authenticated;

commit;

-- =====================================================================
-- FINE fitnesstime_schema.sql
-- Verifica rapida dopo l'esecuzione:
--   select * from public.fitnesstime_profiles limit 5;
--   select proname from pg_proc where proname like 'fitnesstime_%';
--   select tgname from pg_trigger where tgname like '%fitnesstime%';
-- =====================================================================
