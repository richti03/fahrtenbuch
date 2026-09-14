import { formatTripLabel } from "./fahrten.js";
import { formatMoney, formatNumber } from "./tanken.js";

let charts = [];

export function renderDashboard(data) {
  const currency = data.einstellungen.waehrung;
  const { trips, fuels } = filterPeriod(data);
  const totalKm = sum(trips, "kilometer");
  const totalLiters = sum(trips, "verbrauchteLiter");
  const stats = [
    ["Gesamtkilometer", `${formatNumber(totalKm, 1)} km`],
    ["Anzahl Fahrten", trips.length],
    ["Durchschnittsverbrauch", `${formatNumber(totalKm ? totalLiters / totalKm * 100 : 0, 1)} L/100 km`],
    ["Verbrauchte Liter", `${formatNumber(totalLiters)} L`],
    ["Fahrtkosten insgesamt", formatMoney(sum(trips, "kosten"), currency)],
    ["Getankte Liter", `${formatNumber(sum(fuels, "liter"))} L`],
    ["Kraftstoffausgaben", formatMoney(sum(fuels, "gesamtpreis"), currency)],
  ];
  document.querySelector("#statsGrid").innerHTML = stats.map(([label, value]) => `<article class="stat"><span>${label}</span><strong>${value}</strong></article>`).join("");
  renderCharts(data);
}

function renderCharts(data) {
  charts.forEach((chart) => chart.destroy());
  charts = [];
  if (!window.Chart) return;
  const { trips, fuels } = filterPeriod(data);
  const labels = trips.map(formatTripLabel);
  charts.push(bar("kmChart", labels, trips.map((fahrt) => fahrt.kilometer), "Kilometer"));
  charts.push(bar("literChart", labels, trips.map((fahrt) => fahrt.verbrauchteLiter), "Liter"));
  charts.push(bar("costChart", labels, trips.map((fahrt) => fahrt.kosten), "Kosten"));
  charts.push(line("avgChart", labels, trips.map((fahrt) => fahrt.verbrauchPro100km), "L/100 km"));
  charts.push(line("priceChart", fuels.map((t) => t.id), fuels.map((t) => t.preisProLiter), "Preis / Liter"));
}

function filterPeriod(data) {
  const from = document.querySelector("#chartFrom")?.value || "";
  const to = document.querySelector("#chartTo")?.value || "";
  return {
    trips: [...data.fahrten]
      .filter((fahrt) => !from || fahrt.datum >= from)
      .filter((fahrt) => !to || fahrt.datum <= to)
      .sort((a, b) => a.datum.localeCompare(b.datum) || a.index - b.index),
    fuels: [...data.tankvorgaenge]
      .filter((tank) => !from || tank.datum >= from)
      .filter((tank) => !to || tank.datum <= to)
      .sort((a, b) => a.datum.localeCompare(b.datum) || a.index - b.index),
  };
}

function bar(id, labels, values, label) {
  return new Chart(document.getElementById(id), { type: "bar", data: { labels, datasets: [{ label, data: values, backgroundColor: "#0f766e" }] }, options: options() });
}

function line(id, labels, values, label) {
  return new Chart(document.getElementById(id), { type: "line", data: { labels, datasets: [{ label, data: values, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.12)", tension: .3, fill: true }] }, options: options() });
}

function options() {
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } };
}

const sum = (items, key) => items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
