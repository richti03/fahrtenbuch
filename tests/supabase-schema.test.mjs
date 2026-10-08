import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { OPTIONAL_COLUMNS, inspectSchema, compatibleRows, preflightRows, MIGRATION_MESSAGE } from '../js/supabase-schema.js';
import { validateData } from '../js/storage.js';
globalThis.crypto ??= webcrypto;
const source = readFileSync(new URL('../js/supabase-sync.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
const baseColumns = {
  fahrten: ['user_id','datum','ordnungsfaktor','start','ziel','zwischenziele','kilometer','verbrauch_pro_100km','notizen','created_at'],
  tankvorgaenge: ['user_id','datum','liter','preis_pro_liter','created_at','tankstelle'],
  favoritenAdressen: ['user_id','name','adresse','created_at'],
  favoritenTankstelle: ['user_id','name','marke','adresse','created_at'],
};
function clientFor(extra = {}, failure = null, missingCode = '42703') {
  const columns = Object.fromEntries(Object.entries(baseColumns).map(([t, cols]) => [t, new Set([...cols, ...(extra[t] || [])])]));
  const calls = [];
  return {
    calls, columns, auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from(table) {
      return {
        select(selection) {
          return { eq(key, user) { assert.equal(key, 'user_id'); assert.equal(user, 'user'); return {
            async limit(count) {
              assert.equal(count, 0); calls.push({ op:'read', table, selection });
              if (failure && failure(table, selection)) return { error: { code:'42501', message:'permission denied' } };
              const missing = selection.split(',').find(col => !columns[table].has(col));
              return { error: missing ? { code:missingCode, message:`column ${table}.${missing} does not exist` } : null };
            },
          }; } };
        },
        delete() { return { async eq(key, user) { calls.push({op:'delete', table}); return { error:null }; } }; },
        async insert(rows) {
          calls.push({op:'insert', table, rows});
          for (const row of rows) for (const key of Object.keys(row)) assert.ok(columns[table].has(key), `${table}.${key}`);
          return { error:null };
        },
      };
    },
  };
}
function contextFor(client) {
  const context = vm.createContext({ createClient: () => client, SUPABASE_PUBLISHABLE_KEY:'key', SUPABASE_URL:'url',
    validateData, crypto:webcrypto, compatibleRows, inspectSchema, preflightRows, MIGRATION_MESSAGE });
  vm.runInContext(source, context); return context;
}
const data = () => ({ fahrten:[{datum:'2026-10-07',index:1,kilometer:100,verbrauchPro100km:10,berechnungsPosition:1}],
  tankvorgaenge:[{datum:'2026-10-07',liter:30,preisProLiter:2,berechnungsPosition:2}], favoriten:[] });
const run = async (name, fn) => { await fn(); console.log(`ok - ${name}`); };
await run('Altes Schema speichert normale Einträge ohne unbekannte Spalten; alle Prüfungen vor Löschung', async () => {
  const c = clientFor(); await contextFor(c).saveRemoteData(data());
  const firstDelete = c.calls.findIndex(call => call.op === 'delete');
  assert.equal(c.calls.slice(firstDelete).some(call => call.op === 'read'), false);
  assert.ok(c.calls.filter(call => call.op === 'read').some(call => call.table === 'favoritenTankstelle'));
  assert.equal(c.calls.filter(call => call.op === 'delete').length, 4);
  assert.equal('berechnungs_position' in c.calls.find(call => call.op === 'insert' && call.table === 'fahrten').rows[0], false);
});
await run('Teilweise Migration erhält unterstützte Felder und blockiert Volltankabgleiche ohne Löschung', async () => {
  const c = clientFor({ fahrten:['berechnungs_position'], tankvorgaenge:['notizen'] });
  const ctx = contextFor(c); await ctx.saveRemoteData(data());
  assert.equal(c.calls.find(call => call.op === 'insert' && call.table === 'fahrten').rows[0].berechnungs_position, 1);
  c.calls.length = 0; const d = data(); d.tankvorgaenge[0].vollgetankt = true;
  await assert.rejects(ctx.saveRemoteData(d), /Volltankabgleich benötigt/);
  assert.equal(c.calls.some(call => call.op === 'delete'), false);
  d.tankvorgaenge[0].vollgetankt = false; d.fahrten[0].istKorrektur = true;
  await assert.rejects(ctx.saveRemoteData(d), /Volltankabgleich benötigt/);
  assert.equal(c.calls.some(call => call.op === 'delete'), false);
});
await run('Vollständiges Schema speichert Positionen und Korrekturmerkmale', async () => {
  const c = clientFor(OPTIONAL_COLUMNS); const d = data();
  d.fahrten[0].istKorrektur = true; d.fahrten[0].korrekturLiter = 3;
  d.tankvorgaenge[0].vollgetankt = true; d.tankvorgaenge[0].zielbestandLiter = 80;
  await contextFor(c).saveRemoteData(d);
  assert.equal(c.calls.find(call => call.op === 'insert' && call.table === 'fahrten').rows[0].korrektur_liter, 3);
  assert.equal(c.calls.find(call => call.op === 'insert' && call.table === 'tankvorgaenge').rows[0].berechnungs_position, 2);
});
await run('Berechtigungs- und Pflichtspaltenfehler verhindern sämtliche Löschungen, auch bei leeren Daten', async () => {
  for (const failure of [(table, selection) => selection === 'berechnungs_position',
    (table, selection) => table === 'favoritenTankstelle' && selection.includes(',')]) {
    const c = clientFor({}, failure);
    await assert.rejects(contextFor(c).saveRemoteData({fahrten:[],tankvorgaenge:[],favoriten:[]}), /fehlgeschlagen/);
    assert.equal(c.calls.some(call => call.op === 'delete'), false);
  }
});
await run('Netzwerkfehler wird nicht als fehlende optionale Spalte behandelt', async () => {
  const c = clientFor(); c.from = () => ({ select: () => ({ eq: () => ({ limit: async () => { throw new Error('network'); } }) }) });
  await assert.rejects(contextFor(c).saveRemoteData(data()), /network/);
  assert.equal(c.calls.some(call => call.op === 'delete'), false);
});
await run('Anmeldung lädt ohne automatische Speicherung', async () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/\ninit\(\);\s*$/, '');
  let writes = 0, reads = 0;
  const ctx = vm.createContext({ structuredClone, loadData: () => ({}), signIn: async () => ({id:'user'}), document: {}, alert: message => {throw new Error(message);} });
  vm.runInContext(app, ctx);
  ctx.onLoad = async () => { reads++; vm.runInContext('data = {einstellungen:{}}', ctx); };
  ctx.onWrite = async () => { writes++; };
  vm.runInContext('syncFuelAvailability = () => {}; setSyncStatus = () => {}; loadFromSupabase = onLoad; persist = onWrite;', ctx);
  await ctx.authenticate('user@example.com', 'pass');
  assert.equal(reads, 1); assert.equal(writes, 0);
});

await run('Schema-Cache-Meldungen erlauben normale Einträge; fehlende Pflichtspalte blockiert vor Löschung', async () => {
  const c = clientFor({}, null, 'PGRST204'); await contextFor(c).saveRemoteData(data());
  c.calls.length = 0; c.columns.fahrten.delete('kilometer');
  await assert.rejects(contextFor(c).saveRemoteData(data()), /Prüfung vor Speicherung fehlgeschlagen/);
  assert.equal(c.calls.some(call => call.op === 'delete'), false);
});
await run('Frontend sperrt Volltankabgleich bei altem Schema und gibt ihn nach Migration frei', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/\ninit\(\);\s*$/, '');
  const form = { vollgetankt: {checked: true}, zielbestandLiter: {} };
  const hint = { classList: { toggle() {} } };
  let schema = {fullTank: false};
  const ctx = vm.createContext({ structuredClone, loadData: () => ({}), getRemoteCapabilities: () => schema,
    document: { querySelector: s => s === '#fuelForm' ? form : hint } });
  vm.runInContext(app, ctx);
  vm.runInContext("currentUser = {id:'user'}; remoteReady = true; syncFuelAvailability();", ctx);
  assert.equal(form.vollgetankt.disabled, true); assert.equal(form.zielbestandLiter.disabled, true);
  assert.match(hint.textContent, /Migration|migrations/);
  schema = {fullTank: true}; ctx.syncFuelAvailability();
  assert.equal(form.vollgetankt.disabled, false); assert.equal(form.zielbestandLiter.disabled, false);
});
await run('Ohne Fehlbestands-Spalte wird eine bestätigte Ausgleichsfahrt vor jeder Löschung blockiert',async()=>{
  const extensions=Object.fromEntries(Object.entries(OPTIONAL_COLUMNS).map(([t,cols])=>[t,cols.filter(c=>c!=='fehlbestand_ausgleichen')]));
  const c=clientFor(extensions); const d=data(); d.fahrten[0].fehlbestandAusgleichen=true;
  await assert.rejects(contextFor(c).saveRemoteData(d),/20261008_fehlbestand/);
  assert.equal(c.calls.some(call=>call.op==='delete'),false);
});
