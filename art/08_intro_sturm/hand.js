/* 08 · Hand-Tracking — MediaPipe HandLandmarker, komplett lokal (vendor/)
   Liefert geglättete Handflächen-Positionen in Screen-Koordinaten an sketch.js.
   Einzige Schnittstelle: window.HANDS = [{x, y, vx, vy, present}, ...]
   Kein Bild verlässt das Gerät; ohne Kamera/Permission degradiert alles still. */

(function () {
  const VW = 640, VH = 480;      // Kamera-Auflösung (reicht fürs Tracking)
  const EMA = 0.4;               // Glättung der Handposition
  const VEMA = 0.5;              // Glättung der Hand-Geschwindigkeit
  const LOST_MS = 250;           // so lange gilt eine Hand nach dem letzten Treffer noch
  const PALM = [0, 5, 9, 13, 17];// Handwurzel + Fingergrundgelenke -> Handflächen-Mitte

  const slots = [mkSlot(), mkSlot()];
  window.HANDS = slots;

  function mkSlot() { return { x: 0, y: 0, vx: 0, vy: 0, present: false, _seen: 0, _init: false }; }

  let video = null, stream = null, landmarker = null;
  let lastErr = null;            // letzter Init-Fehler (Permission, kein Geraet, ...)
  let running = false, starting = false, lastTs = -1, lastVideoTime = -1;
  let delegate = null;           // 'GPU' | 'CPU' — welcher Pfad tatsaechlich laeuft
  let detN = 0, detT0 = 0;       // Erkennungen + Startzeit -> Rate (Hand.hz())

  /* ---------- Screen-Mapping: Video „cover" auf die Canvas, X gespiegelt ---------- */
  function mapPoint(nx, ny) {
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.max(W / VW, H / VH);
    const dw = VW * s, dh = VH * s;
    return [(W - dw) / 2 + (1 - nx) * dw, (H - dh) / 2 + ny * dh];   // Spiegel-Logik
  }

  /* ---------- Init: Kamera + Modell ---------- */
  async function initHand() {
    if (running || starting) return running;
    starting = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        throw new Error('keine Kamera-API');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: VW, height: VH }, audio: false,
      });
      video = document.createElement('video');
      video.playsInline = true; video.muted = true; video.autoplay = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      video.srcObject = stream;
      await video.play();

      const vision = await import('./vendor/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks('./vendor/wasm');
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: './vendor/hand_landmarker.task', delegate },
        numHands: 2, runningMode: 'VIDEO',
      });
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(files, opts('GPU'));
        delegate = 'GPU';                             // Inferenz ueber WebGL2
      } catch (e) {
        landmarker = await vision.HandLandmarker.createFromOptions(files, opts('CPU'));
        delegate = 'CPU';                             // Fallback: XNNPACK auf der CPU
      }
      console.info('[hand] Inferenz laeuft auf:', delegate);

      running = true; starting = false;
      requestAnimationFrame(tick);
      return true;
    } catch (e) {
      lastErr = e && e.message ? e.message : String(e);
      console.info('[hand] Hand-Tracking aus:', lastErr);
      stop(); starting = false;
      return false;
    }
  }

  function stop() {
    running = false;
    for (const s of slots) { s.present = false; s.vx = s.vy = 0; s._init = false; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (video) { video.remove(); video = null; }
    if (landmarker) { try { landmarker.close(); } catch (e) { /* egal */ } landmarker = null; }
    delegate = null; detN = 0; detT0 = 0;
  }

  /* ---------- Erkennungs-Schleife (eigene RAF, unabhängig von p5) ---------- */
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    if (!video || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    let res;
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;              // detectForVideo braucht steigende Zeitstempel
    lastTs = ts;
    try { res = landmarker.detectForVideo(video, ts); }
    catch (e) { console.info('[hand] Erkennung gestoppt:', e && e.message); stop(); return; }

    const hands = (res && res.landmarks) || [];
    const now = performance.now();
    if (!detT0) detT0 = now; else detN++;
    const found = hands.slice(0, slots.length).map(lm => {
      let sx = 0, sy = 0;
      for (const i of PALM) { sx += lm[i].x; sy += lm[i].y; }
      return mapPoint(sx / PALM.length, sy / PALM.length);
    });

    // Zuordnung zu den Slots: jede erkannte Hand an den nächstgelegenen freien Slot
    const taken = new Set();
    const pairs = found.map(pt => {
      let best = -1, bestD = Infinity;
      slots.forEach((s, i) => {
        if (taken.has(i) || !s._init) return;
        const d = (s.x - pt[0]) ** 2 + (s.y - pt[1]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best < 0) best = slots.findIndex((s, i) => !taken.has(i));
      taken.add(best);
      return [best, pt];
    });

    for (const [i, pt] of pairs) {
      const s = slots[i];
      if (!s._init || !s.present) { s.x = pt[0]; s.y = pt[1]; s.vx = s.vy = 0; s._init = true; }
      else {
        const nx = s.x + (pt[0] - s.x) * EMA, ny = s.y + (pt[1] - s.y) * EMA;
        s.vx += ((nx - s.x) - s.vx) * VEMA;
        s.vy += ((ny - s.y) - s.vy) * VEMA;
        s.x = nx; s.y = ny;
      }
      s.present = true; s._seen = now;
    }
    slots.forEach((s, i) => {
      if (taken.has(i)) return;
      if (now - s._seen > LOST_MS) { s.present = false; s.vx = s.vy = 0; }
      else { s.vx *= 0.8; s.vy *= 0.8; }             // kurze Aussetzer überbrücken
    });
  }

  window.Hand = {
    init: initHand,
    stop: stop,
    isRunning: () => running,
    isStarting: () => starting,
    delegate: () => delegate,      // Konsole: Hand.delegate() -> 'GPU' oder 'CPU'
    hz: () => detT0 ? detN / ((performance.now() - detT0) / 1000) : 0,   // Erkennungen/s
    // Kamera grundsätzlich vorhanden? (sagt nichts über die Permission)
    available: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    // Warum nicht verfügbar? (haeufigster Fall: HTTP ueber LAN-IP = unsicherer Kontext)
    unavailableReason: () => window.isSecureContext
      ? 'Dieser Browser hat keine Kamera-API.'
      : 'Kamera-Zugriff braucht HTTPS oder localhost — diese Adresse ist unverschlüsselt (http://…).',
    lastError: () => lastErr,
    anyPresent: () => slots.some(s => s.present),
  };
})();
