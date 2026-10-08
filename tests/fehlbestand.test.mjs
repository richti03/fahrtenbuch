import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { recalculate, makeId, nextIndex } from '../js/fifo.js';
import { correctionChanges } from '../js/correction-review.js';
import { correctionFuelDetailHtml, formatFuelDateTimeInput } from '../js/tanken.js';
import { validateData } from '../js/storage.js';
globalThis.crypto ??= webcrypto;
const base = () => ({ fahrten: [], tankvorgaenge:[{id:'tank',datum:'2026-01-01',index:1,liter:5,preisProLiter:2}], favoriten:[], einstellungen:{waehrung:'EUR'} });
const trip = (id='fahrt') => ({id,datum:'2026-01-02',index:1,kilometer:100,verbrauchPro100km:10,fehlbestandAusgleichen:true});
const run = (name, fn) => { fn(); console.log(`ok - ${name}`); };
run('Fehlmenge wird unmittelbar vor der Fahrt zum letzten Tankpreis ergänzt und verbraucht',()=>{
  const d=base(); const before=recalculate(structuredClone(d)); d.fahrten=[trip()]; recalculate(d);
  assert.equal(d.fahrten[0].kosten,20); assert.equal(d.fahrten[0].nichtZugeordneteLiter,0);
  assert.equal(d.berechnung.kraftstoffbestand,0); assert.equal(d.tankvorgaenge.length,1);
  const correction=d.berechnung.korrekturtankvorgaenge[0];
  assert.equal(correction.liter,5); assert.equal(correction.preisProLiter,2); assert.equal(correction.verbrauchteLiter,5);
  assert.equal(correctionChanges(before,d)[0].kind,'deficit');
  const html=correctionFuelDetailHtml(correction,'EUR');
  assert.match(html,/data-fuel-trip="fahrt"/); assert.ok(!html.includes('data-fuel-edit'));
  const snapshot=JSON.stringify(d); recalculate(d); assert.equal(JSON.stringify(d),snapshot);
});
run('Spätere Tankpreise werden nicht rückwirkend verwendet; mehrere Fehlmengen bleiben getrennt',()=>{
  const d=base(); d.tankvorgaenge.push({id:'future',datum:'2026-01-04',index:1,liter:10,preisProLiter:3});
  d.fahrten=[trip(),{...trip('second'),datum:'2026-01-03'}]; recalculate(d);
  assert.deepEqual(d.berechnung.korrekturtankvorgaenge.map(t=>[t.liter,t.preisProLiter]),[[5,2],[10,2]]);
  assert.equal(d.berechnung.kraftstoffbestand,10);
});
run('Ohne früheren Tankpreis oder ohne Zustimmung bleibt die Fehlbestandswarnung',()=>{
  const d=base(); d.tankvorgaenge=[]; d.fahrten=[trip()]; recalculate(d);
  assert.equal(d.berechnung.korrekturtankvorgaenge.length,0); assert.equal(d.fahrten[0].nichtZugeordneteLiter,10);
  d.tankvorgaenge=base().tankvorgaenge; d.fahrten[0].fehlbestandAusgleichen=false; recalculate(d);
  assert.equal(d.fahrten[0].nichtZugeordneteLiter,5); assert.equal(d.berechnung.korrekturtankvorgaenge.length,0);
});
run('Änderung und Löschung der Fahrt aktualisieren oder entfernen die abgeleitete Korrekturtankung',()=>{
  const d=base(); d.fahrten=[trip()]; recalculate(d);
  d.fahrten[0].kilometer=60; recalculate(d); assert.equal(d.berechnung.korrekturtankvorgaenge[0].liter,1);
  d.fahrten[0].kilometer=40; recalculate(d); assert.equal(d.berechnung.korrekturtankvorgaenge.length,0);
  d.fahrten=[]; recalculate(d); assert.equal(d.berechnung.korrekturtankvorgaenge.length,0);
});
run('Supabase-Rundlauf erhält die Zustimmung, ohne synthetische Tankungen als echte Käufe zu speichern',()=>{
  const source=readFileSync(new URL('../js/supabase-sync.js',import.meta.url),'utf8');
  const ctx=vm.createContext({crypto:webcrypto,makeId,nextIndex,formatFuelDateTimeInput});
  vm.runInContext(source.slice(source.indexOf('function mapTripsFromRemote')),ctx);
  const d=base(); d.fahrten=[trip()]; recalculate(d);
  const rows=d.fahrten.map(f=>ctx.mapTripToRemote(f,'user'));
  assert.equal(rows[0].fehlbestand_ausgleichen,true);
  const loaded=validateData(JSON.parse(JSON.stringify({...d,fahrten:ctx.mapTripsFromRemote(rows)})));
  recalculate(loaded); assert.equal(loaded.berechnung.korrekturtankvorgaenge.length,1); assert.equal(loaded.fahrten[0].kosten,20);
});
