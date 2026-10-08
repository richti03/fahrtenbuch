import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { correctionChanges } from '../js/correction-review.js';
import { recalculate } from '../js/fifo.js';
import { renderFuel } from '../js/tanken.js';
const run = async (name, fn) => { await fn(); console.log(`ok - ${name}`); };
const initial = () => recalculate({ fahrten:[], tankvorgaenge:[{id:'old',lokaleKennung:'old',datum:'2026-10-07',index:1,liter:45,preisProLiter:2}], favoriten:[], einstellungen:{waehrung:'EUR'} });
const proposed = (before, liters = 30) => {
  const candidate = structuredClone(before);
  candidate.tankvorgaenge.push({id:'full',lokaleKennung:'full',datum:'2026-10-08',index:1,liter:liters,preisProLiter:2,vollgetankt:true,zielbestandLiter:80});
  return recalculate(candidate);
};
const app = readFileSync(new URL('../js/app.js', import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'');
function harness(choice, liters=30) {
  const baseline = initial();
  let writes=0, previews=0;
  const ctx = vm.createContext({structuredClone,loadData:()=>structuredClone(baseline),saveData:recalculate,correctionChanges,
    saveRemoteData:async()=>{writes++;},getRemoteCapabilities:()=>({fullTank:true})});
  vm.runInContext(app,ctx);
  vm.runInContext("currentUser = {id:'user',email:'user'}; remoteReady = true; render = () => {}; syncFuelAvailability = () => {}; setSyncStatus = () => {};",ctx);
  let release;
  ctx.review = async changes => { previews++; assert.equal(writes,0); return choice === 'pending' ? new Promise(resolve=>{release=resolve;}) : choice; };
  vm.runInContext('reviewCorrections = review;',ctx);
  ctx.candidate=proposed(baseline,liters);
  vm.runInContext('data = candidate;',ctx);
  return {ctx, baseline, writes:()=>writes, previews:()=>previews, release:value=>release(value)};
}
await run('Vorschau 45 + 30 zeigt +5 L; Ablehnen speichert nur tatsächliche Tankung',async()=>{
  const h=harness('decline');
  const changes=correctionChanges(h.baseline,h.ctx.candidate);
  assert.equal(changes.length,1); assert.equal(changes[0].after.liter,5); assert.equal(changes[0].after.wert,10);
  await h.ctx.persist({declineTankKennung:'full'});
  const d=vm.runInContext('data',h.ctx);
  assert.equal(d.berechnung.kraftstoffbestand,75); assert.equal(d.tankvorgaenge[1].vollgetankt,false);
  assert.equal(d.tankvorgaenge[1].korrektur,null); assert.equal(h.writes(),1);
});
await run('Ohne Zustimmung keine Korrektur im sichtbaren Bestand und keine Speicherung',async()=>{
  const h=harness('pending'); const promise=h.ctx.persist({declineTankKennung:'full'});
  assert.equal(vm.runInContext('data.tankvorgaenge.length',h.ctx),1); assert.equal(h.writes(),0);
  h.release('approve'); await promise;
  assert.equal(vm.runInContext('data.berechnung.kraftstoffbestand',h.ctx),80); assert.equal(h.writes(),1);
});
await run('Abbrechen verwirft Tankung und Korrektur ohne Supabase-Aufruf',async()=>{
  const h=harness('cancel'); assert.equal(await h.ctx.persist({declineTankKennung:'full'}),false);
  assert.equal(vm.runInContext('data.tankvorgaenge.length',h.ctx),1); assert.equal(h.writes(),0);
});
await run('Negative Korrektur wird erst nach Zustimmung als Fahrt angelegt',async()=>{
  const h=harness('approve',40);
  await h.ctx.persist({declineTankKennung:'full'});
  assert.equal(vm.runInContext('data.fahrten[0].korrekturLiter',h.ctx),5); assert.equal(h.previews(),1);
});
await run('Historische Änderungen an bestätigten Korrekturen benötigen erneute Zustimmung',async()=>{
  const h=harness('cancel');
  vm.runInContext('acceptedData = structuredClone(candidate); data = structuredClone(candidate); data.tankvorgaenge[0].liter = 40;',h.ctx);
  assert.equal(await h.ctx.persist(),false);
  assert.equal(vm.runInContext('data.tankvorgaenge[0].liter',h.ctx),45); assert.equal(h.writes(),0);
});
await run('Positive Korrektur ist eine eigene Tabellenzeile und mobile Karte, echte Tankung bleibt separat',()=>{
  const elements=Object.fromEntries(['fuelStockGrid','fuelRows','fuelCards'].map(id=>['#'+id,{innerHTML:'',querySelectorAll:()=>[]} ]));
  globalThis.document={querySelector:id=>elements[id]};
  renderFuel(proposed(initial()),'EUR',()=>{});
  assert.equal((elements['#fuelRows'].innerHTML.match(/<tr /g)||[]).length,3);
  assert.equal((elements['#fuelCards'].innerHTML.match(/<article /g)||[]).length,3);
  assert.equal((elements['#fuelRows'].innerHTML.match(/correction-row/g)||[]).length,1);
  assert.ok(elements['#fuelRows'].innerHTML.indexOf('data-fuel-correction') < elements['#fuelRows'].innerHTML.indexOf('data-fuel-detail="full"', elements['#fuelRows'].innerHTML.indexOf('data-fuel-correction')));
  assert.ok(elements['#fuelCards'].innerHTML.indexOf('data-fuel-correction') < elements['#fuelCards'].innerHTML.indexOf('data-fuel-card="full"', elements['#fuelCards'].innerHTML.indexOf('data-fuel-correction')));
});
await run('Fehlbestandsvorschau: Zustimmung erzeugt Korrekturtankung, Ablehnen erhält Warnung',async()=>{
  for (const choice of ['approve','decline','cancel']) {
    const h=harness(choice);
    h.ctx.candidate=structuredClone(h.baseline);
    h.ctx.candidate.fahrten=[{id:'trip',datum:'2026-10-08',index:1,kilometer:600,verbrauchPro100km:10,fehlbestandAusgleichen:true}];
    vm.runInContext('data = candidate;',h.ctx);
    await h.ctx.persist({declineTripId:'trip'});
    const d=vm.runInContext('data',h.ctx);
    if (choice==='cancel') { assert.equal(d.fahrten.length,0); assert.equal(h.writes(),0); }
    else if (choice==='approve') { assert.equal(d.berechnung.korrekturtankvorgaenge[0].liter,15); assert.equal(d.fahrten[0].kosten,120); }
    else { assert.equal(d.berechnung.korrekturtankvorgaenge.length,0); assert.equal(d.fahrten[0].nichtZugeordneteLiter,15); }
  }
});
