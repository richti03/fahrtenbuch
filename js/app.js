import { defaultData, downloadJson, loadData, saveData } from "./storage.js";
import { favoriteOptions, fuelStationOptions, renderFavorites } from "./favorites.js";
import { addWaypoint, bindTripSorting, editableNotes, renderTrips, setWaypoints, tripDetailHtml, upsertTrip } from "./fahrten.js";
import { fuelDetailHtml, renderFuel, upsertFuel } from "./tanken.js";
import { renderDashboard } from "./dashboard.js";
import { getCurrentUser, loadRemoteData, saveRemoteData, signIn, signOut, signUp } from "./supabase-sync.js";

let data = loadData();
let currentUser = null;
let syncing = false;
const $ = (selector) => document.querySelector(selector);

async function persist() {
  data = saveData(data);
  render();
  if (!currentUser || syncing) return;
  try {
    setSyncStatus("Synchronisiere...");
    await saveRemoteData(data);
    setSyncStatus(`Synchronisiert als ${currentUser.email}.`);
  } catch (error) {
    setSyncStatus(`Synchronisierung fehlgeschlagen: ${error.message}`);
  }
}

function render() {
  document.body.classList.toggle("dark", Boolean(data.einstellungen.darkMode));
  syncSettingsForm();
  $("#favoriteAddresses").innerHTML = favoriteOptions(data);
  $("#fuelStationFavorites").innerHTML = fuelStationOptions(data);
  renderDashboard(data);
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

function resetFuelForm() {
  $("#fuelForm").reset();
  $("#fuelForm").datum.valueAsDate = new Date();
  $("#fuelForm").editingId.value = "";
  $("#fuelFormTitle").textContent = "Neuer Tankvorgang";
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
  $("#tripDetail [data-trip-edit]").addEventListener("click", () => {
    $("#tripDialog").close();
    editTrip(id);
  });
  $("#tripDetail [data-trip-delete]").addEventListener("click", () => {
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

function showFuelDetail(id) {
  const tank = data.tankvorgaenge.find((item) => item.id === id);
  $("#fuelDetail").innerHTML = fuelDetailHtml(tank, data.einstellungen.waehrung);
  $("#fuelDetail [data-fuel-edit]").addEventListener("click", () => {
    $("#fuelDialog").close();
    editFuel(id);
  });
  $("#fuelDetail [data-fuel-delete]").addEventListener("click", () => {
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
  form.datum.value = tank.datum;
  form.liter.value = tank.liter;
  form.preisProLiter.value = tank.preisProLiter;
  form.ort.value = tank.ort || "";
  form.notizen.value = tank.notizen || "";
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

function openView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
}

function bind() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => openView(tab.dataset.view)));
  $("#addWaypoint").addEventListener("click", () => addWaypoint("", saveFavoriteFromAddress));
  $("#cancelTripEdit").addEventListener("click", resetTripForm);
  $("#cancelFuelEdit").addEventListener("click", resetFuelForm);
  $("#cancelFavoriteEdit").addEventListener("click", resetFavoriteForm);
  document.querySelectorAll("[data-save-favorite]").forEach((button) => button.addEventListener("click", () => saveAddressFavorite(button.dataset.saveFavorite)));
  ["#tripSearch", "#tripFrom", "#tripTo", "#kmMin", "#kmMax", "#consMin", "#consMax", "#chartFrom", "#chartTo"].forEach((id) => $(id).addEventListener("input", render));
  bindTripSorting(render);

  $("#tripForm").addEventListener("submit", (event) => {
    event.preventDefault();
    upsertTrip(data, event.currentTarget);
    resetTripForm();
    persist();
  });
  $("#fuelForm").addEventListener("submit", (event) => {
    event.preventDefault();
    upsertFuel(data, event.currentTarget);
    resetFuelForm();
    persist();
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
    persist();
  });
  $("#exportData").addEventListener("click", () => downloadJson(data, "fahrtenbuch-export"));
  $("#startFresh").addEventListener("click", startFresh);
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
  $("#startNewData").addEventListener("click", () => {
    data.einstellungen.initialized = true;
    persist();
    $("#startDialog").close();
  });
}

async function authenticate(email, password, createAccount, closeStart = false) {
  try {
    if (!email || !password) throw new Error("Bitte E-Mail und Passwort eingeben.");
    setSyncStatus(createAccount ? "Registriere..." : "Melde an...");
    currentUser = createAccount ? await signUp(email, password) : await signIn(email, password);
    if (!currentUser) throw new Error("Bitte bestätige ggf. deine E-Mail und melde dich danach an.");
    await loadFromSupabase();
    data.einstellungen.initialized = true;
    await persist();
    if (closeStart) $("#startDialog").close();
  } catch (error) {
    setSyncStatus(`Anmeldung fehlgeschlagen: ${error.message}`);
    alert(error.message);
  }
}

async function loadFromSupabase() {
  syncing = true;
  try {
    const remote = await loadRemoteData();
    if (remote) {
      data = remote;
      data.einstellungen.initialized = true;
      data = saveData(data);
    } else {
      data.einstellungen.initialized = true;
      await saveRemoteData(data);
    }
    render();
  } finally {
    syncing = false;
  }
}

async function logout() {
  await signOut();
  currentUser = null;
  setSyncStatus("Nicht angemeldet.");
  render();
}

function startFresh() {
  if (!confirm("Wirklich mit einem leeren Datenbestand neu beginnen?")) return;
  data = defaultData();
  data.einstellungen.initialized = true;
  persist();
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
