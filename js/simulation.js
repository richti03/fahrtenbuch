import { round2 } from "./fifo.js";
import { formatMoney, formatNumber } from "./tanken.js";

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const DAY = 86400000;

function dayNumber(value) {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? timestamp / DAY : NaN;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function estimateConsumption(trips, kilometers, referenceDate = today()) {
  if (!positive(kilometers)) return null;
  const reference = dayNumber(referenceDate);
  if (!Number.isFinite(reference)) return null;
  const valid = trips.filter((trip) => positive(trip.kilometer) && positive(trip.verbrauchPro100km)
    && Number.isFinite(dayNumber(trip.datum)) && dayNumber(trip.datum) <= reference);
  if (!valid.length) return null;
  // Normalize time weights against the newest trip to avoid underflow for old histories.
  const newest = valid.reduce((latest, trip) => Math.max(latest, dayNumber(trip.datum)), -Infinity);
  let weightSum = 0;
  let consumptionSum = 0;
  for (const trip of valid) {
    const lengthWeight = 1 / (1 + Math.log2(Number(trip.kilometer) / Number(kilometers)) ** 2);
    const weight = lengthWeight * 0.5 ** ((newest - dayNumber(trip.datum)) / 180);
    weightSum += weight;
    consumptionSum += weight * Number(trip.verbrauchPro100km);
  }
  const consumption = consumptionSum / weightSum;
  const similarCount = valid.filter((trip) => trip.kilometer >= kilometers / 2 && trip.kilometer <= kilometers * 2).length;
  return { consumption, liters: Number(kilometers) * consumption / 100, count: valid.length, similarCount };
}

export function latestFuelPrice(tanks, referenceDate = today()) {
  const reference = dayNumber(referenceDate);
  const valid = tanks.filter((tank) => positive(tank.preisProLiter) && positive(tank.liter)
    && Number.isFinite(dayNumber(tank.datum)) && dayNumber(tank.datum) <= reference);
  valid.sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || Number(b.index || 0) - Number(a.index || 0));
  return valid.length ? Number(valid[0].preisProLiter) : null;
}

export function estimateCosts(liters, layers, refillPrice = null) {
  if (!positive(liters)) return null;
  let remaining = Number(liters);
  let stockCost = 0;
  const parts = [];
  for (const layer of layers) {
    if (remaining <= 1e-9) break;
    if (!positive(layer.liter)) continue;
    const used = Math.min(remaining, Number(layer.liter));
    const cost = used * Number(layer.preisProLiter);
    parts.push({ tankId: layer.tankId, liters: used, price: Number(layer.preisProLiter), cost });
    stockCost += cost;
    remaining -= used;
  }
  const missingLiters = Math.max(0, remaining < 1e-9 ? 0 : remaining);
  const refillCost = missingLiters === 0 ? 0 : positive(refillPrice) ? missingLiters * Number(refillPrice) : null;
  return { parts, stockLiters: Number(liters) - missingLiters, stockCost, missingLiters, refillCost,
    totalCost: refillCost === null ? null : round2(stockCost + refillCost) };
}

export function renderSimulation(data) {
  const form = document.querySelector("#simulationForm");
  const output = document.querySelector("#simulationResult");
  const priceInput = form.elements.refillPrice;
  if (priceInput.dataset.manual !== "true") priceInput.value = latestFuelPrice(data.tankvorgaenge) ?? "";
  const kilometers = Number(form.elements.kilometers.value);
  const manual = form.elements.manualConsumption.value;
  output.replaceChildren();
  const paragraph = (text, warning = false) => {
    const element = document.createElement("p");
    element.textContent = text;
    if (warning) element.className = "warning";
    output.append(element);
  };
  if (!positive(kilometers) || !form.elements.kilometers.validity.valid) {
    paragraph("Bitte eine positive Entfernung in Kilometern eingeben.");
    return;
  }
  if ((manual !== "" && !positive(manual)) || !form.elements.manualConsumption.validity.valid) {
    paragraph("Bitte einen positiven manuellen Verbrauch eingeben oder das Feld leeren.");
    return;
  }
  const forecast = estimateConsumption(data.fahrten, kilometers);
  if (!forecast && manual === "") {
    paragraph("Keine gültigen bisherigen Fahrten vorhanden. Bitte einen manuellen Verbrauch eingeben.");
    return;
  }
  const consumption = manual === "" ? forecast.consumption : Number(manual);
  const liters = kilometers * consumption / 100;
  if (!Number.isFinite(liters)) {
    paragraph("Die Eingabewerte sind zu groß. Bitte kleinere Werte eingeben.");
    return;
  }
  const costs = estimateCosts(liters, data.berechnung.schichten, priceInput.validity.valid ? priceInput.value : null);
  const money = (value) => formatMoney(value, data.einstellungen.waehrung);
  const grid = document.createElement("div");
  grid.className = "stats-grid";
  for (const [label, value] of [
    ["Geschätzter Verbrauch", `${formatNumber(consumption)} l/100 km`],
    ["Benötigter Kraftstoff", `${formatNumber(liters)} l`],
    ["Kraftstoffkosten", costs.totalCost === null ? "Preis fehlt" : money(costs.totalCost)],
  ]) {
    const card = document.createElement("article");
    card.className = "stat";
    const title = document.createElement("span");
    title.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(title, strong);
    grid.append(card);
  }
  output.append(grid);
  paragraph(manual !== "" ? "Manuelle Simulation: Der eingegebene Verbrauch ersetzt die automatische Prognose."
    : `Grundlage: ${forecast.count} bisherige Fahrten, davon ${forecast.similarCount} mit ähnlicher Länge. Ähnlich lange und neuere Fahrten zählen stärker.`);
  if (manual === "" && forecast.count < 5) paragraph("Wenig Vergleichsdaten.", true);
  if (manual === "" && forecast.similarCount < 3) paragraph("Wenig Fahrten mit ähnlicher Länge.", true);
  paragraph(`Aus dem Tankbestand nach FIFO: ${formatNumber(costs.stockLiters)} l · ${money(costs.stockCost)}.`);
  if (costs.missingLiters > 0) {
    paragraph(`Nachzutanken: ${formatNumber(costs.missingLiters)} l · ${costs.refillCost === null ? "Bitte einen positiven Literpreis für den Nachkauf eingeben." : money(costs.refillCost)}.`, true);
  }
  if (data.fahrten.some((trip) => trip.nichtZugeordneteLiter > 0 || trip.warnung)) {
    paragraph("Der erfasste Kraftstoffbestand ist unvollständig. Die Kostenbasis kann deshalb vom tatsächlichen Tankbestand abweichen.", true);
  }
  paragraph("Schätzung ohne Berücksichtigung von Verkehr, Geschwindigkeit, Wetter und Straßenart. Die Kosten umfassen ausschließlich Kraftstoff.");
}

export function bindSimulation(getData) {
  const form = document.querySelector("#simulationForm");
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target === form.elements.refillPrice) event.target.dataset.manual = "true";
    renderSimulation(getData());
  });
  document.querySelector("#resetSimulationPrice").addEventListener("click", () => {
    delete form.elements.refillPrice.dataset.manual;
    renderSimulation(getData());
  });
}
