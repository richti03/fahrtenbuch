import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { recalculate, nextIndex } from '../js/fifo.js';
import { validateData } from '../js/storage.js';
import { estimateConsumption } from '../js/simulation.js';
import { formatFuelDateTimeInput, fuelDetailHtml, renderFuel } from '../js/tanken.js';
import { tripDetailHtml, renderTrips } from '../js/fahrten.js';
import { renderDashboard } from '../js/dashboard.js';
globalThis.crypto ??= webcrypto;
const tank = (id, datum, liter, preisProLiter, extra = {}) => ({ id, lokaleKennung: id, datum, datumZeit: `${datum}T12:00:00Z`, index: 1, liter, preisProLiter, notizen: '', ...extra });
const base = () => ({ fahrten: [], tankvorgaenge: [], favoriten: [], einstellungen: { tankvolumen: 80, waehrung: 'EUR' } });
const trip = { id: 'fahrt', datum: '2026-01-03', index: 1, kilometer: 800, verbrauchPro100km: 10, start: 'A', ziel: 'B', notizen: '' };
const run = (name, fn) => { fn(); console.log(`ok - ${name}`); };
run('Mehrbestand: ungerundeter Mittelwert, echte Ausgaben und späterer Verbrauch', () => {
  const d = base();
  d.tankvorgaenge = [tank('a', '2026-01-01', 10, 1), tank('b', '2026-01-02', 67, 2, { vollgetankt: true, zielbestandLiter: 80 })];
  recalculate(d);
  assert.equal(d.berechnung.kraftstoffbestand, 80);
  assert.equal(d.berechnung.kraftstoffwert, 149.61);
  assert.equal(d.tankvorgaenge[1].korrektur.preisProLiter, 144 / 77);
  assert.equal(d.tankvorgaenge[1].gesamtpreis, 134);
  assert.equal(d.fahrten.length, 0);
  const snapshot = JSON.stringify(d);
  recalculate(d); assert.equal(JSON.stringify(d), snapshot);
  d.fahrten.push({ ...trip }); recalculate(d);
  assert.equal(d.fahrten[0].kosten, 149.61);
  assert.equal(d.berechnung.kraftstoffbestand, 0);
  assert.equal(d.tankvorgaenge[1].verbrauchteLiter, 67);
  assert.equal(d.tankvorgaenge[1].korrekturVerbrauchteLiter, 3);
  assert.equal(d.fahrten[0].fifoAnteile.at(-1).istKorrektur, true);
});
run('Minderbestand: FIFO-Wert, Verwaltung, Dashboard und Prognose', () => {
  const d = base();
  d.tankvorgaenge = [tank('a', '2026-01-01', 2, 1.6), tank('b', '2026-01-02', 81, 1.7, { vollgetankt: true, zielbestandLiter: 80 })];
  recalculate(d);
  const correction = d.fahrten[0];
  assert.equal(correction.kosten, 4.9);
  assert.deepEqual(correction.fifoAnteile.map(p => p.liter), [2, 1]);
  assert.equal(d.berechnung.kraftstoffbestand, 80);
  assert.equal(d.berechnung.kraftstoffwert, 136);
  assert.ok(!tripDetailHtml(correction, 'EUR').includes('data-trip-edit'));
  assert.ok(fuelDetailHtml(d.tankvorgaenge[1], 'EUR').includes('data-fuel-trip="korrektur-b"'));
  assert.equal(nextIndex(d.fahrten, '2026-01-02'), 1);
  assert.equal(estimateConsumption([{ ...correction, kilometer: 100, verbrauchPro100km: 20 }], 100, '2026-01-03'), null);
  const elements = { '#chartFrom': {value: ''}, '#chartTo': {value: ''}, '#statsGrid': {innerHTML: ''} };
  globalThis.document = { querySelector: s => elements[s] };
  globalThis.window = {};
  renderDashboard(d);
  assert.match(elements['#statsGrid'].innerHTML, /Anzahl Fahrten<\/span><strong>0/);
  assert.match(elements['#statsGrid'].innerHTML, /Fahrtkosten insgesamt<\/span><strong>0,00/);
  const old = JSON.stringify(d); recalculate(d); assert.equal(JSON.stringify(d), old);
  d.tankvorgaenge[1].liter = 70; recalculate(d);
  assert.equal(d.fahrten.length, 0); assert.equal(d.tankvorgaenge[1].korrektur.liter, 8);
  d.einstellungen.tankvolumen = 100; recalculate(d); assert.equal(d.berechnung.kraftstoffbestand, 80);
  d.tankvorgaenge.pop(); recalculate(d); assert.equal(d.fahrten.length, 0);
});
run('Exakter Bestand, Tagesreihenfolge, mehrere Abgleiche und historische Änderungen', () => {
  const d = base();
  d.tankvorgaenge = [tank('a', '2026-01-03', 80, 2, { vollgetankt: true, zielbestandLiter: 80, berechnungsPosition: 1 })];
  d.fahrten = [{ ...trip, kilometer: 100, berechnungsPosition: 2 }]; recalculate(d);
  assert.equal(d.tankvorgaenge[0].korrektur, null); assert.equal(d.berechnung.kraftstoffbestand, 70);
  d.tankvorgaenge.push(tank('b', '2026-01-04', 15, 3, { vollgetankt: true, zielbestandLiter: 80 }));
  recalculate(d); assert.equal(d.fahrten.filter(f => f.istKorrektur).length, 1);
  d.fahrten[0].kilometer = 200; recalculate(d);
  assert.equal(d.fahrten.filter(f => f.istKorrektur).length, 0);
  assert.equal(d.tankvorgaenge[1].korrektur.liter, 5);
  d.tankvorgaenge[1].vollgetankt = false; recalculate(d); assert.equal(d.berechnung.kraftstoffbestand, 75);
});
run('JSON und Supabase-Abbildungen erhalten Kennungen, Korrekturen und Notizen', () => {
  // Evaluate the actual mapping functions independently of the browser CDN client.
  const source = readFileSync(new URL('../js/supabase-sync.js', import.meta.url), 'utf8');
  const mappings = source.slice(source.indexOf('function mapTripsFromRemote'));
  const context = vm.createContext({ crypto: webcrypto, makeId: (d, i) => `${d}-${String(i).padStart(2, '0')}`, nextIndex, formatFuelDateTimeInput });
  vm.runInContext(mappings, context);
  const d = validateData(base());
  d.tankvorgaenge = [tank('a', '2026-01-01', 85, 2, { vollgetankt: true, zielbestandLiter: 80, notizen: 'Beleg' })]; recalculate(d);
  const fuelRows = d.tankvorgaenge.map(t => context.mapFuelToRemote(t, 'user'));
  const tripRows = d.fahrten.map(t => context.mapTripToRemote(t, 'user'));
  const loaded = validateData(JSON.parse(JSON.stringify({ ...d, tankvorgaenge: context.mapFuelFromRemote(fuelRows), fahrten: context.mapTripsFromRemote(tripRows) })));
  recalculate(loaded);
  assert.equal(loaded.tankvorgaenge[0].notizen, 'Beleg');
  assert.equal(loaded.tankvorgaenge[0].lokaleKennung, 'a');
  assert.equal(loaded.fahrten.length, 1); assert.equal(loaded.fahrten[0].korrekturTankKennung, 'a');
  assert.equal(loaded.fahrten[0].korrekturLiter, 5); assert.equal(loaded.fahrten[0].kosten, 10);
  assert.equal(loaded.berechnung.kraftstoffbestand, 80);
  const legacy = validateData({ ...base(), tankvorgaenge: [{ id:'legacy', datum:'2026-01-01', index:1, liter:10, preisProLiter:2 }] });
  recalculate(legacy); assert.equal(legacy.berechnung.kraftstoffbestand, 10); assert.ok(legacy.tankvorgaenge[0].lokaleKennung);
});
run('Desktop- und Mobilansichten markieren Korrekturen und zeigen keine unabhängige Bearbeitung', () => {
  const elements = {};
  for (const id of ['tripRows', 'tripCards', 'tripSearch', 'tripFrom', 'tripTo', 'kmMin', 'kmMax', 'consMin', 'consMax', 'fuelStockGrid', 'fuelRows', 'fuelCards']) {
    elements[`#${id}`] = { value: '', innerHTML: '', querySelectorAll: () => [] };
  }
  globalThis.document = { querySelector: s => elements[s] };
  const d = base();
  d.tankvorgaenge = [tank('a', '2026-01-01', 85, 2, { vollgetankt: true, zielbestandLiter: 80 })];
  d.tankvorgaenge.push(tank('b', '2026-01-02', 1, 2, { vollgetankt: true, zielbestandLiter: 90 }));
  recalculate(d); renderTrips(d, 'EUR', () => {}); renderFuel(d, 'EUR', () => {});
  for (const id of ['tripRows', 'tripCards', 'fuelRows', 'fuelCards']) {
    assert.match(elements[`#${id}`].innerHTML, /correction-row/);
    assert.match(elements[`#${id}`].innerHTML, /Bestandskorrektur/);
  }
  assert.match(tripDetailHtml(d.fahrten[0], 'EUR'), /data-trip-fuel="a"/);
});
run('Ungültiger Volltankabgleich wird zurückgewiesen', () => {
  const d = base();
  d.tankvorgaenge = [tank('a', '2026-01-01', 0, 2, { vollgetankt: true, zielbestandLiter: 80 })];
  assert.throws(() => recalculate(d), /positive Tankmenge/);
});
