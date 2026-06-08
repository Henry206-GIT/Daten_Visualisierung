/* Stimmungsgebirge — three.js r128 UMD */
(function () {
  'use strict';

  // ─── Scene setup ──────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080c);
  scene.fog = new THREE.FogExp2(0x07080c, 0.022);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 14, 38);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  });

  // ─── Lights ───────────────────────────────────────────────────────────────
  // Soft ambient + a cool directional for depth shading on StandardMaterial
  const ambient = new THREE.AmbientLight(0x1a1d2e, 2.2);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xd0d8ff, 1.4);
  dirLight.position.set(20, 40, 20);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x2a0a30, 0.6);
  fillLight.position.set(-15, 5, -20);
  scene.add(fillLight);

  // ─── Ground plane ─────────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(120, 120);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d14,
    roughness: 0.95,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  // Subtle ground glow disc
  const glowGeo = new THREE.CircleGeometry(28, 64);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x1a1030,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.005;
  scene.add(glow);

  // ─── Particles ────────────────────────────────────────────────────────────
  const PARTICLE_COUNT = 1800;
  const pPositions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pPositions[i * 3 + 0] = (Math.random() - 0.5) * 90;
    pPositions[i * 3 + 1] = Math.random() * 28;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x8888cc,
    size: 0.12,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ─── Build towers after data load ─────────────────────────────────────────
  const GRID_COLS = 4;
  const GRID_ROWS = 4;
  const SPACING = 7.2;
  const TOWER_W = 2.4;
  const HEIGHT_SCALE = 0.28; // beteiligung 80-85 → ~22-24 units tall

  // Party order for consistent stacking (bottom to top)
  const PARTY_ORDER = ['CDU', 'CSU', 'SPD', 'AfD', 'GRÜNE', 'FDP', 'Die Linke', 'BSW'];

  let towers = []; // { mesh group, land name, position }
  let landNames = [];
  let focusIndex = 0;

  function buildLegend(farben) {
    const leg = document.getElementById('legend');
    PARTY_ORDER.forEach(party => {
      const color = farben[party] || '#888888';
      const div = document.createElement('div');
      div.className = 'leg-item';
      div.innerHTML = `
        <div class="leg-dot" style="background:${color};box-shadow:0 0 5px ${color}88;"></div>
        <span class="leg-label">${party}</span>
      `;
      leg.appendChild(div);
    });
  }

  function buildTowers(data) {
    const { laender, farben } = data;

    buildLegend(farben);

    const offsetX = -((GRID_COLS - 1) * SPACING) / 2;
    const offsetZ = -((GRID_ROWS - 1) * SPACING) / 2;

    laender.forEach((land, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = offsetX + col * SPACING;
      const z = offsetZ + row * SPACING;

      const totalHeight = land.beteiligung * HEIGHT_SCALE;
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      let currentY = 0;

      PARTY_ORDER.forEach(party => {
        const share = land.shares[party];
        if (!share || share <= 0) return;

        const segH = (share / 100) * totalHeight;
        const hexColor = farben[party] || '#888888';
        const color = new THREE.Color(hexColor);

        // Main segment — MeshStandardMaterial with emissive glow
        const geo = new THREE.BoxGeometry(TOWER_W, segH, TOWER_W);
        const mat = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 0.55,
          roughness: 0.35,
          metalness: 0.12,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = currentY + segH / 2;
        group.add(mesh);

        // Additive glow halo (slightly wider, shorter alpha box)
        const haloGeo = new THREE.BoxGeometry(TOWER_W + 0.18, segH - 0.04, TOWER_W + 0.18);
        const haloMat = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.BackSide,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.y = currentY + segH / 2;
        group.add(halo);

        currentY += segH;
      });

      // Thin bright cap line at top
      const capGeo = new THREE.BoxGeometry(TOWER_W + 0.05, 0.06, TOWER_W + 0.05);
      const capMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = totalHeight;
      group.add(cap);

      // Ground glow puddle beneath each tower
      const pudGeo = new THREE.CircleGeometry(TOWER_W * 0.9, 24);
      const pudMat = new THREE.MeshBasicMaterial({
        color: 0x3318aa,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pud = new THREE.Mesh(pudGeo, pudMat);
      pud.rotation.x = -Math.PI / 2;
      pud.position.y = 0.003;
      group.add(pud);

      scene.add(group);
      towers.push({ group, land, x, z, totalHeight });
      landNames.push(land.name);
    });
  }

  // ─── Camera orbit state ───────────────────────────────────────────────────
  let orbitAngle = 0;
  const ORBIT_RADIUS = 36;
  const ORBIT_SPEED = 0.00028; // radians/ms — ~22s full circle
  const BOB_SPEED = 0.00018;
  const BOB_AMOUNT = 3.2;
  const CAM_BASE_Y = 13;
  const CAM_LOOK_Y = 8;

  // ─── Focus land (closest to camera) ──────────────────────────────────────
  const landEl = document.getElementById('landName');

  function updateFocus() {
    if (!towers.length) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    let minDist = Infinity;
    let nearest = 0;
    towers.forEach((t, i) => {
      const d = (t.x - cx) ** 2 + (t.z - cz) ** 2;
      if (d < minDist) { minDist = d; nearest = i; }
    });
    if (nearest !== focusIndex) {
      focusIndex = nearest;
      const land = towers[focusIndex].land;
      const bet = land.beteiligung.toFixed(2).replace('.', ',');
      landEl.textContent = `${land.name}  —  ${bet} % Beteiligung`;
    }
  }

  // ─── Animation loop ───────────────────────────────────────────────────────
  let lastTime = 0;

  function animate(time) {
    requestAnimationFrame(animate);

    const dt = time - lastTime;
    lastTime = time;

    orbitAngle += ORBIT_SPEED * dt;

    camera.position.x = Math.cos(orbitAngle) * ORBIT_RADIUS;
    camera.position.z = Math.sin(orbitAngle) * ORBIT_RADIUS;
    camera.position.y = CAM_BASE_Y + Math.sin(time * BOB_SPEED) * BOB_AMOUNT;

    camera.lookAt(0, CAM_LOOK_Y, 0);

    // Gentle particle drift
    particles.rotation.y += 0.00005 * dt;

    // Subtle emissive pulse on all towers
    const pulse = 0.45 + 0.12 * Math.sin(time * 0.0006);
    towers.forEach(({ group }) => {
      group.children.forEach(child => {
        if (child.material && child.material.emissiveIntensity !== undefined) {
          child.material.emissiveIntensity = pulse;
        }
      });
    });

    updateFocus();
    renderer.render(scene, camera);
  }

  // ─── Load data and start ──────────────────────────────────────────────────
  fetch('../data.json')
    .then(r => r.json())
    .then(data => {
      buildTowers(data);
      requestAnimationFrame(animate);
    })
    .catch(err => {
      console.error('data.json load failed:', err);
      // Start anyway so scene is at least visible
      requestAnimationFrame(animate);
    });

}());
