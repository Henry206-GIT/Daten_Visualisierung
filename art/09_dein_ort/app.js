/* 09 · Dein Ort — Kiosk-Installation
   Umfrage (Alter → Partei → Wohnort) → Partikelflug auf den Globus →
   Landung an den eigenen Koordinaten → Explorations-Modus mit Besucher-Heatmap.
   Schwarz/Weiß, globe.gl. Besucherdaten: localStorage pro Kiosk-Rechner. */
(async function () {
  'use strict';

  // ---------- Parameter / Dev-Hooks ----------
  const Q = new URLSearchParams(location.search);
  const FAST = Q.has('fast') ? 10 : 1;
  const IDLE_MS = (Q.has('idle') ? +Q.get('idle') : 60) * 1000;
  const FLY1 = 2800 / FAST;          // global → Deutschland-Rahmen
  const FLY2 = 4000 / FAST;          // Abtauchen zum Ort
  const FLY_TOTAL = FLY1 + FLY2 + 300 / FAST;
  const STORE_KEY = 'viz09_besucher_v1';
  const STORE_CAP = 5000;
  const SEED_DIVISOR = 40000;        // 1 Seed-Punkt je 40k Zweitstimmen (~1200 gesamt)
  const START_POV = { lat: 0, lng: 10, altitude: 2.6 }; // lat>0 verschiebt Globus im Headless nach unten
  const GERMANY_POV = { lat: 51.2, lng: 10.45, altitude: 2.1 };

  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- Daten laden ----------
  const [world, laenderGeo, data, plzMap] = await Promise.all([
    fetch('world.geojson').then(r => r.json()),
    fetch('../geo_bundeslaender.json').then(r => r.json()),
    fetch('../data.json').then(r => r.json()),
    fetch('plz.json').then(r => r.json()),
  ]);

  const landByName = {};
  for (const l of data.laender) landByName[l.name] = l;

  // ---------- Geometrie-Helfer ----------
  function featureRings(f) {
    const g = f.geometry;
    return g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
  }
  function featureCentroid(f) {
    let best = null;
    for (const ring of featureRings(f)) if (!best || ring.length > best.length) best = ring;
    let sx = 0, sy = 0;
    for (const [lng, lat] of best) { sx += lng; sy += lat; }
    return { lat: sy / best.length, lng: sx / best.length };
  }
  function featureBBox(f) {
    let w = 180, e = -180, s = 90, n = -90;
    for (const ring of featureRings(f)) for (const [lng, lat] of ring) {
      if (lng < w) w = lng; if (lng > e) e = lng;
      if (lat < s) s = lat; if (lat > n) n = lat;
    }
    return { w, e, s, n };
  }

  const landGeom = {}; // name -> {centroid, bbox}
  for (const f of laenderGeo.features) {
    f.properties.__de = true;
    landGeom[f.properties.name] = { centroid: featureCentroid(f), bbox: featureBBox(f) };
  }
  const features = world.features
    .filter(f => f.properties.ISO_A3 !== 'DEU')
    .concat(laenderGeo.features);

  // ---------- Architektur-Grid (Lat/Lng-Linien alle 15°) ----------
  const grid = [];
  for (let lat = -75; lat <= 75; lat += 15) {
    const p = []; for (let lng = -180; lng <= 180; lng += 5) p.push([lat, lng]);
    grid.push(p);
  }
  for (let lng = -180; lng < 180; lng += 15) {
    const p = []; for (let lat = -85; lat <= 85; lat += 5) p.push([lat, lng]);
    grid.push(p);
  }

  // ---------- Heat-Farbskala (blau=kalt → rot=heiß, wie #legend-Gradient) ----------
  const HEAT_STOPS = [
    [0x31, 0x36, 0x95], [0x45, 0x75, 0xb4], [0x74, 0xad, 0xd1],
    [0xfe, 0xe0, 0x90], [0xf4, 0x6d, 0x43], [0xa5, 0x00, 0x26],
  ];
  function heatColor(t, alpha) {
    const x = Math.max(0, Math.min(1, t)) * (HEAT_STOPS.length - 1);
    const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
    const f = x - i;
    const c = HEAT_STOPS[i].map((v, k) => Math.round(v + (HEAT_STOPS[i + 1][k] - v) * f));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }
  // Normierung: max. Zellgewicht der aktuellen Filterung über grobes 0,5°-Raster schätzen
  let heatCap = 10;
  function calcCap(pts) {
    const m = new Map(); let max = 0;
    for (const p of pts) {
      const k = Math.round(p.lat * 2) + ',' + Math.round(p.lng * 2);
      const v = (m.get(k) || 0) + p.w;
      m.set(k, v); if (v > max) max = v;
    }
    return Math.max(4, max);
  }
  const heatT = w => Math.min(1, Math.log1p(w) / Math.log1p(heatCap));

  // ---------- Globus ----------
  let hovered = null;
  const globe = Globe()(document.getElementById('globe'))
    .width(innerWidth).height(innerHeight)
    .backgroundColor('#000000')
    .showAtmosphere(false)
    .showGraticules(false)
    .pathsData(grid)
    .pathColor(() => 'rgba(255,255,255,0.10)')
    .pathTransitionDuration(0)
    .polygonsData(features)
    .polygonCapColor(() => 'rgba(0,0,0,0.88)')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    // Achtung: rgba-Strokes rendern als Punktstaub (transparente Lines) — opak halten
    .polygonStrokeColor(f => f.properties.__de
      ? (f === hovered ? '#ffffff' : '#ececec')
      : '#4a4a4a')
    .polygonAltitude(f => f === hovered ? 0.012 : 0.006)
    .polygonLabel(null)
    .polygonsTransitionDuration(300)
    // "Heatmap" als H3-HexBins: KDE-heatmapsLayer rendert auf schwachen GPUs nicht (WebGPU-Fallback)
    .hexBinPointLat(p => p.lat)
    .hexBinPointLng(p => p.lng)
    .hexBinPointWeight(p => p.w)
    .hexBinResolution(3)
    .hexMargin(0.2)
    .hexAltitude(d => 0.003 + heatT(d.sumWeight) * 0.05)
    .hexTopColor(d => heatColor(heatT(d.sumWeight), 0.95))
    .hexSideColor(d => heatColor(heatT(d.sumWeight), 0.5))
    .hexTransitionDuration(2500 / FAST)
    .htmlAltitude(0.012)
    .htmlElement(() => {
      const el = document.createElement('div');
      el.className = 'visitor-dot';
      return el;
    })
    .htmlElementVisibilityModifier((el, vis) => { el.style.opacity = vis ? 1 : 0; });
  globe.globeMaterial().color.set('#000000');
  globe.pointOfView(START_POV, 0);
  addEventListener('resize', () => globe.width(innerWidth).height(innerHeight));

  // ---------- Besucher-Speicher + Seed ----------
  const BRACKETS = [
    { label: '16–24', min: 16, max: 24, w: 0.10 },
    { label: '25–34', min: 25, max: 34, w: 0.13 },
    { label: '35–49', min: 35, max: 49, w: 0.24 },
    { label: '50–64', min: 50, max: 64, w: 0.26 },
    { label: '65–74', min: 65, max: 74, w: 0.15 },
    { label: '75+',   min: 75, max: 120, w: 0.12 },
  ];
  const bracketOf = age => BRACKETS.find(b => age >= b.min && age <= b.max) || BRACKETS[5];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // deterministischer Seed aus echten BTW-2025-Zweitstimmen (nie gespeichert)
  function buildSeed() {
    const rng = mulberry32(20250223);
    const gauss = () => (rng() + rng() + rng() + rng() - 2) / 2 * 1.6; // ~N(0,~0.45)
    const pickBracket = () => {
      let r = rng();
      for (const b of BRACKETS) { r -= b.w; if (r <= 0) return b; }
      return BRACKETS[0];
    };
    const pts = [];
    for (const land of data.laender) {
      const geom = landGeom[land.name];
      if (!geom) continue;
      const { centroid, bbox } = geom;
      for (const [party, votes] of Object.entries(land.votes)) {
        const n = Math.round(votes / SEED_DIVISOR);
        for (let i = 0; i < n; i++) {
          const lat = Math.min(bbox.n, Math.max(bbox.s, centroid.lat + gauss() * 0.45));
          const lng = Math.min(bbox.e, Math.max(bbox.w, centroid.lng + gauss() * 0.6));
          pts.push({ lat, lng, w: 1, party, state: land.name, bracket: pickBracket().label });
        }
      }
    }
    return pts;
  }

  function loadVisitors() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveVisitor(v) {
    const arr = loadVisitors();
    arr.push(v);
    while (arr.length > STORE_CAP) arr.shift();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch (e) { /* voll */ }
  }
  const visitorPoint = v =>
    ({ lat: v.lat, lng: v.lng, w: 3, party: v.party, state: v.state, bracket: bracketOf(v.age).label });

  const seedPts = buildSeed();
  const heatPoints = () => seedPts.concat(loadVisitors().map(visitorPoint));

  // ---------- Filter (Default = eigene Antworten, Menü oben rechts) ----------
  const filter = { age: 'Alle', party: 'Alle' };
  const matchesFilter = p =>
    (filter.age === 'Alle' || p.bracket === filter.age) &&
    (filter.party === 'Alle' || p.party === filter.party);
  const filterLabel = () =>
    `${filter.age === 'Alle' ? 'alle Altersgruppen' : filter.age + ' Jahre'} · ` +
    `${filter.party === 'Alle' ? 'alle Parteien' : filter.party}`;

  function applyFilter() {
    const pts = heatPoints().filter(matchesFilter);
    heatCap = calcCap(pts);
    globe.hexBinPointsData(pts);
    if (detailLand) renderDetail(detailLand);
  }

  function mkOpts(id, values, key) {
    const box = document.getElementById(id);
    box.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button');
      b.textContent = v;
      b.dataset.v = v;
      b.addEventListener('click', () => { filter[key] = v; syncMenu(); applyFilter(); });
      box.appendChild(b);
    }
  }
  function syncMenu() {
    for (const [id, key] of [['f-age', 'age'], ['f-party', 'party']])
      for (const b of document.getElementById(id).children)
        b.classList.toggle('on', b.dataset.v === filter[key]);
  }
  mkOpts('f-age', ['Alle'].concat(BRACKETS.map(b => b.label)), 'age');
  mkOpts('f-party', ['Alle'].concat(data.parteien), 'party');

  function setFilterFromVisitor() {
    filter.age = visitor ? bracketOf(visitor.age).label : 'Alle';
    filter.party = (visitor && data.parteien.includes(visitor.party)) ? visitor.party : 'Alle';
    syncMenu();
  }

  // ---------- Orts-Auflösung (PLZ / Ortsname / Bundesland) ----------
  const placeIndex = []; // [lowerName, anzeige, plzKey|null, landName|null]
  for (const [plz, e] of Object.entries(plzMap))
    placeIndex.push([e[2].toLowerCase(), `${e[2]} (${plz})`, plz, null]);
  for (const name of Object.keys(landGeom))
    placeIndex.push([name.toLowerCase(), name, null, name]);

  function entryFor(plz) {
    const e = plzMap[plz];
    return { lat: e[0], lng: e[1], place: e[2], state: e[3], plz };
  }
  function resolveLocation(q) {
    q = (q || '').trim();
    if (/^\d{5}$/.test(q) && plzMap[q]) return entryFor(q);
    const lower = q.toLowerCase();
    if (lower.length < 2) return null;
    const hit = placeIndex.find(p => p[0] === lower) || placeIndex.find(p => p[0].startsWith(lower));
    if (!hit) return null;
    if (hit[2]) return entryFor(hit[2]);
    const c = landGeom[hit[3]].centroid;
    return { lat: c.lat, lng: c.lng, place: hit[3], state: hit[3], plz: null };
  }

  // ---------- Phasen ----------
  let phase = 'survey';
  const answers = { age: null, party: null };
  let visitor = null;
  let flightT0 = 0;
  const particleEl = document.getElementById('particle');

  function setPhase(p) {
    phase = p;
    document.body.className = p;
    const c = globe.controls();
    if (p === 'explore') {
      c.enabled = true; c.autoRotate = false;
      c.minDistance = 115; c.maxDistance = 320;
    } else {
      c.enabled = false;
      c.autoRotate = (p === 'survey'); c.autoRotateSpeed = 0.35;
    }
  }

  // ---------- Umfrage ----------
  const sections = [...document.querySelectorAll('#survey section')];
  const dots = [...document.querySelectorAll('#dots span')];
  let step = 0;

  function showStep(i) {
    step = i;
    sections.forEach((s, k) => s.classList.toggle('active', k === i));
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    const focus = sections[i].querySelector('input');
    if (focus) setTimeout(() => focus.focus(), 60);
  }

  const ageInput = document.getElementById('in-age');
  function submitAge() {
    const a = parseInt(ageInput.value, 10);
    if (!(a >= 16 && a <= 99)) { ageInput.focus(); return; }
    answers.age = a;
    showStep(1);
  }
  document.querySelector('[data-next="0"]').addEventListener('click', submitAge);
  ageInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitAge(); });

  const partyRow = document.getElementById('party-row');
  for (const p of data.parteien.concat(['Nicht gewählt / keine Angabe'])) {
    const b = document.createElement('button');
    b.textContent = p;
    b.addEventListener('click', () => {
      answers.party = p === 'Nicht gewählt / keine Angabe' ? 'Keine Angabe' : p;
      showStep(2);
    });
    partyRow.appendChild(b);
  }

  const locInput = document.getElementById('in-loc');
  const acList = document.getElementById('ac');
  const locHint = document.getElementById('loc-hint');
  locInput.addEventListener('input', () => {
    const q = locInput.value.trim().toLowerCase();
    acList.innerHTML = ''; locHint.textContent = '';
    if (q.length < 2) return;
    const hits = [];
    for (const p of placeIndex) {
      if (p[0].startsWith(q)) { hits.push(p); if (hits.length >= 8) break; }
    }
    for (const h of hits) {
      const li = document.createElement('li');
      li.textContent = h[1];
      li.addEventListener('click', () => {
        const loc = h[2] ? entryFor(h[2])
          : { lat: landGeom[h[3]].centroid.lat, lng: landGeom[h[3]].centroid.lng,
              place: h[3], state: h[3], plz: null };
        startFlight(loc);
      });
      acList.appendChild(li);
    }
  });
  locInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const loc = resolveLocation(locInput.value);
    if (loc) startFlight(loc);
    else locHint.textContent = 'Ort nicht gefunden — bitte Ortsname oder 5-stellige PLZ.';
  });

  // ---------- Flug ----------
  function startFlight(loc) {
    if (phase !== 'survey') return;
    visitor = Object.assign({ age: answers.age, party: answers.party, ts: Date.now() }, loc);
    setPhase('flight');
    acList.innerHTML = '';
    flightT0 = performance.now();
    globe.pointOfView(GERMANY_POV, FLY1);
    setTimeout(() => globe.pointOfView(
      { lat: visitor.lat, lng: visitor.lng, altitude: 0.30 }, FLY2), FLY1 + 100 / FAST);
    setTimeout(() => land(!Q.has('fly')), FLY_TOTAL); // Dev-Flug nicht persistieren
    requestAnimationFrame(flightTick);
  }

  function flightTick() {
    if (phase !== 'flight') return;
    const t = Math.min(1, (performance.now() - flightT0) / FLY_TOTAL);
    const e = easeIO(t);
    const start = { x: innerWidth / 2, y: innerHeight * 0.8 };
    const tgt = globe.getScreenCoords(visitor.lat, visitor.lng, 0.012);
    const x = start.x + (tgt.x - start.x) * e;
    const y = start.y + (tgt.y - start.y) * e;
    const size = 36 - 28 * e;
    particleEl.style.left = x + 'px';
    particleEl.style.top = y + 'px';
    particleEl.style.width = size + 'px';
    particleEl.style.height = size + 'px';
    requestAnimationFrame(flightTick);
  }

  function land(persist = true) {
    if (persist) saveVisitor(visitor);
    globe.htmlElementsData([{ lat: visitor.lat, lng: visitor.lng }]);
    setFilterFromVisitor();
    applyFilter();
    setPhase('explore');
    armIdle();
  }

  // ---------- Tooltip ----------
  const tooltip = document.getElementById('tooltip');
  function aggregate(landName) {
    const pts = heatPoints().filter(p => p.state === landName);
    const landData = landByName[landName];
    const btwWinner = landData
      ? Object.entries(landData.votes).sort((a, b) => b[1] - a[1])[0][0] : '—';
    const rows = BRACKETS.map(b => {
      const inB = pts.filter(p => p.bracket === b.label && p.party !== 'Keine Angabe');
      if (inB.length < 4) return { label: b.label, top: `${btwWinner} (BTW 2025)` };
      const sums = {};
      for (const p of inB) sums[p.party] = (sums[p.party] || 0) + p.w;
      const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0][0];
      return { label: b.label, top };
    });
    const nVisitors = loadVisitors().filter(v => v.state === landName).length;
    return { rows, btwWinner, nVisitors };
  }
  globe.onPolygonHover(f => {
    hovered = (phase === 'explore' && f && f.properties.__de) ? f : null;
    globe.polygonAltitude(d => d === hovered ? 0.012 : 0.006)
      .polygonStrokeColor(d => d.properties.__de
        ? (d === hovered ? '#ffffff' : '#ececec')
        : '#4a4a4a');
    if (hovered) {
      tooltip.innerHTML = `<h3>${hovered.properties.name}</h3>` +
        `<div class="foot">Anklicken für Details</div>`;
      tooltip.style.display = 'block';
    } else tooltip.style.display = 'none';
  });

  // ---------- Detail-Fenster (links, bei Klick) ----------
  const detailEl = document.getElementById('detail');
  const detailBody = document.getElementById('detail-body');
  let detailLand = null;
  function renderDetail(landName) {
    if (!landByName[landName]) return;
    detailLand = landName;
    const a = aggregate(landName);
    const all = heatPoints().filter(p => p.state === landName);
    const match = all.filter(matchesFilter);
    const wAll = all.reduce((s, p) => s + p.w, 0);
    const wMatch = match.reduce((s, p) => s + p.w, 0);
    const pct = wAll ? Math.round(100 * wMatch / wAll) : 0;
    detailBody.innerHTML =
      `<h3>${landName}</h3>` +
      `<p class="big"><b>${pct}%</b> der Antworten hier passen zu deinem Filter<br>(${filterLabel()})</p>` +
      a.rows.map(r => `<div class="row"><span>Top-Partei der ${r.label}-Jährigen</span><b>${r.top}</b></div>`).join('') +
      `<div class="foot">${a.nVisitors} Besucher dieser Installation · Wahlsieger BTW 2025: ${a.btwWinner}` +
      ` · Wahlbeteiligung ${landByName[landName].beteiligung.toFixed(1).replace('.', ',')} %</div>`;
    detailEl.classList.add('open');
  }
  function closeDetail() {
    detailEl.classList.remove('open');
    detailLand = null;
  }
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  globe.onPolygonClick(f => {
    if (phase === 'explore' && f && f.properties.__de) renderDetail(f.properties.name);
  });
  addEventListener('mousemove', e => {
    if (tooltip.style.display !== 'block') return;
    const x = Math.min(e.clientX + 18, innerWidth - 340);
    const y = Math.min(e.clientY + 18, innerHeight - tooltip.offsetHeight - 20);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  });

  // ---------- Idle-Reset ----------
  const fadeEl = document.getElementById('fade');
  let idleTimer = null;
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, IDLE_MS);
  }
  function onIdle() {
    if (phase === 'explore' || (phase === 'survey' && step > 0)) resetKiosk();
    else armIdle();
  }
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'])
    addEventListener(ev, armIdle, { passive: true });
  armIdle();

  function resetKiosk() {
    fadeEl.classList.add('on');
    setTimeout(() => {
      globe.htmlElementsData([]);
      globe.hexBinPointsData([]);
      tooltip.style.display = 'none';
      closeDetail();
      filter.age = 'Alle'; filter.party = 'Alle'; syncMenu();
      hovered = null;
      visitor = null;
      answers.age = null; answers.party = null;
      ageInput.value = ''; locInput.value = '';
      acList.innerHTML = ''; locHint.textContent = '';
      globe.pointOfView(START_POV, 0);
      setPhase('survey');
      showStep(0);
      fadeEl.classList.remove('on');
    }, 1600);
  }

  // ---------- Dev-Hooks ----------
  if (Q.has('pov')) {
    const [la, ln, al] = Q.get('pov').split(',').map(Number);
    globe.pointOfView({ lat: la, lng: ln, altitude: al }, 0);
  }
  if (Q.has('fly')) {
    // ?fly=10115 [&age=&party=] → Umfrage überspringen, Flug direkt starten
    answers.age = +(Q.get('age') || 34);
    answers.party = Q.get('party') || 'SPD';
    const plz = plzMap[Q.get('fly')] ? Q.get('fly') : '10115';
    startFlight(entryFor(plz));
  } else if (Q.has('skipintro')) {
    const plz = Q.get('plz') || '10115';
    const loc = plzMap[plz] ? entryFor(plz) : entryFor('10115');
    visitor = Object.assign(
      { age: +(Q.get('age') || 34), party: Q.get('party') || 'SPD', ts: Date.now() }, loc);
    if (!Q.has('pov')) globe.pointOfView({ lat: visitor.lat, lng: visitor.lng, altitude: 0.8 }, 0);
    land(false); // Dev-Besucher nicht persistieren
    if (Q.has('detail')) renderDetail(Q.get('detail'));
  } else {
    setPhase('survey');
    showStep(0);
  }
})();
