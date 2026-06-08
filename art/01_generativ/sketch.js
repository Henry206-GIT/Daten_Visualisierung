// Der zerfallende Souverän — generative political art
// Each particle = a fraction of the electorate.
// Voters cohere in a luminous flowing body; non-voters drift and erode outward.

'use strict';

const PARTICLE_COUNT = 3000;
const LAND_DURATION   = 9000;  // ms per Bundesland
const MORPH_DURATION  = 2200;  // ms crossfade between Länder
const FLOW_SCALE      = 0.0022;
const FLOW_SPEED      = 0.00016;
const ASH_COLOR       = '#5a5a5a';

let data;
let particles = [];
let landIndex  = 0;
let landTimer  = 0;
let morphT     = 1;        // 0..1; 1 = settled, 0..1 = morphing in
let captionAlpha = 0;

// ─── setup ───────────────────────────────────────────────────────────────────
function preload() {
  // nothing — we fetch manually so we can handle errors gracefully
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(RGB, 255, 255, 255, 255);
  textFont('Georgia, "Times New Roman", serif');
  noStroke();

  fetch('../data.json')
    .then(r => r.json())
    .then(json => {
      data = json;
      spawnParticles();
      applyLand(landIndex, true);
    })
    .catch(err => console.error('data.json load failed:', err));
}

// ─── windowResized ───────────────────────────────────────────────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ─── particle factory ────────────────────────────────────────────────────────
function spawnParticles() {
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: random(width),
      y: random(height),
      vx: 0,
      vy: 0,
      // target state (set by applyLand)
      isVoter: true,
      prevIsVoter: true,
      col: color(230),
      // prev state for lerp
      prevCol: color(230),
      // individual phase offset for breathing
      phase: random(TWO_PI),
      // orbit angle
      angle: random(TWO_PI),
      orbitR: random(0.15, 0.85),   // normalized radius multiplier — tighter cluster
      // noise seed offset
      nOff: random(1000),
      // ash drift direction (unit vector) — true radial set on applyLand
      driftX: random(-1, 1),
      driftY: random(-1, 1),
      // random size multiplier for variety
      sizeK: random(0.7, 1.6),
    });
    // normalize drift
    let p = particles[particles.length - 1];
    let dlen = Math.hypot(p.driftX, p.driftY) || 1;
    p.driftX /= dlen;
    p.driftY /= dlen;
  }
}

// ─── assign roles for a given Land ───────────────────────────────────────────
function applyLand(idx, instant) {
  if (!data) return;
  const land = data.laender[idx];
  const beteiligung = land.beteiligung / 100;  // fraction who voted
  const shares = land.shares;

  // build cumulative distribution for party sampling
  const totalShare = Object.values(shares).reduce((s, v) => s + v, 0);
  const cdf = [];
  let acc = 0;
  for (const [party, pct] of Object.entries(shares)) {
    acc += pct / totalShare;
    cdf.push({ thresh: acc, party });
  }

  const cx = width  * 0.5;
  const cy = height * 0.5;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    // save previous state for morph lerp
    p.prevCol    = p.col;
    p.prevIsVoter = p.isVoter;

    const roll = (i + 0.5) / particles.length;  // deterministic so morph is stable
    p.isVoter = roll < beteiligung;

    if (p.isVoter) {
      // sample party by second roll (use particle index hash)
      const r2 = fract(Math.sin(i * 127.1 + idx * 311.7) * 43758.5453);
      let party = cdf[cdf.length - 1].party;
      for (const entry of cdf) {
        if (r2 < entry.thresh) { party = entry.party; break; }
      }
      const hex = data.farben[party] || '#ffffff';
      p.col = hexToColor(hex);
    } else {
      p.col = hexToColor(ASH_COLOR);
      // Set outward drift from center — radial direction from current position
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dlen = Math.hypot(dx, dy) || 1;
      p.driftX = dx / dlen;
      p.driftY = dy / dlen;
    }

    if (instant) {
      p.prevCol     = p.col;
      p.prevIsVoter = p.isVoter;
    }
  }

  if (!instant) {
    morphT = 0;
  }
}

function fract(x) { return x - Math.floor(x); }

function hexToColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return color(r, g, b);
}

// ─── draw ────────────────────────────────────────────────────────────────────
function draw() {
  if (!data) {
    // pre-load placeholder — dark screen
    background(7, 8, 12);
    return;
  }

  const dt = deltaTime;
  landTimer += dt;

  // advance Land cycle
  if (landTimer > LAND_DURATION) {
    landTimer = 0;
    landIndex = (landIndex + 1) % data.laender.length;
    applyLand(landIndex, false);
    captionAlpha = 0;  // fade caption back in
  }

  // ease morph
  if (morphT < 1) {
    morphT = min(1, morphT + dt / MORPH_DURATION);
  }

  // fade caption in after morph
  if (morphT > 0.6) {
    captionAlpha = min(255, captionAlpha + dt * 0.18);
  }

  // trail — dark translucent rect for smoky persistence effect
  blendMode(BLEND);
  fill(7, 8, 12, 22);
  rect(0, 0, width, height);

  // additive glow layer — everything drawn here blooms where it overlaps
  blendMode(ADD);

  const t = millis() * FLOW_SPEED;
  const cx = width  * 0.5;
  const cy = height * 0.5;
  // Body radius: compact enough that voters cluster visibly
  const bodyR = min(width, height) * 0.18;
  // Breathing pulse: slow, deep, readable as a living form
  const bodyBreathe = 1 + 0.18 * sin(t * 30);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // lerp colour between previous and current Land
    const r = lerp(red(p.prevCol),   red(p.col),   morphT);
    const g = lerp(green(p.prevCol), green(p.col), morphT);
    const b = lerp(blue(p.prevCol),  blue(p.col),  morphT);
    const isVoterNow = morphT > 0.5 ? p.isVoter : p.prevIsVoter;

    if (isVoterNow) {
      // ── VOTER: Perlin flow + strong pull toward luminous central body ──

      const nx = p.x * FLOW_SCALE + t;
      const ny = p.y * FLOW_SCALE + t * 0.7 + p.nOff;
      const flowAngle = noise(nx, ny) * TWO_PI * 2;
      const flowX = cos(flowAngle);
      const flowY = sin(flowAngle);

      // Strong centripetal attraction — hold voters inside the body
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.hypot(dx, dy);
      // Target orbit radius breathes slowly; inner particles stay close
      const targetDist = bodyR * p.orbitR * bodyBreathe * (0.9 + 0.1 * sin(t * 9 + p.phase));
      const radial = (dist - targetDist) * 0.018;  // stronger than before

      p.vx += flowX * 0.35 + (dx / (dist + 1)) * radial;
      p.vy += flowY * 0.35 + (dy / (dist + 1)) * radial;
      // Stronger damping keeps them from escaping
      p.vx *= 0.84;
      p.vy *= 0.84;
      p.x  += p.vx;
      p.y  += p.vy;

      // Proximity to center: 0 at edge, 1 at center
      const proximity = max(0, 1 - dist / (bodyR * 2.2));

      // Per-particle slow breathe for organic feel
      const pBreathe = 1 + 0.25 * sin(t * 18 + p.phase);

      // Size: larger core for central particles; minimum visible on screen
      const coreR  = (3.5 + proximity * 4.0) * p.sizeK * pBreathe;
      const haloR  = coreR * 5.5;
      const halo2R = coreR * 11.0;

      // Boost brightness toward center — this creates the glow bloom
      const coreAlpha  = lerp(130, 255, proximity);
      const haloAlpha  = lerp(22,  65,  proximity);
      const halo2Alpha = lerp(5,   18,  proximity);

      // Outer atmospheric halo — very faint, large bloom
      fill(r, g, b, halo2Alpha);
      circle(p.x, p.y, halo2R);

      // Mid halo
      fill(r, g, b, haloAlpha);
      circle(p.x, p.y, haloR);

      // Bright core
      fill(r, g, b, coreAlpha);
      circle(p.x, p.y, coreR);

    } else {
      // ── NICHTWÄHLER: drift outward from center, fade toward edges, no wrap ──

      // Outward radial bias + subtle noise wobble
      const edgePull = 0.022;
      p.vx += p.driftX * edgePull;
      p.vy += p.driftY * edgePull;

      const nx = p.x * FLOW_SCALE * 0.5 + t * 0.4;
      const ny = p.y * FLOW_SCALE * 0.5 + t * 0.3 + p.nOff;
      const a2 = noise(nx, ny) * TWO_PI * 2;
      p.vx += cos(a2) * 0.06;
      p.vy += sin(a2) * 0.06;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.x  += p.vx;
      p.y  += p.vy;

      // When ash reaches the screen edge, re-seed near the body so
      // there is always a visible cloud dispersing outward
      if (p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40) {
        // Re-spawn near the center body, pointing outward
        const spawnAngle = random(TWO_PI);
        const spawnR     = bodyR * random(0.3, 0.7);
        p.x  = cx + cos(spawnAngle) * spawnR;
        p.y  = cy + sin(spawnAngle) * spawnR;
        p.vx = 0;
        p.vy = 0;
        // Set drift direction: outward from spawn point
        const ddx = p.x - cx;
        const ddy = p.y - cy;
        const dlen2 = Math.hypot(ddx, ddy) || 1;
        p.driftX = ddx / dlen2;
        p.driftY = ddy / dlen2;
      }

      // Distance from center → fade out completely near screen edge
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.hypot(dx, dy);
      const maxDist = Math.hypot(cx, cy);
      // Alpha drops to zero as ash reaches screen corners
      const alphaMult = max(0, 1 - dist / (maxDist * 0.9));

      // Small particles, low alpha, clearly dim grey — no glow halo
      const ashSize = (1.6 + p.sizeK * 0.8);
      fill(r, g, b, 70 * alphaMult);
      circle(p.x, p.y, ashSize);
    }
  }

  // ── Caption ───────────────────────────────────────────────────────────────
  blendMode(BLEND);
  const land = data.laender[landIndex];
  const betStr = land.beteiligung.toFixed(1).replace('.', ',') + ' %';

  const capA = captionAlpha * (morphT < 0.5 ? morphT * 2 : 1);
  if (capA > 2) {
    fill(255, 255, 255, capA * 0.55);
    textSize(max(13, height * 0.018));
    textStyle(NORMAL);
    textAlign(LEFT, BOTTOM);
    text(land.name, 38, height - 44);

    fill(255, 255, 255, capA * 0.32);
    textSize(max(10, height * 0.013));
    text('Wahlbeteiligung ' + betStr, 38, height - 22);
  }
}
