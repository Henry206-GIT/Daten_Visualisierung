// Einmaliges Bake-Script: Wahlkreis-Zentroide + echte Zweitstimmen je Wahlkreis -> wk.json
// Quellen (amtlich, Bundeswahlleiterin):
//   - btw25_geometrie_wahlkreise_kml.zip (doc.kml, 299 Wahlkreise)
//   - data/raw/kerg2.csv (Ergebnisse, Gebietsart=Wahlkreis, Stimme==2)
// Aufruf: node bake_wk.mjs <pfad/zu/doc.kml> <pfad/zu/kerg2.csv>
// Ausgabe: ../wk.json = [[lat, lng, {SPD: 30558, ...}], ...] (299 Eintraege)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [kmlPath, kergPath] = process.argv.slice(2);
if (!kmlPath || !kergPath) { console.error('Aufruf: node bake_wk.mjs <doc.kml> <kerg2.csv>'); process.exit(1); }

const dataJson = JSON.parse(readFileSync(join(here, '../../data.json'), 'utf8'));
const HAUPT = new Set(dataJson.parteien);

// --- KML: Name -> Zentroid (Mittel aller Polygon-Punkte) ---
const kml = readFileSync(kmlPath, 'utf8');
const centroids = {}; // name -> [lat, lng]
for (const pm of kml.match(/<Placemark[\s\S]*?<\/Placemark>/g)) {
  const name = pm.match(/<name>([\s\S]*?)<\/name>/)[1].trim();
  let sx = 0, sy = 0, n = 0;
  for (const block of pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
    for (const tup of block.replace(/<\/?coordinates>/g, '').trim().split(/\s+/)) {
      const [lng, lat] = tup.split(',').map(Number);
      if (isFinite(lat) && isFinite(lng)) { sx += lng; sy += lat; n++; }
    }
  }
  centroids[name] = [Math.round(sy / n * 1e4) / 1e4, Math.round(sx / n * 1e4) / 1e4];
}

// --- kerg2: Name -> {Partei: Zweitstimmen} ---
const lines = readFileSync(kergPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const start = lines.findIndex(l => l.startsWith('Wahlart;'));
const header = lines[start].split(';');
const col = name => header.indexOf(name);
const iArt = col('Gebietsart'), iNr = col('Gebietsnummer'), iName = col('Gebietsname'),
  iUegNr = col('UegGebietsnummer'), iGrArt = col('Gruppenart'),
  iGr = col('Gruppenname'), iStimme = col('Stimme'), iAnz = col('Anzahl');
const landName = {}; // Land-Nr -> Name
const votes = {};    // WK-Name -> {party: n}
const wkLandNr = {}; // WK-Name -> Land-Nr
for (const line of lines.slice(start + 1)) {
  const f = line.split(';');
  if (f[iArt] === 'Land') { landName[f[iNr]] = f[iName]; continue; }
  if (f[iArt] !== 'Wahlkreis' || f[iGrArt] !== 'Partei' || f[iStimme] !== '2') continue;
  wkLandNr[f[iName]] = f[iUegNr];
  const party = (f[iGr] || '').trim();
  if (!HAUPT.has(party)) continue;
  const n = parseInt(f[iAnz], 10);
  if (!isFinite(n)) continue;
  (votes[f[iName]] = votes[f[iName]] || {})[party] = n;
}

// --- Join ueber Wahlkreisnamen ---
const out = [];
const misses = [];
for (const [name, c] of Object.entries(centroids)) {
  const land = landName[wkLandNr[name]];
  if (votes[name] && land) out.push([c[0], c[1], votes[name], land]);
  else misses.push(name);
}
if (misses.length) { console.error('Ohne Ergebnis-Match:', misses); process.exit(1); }
if (out.length !== 299) { console.error('Erwartet 299 Wahlkreise, habe', out.length); process.exit(1); }

writeFileSync(join(here, '../wk.json'), JSON.stringify(out));
const spdSum = out.reduce((s, w) => s + (w[2].SPD || 0), 0);
console.log(`wk.json: ${out.length} Wahlkreise, SPD-Summe ${spdSum} (Soll ~8,15 Mio)`);
console.log('Beispiel:', JSON.stringify(out[0]).slice(0, 140));
