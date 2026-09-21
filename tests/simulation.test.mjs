import assert from "node:assert/strict";
import { estimateConsumption, estimateCosts, latestFuelPrice } from "../js/simulation.js";
import { recalculate } from "../js/fifo.js";

const trip = (kilometer, verbrauchPro100km, datum = "2026-09-21") => ({ kilometer, verbrauchPro100km, datum });
const estimate = (trips, km = 100) => estimateConsumption(trips, km, "2026-09-21");
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function run(name, fn) { fn(); console.log(`ok - ${name}`); }

run("Gleicher Verbrauch bleibt unabhängig von Länge und Alter gleich", () => {
  const result = estimate([trip(10, 8), trip(200, 8, "2020-01-01")], 250);
  near(result.consumption, 8);
  near(result.liters, 20);
});
run("Ähnliche Länge zählt stärker, halbe und doppelte Länge symmetrisch", () => {
  near(estimate([trip(100, 6), trip(200, 12)]).consumption, 8);
  near(estimate([trip(100, 6), trip(50, 12)]).consumption, 8);
});
run("180 Tage alte Fahrt erhält halbes Zeitgewicht", () => {
  near(estimate([trip(100, 6), trip(100, 12, "2026-03-25")]).consumption, 8);
});
run("Ungültige und zukünftige Fahrten werden ausgeschlossen", () => {
  const result = estimate([trip(100, 7), trip(0, 10), trip(-5, 10), trip(100, NaN), trip(100, Infinity),
    trip(100, 0), trip(100, 20, "2026-09-22"), trip(100, 20, "2026-02-30"), trip(100, 20, "ungültig")]);
  assert.equal(result.count, 1);
  assert.equal(result.similarCount, 1);
  near(result.consumption, 7);
  assert.equal(estimate([]), null);
  assert.equal(estimate([trip(100, 8)], 0), null);
});
run("Vergleichszahlen und alte Historie bleiben brauchbar", () => {
  const result = estimate([trip(49, 8), trip(50, 8), trip(200, 8), trip(201, 8)]);
  assert.equal(result.count, 4);
  assert.equal(result.similarCount, 2);
  near(estimate([trip(100, 8, "1900-01-01")]).consumption, 8);
});
const layers = [{ tankId: "a", liter: 5, preisProLiter: 1.7 }, { tankId: "b", liter: 3, preisProLiter: 2 }];
run("Bestand wird über mehrere FIFO-Schichten bewertet", () => {
  assert.equal(estimateCosts(4, layers).totalCost, 6.8);
  const result = estimateCosts(7, layers);
  assert.equal(result.totalCost, 12.5);
  assert.deepEqual(result.parts.map((part) => part.liters), [5, 2]);
  assert.equal(estimateCosts(8, layers).missingLiters, 0);
  assert.equal(estimateCosts(8, layers).totalCost, 14.5);
});
run("Fehlmenge wird separat bewertet und fehlender Preis verhindert Gesamtbetrag", () => {
  const result = estimateCosts(8, layers.slice(0, 1), 1.8);
  assert.equal(result.totalCost, 13.9);
  assert.equal(result.missingLiters, 3);
  const missing = estimateCosts(8, layers.slice(0, 1));
  assert.equal(missing.totalCost, null);
  assert.equal(missing.stockCost, 8.5);
  assert.equal(estimateCosts(8, [], 1.8).totalCost, 14.4);
  assert.equal(estimateCosts(8, [], -1).totalCost, null);
});
run("Letzter gültiger Tankpreis berücksichtigt Datum und Tagesindex", () => {
  const tanks = [
    { datum: "2026-09-20", index: 2, liter: 20, preisProLiter: 1.8 },
    { datum: "2026-09-20", index: 1, liter: 20, preisProLiter: 1.7 },
    { datum: "2026-09-21", liter: 20, preisProLiter: 0 },
    { datum: "2026-09-22", liter: 20, preisProLiter: 2 },
  ];
  assert.equal(latestFuelPrice(tanks, "2026-09-21"), 1.8);
  assert.equal(latestFuelPrice([], "2026-09-21"), null);
});
run("Simulation verändert weder Historie noch FIFO-Bestand", () => {
  const data = recalculate({ fahrten: [{ ...trip(100, 8), id: "f", index: 1 }],
    tankvorgaenge: [{ id: "t", datum: "2026-09-20", index: 1, liter: 20, preisProLiter: 1.7 }] });
  const before = structuredClone(data);
  const forecast = estimate(data.fahrten, 200);
  estimateCosts(forecast.liters, data.berechnung.schichten, latestFuelPrice(data.tankvorgaenge));
  assert.deepEqual(data, before);
});
