import { recalculate } from "./fifo.js";

export const defaultData = () => ({
  fahrten: [],
  tankvorgaenge: [],
  favoriten: [],
  einstellungen: { tankvolumen: 80, waehrung: "EUR", darkMode: true, initialized: false },
  berechnung: { kraftstoffbestand: 0, kraftstoffwert: 0, schichten: [] },
});

export function validateData(value) {
  if (!value || typeof value !== "object") throw new Error("Die Datei enthält kein JSON-Objekt.");
  if (!Array.isArray(value.fahrten) || !Array.isArray(value.tankvorgaenge) || !Array.isArray(value.favoriten)) {
    throw new Error("Die Datei muss fahrten, tankvorgaenge und favoriten als Listen enthalten.");
  }
  return {
    ...defaultData(),
    ...value,
    favoriten: value.favoriten.map((fav) => ({
      type: fav.type || "address",
      label: fav.label || fav.id || "",
      brand: fav.brand || "",
      adresse: fav.adresse || "",
    })).filter((fav) => fav.label && fav.adresse),
    tankvorgaenge: value.tankvorgaenge.map((tank) => ({ ort: "", notizen: "", verbrauchteLiter: 0, verbrauchsFahrten: [], ...tank })),
    einstellungen: { ...defaultData().einstellungen, ...(value.einstellungen || {}) },
  };
}

export function loadData() {
  return recalculate(defaultData());
}

export function saveData(data) {
  return recalculate(data);
}

export function downloadJson(data, prefix = "fahrtenbuch") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
