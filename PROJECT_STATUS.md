# Fitness Time Club — PWA & Workout Tracker — Stato progetto

_Ultimo aggiornamento: 2026-10-08 (login reale, vista utente sola lettura, pubblicazione scheda/BIA, circonferenze). Precedente: 2026-10-06 (BIA completa con tutti i parametri del PDF di Andrea; scheda dettagliata stile Andrea + export PDF + invio WhatsApp via condivisione telefono). Precedente: 2026-09-28 (restyling grafico completo dell'app + fix header/navigazione tasto indietro + restyling UI/UX vista Schede ed Esercizi + fix bottom bar Coach/Admin + modulo BIA composizione corporea)_

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

## 3quinquies. FIX BOTTOM BAR COACH/ADMIN + MODULO BIA (attiva ora — 2026-09-23)

- **Fix bug bottom bar in vista Coach/Admin** (`style.css`): la tab bar
  (Oggi/Schede/Storico/Info) restava visibile anche in Dashboard Istruttore
  e nel Profilo Atleta nonostante `app.js` impostasse correttamente
  `#tabbar.hidden = (mode !== 'simulate')` in `setMacroView()`. Causa: la
  regola `.tabbar { display:flex; position:fixed; ... }` sovrascriveva lo
  UA-stylesheet `[hidden] { display:none }` (stessa specificita', ma
  origine "author" prevale su "user agent" nella cascata CSS) — mancava,
  a differenza di `.modal-overlay[hidden]`/`.timer-overlay[hidden]`, un
  override esplicito. Aggiunta la regola `.tabbar[hidden] { display: none
  !important; }`. Nessuna modifica a `app.js`/`index.html` necessaria: la
  logica di visibilita' (nascosta in dashboard/profilo, mostrata solo in
  "Simula Allenamento") era gia' corretta lato JS.
- **Modulo BIA / Composizione Corporea** (`fitnesstime_migration_bia.sql`,
  applicata live sul progetto Supabase condiviso):
  - Nuova tabella `fitnesstime_misure_bia` (atleta_id FK → profiles, data
    di rilevazione, peso_kg, massa_grassa_perc, massa_magra_kg, acqua_perc,
    grasso_viscerale, note), `unique (atleta_id, data_rilevazione)` per
    poter correggere con un upsert una rilevazione dello stesso giorno.
  - RLS: policy "reale" (atleta autenticato vede solo le proprie righe via
    `fitnesstime_profile_id()`; staff accesso completo via
    `fitnesstime_is_staff()`) + policy "demo/anon" a lettura/scrittura
    completa (stesso perimetro e stesso pattern gia' in uso per
    `fitnesstime_schede/sessioni/esercizi` — solo tabelle `fitnesstime_*`,
    nessun'altra tabella del progetto condiviso toccata).
  - Seed demo: 2 rilevazioni per **Elena Conti** a un mese di distanza,
    con progresso realistico (peso 68.4→66.9kg, massa grassa 26.8→24.5%,
    massa magra 50.1→50.5kg, idratazione 52.3→54.1%, viscerale 8→7) per
    mostrare subito l'andamento nella demo.
  - **UI profilo atleta** (`index.html`/`app.js`/`style.css`,
    `renderAthleteDetail` → `biaSectionHtml`): nuova card "📊 Composizione
    Corporea (BIA)" con badge dell'ultima rilevazione (Peso, % Grasso,
    Massa Magra, Idratazione) e delta colorato rispetto alla rilevazione
    precedente; pulsante "+ Nuova BIA" che apre un modal rapido
    (`#bia-overlay`) e salva con `upsert` su `fitnesstime_misure_bia`;
    tabellina storico di tutte le rilevazioni ordinate per data
    decrescente. Aggiornamento locale dello stato dopo il salvataggio,
    senza reload completo della vista.
  - **Restyling UI/UX "Schede ed Esercizi"** (`renderAthleteDetail` in `app.js`,
    `style.css`): pulsanti di rimozione esercizio ridotti a 28×28px, icona
    minimale grigia (`#64748b`) che diventa rossa (`#ef4444`) solo su
    hover/active, sfondo trasparente al posto del bordo rosso invasivo
    (nuova classe `.icon-btn-remove`). Riga esercizio ristrutturata in
    flexbox (`.exercise-row-info` / `.exercise-row-name` /
    `.exercise-row-meta` / `.exercise-row-note`) con nome in evidenza a
    sinistra, parametri serie/reps/recupero come testo secondario sotto, e
    separatore sottile (`rgba(255,255,255,0.06)`). Pulsante "+ Esercizio"
    trasformato in pillola compatta (`.btn-pill-add`). Badge "Attiva" e
    pulsante cestino 🗑️ uniformati a 28px di altezza. Raggio di curvatura
    coerente su `.session-card` (14px) e `.exercise-item` (12px).
    Verificato senza overflow orizzontale a 375/390/430px (screenshot
    Playwright).
  - **Fix header/navigazione** (`index.html`, `app.js`, `style.css`): rimosso il
    pulsante rotondo `#logout-btn` (icona ⏻ residua del prototipo, priva di font
    di sistema su Windows — appariva come un riquadro/griglia; nessuna funzione
    utile in `DEMO_MODE`), header ora essenziale (logo + freccia ←). Corretto un
    bug CSS analogo a quello gia' risolto per `.tabbar[hidden]`:
    `.icon-btn { display:grid }` sovrascriveva l'attributo `[hidden]`, quindi
    `#back-btn` restava visibile anche in Dashboard nonostante JS impostasse
    `.hidden = true` — aggiunta la regola `.icon-btn[hidden] { display:none
    !important; }`. `exitSimulate()` ora torna sempre alla Dashboard Istruttore
    (prima, uscendo da "Simula Allenamento", tornava al dettaglio atleta pur
    avendo l'etichetta "← Dashboard"); `goToDashboard()` resetta
    `state.selectedAthlete`. Verificato con smoke test (`npm test`, 12/12 check
    locali superati) e screenshot Playwright dei tre stati dell'header.

## 3sexies. RESTYLING GRAFICO COMPLETO (attivo ora — 2026-09-28)

Richiesta dell'utente: l'app non doveva "sembrare fatta con l'IA" ne' contenere
errori grafici, essendo nessun login/onboarding ancora attivo (`DEMO_MODE`) e
quindi ogni schermata modificabile liberamente senza vincoli di dati reali.
Intervento solo su presentazione (`index.html`, `style.css`, `app.js`),
nessuna modifica a logica, query Supabase o schema.

- **Tipografia**: aggiunta coppia di font via Google Fonts (`index.html`,
  `<link>` con `preconnect`) — **Bebas Neue** (condensato, stile cartellonistica
  da palestra vera) per titoli, numeri grandi (stat, timer, misure BIA) e il
  logotipo, **Manrope** per tutta l'interfaccia. Prima: solo font di sistema
  generico (`-apple-system, Segoe UI, ...`), lo stesso stack di qualunque
  dashboard generata automaticamente.
- **Palette colori**: sostituito il rosso "Material Design" (#e53935) su nero
  bluastro (#0d0f12) — combinazione riconoscibile come default da tool
  generativi — con una palette calda proprietaria: ember/corallo (#ff5136),
  oro (#e6b04d) come accento secondario, acqua (#55c2b8) per la categoria
  Nuoto, fondo bruno-nero (#14110f) invece di nero-blu. Aggiunta una grana
  fotografica sottilissima (`.grain`, SVG noise via CSS, nuovo `<div>` in
  `index.html`) per rompere la piattezza del nero puro.
- **Icone**: rimosse **tutte** le emoji usate come icone UI (🏋️📋📈ℹ️⭐🏊👁️✏️🔍
  📞💬🗑️💡📊🗂️✕) sia in `index.html` che in `app.js`, sostituite con un set di
  ~18 icone SVG inline coerenti (linea, `stroke="currentColor"`, quindi
  ereditano il colore del componente) definite in `app.js` (`ICONS` +
  funzione `icon(nome, classe)`) e duplicate inline dove servivano in markup
  statico. Motivo doppio: (1) le emoji rendevano l'app riconoscibile come
  "generata", (2) su Windows alcune emoji (vedi fix `#logout-btn` del
  2026-09-23) renderizzano come quadratini per mancanza del font Segoe UI
  Emoji in certi contesti — le SVG risolvono entrambi i problemi.
- **Componenti**: pillole filtro dashboard trasformate da "bubble" colorata
  (pattern tipico da dashboard SaaS generica) a tab con sottolineatura;
  badge categoria ridisegnati con icona+dot invece di pillola piena;
  `.session-card` con striscia accento ember→oro in cima invece del bordo
  laterale piatto; pulsanti primari con gradiente + bagliore colorato +
  highlight interno per profondità tattile; toggle "Catalogo/Personalizzato"
  nel modal esercizio trasformato in segmented control; card con leggero
  gradiente e ombra invece di colore piatto.
- **Regola CSS consolidata**: le 3 regole di bug-fix sparse (`.tabbar[hidden]`,
  `.icon-btn[hidden]`, `.modal-overlay[hidden]`/`.timer-overlay[hidden]`/
  `.simulate-banner[hidden]` gia' con `!important` inline) sostituite da
  un'unica regola globale `[hidden] { display: none !important; }` in cima a
  `style.css` — stessa causa (specificita' "author" vs UA-stylesheet), fix
  valido per ogni elemento presente e futuro invece di doverlo ripetere ad
  ogni nuovo componente.
- **Service Worker**: `CACHE_VERSION` in `sw.js` portato a `fitnesstime-v2`
  per forzare l'aggiornamento della cache app-shell sui dispositivi che
  avevano gia' installato la PWA con la grafica precedente.
- **Verifica**: `npm test` — 12/12 controlli statici superati (sintassi,
  coerenza id, asset dichiarati); i soli 2 controlli di rete falliscono per
  mancata risoluzione DNS del terminale bridge usato in questa sessione verso
  Supabase, non per codice (stesso comportamento gia' noto/documentato per il
  container cloud). QA visiva completa con Playwright headless (screenshot di
  dashboard, filtri, dettaglio atleta, BIA, simulazione allenamento, timer di
  recupero, tutte le modali, storico, info, login/registrazione) usando dati
  Supabase finti iniettati via intercettazione di rete — nessun cambiamento
  di comportamento rilevato, solo presentazione.
- **Non toccato**: `DEMO_MODE`, query/RPC Supabase, RLS, schema, logica di
  business, struttura dati. Nessun `id`/`data-*` referenziato da `app.js` e'
  stato rinominato.

## 3septies. SCHEDA DETTAGLIATA + PDF + INVIO WHATSAPP (attivo ora — 2026-10-06)

Modello preso dalla scheda reale di Andrea (esempio: "Scheda allenamento Fabiana Mece", 4 giorni).

- **DB** (`fitnesstime_migration_scheda_dettagliata.sql`, applicata live): `fitnesstime_esercizi`
  + `recupero_max_secondi` (range es. 90-120"), `tecnica` (es. Superset con ...), `rir_testo` (es. "2-3");
  `fitnesstime_sessioni` + `addome`, `cardio` (testo libero per giorno).
- **UI** (`index.html`/`app.js`): modal "+ Esercizio" con recupero anche a range, RIR, Tecnica;
  pulsante "Addome / Cardio" per ogni giorno (modal `#extras-overlay`).
- **PDF** (`pdf.js`, jsPDF + font DejaVu Sans in `vendor/dejavu-fonts.js`): replica grafica della scheda di
  riferimento di Andrea (misure in pt misurate dal suo PDF, scarto max 0,3pt): una pagina per giorno con colore
  proprio (viola, azzurro, verde, arancione a rotazione), titolo viola, banner giorno, tabella a righe alternate,
  box ADDOME/CARDIO. Colori: #9B59B6/#E6D5ED, #3498DB/#CCE5F6, #27AE60/#C9EBD7, #E67E22/#F9DFC8; titolo #7A2E8E.
  Pulsanti "PDF" (scarica) e "Invia" su ogni scheda del profilo atleta.
- **Invio WhatsApp**: `navigator.share` con il PDF allegato (menu condivisione del telefono → WhatsApp → contatto).
  Fallback (PC): scarica il PDF e apre `wa.me/<telefono atleta>` con messaggio pronto.
  WhatsApp Business API valutata e rimandata (costi/account verificato).
- SW `fitnesstime-v3` (nuovi asset in cache).
- **BIA di Andrea**: PDF esempio ricevuto (valori: PhA, BCM, FFM, FM, SMM, ASMM, TBW, ECW, ICW + grafici BIVA);
  modulo BIA attuale ha solo 6 campi -> da estendere (prossimo step, da discutere con Simone).

## 3octies. BIA COMPLETA (attiva ora — 2026-10-06)

Decisione: l'app e' ad uso di Andrea (nessun login clienti per ora; link personale cliente = idea futura).
Andrea inserisce a mano i valori misurati dal PDF del suo strumento BIA; non si carica il PDF.

- **DB** (applicata live): `fitnesstime_misure_bia` + `altezza_cm, rz_ohm, xc_ohm, pha_gradi, bmr_kcal, bcmi,
  bcm_kg, massa_grassa_kg, smm_kg, asmm_kg, tbw_l, ecw_l, icw_l`. `massa_magra_kg` = FFM.
  `massa_grassa_perc` e `acqua_perc` vengono calcolate dall'app al salvataggio (FM/peso, TBW/peso).
- **UI**: form con valori principali + sezione "Altri valori del PDF"; anteprima calcoli live
  (BMI, % grasso/magra/muscolo/acqua). Card profilo: 6 indicatori con frecce vs rilevazione precedente
  + "Tutti i valori" (BMI e tutte le percentuali calcolate come nel PDF; scarto max 0,1 per arrotondamenti).
- **Dati**: atleti demo non ancora eliminati (la cancellazione dal DB e' stata annullata dalla conferma
  di Supabase); aggiunta Fabiana Mece con la sua scheda (4 giorni, 28 esercizi).
- **Da fare**: login solo per Andrea (serve la sua mail) e disattivare DEMO_MODE; poi, se serve, link personale cliente.

## 3novies. LOGIN REALE + VISTA UTENTE + PUBBLICAZIONE (attivo ora — 2026-10-08)

- **DEMO_MODE = false**: login Supabase reale. Account di test (password `Simone`): `admin@fitnesstime.test` (ruolo admin = Andrea)
  e `utente@fitnesstime.test` (atleta). Tasto "Esci" nell'header.
- **Admin/trainer**: dashboard completa invariata (creazione, PDF, Invia WhatsApp) + **"Pubblica sull'app / Ritira"** su ogni scheda
  (`fitnesstime_schede.pubblicata`), interruttore Online/Nascosta su ogni BIA (`fitnesstime_misure_bia.pubblicata`), modal "+ Circonferenze"
  (tabella esistente `fitnesstime_misure_antropometriche`, + colonne `fianchi_cm`, `addome_cm`, unique atleta/data). Campo email in "+ Nuovo Atleta"
  (se l'atleta si registra con la stessa email, il trigger collega account e profilo).
- **Utente (atleta)**: `#view-athlete-home` in sola lettura: tab "Scheda" (solo schede pubblicate, HTML nell'app, niente PDF/download/invio/log carichi)
  e tab "BIA e misure" (BIA pubblicate da Andrea + propri valori inseribili, circonferenze solo lettura). Selezione/copia/menu contestuale/stampa disattivati
  (deterrente: gli screenshot non sono bloccabili).
- **RLS** (`fitnesstime_migration_pubblicazione.sql`, applicata): atleta vede solo schede/sessioni/esercizi pubblicati e le BIA pubblicate o inserite da lui;
  scrive solo le proprie BIA (`inserita_da='atleta'`); circonferenze scrivibili solo da staff. **Rimosse tutte le policy `anon` e i grant a `anon`**
  (verificato con test in transazione: utente 0 righe se non pubblicato, 1 se pubblicato).
- SW `fitnesstime-v10`. Smoke test aggiornato (DEMO_MODE off, nessun controllo riservato nella vista utente).
- **Limiti noti**: la registrazione libera dalla schermata login crea comunque un profilo atleta senza schede; "Simula Allenamento" resta solo per Andrea.

## 3decies. REGISTRAZIONE AUTONOMA ATLETI (attiva ora — 2026-10-09)
- Registrazione dalla schermata di login: email, password (min 6), nome, cognome, telefono (tutti obbligatori), spunta privacy con informativa (testo bozza, versione `PRIVACY_VERSIONE` in app.js — da far rivedere al titolare). Nessun codice palestra, conferma email disattivata (come tutte le altre palestre dello stesso Supabase).
- "Password dimenticata?": `resetPasswordForEmail` con redirect alla stessa pagina; evento `PASSWORD_RECOVERY` mostra l'overlay "Nuova password" (`updateUser`). Richiede `https://fitnesstimeclub.vercel.app/**` tra i Redirect URLs di Supabase Auth.
- Account esistente senza profilo Fitness Time (es. nato in un'altra palestra): overlay "Completa il profilo" -> RPC `fitnesstime_ensure_profile` (sempre ruolo `athlete`, solo per `auth.uid()`).
- DB (migrazione `fitnesstime_registrazione_privacy`, additiva): colonne `fitnesstime_profiles.consenso_privacy_at`, `consenso_privacy_versione`; trigger `fitnesstime_handle_new_user` aggiornato (salva il consenso, resta limitato a `app='fitnesstime'`); RPC `fitnesstime_ensure_profile(nome,cognome,telefono,privacy,versione)` con execute solo a `authenticated`.
- Dashboard staff: badge "Nuovo" per atleti registrati da meno di 7 giorni e senza scheda.
- Nota sicurezza (preesistente, Auth condiviso): il trigger `collega_scheda_orfana` di un'altra app collega un cliente ASD orfano con la stessa email a ogni nuovo utente: con conferma email disattivata chi si registra con l'email altrui potrebbe essere collegato a quella scheda. Valutare di riattivare la conferma email o correggere quel trigger.
- Service worker: `fitnesstime-v14`.

## 4. Prossimi step prioritari

1. **Deploy su Vercel**: creare/collegare il progetto Vercel al repository Git di questa
   cartella (hosting statico — nessun build step richiesto, è HTML/CSS/JS puro).
2. **Pannello coach** (ruolo `trainer`/`admin`): oggi lo schema e le RLS supportano già
   pienamente la scrittura di schede/sessioni/esercizi da parte dello staff, ma non esiste
   ancora una UI dedicata — al momento le schede vanno inserite via SQL Editor o Supabase
   Studio. Prossimo modulo naturale: interfaccia "Gestione Atleti & Schede" per i coach.
   Prima di iniziare, verificare al riavvio della sessione questo file, il repository e
   `fitnesstime_schema.sql` per evitare sovrascritture accidentali.
3. ~~Export PDF scheda~~ — fatto (vedi 3septies).
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
├── fitnesstime_migration_bia.sql (tabella + RLS + seed modulo BIA — vedi § 3quinquies)
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

## Aggiornamento 2026-10-08
- Schede atleta comprimibili/espandibili (stato in localStorage).
- Service worker network-first (cache v12): gli aggiornamenti si vedono subito, la cache serve solo offline.
- Frecce ▲▼ per spostare gli esercizi nel giorno (rinumera `ordine` su `fitnesstime_esercizi`).
- Misure antropometriche: nuova tabella `fitnesstime_misure_antropometriche` (peso, 7 circonferenze cm, 7 pliche %; una riga per atleta/data, RLS come BIA). UI: sezione nel profilo atleta con storico a colonne per data, modale "+ Nuove misure", PDF "Storico misure". Migrazione: `fitnesstime_migration_antropometria.sql` (applicata).
- Nota sicurezza: le tabelle fitnesstime_* hanno policy anon permissive (modalità demo senza login); da restringere quando si attiva il login reale di Andrea.
