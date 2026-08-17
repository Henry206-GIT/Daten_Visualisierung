// Fake-Datensatz fuer die besucher-generierten Karten 2 (Butter/Nutella) und
// 3 (Herzens-Orte): deterministisch (mulberry32), Positionen = echte PLZ-Orte.
// Aufruf: node bake_seed23.mjs   -> ../seed23.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const plz = JSON.parse(readFileSync(join(here, '../plz.json'), 'utf8'));
const entries = Object.entries(plz); // [plzKey, [lat,lng,ort,land]]

let s = 20250817;
const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = () => entries[Math.floor(rnd() * entries.length)];
const jit = () => (rnd() - 0.5) * 0.06; // ~3 km Streuung, damit nicht alle exakt aufeinander liegen

// Karte 2: 420 Antworten. Leichte Regional-Tendenz: Sueden/Westen mehr Butter,
// Norden/Osten mehr Nutella (rein fiktiv, macht die Karte lesbar).
const k2 = [];
for (let i = 0; i < 420; i++) {
  const [, e] = pick();
  const pButter = 0.45 + (e[0] < 51.5 ? 0.12 : -0.08) + (e[1] < 10 ? 0.06 : -0.04);
  const r = rnd();
  const answer = r < 0.06 ? 'Beides' : (rnd() < pButter ? 'Butter' : 'Nutella');
  k2.push({ answer, lat: +(e[0] + jit()).toFixed(4), lng: +(e[1] + jit()).toFixed(4),
    state: e[3], ts: 1755400000000 + i * 137000, seed: true });
}

// Karte 3: 260 Herzens-Orte. Ziele gewichtet: beliebte Sehnsuchtsorte haeufiger.
const FAV = ['20095','80331','10115','50667','01067','23552','78462','83471','18439','60311',
  '48143','04109','79098','24937','93047','69117','54290','06108','26382','99084','25980','82467'];
const favSet = FAV.filter(k => plz[k]);
const k3 = [];
for (let i = 0; i < 260; i++) {
  const [, from] = pick();
  const toKey = rnd() < 0.55 ? favSet[Math.floor(rnd() * favSet.length)] : pick()[0];
  const to = plz[toKey];
  k3.push({ fromLat: +(from[0] + jit()).toFixed(4), fromLng: +(from[1] + jit()).toFixed(4),
    toLat: +(to[0] + jit()).toFixed(4), toLng: +(to[1] + jit()).toFixed(4),
    place: to[2], state: to[3], ts: 1755400000000 + i * 211000, seed: true });
}
writeFileSync(join(here, '../seed23.json'), JSON.stringify({ k2, k3 }));
const nb = k2.filter(a => a.answer === 'Butter').length, nn = k2.filter(a => a.answer === 'Nutella').length;
console.log(`seed23.json: Karte2 ${k2.length} (Butter ${nb}, Nutella ${nn}), Karte3 ${k3.length} Herzens-Orte`);
