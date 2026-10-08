import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";
import { defaultData, validateData } from "./storage.js";
import { makeId, nextIndex } from "./fifo.js";
import { compatibleRows, inspectSchema, preflightRows, MIGRATION_MESSAGE } from "./supabase-schema.js";
import { formatFuelDateTimeInput } from "./tanken.js";

const TABLES = {
  trips: "fahrten",
  fuel: "tankvorgaenge",
  addressFavorites: "favoritenAdressen",
  fuelFavorites: "favoritenTankstelle",
};

let remoteCapabilities = null;
export const getRemoteCapabilities = () => remoteCapabilities;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadRemoteData() {
  const user = await getCurrentUser();
  if (!user) return null;

  remoteCapabilities = null;
  remoteCapabilities = await inspectSchema(supabase, user.id);

  const [trips, fuel, addressFavorites, fuelFavorites] = await Promise.all([
    selectRows(TABLES.trips).eq("user_id", user.id),
    selectRows(TABLES.fuel).eq("user_id", user.id),
    selectRows(TABLES.addressFavorites).eq("user_id", user.id),
    selectRows(TABLES.fuelFavorites).eq("user_id", user.id),
  ]);

  const data = defaultData();
  data.fahrten = mapTripsFromRemote(trips.data || []);
  data.tankvorgaenge = mapFuelFromRemote(fuel.data || []);
  data.favoriten = [
    ...(addressFavorites.data || []).map((row) => ({ type: "address", label: row.name, brand: "", adresse: row.adresse })),
    ...(fuelFavorites.data || []).map((row) => ({ type: "fuelStation", label: row.name, brand: row.marke || "", adresse: row.adresse })),
  ];

  for (const result of [trips, fuel, addressFavorites, fuelFavorites]) {
    if (result.error) throw result.error;
  }
  return validateData(data);
}

export async function saveRemoteData(fahrtenbuchData) {
  const user = await getCurrentUser();
  if (!user) return;
  const data = validateData(fahrtenbuchData);

  remoteCapabilities = null;
  const schema = await inspectSchema(supabase, user.id);
  remoteCapabilities = schema;
  if (!schema.fullTank && (data.tankvorgaenge.some(tank => tank.vollgetankt)
    || data.fahrten.some(fahrt => fahrt.istKorrektur))) throw new Error(MIGRATION_MESSAGE);

  if (!schema.deficitCorrection && data.fahrten.some(fahrt => fahrt.fehlbestandAusgleichen)) {
    throw new Error("Fehlbestandskorrekturen benötigen zusätzlich migrations/20261008_fehlbestand.sql. Es wurden keine Daten gelöscht.");
  }

  const batches = [
    { table: TABLES.trips, rows: data.fahrten.map(fahrt => mapTripToRemote(fahrt, user.id)), sample: mapTripToRemote({}, user.id) },
    { table: TABLES.fuel, rows: data.tankvorgaenge.map(tank => mapFuelToRemote(tank, user.id)), sample: mapFuelToRemote({}, user.id) },
    { table: TABLES.addressFavorites, rows: data.favoriten.filter(fav => fav.type === "address").map(fav => mapAddressFavoriteToRemote(fav, user.id)), sample: mapAddressFavoriteToRemote({}, user.id) },
    { table: TABLES.fuelFavorites, rows: data.favoriten.filter(fav => fav.type === "fuelStation").map(fav => mapFuelFavoriteToRemote(fav, user.id)), sample: mapFuelFavoriteToRemote({}, user.id) },
  ].map(batch => ({ table: batch.table, rows: compatibleRows(batch.table, batch.rows, schema),
    columns: Object.keys(compatibleRows(batch.table, [batch.sample], schema)[0]) }));
  await preflightRows(supabase, user.id, batches);
  for (const { table, rows } of batches) await replaceUserRows(table, user.id, rows);
}

async function replaceUserRows(table, userId, rows) {
  const deleteResult = await supabase.from(table).delete().eq("user_id", userId);
  if (deleteResult.error) throw new Error(`${table}: Löschen fehlgeschlagen: ${deleteResult.error.message}`);

  if (!rows.length) return;
  const insertResult = await supabase.from(table).insert(rows);
  if (insertResult.error) throw new Error(`${table}: Einfügen fehlgeschlagen: ${insertResult.error.message}`);
}

function selectRows(table) {
  return supabase.from(table).select("*");
}

function mapTripsFromRemote(rows) {
  const local = [];
  const sorted = [...rows].sort((a, b) => String(a.datum || a.created_at).localeCompare(String(b.datum || b.created_at)) || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  for (const row of sorted) {
    const datum = dateOnly(row.datum || row.created_at);
    const index = Number(row.ordnungsfaktor) || nextIndex(local, datum);
    local.push({
      id: makeId(datum, index),
      datum,
      index,
      berechnungsPosition: row.berechnungs_position == null ? null : Number(row.berechnungs_position),
      start: row.start,
      ziel: row.ziel,
      zwischenziele: Array.isArray(row.zwischenziele) ? row.zwischenziele : [],
      kilometer: Number(row.kilometer) || 0,
      verbrauchPro100km: Number(row.verbrauch_pro_100km) || 0,
      verbrauchteLiter: 0,
      kosten: 0,
      notizen: row.notizen || "",
      createdAt: row.created_at,
      remoteId: row.id,
      istKorrektur: Boolean(row.ist_korrektur),
      fehlbestandAusgleichen: Boolean(row.fehlbestand_ausgleichen),
      korrekturTankKennung: row.korrektur_tank_kennung || null,
      korrekturLiter: Number(row.korrektur_liter) || 0,
    });
  }
  return local;
}

function mapFuelFromRemote(rows) {
  const sorted = [...rows].sort((a, b) => String(a.datum).localeCompare(String(b.datum)) || String(a.created_at).localeCompare(String(b.created_at)));
  const local = [];
  for (const row of sorted) {
    const datum = formatFuelDateTimeInput(row.datum || row.created_at).slice(0, 10);
    const index = nextIndex(local, datum);
    local.push({
      id: makeId(datum, index),
      datum,
      datumZeit: row.datum || row.created_at || null,
      index,
      berechnungsPosition: row.berechnungs_position == null ? null : Number(row.berechnungs_position),
      liter: Number(row.liter) || 0,
      preisProLiter: Number(row.preis_pro_liter) || 0,
      ort: row.tankstelle || "",
      notizen: row.notizen || "",
      lokaleKennung: row.lokale_kennung || crypto.randomUUID(),
      vollgetankt: Boolean(row.vollgetankt),
      zielbestandLiter: row.zielbestand_liter == null ? null : Number(row.zielbestand_liter),
      gesamtpreis: 0,
      createdAt: row.created_at,
    });
  }
  return local;
}

function mapTripToRemote(fahrt, userId) {
  return {
    user_id: userId,
    datum: fahrt.datum,
    ordnungsfaktor: Number(fahrt.index) || 1,
    berechnungs_position: fahrt.berechnungsPosition,
    ist_korrektur: Boolean(fahrt.istKorrektur),
    fehlbestand_ausgleichen: Boolean(fahrt.fehlbestandAusgleichen),
    korrektur_tank_kennung: fahrt.korrekturTankKennung || null,
    korrektur_liter: fahrt.istKorrektur ? fahrt.korrekturLiter : null,
    start: fahrt.start,
    ziel: fahrt.ziel,
    zwischenziele: fahrt.zwischenziele || [],
    kilometer: Number(fahrt.kilometer) || 0,
    verbrauch_pro_100km: Number(fahrt.verbrauchPro100km) || 0,
    notizen: fahrt.notizen || "",
    created_at: fahrt.createdAt || new Date().toISOString(),
  };
}

function mapFuelToRemote(tank, userId) {
  return {
    user_id: userId,
    datum: tank.datumZeit || `${tank.datum}T00:00:00.000Z`,
    liter: Number(tank.liter) || 0,
    preis_pro_liter: Number(tank.preisProLiter) || 0,
    created_at: tank.createdAt || new Date().toISOString(),
    tankstelle: tank.ort || "",
    lokale_kennung: tank.lokaleKennung,
    berechnungs_position: tank.berechnungsPosition,
    vollgetankt: Boolean(tank.vollgetankt),
    zielbestand_liter: tank.vollgetankt ? tank.zielbestandLiter : null,
    notizen: tank.notizen || "",
  };
}

function mapAddressFavoriteToRemote(fav, userId) {
  return { user_id: userId, name: fav.label, adresse: fav.adresse, created_at: fav.createdAt || new Date().toISOString() };
}

function mapFuelFavoriteToRemote(fav, userId) {
  return { user_id: userId, name: fav.label, marke: fav.brand || "", adresse: fav.adresse, created_at: fav.createdAt || new Date().toISOString() };
}

function dateOnly(value) {
  return String(value || new Date().toISOString()).slice(0, 10);
}
