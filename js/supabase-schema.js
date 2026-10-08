// These additions are optional for ordinary entries, but required for full-tank reconciliation.
export const OPTIONAL_COLUMNS = {
  fahrten: ['berechnungs_position', 'ist_korrektur', 'korrektur_tank_kennung', 'korrektur_liter', 'fehlbestand_ausgleichen'],
  tankvorgaenge: ['lokale_kennung', 'berechnungs_position', 'vollgetankt', 'zielbestand_liter', 'notizen'],
};

export const MIGRATION_MESSAGE = 'Volltankabgleich benötigt die Supabase-Migrationen migrations/20261007_volltankabgleich.sql und migrations/20261007_berechnungsposition.sql. Es wurden keine Daten gelöscht.';

export async function inspectSchema(client, userId) {
  const supported = {};
  await Promise.all(Object.entries(OPTIONAL_COLUMNS).map(async ([table, columns]) => {
    supported[table] = new Set();
    await Promise.all(columns.map(async (column) => {
      const { error } = await client.from(table).select(column).eq('user_id', userId).limit(0);
      if (!error) supported[table].add(column);
      else if (!(['42703', 'PGRST204'].includes(error.code) && String(error.message).includes(column))) {
        throw new Error(`${table}: Schema-Prüfung fehlgeschlagen: ${error.message}`);
      }
    }));
  }));
  return { supported, fullTank: Object.entries(OPTIONAL_COLUMNS)
    .every(([table, columns]) => columns.filter(column => column !== 'fehlbestand_ausgleichen').every(column => supported[table].has(column))),
    deficitCorrection: supported.fahrten.has('fehlbestand_ausgleichen') && supported.fahrten.has('berechnungs_position') && supported.tankvorgaenge.has('berechnungs_position') };
}

export function compatibleRows(table, rows, schema) {
  const optional = OPTIONAL_COLUMNS[table] || [];
  return rows.map(row => Object.fromEntries(Object.entries(row)
    .filter(([column]) => !optional.includes(column) || schema.supported[table].has(column))));
}

export async function preflightRows(client, userId, batches) {
  // Validate the complete payload shape, including required columns and favorites,
  // before the first destructive operation, also for empty tables.
  await Promise.all(batches.map(async ({ table, columns }) => {
    const { error } = await client.from(table).select(columns.join(',')).eq('user_id', userId).limit(0);
    if (error) throw new Error(`${table}: Prüfung vor Speicherung fehlgeschlagen: ${error.message}`);
  }));
}
