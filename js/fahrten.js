import { makeId, nextIndex } from "./fifo.js";
import { escapeHtml, normalizeFavoriteAddress } from "./favorites.js";
import { formatFuelPrice, formatMoney, formatNumber } from "./tanken.js";

let sortKey = "id";
let sortDir = -1;

export function upsertTrip(data, form) {
  const editingId = form.editingId.value;
  const datum = form.datum.value;
  const old = data.fahrten.find((item) => item.id === editingId);
  const manualIndex = Number(form.index.value);
  const index = manualIndex > 0 ? manualIndex : old && old.datum === datum ? old.index : nextIndex(data.fahrten, datum, editingId);
  const zwischenziele = [...document.querySelectorAll("[data-waypoint]")].map((input) => normalizeFavoriteAddress(data, input.value)).filter(Boolean);
  const notizen = withAutomaticWaypointNote(form.notizen.value.trim(), zwischenziele);
  const record = {
    id: makeId(datum, index),
    datum,
    index,
    start: normalizeFavoriteAddress(data, form.start.value),
    ziel: normalizeFavoriteAddress(data, form.ziel.value),
    zwischenziele,
    kilometer: Number(form.kilometer.value),
    verbrauchPro100km: Number(form.verbrauchPro100km.value),
    verbrauchteLiter: 0,
    kosten: 0,
    notizen,
    createdAt: old?.createdAt || `${datum}T00:00:00.000Z`,
  };
  if (old) data.fahrten.splice(data.fahrten.indexOf(old), 1, record);
  else data.fahrten.push(record);
}

function withAutomaticWaypointNote(notes, waypoints) {
  const cleaned = notes.replace(/\n?\[Automatische Notiz\] Zwischenziele: .*$/s, "").trim();
  if (!waypoints.length) return cleaned;
  const automatic = `[Automatische Notiz] Zwischenziele: ${waypoints.join(" -> ")}`;
  return cleaned ? `${cleaned}\n${automatic}` : automatic;
}

export function addWaypoint(value = "", onSaveFavorite = null) {
  const wrap = document.createElement("label");
  wrap.innerHTML = `
    Zwischenziel
    <div class="address-row waypoint-row">
      <input data-waypoint list="favoriteAddresses" value="${escapeHtml(value)}">
      <button type="button" data-waypoint-favorite title="Als Favorit speichern">☆</button>
      <button type="button" data-waypoint-remove title="Entfernen">×</button>
    </div>`;
  wrap.querySelector("[data-waypoint-remove]").addEventListener("click", () => wrap.remove());
  wrap.querySelector("[data-waypoint-favorite]").addEventListener("click", () => onSaveFavorite?.(wrap.querySelector("[data-waypoint]").value));
  document.querySelector("#waypoints").append(wrap);
}

export function setWaypoints(values = [], onSaveFavorite = null) {
  document.querySelector("#waypoints").innerHTML = "";
  values.forEach((value) => addWaypoint(value, onSaveFavorite));
}

export function bindTripSorting(render) {
  document.querySelectorAll("[data-trip-sort]").forEach((head) => {
    head.addEventListener("click", () => {
      sortDir = sortKey === head.dataset.tripSort ? sortDir * -1 : 1;
      sortKey = head.dataset.tripSort;
      render();
    });
  });
}

export function renderTrips(data, currency, onDetail) {
  const body = document.querySelector("#tripRows");
  const search = document.querySelector("#tripSearch").value.toLowerCase();
  const from = document.querySelector("#tripFrom").value;
  const to = document.querySelector("#tripTo").value;
  const kmMin = Number(document.querySelector("#kmMin").value || -Infinity);
  const kmMax = Number(document.querySelector("#kmMax").value || Infinity);
  const consMin = Number(document.querySelector("#consMin").value || -Infinity);
  const consMax = Number(document.querySelector("#consMax").value || Infinity);
  const rows = data.fahrten
    .filter((fahrt) => !from || fahrt.datum >= from)
    .filter((fahrt) => !to || fahrt.datum <= to)
    .filter((fahrt) => fahrt.kilometer >= kmMin && fahrt.kilometer <= kmMax)
    .filter((fahrt) => fahrt.verbrauchPro100km >= consMin && fahrt.verbrauchPro100km <= consMax)
    .filter((fahrt) => [fahrt.start, fahrt.ziel, ...(fahrt.zwischenziele || []), fahrt.notizen].join(" ").toLowerCase().includes(search))
    .sort((a, b) => compare(a[sortKey], b[sortKey]) * sortDir);

  body.innerHTML = rows.map((fahrt) => `
    <tr class="clickable" data-trip-detail="${fahrt.id}">
      <td data-label="Datum">${escapeHtml(formatTripDate(fahrt.datum))} ${fahrt.warnung ? `<span class="badge">Warnung</span>` : ""}</td>
      <td data-label="Ordnung">${escapeHtml(formatTripOrder(fahrt))}</td>
      <td data-label="Start">${escapeHtml(fahrt.start)}</td>
      <td data-label="Ziel">${escapeHtml(fahrt.ziel)}</td>
      <td data-label="Kilometer">${formatNumber(fahrt.kilometer, 1)} km</td>
      <td data-label="Verbrauch / 100 km">${formatNumber(fahrt.verbrauchPro100km, 1)} L</td>
      <td data-label="Verbrauchte Liter">${formatNumber(fahrt.verbrauchteLiter)} L</td>
      <td data-label="Kosten">${formatMoney(fahrt.kosten, currency)}</td>
      <td data-label="Notizen">${formatNotes(fahrt.notizen)}</td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">Keine passenden Fahrten gefunden.</td></tr>`;
  body.querySelectorAll("[data-trip-detail]").forEach((row) => row.addEventListener("click", () => onDetail(row.dataset.tripDetail)));

  const cards = document.querySelector("#tripCards");
  cards.innerHTML = rows.map((fahrt) => `
    <article class="mobile-card" data-trip-card="${fahrt.id}">
      <div class="card-head">
        <div>
          <span class="card-kicker">${escapeHtml(formatTripLabel(fahrt))}</span>
          <strong>${escapeHtml(fahrt.start)} → ${escapeHtml(fahrt.ziel)}</strong>
        </div>
        ${fahrt.warnung ? `<span class="badge">Warnung</span>` : ""}
      </div>
      <div class="metric-row">
        <span>${formatNumber(fahrt.kilometer, 1)} km</span>
        <span>${formatNumber(fahrt.verbrauchPro100km, 1)} L/100</span>
        <span>${formatMoney(fahrt.kosten, currency)}</span>
      </div>
      ${fahrt.zwischenziele?.length ? `<p class="card-sub">via ${fahrt.zwischenziele.map(escapeHtml).join(", ")}</p>` : ""}
      ${formatNotes(fahrt.notizen) ? `<div class="card-note">${formatNotes(fahrt.notizen)}</div>` : ""}
    </article>`).join("") || `<p class="muted small">Keine passenden Fahrten gefunden.</p>`;
  cards.querySelectorAll("[data-trip-card]").forEach((card) => card.addEventListener("click", () => onDetail(card.dataset.tripCard)));
}

function compare(a, b) {
  if (typeof a === "number" || typeof b === "number") return (Number(a) || 0) - (Number(b) || 0);
  return String(a ?? "").localeCompare(String(b ?? ""), "de");
}

export function tripDetailHtml(fahrt, currency) {
  const waypoints = (fahrt.zwischenziele || []).length ? fahrt.zwischenziele.map(escapeHtml).join("<br>") : "Keine";
  const parts = (fahrt.fifoAnteile || []).map((part) => `${formatNumber(part.liter)} L aus <button class="link-button" data-trip-fuel="${escapeHtml(part.tankId)}">${escapeHtml(part.tankId)}</button> zu ${formatFuelPrice(part.preisProLiter, currency)}`).join("<br>") || "Keine zugeordneten Tankmengen";
  return `
    <h2>${escapeHtml(formatTripLabel(fahrt))}</h2>
    <dl class="detail-grid">
      <dt>Datum</dt><dd>${escapeHtml(formatTripDate(fahrt.datum))}</dd>
      <dt>Ordnungsfaktor</dt><dd>${escapeHtml(formatTripOrder(fahrt))}</dd>
      <dt>Start</dt><dd>${escapeHtml(fahrt.start)}</dd>
      <dt>Zwischenziele</dt><dd>${waypoints}</dd>
      <dt>Ziel</dt><dd>${escapeHtml(fahrt.ziel)}</dd>
      <dt>Kilometer</dt><dd>${formatNumber(fahrt.kilometer, 1)} km</dd>
      <dt>Verbrauch / 100 km</dt><dd>${formatNumber(fahrt.verbrauchPro100km, 1)} L</dd>
      <dt>Verbrauchte Liter</dt><dd>${formatNumber(fahrt.verbrauchteLiter)} L</dd>
      <dt>Kosten</dt><dd>${formatMoney(fahrt.kosten, currency)}</dd>
      <dt>FIFO</dt><dd>${parts}</dd>
      <dt>Notizen</dt><dd>${formatNotes(fahrt.notizen) || "Keine"}</dd>
    </dl>
    ${fahrt.warnung ? `<p class="warning">${escapeHtml(fahrt.warnung)} Nicht zugeordnet: ${formatNumber(fahrt.nichtZugeordneteLiter)} L.</p>` : ""}
    <div class="actions"><button data-trip-edit="${fahrt.id}">Bearbeiten</button><button class="danger" data-trip-delete="${fahrt.id}">Löschen</button></div>`;
}

export function formatTripLabel(fahrt) {
  return `${formatTripDate(fahrt.datum)} ${formatTripOrder(fahrt)}`;
}

export function formatTripDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatTripOrder(fahrt) {
  return `(${Number(fahrt.index) || 1})`;
}

export function editableNotes(notes) {
  return splitAutomaticNote(notes).manual;
}

function formatNotes(notes) {
  const { manual, automatic } = splitAutomaticNote(notes);
  return `${escapeHtml(manual)}${automatic ? `<span class="auto-note">${escapeHtml(automatic)}</span>` : ""}`;
}

function splitAutomaticNote(notes) {
  const text = String(notes || "");
  const match = text.match(/\n?(\[Automatische Notiz\] Zwischenziele: .*?)$/s);
  return {
    manual: match ? text.slice(0, match.index).trim() : text.trim(),
    automatic: match ? match[1] : "",
  };
}
