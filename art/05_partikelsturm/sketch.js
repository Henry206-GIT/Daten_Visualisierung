/* 05 · Kern & Verdrossenheit — Partikelsturm
   p5.js · Ausstellungs-Loop
   Heller, zusammengehöriger Leuchtkern (Wähler, parteifarben) in der Mitte;
   drumherum ein matter, dämmriger Partikelring = Politikverdrossenheit (Nichtwähler).
   Wechselt langsam durch die 16 Bundesländer.                                      */

const N = 2200;             // Partikel gesamt (geringere Dichte -> Parteifarben bleiben sichtbar)
const HOLD = 9.0;           // Sekunden je Bundesland
const MORPH = 2.4;          // Sekunden Übergang

let DATA, REGIONS, FARBEN;
let parts = [];
let idx = 0, tHold = 0, morphT = 1;   // morphT 1 = Ruhe, läuft 0->1
let ringPhase = 0;
const cap = { el: null, land: null, sub: null };

function preload() { DATA = loadJSON('../data.json'); }

function setup() {
  createCanvas(windowWidth, windowHeight);
  FARBEN = DATA.farben;
  // Reihenfolge: Bund zuerst, dann Länder alphabetisch
  REGIONS = [DATA.bund, ...DATA.laender].filter(r => r && r.beteiligung != null);
  cap.el = document.getElementById('cap');
  cap.land = cap.el.querySelector('.land');
  cap.sub  = cap.el.querySelector('.sub');

  for (let i = 0; i < N; i++) {
    parts.push({
      x: width / 2, y: height / 2, vx: 0, vy: 0,
      // Kern-Platzierung (gaußsche Scheibe)
      ca: random(TWO_PI), cr: sqrt(random()) * random(0.4, 1),
      // Ring-Platzierung
      ra: random(TWO_PI), rk: random(),
      jitter: random(1000),
      sizeK: random(0.7, 1.5),
      role: 'ring', col: [120, 120, 120], a: 0,
      proleColor: [120, 120, 120], prevRole: 'ring',
    });
  }
  assignRegion(0, true);
  seedPositions();          // Partikel sofort an ihre Zielform setzen (Frame 0 fertig)
  background(7, 8, 12);
}

// Startpositionen = natürliche Zielgeometrie, damit das Bild ab Frame 0 geformt ist
function seedPositions() {
  const cx = width / 2, cy = height / 2, md = min(width, height);
  const coreR = md * 0.25, ringIn = md * 0.34, ringOut = md * 0.48;
  for (const p of parts) {
    let ang, rad;
    if (p.role === 'core') { ang = p.ca; rad = p.cr * coreR; }
    else { ang = p.ra; rad = lerp(ringIn, ringOut, p.rk); }
    p.x = cx + cos(ang) * rad;
    p.y = cy + sin(ang) * rad;
    p.vx = 0; p.vy = 0;
  }
}

// Partei-CDF -> zufällige Parteifarbe gewichtet nach Stimmenanteil
function sampleParty(shares) {
  const entries = Object.entries(shares);
  const sum = entries.reduce((s, e) => s + e[1], 0) || 1;
  let r = random(sum);
  for (const [p, v] of entries) { r -= v; if (r <= 0) return p; }
  return entries[0][0];
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function assignRegion(i, instant) {
  const reg = REGIONS[i];
  const coreN = Math.round(N * (reg.beteiligung / 100));   // Wähler = Kern
  for (let k = 0; k < N; k++) {
    const p = parts[k];
    p.prevRole = p.role;
    p.proleColor = p.col;
    if (k < coreN) {
      p.role = 'core';
      const party = sampleParty(reg.shares);
      const c = hexToRgb(FARBEN[party] || '#cccccc');
      p.col = c;
    } else {
      p.role = 'ring';
      p.col = hexToRgb(FARBEN['Nichtwähler']);   // mattes Grau
    }
  }
  morphT = instant ? 1 : 0;
  // Caption
  cap.land.textContent = reg.name;
  const b = reg.beteiligung.toFixed(1).replace('.', ',');
  const v = (100 - reg.beteiligung).toFixed(1).replace('.', ',');
  cap.sub.textContent = `Wahlbeteiligung ${b} %  ·  Verdrossenheit ${v} %`;
  cap.el.style.opacity = '0';
  setTimeout(() => { cap.el.style.opacity = '0.92'; }, 400);
}

function draw() {
  // weicher dunkler Schleier für Spuren
  noStroke();
  fill(7, 8, 12, 30);
  rect(0, 0, width, height);

  const dt = deltaTime / 1000;
  tHold += dt;
  if (tHold > HOLD) { tHold = 0; idx = (idx + 1) % REGIONS.length; assignRegion(idx); }
  if (morphT < 1) morphT = min(1, morphT + dt / MORPH);
  const ease = morphT * morphT * (3 - 2 * morphT);
  ringPhase += dt * 0.10;

  const cx = width / 2 + (noise(frameCount * 0.0015, 11) - 0.5) * width * 0.04;
  const cy = height / 2 + (noise(frameCount * 0.0015, 71) - 0.5) * height * 0.04;
  const md = min(width, height);
  const coreR = md * 0.25;
  const ringIn = md * 0.34;
  const ringOut = md * 0.48;

  blendMode(ADD);
  for (let k = 0; k < N; k++) drawParticle(parts[k], cx, cy, coreR, ringIn, ringOut, ease);
  blendMode(BLEND);
}

function drawParticle(p, cx, cy, coreR, ringIn, ringOut, ease) {
  let tx, ty, isCore = p.role === 'core';

  if (isCore) {
    // sanft rotierende, zusammenhängende Scheibe — "gehören zusammen"
    const ang = p.ca + frameCount * 0.004 + p.cr * 0.6;
    const rad = p.cr * coreR * (0.9 + 0.1 * sin(frameCount * 0.02 + p.jitter));
    tx = cx + cos(ang) * rad;
    ty = cy + sin(ang) * rad;
  } else {
    // matter Ring: langsam kreisend, leichtes Atmen
    const ang = p.ra + ringPhase * (0.4 + 0.3 * p.rk);
    const rad = lerp(ringIn, ringOut, p.rk) + sin(frameCount * 0.01 + p.jitter) * 6;
    tx = cx + cos(ang) * rad;
    ty = cy + sin(ang) * rad;
  }

  // Federkraft zum Ziel (+ Strömungs-Jitter)
  const stiff = isCore ? 0.045 : 0.030;
  p.vx += (tx - p.x) * stiff;
  p.vy += (ty - p.y) * stiff;
  const nA = noise(p.x * 0.0012, p.y * 0.0012, frameCount * 0.003 + p.jitter) * TWO_PI * 2;
  const nf = isCore ? 0.25 : 0.6;
  p.vx += cos(nA) * nf;
  p.vy += sin(nA) * nf;
  p.vx *= 0.82; p.vy *= 0.82;
  p.x += p.vx; p.y += p.vy;

  // Farbe morpht beim Rollenwechsel
  const c = [
    lerp(p.proleColor[0], p.col[0], ease),
    lerp(p.proleColor[1], p.col[1], ease),
    lerp(p.proleColor[2], p.col[2], ease),
  ];

  if (isCore) {
    // hell, aber parteifarben sichtbar: farbiger Halo + farbiger Kern + kleiner weißer Funke
    const s = p.sizeK;
    fill(c[0], c[1], c[2], 12); circle(p.x, p.y, 16 * s);
    fill(c[0], c[1], c[2], 34); circle(p.x, p.y, 6 * s);
    fill(c[0], c[1], c[2], 95); circle(p.x, p.y, 2.6 * s);
  } else {
    // matt: weicher, dämmriger Punkt, niedrige Helligkeit
    const s = p.sizeK;
    fill(c[0], c[1], c[2], 26); circle(p.x, p.y, 9 * s);
    fill(150, 150, 158, 34);    circle(p.x, p.y, 3 * s);
  }
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
