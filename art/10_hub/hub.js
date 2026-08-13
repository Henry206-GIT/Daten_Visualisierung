/* 10 · Der Partikel-Hub
   Ein personalisierter Partikel (Name + Alter + Partei + Wohnort) als roter Faden:
   Onboarding -> Menü mit Kreis-Portalen -> Partikel fliegt in eine Welt (08/09/W3)
   und beim Verlassen sichtbar zurück. Welten laufen als iframes im Embed-Modus. */
(async function () {
  'use strict';

  const Q = new URLSearchParams(location.search);
  const IDLE_MS = (Q.has('idle') ? +Q.get('idle') : 60) * 1000;

  const [data, plzMap] = await Promise.all([
    fetch('../data.json').then(r => r.json()),
    fetch('../09_dein_ort/plz.json').then(r => r.json()),
  ]);

  // ---------- Orts-Auflösung (wie in 09) ----------
  const placeIndex = [];
  for (const [plz, e] of Object.entries(plzMap))
    placeIndex.push([e[2].toLowerCase(), `${e[2]} (${plz})`, plz]);
  const entryFor = plz => {
    const e = plzMap[plz];
    return { lat: e[0], lng: e[1], place: e[2], state: e[3], plz };
  };
  function resolveLocation(q) {
    q = (q || '').trim();
    if (/^\d{5}$/.test(q) && plzMap[q]) return entryFor(q);
    const lower = q.toLowerCase();
    if (lower.length < 2) return null;
    const hit = placeIndex.find(p => p[0] === lower) || placeIndex.find(p => p[0].startsWith(lower));
    return hit ? entryFor(hit[2]) : null;
  }

  // ---------- Zustand ----------
  const visitor = { name: '', age: null, party: null, loc: null };
  let hubState = 'onboarding';
  let focusKey = null;
  const body = document.body;
  const particle = document.getElementById('particle');
  const pname = document.getElementById('pname');
  const setState = s => { hubState = s; body.className = s; };

  // Persistente Welt-iframes: laden EINMAL beim Hub-Start (Standby),
  // Eintritt/Verlassen sind danach nur noch postMessage + Opacity — kein Nachladen.
  const frames = {
    p08: document.getElementById('f-p08'),
    p09: document.getElementById('f-p09'),
  };
  frames.p08.src = '../08_intro_sturm/?embed=1&standby=1';
  frames.p09.src = '../09_dein_ort/?embed=1&standby=1';
  let activeFrame = null;
  // Jede Welt meldet 'ready', sobald sie initialisiert ist — erst dann darf 'enter' gesendet werden
  const readyResolvers = {};
  const readyPromises = {};
  for (const k of Object.keys(frames))
    readyPromises[k] = new Promise(r => { readyResolvers[k] = r; });

  const CENTER = { x: 50, y: 46 };
  // Flug per RAF: easeInOutCubic (sanft beschleunigen + abbremsen) und leichte
  // Bogenkurve quer zur Flugrichtung — wirkt wie fliegen, nicht wie schieben.
  const pos = { x: 50, y: 24 };
  let flightId = 0;
  function flyTo(xPct, yPct, sizePx, ms = 1100) {
    const id = ++flightId; // laufenden Flug abbrechen, wenn ein neuer startet
    const sx = pos.x, sy = pos.y;
    const dx = xPct - sx, dy = yPct - sy;
    const dist = Math.hypot(dx, dy);
    const arc = Math.min(8, dist * 0.22);            // Bogenhöhe in %-Punkten
    const nl = dist || 1;
    const nx = -dy / nl, ny = dx / nl;               // Normale zur Flugrichtung
    if (sizePx) { particle.style.width = sizePx + 'px'; particle.style.height = sizePx + 'px'; }
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    return new Promise(res => {
      const t0 = performance.now();
      (function step(now) {
        if (id !== flightId) return res();
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        const bow = Math.sin(Math.PI * e) * arc;
        pos.x = sx + dx * e + nx * bow;
        pos.y = sy + dy * e + ny * bow;
        particle.style.left = pos.x + '%';
        particle.style.top = pos.y + '%';
        if (t < 1) requestAnimationFrame(step);
        else { pos.x = xPct; pos.y = yPct; res(); }
      })(t0);
    });
  }
  const centerOf = el => {
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / innerWidth * 100, y: (r.top + r.height / 2) / innerHeight * 100 };
  };

  // ---------- Portale ----------
  const PORTALS = {
    p08: { el: document.getElementById('p-08'), url: '../08_intro_sturm/', title: 'Der Sturm' },
    p09: {
      el: document.getElementById('p-09'), url: '../09_dein_ort/', title: 'Dein Ort',
      subs: [
        { m: 1, label: 'Wer ist wie du?', desc: 'Die Wahl-Heatmap' },
        { m: 2, label: 'Butter oder Nutella?', desc: 'Du wirst Teil der Karte' },
        { m: 3, label: 'Herzens-Orte', desc: 'Wohin dein Herz zieht' },
      ],
    },
    w3: { el: document.getElementById('p-w3'), qr: true, title: 'AR Anwendung' },
  };
  const titleEl = document.getElementById('title');
  const hintEl = document.getElementById('hint');

  const subEls = [];
  function subsOpen(key) {
    const P = PORTALS[key];
    if (!P.subs) return;
    // Eigene Untermenü-Szene: drei große Kreise mittig in einer Reihe
    const xs = [29, 50, 71];
    P.subs.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'sub-circle';
      el.innerHTML = `<h3>${s.label}</h3><p>${s.desc}</p>`;
      el.style.left = xs[i] + '%';
      el.style.top = '54%';
      el.addEventListener('click', ev => { ev.stopPropagation(); enter(key, s.m, el); });
      body.appendChild(el);
      subEls.push(el);
      requestAnimationFrame(() => el.classList.add('open'));
    });
  }
  function subsClose() { for (const el of subEls) el.remove(); subEls.length = 0; }

  async function focusPortal(key) {
    focusKey = key;
    const P = PORTALS[key];
    setState('portal');
    for (const k of Object.keys(PORTALS)) PORTALS[k].el.classList.toggle('focus', k === key);
    if (P.subs) {
      // Untermenü: Portale weichen komplett, eigene Szene mit Titel
      body.classList.add('submenu');
      titleEl.textContent = P.title + ' · Wähle eine Karte';
      hintEl.textContent = 'Klicke einen Kreis — dein Partikel taucht dort ein · Leere klicken = zurück';
      await flyTo(50, 24, 40, 900); // Partikel schwebt über der Kreis-Reihe
      subsOpen(key);
    } else if (P.qr) {
      // QR-Szene: Orb parkt links auf der Seite, der Code erscheint mittig
      body.classList.add('qr');
      titleEl.textContent = P.title;
      hintEl.textContent = 'Mit der Handy-Kamera scannen · Leere klicken = zurück';
      await flyTo(16, 46, 40, 900);
    } else {
      // Anflugpunkt in PIXELN ab Ring-Rand — Prozentwerte wären auf X und Y
      // verschieden lang, dann klebt der Orb am unteren Ring auf der Linie
      const r = P.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const tx = innerWidth * CENTER.x / 100, ty = innerHeight * CENTER.y / 100;
      let dx = tx - cx, dy = ty - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const gap = r.width / 2 + 48; // Ring-Radius + fester Abstand
      hintEl.textContent = 'Klicke den Kreis erneut — dein Partikel taucht ein';
      await flyTo((cx + dx * gap) / innerWidth * 100, (cy + dy * gap) / innerHeight * 100, 36, 900);
    }
  }

  async function backToMenu() {
    subsClose();
    focusKey = null;
    for (const k of Object.keys(PORTALS)) PORTALS[k].el.classList.remove('focus');
    setState('menu');
    titleEl.textContent = 'Der Partikel-Hub · Wähle eine Welt';
    hintEl.textContent = 'Klicke ein Portal — dein Partikel fliegt dorthin';
    await flyTo(CENTER.x, CENTER.y, 44, 900);
  }

  async function enter(key, map, viaEl) {
    const target = viaEl ? centerOf(viaEl) : centerOf(PORTALS[key].el);
    subsClose();
    setState('enter'); // Portale/Untermenü blenden aus, Partikel bleibt sichtbar
    await Promise.all([ // 1) Eintauchen in den Kreis, parallel auf die Welt warten
      flyTo(target.x, target.y, 16, 700),
      Promise.race([readyPromises[key], new Promise(r => setTimeout(r, 8000))]),
    ]);
    // 2) Welt starten (sie ist schon geladen) — ihre Eintritts-Animation beginnt
    //    unten mittig, genau wo der Hub-Partikel gleich ankommt
    activeFrame = frames[key];
    activeFrame.contentWindow.postMessage({
      type: 'enter', name: visitor.name, age: visitor.age,
      party: visitor.party, plz: (visitor.loc && visitor.loc.plz) || '10115', map,
    }, location.origin);
    await flyTo(50, 72, 34, 1100); // nahtlose Übergabe an den Welt-Partikel
    activeFrame.classList.add('active');
    setState('world'); // iframe blendet ein, Hub-Partikel blendet genau dort aus
  }

  async function leave() {
    setState('leave'); // iframe blendet aus, Partikel erscheint wieder
    if (activeFrame) activeFrame.classList.remove('active');
    await flyTo(CENTER.x, CENTER.y, 44, 1100);
    if (activeFrame) {
      activeFrame.contentWindow.postMessage({ type: 'reset' }, location.origin);
      activeFrame = null;
    }
    await backToMenu();
  }

  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'ready')
      for (const k of Object.keys(frames))
        if (frames[k].contentWindow === e.source) readyResolvers[k]();
    // exit zaehlt nur von der AKTIVEN Welt — Standby-Frames (z.B. deren Idle) duerfen
    // die laufende Welt nicht beenden
    if (e.data.type === 'exit' && hubState === 'world' &&
        activeFrame && e.source === activeFrame.contentWindow) leave();
  });

  for (const k of Object.keys(PORTALS))
    PORTALS[k].el.addEventListener('click', ev => {
      ev.stopPropagation();
      if (hubState === 'menu') focusPortal(k);
      else if (hubState === 'portal' && k === focusKey && !PORTALS[k].subs && !PORTALS[k].qr)
        enter(k, null);
      else if (hubState === 'portal' && k !== focusKey) { subsClose(); focusPortal(k); }
    });
  document.addEventListener('click', e => {
    if (hubState !== 'portal') return;
    if (e.target.closest('.ring, .sub-circle, #qr .card')) return;
    backToMenu(); // Klick ins Leere: eine Stufe zurück
  });

  // ---------- Onboarding ----------
  const sections = [...document.querySelectorAll('#onb section')];
  const dots = [...document.querySelectorAll('#onb-dots span')];
  let step = 0;
  function showStep(i) {
    step = i;
    sections.forEach((s, k) => s.classList.toggle('active', k === i));
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    const f = sections[i].querySelector('input');
    if (f) setTimeout(() => f.focus(), 60);
  }
  const oName = document.getElementById('o-name');
  const oAge = document.getElementById('o-age');
  const oLoc = document.getElementById('o-loc');
  const oAc = document.getElementById('o-ac');

  function submitName() {
    const n = oName.value.trim().toUpperCase();
    if (!n) { oName.focus(); return; }
    visitor.name = n;
    pname.textContent = n;
    showStep(1);
  }
  function submitAge() {
    const a = parseInt(oAge.value, 10);
    if (!(a >= 16 && a <= 99)) { oAge.focus(); return; }
    visitor.age = a;
    showStep(2);
  }
  document.querySelector('[data-next="0"]').addEventListener('click', submitName);
  document.querySelector('[data-next="1"]').addEventListener('click', submitAge);
  // Enter bestätigt IMMER den aktuellen Schritt — unabhängig davon, wo der Fokus liegt
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || hubState !== 'onboarding') return;
    e.preventDefault();
    if (step === 0) submitName();
    else if (step === 1) submitAge();
    else if (step === 3) {
      const l = resolveLocation(oLoc.value);
      if (l) finishOnboarding(l);
    }
  });

  {
    const row = document.getElementById('o-party');
    for (const pt of data.parteien.concat(['Nicht gewählt / keine Angabe'])) {
      const b = document.createElement('button');
      b.textContent = pt;
      b.addEventListener('click', () => {
        visitor.party = pt === 'Nicht gewählt / keine Angabe' ? 'Keine Angabe' : pt;
        showStep(3);
      });
      row.appendChild(b);
    }
  }

  function finishOnboarding(loc) {
    visitor.loc = loc;
    oAc.innerHTML = '';
    setState('menu');
    document.getElementById('hint').textContent = 'Klicke ein Portal — dein Partikel fliegt dorthin';
    flyTo(CENTER.x, CENTER.y, 44, 900); // Partikel schwebt in die Menü-Mitte
  }
  oLoc.addEventListener('input', () => {
    const q = oLoc.value.trim().toLowerCase();
    oAc.innerHTML = '';
    if (q.length < 2) return;
    const hits = [];
    for (const p of placeIndex) {
      if (p[0].startsWith(q)) { hits.push(p); if (hits.length >= 8) break; }
    }
    for (const h of hits) {
      const li = document.createElement('li');
      li.textContent = h[1];
      li.addEventListener('click', () => finishOnboarding(entryFor(h[2])));
      oAc.appendChild(li);
    }
  });

  // ---------- Idle-Reset (Hub-Ebene) ----------
  let idleT = null;
  function armIdle() {
    clearTimeout(idleT);
    idleT = setTimeout(onIdle, IDLE_MS);
  }
  function onIdle() {
    // In den Welten regelt deren eigenes Idle den Ausstieg (exit -> Hub)
    if (hubState === 'menu' || hubState === 'portal' ||
        (hubState === 'onboarding' && step > 0)) resetHub();
    else armIdle();
  }
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'])
    addEventListener(ev, armIdle, { passive: true });
  armIdle();

  const fade = document.getElementById('fade');
  function resetHub() {
    fade.classList.add('on');
    setTimeout(() => {
      subsClose();
      if (activeFrame) { activeFrame.classList.remove('active'); activeFrame = null; }
      for (const f of Object.values(frames)) // alle Welten zurück in den Standby
        f.contentWindow.postMessage({ type: 'reset' }, location.origin);
      visitor.name = ''; visitor.age = null; visitor.party = null; visitor.loc = null;
      oName.value = ''; oAge.value = ''; oLoc.value = ''; oAc.innerHTML = '';
      pname.textContent = '';
      flightId++; // laufenden Flug stoppen
      pos.x = 50; pos.y = 24;
      particle.style.left = '50%'; particle.style.top = '24%';
      particle.style.width = '44px'; particle.style.height = '44px';
      setState('onboarding');
      showStep(0);
      fade.classList.remove('on');
    }, 1300);
  }

  // ---------- Dev-Hooks ----------
  const skip = Q.get('skip');
  if (skip) {
    Object.assign(visitor, { name: 'TEST', age: 30, party: 'SPD', loc: entryFor('10115') });
    pname.textContent = visitor.name;
    if (skip === '08') enter('p08', null);
    else if (skip === '09') enter('p09', +(Q.get('map') || 1));
    else if (skip === '3') focusPortal('w3');
    else { setState('menu'); flyTo(CENTER.x, CENTER.y, 44, 600); }
  } else {
    showStep(0);
  }
})();
