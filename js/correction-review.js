export function correctionChanges(before, after) {
  const previous = new Map(before.tankvorgaenge.map(tank => [tank.lokaleKennung || tank.id, tank]));
  const current = new Map(after.tankvorgaenge.map(tank => [tank.lokaleKennung || tank.id, tank]));
  const changes = [];
  for (const key of new Set([...previous.keys(), ...current.keys()])) {
    const old = previous.get(key);
    const tank = current.get(key);
    const correction = tank?.korrektur;
    const prior = old?.korrektur;
    if (!correction && !prior) continue;
    if (JSON.stringify([prior?.liter, prior?.wert, prior?.preisProLiter]) === JSON.stringify([correction?.liter, correction?.wert, correction?.preisProLiter])) continue;
    changes.push({ tank: tank || old, before: prior || null, after: correction || null });
  }
  const oldTrips = new Map(before.fahrten.filter(trip => !trip.istKorrektur).map(trip => [trip.id, trip]));
  const newTrips = new Map(after.fahrten.filter(trip => !trip.istKorrektur).map(trip => [trip.id, trip]));
  for (const id of new Set([...oldTrips.keys(), ...newTrips.keys()])) {
    const trip = newTrips.get(id) || oldTrips.get(id);
    const prior = oldTrips.get(id)?.fehlbestandKorrektur;
    const correction = newTrips.get(id)?.fehlbestandKorrektur;
    if (JSON.stringify([prior?.liter, prior?.wert, prior?.preisProLiter]) === JSON.stringify([correction?.liter, correction?.wert, correction?.preisProLiter])) continue;
    changes.push({ kind: "deficit", tripId: id, tank: { datum: trip.datum, id: correction?.tankId || prior?.tankId }, before: prior || null, after: correction || null });
  }
  return changes;
}
