/* 06 · Drei Welten — 0 % ⟷ wie heute ⟷ 100 %
   p5.js · Ausstellungs-Loop
   Eine einzige Partikelwelt wandert durch drei Zustände der Beteiligung:
     0 %        → alle Partikel grau, verstreut in einem Ring   (totale Verdrossenheit)
     ~82,5 %    → so wie heute in Deutschland (BTW 2025)         (Realität)
     100 %      → alle Partikel hell & parteifarben im Kern      (volle Teilhabe)
   Jeder Partikel hat eine Schwelle und wandert beim Überschreiten von außen
   (grau, Ring) nach innen (hell, parteifarben, Kern).                                 */

const N = 2200;
const HOLD = 4.0;           // Sekunden Verweilen je Zustand (Schrift gut lesbar)
const MORPH = 3.5;          // Sekunden Übergang zwischen Zuständen
const GREY = [150, 150, 158];

let DATA, FARBEN, parts = [];
let ER = 0.825;             // reale Beteiligung DE (aus data.json)
let t0 = 0;                 // Startzeit (s)
let cap = {};
// optionaler Test-/Standbild-Hook: ?e=0..1 friert die Beteiligung fest ein
const _p = new URLSearchParams(location.search);
const FORCE_E = _p.has('e') ? Math.max(0, Math.min(1, parseFloat(_p.get('e')))) : null;

function preload() { DATA = loadJSON('../data.json'); }

function setup() {
  createCanvas(windowWidth, windowHeight);
  FARBEN = DATA.farben;
  ER = DATA.bund.beteiligung / 100;          // reale Beteiligung (BTW 2025)
  cap.big  = document.querySelector('#cap .big');
  cap.pole = document.querySelector('#cap .pole');

  // nationale Parteiverteilung -> feste Parteifarbe je Partikel (gewichtet)
  const shares = DATA.bund.shares;
  for (let i = 0; i < N; i++) {
    const party = sampleParty(shares);
    parts.push({
      x: width / 2, y: height / 2, vx: 0, vy: 0,
      ca: random(TWO_PI), cr: sqrt(random()),     // Kern-Platzierung (Scheibe)
      ra: random(TWO_PI), rk: random(),           // Ring-Platzierung (Annulus)
      th: random(),                               // Schwelle: ab welcher Beteiligung wählt er
      pc: hexToRgb(FARBEN[party] || '#cccccc'),
      sizeK: random(0.7, 1.5), jitter: random(1000),
    });
  }
  seedPositions();
  background(7, 8, 12);
}

function sampleParty(shares) {
  const e = Object.entries(shares);
  const sum = e.reduce((s, x) => s + x[1], 0) || 1;
  let r = random(sum);
  for (const [p, v] of e) { r -= v; if (r <= 0) return p; }
  return e[0][0];
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function ss(a, b, x) { x = constrain((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

function geom() {
  const md = min(width, height);
  // kleiner + höher gesetzt: unteres Drittel bleibt frei für die Schrift
  return { cx: width / 2, cy: height * 0.40,
           coreR: md * 0.16, ringIn: md * 0.22, ringOut: md * 0.31 };
}

function seedPositions(E) {
  if (E === undefined) E = FORCE_E !== null ? FORCE_E : 0;
  const g = geom();
  for (const p of parts) {              // Position passend zur Beteiligung E
    const vn = ss(p.th - 0.10, p.th + 0.10, E);
    const cRad = p.cr * g.coreR, rRad = lerp(g.ringIn, g.ringOut, p.rk);
    const cx = g.cx + cos(p.ca) * cRad, cy = g.cy + sin(p.ca) * cRad;
    const rx = g.cx + cos(p.ra) * rRad, ry = g.cy + sin(p.ra) * rRad;
    p.x = lerp(rx, cx, vn); p.y = lerp(ry, cy, vn);
    p.vx = 0; p.vy = 0;
  }
}

function engagement(tSec) {
  if (FORCE_E !== null) return FORCE_E;          // eingefroren (Test/Standbild)
  // Timeline: 0% -> wie heute -> 100% -> wie heute -> (Schleife), je mit Verweilen
  const seq = [0, ER, 1, ER];
  const step = MORPH + HOLD;
  const tt = (tSec % (seq.length * step));
  const i = Math.floor(tt / step);
  const local = tt - i * step;
  const from = seq[(i - 1 + seq.length) % seq.length];
  const to = seq[i];
  if (local < MORPH) return lerp(from, to, ss(0, 1, local / MORPH));
  return to;                                     // Halten (Schrift lesbar)
}

function draw() {
  noStroke();
  fill(7, 8, 12, 32); rect(0, 0, width, height);

  if (t0 === 0) t0 = millis() / 1000;
  const tSec = millis() / 1000 - t0;
  const E = engagement(tSec);
  const g = geom();
  const rot = frameCount * 0.004;
  const ringRot = tSec * 0.06;

  blendMode(ADD);
  for (const p of parts) {
    const vn = ss(p.th - 0.10, p.th + 0.10, E);   // 0 = grauer Ring, 1 = heller Kern

    // Zielpositionen
    const cAng = p.ca + rot + p.cr * 0.6;
    const cRad = p.cr * g.coreR * (0.9 + 0.1 * sin(frameCount * 0.02 + p.jitter));
    const cx = g.cx + cos(cAng) * cRad, cy = g.cy + sin(cAng) * cRad;
    const rAng = p.ra + ringRot * (0.5 + 0.4 * p.rk);
    const rRad = lerp(g.ringIn, g.ringOut, p.rk) + sin(frameCount * 0.01 + p.jitter) * 6;
    const rx = g.cx + cos(rAng) * rRad, ry = g.cy + sin(rAng) * rRad;

    const tx = lerp(rx, cx, vn), ty = lerp(ry, cy, vn);
    const stiff = lerp(0.030, 0.045, vn);
    p.vx += (tx - p.x) * stiff;
    p.vy += (ty - p.y) * stiff;
    const nA = noise(p.x * 0.0012, p.y * 0.0012, frameCount * 0.003 + p.jitter) * TWO_PI * 2;
    const nf = lerp(0.6, 0.25, vn);
    p.vx += cos(nA) * nf; p.vy += sin(nA) * nf;
    p.vx *= 0.82; p.vy *= 0.82;
    p.x += p.vx; p.y += p.vy;

    const s = p.sizeK;
    // matter grauer Anteil (verblasst beim Hineinwählen)
    const mA = 30 * (1 - vn) + 6;
    fill(GREY[0], GREY[1], GREY[2], mA); circle(p.x, p.y, (9 * s) * (0.8 + 0.2 * (1 - vn)));
    // heller, parteifarbener Anteil (wächst beim Hineinwählen)
    if (vn > 0.02) {
      const c = p.pc;
      fill(c[0], c[1], c[2], 12 * vn); circle(p.x, p.y, 16 * s);
      fill(c[0], c[1], c[2], 34 * vn); circle(p.x, p.y, 6 * s);
      fill(c[0], c[1], c[2], 95 * vn); circle(p.x, p.y, 2.6 * s);
    }
  }
  blendMode(BLEND);

  updateCaption(E);
}

function updateCaption(E) {
  const pct = (E * 100).toFixed(E > 0.001 && E < 0.999 && Math.abs(E - ER) < 0.02 ? 1 : 0);
  cap.big.textContent = `Wahlbeteiligung ${pct.replace('.', ',')} %`;
  if (E < 0.02)                     cap.pole.textContent = 'Niemand wählt — totale Verdrossenheit';
  else if (E > 0.98)                cap.pole.textContent = 'Alle wählen — volle Teilhabe';
  else if (Math.abs(E - ER) < 0.02) cap.pole.textContent = 'So wie heute — Bundestagswahl 2025';
  else                              cap.pole.textContent = '…';
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); seedPositions(); }
