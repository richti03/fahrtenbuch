export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function makeId(date, index) {
  return `${date}-${String(index).padStart(2, "0")}`;
}

export function nextIndex(items, date, excludeId = null) {
  const used = items
    .filter((item) => !item.istKorrektur && item.datum === date && item.id !== excludeId)
    .map((item) => Number(item.index) || Number(String(item.id || "").slice(-2)) || 0);
  return used.length ? Math.max(...used) + 1 : 1;
}

const hasPosition = (item) => Number.isInteger(item.berechnungsPosition) && item.berechnungsPosition > 0;

function records(data) {
  return [
    ...data.tankvorgaenge.map((item) => ({ item, type: "0-tank" })),
    ...data.fahrten.filter((item) => !item.istKorrektur).map((item) => ({ item, type: "1-fahrt" })),
  ];
}

function legacyOrder(a, b) {
  return Number(a.item.index) - Number(b.item.index) || a.type.localeCompare(b.type);
}

// Initialize old records once. Existing positions must survive edits and reloads.
export function ensureCalculationPositions(data) {
  const days = new Map();
  for (const record of records(data)) {
    const day = record.item.datum;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(record);
  }
  for (const daily of days.values()) {
    let position = Math.max(0, ...daily.filter(({ item }) => hasPosition(item)).map(({ item }) => item.berechnungsPosition));
    const missing = daily.filter(({ item }) => !hasPosition(item));
    missing.sort((a, b) => {
      const fullA = a.type === "0-tank" && a.item.vollgetankt;
      const fullB = b.type === "0-tank" && b.item.vollgetankt;
      return Number(Boolean(fullA)) - Number(Boolean(fullB)) || legacyOrder(a, b);
    });
    for (const { item } of missing) item.berechnungsPosition = ++position;
  }
}

export function nextCalculationPosition(data, datum) {
  ensureCalculationPositions(data);
  return Math.max(0, ...records(data).filter(({ item }) => item.datum === datum)
    .map(({ item }) => item.berechnungsPosition)) + 1;
}

function sortRecords(events) {
  return [...events].sort((a, b) => a.datum.localeCompare(b.datum)
    || a.berechnungsPosition - b.berechnungsPosition
    || Number(a.index) - Number(b.index) || a.type.localeCompare(b.type));
}

export function recalculate(input) {
  const data = input;
  ensureCalculationPositions(data);
  data.fahrten = data.fahrten.filter((fahrt) => !fahrt.istKorrektur);
  data.fahrten.forEach((fahrt) => {
    fahrt.verbrauchteLiter = round2((Number(fahrt.kilometer) || 0) * (Number(fahrt.verbrauchPro100km) || 0) / 100);
    fahrt.kosten = 0;
    fahrt.fifoAnteile = [];
    fahrt.nichtZugeordneteLiter = 0;
    fahrt.warnung = "";
    fahrt.fehlbestandKorrektur = null;
  });
  data.tankvorgaenge.forEach((tank) => {
    tank.gesamtpreis = round2((Number(tank.liter) || 0) * (Number(tank.preisProLiter) || 0));
    tank.verbrauchteLiter = 0;
    tank.verbrauchsFahrten = [];
    tank.korrektur = null;
    tank.korrekturVerbrauchteLiter = 0;
  });

  const layers = [];
  const correctionTanks = [];
  let lastFuelPrice = null;
  const events = [
    ...data.tankvorgaenge.map((item) => ({ ...item, type: "0-tank" })),
    ...data.fahrten.map((item) => ({ ...item, type: "1-fahrt" })),
  ];

  function consume(fahrt) {
    let remaining = Number(fahrt.verbrauchteLiter) || 0;
    let cost = 0;
    const parts = [];

    while (remaining > 0.000001 && layers.length) {
      const layer = layers[0];
      const used = Math.min(remaining, layer.liter);
      cost += used * layer.preisProLiter;
      parts.push({ tankId: layer.tankId, liter: round2(used), preisProLiter: layer.preisProLiter, istKorrektur: Boolean(layer.istKorrektur), kosten: round2(used * layer.preisProLiter) });
      const tank = data.tankvorgaenge.find((item) => item.id === layer.tankId) || correctionTanks.find((item) => item.id === layer.tankId);
      if (tank) {
        if (layer.istKorrektur) {
          tank.korrekturVerbrauchteLiter = round2(tank.korrekturVerbrauchteLiter + used);
          if (tank.istKorrektur) tank.verbrauchteLiter = round2(tank.verbrauchteLiter + used);
        }
        else tank.verbrauchteLiter = round2((Number(tank.verbrauchteLiter) || 0) + used);
        tank.verbrauchsFahrten.push({ fahrtId: fahrt.id, datum: fahrt.datum, liter: round2(used), kosten: round2(used * layer.preisProLiter) });
      }
      layer.liter = round2(layer.liter - used);
      remaining = round2(remaining - used);
      if (layer.liter <= 0.000001) layers.shift();
    }

    fahrt.kosten = round2(cost);
    fahrt.fifoAnteile = parts;
    fahrt.nichtZugeordneteLiter = round2(Math.max(0, remaining));
    if (fahrt.nichtZugeordneteLiter > 0) {
      fahrt.warnung = "Der berechnete Kraftstoffverbrauch überschreitet die bisher erfasste Tankmenge.";
    }
  }

  for (const event of sortRecords(events)) {
    if (event.type !== "0-tank") {
      const fahrt = data.fahrten.find((item) => item.id === event.id);
      const missing = round2(Math.max(0, fahrt.verbrauchteLiter - layers.reduce((sum, layer) => sum + layer.liter, 0)));
      if (missing > 0 && fahrt.fehlbestandAusgleichen && lastFuelPrice !== null) {
        const correction = { id: `fehlbestand-${fahrt.id}`, datum: fahrt.datum, index: fahrt.index,
          berechnungsPosition: fahrt.berechnungsPosition, istKorrektur: true, korrekturGrund: "fehlbestand",
          fahrtId: fahrt.id, liter: missing, preisProLiter: lastFuelPrice, gesamtpreis: round2(missing * lastFuelPrice),
          ort: "Bestandskorrektur", notizen: "[Bestandskorrektur] Ausgleich fehlenden Kraftstoffs für eine Fahrt",
          verbrauchteLiter: 0, korrekturVerbrauchteLiter: 0, verbrauchsFahrten: [] };
        correctionTanks.push(correction);
        fahrt.fehlbestandKorrektur = { liter: missing, preisProLiter: lastFuelPrice, wert: correction.gesamtpreis, tankId: correction.id };
        layers.push({ tankId: correction.id, datum: fahrt.datum, liter: missing, preisProLiter: lastFuelPrice, istKorrektur: true });
      }
      consume(fahrt);
      continue;
    }
    const tank = data.tankvorgaenge.find((item) => item.id === event.id);
    if (Number(tank.liter) > 0) layers.push({ tankId: tank.id, datum: tank.datum,
      liter: Number(tank.liter), preisProLiter: Number(tank.preisProLiter) || 0 });
    if (Number(tank.liter) > 0 && Number.isFinite(Number(tank.preisProLiter)) && Number(tank.preisProLiter) >= 0) lastFuelPrice = Number(tank.preisProLiter);
    if (!tank.vollgetankt) continue;
    const target = Number(tank.zielbestandLiter);
    if (!Number.isFinite(target) || target <= 0 || !(Number(tank.liter) > 0)) {
      throw new Error("Volltanken benötigt eine positive Tankmenge und einen positiven Zielbestand.");
    }
    const stock = layers.reduce((sum, layer) => sum + layer.liter, 0);
    const difference = round2(target - stock);
    if (!difference) continue;
    if (difference > 0) {
      const price = layers.reduce((sum, layer) => sum + layer.liter * layer.preisProLiter, 0) / stock;
      tank.korrektur = { liter: difference, preisProLiter: price, wert: round2(difference * price) };
      layers.push({ tankId: tank.id, datum: tank.datum, liter: difference, preisProLiter: price, istKorrektur: true });
    } else {
      const fahrt = { id: `korrektur-${tank.lokaleKennung || tank.id}`, datum: tank.datum,
        index: tank.index, berechnungsPosition: tank.berechnungsPosition, istKorrektur: true, korrekturTankKennung: tank.lokaleKennung || tank.id,
        korrekturTankId: tank.id, korrekturLiter: -difference, verbrauchteLiter: -difference, kilometer: 0, verbrauchPro100km: 0,
        start: "Bestandskorrektur", ziel: "Volltankabgleich", zwischenziele: [],
        notizen: "[Bestandskorrektur] Automatischer Volltankabgleich", createdAt: tank.createdAt,
        kosten: 0, fifoAnteile: [], nichtZugeordneteLiter: 0, warnung: "" };
      consume(fahrt);
      data.fahrten.push(fahrt);
      tank.korrektur = { liter: difference, wert: -fahrt.kosten, fahrtId: fahrt.id };
    }
  }

  data.berechnung = {
    korrekturtankvorgaenge: correctionTanks,
    kraftstoffbestand: round2(layers.reduce((sum, layer) => sum + layer.liter, 0)),
    kraftstoffwert: round2(layers.reduce((sum, layer) => sum + layer.liter * layer.preisProLiter, 0)),
    schichten: layers.map((layer) => ({ ...layer, liter: round2(layer.liter) })),
  };
  return data;
}
