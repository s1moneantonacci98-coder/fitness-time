/* =====================================================================
 * Fitness Time Club — export PDF scheda + condivisione (WhatsApp)
 * Usa jsPDF + autotable (vendorizzati in /vendor, funzionano offline).
 * ===================================================================== */
'use strict';

function recuperoLabel(ex) {
  const min = Number(ex.tempo_recupero_secondi) || 0;
  const max = Number(ex.recupero_max_secondi) || 0;
  if (!min && !max) return '—';
  if (max && max > min) return `${min}-${max}"`;
  return `${min}"`;
}

function rirLabel(ex) {
  if (ex.rir_testo) return String(ex.rir_testo);
  if (ex.rir != null) return String(ex.rir).replace(/\.0$/, '');
  return '—';
}

function waNumber(raw) {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('3')) d = '39' + d;
  return d.length >= 8 ? d : '';
}

function schedaFileName(athlete) {
  const base = `Scheda allenamento ${athlete.nome || ''} ${athlete.cognome || ''}`.trim().replace(/\s+/g, '_');
  return base.replace(/[^\w\-]/g, '') + '.pdf';
}

/* Grafica identica alla scheda di riferimento di Andrea: A4, font DejaVu Sans,
 * un giorno per pagina con colore proprio, tabella a righe alternate, box Addome/Cardio. */
const PDF_DAY_COLORS = [
  { main: [155, 89, 182], tint: [230, 213, 237] },   // viola
  { main: [52, 152, 219], tint: [204, 229, 246] },   // azzurro
  { main: [39, 174, 96],  tint: [201, 235, 215] },   // verde
  { main: [230, 126, 34], tint: [249, 223, 200] },   // arancione
];
const PDF_TITLE_COLOR = [122, 46, 142];
const PDF_GRID = [181, 181, 181];

function pdfSetupFonts(doc) {
  if (!window.FT_FONTS) return false;
  doc.addFileToVFS('DejaVuSans.ttf', window.FT_FONTS.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', window.FT_FONTS.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
  return true;
}

function buildSchedaPdf(athlete, scheda) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const FONT = pdfSetupFonts(doc) ? 'DejaVuSans' : 'helvetica';
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const X0 = 28.35, X1 = PW - 28.35, TW = X1 - X0;
  const BOTTOM = PH - 34.3;
  // colonne: esercizio, serie/reps, recupero, rir, tecnica/note
  const COLS = [164.5, 96.3, 79.4, 45.4, TW - (164.5 + 96.3 + 79.4 + 45.4)];
  const COLX = [X0]; COLS.forEach((w, i) => COLX.push(COLX[i] + w));
  const FS = 7.6, LH = 9.5, ROWH = 24;

  const sessioni = (scheda.fitnesstime_sessioni || []).slice().sort((a, b) => a.ordine - b.ordine);
  const titolo = `Scheda allenamento ${athlete.nome || ''} ${athlete.cognome || ''}`.trim();

  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const wrap = (txt, w, size, style) => {
    doc.setFont(FONT, style || 'normal'); doc.setFontSize(size);
    return String(txt || '').trim() ? doc.splitTextToSize(String(txt), w) : [];
  };

  const drawBanner = (y, text, col) => {
    setFill(col.main); setDraw(col.main); doc.setLineWidth(0);
    doc.rect(X0, y, TW, 30, 'FD');
    doc.setFont(FONT, 'bold'); doc.setFontSize(13); setText([255, 255, 255]);
    doc.text(text, PW / 2, y + 20.1, { align: 'center' });
    return y + 30 + 7;
  };
  const drawHeader = (y, col) => {
    setFill(col.main); doc.rect(X0, y, TW, ROWH, 'F');
    doc.setFont(FONT, 'bold'); doc.setFontSize(FS); setText([255, 255, 255]);
    ['ESERCIZIO', 'SERIE / REPS', 'RECUPERO', 'RIR', 'TECNICA / NOTE'].forEach((h, i) => {
      doc.text(h, COLX[i] + 5, y + 13.7);
    });
    return y + ROWH;
  };

  sessioni.forEach((s, idx) => {
    const col = PDF_DAY_COLORS[idx % PDF_DAY_COLORS.length];
    doc.addPage();
    if (idx === 0) doc.deletePage(1); // jsPDF crea una pagina iniziale vuota
    let y = 34.3;

    if (idx === 0) {
      doc.setFont(FONT, 'bold'); doc.setFontSize(20); setText(PDF_TITLE_COLOR);
      doc.text(titolo, PW / 2, 54.5, { align: 'center' });
      y = 68.3;
    }
    y = drawBanner(y, String(s.nome || '').toUpperCase(), col);
    const tableTop = y;
    y = drawHeader(y, col);

    const esercizi = (s.fitnesstime_esercizi || []).slice().sort((a, b) => a.ordine - b.ordine);
    const rows = esercizi.length ? esercizi : [{ nome: 'Nessun esercizio', serie: '', ripetizioni: '', _empty: true }];
    let segTop = tableTop; // inizio del tratto di tabella nella pagina corrente
    const rowBounds = [];  // [yTop, yBottom] per le linee orizzontali

    const closeTable = (endY) => {
      // griglia: bordo esterno, linee orizzontali e verticali di colonna
      setDraw(PDF_GRID); doc.setLineWidth(0.4);
      doc.rect(X0, segTop, TW, endY - segTop, 'S');
      rowBounds.forEach((yy) => doc.line(X0, yy, X1, yy));
      for (let i = 1; i < COLX.length - 1; i++) doc.line(COLX[i], segTop, COLX[i], endY);
      rowBounds.length = 0;
    };

    rows.forEach((ex, r) => {
      const cells = [
        ex.nome,
        ex._empty ? '' : `${ex.serie}×${ex.ripetizioni}`,
        ex._empty ? '' : recuperoLabel(ex),
        ex._empty ? '' : rirLabel(ex),
        [ex.tecnica, ex.note_tecniche].filter(Boolean).join(' · '),
      ];
      const lines = cells.map((c, i) => wrap(c, COLS[i] - 10, FS, 'normal'));
      const h = Math.max(ROWH, Math.max(...lines.map((l) => l.length)) * LH + 14.5);

      if (y + h > BOTTOM) { // continua su nuova pagina con intestazione ripetuta
        closeTable(y);
        doc.addPage();
        y = 34.3;
        segTop = y;
        y = drawHeader(y, col);
      }
      if (r % 2 === 1) { setFill(col.tint); doc.rect(X0, y, TW, h, 'F'); }
      doc.setFont(FONT, 'normal'); doc.setFontSize(FS); setText([0, 0, 0]);
      lines.forEach((l, i) => {
        if (!l.length) return;
        const center = i >= 1 && i <= 3;
        const tx = center ? COLX[i] + COLS[i] / 2 : COLX[i] + 5;
        l.forEach((ln, k) => doc.text(ln, tx, y + 13.7 + k * LH, center ? { align: 'center' } : undefined));
      });
      y += h;
      rowBounds.push(y);
    });
    rowBounds.pop(); // l'ultima linea coincide col bordo esterno
    closeTable(y);

    // box ADDOME / CARDIO
    const blocks = [['ADDOME', s.addome], ['CARDIO', s.cardio]].filter((x) => x[1] && String(x[1]).trim());
    if (blocks.length) {
      y += 8;
      const parts = blocks.map(([label, txt]) => {
        const l = wrap(txt, TW - 16, 8, 'normal');
        return { label, lines: l, h: 35 + Math.max(0, l.length - 1) * 10.5 };
      });
      const boxH = parts.reduce((a, p) => a + p.h, 0);
      if (y + boxH > BOTTOM) { doc.addPage(); y = 34.3; }
      setFill(col.tint); setDraw(col.main); doc.setLineWidth(0.8);
      doc.rect(X0, y, TW, boxH, 'FD');
      let py = y;
      parts.forEach((p, i) => {
        if (i > 0) { doc.setLineWidth(0.4); setDraw(col.main); doc.line(X0, py, X1, py); }
        doc.setFont(FONT, 'normal'); doc.setFontSize(8); setText([0, 0, 0]);
        doc.text(p.label, X0 + 8, py + 15.1);
        p.lines.forEach((ln, k) => doc.text(ln, X0 + 8, py + 25.6 + k * 10.5));
        py += p.h;
      });
    }
  });

  if (!sessioni.length) {
    doc.addPage(); doc.deletePage(1);
    doc.setFont(FONT, 'bold'); doc.setFontSize(20); setText(PDF_TITLE_COLOR);
    doc.text(titolo, PW / 2, 54.5, { align: 'center' });
    doc.setFont(FONT, 'normal'); doc.setFontSize(10); setText([0, 0, 0]);
    doc.text('Nessun giorno configurato.', X0, 90);
  }
  return doc;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadSchedaPdf(athlete, scheda) {
  const doc = buildSchedaPdf(athlete, scheda);
  downloadBlob(doc.output('blob'), schedaFileName(athlete));
}

/* Condivisione: menu del telefono con il PDF allegato (scegli WhatsApp → contatto).
 * Se il browser non supporta la condivisione di file (es. PC): scarica il PDF e
 * apre la chat WhatsApp dell'atleta (se ha un numero) con un messaggio pronto. */
async function shareSchedaPdf(athlete, scheda) {
  const doc = buildSchedaPdf(athlete, scheda);
  const blob = doc.output('blob');
  const name = schedaFileName(athlete);
  const file = new File([blob], name, { type: 'application/pdf' });
  const testo = `Ciao ${athlete.nome || ''}, ecco la tua scheda di allenamento. Fitness Time Club`.replace('  ', ' ');

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name, text: testo });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, name);
  const tel = waNumber(athlete.telefono);
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(testo)}`, '_blank', 'noopener');
  return 'fallback';
}


/* =====================================================================
 * MISURE ANTROPOMETRICHE — campi condivisi + PDF "Storico misure"
 * ===================================================================== */
const MISURE_GRUPPI = [
  { titolo: 'CIRCONFERENZE E PESO', campi: [
    { k: 'peso_kg', label: 'Peso', unit: 'kg' },
    { k: 'petto_cm', label: 'Petto', unit: 'cm' },
    { k: 'bicipiti_cm', label: 'Bicipiti', unit: 'cm' },
    { k: 'interno_coscia_cm', label: 'Interno coscia', unit: 'cm' },
    { k: 'polpaccio_cm', label: 'Polpaccio', unit: 'cm' },
    { k: 'vita_cm', label: 'Vita', unit: 'cm' },
    { k: 'spalle_cm', label: 'Spalle', unit: 'cm' },
    { k: 'ginocchio_cm', label: 'Ginocchio', unit: 'cm' },
  ] },
  { titolo: 'PLICHE CUTANEE', campi: [
    { k: 'plica_tricipitale', label: 'Tricipitale', unit: '%' },
    { k: 'plica_ombelicale', label: 'Ombelicale', unit: '%' },
    { k: 'plica_iliaca', label: 'Iliaca', unit: '%' },
    { k: 'plica_pettorale', label: 'Pettorale', unit: '%' },
    { k: 'plica_ascellare', label: 'Ascellare', unit: '%' },
    { k: 'plica_scapolare', label: 'Scapolare', unit: '%' },
    { k: 'plica_gamba', label: 'Gamba', unit: '%' },
  ] },
];

function misureValore(m, campo) {
  const v = m[campo.k];
  if (v == null || v === '') return '-';
  return `${String(v).replace(/\.0+$/, '')} ${campo.unit}`;
}

function misureFileName(athlete) {
  const base = `Storico misure ${athlete.nome || ''} ${athlete.cognome || ''}`.trim().replace(/\s+/g, '_');
  return base.replace(/[^\w\-]/g, '') + '.pdf';
}

function buildMisurePdf(athlete, misureDesc) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const FONT = pdfSetupFonts(doc) ? 'DejaVuSans' : 'helvetica';
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const X0 = 40, X1 = PW - 40, TW = X1 - X0;
  const misure = (misureDesc || []).slice().sort((a, b) => (a.data_rilevazione < b.data_rilevazione ? -1 : 1));
  const PER_PAGE = 5;
  const chunks = [];
  for (let i = 0; i < misure.length; i += PER_PAGE) chunks.push(misure.slice(i, i + PER_PAGE));
  if (!chunks.length) chunks.push([]);
  const nome = `${athlete.nome || ''}`.trim().toUpperCase();
  const fmt = (d) => { const [y, m, g] = String(d).split('-'); return `${g}/${m}/${y}`; };

  chunks.forEach((chunk, pi) => {
    if (pi > 0) doc.addPage();
    doc.setFont(FONT, 'bold'); doc.setFontSize(15); doc.setTextColor(30, 30, 30);
    doc.text(`STORICO MISURE ANTROPOMETRICHE - ${nome}`, PW / 2, 60, { align: 'center' });
    doc.setFont(FONT, 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Rilevazioni riportate in ordine cronologico.', PW / 2, 74, { align: 'center' });

    let y = 100;
    const labelW = 120;
    const colW = chunk.length ? (TW - labelW) / chunk.length : TW - labelW;
    const rowH = 19;
    MISURE_GRUPPI.forEach((g) => {
      doc.setFont(FONT, 'bold'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
      doc.text(g.titolo, X0, y);
      y += 8;
      // intestazione nera con le date
      doc.setFillColor(20, 20, 20);
      doc.rect(X0, y, TW, rowH, 'F');
      doc.setFont(FONT, 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
      chunk.forEach((m, i) => doc.text(fmt(m.data_rilevazione), X0 + labelW + colW * i + colW / 2, y + 12.5, { align: 'center' }));
      y += rowH;
      g.campi.forEach((c, r) => {
        if (r % 2 === 1) { doc.setFillColor(245, 245, 245); doc.rect(X0, y, TW, rowH, 'F'); }
        doc.setFillColor(232, 232, 232); doc.rect(X0, y, labelW, rowH, 'F');
        doc.setFont(FONT, 'bold'); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
        doc.text(c.label, X0 + 6, y + 12.5);
        doc.setFont(FONT, 'normal');
        chunk.forEach((m, i) => doc.text(misureValore(m, c), X0 + labelW + colW * i + colW / 2, y + 12.5, { align: 'center' }));
        doc.setDrawColor(181, 181, 181); doc.setLineWidth(0.4);
        doc.line(X0, y + rowH, X1, y + rowH);
        y += rowH;
      });
      doc.setDrawColor(181, 181, 181);
      doc.rect(X0, y - rowH * (g.campi.length + 1), TW, rowH * (g.campi.length + 1), 'S');
      y += 26;
    });

    doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    doc.text(`Fitness Time Club | Storico antropometrico | Pagina ${pi + 1}`, PW / 2, PH - 28, { align: 'center' });
  });
  return doc;
}

function downloadMisurePdf(athlete, misureDesc) {
  const doc = buildMisurePdf(athlete, misureDesc);
  downloadBlob(doc.output('blob'), misureFileName(athlete));
}
