// Einmaliges Bake-Script: Repräsentative Wahlstatistik BTW2025 -> alter.json
// Quelle (amtlich, Bundeswahlleiterin/Destatis, DL-DE-BY-2.0):
//   btw25_rws_bst2.csv — Stimmabgabe nach Geschlecht und Geburtsjahresgruppen in den Ländern
// Aufruf: node bake_alter.mjs <pfad/zu/btw25_rws_bst2.csv>
// Ausgabe: ../alter.json = { "Bayern": { "18–24": {SPD: n, ...}, ... }, ... }
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('Aufruf: node bake_alter.mjs <btw25_rws_bst2.csv>'); process.exit(1); }

const LAND = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg',
  HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz',
  SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein', TH: 'Thüringen',
};
// Geburtsjahresgruppe -> Altersgruppe zur Wahl am 23.02.2025
const GRUPPE = {
  '2001-2007': '18–24', '1991-2000': '25–34', '1981-1990': '35–44',
  '1966-1980': '45–59', '1956-1965': '60–69', '<=1955': '70+',
};

const lines = readFileSync(src, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#'));
const header = lines[0].split(';');
const iBSW = header.indexOf('dar. BSW');
const PARTY_COLS = {};
for (const p of ['SPD', 'CDU', 'GRÜNE', 'FDP', 'AfD', 'CSU', 'Die Linke'])
  PARTY_COLS[p] = header.indexOf(p);
PARTY_COLS.BSW = iBSW;
for (const [p, i] of Object.entries(PARTY_COLS))
  if (i < 0) { console.error('Spalte fehlt:', p); process.exit(1); }

const out = {};
for (const line of lines.slice(1)) {
  const f = line.split(';');
  const land = LAND[f[0]];
  const bracket = GRUPPE[f[3]];
  if (!land || !bracket || f[1] !== '2' || f[2] !== 'Summe') continue;
  const o = (out[land] = out[land] || {});
  const b = (o[bracket] = o[bracket] || {});
  for (const [p, i] of Object.entries(PARTY_COLS)) {
    const n = parseInt(f[i], 10);
    if (isFinite(n)) b[p] = n;
  }
}

const laender = Object.keys(out);
if (laender.length !== 16) { console.error('Erwartet 16 Länder, habe', laender.length, laender); process.exit(1); }
for (const l of laender)
  if (Object.keys(out[l]).length !== 6) { console.error('Land ohne 6 Gruppen:', l); process.exit(1); }

writeFileSync(join(here, '../alter.json'), JSON.stringify(out));
const by = out['Bayern'];
console.log('alter.json: 16 Länder × 6 Altersgruppen.');
console.log('Bayern 18–24:', JSON.stringify(by['18–24']));
console.log('Bayern 70+:  ', JSON.stringify(by['70+']));
