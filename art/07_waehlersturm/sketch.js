/* 07 · Wähler-Sturm — dein Bundesland, deine Partei
   p5.js · interaktiv
   Erst Bundesland wählen, dann Partei. Der Partikelsturm transformiert:
   gewählte Partei = heller Kern (Partikel ∝ echte Zweitstimmen), andere Parteien
   als Sphären drumherum (Größe ∝ ihre Stimmen). 1 Partikel = einstellbare Menschen.   */

const MAXP = 7000;
let DATA, FARBEN;
let parts = [];                 // Pool
let spheres = [];               // {party, n, col, isCore, cx, cy, R}
let state = 'land';             // 'land' | 'party' | 'storm'
let selLand = null, selParty = null;
let params = { ppp: 2500, core: 1.15, orbit: 1.35, sphere: 0.95 };
let cap = {};

function preload() { DATA = loadJSON('../data.json'); }

function setup() {
  createCanvas(windowWidth, windowHeight);
  FARBEN = DATA.farben;
  for (let i = 0; i < MAXP; i++)
    parts.push({ x: width / 2, y: height / 2, vx: 0, vy: 0,
                 ang: random(TWO_PI), rad: sqrt(random()),
                 sIdx: -1, col: [150, 150, 158], isCore: false,
                 jitter: random(1000), sizeK: random(0.7, 1.4), active: false });

  cap.big = document.querySelector('#cap .big');
  cap.sub = document.querySelector('#cap .sub');
  buildLandGrid();
  wireUI();

  // Test-/Direkt-Hook: ?land=Bayern&partei=CSU
  const q = new URLSearchParams(location.search);
  const L = q.get('land'), P = q.get('partei');
  if (L && getLand(L) && getLand(L).votes[P]) { selLand = L; selParty = P; startStorm(); }
  else showScreen('land');

  background(7, 8, 12);
}

/* ---------- Daten-Helfer ---------- */
function getLand(name) { return DATA.laender.find(l => l.name === name); }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function partiesOf(land) {  // [ [party, votes], ... ] absteigend
  return Object.entries(getLand(land).votes).sort((a, b) => b[1] - a[1]);
}

/* ---------- Screens (DOM) ---------- */
function showScreen(which) {
  state = which;
  document.getElementById('screen-land').classList.toggle('on', which === 'land');
  document.getElementById('screen-party').classList.toggle('on', which === 'party');
  const storm = which === 'storm';
  document.getElementById('menu').classList.toggle('on', storm);
  document.getElementById('panel').style.display = storm ? 'block' : 'none';
  document.getElementById('cap').style.opacity = storm ? '1' : '0';
}

function buildLandGrid() {
  const g = document.getElementById('land-grid');
  g.innerHTML = '';
  DATA.laender.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach(l => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `${l.name}<span class="sub">${l.beteiligung.toFixed(1).replace('.', ',')} % Beteiligung</span>`;
    b.onclick = () => { selLand = l.name; buildPartyGrid(); showScreen('party'); };
    g.appendChild(b);
  });
}

function buildPartyGrid() {
  document.getElementById('party-title').textContent = `${selLand} — wähle deine Partei`;
  const g = document.getElementById('party-grid');
  g.innerHTML = '';
  const shares = getLand(selLand).shares;
  partiesOf(selLand).forEach(([party, votes]) => {
    const b = document.createElement('button');
    b.className = 'btn party';
    const col = FARBEN[party] || '#ccc';
    const pct = shares[party] != null ? shares[party].toFixed(1).replace('.', ',') + ' %' : '';
    b.innerHTML = `<span class="dot" style="background:${col}"></span>
                   <span>${party}<span class="sub">${votes.toLocaleString('de-DE')} Stimmen · ${pct}</span></span>`;
    b.onclick = () => { selParty = party; startStorm(); };
    g.appendChild(b);
  });
}

function wireUI() {
  document.getElementById('party-back').onclick = () => showScreen('land');
  document.getElementById('menu-land').onclick = () => showScreen('land');
  document.getElementById('menu-party').onclick = () => { buildPartyGrid(); showScreen('party'); };
  const bind = (id, key, fmt, realloc) => {
    const s = document.getElementById(id);
    const vEl = document.getElementById('v-' + id.replace('s-', ''));
    s.value = params[key];
    const upd = () => { params[key] = parseFloat(s.value); vEl.textContent = fmt(params[key]);
                        if (realloc && state === 'storm') allocate(); };
    s.addEventListener('input', upd); upd();
  };
  bind('s-ppp', 'ppp', v => Math.round(v).toLocaleString('de-DE'), true);
  bind('s-core', 'core', v => v.toFixed(2) + '×', false);
  bind('s-orbit', 'orbit', v => v.toFixed(2) + '×', false);
  bind('s-sphere', 'sphere', v => v.toFixed(2) + '×', false);
}

/* ---------- Allokation ---------- */
function startStorm() {
  allocate();
  layout();
  for (const p of parts) if (p.active) { const s = spheres[p.sIdx];
    p.x = s.cx + cos(p.ang) * p.rad * s.R; p.y = s.cy + sin(p.ang) * p.rad * s.R; p.vx = p.vy = 0; }
  showScreen('storm');
  updateCaption();
}

function allocate() {
  const votes = getLand(selLand).votes;
  const ordered = partiesOf(selLand);                   // absteigend
  // gewählte Partei zuerst (Kern), dann Rest
  const list = [[selParty, votes[selParty]],
                ...ordered.filter(([p]) => p !== selParty)];
  let counts = list.map(([p, v]) => Math.max(2, Math.round(v / params.ppp)));
  let total = counts.reduce((a, b) => a + b, 0);
  if (total > MAXP) { const f = MAXP / total; counts = counts.map(c => Math.max(2, Math.floor(c * f))); }

  spheres = list.map(([party, v], i) => ({
    party, votes: v, n: counts[i], col: hexToRgb(FARBEN[party] || '#cccccc'),
    isCore: i === 0, cx: width / 2, cy: height / 2, R: 40,
  }));

  let k = 0;
  for (let si = 0; si < spheres.length; si++) {
    for (let c = 0; c < spheres[si].n && k < MAXP; c++, k++) {
      const p = parts[k];
      p.active = true; p.sIdx = si; p.isCore = spheres[si].isCore;
      p.col = spheres[si].col; p.ang = random(TWO_PI); p.rad = sqrt(random());
    }
  }
  for (; k < MAXP; k++) parts[k].active = false;
}

/* ---------- Geometrie je Frame (Regler wirken live) ---------- */
function layout() {
  const md = min(width, height);
  const cx = width / 2, cy = height * 0.40;
  const unit = md * 0.0045;
  const orbitR = md * 0.30 * params.orbit;
  const k = spheres.length - 1;                          // andere Parteien
  const rot = millis() * 0.00004;
  spheres.forEach((s, i) => {
    const scale = s.isCore ? params.core : params.sphere;
    s.R = constrain(unit * Math.sqrt(s.n) * scale, md * 0.015, md * 0.16);
    if (s.isCore) { s.cx = cx; s.cy = cy; }
    else {
      const a = -HALF_PI + ((i - 1) / k) * TWO_PI + rot;
      s.cx = cx + cos(a) * orbitR;
      s.cy = cy + sin(a) * orbitR;
    }
  });
}

/* ---------- Draw ---------- */
function draw() {
  noStroke();
  fill(7, 8, 12, state === 'storm' ? 34 : 255);
  rect(0, 0, width, height);
  if (state !== 'storm') return;

  layout();
  blendMode(ADD);
  for (const p of parts) {
    if (!p.active) continue;
    const s = spheres[p.sIdx];
    const aRot = frameCount * (p.isCore ? 0.004 : 0.002);
    const tx = s.cx + cos(p.ang + aRot) * p.rad * s.R;
    const ty = s.cy + sin(p.ang + aRot) * p.rad * s.R;
    const stiff = p.isCore ? 0.05 : 0.04;
    p.vx += (tx - p.x) * stiff; p.vy += (ty - p.y) * stiff;
    const nA = noise(p.x * 0.0013, p.y * 0.0013, frameCount * 0.003 + p.jitter) * TWO_PI * 2;
    p.vx += cos(nA) * 0.3; p.vy += sin(nA) * 0.3;
    p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy;

    const c = p.col, k = p.sizeK;
    if (p.isCore) {
      fill(c[0], c[1], c[2], 14); circle(p.x, p.y, 17 * k);
      fill(c[0], c[1], c[2], 40); circle(p.x, p.y, 6.5 * k);
      fill(c[0], c[1], c[2], 110); circle(p.x, p.y, 2.6 * k);
    } else {
      fill(c[0], c[1], c[2], 12); circle(p.x, p.y, 12 * k);
      fill(c[0], c[1], c[2], 60); circle(p.x, p.y, 3.2 * k);
    }
  }
  blendMode(BLEND);
}

function updateCaption() {
  const v = getLand(selLand).votes[selParty];
  cap.big.textContent = `${selParty} in ${selLand}`;
  cap.sub.textContent =
    `${v.toLocaleString('de-DE')} Zweitstimmen · 1 Partikel ≈ ${Math.round(params.ppp).toLocaleString('de-DE')} Wähler`;
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
