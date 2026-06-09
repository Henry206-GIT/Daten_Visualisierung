/* 07 · Wähler-Sturm — dein Bundesland, deine Partei
   p5.js · interaktiv
   Start: neutrale Sphäre mit allen Partikeln (graue, unentschiedene Wählerschaft).
   Dropdowns oben links (Bundesland, Partei) transformieren die Sphäre live:
     - Bundesland gewählt  → Partikel färben sich nach Parteimix dieses Landes (ein Blob).
     - Partei gewählt      → diese Partei wird heller Kern, andere Parteien als Sphären drumherum.
     - Felder geleert      → wieder neutral.
   Partikelmenge ∝ echte Zweitstimmen (BTW 2025). 1 Partikel = einstellbare Menschen.        */

const MAXP = 16000;
const GREY = [150, 150, 158];
let DATA, FARBEN;
let parts = [];                 // Pool
let spheres = [];               // {party, votes, n, col, isCore}
let selLand = null, selParty = null;
let params = { ppp: 1200, core: 1.15, orbit: 1.35, sphere: 0.95 };
let cap = {};
let firstLayout = true;         // erster Aufbau: Positionen direkt setzen (sonst morphen)
let textMode = false;           // Toggle: Partikel formen das Partei-Kürzel
const glyphCache = {};          // label -> normierte Punktwolke [{x,y}]
// Voller Parteiname -> kurzes Kürzel für die Buchstaben-Form
const KUERZEL = { 'Die Linke': 'LINKE', 'GRÜNE': 'GRÜNE' };
function kuerzel(party) { return party ? (KUERZEL[party] || party) : 'DE'; }

function preload() { DATA = loadJSON('../data.json'); }

function setup() {
  createCanvas(windowWidth, windowHeight);
  FARBEN = DATA.farben;
  for (let i = 0; i < MAXP; i++)
    parts.push({ x: width / 2, y: height / 2, vx: 0, vy: 0,
                 ang: random(TWO_PI), rad: sqrt(random()),
                 sIdx: 0, col: GREY.slice(), tcol: GREY.slice(),
                 isCore: false, b: 0.6, jitter: random(1000),
                 sizeK: random(0.7, 1.4), active: false });

  cap.big = document.querySelector('#cap .big');
  cap.sub = document.querySelector('#cap .sub');
  buildLandSelect();
  wireUI();

  // Direkt-/Test-Hook: ?land=Bayern&partei=CSU
  const q = new URLSearchParams(location.search);
  const L = q.get('land'), P = q.get('partei');
  if (L && getLand(L)) {
    selLand = L; document.getElementById('sel-land').value = L; updatePartyOptions(L);
    if (P && getLand(L).votes[P]) { selParty = P; document.getElementById('sel-party').value = P; }
  }
  if (q.get('text')) {
    textMode = true;
    const t = document.getElementById('toggle-text');
    t.classList.add('on'); t.textContent = 'Kürzel: an';
  }
  rebuild();
  background(7, 8, 12);
}

/* ---------- Daten-Helfer ---------- */
function getLand(name) { return DATA.laender.find(l => l.name === name); }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function partiesOf(land) { return Object.entries(getLand(land).votes).sort((a, b) => b[1] - a[1]); }
function sumVotes(o) { return Object.values(o).reduce((a, b) => a + b, 0); }
function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }

// Buchstaben-Form -> normierte Punktwolke (zentriert, Höhe ~1). Einmal je Label gecacht.
function glyphPoints(label) {
  if (glyphCache[label]) return glyphCache[label];
  const w = 1100, h = 360, g = createGraphics(w, h);
  g.pixelDensity(1); g.background(0); g.fill(255); g.noStroke();
  g.textAlign(CENTER, CENTER); g.textStyle(BOLD); g.textSize(250);
  g.text(label, w / 2, h / 2);
  g.loadPixels();
  const pts = [], step = 2;
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step)
      if (g.pixels[4 * (y * w + x)] > 128) pts.push({ x, y });
  let mx = 0, my = 0; pts.forEach(p => { mx += p.x; my += p.y; });
  mx /= pts.length || 1; my /= pts.length || 1;
  const norm = pts.map(p => ({ x: (p.x - mx) / h, y: (p.y - my) / h }));
  g.remove();
  glyphCache[label] = norm.length ? norm : [{ x: 0, y: 0 }];
  return glyphCache[label];
}

// Zielpunkt eines Partikels im Buchstaben — gleichmäßig über die ganze Glyphe verteilt
function glyphTarget(p, s) {
  const cloud = glyphPoints(kuerzel(s.party));
  const i = Math.min(cloud.length - 1, Math.floor((p.pIdx / Math.max(1, p.sphN)) * cloud.length));
  const pt = cloud[i], sc = s.R * 2.2;
  return [s.cx + pt.x * sc, s.cy + pt.y * sc];
}

/* ---------- Dropdowns ---------- */
function buildLandSelect() {
  const s = document.getElementById('sel-land');
  s.innerHTML = '<option value="">— Bundesland —</option>';
  DATA.laender.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach(l => {
    const o = document.createElement('option'); o.value = l.name; o.textContent = l.name;
    s.appendChild(o);
  });
}
function updatePartyOptions(land) {
  const s = document.getElementById('sel-party');
  s.innerHTML = '<option value="">— Partei —</option>';
  if (!land) { s.disabled = true; return; }
  s.disabled = false;
  partiesOf(land).forEach(([p, v]) => {
    const o = document.createElement('option'); o.value = p;
    o.textContent = `${p} · ${fmt(v)}`;
    s.appendChild(o);
  });
}
function wireUI() {
  document.getElementById('sel-land').addEventListener('change', e => {
    selLand = e.target.value || null; selParty = null;
    updatePartyOptions(selLand);
    document.getElementById('sel-party').value = '';
    rebuild();
  });
  document.getElementById('sel-party').addEventListener('change', e => {
    selParty = e.target.value || null; rebuild();
  });
  document.getElementById('toggle-text').addEventListener('click', e => {
    textMode = !textMode;
    e.target.classList.toggle('on', textMode);
    e.target.textContent = textMode ? 'Kürzel: an' : 'Kürzel: aus';
  });
  const bind = (id, key, f, realloc) => {
    const s = document.getElementById(id), vEl = document.getElementById('v-' + id.replace('s-', ''));
    s.value = params[key];
    const upd = (doRealloc) => { params[key] = parseFloat(s.value); vEl.textContent = f(params[key]);
                                 if (doRealloc && realloc) rebuild(); };
    s.addEventListener('input', () => upd(true)); upd(false);   // Init ohne rebuild
  };
  bind('s-ppp', 'ppp', v => fmt(v), true);
  bind('s-core', 'core', v => v.toFixed(2) + '×', false);
  bind('s-orbit', 'orbit', v => v.toFixed(2) + '×', false);
  bind('s-sphere', 'sphere', v => v.toFixed(2) + '×', false);
}

/* ---------- Allokation (3 Modi) ---------- */
function rebuild() {
  const cap2 = (n) => Math.max(2, Math.round(n));
  if (!selLand) {                                    // NEUTRAL
    const total = sumVotes(DATA.bund.votes);
    const n = Math.min(MAXP, cap2(total / params.ppp));
    spheres = [{ party: null, votes: total, n, col: GREY, isCore: false }];
  } else {
    const votes = getLand(selLand).votes;
    const ordered = partiesOf(selLand);
    const coreParty = selParty || ordered[0][0];        // ohne Partei: stärkste in der Mitte
    const list = [[coreParty, votes[coreParty]], ...ordered.filter(([p]) => p !== coreParty)];
    let counts = list.map(([p, v]) => cap2(v / params.ppp));
    let tot = counts.reduce((a, b) => a + b, 0);
    if (tot > MAXP) { const f = MAXP / tot; counts = counts.map(c => Math.max(2, Math.floor(c * f))); }
    spheres = list.map(([party, v], i) => ({
      party, votes: v, n: counts[i],
      col: hexToRgb(FARBEN[party] || '#cccccc'), isCore: i === 0,
    }));
  }
  // Partikel zuweisen (Farbe/Helligkeit = Ziel; Positionen morphen via Federkraft)
  let k = 0;
  for (let si = 0; si < spheres.length; si++) {
    const s = spheres[si];
    const b = !selLand ? 0.6 : (s.isCore ? 1.0 : 0.72);
    for (let c = 0; c < s.n && k < MAXP; c++, k++) {
      const p = parts[k];
      p.active = true; p.sIdx = si; p.isCore = s.isCore; p.b = b;
      p.tcol = s.col; p.ang = random(TWO_PI); p.rad = sqrt(random());
      p.pIdx = c; p.sphN = s.n;   // Position + Größe der Sphäre (gleichmäßige Buchstaben-Verteilung)
    }
  }
  for (; k < MAXP; k++) parts[k].active = false;
  if (firstLayout) {            // Erstbild sofort geformt (kein Aufmarsch aus der Mitte)
    layout();
    for (const p of parts) if (p.active) {
      const s = spheres[p.sIdx];
      if (textMode) {
        const t = glyphTarget(p, s); p.x = t[0]; p.y = t[1];
      } else {
        p.x = s.cx + cos(p.ang) * p.rad * s.R; p.y = s.cy + sin(p.ang) * p.rad * s.R;
      }
      p.vx = p.vy = 0; p.col = p.tcol.slice();
    }
    firstLayout = false;
  }
  updateCaption();
}

/* ---------- Geometrie je Frame ---------- */
function layout() {
  const md = min(width, height), cx = width / 2;
  // Text-Modus: kompakter (enger Ring, kleinere Sphären, höher), damit Kürzel ganz reinpassen
  const cy = height * (textMode ? 0.44 : 0.40);
  const oMul = textMode ? 0.72 : 1.0;
  const rMax = md * (textMode ? 0.12 : 0.16);
  const unit = md * 0.0045, orbitR = md * 0.30 * params.orbit * oMul;
  const rot = millis() * 0.00004;

  if (!selLand) {                                     // NEUTRAL: ein zentraler Blob
    const s = spheres[0];
    s.R = md * (textMode ? 0.20 : 0.23) * params.core; s.cx = cx; s.cy = cy;
    return;
  }
  // Bundesland gewählt: Kern (falls Partei) zentral, andere Parteien auf einem Ring
  const k = spheres.filter(s => !s.isCore).length;
  let oi = 0;
  spheres.forEach(s => {
    if (s.isCore) {
      s.R = constrain(unit * Math.sqrt(s.n) * params.core, md * 0.02, rMax);
      s.cx = cx; s.cy = cy;
    } else {
      s.R = constrain(unit * Math.sqrt(s.n) * params.sphere, md * 0.015, rMax);
      const a = -HALF_PI + (oi / k) * TWO_PI + rot; oi++;
      s.cx = cx + cos(a) * orbitR; s.cy = cy + sin(a) * orbitR;
    }
  });
}

/* ---------- Draw ---------- */
function draw() {
  noStroke();
  // Text-Modus: voller Clear (keine Schlieren) -> scharfe Buchstaben
  fill(7, 8, 12, textMode ? 255 : 34); rect(0, 0, width, height);
  layout();
  blendMode(textMode ? BLEND : ADD);          // BLEND = solide, kein Glow-Verwischen
  for (const p of parts) {
    if (!p.active) continue;
    const s = spheres[p.sIdx];
    let tx, ty, stiff, nf;
    if (textMode) {                          // Partikel formen das Partei-Kürzel
      const t = glyphTarget(p, s); tx = t[0]; ty = t[1];
      stiff = 0.11; nf = 0.03;                // straff + ruhig -> lesbar
    } else {                                  // Scheibe (Sphäre)
      const aRot = frameCount * (p.isCore ? 0.004 : 0.002);
      tx = s.cx + cos(p.ang + aRot) * p.rad * s.R;
      ty = s.cy + sin(p.ang + aRot) * p.rad * s.R;
      stiff = p.isCore ? 0.05 : 0.04; nf = 0.3;
    }
    p.vx += (tx - p.x) * stiff; p.vy += (ty - p.y) * stiff;
    const nA = noise(p.x * 0.0013, p.y * 0.0013, frameCount * 0.003 + p.jitter) * TWO_PI * 2;
    p.vx += cos(nA) * nf; p.vy += sin(nA) * nf;
    p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy;
    // Farbe sanft überblenden
    p.col[0] += (p.tcol[0] - p.col[0]) * 0.07;
    p.col[1] += (p.tcol[1] - p.col[1]) * 0.07;
    p.col[2] += (p.tcol[2] - p.col[2]) * 0.07;

    const c = p.col, kk = p.sizeK, b = p.b;
    if (textMode) {                          // scharfer, mit Sphärengröße skalierter Punkt
      const dr = constrain(s.R * 0.06, 1.6, 8);
      fill(c[0], c[1], c[2], 120); circle(p.x, p.y, dr * 1.7);
      fill(c[0], c[1], c[2], 255); circle(p.x, p.y, dr);
    } else {                                  // weicher Glow
      fill(c[0], c[1], c[2], 13 * b); circle(p.x, p.y, (p.isCore ? 17 : 12) * kk);
      fill(c[0], c[1], c[2], 48 * b); circle(p.x, p.y, (p.isCore ? 6.5 : 3.2) * kk);
      if (p.isCore) { fill(c[0], c[1], c[2], 110); circle(p.x, p.y, 2.6 * kk); }
    }
  }
  blendMode(BLEND);
}

/* ---------- Caption ---------- */
function updateCaption() {
  const ppp = `1 Partikel ≈ ${fmt(params.ppp)} Wähler`;
  if (!selLand) {
    cap.big.textContent = 'Alle Stimmen — Deutschland';
    cap.sub.textContent = `${fmt(sumVotes(DATA.bund.votes))} Zweitstimmen · wähle Bundesland & Partei`;
  } else if (!selParty) {
    const t = sumVotes(getLand(selLand).votes);
    const win = partiesOf(selLand)[0][0];
    cap.big.textContent = `${selLand}`;
    cap.sub.textContent = `Stärkste Partei: ${win} · ${fmt(t)} Zweitstimmen · ${ppp}`;
  } else {
    const v = getLand(selLand).votes[selParty];
    cap.big.textContent = `${selParty} in ${selLand}`;
    cap.sub.textContent = `${fmt(v)} Zweitstimmen · ${ppp}`;
  }
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
