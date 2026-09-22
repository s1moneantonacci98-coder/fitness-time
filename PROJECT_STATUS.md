# Fitness Time Club — PWA & Workout Tracker — Stato progetto

_Ultimo aggiornamento: 2026-09-22_

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
└── Scheda base/             (cartella vuota, presente da prima)
```
