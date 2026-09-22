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
  profile: null,      // riga fitnesstime_profiles
  schede: [],          // tutte le schede dell'atleta (con sessioni/esercizi annidati)
  activeScheda: null,
  loadedViews: new Set(),
  activeTimer: null,
};

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
      const { error } = await sb.rpc('fitnesstime_log_set', args);
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

$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session && session.user) {
    enterApp(session.user);
  } else {
    exitApp();
  }
});

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
  $('#logout-btn').hidden = false;

  state.loadedViews.clear();
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
  $('#logout-btn').hidden = true;
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
        id, nome, ordine, note,
        fitnesstime_esercizi (
          id, nome, target_muscolare, video_url, ordine, schema_serie, serie,
          ripetizioni, carico_target, percentuale_1rm, rpe, rir,
          tempo_recupero_secondi, note_tecniche
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
    el.innerHTML = emptyState('📋', 'Nessuna scheda attiva. Il tuo coach non ha ancora caricato un programma.');
    return;
  }

  const sessioni = scheda.fitnesstime_sessioni || [];
  if (!sessioni.length) {
    el.innerHTML = emptyState('🗂️', 'La scheda attiva non ha ancora giorni di allenamento configurati.');
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
    ${esercizi.map(exerciseCardHtml).join('')}
  `;

  $('#back-to-sessioni').addEventListener('click', () => {
    currentSessioneId = null;
    renderOggiView();
  });

  esercizi.forEach((ex) => wireExerciseCard(ex, sessione));
}

function exerciseCardHtml(ex) {
  const chips = [
    `${ex.serie}×${escapeHtml(ex.ripetizioni)}`,
    ex.carico_target ? escapeHtml(ex.carico_target) : null,
    ex.percentuale_1rm ? `${ex.percentuale_1rm}% 1RM` : null,
    ex.rpe ? `RPE ${ex.rpe}` : null,
    ex.rir != null ? `RIR ${ex.rir}` : null,
    `⏱ ${ex.tempo_recupero_secondi}s`,
  ].filter(Boolean).map((c) => `<span class="chip chip-red">${c}</span>`).join('');

  const rows = Array.from({ length: ex.serie }, (_, i) => i + 1).map((n) => `
    <div class="set-log-row" data-set="${n}">
      <span class="set-num">${n}</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" class="input-carico">
      <input type="number" inputmode="numeric" min="0" placeholder="reps" class="input-reps">
      <input type="number" inputmode="decimal" step="0.5" min="0" max="10" placeholder="RPE" class="input-rpe">
      <button type="button" class="btn btn-round" data-log-set>✓</button>
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
      ${ex.note_tecniche ? `<p class="muted" style="margin-top:8px;">💡 ${escapeHtml(ex.note_tecniche)}</p>` : ''}
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
        const { error } = await sb.rpc('fitnesstime_log_set', args);
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

function emptyState(icon, text) {
  return `<div class="empty-state"><span class="empty-state-icon">${icon}</span><p>${escapeHtml(text)}</p></div>`;
}

/* ---------------------------------------------------------------------
 * VISTA: LE MIE SCHEDE
 * ------------------------------------------------------------------- */
function renderSchedeView() {
  const el = $('#schede-content');
  if (!state.schede.length) {
    el.innerHTML = emptyState('📋', 'Nessuna scheda assegnata dal tuo coach al momento.');
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
      ${scheda.note_coach ? `<p class="muted" style="margin-top:8px;">💬 ${escapeHtml(scheda.note_coach)}</p>` : ''}
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
    el.innerHTML = emptyState('📈', 'Nessuna serie registrata finora. Inizia un allenamento dalla tab "Oggi".');
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
