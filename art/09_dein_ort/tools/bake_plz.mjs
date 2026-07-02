// Einmaliges Bake-Script: zauberware-PLZ-Datensatz -> getrimmtes plz.json
// Quelle: https://github.com/zauberware/postal-codes-json-xml-csv (data/DE.zip -> zipcodes.de.json)
// Aufruf: node bake_plz.mjs <pfad/zu/zipcodes.de.json>
// Ausgabe: ../plz.json  = { "01067": [51.0596, 13.7264, "Dresden", "Sachsen"], ... }
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('Aufruf: node bake_plz.mjs <zipcodes.de.json>'); process.exit(1); }

const rows = JSON.parse(readFileSync(src, 'utf8'));
const dataJson = JSON.parse(readFileSync(join(here, '../../data.json'), 'utf8'));
const knownStates = new Set(dataJson.laender.map(l => l.name));

// Firmen-/Großkunden-PLZ aussortieren, wenn erkennbar
const looksCorporate = p => /\b(GmbH|AG|SE|KG|e\.V\.|Co\.|Inc\.|Ltd)\b/i.test(p);

// Datensatz mischt englische/abweichende Ländernamen rein -> auf data.json-Namen normalisieren
const stateAlias = {
  'Land Berlin': 'Berlin',
  'Mecklenburg-Western Pomerania': 'Mecklenburg-Vorpommern',
  'Bavaria': 'Bayern',
  'Lower Saxony': 'Niedersachsen',
  'Saxony-Anhalt': 'Sachsen-Anhalt',
  'Thuringia': 'Thüringen',
  'Saxony': 'Sachsen',
};

const out = {};
let corporateOnly = 0;
for (const r of rows) {
  const plz = r.zipcode;
  const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
  if (!plz || !isFinite(lat) || !isFinite(lng)) continue;
  const state = stateAlias[r.state] || r.state;
  if (!knownStates.has(state)) continue; // Zeilen ohne/mit kaputtem Bundesland verwerfen
  const entry = [Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4, r.place, state];
  const existing = out[plz];
  if (!existing) { out[plz] = entry; continue; }
  // echten Ortsnamen gegenüber Firmennamen bevorzugen
  if (looksCorporate(existing[2]) && !looksCorporate(r.place)) out[plz] = entry;
}
for (const [plz, e] of Object.entries(out)) if (looksCorporate(e[2])) corporateOnly++;

// Assertion: state-Werte muessen exakt den 16 laender[].name aus data.json entsprechen
const states = new Set(Object.values(out).map(e => e[3]));
const unknown = [...states].filter(s => !knownStates.has(s));
const missing = [...knownStates].filter(s => !states.has(s));
if (unknown.length || missing.length) {
  console.error('State-Mismatch! unbekannt:', unknown, 'fehlend:', missing);
  process.exit(1);
}

writeFileSync(join(here, '../plz.json'), JSON.stringify(out));
const keys = Object.keys(out);
console.log(`plz.json: ${keys.length} PLZ, ${states.size} Bundesländer, ${corporateOnly} nur-Firmen-PLZ`);
for (const k of ['10115', '01067', '80331']) console.log(k, out[k]);
