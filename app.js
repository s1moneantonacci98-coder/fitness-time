/* =====================================================================
 * Fitness Time Club — logica client (Supabase v2, routing, timer)
 * ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
 * CONFIGURAZIONE
 * ------------------------------------------------------------------- */
const SUPABASE_URL = 'https://gsuyrptpycrgznqjtbtx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_W-2_EuqFH0u3vFNg8gwW0g_T7byZ8uF';
const APP_TAG = 'fitnesstime'; // deve combaciare con il trigger fitnesstime_handle_new_user

/* ---------------------------------------------------------------------
 * MODALITA' DEMO (per presentazioni rapide, es. all'istruttore in sala pesi)
 * ------------------------------------------------------------------- *
 * Con DEMO_MODE = true l'app salta completamente login/registrazione e
 * apre subito la scheda del profilo demo, usando la chiave anon/publishable.
 * Le policy RLS lato Supabase concedono lettura/inserimento SOLO sulle righe
 * legate a DEMO_PROFILE_ID (vedi fitnesstime_seed_data.sql) — nessun altro
 * dato reale degli atleti e' esposto. Riportare DEMO_MODE a false (e far
 * tornare gli atleti al login vero) quando la demo e' terminata. */
const DEMO_MODE = true;
const DEMO_PROFILE = {
  id: '11111111-1111-4111-8111-111111111111',
  ruolo: 'trainer',
  nome: 'Istruttore',
  cognome: 'Demo',
  email: 'demo@fitnesstime.local',
};

const PENDING_LOGS_KEY = 'ft_pending_logs_v1';

const GYM_INFO = {
  nome: 'Fitness Time Club',
  citta: 'Adelfia (BA)',
  orari: [
    ['Lunedì – Venerdì', '07:00 – 22:30 (continuato)'],
    ['Sabato', '10:00 – 18:00'],
    ['Domenica', 'Chiuso'],
  ],
  corsi: [
    'Body Building', 'Sala Pesi', 'Analisi BIA composizione corporea',
    'Aerobica Funzionale', 'MET', 'Pilates Base', 'Pilates Intermedio',
    'Pilates Avanzato', 'Fit Boxe', 'Jumping',
  ],
};

/* ---------------------------------------------------------------------
 * CLIENT SUPABASE (UMD globale caricato da vendor/supabase.js)
 * ------------------------------------------------------------------- */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---------------------------------------------------------------------
 * STATO APPLICATIVO
 * ------------------------------------------------------------------- */
const state = {
  user: null,
  profile: null,      // riga fitnesstime_profiles (atleta "attivo": vero utente loggato, o atleta simulato dal coach)
  schede: [],          // tutte le schede dell'atleta corrente (con sessioni/esercizi annidati)
  activeScheda: null,
  loadedViews: new Set(),
  activeTimer: null,

  // --- Dashboard Istruttore ---
  mode: 'dashboard',       // 'dashboard' | 'athlete-detail' | 'simulate'
  coach: null,             // profilo trainer/coach (DEMO_PROFILE in demo)
  athletes: [],            // elenco atleti (fitnesstime_profiles ruolo='athlete') con conteggio schede
  athleteFilter: 'tutti',  // 'tutti' | 'sala_pesi' | 'personal' | 'nuoto'
  athleteSearch: '',
  selectedAthlete: null,   // atleta aperto nella vista dettaglio coach

  // --- Catalogo esercizi (selezione rapida modal "+ Esercizio") ---
  catalogo: {},            // { 'Pettorali': ['Croci', 'Distensioni Panca Bassa', ...], ... }
};

// Ordine di visualizzazione dei gruppi muscolari nel catalogo (rispecchia
// l'ordine del modulo cartaceo "Scheda base" della palestra).
const GRUPPI_MUSCOLARI_ORDINE = [
  'Cardio', 'Addominali', 'Lombari', 'Pettorali', 'Dorsali',
  'Gambe/Glutei', 'Spalle', 'Bicipiti', 'Tricipiti',
];

const CATEGORIE = {
  sala_pesi: { label: 'Sala Pesi', icon: 'dumbbell' },
  personal: { label: 'Personal', icon: 'star' },
  nuoto: { label: 'Nuoto', icon: 'waves' },
};

/* ---------------------------------------------------------------------
 * ICONE (SVG inline al posto delle emoji — niente quadratini su Windows,
 * coerenza visiva su tutte le piattaforme).
 * ------------------------------------------------------------------- */
const ICONS = {
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8.5" width="3" height="7" rx="1"/><rect x="18.5" y="8.5" width="3" height="7" rx="1"/><path d="M7 9.5v5M17 9.5v5M7 12h10"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16" rx="2.2"/><path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l5-5.5 4 3L20 6"/><path d="M14.5 6H20v5.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.5l2.47 5.13 5.53.66-4.09 3.86 1.08 5.6L12 15.9l-4.99 2.85 1.08-5.6-4.09-3.86 5.53-.66z"/></svg>',
  waves: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9.5c1.5 1.6 3 1.6 4.5 0s3-1.6 4.5 0 3 1.6 4.5 0 3-1.6 4.5 0"/><path d="M2.5 15c1.5 1.6 3 1.6 4.5 0s3-1.6 4.5 0 3 1.6 4.5 0 3-1.6 4.5 0"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M19.5 19.5l-4.4-4.4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8.5" width="17" height="11" rx="1.5"/><path d="M3.5 8.5l2.2-4.5h12.6l2.2 4.5"/><path d="M10 13h4"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 4.5 5.1 1.5 1.5 0 0 1 6 3.5z"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.1 1 1.85V16h5v-.25c0-.75.4-1.4 1-1.85A6 6 0 0 0 12 3z"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 18.4a9.2 9.2 0 1 1 14.2 0"/><path d="M12 13.5l3.6-4.6"/><circle cx="12" cy="13.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M6.5 7l0.9 11.5A2 2 0 0 0 9.4 20.5h5.2a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.3"/><circle cx="17.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="M8 11l7.5-4M8 13l7.5 4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};

function icon(name, cls) {
  const svg = ICONS[name];
  if (!svg) return '';
  return svg.replace('<svg ', `<svg class="icon${cls ? ' ' + cls : ''}" `);
}

/* ---------------------------------------------------------------------
 * UTILITY DOM / UI
 * ------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(message, type = 'default', duration = 3200) {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast${type === 'success' ? ' toast-success' : ''}${type === 'error' ? ' toast-error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // rimuove accenti
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

function fmtDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------------------------------------------------------------------
 * BADGE CONNESSIONE + CODA OFFLINE
 * ------------------------------------------------------------------- */
function updateConnBadge() {
  const badge = $('#conn-badge');
  const offline = !navigator.onLine;
  badge.hidden = !offline;
  if (offline) badge.textContent = 'Offline';
}

function getPendingLogs() {
  try { return JSON.parse(localStorage.getItem(PENDING_LOGS_KEY) || '[]'); }
  catch { return []; }
}

function savePendingLog(entry) {
  const queue = getPendingLogs();
  queue.push({ ...entry, _queuedAt: Date.now() });
  localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(queue));
}

async function flushPendingLogs() {
  const queue = getPendingLogs();
  if (!queue.length) return;
  const remaining = [];
  for (const entry of queue) {
    try {
      const { _queuedAt, ...args } = entry;
      const { error } = await submitWorkoutLog(args);
      if (error) remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(remaining));
  if (remaining.length < queue.length) {
    toast(`Sincronizzate ${queue.length - remaining.length} serie salvate offline`, 'success');
  }
}

/* ---------------------------------------------------------------------
 * REGISTRAZIONE SERIE (log allenamento)
 * ------------------------------------------------------------------- *
 * In DEMO_MODE non esiste un auth.uid() reale (ne' per l'atleta vero ne'
 * per l'atleta simulato dal coach), quindi la RPC fitnesstime_log_set
 * (pensata per utenti autenticati) non e' utilizzabile: si scrive
 * direttamente su fitnesstime_workout_logs con profile_id esplicito,
 * permesso dalla policy RLS anon scoped ai soli profili ruolo='athlete'. */
async function submitWorkoutLog(args) {
  if (DEMO_MODE) {
    return sb.from('fitnesstime_workout_logs').insert({
      profile_id: state.profile.id,
      sessione_id: args.p_sessione_id,
      esercizio_id: args.p_esercizio_id,
      serie_numero: args.p_serie_numero,
      carico_kg: args.p_carico_kg,
      ripetizioni_effettive: args.p_ripetizioni_effettive,
      rpe_percepito: args.p_rpe_percepito,
      note: args.p_note,
    });
  }
  return sb.rpc('fitnesstime_log_set', args);
}

window.addEventListener('online', () => { updateConnBadge(); flushPendingLogs(); });
window.addEventListener('offline', updateConnBadge);

/* ---------------------------------------------------------------------
 * AUTENTICAZIONE
 * ------------------------------------------------------------------- */
let authMode = 'signin'; // 'signin' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  $('#signup-fields').hidden = mode !== 'signup';
  $('#auth-submit').textContent = mode === 'signup' ? 'Crea account' : 'Accedi';
  $('#auth-toggle-mode').textContent = mode === 'signup'
    ? 'Hai già un account? Accedi'
    : 'Non hai un account? Registrati';
  $('#auth-error').hidden = true;
}

$('#auth-toggle-mode').addEventListener('click', () => {
  setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errEl = $('#auth-error');
  errEl.hidden = true;
  $('#auth-submit').disabled = true;

  try {
    if (authMode === 'signup') {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            app: APP_TAG,
            nome: $('#auth-nome').value.trim(),
            cognome: $('#auth-cognome').value.trim(),
            telefono: $('#auth-telefono').value.trim(),
          },
        },
      });
      if (error) throw error;
      toast('Account creato! Controlla la mail se richiesta la conferma.', 'success');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    errEl.textContent = translateAuthError(err);
    errEl.hidden = false;
  } finally {
    $('#auth-submit').disabled = false;
  }
});

function translateAuthError(err) {
  const msg = (err && err.message) || 'Errore imprevisto.';
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corrette.';
  if (/already registered/i.test(msg)) return 'Esiste già un account con questa email.';
  if (/password/i.test(msg) && /6/.test(msg)) return 'La password deve avere almeno 6 caratteri.';
  return msg;
}

sb.auth.onAuthStateChange((_event, session) => {
  if (DEMO_MODE) return; // in demo l'app non passa mai dal vero login Supabase
  if (session && session.user) {
    enterApp(session.user);
  } else {
    exitApp();
  }
});

/* ---------------------------------------------------------------------
 * INGRESSO DEMO (zero barriere: nessuna registrazione/credenziali)
 * ------------------------------------------------------------------- */
async function enterDemoApp() {
  state.user = null;
  state.coach = DEMO_PROFILE;

  $('#view-auth').hidden = true;

  await loadCatalogoEsercizi();
  await goToDashboard();
}

/* ---------------------------------------------------------------------
 * NAVIGAZIONE TRA LE MACRO-VISTE (dashboard / dettaglio atleta / simulazione)
 * ------------------------------------------------------------------- */
function setMacroView(mode) {
  state.mode = mode;
  $('#view-dashboard').hidden = mode !== 'dashboard';
  $('#view-athlete-detail').hidden = mode !== 'athlete-detail';
  $('#view-app').hidden = mode !== 'simulate';
  $('#tabbar').hidden = mode !== 'simulate';
  $('#simulate-banner').hidden = mode !== 'simulate';
  $('#back-btn').hidden = mode === 'dashboard';
}

$('#back-btn').addEventListener('click', () => {
  if (state.mode === 'simulate') {
    exitSimulate();
  } else if (state.mode === 'athlete-detail') {
    goToDashboard();
  }
});

$('#simulate-exit-btn').addEventListener('click', exitSimulate);

async function confirmAndDeleteAthlete(athlete) {
  const nome = `${athlete.nome} ${athlete.cognome}`.trim();
  if (!window.confirm(`Eliminare definitivamente ${nome}? Verranno eliminate anche tutte le sue schede e le sue BIA. Non si può annullare.`)) return;
  try {
    const { data, error } = await sb.from('fitnesstime_profiles').delete().eq('id', athlete.id).select('id');
    if (error) throw error;
    if (!data || !data.length) {
      toast('Eliminazione non permessa dal database (manca il permesso).', 'error', 4500);
      return;
    }
    toast(`${nome} eliminato ✔`, 'success', 2000);
    await goToDashboard();
  } catch (err) {
    toast('Errore nell\'eliminazione: ' + ((err && err.message) || 'riprova.'), 'error', 4500);
  }
}

async function goToDashboard() {
  state.selectedAthlete = null;
  setMacroView('dashboard');
  await loadAthletes();
  renderDashboard();
}

/* ---------------------------------------------------------------------
 * INGRESSO / USCITA APP
 * ------------------------------------------------------------------- */
async function enterApp(user) {
  state.user = user;

  const { data: profile, error } = await sb
    .from('fitnesstime_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !profile) {
    toast('Profilo non trovato. Contatta lo staff di Fitness Time.', 'error', 5000);
    await sb.auth.signOut();
    return;
  }

  state.profile = profile;
  $('#view-auth').hidden = true;
  $('#view-app').hidden = false;
  $('#tabbar').hidden = false;

  state.loadedViews.clear();
  await loadCatalogoEsercizi();
  await loadSchede();
  renderView('oggi');
  renderInfoView();
  flushPendingLogs();
}

function exitApp() {
  state.user = null;
  state.profile = null;
  state.schede = [];
  state.activeScheda = null;
  state.loadedViews.clear();
  $('#view-auth').hidden = false;
  $('#view-app').hidden = true;
  $('#tabbar').hidden = true;
  $('#auth-form').reset();
  setAuthMode('signin');
}

/* ---------------------------------------------------------------------
 * CARICAMENTO DATI: SCHEDE / SESSIONI / ESERCIZI
 * ------------------------------------------------------------------- */
async function loadSchede() {
  const { data, error } = await sb
    .from('fitnesstime_schede')
    .select(`
      id, titolo, obiettivo, data_inizio, data_scadenza, settimane_durata, note_coach, attiva,
      fitnesstime_sessioni (
        id, nome, ordine, note, addome, cardio,
        fitnesstime_esercizi (
          id, nome, target_muscolare, video_url, ordine, schema_serie, serie,
          ripetizioni, carico_target, percentuale_1rm, rpe, rir,
          tempo_recupero_secondi, recupero_max_secondi, tecnica, rir_testo, note_tecniche
        )
      )
    `)
    .eq('profile_id', state.profile.id)
    .order('data_inizio', { ascending: false });

  if (error) {
    toast('Errore nel caricamento delle schede.', 'error');
    return;
  }

  (data || []).forEach((scheda) => {
    scheda.fitnesstime_sessioni = (scheda.fitnesstime_sessioni || [])
      .sort((a, b) => a.ordine - b.ordine)
      .map((s) => ({
        ...s,
        fitnesstime_esercizi: (s.fitnesstime_esercizi || []).sort((a, b) => a.ordine - b.ordine),
      }));
  });

  state.schede = data || [];
  state.activeScheda = state.schede.find((s) => s.attiva) || state.schede[0] || null;
}

/* ---------------------------------------------------------------------
 * CATALOGO ESERCIZI (selezione rapida, no digitazione manuale)
 * ------------------------------------------------------------------- */
async function loadCatalogoEsercizi() {
  const { data, error } = await sb
    .from('fitnesstime_catalogo_esercizi')
    .select('gruppo_muscolare, nome')
    .order('ordine', { ascending: true });

  if (error || !data) {
    state.catalogo = {};
    return;
  }

  const grouped = {};
  data.forEach((row) => {
    if (!grouped[row.gruppo_muscolare]) grouped[row.gruppo_muscolare] = [];
    grouped[row.gruppo_muscolare].push(row.nome);
  });

  const ordered = {};
  GRUPPI_MUSCOLARI_ORDINE.forEach((g) => { if (grouped[g]) ordered[g] = grouped[g]; });
  Object.keys(grouped).forEach((g) => { if (!ordered[g]) ordered[g] = grouped[g]; });

  state.catalogo = ordered;
}

/* =======================================================================
 * DASHBOARD ISTRUTTORE
 * ===================================================================== */
async function loadAthletes() {
  const { data, error } = await sb
    .from('fitnesstime_profiles')
    .select(`
      id, nome, cognome, telefono, categoria, note, attivo,
      fitnesstime_schede ( id, titolo, attiva, created_at )
    `)
    .eq('ruolo', 'athlete')
    .order('nome', { ascending: true })
    .order('created_at', { referencedTable: 'fitnesstime_schede', ascending: false });

  if (error) {
    toast('Errore nel caricamento degli atleti.', 'error');
    state.athletes = [];
    return;
  }

  state.athletes = (data || []).map((a) => ({
    ...a,
    schedaAttiva: (a.fitnesstime_schede || []).find((s) => s.attiva) || null,
  }));
}

function categoriaBadgeHtml(categoria) {
  const c = CATEGORIE[categoria];
  if (!c) return '';
  return `<span class="badge-categoria cat-${categoria}">${icon(c.icon)}${escapeHtml(c.label)}</span>`;
}

function renderDashboard() {
  renderFilterCounts();

  const el = $('#athlete-list');
  const q = state.athleteSearch.trim().toLowerCase();
  const filtered = state.athletes.filter((a) => {
    const matchCat = state.athleteFilter === 'tutti' || a.categoria === state.athleteFilter;
    const fullName = `${a.nome} ${a.cognome}`.toLowerCase();
    const matchSearch = !q || fullName.includes(q);
    return matchCat && matchSearch;
  });

  if (!filtered.length) {
    el.innerHTML = emptyState('search', 'Nessun atleta trovato con questi filtri.');
    return;
  }

  el.innerHTML = filtered.map((a) => `
    <div class="card athlete-card" data-athlete-id="${a.id}">
      <div class="athlete-avatar">${escapeHtml((a.nome[0] || '') + (a.cognome[0] || ''))}</div>
      <div class="athlete-info">
        <div class="athlete-name">${escapeHtml(a.nome)} ${escapeHtml(a.cognome)}</div>
        <div class="athlete-meta">
          ${categoriaBadgeHtml(a.categoria)}
          <span class="scheda-status ${a.schedaAttiva ? 'has-scheda' : ''}">
            ${a.schedaAttiva ? `✔ ${escapeHtml(a.schedaAttiva.titolo)}` : 'Nessuna scheda'}
          </span>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-open-athlete="${a.id}">Apri</button>
    </div>
  `).join('');

  $$('[data-open-athlete]', el).forEach((btn) => {
    btn.addEventListener('click', () => goToAthleteDetail(btn.dataset.openAthlete));
  });
  $$('.athlete-card', el).forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-athlete]')) return;
      goToAthleteDetail(card.dataset.athleteId);
    });
  });
}

function renderFilterCounts() {
  const counts = { tutti: state.athletes.length, sala_pesi: 0, personal: 0, nuoto: 0 };
  state.athletes.forEach((a) => { if (counts[a.categoria] != null) counts[a.categoria] += 1; });
  Object.entries(counts).forEach(([key, n]) => {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = n;
  });
}

$$('.pill', $('#filter-pills')).forEach((btn) => {
  btn.addEventListener('click', () => {
    state.athleteFilter = btn.dataset.filter;
    $$('.pill', $('#filter-pills')).forEach((b) => b.classList.toggle('is-active', b === btn));
    renderDashboard();
  });
});

$('#athlete-search').addEventListener('input', (e) => {
  state.athleteSearch = e.target.value;
  renderDashboard();
});

/* ---------------------------------------------------------------------
 * MODAL: + NUOVO ATLETA
 * ------------------------------------------------------------------- */
function openNewAthleteModal() {
  $('#new-athlete-form').reset();
  $('#nat-error').hidden = true;
  $('#new-athlete-overlay').hidden = false;
  $('#nat-nome').focus();
}
function closeNewAthleteModal() {
  $('#new-athlete-overlay').hidden = true;
}

$('#new-athlete-btn').addEventListener('click', openNewAthleteModal);
$('#new-athlete-close').addEventListener('click', closeNewAthleteModal);
$('#new-athlete-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'new-athlete-overlay') closeNewAthleteModal();
});

$('#new-athlete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#nat-error');
  errEl.hidden = true;

  const nome = $('#nat-nome').value.trim();
  const cognome = $('#nat-cognome').value.trim();
  const telefono = $('#nat-telefono').value.trim();
  const categoria = $('#nat-categoria').value;
  const note = $('#nat-note').value.trim();

  if (!nome) {
    errEl.textContent = 'Inserisci almeno il nome dell\'atleta.';
    errEl.hidden = false;
    return;
  }

  const submitBtn = $('#nat-submit');
  submitBtn.disabled = true;

  try {
    // fitnesstime_profiles.email e' NOT NULL, ma il form "+ Nuovo Atleta" (come da
    // specifica) non la richiede: generiamo un placeholder finche' l'atleta non
    // completa una vera registrazione (user_id resta null in quel caso).
    const emailPlaceholder = `${slugify(nome)}.${slugify(cognome) || 'atleta'}.${Date.now().toString(36)}@fitnesstime.local`;

    const { error } = await sb.from('fitnesstime_profiles').insert({
      ruolo: 'athlete',
      nome,
      cognome: cognome || '',
      email: emailPlaceholder,
      telefono: telefono || null,
      categoria,
      note: note || null,
      attivo: true,
    });
    if (error) throw error;

    closeNewAthleteModal();
    toast('Atleta creato ✔', 'success', 1800);
    await loadAthletes();
    renderDashboard();
  } catch (err) {
    errEl.textContent = 'Errore nel salvataggio: ' + ((err && err.message) || 'riprova.');
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------------
 * VISTA: PROFILO / SCHEDA ATLETA (lato coach)
 * ------------------------------------------------------------------- */
async function goToAthleteDetail(athleteId) {
  setMacroView('athlete-detail');
  $('#athlete-detail-content').innerHTML = '<p class="muted">Caricamento…</p>';

  const { data, error } = await sb
    .from('fitnesstime_profiles')
    .select(`
      id, nome, cognome, telefono, categoria, note, attivo,
      fitnesstime_schede (
        id, titolo, obiettivo, data_inizio, data_scadenza, settimane_durata, note_coach, attiva,
        fitnesstime_sessioni (
          id, nome, ordine, note, addome, cardio,
          fitnesstime_esercizi (
            id, nome, target_muscolare, video_url, ordine, schema_serie, serie,
            ripetizioni, carico_target, percentuale_1rm, rpe, rir,
            tempo_recupero_secondi, recupero_max_secondi, tecnica, rir_testo, note_tecniche
          )
        )
      ),
      fitnesstime_misure_bia (
        id, data_rilevazione, peso_kg, massa_grassa_perc, massa_magra_kg, acqua_perc, grasso_viscerale, note, altezza_cm, rz_ohm, xc_ohm, pha_gradi, bmr_kcal, bcmi, bcm_kg, massa_grassa_kg, smm_kg, asmm_kg, tbw_l, ecw_l, icw_l
      )
    `)
    .eq('id', athleteId)
    .order('created_at', { referencedTable: 'fitnesstime_schede', ascending: false })
    .order('data_rilevazione', { referencedTable: 'fitnesstime_misure_bia', ascending: false })
    .single();

  if (error || !data) {
    toast('Errore nel caricamento del profilo atleta.', 'error');
    goToDashboard();
    return;
  }

  data.fitnesstime_schede = (data.fitnesstime_schede || []).map((sc) => ({
    ...sc,
    fitnesstime_sessioni: (sc.fitnesstime_sessioni || [])
      .sort((a, b) => a.ordine - b.ordine)
      .map((s) => ({
        ...s,
        fitnesstime_esercizi: (s.fitnesstime_esercizi || []).sort((a, b) => a.ordine - b.ordine),
      })),
  }));
  data.fitnesstime_misure_bia = data.fitnesstime_misure_bia || [];

  state.selectedAthlete = data;
  renderAthleteDetail();
}

const SCHEDE_COLLASSATE_KEY = 'fitnesstime-schede-collassate';
function loadSchedeCollassate() {
  try { return new Set(JSON.parse(localStorage.getItem(SCHEDE_COLLASSATE_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function saveSchedeCollassate(set) {
  try { localStorage.setItem(SCHEDE_COLLASSATE_KEY, JSON.stringify([...set])); } catch (e) { /* storage non disponibile */ }
}
const schedeCollassate = loadSchedeCollassate();

function renderAthleteDetail() {
  const a = state.selectedAthlete;
  const el = $('#athlete-detail-content');
  if (!a) { el.innerHTML = ''; return; }

  const schedaAttiva = (a.fitnesstime_schede || []).find((s) => s.attiva) || null;

  el.innerHTML = `
    <div class="card session-card">
      <div class="exercise-head">
        <h3 class="card-title" style="margin-bottom:0;">${escapeHtml(a.nome)} ${escapeHtml(a.cognome)}</h3>
        ${categoriaBadgeHtml(a.categoria)}
      </div>
      ${a.telefono ? `<p class="muted">${icon('phone')} ${escapeHtml(a.telefono)}</p>` : ''}
      ${a.note ? `<p class="muted">${icon('message')} ${escapeHtml(a.note)}</p>` : ''}
      <button type="button" class="btn btn-secondary btn-block" id="simulate-btn" ${schedaAttiva ? '' : 'disabled'}>
        ${icon('eye')} Simula Allenamento (Vista Atleta)
      </button>
      <button type="button" class="btn btn-secondary btn-block" id="delete-athlete-btn">
        ${icon('trash')} Elimina atleta
      </button>
    </div>

    ${biaSectionHtml(a)}

    <button type="button" class="btn btn-primary btn-block" id="assign-scheda-btn">+ Assegna Nuova Scheda</button>

    ${(a.fitnesstime_schede || []).length ? (a.fitnesstime_schede || []).map((scheda) => `
      <div class="card session-card scheda-collassabile${schedeCollassate.has(scheda.id) ? ' is-collapsed' : ''}" data-scheda-id="${scheda.id}">
        <div class="exercise-head scheda-toggle" data-toggle-scheda="${scheda.id}" role="button" tabindex="0" aria-expanded="${schedeCollassate.has(scheda.id) ? 'false' : 'true'}" title="Riduci / espandi scheda">
          <span class="exercise-name"><span class="scheda-chevron">${icon('chevron')}</span>${escapeHtml(scheda.titolo)}</span>
          <div class="scheda-head-actions">
            <span class="chip ${scheda.attiva ? 'chip-red' : ''}">${scheda.attiva ? 'Attiva' : 'Conclusa'}</span>
            <button type="button" class="icon-btn-sm icon-btn-danger" data-delete-scheda="${scheda.id}" aria-label="Elimina scheda" title="Elimina scheda">${icon('trash')}</button>
          </div>
        </div>
        ${scheda.obiettivo ? `<p class="muted">${escapeHtml(scheda.obiettivo)}</p>` : ''}
        <div class="scheda-body">
        <div class="scheda-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-pdf-scheda="${scheda.id}">${icon('download')} PDF</button>
          <button type="button" class="btn btn-primary btn-sm" data-share-scheda="${scheda.id}">${icon('share')} Invia</button>
        </div>
        ${!scheda.attiva ? `<button type="button" class="btn btn-secondary btn-sm" data-activate-scheda="${scheda.id}" style="margin-bottom:10px;">${icon('check')} Rendi attiva</button>` : ''}
        ${(scheda.fitnesstime_sessioni || []).map((s) => `
          <div class="exercise-item">
            <div class="exercise-head">
              <span class="exercise-name">${escapeHtml(s.nome)}</span>
              <div class="scheda-head-actions">
                <button type="button" class="btn-pill-add" data-extras-sessione="${s.id}">Addome / Cardio</button>
                <button type="button" class="btn-pill-add" data-add-ex-sessione="${s.id}">+ Esercizio</button>
              </div>
            </div>
            ${(s.fitnesstime_esercizi || []).length
              ? (s.fitnesstime_esercizi || []).map((ex, exIdx, exList) => `
                <div class="exercise-row-line" data-esercizio-id="${ex.id}">
                  <div class="exercise-row-info">
                    <span class="exercise-row-name">${escapeHtml(ex.nome)}</span>
                    <span class="exercise-row-meta">${ex.serie}×${escapeHtml(ex.ripetizioni)} ${icon('clock')}${escapeHtml(recuperoLabel(ex))}${rirLabel(ex) !== '—' ? ' · RIR ' + escapeHtml(rirLabel(ex)) : ''}</span>
                    ${ex.tecnica ? `<span class="exercise-row-tecnica">${escapeHtml(ex.tecnica)}</span>` : ''}
                    ${ex.note_tecniche ? `<span class="exercise-row-note">${icon('bulb')}${escapeHtml(ex.note_tecniche)}</span>` : ''}
                  </div>
                  <div class="exercise-row-actions">
                    <div class="move-btns">
                      <button type="button" class="icon-btn-move" data-move-esercizio="${ex.id}" data-dir="-1" aria-label="Sposta su" title="Sposta su" ${exIdx === 0 ? 'disabled' : ''}>${icon('up')}</button>
                      <button type="button" class="icon-btn-move icon-btn-move-down" data-move-esercizio="${ex.id}" data-dir="1" aria-label="Sposta giù" title="Sposta giù" ${exIdx === exList.length - 1 ? 'disabled' : ''}>${icon('up')}</button>
                    </div>
                    <button type="button" class="icon-btn-remove" data-remove-esercizio="${ex.id}" aria-label="Rimuovi esercizio" title="Rimuovi esercizio">${icon('close')}</button>
                  </div>
                </div>
              `).join('')
              : '<p class="muted" style="font-size:13px;">Nessun esercizio in questo giorno.</p>'}
            ${s.addome ? `<p class="session-extra"><strong>ADDOME</strong>${escapeHtml(s.addome)}</p>` : ''}
            ${s.cardio ? `<p class="session-extra"><strong>CARDIO</strong>${escapeHtml(s.cardio)}</p>` : ''}
          </div>
        `).join('') || '<p class="muted">Nessun giorno configurato.</p>'}
        </div>
      </div>
    `).join('') : emptyState('clipboard', 'Nessuna scheda assegnata. Usa "+ Assegna Nuova Scheda" per crearne una.')}
  `;

  const delAthleteBtn = $('#delete-athlete-btn');
  if (delAthleteBtn) delAthleteBtn.addEventListener('click', () => confirmAndDeleteAthlete(a));

  const simBtn = $('#simulate-btn');
  if (simBtn) simBtn.addEventListener('click', () => startSimulate(a, schedaAttiva));

  $('#assign-scheda-btn').addEventListener('click', () => openNewSchedaModal(a.id));

  const biaBtn = $('#new-bia-btn');
  if (biaBtn) biaBtn.addEventListener('click', () => openBiaModal(a.id));

  const toggleScheda = (head) => {
    const card = head.closest('[data-scheda-id]');
    if (!card) return;
    const id = card.dataset.schedaId;
    const collapsed = card.classList.toggle('is-collapsed');
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (collapsed) schedeCollassate.add(id); else schedeCollassate.delete(id);
    saveSchedeCollassate(schedeCollassate);
  };
  $$('[data-toggle-scheda]', el).forEach((head) => {
    head.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // cestino ecc. non devono comprimere
      toggleScheda(head);
    });
    head.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); toggleScheda(head); }
    });
  });

  $$('[data-delete-scheda]', el).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmAndDeleteScheda(btn.dataset.deleteScheda);
    });
  });

  $$('[data-activate-scheda]', el).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateScheda(btn.dataset.activateScheda);
    });
  });

  $$('[data-move-esercizio]', el).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveEsercizio(btn.dataset.moveEsercizio, Number(btn.dataset.dir));
    });
  });

  $$('[data-remove-esercizio]', el).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmAndRemoveEsercizio(btn.dataset.removeEsercizio);
    });
  });

  const schedaById = (id) => (a.fitnesstime_schede || []).find((x) => x.id === id);
  $$('[data-pdf-scheda]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const sc = schedaById(btn.dataset.pdfScheda);
      if (!sc) return;
      try { downloadSchedaPdf(a, sc); toast('PDF scaricato ✔', 'success', 1800); }
      catch (err) { toast('Errore nella creazione del PDF.', 'error'); }
    });
  });
  $$('[data-share-scheda]', el).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sc = schedaById(btn.dataset.shareScheda);
      if (!sc) return;
      try {
        const r = await shareSchedaPdf(a, sc);
        if (r === 'fallback') toast('PDF scaricato: allegalo nella chat WhatsApp.', 'default', 4200);
      } catch (err) { toast('Errore nell\'invio della scheda.', 'error'); }
    });
  });

  $$('[data-extras-sessione]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const sessione = findSessioneById(a, btn.dataset.extrasSessione);
      if (sessione) openExtrasModal(sessione);
    });
  });

  $$('[data-add-ex-sessione]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const sessione = findSessioneById(a, btn.dataset.addExSessione);
      if (sessione) openAddExerciseModal(sessione, 'athlete-detail');
    });
  });
}

function findSessioneById(athlete, sessioneId) {
  for (const scheda of athlete.fitnesstime_schede || []) {
    const found = (scheda.fitnesstime_sessioni || []).find((s) => s.id === sessioneId);
    if (found) return found;
  }
  return null;
}

/* ---------------------------------------------------------------------
 * SEZIONE: COMPOSIZIONE CORPOREA (BIA) — profilo atleta (vista coach)
 * ------------------------------------------------------------------- */
function biaDeltaBadge(curr, prev, unit, invert) {
  if (curr == null || prev == null) return '';
  const delta = Math.round((Number(curr) - Number(prev)) * 10) / 10;
  if (delta === 0) return '<span class="bia-delta bia-delta-flat">= invariato</span>';
  const isImprovement = invert ? delta > 0 : delta < 0;
  const arrow = delta > 0 ? '▲' : '▼';
  return `<span class="bia-delta ${isImprovement ? 'bia-delta-good' : 'bia-delta-bad'}">${arrow} ${Math.abs(delta)}${unit}</span>`;
}

function biaMetricHtml(label, value, unit, deltaHtml) {
  return `
    <div class="bia-metric">
      <span class="bia-metric-value">${value != null ? escapeHtml(String(value)) : '–'}${value != null ? `<small>${unit}</small>` : ''}</span>
      <span class="bia-metric-label">${label}</span>
      ${deltaHtml || ''}
    </div>
  `;
}

const BIA_COLS = "id, data_rilevazione, peso_kg, massa_grassa_perc, massa_magra_kg, acqua_perc, grasso_viscerale, note, altezza_cm, rz_ohm, xc_ohm, pha_gradi, bmr_kcal, bcmi, bcm_kg, massa_grassa_kg, smm_kg, asmm_kg, tbw_l, ecw_l, icw_l";

function biaR(x) { return Math.round(x * 10) / 10; }
function biaPct(part, whole) {
  if (part == null || whole == null || !(Number(whole) > 0)) return null;
  return biaR((Number(part) / Number(whole)) * 100);
}

/* Valori derivati (non salvati): BMI e percentuali come nel PDF dello strumento. */
function biaCalc(m) {
  const h = m.altezza_cm != null ? Number(m.altezza_cm) / 100 : null;
  return {
    bmi: h && m.peso_kg != null ? biaR(Number(m.peso_kg) / (h * h)) : null,
    ffm_p: biaPct(m.massa_magra_kg, m.peso_kg),
    fm_p: biaPct(m.massa_grassa_kg, m.peso_kg),
    smm_p: biaPct(m.smm_kg, m.peso_kg),
    asmm_p: biaPct(m.asmm_kg, m.peso_kg),
    tbw_p: biaPct(m.tbw_l, m.peso_kg),
    ecw_tbw: biaPct(m.ecw_l, m.tbw_l),
    icw_tbw: biaPct(m.icw_l, m.tbw_l),
    bcm_ffm: biaPct(m.bcm_kg, m.massa_magra_kg),
  };
}

function biaDettagliHtml(m) {
  const c = biaCalc(m);
  const v = (x, u) => (x != null && x !== '' ? `${escapeHtml(String(x))}${u ? ' ' + u : ''}` : '–');
  const rows = [
    ['Peso', v(m.peso_kg, 'kg'), 'Altezza', v(m.altezza_cm, 'cm')],
    ['BMI', v(c.bmi), 'PhA', v(m.pha_gradi, '°')],
    ['BMR', v(m.bmr_kcal, 'kcal'), 'BCMI', v(m.bcmi)],
    ['RZ', v(m.rz_ohm, 'Ohm'), 'XC', v(m.xc_ohm, 'Ohm')],
    ['FFM', v(m.massa_magra_kg, 'kg'), 'FFM / Peso', v(c.ffm_p, '%')],
    ['FM', v(m.massa_grassa_kg, 'kg'), 'FM / Peso', v(c.fm_p, '%')],
    ['BCM', v(m.bcm_kg, 'kg'), 'BCM / FFM', v(c.bcm_ffm, '%')],
    ['SMM', v(m.smm_kg, 'kg'), 'SMM / Peso', v(c.smm_p, '%')],
    ['ASMM', v(m.asmm_kg, 'kg'), 'ASMM / Peso', v(c.asmm_p, '%')],
    ['TBW', v(m.tbw_l, 'L'), 'TBW / Peso', v(c.tbw_p, '%')],
    ['ECW', v(m.ecw_l, 'L'), 'ECW / TBW', v(c.ecw_tbw, '%')],
    ['ICW', v(m.icw_l, 'L'), 'ICW / TBW', v(c.icw_tbw, '%')],
  ];
  return `
    <details class="bia-more">
      <summary>Tutti i valori (${fmtDate(m.data_rilevazione)})</summary>
      <table class="bia-detail-table"><tbody>
        ${rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td><th>${r[2]}</th><td>${r[3]}</td></tr>`).join('')}
      </tbody></table>
      ${m.note ? `<p class="muted" style="margin-top:8px;">${icon('message')} ${escapeHtml(m.note)}</p>` : ''}
    </details>
  `;
}

function biaSectionHtml(athlete) {
  const misure = athlete.fitnesstime_misure_bia || [];
  const ultima = misure[0] || null;
  const prec = misure[1] || null;
  const pv = (k) => (prec ? prec[k] : null);

  const summary = ultima ? `
    <p class="muted" style="margin-bottom:10px;">Ultima rilevazione: ${fmtDate(ultima.data_rilevazione)}</p>
    <div class="bia-metric-grid">
      ${biaMetricHtml('Peso', ultima.peso_kg, 'kg', biaDeltaBadge(ultima.peso_kg, pv('peso_kg'), 'kg', false))}
      ${biaMetricHtml('Massa Grassa', ultima.massa_grassa_perc, '%', biaDeltaBadge(ultima.massa_grassa_perc, pv('massa_grassa_perc'), '%', false))}
      ${biaMetricHtml('Massa Magra', ultima.massa_magra_kg, 'kg', biaDeltaBadge(ultima.massa_magra_kg, pv('massa_magra_kg'), 'kg', true))}
      ${biaMetricHtml('Muscolo (SMM)', ultima.smm_kg, 'kg', biaDeltaBadge(ultima.smm_kg, pv('smm_kg'), 'kg', true))}
      ${biaMetricHtml('Idratazione', ultima.acqua_perc, '%', biaDeltaBadge(ultima.acqua_perc, pv('acqua_perc'), '%', true))}
      ${biaMetricHtml('Angolo di fase', ultima.pha_gradi, '°', biaDeltaBadge(ultima.pha_gradi, pv('pha_gradi'), '°', true))}
    </div>
    ${biaDettagliHtml(ultima)}
  ` : '<p class="muted" style="margin-bottom:10px;">Nessuna rilevazione BIA registrata.</p>';

  const storico = misure.length ? `
    <table class="bia-history-table">
      <thead><tr><th>Data</th><th>Peso</th><th>% Grasso</th><th>Magra</th><th>% Acqua</th></tr></thead>
      <tbody>
        ${misure.map((m) => `
          <tr>
            <td>${fmtDate(m.data_rilevazione)}</td>
            <td>${m.peso_kg != null ? escapeHtml(String(m.peso_kg)) : '–'} kg</td>
            <td>${m.massa_grassa_perc != null ? escapeHtml(String(m.massa_grassa_perc)) : '–'}%</td>
            <td>${m.massa_magra_kg != null ? escapeHtml(String(m.massa_magra_kg)) : '–'} kg</td>
            <td>${m.acqua_perc != null ? escapeHtml(String(m.acqua_perc)) : '–'}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '';

  return `
    <div class="card" data-bia-section>
      <div class="exercise-head">
        <h3 class="card-title card-title-icon" style="margin-bottom:0;">${icon('gauge')}<span>Composizione Corporea <span class="bia-sub">(BIA)</span></span></h3>
        <button type="button" class="btn btn-secondary btn-sm" id="new-bia-btn">+ Nuova BIA</button>
      </div>
      ${summary}
      ${storico}
    </div>
  `;
}

/* ---------------------------------------------------------------------
 * MODAL: + NUOVA BIA
 * ------------------------------------------------------------------- */
function openBiaModal(athleteId) {
  $('#bia-form').reset();
  $('#bia-error').hidden = true;
  $('#bia-data').value = new Date().toISOString().slice(0, 10);
  $('#bia-calcoli').hidden = true;
  const more = $('#bia-form .bia-more'); if (more) more.open = false;
  $('#bia-overlay').hidden = false;
  $('#bia-overlay').dataset.athleteId = athleteId;
  $('#bia-peso').focus();
}
function closeBiaModal() {
  $('#bia-overlay').hidden = true;
}

$('#bia-close').addEventListener('click', closeBiaModal);
$('#bia-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'bia-overlay') closeBiaModal();
});

function biaReadForm() {
  const n = (id) => {
    const raw = $(id).value.trim().replace(',', '.');
    if (raw === '') return null;
    const x = parseFloat(raw);
    return Number.isFinite(x) ? x : null;
  };
  return {
    data_rilevazione: $('#bia-data').value,
    peso_kg: n('#bia-peso'),
    altezza_cm: n('#bia-altezza'),
    pha_gradi: n('#bia-pha'),
    massa_magra_kg: n('#bia-magra'),
    massa_grassa_kg: n('#bia-fm'),
    smm_kg: n('#bia-smm'),
    tbw_l: n('#bia-tbw'),
    rz_ohm: n('#bia-rz'),
    xc_ohm: n('#bia-xc'),
    bmr_kcal: n('#bia-bmr'),
    bcmi: n('#bia-bcmi'),
    bcm_kg: n('#bia-bcm'),
    asmm_kg: n('#bia-asmm'),
    ecw_l: n('#bia-ecw'),
    icw_l: n('#bia-icw'),
  };
}

$('#bia-form').addEventListener('input', () => {
  const m = biaReadForm();
  const c = biaCalc(m);
  const parts = [];
  if (c.bmi != null) parts.push(`BMI ${c.bmi}`);
  if (c.fm_p != null) parts.push(`Grasso ${c.fm_p}%`);
  if (c.ffm_p != null) parts.push(`Magra ${c.ffm_p}%`);
  if (c.smm_p != null) parts.push(`Muscolo ${c.smm_p}%`);
  if (c.tbw_p != null) parts.push(`Acqua ${c.tbw_p}%`);
  const el = $('#bia-calcoli');
  el.textContent = parts.length ? 'Calcolati: ' + parts.join(' · ') : '';
  el.hidden = !parts.length;
});

$('#bia-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const athleteId = $('#bia-overlay').dataset.athleteId;
  const errEl = $('#bia-error');
  errEl.hidden = true;

  const m = biaReadForm();
  const note = $('#bia-note').value.trim();

  if (!m.data_rilevazione || m.peso_kg == null || m.peso_kg <= 0) {
    errEl.textContent = 'Inserisci almeno data e peso.';
    errEl.hidden = false;
    return;
  }

  const c = biaCalc(m);
  const payload = {
    atleta_id: athleteId,
    ...m,
    // percentuali "storiche" usate da riepilogo e storico, calcolate dai kg/litri
    massa_grassa_perc: c.fm_p,
    acqua_perc: c.tbw_p,
    note: note || null,
  };

  const submitBtn = $('#bia-submit');
  submitBtn.disabled = true;

  try {
    // upsert: una rilevazione al giorno per atleta (unique atleta_id/data_rilevazione)
    const { data, error } = await sb
      .from('fitnesstime_misure_bia')
      .upsert(payload, { onConflict: 'atleta_id,data_rilevazione' })
      .select(BIA_COLS)
      .single();
    if (error) throw error;

    closeBiaModal();
    toast('Rilevazione BIA salvata ✔', 'success', 1800);

    if (state.selectedAthlete && state.selectedAthlete.id === athleteId) {
      const altre = (state.selectedAthlete.fitnesstime_misure_bia || [])
        .filter((x) => x.data_rilevazione !== data.data_rilevazione);
      state.selectedAthlete.fitnesstime_misure_bia = [...altre, data]
        .sort((x, y) => (x.data_rilevazione < y.data_rilevazione ? 1 : -1));
      renderAthleteDetail();
    }
  } catch (err) {
    errEl.textContent = 'Errore nel salvataggio: ' + ((err && err.message) || 'riprova.');
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------------
 * GESTIONE SCHEDE / ESERCIZI (elimina, attiva, rimuovi) — vista coach
 * ------------------------------------------------------------------- */
async function confirmAndDeleteScheda(schedaId) {
  if (!window.confirm('Sei sicuro di voler eliminare questa scheda? Verranno eliminati anche tutti i giorni e gli esercizi collegati.')) {
    return;
  }

  try {
    // Il CASCADE lato database (on delete cascade su scheda_id/sessione_id)
    // rimuove automaticamente sessioni ed esercizi collegati.
    const { error } = await sb.from('fitnesstime_schede').delete().eq('id', schedaId);
    if (error) throw error;

    toast('Scheda eliminata ✔', 'success', 1800);

    if (state.selectedAthlete) {
      await goToAthleteDetail(state.selectedAthlete.id);
    }
    await loadAthletes();
  } catch (err) {
    toast('Errore nell\'eliminazione della scheda: ' + ((err && err.message) || 'riprova.'), 'error');
  }
}

async function activateScheda(schedaId) {
  const athlete = state.selectedAthlete;
  if (!athlete) return;

  try {
    // Disattiva tutte le altre schede dell'atleta, poi attiva quella scelta
    // (una sola scheda attiva per atleta alla volta).
    const altreIds = (athlete.fitnesstime_schede || [])
      .map((s) => s.id)
      .filter((id) => id !== schedaId);

    if (altreIds.length) {
      const { error: errOff } = await sb
        .from('fitnesstime_schede')
        .update({ attiva: false })
        .in('id', altreIds);
      if (errOff) throw errOff;
    }

    const { error: errOn } = await sb
      .from('fitnesstime_schede')
      .update({ attiva: true })
      .eq('id', schedaId);
    if (errOn) throw errOn;

    toast('Scheda impostata come attiva ✔', 'success', 1800);
    await goToAthleteDetail(athlete.id);
    await loadAthletes();
  } catch (err) {
    toast('Errore nell\'attivazione della scheda: ' + ((err && err.message) || 'riprova.'), 'error');
  }
}

/* Sposta un esercizio su (-1) o giù (+1) nel suo giorno e rinumera 'ordine' (1..n). */
let moveInCorso = false;
async function moveEsercizio(esercizioId, dir) {
  if (moveInCorso || !state.selectedAthlete) return;
  let sessione = null;
  (state.selectedAthlete.fitnesstime_schede || []).forEach((sc) => {
    (sc.fitnesstime_sessioni || []).forEach((s) => {
      if ((s.fitnesstime_esercizi || []).some((ex) => ex.id === esercizioId)) sessione = s;
    });
  });
  if (!sessione) return;
  const lista = sessione.fitnesstime_esercizi;
  const i = lista.findIndex((ex) => ex.id === esercizioId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;

  const nuova = lista.slice();
  [nuova[i], nuova[j]] = [nuova[j], nuova[i]];
  const modificati = [];
  nuova.forEach((ex, k) => { if (ex.ordine !== k + 1) modificati.push({ id: ex.id, ordine: k + 1 }); });

  moveInCorso = true;
  try {
    const res = await Promise.all(modificati.map((m) =>
      sb.from('fitnesstime_esercizi').update({ ordine: m.ordine }).eq('id', m.id)));
    const fallita = res.find((r) => r.error);
    if (fallita) throw fallita.error;
    nuova.forEach((ex, k) => { ex.ordine = k + 1; });
    sessione.fitnesstime_esercizi = nuova;
    renderAthleteDetail();
  } catch (err) {
    toast('Errore nello spostamento: ' + ((err && err.message) || 'riprova.'), 'error');
  } finally {
    moveInCorso = false;
  }
}

async function confirmAndRemoveEsercizio(esercizioId) {
  if (!window.confirm('Rimuovere questo esercizio dalla sessione?')) return;

  try {
    const { error } = await sb.from('fitnesstime_esercizi').delete().eq('id', esercizioId);
    if (error) throw error;

    toast('Esercizio rimosso ✔', 'success', 1600);

    if (state.selectedAthlete) {
      // Rimozione locale immediata, senza un round-trip completo al server.
      (state.selectedAthlete.fitnesstime_schede || []).forEach((sc) => {
        (sc.fitnesstime_sessioni || []).forEach((s) => {
          s.fitnesstime_esercizi = (s.fitnesstime_esercizi || []).filter((ex) => ex.id !== esercizioId);
        });
      });
      renderAthleteDetail();
    }
  } catch (err) {
    toast('Errore nella rimozione dell\'esercizio: ' + ((err && err.message) || 'riprova.'), 'error');
  }
}

/* ---------------------------------------------------------------------
 * MODAL: + ASSEGNA NUOVA SCHEDA
 * ------------------------------------------------------------------- */
function openNewSchedaModal(athleteId) {
  $('#new-scheda-form').reset();
  $('#nsc-giorni').value = 'Giorno A, Giorno B, Giorno C';
  $('#nsc-error').hidden = true;
  $('#new-scheda-overlay').hidden = false;
  $('#new-scheda-overlay').dataset.athleteId = athleteId;
  $('#nsc-titolo').focus();
}
function closeNewSchedaModal() {
  $('#new-scheda-overlay').hidden = true;
}

$('#new-scheda-close').addEventListener('click', closeNewSchedaModal);
$('#new-scheda-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'new-scheda-overlay') closeNewSchedaModal();
});

$('#new-scheda-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const athleteId = $('#new-scheda-overlay').dataset.athleteId;
  const errEl = $('#nsc-error');
  errEl.hidden = true;

  const titolo = $('#nsc-titolo').value.trim();
  const obiettivo = $('#nsc-obiettivo').value.trim();
  const giorni = $('#nsc-giorni').value.split(',').map((g) => g.trim()).filter(Boolean);

  if (!titolo) {
    errEl.textContent = 'Inserisci il titolo della scheda.';
    errEl.hidden = false;
    return;
  }
  if (!giorni.length) {
    errEl.textContent = 'Inserisci almeno un giorno di allenamento.';
    errEl.hidden = false;
    return;
  }

  const submitBtn = $('#nsc-submit');
  submitBtn.disabled = true;

  try {
    // Nota: le policy demo concedono ad anon solo SELECT+INSERT (mai UPDATE),
    // quindi una scheda precedente non viene disattivata automaticamente qui:
    // la vista prende sempre la scheda "attiva" piu' recente (vedi ordinamento
    // per created_at in goToAthleteDetail/loadAthletes).
    const { data: scheda, error: schedaErr } = await sb
      .from('fitnesstime_schede')
      .insert({ profile_id: athleteId, titolo, obiettivo: obiettivo || null, attiva: true })
      .select('id')
      .single();
    if (schedaErr) throw schedaErr;

    const sessioniPayload = giorni.map((nome, i) => ({ scheda_id: scheda.id, nome, ordine: i + 1 }));
    const { error: sessioniErr } = await sb.from('fitnesstime_sessioni').insert(sessioniPayload);
    if (sessioniErr) throw sessioniErr;

    closeNewSchedaModal();
    toast('Scheda creata ✔', 'success', 1800);
    await goToAthleteDetail(athleteId);
    await loadAthletes(); // aggiorna lo stato "scheda attiva" nella lista dashboard
  } catch (err) {
    errEl.textContent = 'Errore nel salvataggio: ' + ((err && err.message) || 'riprova.');
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------------
 * ADDOME / CARDIO del giorno
 * ------------------------------------------------------------------- */
function openExtrasModal(sessione) {
  $('#extras-title').textContent = 'Addome & Cardio — ' + sessione.nome;
  $('#extras-addome').value = sessione.addome || '';
  $('#extras-cardio').value = sessione.cardio || '';
  $('#extras-error').hidden = true;
  $('#extras-overlay').dataset.sessioneId = sessione.id;
  $('#extras-overlay').hidden = false;
}
function closeExtrasModal() { $('#extras-overlay').hidden = true; }
$('#extras-close').addEventListener('click', closeExtrasModal);
$('#extras-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'extras-overlay') closeExtrasModal();
});
$('#extras-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#extras-overlay').dataset.sessioneId;
  const addome = $('#extras-addome').value.trim() || null;
  const cardio = $('#extras-cardio').value.trim() || null;
  const btn = $('#extras-submit');
  btn.disabled = true;
  const { error } = await sb.from('fitnesstime_sessioni').update({ addome, cardio }).eq('id', id);
  btn.disabled = false;
  if (error) {
    $('#extras-error').textContent = 'Errore nel salvataggio: ' + (error.message || 'riprova.');
    $('#extras-error').hidden = false;
    return;
  }
  const sessione = state.selectedAthlete && findSessioneById(state.selectedAthlete, id);
  if (sessione) { sessione.addome = addome; sessione.cardio = cardio; }
  closeExtrasModal();
  toast('Salvato ✔', 'success', 1500);
  renderAthleteDetail();
});

/* ---------------------------------------------------------------------
 * SIMULA ALLENAMENTO (Vista Atleta) — riusa la UI "Allenamento Oggi"
 * ------------------------------------------------------------------- */
async function startSimulate(athlete, schedaAttiva) {
  if (!schedaAttiva) {
    toast('Assegna prima una scheda attiva per poter simulare l\'allenamento.', 'error');
    return;
  }
  state.profile = { id: athlete.id, nome: athlete.nome, cognome: athlete.cognome, ruolo: 'athlete' };
  $('#simulate-athlete-name').textContent = `${athlete.nome} ${athlete.cognome}`;

  setMacroView('simulate');
  state.loadedViews.clear();
  currentSessioneId = null;
  await loadSchede();
  renderView('oggi');
  renderInfoView();
}

function exitSimulate() {
  if (state.activeTimer) {
    clearInterval(state.activeTimer.intervalId);
    state.activeTimer = null;
    $('#timer-overlay').hidden = true;
  }
  state.profile = null;
  goToDashboard();
}

/* ---------------------------------------------------------------------
 * ROUTING TAB
 * ------------------------------------------------------------------- */
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => renderView(btn.dataset.target));
});

function renderView(name) {
  $$('.tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.target === name));
  $$('#view-app .view').forEach((v) => { v.hidden = v.dataset.view !== name; });

  if (name === 'oggi') renderOggiView();
  if (name === 'schede') renderSchedeView();
  if (name === 'storico') renderStoricoView();
  if (name === 'info') renderInfoView();
}

/* ---------------------------------------------------------------------
 * VISTA: ALLENAMENTO OGGI
 * ------------------------------------------------------------------- */
let currentSessioneId = null;

function renderOggiView() {
  const el = $('#oggi-content');
  const scheda = state.activeScheda;

  if (!scheda) {
    el.innerHTML = emptyState('clipboard', 'Nessuna scheda attiva. Il tuo coach non ha ancora caricato un programma.');
    return;
  }

  const sessioni = scheda.fitnesstime_sessioni || [];
  if (!sessioni.length) {
    el.innerHTML = emptyState('folder', 'La scheda attiva non ha ancora giorni di allenamento configurati.');
    return;
  }

  if (currentSessioneId && sessioni.some((s) => s.id === currentSessioneId)) {
    renderSessioneWorkout(sessioni.find((s) => s.id === currentSessioneId));
    return;
  }

  el.innerHTML = `
    <div class="card session-card">
      <h3 class="card-title">${escapeHtml(scheda.titolo)}</h3>
      <p class="muted">${escapeHtml(scheda.obiettivo || 'Scegli il giorno di allenamento di oggi.')}</p>
    </div>
    ${sessioni.map((s) => `
      <div class="card">
        <div class="exercise-head">
          <span class="exercise-name">${escapeHtml(s.nome)}</span>
          <span class="chip">${(s.fitnesstime_esercizi || []).length} esercizi</span>
        </div>
        <button class="btn btn-primary btn-block" data-start-sessione="${s.id}">Inizia allenamento</button>
      </div>
    `).join('')}
  `;

  $$('[data-start-sessione]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSessioneId = btn.dataset.startSessione;
      renderOggiView();
    });
  });
}

function renderSessioneWorkout(sessione) {
  const el = $('#oggi-content');
  const esercizi = sessione.fitnesstime_esercizi || [];

  el.innerHTML = `
    <button class="btn btn-ghost" id="back-to-sessioni">← Cambia giorno</button>
    <div class="card session-card">
      <h3 class="card-title">${escapeHtml(sessione.nome)}</h3>
      ${sessione.note ? `<p class="muted">${escapeHtml(sessione.note)}</p>` : ''}
    </div>
    <button type="button" class="btn btn-primary btn-block" id="add-exercise-btn">+ Aggiungi Esercizio</button>
    <div id="exercise-list-wrap" class="stack">
      ${esercizi.map(exerciseCardHtml).join('')}
    </div>
  `;

  $('#back-to-sessioni').addEventListener('click', () => {
    currentSessioneId = null;
    renderOggiView();
  });

  $('#add-exercise-btn').addEventListener('click', () => openAddExerciseModal(sessione, 'simulate'));

  esercizi.forEach((ex) => wireExerciseCard(ex, sessione));
}

/* ---------------------------------------------------------------------
 * MODAL: + AGGIUNGI ESERCIZIO
 * (usato sia dalla vista coach "Profilo Atleta" che dalla simulazione)
 * ------------------------------------------------------------------- */
function populateGruppoSelect() {
  const sel = $('#aex-gruppo');
  const gruppi = Object.keys(state.catalogo);
  sel.innerHTML = '<option value="">Seleziona un gruppo…</option>'
    + gruppi.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
}

function resetEsercizioCatalogoSelect() {
  const sel = $('#aex-esercizio-catalogo');
  sel.innerHTML = '<option value="">Seleziona prima un gruppo…</option>';
  sel.disabled = true;
}

function setAexMode(mode) {
  const overlay = $('#add-exercise-overlay');
  overlay.dataset.mode = mode;
  $('#aex-mode-catalogo').classList.toggle('is-active', mode === 'catalogo');
  $('#aex-mode-custom').classList.toggle('is-active', mode === 'custom');
  $('#aex-catalogo-fields').hidden = mode !== 'catalogo';
  $('#aex-custom-fields').hidden = mode !== 'custom';
}

$('#aex-mode-catalogo').addEventListener('click', () => setAexMode('catalogo'));
$('#aex-mode-custom').addEventListener('click', () => setAexMode('custom'));

$('#aex-gruppo').addEventListener('change', () => {
  const gruppo = $('#aex-gruppo').value;
  const sel = $('#aex-esercizio-catalogo');
  const opzioni = state.catalogo[gruppo] || [];

  if (!gruppo || !opzioni.length) {
    resetEsercizioCatalogoSelect();
    return;
  }

  sel.innerHTML = '<option value="">Seleziona un esercizio…</option>'
    + opzioni.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  sel.disabled = false;
});

function openAddExerciseModal(sessione, context) {
  const overlay = $('#add-exercise-overlay');
  const form = $('#add-exercise-form');
  form.reset();
  $('#aex-error').hidden = true;
  populateGruppoSelect();
  resetEsercizioCatalogoSelect();
  setAexMode('catalogo');
  overlay.hidden = false;
  overlay.dataset.sessioneId = sessione.id;
  overlay.dataset.context = context || 'simulate';
  $('#aex-gruppo').focus();
}

function closeAddExerciseModal() {
  $('#add-exercise-overlay').hidden = true;
}

function parseSerieRipetizioni(raw) {
  // Accetta formati tipo "3x10", "4 x 8-10", "3X12" ...
  const match = String(raw || '').match(/^\s*(\d+)\s*[xX×]\s*(.+?)\s*$/);
  if (match) {
    return { serie: parseInt(match[1], 10), ripetizioni: match[2].trim() };
  }
  return { serie: 3, ripetizioni: String(raw || '10').trim() };
}

$('#add-exercise-close').addEventListener('click', closeAddExerciseModal);
$('#add-exercise-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'add-exercise-overlay') closeAddExerciseModal();
});

$('#add-exercise-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const overlay = $('#add-exercise-overlay');
  const sessioneId = overlay.dataset.sessioneId;
  const context = overlay.dataset.context || 'simulate';
  const mode = overlay.dataset.mode || 'catalogo';
  const errEl = $('#aex-error');
  errEl.hidden = true;

  let nome, target;
  if (mode === 'custom') {
    nome = $('#aex-nome').value.trim();
    target = $('#aex-target').value.trim();
    if (!nome) {
      errEl.textContent = 'Inserisci il nome dell\'esercizio personalizzato.';
      errEl.hidden = false;
      return;
    }
  } else {
    target = $('#aex-gruppo').value;
    nome = $('#aex-esercizio-catalogo').value;
    if (!target || !nome) {
      errEl.textContent = 'Seleziona un gruppo muscolare e un esercizio dal catalogo.';
      errEl.hidden = false;
      return;
    }
  }

  const { serie, ripetizioni } = parseSerieRipetizioni($('#aex-serie-reps').value);
  const recRaw = $('#aex-recupero').value.trim();
  const recMatch = recRaw.match(/^(\d+)\s*(?:[-–]\s*(\d+))?/);
  const recupero = recMatch ? parseInt(recMatch[1], 10) : (/^[—–-]$/.test(recRaw) ? 0 : (recRaw ? NaN : 90));
  const recuperoMax = recMatch && recMatch[2] ? parseInt(recMatch[2], 10) : null;
  const rirRaw = $('#aex-rir').value.trim().replace(',', '.');
  const rirNum = rirRaw === '' ? null : parseFloat(rirRaw);
  const tecnica = $('#aex-tecnica').value.trim();
  const note = $('#aex-note').value.trim();

  const submitBtn = $('#aex-submit');
  submitBtn.disabled = true;

  const nuovoEsercizio = {
    sessione_id: sessioneId,
    nome,
    target_muscolare: target || null,
    serie: Number.isFinite(serie) && serie > 0 ? serie : 3,
    ripetizioni: ripetizioni || '10',
    tempo_recupero_secondi: Number.isFinite(recupero) && recupero >= 0 ? recupero : 90,
    recupero_max_secondi: recuperoMax && recuperoMax > recupero ? recuperoMax : null,
    rir: rirNum != null && Number.isFinite(rirNum) && rirNum >= 0 && rirNum <= 10 && /^\d+(\.\d+)?$/.test(rirRaw) ? rirNum : null,
    rir_testo: rirRaw || null,
    tecnica: tecnica || null,
    note_tecniche: note || null,
    ordine: ((findSessioneById(state.selectedAthlete || { fitnesstime_schede: state.schede || [] }, sessioneId) || {}).fitnesstime_esercizi || []).length + 1,
  };

  try {
    const { data, error } = await sb
      .from('fitnesstime_esercizi')
      .insert(nuovoEsercizio)
      .select(`
        id, nome, target_muscolare, video_url, ordine, schema_serie, serie,
        ripetizioni, carico_target, percentuale_1rm, rpe, rir,
        tempo_recupero_secondi, recupero_max_secondi, tecnica, rir_testo, note_tecniche
      `)
      .single();

    if (error) throw error;

    closeAddExerciseModal();
    toast('Esercizio aggiunto ✔', 'success', 1800);

    if (context === 'athlete-detail' && state.selectedAthlete) {
      // Aggiorna lo stato locale della vista coach senza un round-trip completo
      const sessione = findSessioneById(state.selectedAthlete, sessioneId);
      if (sessione) sessione.fitnesstime_esercizi = [...(sessione.fitnesstime_esercizi || []), data];
      renderAthleteDetail();
    } else {
      // Contesto "simulate": aggiorna la scheda dell'atleta simulato
      const scheda = state.activeScheda;
      const sessione = scheda && (scheda.fitnesstime_sessioni || []).find((s) => s.id === sessioneId);
      if (sessione) {
        sessione.fitnesstime_esercizi = [...(sessione.fitnesstime_esercizi || []), data];
        renderSessioneWorkout(sessione);
      } else {
        await loadSchede();
        renderOggiView();
      }
    }
  } catch (err) {
    errEl.textContent = 'Errore nel salvataggio: ' + ((err && err.message) || 'riprova.');
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

function exerciseCardHtml(ex) {
  const chips = [
    `${ex.serie}×${escapeHtml(ex.ripetizioni)}`,
    ex.carico_target ? escapeHtml(ex.carico_target) : null,
    ex.percentuale_1rm ? `${ex.percentuale_1rm}% 1RM` : null,
    ex.rpe ? `RPE ${ex.rpe}` : null,
    rirLabel(ex) !== '—' ? `RIR ${rirLabel(ex)}` : null,
  ].filter(Boolean).map((c) => `<span class="chip chip-red">${c}</span>`).join('')
    + `<span class="chip chip-red">${icon('clock')}${escapeHtml(recuperoLabel(ex))}</span>`;

  const rows = Array.from({ length: ex.serie }, (_, i) => i + 1).map((n) => `
    <div class="set-log-row" data-set="${n}">
      <span class="set-num">${n}</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" class="input-carico">
      <input type="number" inputmode="numeric" min="0" placeholder="reps" class="input-reps">
      <input type="number" inputmode="decimal" step="0.5" min="0" max="10" placeholder="RPE" class="input-rpe">
      <button type="button" class="btn btn-round" data-log-set>${icon('check')}</button>
    </div>
  `).join('');

  return `
    <div class="card exercise-item" data-exercise-id="${ex.id}">
      <div class="exercise-head">
        <span class="exercise-name">${escapeHtml(ex.nome)}</span>
        ${ex.target_muscolare ? `<span class="exercise-target">${escapeHtml(ex.target_muscolare)}</span>` : ''}
      </div>
      <div class="exercise-meta">${chips}</div>
      <div class="set-log-legend"><span></span><span>Kg</span><span>Reps</span><span>RPE</span><span></span></div>
      ${rows}
      ${ex.note_tecniche ? `<p class="muted" style="margin-top:8px;">${icon('bulb')} ${escapeHtml(ex.note_tecniche)}</p>` : ''}
    </div>
  `;
}

function wireExerciseCard(ex, sessione) {
  const card = $(`[data-exercise-id="${ex.id}"]`);
  if (!card) return;

  $$('.set-log-row', card).forEach((row) => {
    const btn = $('[data-log-set]', row);
    btn.addEventListener('click', async () => {
      const carico = parseFloat($('.input-carico', row).value);
      const reps = parseInt($('.input-reps', row).value, 10);
      const rpe = $('.input-rpe', row).value ? parseFloat($('.input-rpe', row).value) : null;

      if (Number.isNaN(carico) || Number.isNaN(reps)) {
        toast('Inserisci carico e ripetizioni prima di confermare.', 'error');
        return;
      }

      const args = {
        p_sessione_id: sessione.id,
        p_esercizio_id: ex.id,
        p_serie_numero: parseInt(row.dataset.set, 10),
        p_carico_kg: carico,
        p_ripetizioni_effettive: reps,
        p_rpe_percepito: rpe,
        p_note: null,
      };

      btn.disabled = true;
      try {
        if (!navigator.onLine) throw new Error('offline');
        const { error } = await submitWorkoutLog(args);
        if (error) throw error;
        row.classList.add('is-done');
        toast('Serie registrata ✔', 'success', 1600);
      } catch (err) {
        if (!navigator.onLine || err.message === 'offline') {
          savePendingLog(args);
          row.classList.add('is-done');
          toast('Nessuna connessione: serie salvata, verrà sincronizzata.', 'default', 3000);
        } else {
          toast('Errore nel salvataggio della serie.', 'error');
          btn.disabled = false;
          return;
        }
      }

      startRecoveryTimer(ex.tempo_recupero_secondi, ex.nome);
    });
  });
}

function emptyState(iconName, text) {
  return `<div class="empty-state"><span class="empty-state-icon">${icon(iconName)}</span><p>${escapeHtml(text)}</p></div>`;
}

/* ---------------------------------------------------------------------
 * VISTA: LE MIE SCHEDE
 * ------------------------------------------------------------------- */
function renderSchedeView() {
  const el = $('#schede-content');
  if (!state.schede.length) {
    el.innerHTML = emptyState('clipboard', 'Nessuna scheda assegnata dal tuo coach al momento.');
    return;
  }

  el.innerHTML = state.schede.map((scheda) => `
    <div class="card session-card">
      <div class="exercise-head">
        <span class="exercise-name">${escapeHtml(scheda.titolo)}</span>
        <span class="chip ${scheda.attiva ? 'chip-red' : ''}">${scheda.attiva ? 'Attiva' : 'Conclusa'}</span>
      </div>
      ${scheda.obiettivo ? `<p class="muted">${escapeHtml(scheda.obiettivo)}</p>` : ''}
      <p class="muted">Dal ${fmtDate(scheda.data_inizio)}${scheda.data_scadenza ? ` al ${fmtDate(scheda.data_scadenza)}` : ''}${scheda.settimane_durata ? ` · ${scheda.settimane_durata} settimane` : ''}</p>
      ${(scheda.fitnesstime_sessioni || []).map((s) => `
        <div class="exercise-item">
          <div class="exercise-head"><span class="exercise-name">${escapeHtml(s.nome)}</span></div>
          ${(s.fitnesstime_esercizi || []).map((ex) => `
            <p style="margin:4px 0; font-size:14px;">
              <strong>${escapeHtml(ex.nome)}</strong> — ${ex.serie}×${escapeHtml(ex.ripetizioni)}
              ${ex.carico_target ? ` @ ${escapeHtml(ex.carico_target)}` : ''}
            </p>
          `).join('')}
        </div>
      `).join('') || '<p class="muted">Nessun giorno configurato.</p>'}
      ${scheda.note_coach ? `<p class="muted" style="margin-top:8px;">${icon('message')} ${escapeHtml(scheda.note_coach)}</p>` : ''}
    </div>
  `).join('');
}

/* ---------------------------------------------------------------------
 * VISTA: STORICO & PROGRESSIONE
 * ------------------------------------------------------------------- */
async function renderStoricoView() {
  await Promise.all([loadStoricoStats(), loadStoricoLogs()]);
  wirePrLookup();
}

async function loadStoricoStats() {
  const { data: volume } = await sb.rpc('fitnesstime_volume_periodo', {});
  $('#stat-volume').textContent = volume != null ? Math.round(volume).toLocaleString('it-IT') : '–';

  const { data: logs } = await sb
    .from('fitnesstime_workout_logs')
    .select('data_esecuzione')
    .eq('profile_id', state.profile.id)
    .gte('data_esecuzione', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

  const giorniUnici = new Set((logs || []).map((l) => l.data_esecuzione));
  $('#stat-sessioni').textContent = giorniUnici.size;
}

async function loadStoricoLogs() {
  const el = $('#storico-content');
  const { data, error } = await sb
    .from('fitnesstime_workout_logs')
    .select('id, data_esecuzione, carico_kg, ripetizioni_effettive, serie_numero, fitnesstime_esercizi(nome)')
    .eq('profile_id', state.profile.id)
    .order('data_esecuzione', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60);

  if (error || !data || !data.length) {
    el.innerHTML = emptyState('trending', 'Nessuna serie registrata finora. Inizia un allenamento dalla tab "Oggi".');
    return;
  }

  const groups = new Map();
  data.forEach((log) => {
    const key = log.data_esecuzione;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  });

  el.innerHTML = Array.from(groups.entries()).map(([data_esecuzione, logs]) => `
    <div class="log-day-group">
      <div class="log-day-header">${fmtDate(data_esecuzione)}</div>
      ${logs.map((l) => `
        <div class="log-row">
          <span class="log-exercise">${escapeHtml((l.fitnesstime_esercizi && l.fitnesstime_esercizi.nome) || 'Esercizio')}</span>
          <span class="log-detail">Serie ${l.serie_numero} · ${l.carico_kg ?? '–'}kg × ${l.ripetizioni_effettive ?? '–'}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function wirePrLookup() {
  const btn = $('#pr-btn');
  if (btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', async () => {
    const nome = $('#pr-esercizio').value.trim();
    const resultEl = $('#pr-result');
    if (!nome) { resultEl.textContent = 'Digita il nome di un esercizio della tua scheda.'; return; }

    resultEl.textContent = 'Ricerca…';
    const { data, error } = await sb.rpc('fitnesstime_record_personale', { p_esercizio_nome: nome });
    const record = Array.isArray(data) ? data[0] : data;

    if (error || !record) {
      resultEl.className = 'pr-result muted';
      resultEl.textContent = `Nessun record trovato per "${nome}".`;
      return;
    }

    resultEl.className = 'pr-result has-value';
    resultEl.textContent = `${record.carico_kg} kg × ${record.ripetizioni_effettive} rip. — ${fmtDate(record.data_esecuzione)}`;
  });
}

/* ---------------------------------------------------------------------
 * VISTA: INFO PALESTRA
 * ------------------------------------------------------------------- */
function renderInfoView() {
  const el = $('#info-content');
  el.innerHTML = `
    <div class="card">
      <h3 class="card-title">Orari</h3>
      <table class="info-hours-table">
        ${GYM_INFO.orari.map(([g, o]) => `<tr><td>${escapeHtml(g)}</td><td>${escapeHtml(o)}</td></tr>`).join('')}
      </table>
    </div>
    <div class="card">
      <h3 class="card-title">Corsi &amp; Servizi</h3>
      <div class="course-grid">
        ${GYM_INFO.corsi.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">${escapeHtml(GYM_INFO.nome)}</h3>
      <p class="muted">${escapeHtml(GYM_INFO.citta)}</p>
    </div>
  `;
}

/* ---------------------------------------------------------------------
 * TIMER DI RECUPERO (audio + vibrazione)
 * ------------------------------------------------------------------- */
function startRecoveryTimer(seconds, label) {
  if (state.activeTimer) clearInterval(state.activeTimer.intervalId);

  const overlay = $('#timer-overlay');
  const display = $('#timer-display');
  const pauseBtn = $('#timer-pause-btn');
  $('#timer-exercise-label').textContent = `Recupero — ${label}`;

  let remaining = Math.max(0, seconds || 90);
  let paused = false;
  overlay.hidden = false;
  display.classList.remove('is-warning');
  renderTimer();

  const intervalId = setInterval(() => {
    if (paused) return;
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      finishTimer();
      return;
    }
    if (remaining <= 5) display.classList.add('is-warning');
    renderTimer();
  }, 1000);

  state.activeTimer = { intervalId, get remaining() { return remaining; } };

  function renderTimer() {
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    display.textContent = `${m}:${s}`;
  }

  function finishTimer() {
    display.textContent = '00:00';
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    playBeep();
    setTimeout(() => { overlay.hidden = true; }, 900);
    state.activeTimer = null;
  }

  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Riprendi' : 'Pausa';
  };

  $$('[data-timer-adjust]').forEach((btn) => {
    btn.onclick = () => {
      remaining = Math.max(0, remaining + parseInt(btn.dataset.timerAdjust, 10));
      display.classList.toggle('is-warning', remaining <= 5);
      renderTimer();
    };
  });

  $('#timer-skip-btn').onclick = () => {
    clearInterval(intervalId);
    overlay.hidden = true;
    state.activeTimer = null;
  };
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 180].forEach((delay, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.25;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }, delay);
    });
  } catch {
    /* audio non disponibile: la vibrazione resta come fallback */
  }
}

/* ---------------------------------------------------------------------
 * SERVICE WORKER
 * ------------------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline al primo avvio: si registrerà al prossimo caricamento online */
    });
  });
}

/* ---------------------------------------------------------------------
 * BOOT
 * ------------------------------------------------------------------- */
updateConnBadge();
setAuthMode('signin');
if (DEMO_MODE) {
  enterDemoApp();
}
