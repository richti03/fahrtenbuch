import assert from "node:assert/strict";
import { recalculate } from "../js/fifo.js";

const base = () => ({ fahrten: [], tankvorgaenge: [], favoriten: [], einstellungen: { tankvolumen: 80, waehrung: "EUR" } });
const tank = (id, datum, index, liter, preisProLiter) => ({ id, datum, index, liter, preisProLiter });
const trip = (id, datum, index, kilometer, verbrauchPro100km) => ({ id, datum, index, start: "A", ziel: "B", zwischenziele: [], kilometer, verbrauchPro100km, notizen: "" });

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("Verbrauch bleibt vollständig innerhalb einer Tankfüllung", () => {
  const data = base();
  data.tankvorgaenge = [tank("2026-01-01-01", "2026-01-01", 1, 80, 1.7)];
  data.fahrten = [trip("2026-01-02-01", "2026-01-02", 1, 250, 8)];
  recalculate(data);
  assert.equal(data.fahrten[0].kosten, 34);
  assert.equal(data.berechnung.kraftstoffbestand, 60);
});

run("Verbrauch überschreitet eine Tankfüllung", () => {
  const data = base();
  data.tankvorgaenge = [tank("2026-01-01-01", "2026-01-01", 1, 20, 1.7), tank("2026-01-02-01", "2026-01-02", 1, 60, 1.8)];
  data.fahrten = [trip("2026-01-03-01", "2026-01-03", 1, 300, 10)];
  recalculate(data);
  assert.equal(data.fahrten[0].kosten, 52);
});

run("Verbrauch erstreckt sich über drei Tankfüllungen", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 10, 1), tank("t2", "2026-01-02", 1, 10, 2), tank("t3", "2026-01-03", 1, 10, 3)];
  data.fahrten = [trip("f1", "2026-01-04", 1, 250, 10)];
  recalculate(data);
  assert.equal(data.fahrten[0].kosten, 45);
  assert.equal(data.fahrten[0].fifoAnteile.length, 3);
});

run("Eine Fahrt wird nachträglich eingefügt", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 30, 1), tank("t2", "2026-01-03", 1, 30, 2)];
  data.fahrten = [trip("f2", "2026-01-04", 1, 200, 10), trip("f1", "2026-01-02", 1, 200, 10)];
  recalculate(data);
  assert.equal(data.fahrten.find((f) => f.id === "f2").kosten, 30);
});

run("Eine Fahrt wird nachträglich geändert", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 40, 1), tank("t2", "2026-01-03", 1, 40, 2)];
  data.fahrten = [trip("f1", "2026-01-02", 1, 100, 10), trip("f2", "2026-01-04", 1, 200, 10)];
  recalculate(data);
  data.fahrten[0].kilometer = 300;
  recalculate(data);
  assert.equal(data.fahrten[1].kosten, 30);
});

run("Ein Tankvorgang wird geändert", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 20, 1)];
  data.fahrten = [trip("f1", "2026-01-02", 1, 100, 10)];
  recalculate(data);
  data.tankvorgaenge[0].preisProLiter = 2;
  recalculate(data);
  assert.equal(data.fahrten[0].kosten, 20);
});

run("Ein Tankvorgang wird gelöscht", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 10, 1), tank("t2", "2026-01-02", 1, 20, 2)];
  data.fahrten = [trip("f1", "2026-01-03", 1, 200, 10)];
  recalculate(data);
  data.tankvorgaenge.shift();
  recalculate(data);
  assert.equal(data.fahrten[0].kosten, 40);
});

run("Es steht rechnerisch nicht genügend Kraftstoff zur Verfügung", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 5, 2)];
  data.fahrten = [trip("f1", "2026-01-02", 1, 100, 10)];
  recalculate(data);
  assert.equal(data.fahrten[0].kosten, 10);
  assert.equal(data.fahrten[0].nichtZugeordneteLiter, 5);
  assert.ok(data.fahrten[0].warnung);
});

run("Eine Fahrt verbraucht exakt den Rest einer Tankfüllung", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 10, 1.7)];
  data.fahrten = [trip("f1", "2026-01-02", 1, 100, 10)];
  recalculate(data);
  assert.equal(data.berechnung.kraftstoffbestand, 0);
  assert.equal(data.fahrten[0].kosten, 17);
});

run("Eine Fahrt verbraucht einen Teil der alten und einen Teil der neuen Tankfüllung", () => {
  const data = base();
  data.tankvorgaenge = [tank("t1", "2026-01-01", 1, 20, 1.7), tank("t2", "2026-01-02", 1, 60, 1.8)];
  data.fahrten = [trip("f1", "2026-01-03", 1, 300, 10)];
  recalculate(data);
  assert.deepEqual(data.fahrten[0].fifoAnteile.map((p) => p.liter), [20, 10]);
  assert.equal(data.fahrten[0].kosten, 52);
});
