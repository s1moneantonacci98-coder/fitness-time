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

function buildSchedaPdf(athlete, scheda) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const INK = [20, 17, 15];
  const ACCENT = [255, 81, 54];
  const MUTED = [110, 104, 98];
  const sessioni = (scheda.fitnesstime_sessioni || []).slice().sort((a, b) => a.ordine - b.ordine);

  const titolo = `Scheda allenamento ${athlete.nome || ''} ${athlete.cognome || ''}`.trim();

  sessioni.forEach((s, idx) => {
    if (idx > 0) doc.addPage();
    let y = 18;

    if (idx === 0) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK);
      doc.text(titolo, W / 2, y, { align: 'center' });
      y += 6;
      const sub = [scheda.titolo, scheda.obiettivo].filter(Boolean).join(' · ');
      if (sub) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
        doc.text(sub, W / 2, y, { align: 'center' });
        y += 6;
      }
      y += 2;
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text(String(s.nome || '').toUpperCase(), W / 2, y, { align: 'center' });
    y += 2;
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.6);
    doc.line(M, y, W - M, y);
    y += 4;

    const esercizi = (s.fitnesstime_esercizi || []).slice().sort((a, b) => a.ordine - b.ordine);
    const body = esercizi.length ? esercizi.map((ex) => [
      ex.nome,
      `${ex.serie}×${ex.ripetizioni}`,
      recuperoLabel(ex),
      rirLabel(ex),
      [ex.tecnica, ex.note_tecniche].filter(Boolean).join(' · '),
    ]) : [['Nessun esercizio', '', '', '', '']];

    doc.autoTable({
      startY: y,
      head: [['ESERCIZIO', 'SERIE / REPS', 'RECUPERO', 'RIR', 'TECNICA / NOTE']],
      body,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.6, textColor: INK, lineColor: [220, 216, 210], lineWidth: 0.2, valign: 'middle' },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [247, 245, 242] },
      columnStyles: {
        0: { cellWidth: 56, fontStyle: 'bold' },
        1: { cellWidth: 32 },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 'auto' },
      },
    });
    y = doc.lastAutoTable.finalY + 8;

    const blocco = (label, txt) => {
      if (!txt) return;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ACCENT);
      doc.text(label, M, y);
      y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(txt, W - 2 * M);
      doc.text(lines, M, y);
      y += lines.length * 4.6 + 4;
    };
    blocco('ADDOME', s.addome);
    blocco('CARDIO', s.cardio);
  });

  if (!sessioni.length) {
    doc.setFontSize(12); doc.text('Nessun giorno configurato.', M, 30);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text('Fitness Time Club · Adelfia (BA)', M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' });
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
