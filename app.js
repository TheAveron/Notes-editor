/* ============================================================
   ATELIER DE DOSSIERS — logique principale
   Aucune dépendance externe. Stockage via window.storage (si présent,
   ex. Claude Artifacts) avec repli automatique sur un registre en mémoire.
   ============================================================ */

/* ---------- Utilitaires couleur ---------- */
function clampPct(v) { return Math.max(0, Math.min(100, v)); }

function hexToHsl(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clampPct(s) / 100; l = clampPct(l) / 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1 / 3); g = hue2rgb(p, q, h / 360); b = hue2rgb(p, q, h / 360 - 1 / 3);
  }
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
function isValidHex(hex) { return /^#?[0-9a-fA-F]{6}$/.test(hex); }
function normalizeHex(hex) { hex = hex.trim(); if (!hex.startsWith('#')) hex = '#' + hex; return hex.toLowerCase(); }

// Distance perceptuelle approximative (pondérée) entre deux teintes hex
function colorDistance(hexA, hexB) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return { r: parseInt(hex.substring(0, 2), 16), g: parseInt(hex.substring(2, 4), 16), b: parseInt(hex.substring(4, 6), 16) };
}

// Dérive la mini-palette (encre, encre moyenne, fond pâle) à partir d'une seule teinte d'accent
function derivePalette(accentHex) {
  const { h, s } = hexToHsl(accentHex);
  return {
    accent: accentHex,
    ink: hslToHex(h, Math.min(s, 42), 15),
    inkMid: hslToHex(h, Math.min(s, 32), 32),
    accentBg: hslToHex(h, Math.min(s, 45), 93),
    card: hslToHex(h, 10, 95),
    rule: hslToHex(h, 14, 87),
  };
}

// Couleurs fixes des 4 tags établis dans toute la collection
const FIXED = {
  gold: '#a9812e', goldBg: '#f4eedd',
  teal: '#1f5c57', tealBg: '#e7f0ee',
  red: '#8b2635', redBg: '#f5e6e8',
};

function generateProposals(usedHexes, count) {
  const proposals = [];
  let attempts = 0;
  const startHue = Math.random() * 360;
  while (proposals.length < count && attempts < 400) {
    attempts++;
    const idx = proposals.length;
    const hue = (startHue + idx * (360 / count) + (Math.random() * 24 - 12) + 360) % 360;
    const sat = 38 + Math.random() * 28;   // 38-66%
    const lig = 30 + Math.random() * 16;   // 30-46% (ton "encre saturée", ni pastel ni noir)
    const hex = hslToHex(hue, sat, lig);
    const tooClose = usedHexes.some(u => colorDistance(hex, u) < 60) ||
      proposals.some(p => colorDistance(hex, p) < 45);
    if (!tooClose) proposals.push(hex);
  }
  while (proposals.length < count) {
    proposals.push(hslToHex(Math.random() * 360, 50, 38));
  }
  return proposals;
}

/* ---------- Stockage (window.storage avec repli mémoire) ---------- */
const hasStorage = typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';
let memoryStore = {};
async function storeGet(key) {
  if (hasStorage) {
    try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
    catch (e) { return null; }
  }
  return memoryStore[key] ?? null;
}
async function storeSet(key, value) {
  if (hasStorage) {
    try { await window.storage.set(key, JSON.stringify(value)); return; } catch (e) { /* fall through */ }
  }
  memoryStore[key] = value;
}

/* ---------- Registre des couleurs ---------- */
let registry = []; // [{hex, title, docId}]
async function loadRegistry() { registry = (await storeGet('color-registry')) || []; }
async function saveRegistry() { await storeSet('color-registry', registry); }
function registryHexes() { return registry.map(r => r.hex); }
async function registerColor(docId, hex, title) {
  registry = registry.filter(r => r.docId !== docId);
  registry.push({ hex, title: title || '(sans titre)', docId });
  await saveRegistry();
}

/* ---------- Modèle de document ---------- */
let uidCounter = 1;
function uid() { return 'id' + (uidCounter++) + '_' + Math.random().toString(36).slice(2, 7); }

function newBlock(type) {
  const base = { id: uid(), type };
  switch (type) {
    case 'heading2': return { ...base, text: 'Sous-titre' };
    case 'paragraph': return { ...base, text: 'Nouveau paragraphe. Cliquez pour modifier ce texte.', italic: false };
    case 'bullets': return { ...base, items: ['Premier point', 'Deuxième point'] };
    case 'callout': return { ...base, tag: 'confirme', title: 'Titre du callout', paragraphs: ['Texte du callout.'] };
    case 'table': return { ...base, badge: false, rows: [{ a: 'Champ', b: 'Valeur' }] };
    case 'card': return { ...base, badgeText: 'HOOK 1', title: 'Titre de la fiche', pitch: 'Accroche ou description.', rows: [{ a: 'Niveau', b: 'Valeur' }] };
    case 'crossref': return { ...base, text: 'Voir XXX-00 pour plus de détails.' };
    case 'pagebreak': return { ...base };
    default: return base;
  }
}
function newSection() {
  return { id: uid(), code: 'DOC-01', title: 'Nouvelle section', blocks: [newBlock('paragraph')] };
}
function defaultDocument() {
  return {
    id: uid(),
    color: '#2f6f5e',
    stampStyle: 'accent', // 'accent' ou 'red'
    cover: {
      orgLine: 'GUILDE DES ARCHIVISTES — FONDS DOCUMENTAIRE',
      kicker: 'DOSSIER DE CLASSIFICATION',
      title: 'TITRE DU DOSSIER',
      subtitle: 'Sous-titre descriptif du document',
      stampText: 'NIVEAU 1 — DOMAINE PUBLIC',
      meta: [
        { a: 'N° de dossier', b: 'DOC-VC-001' },
        { a: 'Objet', b: 'Décrire ici le sujet du dossier' },
        { a: 'Documents liés', b: '' },
        { a: 'Nature du sujet', b: '' },
        { a: 'Confidentialité', b: 'Niveau 1 — voir ARC-03' },
      ],
    },
    footerBrand: 'NOUVEAU DOSSIER',
    noteUsage: {
      includeTagLegend: true,
      text: "Ce dossier suit le système de classification commun à la collection. Chaque information est étiquetée selon son statut.",
    },
    sections: [newSection()],
  };
}

let doc = defaultDocument();
let selectedSwatchIdx = 0;
let proposals = [];

/* ---------- Rendu : PREVIEW ---------- */
function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function nl2p(text) { return escapeHtml(text).replace(/\n/g, '<br>'); }

const TAG_META = {
  confirme: { label: 'Confirmé', bg: 'var(--doc-ink)' },
  hypothese: { label: 'Hypothèse de travail', bg: FIXED.gold },
  hook: { label: 'Hook MJ', bg: FIXED.teal },
  attention: { label: 'Attention MJ', bg: FIXED.red },
};
const CALLOUT_BG = { confirme: 'var(--doc-card)', hypothese: FIXED.goldBg, hook: FIXED.tealBg, attention: FIXED.redBg };
const CALLOUT_BORDER = { confirme: 'var(--doc-ink)', hypothese: FIXED.gold, hook: FIXED.teal, attention: FIXED.red };

function renderBlockHtml(b) {
  switch (b.type) {
    case 'heading2':
      return `<div class="sec-h2">${escapeHtml(b.text)}</div>`;
    case 'paragraph':
      return `<p class="p-body${b.italic ? ' italic' : ''}">${nl2p(b.text)}</p>`;
    case 'bullets':
      return `<ul class="bullets">${b.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    case 'callout': {
      const meta = TAG_META[b.tag] || TAG_META.confirme;
      return `<div class="callout" style="border-left-color:${CALLOUT_BORDER[b.tag]};background:${CALLOUT_BG[b.tag]};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span><span class="ctitle">${escapeHtml(b.title)}</span>
        ${b.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      </div>`;
    }
    case 'table':
      return `<table class="stat">${b.rows.map(r => `<tr><td class="${b.badge ? 'badge' : 'label'}">${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join('')}</table>`;
    case 'card':
      return `<div class="card">
        <div class="card-header">
        <div class="chead">${escapeHtml(b.badgeText)}</div>
        <div class="dot-separator">·</div>
        <div class="ctitle2">${escapeHtml(b.title)}</div>
        </div
        <p>${escapeHtml(b.pitch)}</p>
        <table>${b.rows.map(r => `<tr><td>${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join('')}</table>
      </div>`;
    case 'crossref':
      return `<div class="crossref"><b>→ RENVOI</b> &nbsp;${escapeHtml(b.text)}</div>`;
    case 'pagebreak':
      return `<div style="page-break-after:always;"></div>`;
    default: return '';
  }
}

function renderPreview() {
  const pal = derivePalette(doc.color);
  const stampColor = doc.stampStyle === 'red' ? FIXED.red : pal.accent;
  const stampBg = doc.stampStyle === 'red' ? FIXED.redBg : pal.accentBg;
  const styleVars = `--doc-accent:${pal.accent};--doc-ink:${pal.ink};--doc-inkmid:${pal.inkMid};--doc-card:${pal.card};--stamp-color:${stampColor};--stamp-bg:${stampBg};`;

  const header = (title) => `<div class="doc-header"><span>DOSSIER ${escapeHtml(doc.cover.meta[0]?.b || '')}</span><span>${escapeHtml(doc.footerBrand)}</span></div>`;

  // Page de couverture
  let cover = `<div class="page" style="${styleVars}">`;
  cover += header();
  cover += `<div class="cover-org">${escapeHtml(doc.cover.orgLine)}</div><hr class="cover-rule">`;
  cover += `<div class="cover-kicker">${escapeHtml(doc.cover.kicker)}</div>`;
  cover += `<div class="cover-title">${escapeHtml(doc.cover.title)}</div>`;
  cover += `<div class="cover-subtitle">${escapeHtml(doc.cover.subtitle)}</div>`;
  cover += `<div class="cover-stamp"><p style="margin: 0; text-align: center">${nl2p(doc.cover.stampText)}</div>`;
  cover += `<table class="meta-table">${doc.cover.meta.map(m => `<tr><td>${escapeHtml(m.a)}</td><td>${escapeHtml(m.b)}</td></tr>`).join('')}</table>`;
  cover += `</div>`;

  // Note d'usage
  let note = `<div class="page" style="${styleVars}">`;
  note += header();
  note += `<div class="sec-h1"><span class="code">${escapeHtml(doc.cover.meta[0]?.b?.split('-')[0] || 'DOC')}-00</span><span class="dot-separator">·</span>NOTE D'USAGE</div>`;
  note += `<p class="p-body">${nl2p(doc.noteUsage.text)}</p>`;
  if (doc.noteUsage.includeTagLegend) {
    const legends = [
      ['confirme', 'Fait établi dans le lore central. Ne devrait pas être contredit à la légère car cela pourrait créer des incohérences dans l\'histoire.'],
      ['hypothese', 'Proposition cohérente avec le canon existant, mais non tranchée. Le MJ peut l\'adopter telle quelle, l\'adapter, ou la remplacer par sa propre idée.'],
      ['hook', 'Accroche de scénario prête à l\'emploi, directement exploitable en jeu..'],
      ['attention', 'Point de vigilance : risque d\'incohérence, d\'équilibrage, ou de spoil à ne pas dévoiler trop tôt aux joueurs..'],
    ];
    legends.forEach(([tag, txt]) => {
      const meta = TAG_META[tag];
      note += `<div class="callout" style="border-left-color:${CALLOUT_BORDER[tag]};background:${CALLOUT_BG[tag]};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span>
        <p>${escapeHtml(txt)}</p></div>`;
    });
  }
  note += `</div>`;

  // Table des matières (statique)
  let toc = `<div class="page" style="${styleVars}">`;
  toc += header();
  toc += `<div class="sec-h1">TABLE DES MATIÈRES</div>`;
  toc += `<ul class="toc-list">` + doc.sections.map(s => `<li><span class="code">${escapeHtml(s.code)}</span>${escapeHtml(s.title)}</li>`).join('') + `</ul>`;
  toc += `</div>`;

  // Sections de contenu
  let sectionsHtml = doc.sections.map(s => {
    let inner = `<div class="sec-h1"><span class="code">${escapeHtml(s.code)}</span><span class="dot-separator">·</span>${escapeHtml(s.title)}</div>`;
    inner += s.blocks.map(renderBlockHtml).join('');
    return `<div class="page" style="${styleVars}">${header()}${inner}</div>`;
  }).join('');

  document.getElementById('preview').innerHTML = cover + note + toc + sectionsHtml;
}

/* ---------- Rendu : SIDEBAR (formulaires) ---------- */
function el(tag, attrs, children) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.substring(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(c => c && e.appendChild(c));
  return e;
}

async function selectColor(hex, isDefault) {
  doc.color = normalizeHex(hex);
  await registerColor(doc.id, doc.color, doc.cover.title);
  renderSidebar();
  renderPreview();
}

function renderColorPicker(container) {
  const box = el('div', { class: 'side-section' });
  box.appendChild(el('h3', {}, [document.createTextNode('Couleur du document')]));

  const grid = el('div', { class: 'swatch-grid' });
  proposals.forEach((hex, i) => {
    const isSelected = normalizeHex(doc.color) === normalizeHex(hex);
    const sw = el('div', { class: 'swatch' + (isSelected ? ' selected' : ''), onclick: () => selectColor(hex, i === 0) });
    sw.appendChild(el('div', { class: 'chip', style: `background:${hex};` }));
    sw.appendChild(el('span', { class: 'hex' }, [document.createTextNode(hex)]));
    if (i === 0) sw.appendChild(el('span', { class: 'default-tag' }, [document.createTextNode('DÉFAUT')]));
    grid.appendChild(sw);
  });
  box.appendChild(grid);

  const actions = el('div', { class: 'swatch-actions' });
  actions.appendChild(el('button', { onclick: () => { proposals = generateProposals(registryHexes().filter(h => h !== doc.color), 5); renderSidebar(); } }, [document.createTextNode('↻ 5 nouvelles propositions')]));
  box.appendChild(actions);

  const customWrap = el('div', { class: 'custom-hex' });
  const colorInput = el('input', { type: 'color', value: isValidHex(doc.color) ? normalizeHex(doc.color) : '#2f6f5e' });
  const textInput = el('input', { type: 'text', placeholder: '#RRGGBB', value: doc.color });
  const msg = el('div', {});
  function tryCustom(val) {
    if (!isValidHex(val)) { msg.className = 'hex-warning'; msg.textContent = 'Code hexadécimal invalide.'; return; }
    const norm = normalizeHex(val);
    const clash = registry.find(r => r.docId !== doc.id && normalizeHex(r.hex) === norm);
    if (clash) { msg.className = 'hex-warning'; msg.textContent = `Déjà utilisée par « ${clash.title} ».`; return; }
    msg.className = 'hex-ok'; msg.textContent = 'Couleur disponible ✓';
    colorInput.value = norm;
    selectColor(norm);
  }
  colorInput.addEventListener('input', () => { textInput.value = colorInput.value; tryCustom(colorInput.value); });
  textInput.addEventListener('change', () => tryCustom(textInput.value));
  customWrap.appendChild(colorInput);
  customWrap.appendChild(textInput);
  box.appendChild(el('label', {}, [document.createTextNode('Couleur personnalisée')]));
  box.appendChild(customWrap);
  box.appendChild(msg);

  const pal = derivePalette(doc.color);
  const palPrev = el('div', { class: 'palette-preview' });
  [pal.ink, pal.inkMid, pal.accent, pal.accentBg, pal.card].forEach(c => palPrev.appendChild(el('div', { style: `background:${c};`, title: c })));
  box.appendChild(el('label', { style: 'margin-top:8px;' }, [document.createTextNode('Palette dérivée (encre → fond)')]));
  box.appendChild(palPrev);

  const stampRow = el('div', { class: 'field', style: 'margin-top:10px;' });
  stampRow.appendChild(el('label', {}, [document.createTextNode('Style du tampon de couverture')]));
  const sel = el('select', { onchange: (e) => { doc.stampStyle = e.target.value; renderPreview(); } });
  ['accent', 'red'].forEach(v => {
    const o = el('option', { value: v }, [document.createTextNode(v === 'accent' ? 'Couleur du document' : 'Rouge (alerte / restreint)')]);
    if (doc.stampStyle === v) o.setAttribute('selected', 'selected');
    sel.appendChild(o);
  });
  stampRow.appendChild(sel);
  box.appendChild(stampRow);

  container.appendChild(box);
}

function fieldText(labelText, value, onInput, multiline) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, [document.createTextNode(labelText)]));
  const input = el(multiline ? 'textarea' : 'input', multiline ? {} : { type: 'text' });
  input.value = value || '';
  input.addEventListener('input', (e) => onInput(e.target.value));
  f.appendChild(input);
  return f;
}

function renderDocSettings(container) {
  const box = el('div', { class: 'side-section' });
  box.appendChild(el('h3', {}, [document.createTextNode('Couverture du document')]));
  box.appendChild(fieldText('Ligne d\'organisation', doc.cover.orgLine, v => { doc.cover.orgLine = v; renderPreview(); }));
  box.appendChild(fieldText('Sur-titre (kicker)', doc.cover.kicker, v => { doc.cover.kicker = v; renderPreview(); }));
  box.appendChild(fieldText('Titre principal', doc.cover.title, v => { doc.cover.title = v; renderPreview(); }));
  box.appendChild(fieldText('Sous-titre', doc.cover.subtitle, v => { doc.cover.subtitle = v; renderPreview(); }));
  box.appendChild(fieldText('Texte du tampon', doc.cover.stampText, v => { doc.cover.stampText = v; renderPreview(); }, true));
  box.appendChild(fieldText('Marque en pied/en-tête de page', doc.footerBrand, v => { doc.footerBrand = v; renderPreview(); }));

  box.appendChild(el('label', { style: 'margin-top:10px;display:block;' }, [document.createTextNode('Métadonnées (tableau de couverture)')]));
  const rows = el('div', { class: 'rows-list' });
  doc.cover.meta.forEach((m, i) => {
    const rp = el('div', { class: 'rowpair' });
    const ai = el('input', { type: 'text', value: m.a, class: 'narrow' }); ai.addEventListener('input', e => { m.a = e.target.value; renderPreview(); });
    const bi = el('input', { type: 'text', value: m.b }); bi.addEventListener('input', e => { m.b = e.target.value; renderPreview(); });
    const del = el('button', { class: 'icon-btn danger', onclick: () => { doc.cover.meta.splice(i, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]);
    rp.appendChild(ai); rp.appendChild(bi); rp.appendChild(del);
    rows.appendChild(rp);
  });
  box.appendChild(rows);
  box.appendChild(el('button', { class: 'add-row-btn', onclick: () => { doc.cover.meta.push({ a: 'Champ', b: 'Valeur' }); renderSidebar(); renderPreview(); } }, [document.createTextNode('+ ligne')]));

  box.appendChild(el('label', { style: 'margin-top:12px;display:block;' }, [document.createTextNode('Note d\'usage')]));
  box.appendChild(fieldText('Texte introductif', doc.noteUsage.text, v => { doc.noteUsage.text = v; renderPreview(); }, true));
  const legendRow = el('div', { class: 'field' });
  const cb = el('input', { type: 'checkbox' }); cb.checked = doc.noteUsage.includeTagLegend;
  cb.addEventListener('change', e => { doc.noteUsage.includeTagLegend = e.target.checked; renderPreview(); });
  const lbl = el('label', { style: 'display:flex;align-items:center;gap:6px;font-weight:400;' }, [cb, document.createTextNode('Inclure la légende des 4 tags')]);
  legendRow.appendChild(lbl);
  box.appendChild(legendRow);

  container.appendChild(box);
}

function blockHeader(label, s, b, idx) {
  const head = el('div', { class: 'block-item-head' });
  head.appendChild(el('span', {}, [document.createTextNode(label)]));
  head.appendChild(el('span', { class: 'grow' }));
  head.appendChild(el('button', { class: 'icon-btn', title: 'Monter', onclick: () => { if (idx > 0) { [s.blocks[idx - 1], s.blocks[idx]] = [s.blocks[idx], s.blocks[idx - 1]]; renderSidebar(); renderPreview(); } } }, [document.createTextNode('↑')]));
  head.appendChild(el('button', { class: 'icon-btn', title: 'Descendre', onclick: () => { if (idx < s.blocks.length - 1) { [s.blocks[idx + 1], s.blocks[idx]] = [s.blocks[idx], s.blocks[idx + 1]]; renderSidebar(); renderPreview(); } } }, [document.createTextNode('↓')]));
  head.appendChild(el('button', { class: 'icon-btn', title: 'Dupliquer', onclick: () => { const copy = JSON.parse(JSON.stringify(b)); copy.id = uid(); s.blocks.splice(idx + 1, 0, copy); renderSidebar(); renderPreview(); } }, [document.createTextNode('⧉')]));
  head.appendChild(el('button', { class: 'icon-btn danger', title: 'Supprimer', onclick: () => { s.blocks.splice(idx, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]));
  return head;
}

function renderBlockEditor(s, b, idx) {
  const item = el('div', { class: 'block-item' });
  const labels = { heading2: 'Sous-titre', paragraph: 'Paragraphe', bullets: 'Liste à puces', callout: 'Callout', table: 'Tableau', card: 'Fiche (hook/carte)', crossref: 'Renvoi', pagebreak: 'Saut de page' };
  item.appendChild(blockHeader(labels[b.type] || b.type, s, b, idx));
  const body = el('div', { class: 'block-item-body' });

  if (b.type === 'heading2') {
    body.appendChild(fieldText('Texte', b.text, v => { b.text = v; renderPreview(); }));
  }
  else if (b.type === 'paragraph') {
    body.appendChild(fieldText('Texte', b.text, v => { b.text = v; renderPreview(); }, true));
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!b.italic;
    cb.addEventListener('change', e => { b.italic = e.target.checked; renderPreview(); });
    body.appendChild(el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;' }, [cb, document.createTextNode('Italique')]));
  }
  else if (b.type === 'bullets') {
    const list = el('div', { class: 'bullets-list' });
    b.items.forEach((it, i) => {
      const rp = el('div', { class: 'rowpair' });
      const inp = el('input', { type: 'text', value: it }); inp.addEventListener('input', e => { b.items[i] = e.target.value; renderPreview(); });
      const del = el('button', { class: 'icon-btn danger', onclick: () => { b.items.splice(i, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]);
      rp.appendChild(inp); rp.appendChild(del);
      list.appendChild(rp);
    });
    body.appendChild(list);
    body.appendChild(el('button', { class: 'add-item-btn', onclick: () => { b.items.push('Nouveau point'); renderSidebar(); renderPreview(); } }, [document.createTextNode('+ puce')]));
  }
  else if (b.type === 'callout') {
    const tagRow = el('div', { class: 'tag-select' });
    Object.keys(TAG_META).forEach(tagKey => {
      const active = b.tag === tagKey;
      const btn = el('button', { style: active ? `background:${TAG_META[tagKey].bg};` : '', class: active ? 'active' : '', onclick: () => { b.tag = tagKey; renderSidebar(); renderPreview(); } }, [document.createTextNode(TAG_META[tagKey].label)]);
      tagRow.appendChild(btn);
    });
    body.appendChild(el('label', {}, [document.createTextNode('Type de tag')]));
    body.appendChild(tagRow);
    body.appendChild(fieldText('Titre du callout', b.title, v => { b.title = v; renderPreview(); }));
    const paraWrap = el('div', {});
    b.paragraphs.forEach((p, i) => {
      const rp = el('div', { class: 'rowpair' });
      const ta = el('textarea', {}); ta.value = p; ta.style.flex = '1'; ta.addEventListener('input', e => { b.paragraphs[i] = e.target.value; renderPreview(); });
      const del = el('button', { class: 'icon-btn danger', onclick: () => { b.paragraphs.splice(i, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]);
      rp.appendChild(ta); rp.appendChild(del);
      paraWrap.appendChild(rp);
    });
    body.appendChild(paraWrap);
    body.appendChild(el('button', { class: 'add-item-btn', onclick: () => { b.paragraphs.push('Nouveau paragraphe'); renderSidebar(); renderPreview(); } }, [document.createTextNode('+ paragraphe')]));
  }
  else if (b.type === 'table') {
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!b.badge;
    cb.addEventListener('change', e => { b.badge = e.target.checked; renderPreview(); });
    body.appendChild(el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;margin-bottom:6px;' }, [cb, document.createTextNode('Colonne de gauche en badge (échelle numérotée)')]));
    const rows = el('div', { class: 'rows-list' });
    b.rows.forEach((r, i) => {
      const rp = el('div', { class: 'rowpair' });
      const ai = el('input', { type: 'text', value: r.a, class: 'narrow' }); ai.addEventListener('input', e => { r.a = e.target.value; renderPreview(); });
      const bi = el('input', { type: 'text', value: r.b }); bi.addEventListener('input', e => { r.b = e.target.value; renderPreview(); });
      const del = el('button', { class: 'icon-btn danger', onclick: () => { b.rows.splice(i, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]);
      rp.appendChild(ai); rp.appendChild(bi); rp.appendChild(del);
      rows.appendChild(rp);
    });
    body.appendChild(rows);
    body.appendChild(el('button', { class: 'add-row-btn', onclick: () => { b.rows.push({ a: '', b: '' }); renderSidebar(); renderPreview(); } }, [document.createTextNode('+ ligne')]));
  }
  else if (b.type === 'card') {
    body.appendChild(fieldText('Badge (ex. HOOK 1)', b.badgeText, v => { b.badgeText = v; renderPreview(); }));
    body.appendChild(fieldText('Titre', b.title, v => { b.title = v; renderPreview(); }));
    body.appendChild(fieldText('Accroche / description', b.pitch, v => { b.pitch = v; renderPreview(); }, true));
    const rows = el('div', { class: 'rows-list' });
    b.rows.forEach((r, i) => {
      const rp = el('div', { class: 'rowpair' });
      const ai = el('input', { type: 'text', value: r.a, class: 'narrow' }); ai.addEventListener('input', e => { r.a = e.target.value; renderPreview(); });
      const bi = el('input', { type: 'text', value: r.b }); bi.addEventListener('input', e => { r.b = e.target.value; renderPreview(); });
      const del = el('button', { class: 'icon-btn danger', onclick: () => { b.rows.splice(i, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]);
      rp.appendChild(ai); rp.appendChild(bi); rp.appendChild(del);
      rows.appendChild(rp);
    });
    body.appendChild(rows);
    body.appendChild(el('button', { class: 'add-row-btn', onclick: () => { b.rows.push({ a: '', b: '' }); renderSidebar(); renderPreview(); } }, [document.createTextNode('+ ligne')]));
  }
  else if (b.type === 'crossref') {
    body.appendChild(fieldText('Texte du renvoi', b.text, v => { b.text = v; renderPreview(); }));
  }
  else if (b.type === 'pagebreak') {
    body.appendChild(el('div', { style: 'font-size:12px;color:#999;' }, [document.createTextNode('Force un saut de page à l\'impression.')]));
  }

  item.appendChild(body);
  return item;
}

function renderSectionCard(s, idx) {
  const card = el('div', { class: 'section-card' });
  const head = el('div', { class: 'section-head' });
  const codeInput = el('input', { class: 'code', type: 'text', value: s.code });
  codeInput.addEventListener('input', e => { s.code = e.target.value; renderPreview(); });
  const titleInput = el('input', { type: 'text', value: s.title });
  titleInput.addEventListener('input', e => { s.title = e.target.value; renderPreview(); });
  head.appendChild(codeInput); head.appendChild(titleInput);
  head.appendChild(el('button', { class: 'icon-btn', title: 'Monter la section', onclick: () => { if (idx > 0) { [doc.sections[idx - 1], doc.sections[idx]] = [doc.sections[idx], doc.sections[idx - 1]]; renderSidebar(); renderPreview(); } } }, [document.createTextNode('↑')]));
  head.appendChild(el('button', { class: 'icon-btn', title: 'Descendre la section', onclick: () => { if (idx < doc.sections.length - 1) { [doc.sections[idx + 1], doc.sections[idx]] = [doc.sections[idx], doc.sections[idx + 1]]; renderSidebar(); renderPreview(); } } }, [document.createTextNode('↓')]));
  head.appendChild(el('button', { class: 'icon-btn danger', title: 'Supprimer la section', onclick: () => { doc.sections.splice(idx, 1); renderSidebar(); renderPreview(); } }, [document.createTextNode('✕')]));
  card.appendChild(head);

  const blockList = el('div', { class: 'block-list' });
  s.blocks.forEach((b, bidx) => blockList.appendChild(renderBlockEditor(s, b, bidx)));
  card.appendChild(blockList);

  const menu = el('div', { class: 'add-block-menu' });
  const types = [['heading2', '+ Sous-titre'], ['paragraph', '+ Paragraphe'], ['bullets', '+ Liste'], ['callout', '+ Callout'], ['table', '+ Tableau'], ['card', '+ Fiche'], ['crossref', '+ Renvoi'], ['pagebreak', '+ Saut de page']];
  types.forEach(([t, label]) => {
    menu.appendChild(el('button', { onclick: () => { s.blocks.push(newBlock(t)); renderSidebar(); renderPreview(); } }, [document.createTextNode(label)]));
  });
  card.appendChild(menu);
  return card;
}

function renderSections(container) {
  const box = el('div', { class: 'side-section' });
  box.appendChild(el('h3', {}, [document.createTextNode('Sections & contenu')]));
  doc.sections.forEach((s, idx) => box.appendChild(renderSectionCard(s, idx)));
  box.appendChild(el('button', { class: 'add-section-btn', onclick: () => { doc.sections.push(newSection()); renderSidebar(); renderPreview(); } }, [document.createTextNode('+ Ajouter une section')]));
  container.appendChild(box);
}

function renderRegistryPanel(container) {
  const box = el('div', { class: 'side-section' });
  box.appendChild(el('h3', {}, [document.createTextNode('Registre des couleurs (aperçu)')]));
  const list = el('div', { class: 'registry-list' });
  if (registry.length === 0) { list.appendChild(el('div', { style: 'padding:8px;color:#999;font-size:11px;' }, [document.createTextNode('Aucune couleur enregistrée pour l\'instant.')])); }
  registry.forEach(r => {
    const row = el('div', { class: 'registry-row' });
    row.appendChild(el('span', {}, [el('span', { class: 'rc', style: `background:${r.hex};` }), document.createTextNode(r.title)]));
    row.appendChild(el('span', { style: 'font-family:Consolas,monospace;color:#888;' }, [document.createTextNode(r.hex)]));
    list.appendChild(row);
  });
  box.appendChild(list);
  container.appendChild(box);
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';
  renderColorPicker(sidebar);
  renderDocSettings(sidebar);
  renderSections(sidebar);
  renderRegistryPanel(sidebar);
}

/* ---------- Export / Import JSON ---------- */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function slugify(s) { return (s || 'document').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'document'; }

document.getElementById('btn-export-json').addEventListener('click', () => {
  downloadFile(`dossier-${slugify(doc.cover.title)}.json`, JSON.stringify(doc, null, 2), 'application/json');
});
document.getElementById('file-import').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.sections) throw new Error('format invalide');
      doc = imported;
      if (!doc.id) doc.id = uid();
      proposals = [doc.color, ...generateProposals([...registryHexes(), doc.color], 4)];
      await registerColor(doc.id, doc.color, doc.cover.title);
      renderSidebar(); renderPreview();
    } catch (err) { alert('Fichier JSON invalide : ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});
document.getElementById('btn-pdf').addEventListener('click', () => { window.print(); });
document.getElementById('btn-new').addEventListener('click', async () => {
  if (!confirm('Créer un nouveau document ? Les modifications non exportées seront perdues.')) return;
  doc = defaultDocument();
  proposals = generateProposals(registryHexes(), 5);
  doc.color = proposals[0];
  await registerColor(doc.id, doc.color, doc.cover.title);
  renderSidebar(); renderPreview();
});

/* ---------- Modale registre ---------- */
function openRegistryModal() {
  const list = document.getElementById('registry-list-full');
  list.innerHTML = '';
  if (registry.length === 0) { list.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;">Aucune couleur enregistrée.</div>'; }
  registry.forEach(r => {
    const row = document.createElement('div'); row.className = 'registry-row';
    row.innerHTML = `<span><span class="rc" style="background:${r.hex};"></span>${escapeHtml(r.title)}</span><span style="font-family:Consolas,monospace;color:#888;">${r.hex}</span>`;
    list.appendChild(row);
  });
  document.getElementById('registry-modal').style.display = 'flex';
}
document.getElementById('btn-registry').addEventListener('click', openRegistryModal);
document.getElementById('btn-registry-close').addEventListener('click', () => { document.getElementById('registry-modal').style.display = 'none'; });
document.getElementById('btn-registry-export').addEventListener('click', () => {
  downloadFile('registre-couleurs.json', JSON.stringify(registry, null, 2), 'application/json');
});
document.getElementById('registry-import').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('format invalide (liste attendue)');
      const byDocId = new Map(registry.map(r => [r.docId, r]));
      imported.forEach(r => { if (r.hex && r.docId) byDocId.set(r.docId, r); });
      registry = Array.from(byDocId.values());
      await saveRegistry();
      openRegistryModal();
      renderSidebar();
    } catch (err) { alert('Fichier de registre invalide : ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ---------- Initialisation ---------- */
(async function init() {
  await loadRegistry();
  proposals = generateProposals(registryHexes(), 5);
  doc.color = proposals[0];
  await registerColor(doc.id, doc.color, doc.cover.title);
  renderSidebar();
  renderPreview();
})();
