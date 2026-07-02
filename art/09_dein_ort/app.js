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
  const [world, laenderGeo, data, plzMap, wkList, alterData, kreiseGeo] = await Promise.all([
    fetch('world.geojson').then(r => r.json()),
    fetch('../geo_bundeslaender.json').then(r => r.json()),
    fetch('../data.json').then(r => r.json()),
    fetch('plz.json').then(r => r.json()),
    fetch('wk.json').then(r => r.json()), // 299 Wahlkreise: [lat, lng, {Partei: Zweitstimmen}, Land]
    fetch('alter.json').then(r => r.json()), // RWS: Land -> Altersgruppe -> {Partei: Zweitstimmen}
    fetch('kreise.geojson').then(r => r.json()), // 434 Kreise (isellsoap/deutschlandGeoJSON)
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

  // Kreis-Grenzen als Pfade (Linien) statt Polygone: 434 Kreise triangulieren ist zu
  // teuer, Linien sind billig. Punkte als [lat, lng, alt]-Tupel, markiert via .kreis.
  const kreisPaths = [];
  for (const f of kreiseGeo.features)
    for (const ring of featureRings(f)) {
      const p = ring.map(([lng, lat]) => [lat, lng, 0.0068]);
      p.kreis = true;
      kreisPaths.push(p);
    }

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
  // Normierung: max. Zellgewicht der aktuellen Filterung über grobes Raster schätzen
  let heatCap = 10;
  function calcCap(pts) {
    const m = new Map(); let max = 0;
    for (const p of pts) {
      const k = Math.round(p.lat * 6) + ',' + Math.round(p.lng * 6);
      const v = (m.get(k) || 0) + p.w;
      m.set(k, v); if (v > max) max = v;
    }
    return Math.max(1, max);
  }

  // ---------- Globus ----------
  let hoveredLand = null;  // Name des Bundeslands unter der Maus
  let kreisNear = false;   // Kreis-Grenzen erst beim Ranzoomen betonen
  const strokeFn = f => f.properties.__de
    ? (f.properties.name === hoveredLand ? '#ffffff' : '#ececec')
    : '#4a4a4a';
  const pathColorFn = p => p.kreis
    ? (kreisNear ? '#5a5a5a' : '#1a1a1a')
    : 'rgba(255,255,255,0.10)';
  const globe = Globe()(document.getElementById('globe'))
    .width(innerWidth).height(innerHeight)
    .backgroundColor('#000000')
    .showAtmosphere(false)
    .showGraticules(false)
    .pathsData(grid.concat(kreisPaths))
    .pathPointAlt(a => a[2] || 0.002)
    .pathColor(pathColorFn)
    .pathTransitionDuration(0)
    .polygonsData(features)
    .polygonCapColor(() => 'rgba(0,0,0,0.88)')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    // Achtung: rgba-Strokes rendern als Punktstaub (transparente Lines) — opak halten
    .polygonStrokeColor(strokeFn)
    .polygonAltitude(0.006) // konstant — angehobene Caps wuerden die Heat-Zellen verdecken
    .polygonLabel(null)
    .polygonsTransitionDuration(300)
    // "Heatmap" als H3-HexBins: KDE-heatmapsLayer rendert auf schwachen GPUs nicht (WebGPU-Fallback)
    .hexBinPointLat(p => p.lat)
    .hexBinPointLng(p => p.lng)
    .hexBinPointWeight(p => p.w)
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
  // Altersgruppen = Schema der Repräsentativen Wahlstatistik (alter.json)
  const BRACKETS = [
    { label: '18–24', min: 16, max: 24, w: 0.09 },
    { label: '25–34', min: 25, max: 34, w: 0.15 },
    { label: '35–44', min: 35, max: 44, w: 0.15 },
    { label: '45–59', min: 45, max: 59, w: 0.24 },
    { label: '60–69', min: 60, max: 69, w: 0.17 },
    { label: '70+',   min: 70, max: 120, w: 0.20 },
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

  // Heat-Basisraster: jeder PLZ-Ort wird ein Punkt. Gewicht = echte Zweitstimmen seines
  // WAHLKREISES (amtlich, kerg2/Bundeswahlleiterin) verteilt auf die PLZ des Wahlkreises
  // × Altersgruppen-Anteil. 299 Wahlkreise → echte Unterschiede unterhalb der Länder;
  // PLZ-Dichte ≈ Bevölkerungsdichte → Städte werden heiß.
  const plzList = Object.values(plzMap);
  const COSD = Math.cos(51 * Math.PI / 180);
  const plzWk = plzList.map(e => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < wkList.length; i++) {
      const dy = wkList[i][0] - e[0], dx = (wkList[i][1] - e[1]) * COSD;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  });
  const plzCountByWk = new Array(wkList.length).fill(0);
  for (const i of plzWk) plzCountByWk[i]++;

  // Anteil der Altersgruppe an den Wählern einer Partei im Land (aus alter.json, RWS).
  // So verschiebt der Alters-Filter die Karte real: Parteien haben je Region
  // unterschiedliche Altersstrukturen.
  function ageFactorFn() {
    if (filter.age === 'Alle') return () => 1;
    const cache = new Map();
    return (land, party) => {
      const k = land + '|' + party;
      if (cache.has(k)) return cache.get(k);
      const a = alterData[land];
      let f = 0;
      if (a) {
        let tot = 0;
        for (const b of Object.values(a)) tot += b[party] || 0;
        if (tot) f = ((a[filter.age] || {})[party] || 0) / tot;
      }
      cache.set(k, f);
      return f;
    };
  }

  function buildHeatData() {
    const fac = ageFactorFn();
    const pts = [];
    for (let i = 0; i < plzList.length; i++) {
      const e = plzList[i];
      const wk = plzWk[i];
      const wkv = wkList[wk][2], land = wkList[wk][3];
      let w = 0;
      if (filter.party === 'Alle') {
        for (const p of Object.keys(wkv)) w += wkv[p] * fac(land, p);
      } else {
        w = (wkv[filter.party] || 0) * fac(land, filter.party);
      }
      w /= plzCountByWk[wk];
      if (w > 0) pts.push({ lat: e[0], lng: e[1], w });
    }
    return pts;
  }

  function applyFilter() {
    rebuildHeat();
    if (detailLand) renderDetail(detailLand);
  }

  // ---------- Hologramm-Heat-Layer: lückenloses Hex-Gitter mit KDE + Zoom-LOD ----------
  // Hex-Gitter über ganz Deutschland; Wert je Zelle = Kernel-Dichte aller PLZ-Punkte
  // (Städte = viele PLZ = Peaks). Keine Löcher, Auflösung folgt dem Zoom.
  const heat = { opacity: 0.55, density: 1, relief: 1, smooth: 1.4, contrast: 0.35, cold: 1 };
  const DE_BBOX = { s: 47.1, n: 55.2, w: 5.6, e: 15.3 };
  const CELL_CAP = 150000;

  // Deutschland-Maske: Länder-Polygone einmal in ein Canvas rastern -> O(1)-Inside-Test.
  // Hexagone ausserhalb des Umrisses entfallen, innen wird lueckenlos gefuellt.
  const maskInside = (() => {
    const W = 1200, H = 1200;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff';
    for (const f of laenderGeo.features)
      for (const ring of featureRings(f)) {
        cx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const x = (ring[i][0] - DE_BBOX.w) / (DE_BBOX.e - DE_BBOX.w) * W;
          const y = (DE_BBOX.n - ring[i][1]) / (DE_BBOX.n - DE_BBOX.s) * H;
          i ? cx.lineTo(x, y) : cx.moveTo(x, y);
        }
        cx.closePath(); cx.fill();
      }
    const img = cx.getImageData(0, 0, W, H).data;
    return (lat, lng) => {
      const x = Math.floor((lng - DE_BBOX.w) / (DE_BBOX.e - DE_BBOX.w) * W);
      const y = Math.floor((DE_BBOX.n - lat) / (DE_BBOX.n - DE_BBOX.s) * H);
      return x >= 0 && y >= 0 && x < W && y < H && img[(y * W + x) * 4 + 3] > 0;
    };
  })();
  const DEG = Math.PI / 180;
  const R = globe.getGlobeRadius ? globe.getGlobeRadius() : 100;
  const UNIT = R * DEG;                    // Weltlaenge von 1° Breite
  const LNG_COS = Math.cos(51 * DEG);      // Quadrat-Korrektur fuer Deutschland-Breite
  let heatMesh = null;
  let heatCells = [];                      // {lat, lng, t, sizeDeg}
  let heatVisible = false;
  let hoverGeo = null;                     // {lat,lng} unter der Maus
  const dummy = () => new THREE.Object3D();
  const tmpObj = { o: null };

  function cellSizeDeg() {
    const alt = globe.pointOfView().altitude;
    let s = Math.max(0.02, Math.min(0.7, alt * 0.3)) / heat.density;
    // harte Obergrenze für Zellzahl (KDE + InstancedMesh); ~58 % der BBox liegen in Deutschland
    const est = ((DE_BBOX.n - DE_BBOX.s) / (s * 0.866)) * ((DE_BBOX.e - DE_BBOX.w) / (s / LNG_COS)) * 0.58;
    if (est > CELL_CAP) s *= Math.sqrt(est / CELL_CAP);
    return s;
  }

  // Hex-Gitter über die Deutschland-BBox; Zellwert = gaußsche Kernel-Dichte der PLZ-Punkte.
  // Zellen ohne PLZ in Reichweite (Meer/Ausland) entfallen — Inland bleibt lückenlos.
  function binCells(sizeDeg) {
    const pts = buildHeatData();
    heatCap = calcCap(pts);
    for (const v of loadVisitors().map(visitorPoint).filter(matchesFilter))
      pts.push({ lat: v.lat, lng: v.lng, w: heatCap * 0.6 });

    const sigma = Math.max(0.05, sizeDeg * heat.smooth);
    const cut = sigma * 2.5, cut2 = cut * cut, inv2s2 = 1 / (2 * sigma * sigma);
    const hash = new Map();
    for (const p of pts) {
      const k = Math.floor(p.lat / cut) + '|' + Math.floor((p.lng * LNG_COS) / cut);
      (hash.get(k) || hash.set(k, []).get(k)).push(p);
    }

    const lngPitch = sizeDeg / LNG_COS, rowH = sizeDeg * 0.866;
    const cells = []; let max = 0;
    let row = 0;
    for (let lat = DE_BBOX.s; lat <= DE_BBOX.n; lat += rowH, row++) {
      const off = (row % 2) ? lngPitch / 2 : 0;
      for (let lng = DE_BBOX.w + off; lng <= DE_BBOX.e; lng += lngPitch) {
        if (!maskInside(lat, lng)) continue; // nur innerhalb des Deutschland-Umrisses
        const hy = Math.floor(lat / cut), hx = Math.floor((lng * LNG_COS) / cut);
        let v = 0;
        for (let iy = hy - 1; iy <= hy + 1; iy++)
          for (let ix = hx - 1; ix <= hx + 1; ix++) {
            const arr = hash.get(iy + '|' + ix);
            if (!arr) continue;
            for (const p of arr) {
              const dy = p.lat - lat, dx = (p.lng - lng) * LNG_COS;
              const d2 = dx * dx + dy * dy;
              if (d2 < cut2) v += p.w * Math.exp(-d2 * inv2s2);
            }
          }
        // v==0 bleibt drin: Grundfüllung (kälteste Stufe), keine Löcher im Inland
        cells.push({ lat, lng, v, sizeDeg }); if (v > max) max = v;
      }
    }
    for (const c of cells) c.t = max ? Math.pow(Math.min(1, c.v / max), heat.contrast) : 0;
    return cells;
  }

  // Zellbasis (Position + Achsen) wird EINMAL beim Rebuild berechnet; das Layout schreibt
  // die Instanz-Matrizen danach direkt als Zahlen (kein Object3D pro Zelle) — Faktor ~10
  // schneller, noetig fuer bis zu 150k Instanzen. Hover aktualisiert nur Zellen in der Naehe.
  const STRIDE = 14; // [px,py,pz, xAchse(3), yAchse(3), zAchse(3)=radial, t, rHex]
  let cellArr = null;
  let cellBuckets = new Map();
  let bucketSize = 1;
  let prevAffected = null;

  const bucketKey = (lat, lng) =>
    Math.floor(lat / bucketSize) + '|' + Math.floor(lng * LNG_COS / bucketSize);

  function layoutCells(indices) {
    if (!heatMesh) return;
    const m = heatMesh.instanceMatrix.array;
    const n = indices ? indices.length : heatCells.length;
    const rad = heatCells.length ? heatCells[0].sizeDeg * 3 : 1;
    for (let j = 0; j < n; j++) {
      const i = indices ? indices[j] : j;
      const k = i * STRIDE, q = i * 16;
      const t = cellArr[k + 12], rH = cellArr[k + 13];
      let elevate = 1;
      if (hoverGeo) {
        const c = heatCells[i];
        const dy = c.lat - hoverGeo.lat, dx = (c.lng - hoverGeo.lng) * LNG_COS;
        elevate = 1 + 2.4 * Math.exp(-(dx * dx + dy * dy) / (rad * rad));
      }
      const h = Math.max(rH * 0.1, rH * (0.25 + t * 2.6 * heat.relief) * elevate);
      m[q] = cellArr[k + 3] * rH; m[q + 1] = cellArr[k + 4] * rH; m[q + 2] = cellArr[k + 5] * rH; m[q + 3] = 0;
      m[q + 4] = cellArr[k + 6] * rH; m[q + 5] = cellArr[k + 7] * rH; m[q + 6] = cellArr[k + 8] * rH; m[q + 7] = 0;
      m[q + 8] = cellArr[k + 9] * h; m[q + 9] = cellArr[k + 10] * h; m[q + 10] = cellArr[k + 11] * h; m[q + 11] = 0;
      m[q + 12] = cellArr[k] + cellArr[k + 9] * h / 2;
      m[q + 13] = cellArr[k + 1] + cellArr[k + 10] * h / 2;
      m[q + 14] = cellArr[k + 2] + cellArr[k + 11] * h / 2;
      m[q + 15] = 1;
    }
    heatMesh.instanceMatrix.needsUpdate = true;
  }

  function affectedAround(g) {
    if (!g) return [];
    const out = [];
    const by = Math.floor(g.lat / bucketSize), bx = Math.floor(g.lng * LNG_COS / bucketSize);
    for (let iy = by - 1; iy <= by + 1; iy++)
      for (let ix = bx - 1; ix <= bx + 1; ix++) {
        const arr = cellBuckets.get(iy + '|' + ix);
        if (arr) for (const i of arr) out.push(i);
      }
    return out;
  }

  function rebuildHeat() {
    const sizeDeg = cellSizeDeg();
    heatCells = binCells(sizeDeg);
    if (heatMesh) {
      globe.scene().remove(heatMesh);
      heatMesh.geometry.dispose();
      heatMesh.material.dispose();
    }
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6); // sechseckiges Prisma
    geo.rotateX(Math.PI / 2); // Achse radial zur Kugel ausrichten
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: heat.opacity,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    mat.toneMapped = false; // Tonemapping waescht die Thermal-Farben aus
    heatMesh = new THREE.InstancedMesh(geo, mat, heatCells.length);
    cellArr = new Float32Array(heatCells.length * STRIDE);
    cellBuckets = new Map();
    bucketSize = sizeDeg * 4;
    prevAffected = null;
    const o = tmpObj.o || (tmpObj.o = dummy());
    const rHex = sizeDeg * UNIT * 0.577 * 0.94; // Umkreisradius: Nachbarabstand/√3, kleine Fuge
    const col = new THREE.Color();
    for (let i = 0; i < heatCells.length; i++) {
      const c = heatCells[i];
      const base = globe.getCoords(c.lat, c.lng, 0.0075); // knapp ueber den Polygon-Caps
      o.position.set(base.x, base.y, base.z);
      o.lookAt(0, 0, 0); // +Z zeigt radial nach aussen
      o.updateMatrix();
      const e = o.matrix.elements, k = i * STRIDE;
      cellArr[k] = base.x; cellArr[k + 1] = base.y; cellArr[k + 2] = base.z;
      cellArr[k + 3] = e[0]; cellArr[k + 4] = e[1]; cellArr[k + 5] = e[2];
      cellArr[k + 6] = e[4]; cellArr[k + 7] = e[5]; cellArr[k + 8] = e[6];
      cellArr[k + 9] = e[8]; cellArr[k + 10] = e[9]; cellArr[k + 11] = e[10];
      cellArr[k + 12] = c.t; cellArr[k + 13] = rHex;
      const bk = bucketKey(c.lat, c.lng);
      const arr = cellBuckets.get(bk);
      if (arr) arr.push(i); else cellBuckets.set(bk, [i]);
      const t = c.t;
      const x = t * (HEAT_STOPS.length - 1);
      const j = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
      const f = x - j;
      // Kälte-Regler: dimmt das kalte Ende Richtung Schwarz (cold=1 -> t=0 ist schwarz)
      const dim = 1 - heat.cold * Math.pow(1 - t, 1.5);
      col.setRGB(
        (HEAT_STOPS[j][0] + (HEAT_STOPS[j + 1][0] - HEAT_STOPS[j][0]) * f) / 255 * dim,
        (HEAT_STOPS[j][1] + (HEAT_STOPS[j + 1][1] - HEAT_STOPS[j][1]) * f) / 255 * dim,
        (HEAT_STOPS[j][2] + (HEAT_STOPS[j + 1][2] - HEAT_STOPS[j][2]) * f) / 255 * dim);
      heatMesh.setColorAt(i, col);
    }
    if (heatMesh.instanceColor) heatMesh.instanceColor.needsUpdate = true;
    heatMesh.visible = heatVisible;
    layoutCells(null);
    globe.scene().add(heatMesh);
  }

  // LOD: bei Zoom-Aenderung > 20 % neu rastern (entprellt); Kreis-Grenzen beim Ranzoomen betonen
  let lastCellSize = 0, lodTimer = null;
  globe.controls().addEventListener('change', () => {
    if (phase !== 'explore') return;
    const near = globe.pointOfView().altitude < 0.5;
    if (near !== kreisNear) { kreisNear = near; globe.pathColor(pathColorFn); }
    if (!heatVisible) return;
    const s = cellSizeDeg();
    if (lastCellSize && Math.abs(s - lastCellSize) / lastCellSize < 0.2) return;
    clearTimeout(lodTimer);
    lodTimer = setTimeout(() => { lastCellSize = cellSizeDeg(); rebuildHeat(); }, 180);
  });

  // Maus/NDC -> Punkt auf der Kugeloberflaeche (Ray-Sphere-Schnitt, R=100)
  function ndcToSphere(nx, ny) {
    const cam = globe.camera();
    const ndc = new THREE.Vector3(nx, ny, 0.5);
    ndc.unproject(cam);
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    let dx = ndc.x - ox, dy = ndc.y - oy, dz = ndc.z - oz;
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const cq = ox * ox + oy * oy + oz * oz - R * R;
    const disc = b * b - 4 * cq;
    if (disc < 0) return null;
    const tHit = (-b - Math.sqrt(disc)) / 2;
    if (tHit < 0) return null;
    return { x: ox + dx * tHit, y: oy + dy * tHit, z: oz + dz * tHit };
  }

  // Hover: Zellen unter der Maus heben sich — nur betroffene Zellen werden neu gelegt
  let hoverRaf = false;
  addEventListener('mousemove', e => {
    if (phase !== 'explore' || !heatMesh) return;
    const p = ndcToSphere((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!p) { if (!hoverGeo) return; hoverGeo = null; }
    else {
      const g = globe.toGeoCoords(p);
      const minMove = (heatCells[0] ? heatCells[0].sizeDeg : 0.1) * 0.5;
      if (hoverGeo && Math.hypot(g.lat - hoverGeo.lat, (g.lng - hoverGeo.lng) * LNG_COS) < minMove) return;
      hoverGeo = { lat: g.lat, lng: g.lng };
    }
    if (!hoverRaf) {
      hoverRaf = true;
      requestAnimationFrame(() => {
        hoverRaf = false;
        const now = affectedAround(hoverGeo);
        const both = prevAffected ? prevAffected.concat(now) : now;
        prevAffected = now;
        layoutCells(both.length ? both : null);
      });
    }
  });

  // Mittlere Maustaste: Ansicht kippen — Orbit-Ziel auf den Oberflaechenpunkt in
  // Bildmitte setzen; Ziehen mit Mitteltaste (und Links) rotiert dann um diesen Punkt,
  // sodass man z.B. flach von der Seite auf das Relief schauen kann.
  addEventListener('pointerdown', e => {
    if (phase !== 'explore' || e.button !== 1) return;
    const p = ndcToSphere(0, 0);
    if (!p) return;
    const c = globe.controls();
    c.target.set(p.x, p.y, p.z);
    c.minDistance = 2; c.maxDistance = 420;
  });

  // Regler
  const bindSlider = (id, fn) => document.getElementById(id)
    .addEventListener('input', e => fn(parseFloat(e.target.value)));
  bindSlider('s-opacity', v => { heat.opacity = v; if (heatMesh) heatMesh.material.opacity = v; });
  bindSlider('s-density', v => { heat.density = v; rebuildHeat(); });
  bindSlider('s-relief', v => { heat.relief = v; layoutCells(null); });
  bindSlider('s-smooth', v => { heat.smooth = v; rebuildHeat(); });
  bindSlider('s-contrast', v => { heat.contrast = v; rebuildHeat(); });
  bindSlider('s-cold', v => { heat.cold = v; rebuildHeat(); });

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
      c.minDistance = 101.5; c.maxDistance = 320; // bis auf Stadt-Ebene ranzoombar
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    } else {
      c.enabled = false;
      c.autoRotate = (p === 'survey'); c.autoRotateSpeed = 0.35;
      c.target.set(0, 0, 0); // Kipp-Ziel der Mitteltaste zuruecksetzen
      c.minDistance = 0; c.maxDistance = Infinity;
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
    heatVisible = true;
    lastCellSize = cellSizeDeg();
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
  const landOf = f => (f && f.properties.__de) ? f.properties.name : null;
  globe.onPolygonHover(f => {
    const land = phase === 'explore' ? landOf(f) : null;
    hoveredLand = land;
    globe.polygonStrokeColor(strokeFn);
    if (land) {
      tooltip.innerHTML = `<h3>${land}</h3>` +
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
    const land = landOf(f);
    if (phase === 'explore' && land) renderDetail(land);
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
      heatVisible = false;
      hoverGeo = null;
      lastCellSize = 0;
      if (heatMesh) heatMesh.visible = false;
      tooltip.style.display = 'none';
      closeDetail();
      filter.age = 'Alle'; filter.party = 'Alle'; syncMenu();
      hoveredLand = null;
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
