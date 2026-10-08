import { makeId, nextIndex, nextCalculationPosition } from "./fifo.js";
import { escapeHtml, normalizeFavoriteAddress } from "./favorites.js";

export function upsertFuel(data, form) {
  const editingId = form.editingId.value;
  const inputDateTime = form.datum.value;
  const datum = inputDateTime.slice(0, 10);
  const old = data.tankvorgaenge.find((item) => item.id === editingId);
  const vollgetankt = form.vollgetankt.checked;
  const zielbestandLiter = Number(form.zielbestandLiter.value);
  if (vollgetankt && (!(zielbestandLiter > 0) || !Number.isFinite(zielbestandLiter) || !(Number(form.liter.value) > 0))) {
    throw new Error("Bitte positive Tankmenge und positiven Zielbestand eingeben.");
  }
  const index = old && old.datum === datum ? old.index : nextIndex(data.tankvorgaenge, datum, editingId);
  const nextPosition = nextCalculationPosition(data, datum);
  const berechnungsPosition = old && old.datum === datum ? old.berechnungsPosition : nextPosition;
  const record = {
    id: makeId(datum, index),
    berechnungsPosition,
    lokaleKennung: old?.lokaleKennung || crypto.randomUUID(),
    vollgetankt,
    zielbestandLiter: vollgetankt ? zielbestandLiter : null,
    datum,
    datumZeit: old?.datumZeit && formatFuelDateTimeInput(old.datumZeit) === inputDateTime
      ? old.datumZeit : new Date(inputDateTime).toISOString(),
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
  return record;
}

export function renderFuel(data, currency, onDetail) {
  document.querySelector("#fuelStockGrid").innerHTML = `
    <article class="stat"><span>Kraftstoffbestand</span><strong>${formatNumber(data.berechnung.kraftstoffbestand)} L</strong></article>
    <article class="stat"><span>Wert Kraftstoffbestand</span><strong>${formatMoney(data.berechnung.kraftstoffwert, currency)}</strong></article>`;
  const body = document.querySelector("#fuelRows");
  const rows = [...data.tankvorgaenge, ...(data.berechnung.korrekturtankvorgaenge || [])].sort((a, b) => b.datum.localeCompare(a.datum) || b.index - a.index);
  body.innerHTML = rows.map((tank) => `${positiveCorrectionRow(tank, currency)}
    <tr class="clickable ${tank.istKorrektur ? "correction-row" : ""}" data-fuel-detail="${tank.id}">
      <td data-label="Identifikation">${escapeHtml(formatFuelIdentification(tank))}</td>
      <td data-label="Tankstelle / Ort">${escapeHtml(tank.ort || "")}</td>
      <td data-label="Getankte Liter">${formatNumber(tank.liter)} L</td>
      <td data-label="Preis / Liter">${formatFuelPrice(tank.preisProLiter, currency)}</td>
      <td data-label="Gesamtpreis">${formatMoney(tank.gesamtpreis, currency)}</td>
      <td data-label="Notizen">${escapeHtml(tank.notizen || "")}<span class="auto-note">${formatNumber(tank.verbrauchteLiter)} / ${formatNumber(tank.liter)} L verbraucht</span></td>
    </tr>`).join("") || `<tr><td colspan="6" class="muted">Noch keine Tankvorgänge erfasst.</td></tr>`;
  body.querySelectorAll("[data-fuel-detail]").forEach((row) => row.addEventListener("click", () => onDetail(row.dataset.fuelDetail, row.dataset.fuelCorrection === "true")));

  const cards = document.querySelector("#fuelCards");
  cards.innerHTML = rows.map((tank) => `${positiveCorrectionCard(tank, currency)}
    <article class="mobile-card ${tank.istKorrektur ? "correction-row" : ""}" data-fuel-card="${tank.id}">
      <div class="card-head">
        <div>
          <span class="card-kicker">${escapeHtml(formatFuelIdentification(tank))}</span>
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
  cards.querySelectorAll("[data-fuel-card]").forEach((card) => card.addEventListener("click", () => onDetail(card.dataset.fuelCard, card.dataset.fuelCorrection === "true")));
}

export const formatNumber = (value, digits = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value) || 0);
// datetime-local uses the browser's local timezone; Supabase stores the instant in UTC.
export function formatFuelDateTimeInput(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatFuelIdentification(tank) {
  const date = new Date(tank.datumZeit || `${tank.datum}T00:00`);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
export const formatMoney = (value, currency = "EUR") => new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(Number(value) || 0);
export function formatFuelPrice(value, currency = "EUR") {
  const amount = (Number(value) || 0).toFixed(3).replace(".", ",");
  const [main, decimals] = amount.split(",");
  const symbol = currency === "EUR" ? "€" : currency;
  return `${main},${decimals.slice(0, 2)}<span class="price-fraction">${decimals.slice(2)}</span> ${escapeHtml(symbol)}`;
}

export function fuelDetailHtml(tank, currency) {
  const remaining = Math.max(0, Number(tank.liter) - Number(tank.verbrauchteLiter)) + Math.max(0, (tank.korrektur?.liter > 0 ? tank.korrektur.liter : 0) - (tank.korrekturVerbrauchteLiter || 0));
  const usages = (tank.verbrauchsFahrten || []).map((usage) => `
    <tr class="clickable" data-fuel-trip="${escapeHtml(usage.fahrtId)}">
      <td data-label="Fahrt">${escapeHtml(usage.fahrtId)}</td>
      <td data-label="Datum">${escapeHtml(usage.datum)}</td>
      <td data-label="Liter">${formatNumber(usage.liter)} L</td>
      <td data-label="Kostenanteil">${formatMoney(usage.kosten, currency)}</td>
    </tr>`).join("") || `<tr><td colspan="4" class="muted">Aus diesem Tankvorgang wurde noch kein Kraftstoff verbraucht.</td></tr>`;
  return `
    <h2>${escapeHtml(formatFuelIdentification(tank))}</h2>
    <dl class="detail-grid">
      <dt>Datum</dt><dd>${escapeHtml(formatFuelIdentification(tank))}</dd>
      <dt>Tankstelle / Ort</dt><dd>${escapeHtml(tank.ort || "")}</dd>
      <dt>Getankte Liter</dt><dd>${formatNumber(tank.liter)} L</dd>
      <dt>Preis / Liter</dt><dd>${formatFuelPrice(tank.preisProLiter, currency)}</dd>
      <dt>Gesamtpreis</dt><dd>${formatMoney(tank.gesamtpreis, currency)}</dd>
      <dt>Automatische Notiz</dt><dd><span class="auto-note">${formatNumber(tank.verbrauchteLiter)} / ${formatNumber(tank.liter)} L verbraucht, ${formatNumber(remaining)} L verbleibend.</span></dd>
      <dt>Notizen</dt><dd>${escapeHtml(tank.notizen || "") || "Keine"}</dd>
    </dl>
    ${tank.vollgetankt ? `<p>Zielbestand: ${formatNumber(tank.zielbestandLiter)} L</p>` : ""}
    ${correctionHtml(tank, currency, true)}
    <h2>Verbrauch durch Fahrten</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fahrt</th><th>Datum</th><th>Liter</th><th>Kostenanteil</th></tr></thead>
        <tbody>${usages}</tbody>
      </table>
    </div>
    <div class="actions"><button data-fuel-edit="${tank.id}">Bearbeiten</button><button class="danger" data-fuel-delete="${tank.id}">Löschen</button></div>`;
}

function correctionHtml(tank, currency, detail = false) {
  if (!tank.korrektur) return "";
  const correction = tank.korrektur;
  return `<div class="correction-note"><span class="badge">[Bestandskorrektur]</span>
    ${correction.liter > 0 ? "+" : ""}${formatNumber(correction.liter)} L · Wert: ${formatMoney(correction.wert, currency)}
    ${detail && correction.fahrtId ? `<button class="link-button" data-fuel-trip="${escapeHtml(correction.fahrtId)}">Korrekturfahrt anzeigen</button>` : ""}
    ${correction.preisProLiter != null ? ` · ${formatNumber(correction.preisProLiter, 5)} ${escapeHtml(currency)} / L (Bestandsmittelwert)` : ""}</div>`;
}

function positiveCorrectionRow(tank, currency) {
  if (!(tank.korrektur?.liter > 0)) return "";
  const correction = tank.korrektur;
  return `<tr class="clickable correction-row" data-fuel-detail="${tank.id}" data-fuel-correction="true">
    <td data-label="Identifikation">${escapeHtml(formatFuelIdentification(tank))}</td>
    <td data-label="Tankstelle / Ort">Bestandskorrektur</td>
    <td data-label="Getankte Liter">+${formatNumber(correction.liter)} L</td>
    <td data-label="Preis / Liter">${formatNumber(correction.preisProLiter, 5)} ${escapeHtml(currency)}</td>
    <td data-label="Gesamtpreis">${formatMoney(correction.wert, currency)}</td>
    <td data-label="Notizen"><span class="badge">[Bestandskorrektur]</span> Hypothetischer Bestand, keine Tankausgabe.
      <span class="auto-note">${formatNumber(tank.korrekturVerbrauchteLiter)} / ${formatNumber(correction.liter)} L verbraucht</span></td>
  </tr>`;
}

function positiveCorrectionCard(tank, currency) {
  if (!(tank.korrektur?.liter > 0)) return "";
  const correction = tank.korrektur;
  return `<article class="mobile-card correction-row" data-fuel-card="${tank.id}" data-fuel-correction="true">
    <div class="card-head"><div><span class="card-kicker">${escapeHtml(formatFuelIdentification(tank))}</span>
      <strong>Bestandskorrektur</strong></div><span class="card-price">${formatMoney(correction.wert, currency)}</span></div>
    <div class="metric-row"><span>+${formatNumber(correction.liter)} L</span>
      <span>${formatNumber(correction.preisProLiter, 5)} ${escapeHtml(currency)} / L</span></div>
    <p class="card-note"><span class="badge">[Bestandskorrektur]</span> Hypothetischer Bestand, keine Tankausgabe.</p>
  </article>`;
}

export function correctionFuelDetailHtml(tank, currency) {
  const correction = tank.istKorrektur ? { liter: tank.liter, preisProLiter: tank.preisProLiter, wert: tank.gesamtpreis } : tank.korrektur;
  const used = tank.korrekturVerbrauchteLiter || 0;
  return `<h2>Bestandskorrektur</h2><p class="badge">[Bestandskorrektur]</p>
    <dl class="detail-grid"><dt>Datum</dt><dd>${escapeHtml(formatFuelIdentification(tank))}</dd>
      <dt>Korrekturmenge</dt><dd>+${formatNumber(correction.liter)} L</dd>
      <dt>${tank.istKorrektur ? "Letzter Tankpreis" : "Bestandsmittelwert"}</dt><dd>${formatNumber(correction.preisProLiter, 5)} ${escapeHtml(currency)} / L</dd>
      <dt>Korrekturwert</dt><dd>${formatMoney(correction.wert, currency)}</dd>
      <dt>Verbraucht</dt><dd>${formatNumber(used)} L</dd>
      <dt>Verbleibend</dt><dd>${formatNumber(Math.max(0, correction.liter - used))} L</dd></dl>
    <p>Hypothetischer Kraftstoffbestand, keine tatsächliche Tankausgabe. Änderungen erfolgen ausschließlich über den zugehörigen ${tank.istKorrektur ? "Fahrteintrag" : "Haupttankvorgang"}.</p>
    <div class="actions">${tank.istKorrektur ? `<button data-fuel-trip="${escapeHtml(tank.fahrtId)}">Fahrt anzeigen</button>` : `<button data-correction-main-fuel="${escapeHtml(tank.id)}">Haupttankvorgang anzeigen</button>`}</div>`;
}
