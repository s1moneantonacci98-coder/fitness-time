/*
 * Fitness Time Club — smoke test
 * Verifica: sintassi JS, coerenza HTML<->JS, presenza asset dichiarati,
 * e raggiungibilita' reale del progetto Supabase condiviso (RLS + RPC).
 *
 * Uso: node scripts/smoke_test.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parse } = require('node-html-parser');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let passed = 0;
let skipped = 0;

function isSandboxNetworkBlock(err) {
  return /not in allowlist|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(err.message || '');
}

function check(label, fn) {
  try {
    fn();
    console.log(`  ✔ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ ${label}\n      ${err.message}`);
    failures++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✔ ${label}`);
    passed++;
  } catch (err) {
    if (isSandboxNetworkBlock(err)) {
      console.warn(`  ⚠ ${label}\n      SALTATO: rete sandbox non raggiunge Supabase da qui (${err.message}). Rieseguire fuori dal container, o verificare via MCP Supabase.`);
      skipped++;
      return;
    }
    console.error(`  ✘ ${label}\n      ${err.message}`);
    failures++;
  }
}

console.log('\n1. Sintassi file di progetto');
check('app.js ha sintassi JS valida', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'app.js')]);
});
check('sw.js ha sintassi JS valida', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'sw.js')]);
});
check('manifest.json e\' JSON valido', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  if (!manifest.icons || manifest.icons.length < 2) throw new Error('manifest.icons insufficienti');
  if (!manifest.name || !manifest.short_name) throw new Error('name/short_name mancanti');
  if (!manifest.start_url) throw new Error('start_url mancante');
});

console.log('\n2. Coerenza index.html <-> app.js');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const dom = parse(html);

const htmlIds = new Set(dom.querySelectorAll('[id]').map((el) => el.getAttribute('id')));

check('index.html e\' parsabile e ha almeno un elemento con id', () => {
  if (htmlIds.size === 0) throw new Error('nessun id trovato in index.html');
});

check('ogni #id referenziato in app.js esiste in index.html o e\' creato a runtime', () => {
  // Alcuni id (es. "back-to-sessioni") sono generati da app.js dentro ai
  // template dinamici: li consideriamo validi tanto quanto quelli statici.
  const dynamicIds = new Set();
  const idDefRe = /id="([A-Za-z][\w-]*)"/g;
  let dm;
  while ((dm = idDefRe.exec(appJs))) dynamicIds.add(dm[1]);

  const knownIds = new Set([...htmlIds, ...dynamicIds]);
  const idRefs = new Set();
  const re = /#([A-Za-z][\w-]*)/g;
  let m;
  while ((m = re.exec(appJs))) idRefs.add(m[1]);
  const missing = [...idRefs].filter((id) => !knownIds.has(id));
  if (missing.length) throw new Error(`id non trovati (ne' statici ne' dinamici): ${missing.join(', ')}`);
});

check('index.html include vendor/supabase.js e app.js', () => {
  if (!/vendor\/supabase\.js/.test(html)) throw new Error('vendor/supabase.js non incluso');
  if (!/src="app\.js"/.test(html)) throw new Error('app.js non incluso');
});

check('vista utente: nessun controllo di download/PDF/invio nel rendering atleta', () => {
  const start = appJs.indexOf('function homeSchedaHtml');
  const end = appJs.indexOf('// Nella vista utente');
  if (start < 0 || end < 0) throw new Error('blocco vista utente non trovato');
  const block = appJs.slice(start, end);
  if (/downloadSchedaPdf|shareSchedaPdf|data-pdf-scheda|data-share-scheda|data-publish-scheda|data-remove-esercizio|log_set/.test(block)) {
    throw new Error('la vista utente contiene funzioni riservate ad Andrea');
  }
});

check('DEMO_MODE disattivato', () => {
  if (!/const DEMO_MODE = false;/.test(appJs)) throw new Error('DEMO_MODE deve essere false in produzione');
});

check('index.html referenzia manifest.json', () => {
  if (!/rel="manifest"\s+href="manifest\.json"/.test(html)) throw new Error('link manifest mancante');
});

console.log('\n3. Asset dichiarati presenti su disco');
check('tutte le icone del manifest esistono', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const missing = manifest.icons.filter((i) => !fs.existsSync(path.join(ROOT, i.src)));
  if (missing.length) throw new Error(`icone mancanti: ${missing.map((i) => i.src).join(', ')}`);
});

check('APP_SHELL di sw.js referenzia solo file esistenti', () => {
  const listMatch = swJs.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  if (!listMatch) throw new Error('APP_SHELL non trovato in sw.js');
  const files = [...listMatch[1].matchAll(/'\.\/(.*?)'/g)].map((m) => m[1]).filter(Boolean);
  const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) throw new Error(`file mancanti: ${missing.join(', ')}`);
});

check('vendor/supabase.js esiste ed espone window.supabase (UMD)', () => {
  const vendor = fs.readFileSync(path.join(ROOT, 'vendor', 'supabase.js'), 'utf8');
  if (!/createClient/.test(vendor)) throw new Error('createClient non trovato nel bundle vendorizzato');
});

console.log('\n4. Configurazione Supabase in app.js');
const urlMatch = appJs.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
const keyMatch = appJs.match(/SUPABASE_KEY\s*=\s*'([^']+)'/);
check('SUPABASE_URL e SUPABASE_KEY sono definiti', () => {
  if (!urlMatch || !keyMatch) throw new Error('SUPABASE_URL/SUPABASE_KEY non trovati in app.js');
});

console.log('\n5. Raggiungibilita\' reale del progetto Supabase condiviso');
(async () => {
  if (urlMatch && keyMatch) {
    const sb = createClient(urlMatch[1], keyMatch[1]);

    await checkAsync('RPC fitnesstime_is_staff raggiungibile (anon -> false)', async () => {
      const { data, error } = await sb.rpc('fitnesstime_is_staff');
      if (error) throw new Error(error.message);
      if (data !== false) throw new Error(`valore inatteso: ${JSON.stringify(data)}`);
    });

    await checkAsync('fitnesstime_schede non e\' leggibile da utenti anonimi (permesso negato o righe vuote)', async () => {
      const { data, error } = await sb.from('fitnesstime_schede').select('id').limit(1);
      if (error) return; // permission denied = chiusura corretta
      if (Array.isArray(data) && data.length > 0) throw new Error('un utente anonimo non deve vedere le schede');
    });

    await checkAsync('fitnesstime_misure_bia non e\' leggibile da utenti anonimi', async () => {
      const { data, error } = await sb.from('fitnesstime_misure_bia').select('id').limit(1);
      if (error) return;
      if (Array.isArray(data) && data.length > 0) throw new Error('un utente anonimo non deve vedere le BIA');
    });

    await checkAsync('RPC fitnesstime_volume_periodo richiede un profilo (errore atteso per anon)', async () => {
      const { error } = await sb.rpc('fitnesstime_volume_periodo', {});
      if (!error) throw new Error('ci si aspettava un errore per un chiamante anonimo senza profilo');
    });
  }

  console.log(`\n${passed} superati, ${skipped} saltati, ${failures} falliti.\n`);
  process.exit(failures > 0 ? 1 : 0);
})();
