import { correctionChanges } from "./correction-review.js";
import { escapeHtml } from "./favorites.js";
import { formatNumber, formatMoney, formatFuelIdentification } from "./tanken.js";
import { downloadJson, loadData, saveData } from "./storage.js";
import { favoriteOptions, fuelStationOptions, renderFavorites } from "./favorites.js";
import { addWaypoint, bindTripSorting, editableNotes, renderTrips, setWaypoints, tripDetailHtml, upsertTrip } from "./fahrten.js";
import { correctionFuelDetailHtml, fuelDetailHtml, formatFuelDateTimeInput, renderFuel, upsertFuel } from "./tanken.js";
import { renderDashboard } from "./dashboard.js";
import { getCurrentUser, getRemoteCapabilities, loadRemoteData, saveRemoteData, signIn, signOut, signUp } from "./supabase-sync.js";

import { bindSimulation, renderSimulation } from "./simulation.js";

let data = loadData();
let acceptedData = structuredClone(data);
let reviewPending = false;
let currentUser = null;
let syncing = false;
let remoteReady = false;
const $ = (selector) => document.querySelector(selector);

function reviewCorrections(changes, currency, allowDecline, declineLabel = "Tankung ohne Abgleich speichern") {
  const dialog = $("#correctionDialog");
  $("#correctionOverview").innerHTML = changes.map(({ tank, before, after, kind, tripId }) => {
    if (kind === "deficit") return `<article class="correction-note"><h3>Fehlender Kraftstoff für Fahrt ${escapeHtml(tripId)}</h3>
      <p>${after ? "Der Fahrtverbrauch überschreitet den erfassten Tankbestand. Eine eigene Korrekturtankung gleicht die fehlenden Liter aus." : "Die bisherige Korrekturtankung wird entfernt."}</p>
      ${before ? `<p>Bisher: ${formatNumber(before.liter)} L · ${formatMoney(before.wert, currency)}</p>` : ""}
      ${after ? `<dl class="detail-grid"><dt>Fehlmenge</dt><dd>${formatNumber(after.liter)} L</dd>
        <dt>Letzter Tankpreis</dt><dd>${formatNumber(after.preisProLiter, 5)} ${escapeHtml(currency)} / L</dd>
        <dt>Korrekturwert</dt><dd>${formatMoney(after.wert, currency)}</dd></dl>` : ""}</article>`;
    return `
    <article class="correction-note">
      <h3>${escapeHtml(formatFuelIdentification(tank))}</h3>
      <p>${after ? after.liter > 0 ? "Eigene Zeile unter Tanken: Bestandskorrektur" : "Eigene Zeile unter Fahrten: Korrekturfahrt" : "Bestehende Korrektur entfernen"}</p>
      ${before ? `<p>Bisher: ${formatNumber(before.liter)} L · ${formatMoney(before.wert, currency)}</p>` : ""}
      ${after ? `<dl class="detail-grid"><dt>Tatsächlich getankt</dt><dd>${formatNumber(tank.liter)} L</dd>
        <dt>Berechneter Bestand nach Tankung</dt><dd>${formatNumber(tank.zielbestandLiter - after.liter)} L</dd>
        <dt>Zielbestand</dt><dd>${formatNumber(tank.zielbestandLiter)} L</dd>
        <dt>Korrektur</dt><dd>${after.liter > 0 ? "+" : ""}${formatNumber(after.liter)} L</dd>
        <dt>${after.liter > 0 ? "Bestandsmittelwert / Liter" : "FIFO-Abschreibung"}</dt>
        <dd>${after.liter > 0 ? formatNumber(after.preisProLiter, 5) + " " + escapeHtml(currency) : formatMoney(-after.wert, currency)}</dd>
        <dt>Wertänderung</dt><dd>${formatMoney(after.wert, currency)}</dd></dl>` : ""}
    </article>`; }).join("");
  $("#declineCorrection").textContent = declineLabel;
  $("#declineCorrection").classList.toggle("hidden", !allowDecline);
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue || "cancel"), { once: true });
    dialog.showModal();
  });
}

async function persist({ declineTankKennung = null, declineTripId = null } = {}) {
  if (reviewPending) return false;
  const candidate = saveData(structuredClone(data));
  const accountId = currentUser?.id;
  data = structuredClone(acceptedData);
  let changes = correctionChanges(acceptedData, candidate);
  if (changes.length) {
    reviewPending = true;
    try {
      const choice = await reviewCorrections(changes, candidate.einstellungen.waehrung, Boolean(declineTankKennung || declineTripId), declineTripId ? "Fahrt ohne Ausgleich speichern" : "Tankung ohne Abgleich speichern");
      if (choice === "decline" && (declineTankKennung || declineTripId)) {
        const tank = candidate.tankvorgaenge.find(item => item.lokaleKennung === declineTankKennung);
        if (tank) { tank.vollgetankt = false; tank.zielbestandLiter = null; }
        if (declineTripId) candidate.fahrten.find(trip => trip.id === declineTripId).fehlbestandAusgleichen = false;
        saveData(candidate);
        // Historical changes can affect other approved reconciliations too.
        changes = correctionChanges(acceptedData, candidate).filter(change => !(declineTankKennung && change.tank.lokaleKennung === declineTankKennung) && !(declineTripId && change.tripId === declineTripId));
        if (changes.length && await reviewCorrections(changes, candidate.einstellungen.waehrung, false) !== "approve") return false;
      } else if (choice !== "approve") return false;
    } finally {
      reviewPending = false;
    }
  }
  if (currentUser?.id !== accountId) return false;
  data = candidate;
  acceptedData = structuredClone(data);
  render();
  if (!currentUser || syncing || !remoteReady) return true;
  try {
    setSyncStatus("Synchronisiere...");
    await saveRemoteData(data);
    syncFuelAvailability();
    setSyncStatus(`Synchronisiert als ${currentUser.email}.`);
  } catch (error) {
    syncFuelAvailability();
    setSyncStatus(`Synchronisierung fehlgeschlagen: ${error.message}`);
  }
  return true;
}

function render() {
  document.body.classList.toggle("dark", Boolean(data.einstellungen.darkMode));
  syncSettingsForm();
  syncFuelAvailability();
  $("#favoriteAddresses").innerHTML = favoriteOptions(data);
  $("#fuelStationFavorites").innerHTML = fuelStationOptions(data);
  renderDashboard(data);
  renderSimulation(data);
  renderTrips(data, data.einstellungen.waehrung, showTripDetail);
  renderFuel(data, data.einstellungen.waehrung, showFuelDetail);
  renderFavorites(data, editFavorite, deleteFavorite);
  $("#warningBox").classList.toggle("hidden", !data.fahrten.some((fahrt) => fahrt.warnung));
  $("#warningBox").textContent = data.fahrten.some((fahrt) => fahrt.warnung)
    ? "Mindestens eine Fahrt überschreitet die bisher erfasste Tankmenge."
    : "";
}

function resetTripForm() {
  $("#tripForm").reset();
  $("#tripForm").datum.valueAsDate = new Date();
  $("#tripForm").editingId.value = "";
  $("#tripFormTitle").textContent = "Neue Fahrt";
  setWaypoints([], saveFavoriteFromAddress);
}

function syncFuelAvailability() {
  const schema = getRemoteCapabilities();
  const enabled = Boolean(currentUser && remoteReady && schema?.fullTank);
  const form = $("#fuelForm");
  form.vollgetankt.disabled = !enabled;
  form.zielbestandLiter.disabled = !enabled || !form.vollgetankt.checked;
  const hint = $("#fuelSchemaHint");
  hint.textContent = !currentUser ? "Volltankabgleich ist nach Anmeldung und Schema-Prüfung verfügbar."
    : !remoteReady || !schema ? "Volltankabgleich ist bis zur erfolgreichen Schema-Prüfung gesperrt."
    : !schema.fullTank ? "Volltankabgleich gesperrt: Bitte migrations/20261007_volltankabgleich.sql und migrations/20261007_berechnungsposition.sql in Supabase ausführen. Normale Fahrten und Tankungen bleiben speicherbar."
    : "";
  hint.classList.toggle("hidden", enabled);
}

function resetFuelForm() {
  $("#fuelForm").reset();
  $("#fuelForm").datum.value = formatFuelDateTimeInput(new Date());
  $("#fuelForm").editingId.value = "";
  $("#fuelForm").zielbestandLiter.value = data.einstellungen.tankvolumen;
  $("#fuelForm").zielbestandLiter.disabled = true;
  $("#fuelFormTitle").textContent = "Neuer Tankvorgang";
  syncFuelAvailability();
}

function resetFavoriteForm() {
  $("#favoriteForm").reset();
  $("#favoriteForm").editingId.value = "";
  $("#favoriteFormTitle").textContent = "Neuer Favorit";
}

function showTripDetail(id, backFuelId = "") {
  const fahrt = data.fahrten.find((item) => item.id === id);
  $("#tripDetail").innerHTML = tripDetailHtml(fahrt, data.einstellungen.waehrung);
  $("#tripDetail").querySelectorAll("[data-trip-fuel]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#tripDialog").close();
      showFuelDetail(button.dataset.tripFuel);
    });
  });
  $("#tripDetail [data-trip-edit]")?.addEventListener("click", () => {
    $("#tripDialog").close();
    editTrip(id);
  });
  $("#tripDetail [data-trip-delete]")?.addEventListener("click", () => {
    $("#tripDialog").close();
    deleteTrip(id);
  });
  if (backFuelId) {
    $("#tripDetail").insertAdjacentHTML("beforeend", `<div class="actions"><button data-back-fuel="${backFuelId}" class="ghost">Zurück zum Tankvorgang</button></div>`);
    $("#tripDetail [data-back-fuel]").addEventListener("click", () => {
      $("#tripDialog").close();
      showFuelDetail(backFuelId);
    });
  }
  $("#tripDialog").showModal();
}

function showFuelDetail(id, correctionOnly = false) {
  const tank = data.tankvorgaenge.find((item) => item.id === id)
    || data.berechnung.korrekturtankvorgaenge?.find(item => item.id === id);
  if (!tank) return;
  $("#fuelDetail").innerHTML = correctionOnly || tank.istKorrektur
    ? correctionFuelDetailHtml(tank, data.einstellungen.waehrung) : fuelDetailHtml(tank, data.einstellungen.waehrung);
  $("#fuelDetail [data-correction-main-fuel]")?.addEventListener("click", () => {
    $("#fuelDialog").close(); showFuelDetail(id);
  });
  $("#fuelDetail [data-fuel-edit]")?.addEventListener("click", () => {
    $("#fuelDialog").close();
    editFuel(id);
  });
  $("#fuelDetail [data-fuel-delete]")?.addEventListener("click", () => {
    $("#fuelDialog").close();
    deleteFuel(id);
  });
  $("#fuelDetail").querySelectorAll("[data-fuel-trip]").forEach((row) => {
    row.addEventListener("click", () => {
      $("#fuelDialog").close();
      showTripDetail(row.dataset.fuelTrip, id);
    });
  });
  $("#fuelDialog").showModal();
}

function editTrip(id) {
  const fahrt = data.fahrten.find((item) => item.id === id);
  const form = $("#tripForm");
  form.editingId.value = fahrt.id;
  form.datum.value = fahrt.datum;
  form.index.value = fahrt.index;
  form.start.value = fahrt.start;
  form.ziel.value = fahrt.ziel;
  form.kilometer.value = fahrt.kilometer;
  form.verbrauchPro100km.value = fahrt.verbrauchPro100km;
  form.notizen.value = editableNotes(fahrt.notizen);
  setWaypoints(fahrt.zwischenziele || [], saveFavoriteFromAddress);
  $("#tripFormTitle").textContent = `Fahrt ${fahrt.id} bearbeiten`;
  openView("fahrten");
}

function deleteTrip(id) {
  if (!confirm("Diese Fahrt wirklich löschen?")) return;
  data.fahrten = data.fahrten.filter((item) => item.id !== id);
  persist();
}

function editFuel(id) {
  const tank = data.tankvorgaenge.find((item) => item.id === id);
  const form = $("#fuelForm");
  form.editingId.value = tank.id;
  form.datum.value = formatFuelDateTimeInput(tank.datumZeit || `${tank.datum}T00:00`);
  form.liter.value = tank.liter;
  form.preisProLiter.value = tank.preisProLiter;
  form.ort.value = tank.ort || "";
  form.vollgetankt.checked = Boolean(tank.vollgetankt);
  form.zielbestandLiter.value = tank.zielbestandLiter ?? data.einstellungen.tankvolumen;
  form.zielbestandLiter.disabled = !tank.vollgetankt;
  form.notizen.value = tank.notizen || "";
  syncFuelAvailability();
  $("#fuelFormTitle").textContent = `Tankvorgang ${tank.id} bearbeiten`;
  openView("tanken");
}

function deleteFuel(id) {
  if (!confirm("Diesen Tankvorgang wirklich löschen?")) return;
  data.tankvorgaenge = data.tankvorgaenge.filter((item) => item.id !== id);
  persist();
}

function editFavorite(label) {
  const fav = data.favoriten.find((item) => item.label === label);
  const form = $("#favoriteForm");
  form.editingId.value = fav.label;
  form.type.value = fav.type || "address";
  form.label.value = fav.label;
  form.brand.value = fav.brand || "";
  form.adresse.value = fav.adresse;
  $("#favoriteFormTitle").textContent = `Favorit ${fav.label} bearbeiten`;
  openView("favoriten");
}

function deleteFavorite(label) {
  if (!confirm("Diesen Favoriten wirklich löschen?")) return;
  data.favoriten = data.favoriten.filter((item) => item.label !== label);
  persist();
}

function saveAddressFavorite(inputName) {
  const input = $(`#tripForm [name="${inputName}"]`);
  saveFavoriteFromAddress(input.value);
}

function saveFavoriteFromAddress(value) {
  const adresse = value.trim();
  if (!adresse) return;
  const label = prompt("Bezeichnung für den Favoriten:", adresse.split(",")[0] || adresse);
  if (!label) return;
  upsertFavorite({ type: "address", label: label.trim(), brand: "", adresse });
  persist();
}

function upsertFavorite(record) {
  const existing = data.favoriten.find((fav) => fav.label === record.label);
  if (existing) data.favoriten.splice(data.favoriten.indexOf(existing), 1, record);
  else data.favoriten.push(record);
}

function syncSettingsForm() {
  $("#settingsForm").tankvolumen.value = data.einstellungen.tankvolumen;
  $("#settingsForm").waehrung.value = data.einstellungen.waehrung;
  $("#settingsForm").darkMode.checked = data.einstellungen.darkMode;
  setSyncStatus(currentUser ? `Angemeldet als ${currentUser.email}.` : "Nicht angemeldet.");
}

function setMenuOpen(open, restoreFocus = false) {
  $("#mainNavigation").classList.toggle("menu-open", open);
  $("#menuToggle").setAttribute("aria-expanded", String(open));
  $("#menuToggle").setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
  if (restoreFocus) $("#menuToggle").focus();
}

function openView(id) {
  const menuWasOpen = $("#menuToggle").getAttribute("aria-expanded") === "true";
  setMenuOpen(false, menuWasOpen);
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
}

function bind() {
  bindSimulation(() => data);
  $("#menuToggle").addEventListener("click", () => {
    setMenuOpen($("#menuToggle").getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#mainNavigation, #menuToggle")) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#menuToggle").getAttribute("aria-expanded") === "true") {
      setMenuOpen(false, true);
    }
  });
  document.addEventListener("focusin", (event) => {
    if (!event.target.closest("#mainNavigation, #menuToggle")) setMenuOpen(false);
  });
  window.matchMedia("(max-width: 900px), (hover: none) and (pointer: coarse) and (max-height: 600px)")
    .addEventListener("change", () => setMenuOpen(false));
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => openView(tab.dataset.view)));
  $("#addWaypoint").addEventListener("click", () => addWaypoint("", saveFavoriteFromAddress));
  $("#cancelTripEdit").addEventListener("click", resetTripForm);
  $("#cancelFuelEdit").addEventListener("click", resetFuelForm);
  $("#cancelFavoriteEdit").addEventListener("click", resetFavoriteForm);
  document.querySelectorAll("[data-save-favorite]").forEach((button) => button.addEventListener("click", () => saveAddressFavorite(button.dataset.saveFavorite)));
  ["#tripSearch", "#tripFrom", "#tripTo", "#kmMin", "#kmMax", "#consMin", "#consMax", "#chartFrom", "#chartTo"].forEach((id) => $(id).addEventListener("input", render));
  bindTripSorting(render);

  $("#tripForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const trip = upsertTrip(data, event.currentTarget);
    trip.fehlbestandAusgleichen = Boolean(remoteReady && getRemoteCapabilities()?.deficitCorrection);
    const preview = saveData(structuredClone(data));
    const proposedTrip = preview.fahrten.find(item => item.id === trip.id);
    if (proposedTrip.nichtZugeordneteLiter > 0) {
      trip.fehlbestandAusgleichen = false;
      alert(getRemoteCapabilities()?.deficitCorrection
        ? "Die Fahrt überschreitet den Tankbestand. Ohne früheren Tankpreis kann keine Korrekturtankung bewertet werden. Die Fahrt erhält eine Fehlbestandswarnung."
        : "Die Fahrt überschreitet den Tankbestand. Für den automatischen Ausgleich fehlt die Migration migrations/20261008_fehlbestand.sql oder die Berechnungsposition. Die Fahrt erhält eine Fehlbestandswarnung.");
    }
    if (await persist({ declineTripId: trip.id })) resetTripForm();
  });
  $("#fuelForm").vollgetankt.addEventListener("change", (event) => {
    $("#fuelForm").zielbestandLiter.disabled = !event.target.checked;
  });
  $("#fuelForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.currentTarget.vollgetankt.checked && !(remoteReady && getRemoteCapabilities()?.fullTank)) {
      alert("Volltankabgleich benötigt eine erfolgreiche Schema-Prüfung und beide Supabase-Migrationen.");
      return;
    }
    let tank;
    try { tank = upsertFuel(data, event.currentTarget); }
    catch (error) { alert(error.message); return; }
    const approved = await persist({ declineTankKennung: tank?.vollgetankt ? tank.lokaleKennung : null });
    if (approved) resetFuelForm();
  });
  $("#favoriteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const oldLabel = form.editingId.value;
    const newLabel = form.label.value.trim();
    if (oldLabel && oldLabel !== newLabel) data.favoriten = data.favoriten.filter((fav) => fav.label !== oldLabel);
    upsertFavorite({ type: form.type.value, label: newLabel, brand: form.brand.value.trim(), adresse: form.adresse.value.trim() });
    resetFavoriteForm();
    persist();
  });
  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    data.einstellungen.tankvolumen = Number(event.currentTarget.tankvolumen.value) || 0;
    data.einstellungen.waehrung = event.currentTarget.waehrung.value.trim() || "EUR";
    data.einstellungen.darkMode = event.currentTarget.darkMode.checked;
    if (!$("#fuelForm").editingId.value) $("#fuelForm").zielbestandLiter.value = data.einstellungen.tankvolumen;
    persist();
  });
  $("#exportData").addEventListener("click", () => downloadJson(data, "fahrtenbuch-export"));
  $("#authForm").addEventListener("submit", (event) => {
    event.preventDefault();
    authenticate($("#authEmail").value, $("#authPassword").value, false);
  });
  $("#signUp").addEventListener("click", () => authenticate($("#authEmail").value, $("#authPassword").value, true));
  $("#signOut").addEventListener("click", logout);
  $("#startAuthForm").addEventListener("submit", (event) => {
    event.preventDefault();
    authenticate($("#startAuthEmail").value, $("#startAuthPassword").value, false, true);
  });
  $("#startSignUp").addEventListener("click", () => authenticate($("#startAuthEmail").value, $("#startAuthPassword").value, true, true));
}

async function authenticate(email, password, createAccount, closeStart = false) {
  try {
    if (!email || !password) throw new Error("Bitte E-Mail und Passwort eingeben.");
    remoteReady = false;
    syncFuelAvailability();
    setSyncStatus(createAccount ? "Registriere..." : "Melde an...");
    currentUser = createAccount ? await signUp(email, password) : await signIn(email, password);
    if (!currentUser) throw new Error("Bitte bestätige ggf. deine E-Mail und melde dich danach an.");
    await loadFromSupabase();
    data.einstellungen.initialized = true;
    if (closeStart) $("#startDialog").close();
  } catch (error) {
    setSyncStatus(`Anmeldung fehlgeschlagen: ${error.message}`);
    alert(error.message);
  }
}

async function loadFromSupabase() {
  syncing = true;
  remoteReady = false;
  syncFuelAvailability();
  try {
    const remote = await loadRemoteData();
    if (remote) {
      data = remote;
      data.einstellungen.initialized = true;
      data = saveData(data);
      acceptedData = structuredClone(data);
    } else {
      throw new Error("Keine angemeldete Sitzung zum Laden vorhanden.");
    }
    remoteReady = true;
    render();
  } finally {
    syncing = false;
  }
}

async function logout() {
  await signOut();
  currentUser = null;
  remoteReady = false;
  setSyncStatus("Nicht angemeldet.");
  render();
}

function setSyncStatus(message) {
  const status = $("#syncStatus");
  if (status) status.textContent = message;
}

function initChartRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  $("#chartFrom").value = formatDateInput(from);
  $("#chartTo").value = formatDateInput(to);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function init() {
  syncSettingsForm();
  initChartRange();
  resetTripForm();
  resetFuelForm();
  bind();
  currentUser = await getCurrentUser();
  if (currentUser) await loadFromSupabase();
  render();
  if (!data.einstellungen.initialized && !currentUser) $("#startDialog").showModal();
}

init();
