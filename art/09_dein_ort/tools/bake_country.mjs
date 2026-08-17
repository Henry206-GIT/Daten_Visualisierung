// Laender-Paket fuer die Heatmap-Variante ?land=fr|it: Regionen-GeoJSON + Orte mit
// Einwohnern (GeoNames cities5000, CC-BY 4.0) -> country_XX.json
// Aufruf: node bake_country.mjs <fr|it> <regions.geojson> <cities5000.txt>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [cc, regPath, citiesPath] = process.argv.slice(2);
const CFG = {
  fr: { code: 'FR', name: 'Frankreich', nameKey: 'nom', bbox: { s: 41.3, n: 51.2, w: -5.3, e: 9.7 },
        pov: { lat: 46.6, lng: 2.4 }, mainland: f => true },
  it: { code: 'IT', name: 'Italien', nameKey: 'reg_name', bbox: { s: 36.6, n: 47.2, w: 6.6, e: 18.6 },
        pov: { lat: 42.5, lng: 12.5 }, mainland: f => true },
}[cc];
if (!CFG) { console.error('Land: fr|it'); process.exit(1); }

const reg = JSON.parse(readFileSync(regPath, 'utf8'));
// Geometrie vereinfachen: jede n-te Koordinate behalten (Kiosk-Last), Namen normalisieren
const step = reg.features.length > 15 ? 4 : 1;
const thin = ring => ring.filter((_, i) => i % step === 0 || i === ring.length - 1);
const features = reg.features.filter(CFG.mainland).map(f => {
  const g = f.geometry;
  const coords = g.type === 'Polygon' ? g.coordinates.map(thin)
    : g.coordinates.map(poly => poly.map(thin));
  return { type: 'Feature', properties: { name: f.properties[CFG.nameKey], __de: true },
    geometry: { type: g.type, coordinates: coords } };
});

// Orte: [lat, lng, name, pop] — Region wird zur Laufzeit per Naechster-Zentroid zugeordnet
const cities = readFileSync(citiesPath, 'utf8').split('\n').filter(l => l)
  .map(l => l.split('\t')).filter(f => f[8] === CFG.code && +f[14] > 0)
  .map(f => [+(+f[4]).toFixed(4), +(+f[5]).toFixed(4), f[1], +f[14]]);
const out = { name: CFG.name, bbox: CFG.bbox, pov: CFG.pov, features, cities };
writeFileSync(join(here, `../country_${cc}.json`), JSON.stringify(out));
console.log(`country_${cc}.json: ${features.length} Regionen, ${cities.length} Orte, ${(JSON.stringify(out).length/1024)|0} KB`);
