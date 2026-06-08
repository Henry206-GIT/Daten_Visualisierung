/* ─────────────────────────────────────────────────────────────────────────────
   Glühende Republik · deck.gl 8.9 standalone UMD
   No basemap, no Mapbox token. Pure polygon glow on black.
───────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  const BG = [7, 8, 12]; // #07080c as [r,g,b]

  // Germany bounding box center for framing
  const GERMANY_CENTER = { longitude: 10.45, latitude: 51.2 };
  const BASE_ZOOM = 4.85;

  // Indicators to cycle through.
  // getValue returns a raw number; normalization to [0,1] happens at
  // computeValues time once we have the full dataset (min/max stretch).
  // For clarity, getValueRaw returns the domain value; normalizeRange
  // is [min, max] used to map to [0,1].  null = use [0, max].
  const INDICATORS = [
    {
      id: 'beteiligung',
      label: 'Wahlbeteiligung',
      getValueRaw: (land) => land.beteiligung,
      normalizeRange: null, // computed from data
      // cool (low) → warm (high): steel blue → amber
      colorLow:  [20,  45, 110],
      colorHigh: [255, 195,  60],
      legendLow: 'niedrig',
      legendHigh: 'hoch',
      party: null,
    },
    {
      id: 'afd',
      label: 'AfD-Anteil',
      getValueRaw: (land) => land.shares['AfD'] || 0,
      normalizeRange: null,
      colorLow:  [8,   22,  44],
      colorHigh: [25, 182, 232], // AfD cyan #19b6e8
      legendLow: 'niedrig',
      legendHigh: 'hoch',
      party: 'AfD',
    },
    {
      id: 'cdu',
      label: 'CDU/CSU-Anteil',
      getValueRaw: (land) => (land.shares['CDU'] || 0) + (land.shares['CSU'] || 0),
      normalizeRange: null,
      colorLow:  [25,  25,  30],
      colorHigh: [230, 230, 230], // CDU near-white
      legendLow: 'niedrig',
      legendHigh: 'hoch',
      party: 'CDU',
    },
    {
      id: 'spd',
      label: 'SPD-Anteil',
      getValueRaw: (land) => land.shares['SPD'] || 0,
      normalizeRange: null,
      colorLow:  [38,   8,  12],
      colorHigh: [255,  77,  94], // SPD red #ff4d5e
      legendLow: 'niedrig',
      legendHigh: 'hoch',
      party: 'SPD',
    },
    {
      id: 'gruene',
      label: 'Grünen-Anteil',
      getValueRaw: (land) => land.shares['GRÜNE'] || 0,
      normalizeRange: null,
      colorLow:  [8,   24,  12],
      colorHigh: [70,  209,  96], // Grüne #46d160
      legendLow: 'niedrig',
      legendHigh: 'hoch',
      party: 'GRÜNE',
    },
  ];

  const CYCLE_DURATION_MS  = 6000;  // time per indicator
  const TRANSITION_MS      = 1200;  // cross-fade length

  // ── State ──────────────────────────────────────────────────────────────────

  let geoData  = null;
  let dataJson = null;
  let landerMap = {};      // name → land data object
  let deckgl   = null;
  let startTime = null;

  // Per-feature cached raw values for current and next indicator
  let currentValues = null;   // Float32Array[numFeatures]
  let nextValues    = null;

  let currentIndicatorIdx = 0;
  let nextIndicatorIdx    = 1;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(ca, cb, t) {
    return [
      Math.round(lerp(ca[0], cb[0], t)),
      Math.round(lerp(ca[1], cb[1], t)),
      Math.round(lerp(ca[2], cb[2], t)),
    ];
  }

  // Smooth ease in-out
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // Map 0..1 value → color using indicator's colorLow/colorHigh
  function valueToColor(v, indicator, alpha) {
    const t = Math.max(0, Math.min(1, v));
    // Use a gamma curve so mid-values pop nicely
    const tGamma = Math.pow(t, 0.7);
    const rgb = lerpColor(indicator.colorLow, indicator.colorHigh, tGamma);
    return [...rgb, alpha !== undefined ? alpha : 255];
  }

  // Compute feature values for an indicator, normalized to [0,1] via min/max
  // stretch so the full color range is always used regardless of data spread.
  function computeValues(indicator, features) {
    const raws = features.map((f) => {
      const name = f.properties && f.properties.name;
      const land = landerMap[name];
      if (!land) return null;
      return indicator.getValueRaw(land);
    });

    // Find min/max of non-null values
    let mn = Infinity, mx = -Infinity;
    for (const v of raws) {
      if (v !== null) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    }
    if (mx === mn) return raws.map(() => 0.5);

    return raws.map((v) => {
      if (v === null) return 0;
      return (v - mn) / (mx - mn);
    });
  }

  // ── Caption / Legend UI ────────────────────────────────────────────────────

  const captionEl  = document.getElementById('caption');
  const titleEl    = document.getElementById('caption-title');
  const legendEl   = document.getElementById('legend');

  function updateCaption(indicator) {
    titleEl.textContent = indicator.label;
    captionEl.classList.add('visible');
    legendEl.classList.add('visible');

    const low  = valueToColor(0.0, indicator, 255);
    const mid  = valueToColor(0.5, indicator, 255);
    const high = valueToColor(1.0, indicator, 255);

    legendEl.innerHTML = `
      <div class="legend-row">
        <span>${indicator.legendHigh}</span>
        <div class="legend-dot" style="background:rgb(${high[0]},${high[1]},${high[2]})"></div>
      </div>
      <div class="legend-row">
        <span>Mittel</span>
        <div class="legend-dot" style="background:rgb(${mid[0]},${mid[1]},${mid[2]})"></div>
      </div>
      <div class="legend-row">
        <span>${indicator.legendLow}</span>
        <div class="legend-dot" style="background:rgb(${low[0]},${low[1]},${low[2]})"></div>
      </div>`;
  }

  // ── Centroid computation (for arc layer) ───────────────────────────────────

  function featureCentroid(feature) {
    // Use first ring of first polygon (or multipolygon)
    const geom = feature.geometry;
    let coords = [];
    if (geom.type === 'Polygon') {
      coords = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      // pick the largest ring
      let maxLen = 0;
      for (const poly of geom.coordinates) {
        if (poly[0].length > maxLen) { maxLen = poly[0].length; coords = poly[0]; }
      }
    }
    if (!coords.length) return [GERMANY_CENTER.longitude, GERMANY_CENTER.latitude];
    let x = 0, y = 0;
    for (const c of coords) { x += c[0]; y += c[1]; }
    return [x / coords.length, y / coords.length];
  }

  // ── Layer builders ─────────────────────────────────────────────────────────

  // t in [0,1]: blend between currentValues (t=0) and nextValues (t=1)
  function buildLayers(features, t, cyclePhase, currentInd, nextInd) {
    const et = easeInOut(Math.max(0, Math.min(1, t)));

    // Opacity pulse for the line "breathing" (0.4–1.0 range, slow sine)
    const breathAlpha = Math.round(180 + 60 * Math.sin(cyclePhase * Math.PI * 2));

    const geoLayer = new deck.GeoJsonLayer({
      id: 'bundeslaender',
      data: geoData,
      pickable: false,
      stroked: true,
      filled: true,
      extruded: false,

      // Fill: interpolate between current and next indicator colors
      getFillColor: (feature) => {
        const i = feature._idx !== undefined ? feature._idx : features.indexOf(feature);
        const vCurr = currentValues ? currentValues[i] : 0;
        const vNext = nextValues    ? nextValues[i]    : 0;
        const v = lerp(vCurr, vNext, et);

        // Blend indicator colors themselves for the transition
        const cCurr = valueToColor(v, currentInd);
        const cNext = valueToColor(v, nextInd);
        const rgb   = lerpColor(cCurr, cNext, et);

        // Alpha: slightly increased for higher values → glow pop
        const alpha = Math.round(lerp(120, 248, Math.pow(v, 0.6)));
        return [...rgb, alpha];
      },

      // Soft white-blue outlines — luminous grid
      getLineColor: (feature) => {
        const i = feature._idx !== undefined ? feature._idx : features.indexOf(feature);
        const v = currentValues ? lerp(currentValues[i], nextValues ? nextValues[i] : 0, et) : 0;
        // Outline brightness follows fill value, subtle
        const bright = Math.round(lerp(40, 130, v));
        return [bright + 20, bright + 25, bright + 50, breathAlpha];
      },

      lineWidthMinPixels: 0.8,
      lineWidthMaxPixels: 2,

      updateTriggers: {
        getFillColor: [t, currentIndicatorIdx, nextIndicatorIdx],
        getLineColor: [cyclePhase, t, currentIndicatorIdx],
      },
    });

    // Arc layer: soft arcs from each Land centroid toward Berlin
    const BERLIN = [13.405, 52.52];

    const arcData = features.map((f, i) => {
      const from   = featureCentroid(f);
      const vCurr  = currentValues ? currentValues[i] : 0;
      const vNext  = nextValues    ? nextValues[i]    : 0;
      const v      = lerp(vCurr, vNext, et);
      const cRGB   = lerpColor(
        valueToColor(v, currentInd),
        valueToColor(v, nextInd),
        et
      );
      return { from, to: BERLIN, value: v, color: cRGB };
    });

    // Arc opacity: gentle pulse, dim by design
    const arcBaseAlpha = 38 + 20 * Math.sin(cyclePhase * Math.PI * 4 + 1.2);

    const arcLayer = new deck.ArcLayer({
      id: 'arcs-berlin',
      data: arcData,
      pickable: false,
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getSourceColor: (d) => [...d.color, Math.round(arcBaseAlpha * (0.5 + d.value))],
      getTargetColor: (d) => [220, 220, 255, Math.round(arcBaseAlpha * 0.4)],
      getWidth: (d) => 0.5 + d.value * 1.5,
      widthMinPixels: 0.4,
      widthMaxPixels: 2.5,
      greatCircle: false,
      updateTriggers: {
        getSourceColor: [t, currentIndicatorIdx, nextIndicatorIdx, cyclePhase],
        getTargetColor: [cyclePhase],
        getWidth: [t, currentIndicatorIdx, nextIndicatorIdx],
      },
    });

    return [geoLayer, arcLayer];
  }

  // ── ViewState breathing ────────────────────────────────────────────────────

  // Very slow zoom-breathing and gentle drift
  function computeViewState(elapsed) {
    const t = elapsed / 1000; // seconds
    // Slow zoom breath: ±0.12 zoom over ~30s
    const zoomBreath = 0.10 * Math.sin(t * 0.042 * Math.PI * 2);
    // Very gentle bearing drift: ±1.8° over ~80s
    const bearing = 1.8 * Math.sin(t * 0.0125 * Math.PI * 2);
    // Slight latitude drift: ±0.04°
    const latDrift = 0.04 * Math.sin(t * 0.017 * Math.PI * 2);

    return {
      longitude: GERMANY_CENTER.longitude,
      latitude:  GERMANY_CENTER.latitude + latDrift,
      zoom:      BASE_ZOOM + zoomBreath,
      pitch:     18 + 4 * Math.sin(t * 0.028 * Math.PI * 2),
      bearing,
      transitionDuration: 0,
    };
  }

  // ── Main RAF loop ──────────────────────────────────────────────────────────

  function loop(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;

    // Which cycle are we in?
    const cycleTotal = Math.floor(elapsed / CYCLE_DURATION_MS);
    const cycleElapsed = elapsed % CYCLE_DURATION_MS;

    // Transition: last TRANSITION_MS of each cycle
    const transitionStart = CYCLE_DURATION_MS - TRANSITION_MS;
    let blendT = 0;
    if (cycleElapsed >= transitionStart) {
      blendT = (cycleElapsed - transitionStart) / TRANSITION_MS;
    }

    // Detect indicator change
    const newCurrIdx = cycleTotal % INDICATORS.length;
    const newNextIdx = (cycleTotal + 1) % INDICATORS.length;

    if (newCurrIdx !== currentIndicatorIdx || newNextIdx !== nextIndicatorIdx) {
      currentIndicatorIdx = newCurrIdx;
      nextIndicatorIdx    = newNextIdx;
      if (geoData) {
        currentValues = computeValues(INDICATORS[currentIndicatorIdx], geoData.features);
        nextValues    = computeValues(INDICATORS[nextIndicatorIdx],    geoData.features);
      }
      updateCaption(INDICATORS[currentIndicatorIdx]);
    }

    // Normalised position within the full cycle (for arc pulse etc.)
    const cyclePhase = cycleElapsed / CYCLE_DURATION_MS;

    if (deckgl && geoData) {
      const features = geoData.features;
      const layers = buildLayers(
        features,
        blendT,
        cyclePhase,
        INDICATORS[currentIndicatorIdx],
        INDICATORS[nextIndicatorIdx]
      );
      deckgl.setProps({
        layers,
        viewState: computeViewState(elapsed),
      });
    }

    requestAnimationFrame(loop);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  async function init() {
    // Load data in parallel
    const [geoResp, dataResp] = await Promise.all([
      fetch('../geo_bundeslaender.json'),
      fetch('../data.json'),
    ]);

    geoData  = await geoResp.json();
    dataJson = await dataResp.json();

    // Build lookup: name → land
    for (const land of dataJson.laender) {
      landerMap[land.name] = land;
    }

    // Pre-stamp feature indices for O(1) lookup in getFillColor
    geoData.features.forEach((f, i) => { f._idx = i; });

    // Pre-compute values for first two indicators
    currentIndicatorIdx = 0;
    nextIndicatorIdx    = 1;
    currentValues = computeValues(INDICATORS[0], geoData.features);
    nextValues    = computeValues(INDICATORS[1], geoData.features);

    // Create deck.gl instance
    // Use viewState (controlled mode) so setProps({viewState}) works every frame.
    // Background is handled by CSS (#07080c on body + container); clearColor
    // is also set so the WebGL framebuffer matches on browsers that expose it.
    deckgl = new deck.Deck({
      container: document.getElementById('deck-container'),
      views: new deck.MapView({ repeat: false }),
      viewState: {
        longitude: GERMANY_CENTER.longitude,
        latitude:  GERMANY_CENTER.latitude,
        zoom:      BASE_ZOOM,
        pitch:     18,
        bearing:   0,
      },
      controller: false,
      layers: [],
      parameters: {
        clearColor: [BG[0] / 255, BG[1] / 255, BG[2] / 255, 1],
      },
      getTooltip: null,
      _typedArrayManagerProps: { overAlloc: 1, poolSize: 0 },
    });

    // Show caption immediately
    updateCaption(INDICATORS[0]);

    // Kick off render loop
    requestAnimationFrame(loop);
  }

  init().catch((err) => {
    console.error('Glühende Republik init failed:', err);
  });

})();
