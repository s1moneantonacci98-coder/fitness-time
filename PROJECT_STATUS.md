# Fitness Time Club — PWA & Workout Tracker — Stato progetto

_Ultimo aggiornamento: 2026-09-23 (catalogo esercizi + gestione delete/update)_

## 1. Moduli completati e funzionanti

- **Database Supabase** (`fitnesstime_schema.sql`) — applicato e verificato live sul progetto
  condiviso `gsuyrptpycrgznqjtbtx` ("ASD Eternal Body Concept"). Tabelle, RLS, trigger e RPC
  tutte prefissate `fitnesstime_`, isolate dai dati di ASD (`clienti`, `staff`, ...) e Southside
  (`southside_*`).
- **Frontend PWA mobile-first** (`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`):
  - Autenticazione (login/registrazione) con Supabase Auth, metadati `app: 'fitnesstime'`.
  - Tab **Allenamento Oggi**: selezione sessione del giorno, log rapido serie per serie
    (carico/reps/RPE) via RPC, timer di recupero con audio (WebAudio) + vibrazione.
  - Tab **Le Mie Schede**: overview di tutte le schede assegnate (attive/concluse) con
    sessioni ed esercizi annidati.
  - Tab **Storico & Progressione**: volume di carico 30gg e conteggio sessioni (RPC), ricerca
    record personale per esercizio (RPC), elenco cronologico delle serie registrate.
  - Tab **Info Palestra & Orari**: orari, corsi/servizi, branding (contenuto statico in `app.js`).
  - **Offline-first**: Service Worker con cache dell'app-shell (cache-first + aggiornamento in
    background); coda di fallback in `localStorage` per i log di allenamento salvati offline,
    sincronizzata automaticamente al ritorno della connessione (evento `online`).
  - Supabase JS v2 **vendorizzato localmente** (`vendor/supabase.js`, UMD) — nessuna dipendenza
    da CDN a runtime, coerente con l'uso offline in sala pesi.
  - Icone PWA generate localmente (`icons/`, script `scripts/generate_icons.py`), installabile
    su iOS/Android.
- **Test automatico** (`scripts/smoke_test.js`, eseguibile con `npm test`): sintassi JS di
  `app.js`/`sw.js`, validità di `manifest.json`, coerenza id `index.html` ↔ `app.js`, presenza
  di tutti gli asset dichiarati (icone, app-shell), e verifica live di RLS/RPC su Supabase
  (2 controlli di rete sono marcati "saltati" quando eseguiti dentro questo container per via
  dell'allowlist di rete del sandbox — nessun problema quando eseguiti in locale/CI; RLS e RPC
  sono già stati verificati live in questa sessione tramite gli strumenti Supabase MCP).

## 2. Schema del database attuale

Progetto Supabase condiviso: **`gsuyrptpycrgznqjtbtx`** (eu-west-1). Oggetti applicativi,
tutti in `public`, prefisso `fitnesstime_`:

| Tabella | Scopo |
|---|---|
| `fitnesstime_profiles` | Anagrafica atleti/staff. `user_id` nullable — profilo può esistere prima della registrazione (coach carica la scheda in anticipo). |
| `fitnesstime_schede` | Scheda (macrociclo) assegnata a un atleta. |
| `fitnesstime_sessioni` | Giorno di split (Giorno A/B/C, Full Body) di una scheda. |
| `fitnesstime_esercizi` | Esercizio di una sessione: serie/reps/carico/recupero/RPE/RIR. |
| `fitnesstime_workout_logs` | Log esecutivo serie-per-serie (storico). |
| `fitnesstime_catalogo_esercizi` | Libreria precaricata di esercizi standard per gruppo muscolare (dal modulo cartaceo), usata dal modal "+ Esercizio" per la selezione rapida. |

Funzioni/RPC: `fitnesstime_is_staff()`, `fitnesstime_profile_id()`, `fitnesstime_log_set(...)`,
`fitnesstime_record_personale(...)`, `fitnesstime_volume_periodo(...)`, `fitnesstime_set_updated_at()`
(trigger), `fitnesstime_handle_new_user()` (trigger su `auth.users`, gated su
`raw_user_meta_data->>'app' = 'fitnesstime'` — non interferisce con i trigger già presenti di
ASD/Southside).

RLS attiva su tutte le tabelle: atleta vede/gestisce solo i propri dati (`profile_id` /
`user_id` = proprio); ruoli `admin`/`trainer` (verificati via `fitnesstime_is_staff()`) hanno
accesso completo in lettura/scrittura su schede/sessioni/esercizi.

Verifiche di sicurezza post-migrazione (Supabase advisors): nessun errore introdotto da
`fitnesstime_*`; corretto un warning minore (`search_path` mutabile su
`fitnesstime_set_updated_at`). Un warning generico "SECURITY DEFINER eseguibile da anon" resta
su alcune funzioni di supporto (`fitnesstime_is_staff`, `fitnesstime_profile_id`, ...): stesso
pattern già accettato dal progetto per `southside_is_admin`/`southside_handle_new_user` — le
funzioni non espongono dati perché operano solo su `auth.uid()` del chiamante.

## 3. Variabili / configurazione necessarie (nessun segreto in chiaro)

- `SUPABASE_URL` = `https://gsuyrptpycrgznqjtbtx.supabase.co` (hardcoded in `app.js` — è
  l'URL pubblico del progetto, non un segreto).
- `SUPABASE_KEY` = publishable key `sb_publishable_...` (hardcoded in `app.js` — chiave
  pubblica lato client per design, protetta dalla RLS; non è la service_role key).
- Nessuna chiave privata è presente nel repository.

## 3bis. MODALITÀ DEMO (attiva ora — 2026-09-22)

Per una demo immediata da mostrare all'istruttore su smartphone, senza login e senza passare
da GitHub/Vercel:

- **`app.js`**: `DEMO_MODE = true` in cima al file salta del tutto login/registrazione.
  All'apertura l'app entra subito come profilo fisso `DEMO_PROFILE`
  (id `11111111-1111-4111-8111-111111111111`, ruolo trainer) e carica la sua scheda.
  **Da rimettere `DEMO_MODE = false` prima di dare in mano l'app ad atleti reali**, così
  torna il vero login Supabase.
- **`fitnesstime_seed_data.sql`** (nuovo file, applicato live sul progetto Supabase
  condiviso): crea il profilo demo, una scheda "Full Body Split A/B/C" con 3 sessioni e i
  relativi esercizi, e aggiunge policy RLS + grant che permettono al ruolo `anon` (nessuna
  autenticazione) di leggere quella scheda e di inserire nuovi esercizi — **scoping
  intenzionale**: le policy filtrano sempre per il profilo demo fisso, quindi non aprono
  accesso a schede/atleti reali che verranno caricati in futuro, né alle altre tabelle del
  progetto (`clienti`, `southside_*`, ecc., che restano protette come prima).
  ⚠️ Sono pensate come temporanee: da restringere/rimuovere a fine demo (vedi commento in
  testa al file SQL).
- **Origine dati della scheda demo**: i nomi degli esercizi vengono dalla "Scheda base"
  cartacea fotografata (`Scheda base/s1-s4.jpg`) — un modulo *vuoto* usato in palestra per
  selezionare gli esercizi per gruppo muscolare. Sul cartaceo non erano compilati split,
  serie/ripetizioni/recupero: questi valori nella scheda demo sono quindi **di esempio**,
  non il vero programma di un atleta. (`1.jpg`/`2.jpg` sono solo screenshot Instagram della
  palestra, nessun dato di allenamento.)
- **Nuova funzione "+ Aggiungi Esercizio"**: in `index.html`/`app.js`/`style.css`, pulsante
  nella vista sessione che apre un modal (nome, gruppo muscolare, serie x ripetizioni,
  recupero, note/carico) e salva subito su `fitnesstime_esercizi`, aggiornando la lista a
  schermo senza reload.
- **Condivisione**: server locale + tunnel HTTPS pubblico (es. `npx localtunnel`) per dare
  un link temporaneo all'istruttore via WhatsApp — nessun deploy Vercel/GitHub.

## 3ter. DASHBOARD ISTRUTTORE (attiva ora — 2026-09-23)

L'app ora si apre di default sulla **Dashboard Istruttore**, non più sulla vista atleta:

- **Modello dati**: `fitnesstime_profiles.categoria` (nuova colonna, check `sala_pesi | personal |
  nuoto`, NULL per staff). 8 atleti demo seedati (3 sala_pesi, 3 personal, 2 nuoto — 4 con scheda
  attiva, 4 senza), vedi `fitnesstime_seed_data.sql`.
- **Dashboard** (`#view-dashboard`): pillole filtro con contatori live, ricerca per nome/cognome,
  "+ Nuovo Atleta" (modal → insert `fitnesstime_profiles`), elenco atleti con badge categoria
  colorato (rosso/oro/ciano) e stato scheda.
- **Profilo/Scheda atleta** (`#view-athlete-detail`, `goToAthleteDetail`): anagrafica, schede con
  split e esercizi, "+ Assegna Nuova Scheda" (crea scheda + N sessioni), "+ Esercizio" per
  sessione (riusa il modal già esistente), "👁️ Simula Allenamento" (disabilitato se l'atleta non
  ha una scheda attiva).
- **Simula Allenamento** (`startSimulate`): riusa la vista "Allenamento Oggi" con timer/log serie
  già esistente, impostando `state.profile` sull'atleta selezionato; banner in alto con pulsante
  "← Dashboard" per uscire.
- **RLS allargata** (stessa migrazione): le policy `anon` non sono più scoped al solo profilo
  demo fisso ma coprono **tutte** le righe di `fitnesstime_profiles/schede/sessioni/esercizi`
  (SELECT+INSERT, mai UPDATE/DELETE) + `fitnesstime_workout_logs` (scoped ai soli profili
  `ruolo='athlete'`) — necessario perché la Dashboard opera senza login reale. Nessun'altra
  tabella del progetto è toccata. **Confermato esplicitamente dall'utente** prima
  dell'applicazione (vedi cronologia sessione).
- **Log serie in demo**: la RPC `fitnesstime_log_set` richiede un `auth.uid()` reale e quindi non
  funziona per `anon`; in `DEMO_MODE` il salvataggio di una serie (sia in simulazione sia per un
  futuro atleta loggato con account demo) passa da `submitWorkoutLog()`, che fa un insert diretto
  su `fitnesstime_workout_logs` invece di chiamare la RPC.
- **Limite noto**: non essendoci grant di `UPDATE` per `anon`, assegnare una nuova scheda a un
  atleta che ne ha già una attiva **non disattiva automaticamente** la precedente (manca il
  permesso per farlo in sicurezza) — l'app risolve mostrando sempre la scheda attiva più recente
  (ordinata per `created_at`). Per una gestione pulita servirà una UPDATE policy scoped quando si
  passerà da demo a pannello coach reale con autenticazione.
- Tab **Storico** in simulazione: il conteggio serie/kg via RPC (`fitnesstime_volume_periodo`,
  `fitnesstime_record_personale`) resta legato ad `auth.uid()` e in demo può risultare vuoto;
  fuori scope di questo aggiornamento.

## 3quater. CATALOGO ESERCIZI + GESTIONE DELETE/UPDATE (attiva ora — 2026-09-23)

Correzioni richieste dall'uso reale in sala pesi da parte dell'istruttore (Andrea):

- **Catalogo esercizi a selezione rapida** (`fitnesstime_migration_catalogo_gestione.sql`):
  - Nuova tabella `fitnesstime_catalogo_esercizi` (gruppo_muscolare, nome, ordine), popolata con
    64 esercizi estratti dalle foto del modulo cartaceo `Scheda base/s1-s4.jpg`, suddivisi nei 9
    gruppi muscolari del modulo (Cardio, Addominali, Lombari, Pettorali, Dorsali, Gambe/Glutei,
    Spalle, Bicipiti, Tricipiti). RLS: lettura libera (SELECT `using (true)`, anche per `anon`,
    dato che e' un semplice elenco di riferimento senza dati personali), scrittura riservata allo
    staff (`fitnesstime_is_staff()`) per una futura gestione da pannello coach.
  - Modal "+ Esercizio" (`index.html`/`app.js`/`style.css`) ridisegnato con due modalita', un
    toggle in cima:
    1. **Catalogo** (default): tendina "Gruppo muscolare" → tendina "Esercizio" (popolata dal
       gruppo scelto) → campi rapidi Serie×Ripetizioni e Recupero (secondi), gia' presenti.
    2. **Altro / personalizzato**: sblocca i campi testo liberi "Nome esercizio" e "Gruppo
       muscolare" per un esercizio non presente nel catalogo (comportamento precedente).
  - `state.catalogo` caricato una volta all'ingresso in app (`loadCatalogoEsercizi()`, sia in
    demo sia a login reale) e riusato da entrambi i contesti del modal (vista coach "Profilo
    Atleta" e "Simula Allenamento").
- **Eliminazione ed aggiornamento schede/esercizi** (stessa migrazione SQL):
  - Le policy RLS `anon` di questa app demo concedevano finora solo `SELECT` + `INSERT` su
    `fitnesstime_schede`/`sessioni`/`esercizi` — non era possibile eliminare una scheda sbagliata
    ne' un singolo esercizio, ne' aggiornare lo stato "attiva" di una scheda. Aggiunte le policy
    (e i `grant`) di `UPDATE` e `DELETE` per `anon` sulle tre tabelle, stesso perimetro di
    sicurezza delle policy demo gia' esistenti (solo tabelle `fitnesstime_*`, nessun'altra tabella
    del progetto condiviso toccata).
  - Il `CASCADE` da scheda → sessioni → esercizi era **gia'** presente negli `ON DELETE CASCADE`
    originali di `fitnesstime_schema.sql`: eliminare una scheda rimuove automaticamente le sue
    sessioni ed esercizi lato database, nessuna modifica di schema necessaria per quello.
  - **UI vista coach** (`renderAthleteDetail` in `app.js`):
    - Icona cestino 🗑️ nell'intestazione di ogni scheda → `window.confirm(...)` → `DELETE` su
      `fitnesstime_schede` (cascata automatica) → ricarica vista + lista atleti.
    - Pulsante "✔ Rendi attiva" su ogni scheda non attiva → disattiva (`UPDATE attiva=false`) le
      altre schede dell'atleta e attiva (`UPDATE attiva=true`) quella scelta, poi ricarica.
    - "✕" accanto a ogni esercizio nella lista → `window.confirm(...)` → `DELETE` su
      `fitnesstime_esercizi` → rimozione ottimistica dalla vista senza reload completo.
  - Queste azioni di gestione (elimina/attiva/rimuovi) sono disponibili solo nella vista coach
    "Profilo Atleta", non nella vista "Simula Allenamento" (che resta la vista sola-lettura +
    log serie dell'atleta, invariata salvo il nuovo modal "+ Esercizio").

## 4. Prossimi step prioritari

1. **Deploy su Vercel**: creare/collegare il progetto Vercel al repository Git di questa
   cartella (hosting statico — nessun build step richiesto, è HTML/CSS/JS puro).
2. **Pannello coach** (ruolo `trainer`/`admin`): oggi lo schema e le RLS supportano già
   pienamente la scrittura di schede/sessioni/esercizi da parte dello staff, ma non esiste
   ancora una UI dedicata — al momento le schede vanno inserite via SQL Editor o Supabase
   Studio. Prossimo modulo naturale: interfaccia "Gestione Atleti & Schede" per i coach.
   Prima di iniziare, verificare al riavvio della sessione questo file, il repository e
   `fitnesstime_schema.sql` per evitare sovrascritture accidentali.
3. **Export PDF scheda** (menzionato nelle istruzioni di progetto): modulo non ancora
   implementato.
4. **Notifica acustica/vibrazione**: implementata via WebAudio + Vibration API (nessun
   asset audio esterno necessario); da validare su device reale iOS (le policy di
   autoplay audio di Safari possono richiedere un'interazione utente, già garantita dal
   tap su "conferma serie").
5. **Correzione consigliata (fuori scope di questo modulo)**: la tabella pre-esistente
   `public.invii_qr` ha RLS abilitata senza policy (flag INFO dell'advisor Supabase) — non
   è un oggetto `fitnesstime_*`, quindi non è stata toccata; segnalata qui solo per
   completezza.

## 5. Struttura cartella locale

```
Fitness Time/
├── fitnesstime_schema.sql   (idempotente — ri-eseguibile nello SQL Editor Supabase)
├── fitnesstime_seed_data.sql (dati demo + policy RLS anon per la demo — vedi § 3bis)
├── fitnesstime_migration_catalogo_gestione.sql (catalogo esercizi + policy UPDATE/DELETE anon — vedi § 3quater)
├── PROJECT_STATUS.md        (questo file)
├── package.json             (script: npm test, npm run icons)
├── index.html
├── style.css
├── app.js
├── sw.js
├── manifest.json
├── icons/                   (192, 512, 512-maskable, apple-touch, favicon)
├── vendor/supabase.js       (Supabase JS v2 UMD, vendorizzato per uso offline)
├── scripts/
│   ├── smoke_test.js        (npm test)
│   └── generate_icons.py    (npm run icons)
├── 1.jpg, 2.jpg             (immagini di contesto fornite dall'utente)
└── Scheda base/             (s1-s4.jpg: foto del modulo cartaceo esercizi, origine del catalogo)
```
