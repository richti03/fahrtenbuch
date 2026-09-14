import { makeId, nextIndex } from "./fifo.js";
import { escapeHtml, normalizeFavoriteAddress } from "./favorites.js";

export function upsertFuel(data, form) {
  const editingId = form.editingId.value;
  const datum = form.datum.value;
  const old = data.tankvorgaenge.find((item) => item.id === editingId);
  const index = old && old.datum === datum ? old.index : nextIndex(data.tankvorgaenge, datum, editingId);
  const record = {
    id: makeId(datum, index),
    datum,
    index,
    liter: Number(form.liter.value),
    preisProLiter: Number(form.preisProLiter.value),
    ort: normalizeFavoriteAddress(data, form.ort.value, "fuelStation"),
    notizen: form.notizen.value.trim(),
    gesamtpreis: 0,
    createdAt: old?.createdAt || new Date().toISOString(),
  };
  if (old) data.tankvorgaenge.splice(data.tankvorgaenge.indexOf(old), 1, record);
  else data.tankvorgaenge.push(record);
}

export function renderFuel(data, currency, onDetail) {
  document.querySelector("#fuelStockGrid").innerHTML = `
    <article class="stat"><span>Kraftstoffbestand</span><strong>${formatNumber(data.berechnung.kraftstoffbestand)} L</strong></article>
    <article class="stat"><span>Wert Kraftstoffbestand</span><strong>${formatMoney(data.berechnung.kraftstoffwert, currency)}</strong></article>`;
  const body = document.querySelector("#fuelRows");
  const rows = [...data.tankvorgaenge].sort((a, b) => b.datum.localeCompare(a.datum) || b.index - a.index);
  body.innerHTML = rows.map((tank) => `
    <tr class="clickable" data-fuel-detail="${tank.id}">
      <td data-label="Identifikation">${escapeHtml(tank.id)}</td>
      <td data-label="Tankstelle / Ort">${escapeHtml(tank.ort || "")}</td>
      <td data-label="Getankte Liter">${formatNumber(tank.liter)} L</td>
      <td data-label="Preis / Liter">${formatFuelPrice(tank.preisProLiter, currency)}</td>
      <td data-label="Gesamtpreis">${formatMoney(tank.gesamtpreis, currency)}</td>
    </tr>`).join("") || `<tr><td colspan="5" class="muted">Noch keine Tankvorgänge erfasst.</td></tr>`;
  body.querySelectorAll("[data-fuel-detail]").forEach((row) => row.addEventListener("click", () => onDetail(row.dataset.fuelDetail)));

  const cards = document.querySelector("#fuelCards");
  cards.innerHTML = rows.map((tank) => `
    <article class="mobile-card" data-fuel-card="${tank.id}">
      <div class="card-head">
        <div>
          <span class="card-kicker">${escapeHtml(tank.datum)} (${tank.index})</span>
          <strong>${escapeHtml(tank.ort || "Tankvorgang")}</strong>
        </div>
        <span class="card-price">${formatMoney(tank.gesamtpreis, currency)}</span>
      </div>
      <div class="metric-row">
        <span>${formatNumber(tank.liter)} L</span>
        <span>${formatFuelPrice(tank.preisProLiter, currency)}</span>
        <span>${formatNumber(tank.verbrauchteLiter)} L verbraucht</span>
      </div>
      ${tank.notizen ? `<p class="card-sub">${escapeHtml(tank.notizen)}</p>` : ""}
    </article>`).join("") || `<p class="muted small">Noch keine Tankvorgänge erfasst.</p>`;
  cards.querySelectorAll("[data-fuel-card]").forEach((card) => card.addEventListener("click", () => onDetail(card.dataset.fuelCard)));
}

export const formatNumber = (value, digits = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value) || 0);
export const formatMoney = (value, currency = "EUR") => new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(Number(value) || 0);
export function formatFuelPrice(value, currency = "EUR") {
  const amount = (Number(value) || 0).toFixed(3).replace(".", ",");
  const [main, decimals] = amount.split(",");
  const symbol = currency === "EUR" ? "€" : currency;
  return `${main},${decimals.slice(0, 2)}<span class="price-fraction">${decimals.slice(2)}</span> ${escapeHtml(symbol)}`;
}

export function fuelDetailHtml(tank, currency) {
  const remaining = Math.max(0, (Number(tank.liter) || 0) - (Number(tank.verbrauchteLiter) || 0));
  const usages = (tank.verbrauchsFahrten || []).map((usage) => `
    <tr class="clickable" data-fuel-trip="${escapeHtml(usage.fahrtId)}">
      <td data-label="Fahrt">${escapeHtml(usage.fahrtId)}</td>
      <td data-label="Datum">${escapeHtml(usage.datum)}</td>
      <td data-label="Liter">${formatNumber(usage.liter)} L</td>
      <td data-label="Kostenanteil">${formatMoney(usage.kosten, currency)}</td>
    </tr>`).join("") || `<tr><td colspan="4" class="muted">Aus diesem Tankvorgang wurde noch kein Kraftstoff verbraucht.</td></tr>`;
  return `
    <h2>${escapeHtml(tank.id)}</h2>
    <dl class="detail-grid">
      <dt>Datum</dt><dd>${escapeHtml(tank.datum)}</dd>
      <dt>Tankstelle / Ort</dt><dd>${escapeHtml(tank.ort || "")}</dd>
      <dt>Getankte Liter</dt><dd>${formatNumber(tank.liter)} L</dd>
      <dt>Preis / Liter</dt><dd>${formatFuelPrice(tank.preisProLiter, currency)}</dd>
      <dt>Gesamtpreis</dt><dd>${formatMoney(tank.gesamtpreis, currency)}</dd>
      <dt>Automatische Notiz</dt><dd><span class="auto-note">${formatNumber(tank.verbrauchteLiter)} / ${formatNumber(tank.liter)} L verbraucht, ${formatNumber(remaining)} L verbleibend.</span></dd>
      <dt>Notizen</dt><dd>${escapeHtml(tank.notizen || "") || "Keine"}</dd>
    </dl>
    <h2>Verbrauch durch Fahrten</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fahrt</th><th>Datum</th><th>Liter</th><th>Kostenanteil</th></tr></thead>
        <tbody>${usages}</tbody>
      </table>
    </div>
    <div class="actions"><button data-fuel-edit="${tank.id}">Bearbeiten</button><button class="danger" data-fuel-delete="${tank.id}">Löschen</button></div>`;
}
