export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function makeId(date, index) {
  return `${date}-${String(index).padStart(2, "0")}`;
}

export function nextIndex(items, date, excludeId = null) {
  const used = items
    .filter((item) => item.datum === date && item.id !== excludeId)
    .map((item) => Number(item.index) || Number(String(item.id || "").slice(-2)) || 0);
  return used.length ? Math.max(...used) + 1 : 1;
}

function sortRecords(records) {
  return [...records].sort((a, b) =>
    a.datum.localeCompare(b.datum) || Number(a.index) - Number(b.index) || a.type.localeCompare(b.type)
  );
}

export function recalculate(input) {
  const data = input;
  data.fahrten.forEach((fahrt) => {
    fahrt.verbrauchteLiter = round2((Number(fahrt.kilometer) || 0) * (Number(fahrt.verbrauchPro100km) || 0) / 100);
    fahrt.kosten = 0;
    fahrt.fifoAnteile = [];
    fahrt.nichtZugeordneteLiter = 0;
    fahrt.warnung = "";
  });
  data.tankvorgaenge.forEach((tank) => {
    tank.gesamtpreis = round2((Number(tank.liter) || 0) * (Number(tank.preisProLiter) || 0));
    tank.verbrauchteLiter = 0;
    tank.verbrauchsFahrten = [];
  });

  const layers = [];
  const events = [
    ...data.tankvorgaenge.map((item) => ({ ...item, type: "0-tank" })),
    ...data.fahrten.map((item) => ({ ...item, type: "1-fahrt" })),
  ];

  for (const event of sortRecords(events)) {
    if (event.type === "0-tank") {
      layers.push({
        tankId: event.id,
        datum: event.datum,
        liter: Number(event.liter) || 0,
        preisProLiter: Number(event.preisProLiter) || 0,
      });
      continue;
    }

    const fahrt = data.fahrten.find((item) => item.id === event.id);
    let remaining = Number(fahrt.verbrauchteLiter) || 0;
    let cost = 0;
    const parts = [];

    while (remaining > 0.000001 && layers.length) {
      const layer = layers[0];
      const used = Math.min(remaining, layer.liter);
      cost += used * layer.preisProLiter;
      parts.push({ tankId: layer.tankId, liter: round2(used), preisProLiter: layer.preisProLiter, kosten: round2(used * layer.preisProLiter) });
      const tank = data.tankvorgaenge.find((item) => item.id === layer.tankId);
      if (tank) {
        tank.verbrauchteLiter = round2((Number(tank.verbrauchteLiter) || 0) + used);
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

  data.berechnung = {
    kraftstoffbestand: round2(layers.reduce((sum, layer) => sum + layer.liter, 0)),
    kraftstoffwert: round2(layers.reduce((sum, layer) => sum + layer.liter * layer.preisProLiter, 0)),
    schichten: layers.map((layer) => ({ ...layer, liter: round2(layer.liter) })),
  };
  return data;
}
