import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { recalculate, nextIndex, makeId } from '../js/fifo.js';
import { upsertFuel, formatFuelDateTimeInput } from '../js/tanken.js';
import { upsertTrip } from '../js/fahrten.js';
import { validateData } from '../js/storage.js';
globalThis.crypto ??= webcrypto;
globalThis.document = { querySelectorAll: () => [] };
const run = (name, fn) => { fn(); console.log(`ok - ${name}`); };
const base = () => ({ fahrten: [], tankvorgaenge: [{ id: 'old', lokaleKennung: 'old', datum: '2026-10-06', index: 1, liter: 80, preisProLiter: 2 }], favoriten: [], einstellungen: { tankvolumen: 80 } });
const trip = (id, index, liters, datum = '2026-10-07') => ({ id, datum, index, kilometer: liters * 10, verbrauchPro100km: 10 });
const form = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
const fuelForm = (extra = {}) => ({ ...form({ editingId: '', datum: '2026-10-07T18:00', liter: '30', preisProLiter: '2', ort: 'Tankstelle', notizen: '', zielbestandLiter: '80', ...extra }), vollgetankt: { checked: true } });
const tripForm = (extra = {}) => form({ editingId: '', datum: '2026-10-07', index: '', start: 'A', ziel: 'B', kilometer: '100', verbrauchPro100km: '10', notizen: '', ...extra });

run('45 L + 30 L Volltankung ergeben 5 L Mehrbestand und keine Korrekturfahrt', () => {
  const d = base(); d.fahrten = [trip('first', 1, 10), trip('second', 2, 25)];
  recalculate(d); assert.equal(d.berechnung.kraftstoffbestand, 45);
  upsertFuel(d, fuelForm()); recalculate(d);
  assert.equal(d.berechnung.kraftstoffbestand, 80);
  assert.equal(d.tankvorgaenge[1].korrektur.liter, 5);
  assert.equal(d.fahrten.filter(f => f.istKorrektur).length, 0);
  assert.ok(d.tankvorgaenge[1].berechnungsPosition > d.fahrten[1].berechnungsPosition);
  const snapshot = JSON.stringify(d); recalculate(d); assert.equal(JSON.stringify(d), snapshot);
  upsertTrip(d, tripForm()); recalculate(d);
  assert.equal(d.berechnung.kraftstoffbestand, 70);
  assert.equal(d.tankvorgaenge[1].korrektur.liter, 5);
  upsertFuel(d, fuelForm({ datum: '2026-10-07T20:00', liter: '10' })); recalculate(d);
  assert.equal(d.berechnung.kraftstoffbestand, 80);
  assert.equal(d.tankvorgaenge[2].korrektur, null);
});

run('Alte fehlerhafte Volltankung wird hinter Tagesfahrten eingeordnet und korrigiert', () => {
  const d = base(); d.fahrten = [trip('first', 1, 35), { id: 'stale', datum: '2026-10-07', istKorrektur: true, verbrauchteLiter: 30 }];
  d.tankvorgaenge.push({ id: 'full', datum: '2026-10-07', index: 1, liter: 30, preisProLiter: 2, vollgetankt: true, zielbestandLiter: 80 });
  recalculate(d);
  assert.equal(d.berechnung.kraftstoffbestand, 80);
  assert.equal(d.tankvorgaenge[1].korrektur.liter, 5);
  assert.equal(d.fahrten.length, 1);
});

run('Rückdatierte Tankung berücksichtigt den Tanktag, spätere Kalendertage folgen danach', () => {
  const d = base(); d.fahrten = [trip('first', 1, 35), trip('future', 1, 20, '2026-10-08')];
  recalculate(d); upsertFuel(d, fuelForm()); recalculate(d);
  assert.equal(d.tankvorgaenge[1].korrektur.liter, 5);
  assert.equal(d.berechnung.kraftstoffbestand, 60);
});

run('Bearbeiten erhält Positionen, Datumswechsel fügt hinten an, Löschen entfernt Korrekturen', () => {
  const d = base(); d.fahrten = [trip('first', 1, 35)]; recalculate(d);
  upsertFuel(d, fuelForm()); recalculate(d);
  const fuel = d.tankvorgaenge[1]; const position = fuel.berechnungsPosition;
  upsertTrip(d, tripForm()); recalculate(d);
  upsertFuel(d, fuelForm({ editingId: fuel.id, liter: '40' })); recalculate(d);
  assert.equal(d.tankvorgaenge[1].berechnungsPosition, position);
  assert.equal(d.berechnung.kraftstoffbestand, 70);
  assert.equal(d.fahrten.filter(f => f.istKorrektur).length, 1);
  const first = d.fahrten.find(f => f.id === 'first');
  upsertTrip(d, tripForm({ editingId: first.id, index: '1', kilometer: '350' }));
  assert.equal(d.fahrten.find(f => f.id === makeId('2026-10-07', 1)).berechnungsPosition, first.berechnungsPosition);
  d.fahrten.push(trip('previous', 2, 1, '2026-10-06')); recalculate(d);
  const lastPrevious = Math.max(...d.fahrten.filter(f => f.datum === '2026-10-06').map(f => f.berechnungsPosition));
  upsertFuel(d, fuelForm({ editingId: fuel.id, datum: '2026-10-06T18:00' })); recalculate(d);
  assert.ok(d.tankvorgaenge[1].berechnungsPosition > lastPrevious);
  d.tankvorgaenge.pop(); recalculate(d);
  assert.equal(d.fahrten.filter(f => f.istKorrektur).length, 0);
});

run('Supabase- und JSON-Rundlauf erhalten Tagespositionen trotz abweichender Anzeigeordnung', () => {
  const source = readFileSync(new URL('../js/supabase-sync.js', import.meta.url), 'utf8');
  const context = vm.createContext({ crypto: webcrypto, makeId, nextIndex, formatFuelDateTimeInput });
  vm.runInContext(source.slice(source.indexOf('function mapTripsFromRemote')), context);
  const d = base(); d.fahrten = [trip('first', 1, 35)]; recalculate(d);
  upsertFuel(d, fuelForm()); recalculate(d);
  upsertTrip(d, tripForm({ index: '2' })); recalculate(d);
  const expected = d.berechnung.kraftstoffbestand;
  const remote = { ...d,
    fahrten: context.mapTripsFromRemote(d.fahrten.map(f => context.mapTripToRemote(f, 'user'))),
    tankvorgaenge: context.mapFuelFromRemote(d.tankvorgaenge.map(t => context.mapFuelToRemote(t, 'user'))),
  };
  const loaded = validateData(JSON.parse(JSON.stringify(remote))); recalculate(loaded);
  assert.equal(loaded.berechnung.kraftstoffbestand, expected);
  assert.equal(loaded.tankvorgaenge[1].korrektur.liter, 5);
  assert.equal(loaded.tankvorgaenge[1].berechnungsPosition, d.tankvorgaenge[1].berechnungsPosition);
  for (const fahrt of d.fahrten) {
    assert.equal(loaded.fahrten.find(f => f.datum === fahrt.datum && f.index === fahrt.index).berechnungsPosition, fahrt.berechnungsPosition);
  }
});
