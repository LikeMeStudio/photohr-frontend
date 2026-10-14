const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('stock.html','utf8');
function setup(rows){
  const calls=[],messages=[];
  const nodes={'tr-save':{disabled:false},'tr-from':{value:'source'},'tr-to':{value:'destination'},'tr-notes':{value:''},'tr-modal':{classList:{remove(){}}}};
  rows.forEach((r,n)=>{nodes[`tr-item-host-${n}`]={querySelector:()=>({value:r.item})};nodes[`tr-equipment-${n}`]={querySelector:()=>({value:r.unit||''})};nodes[`tr-qty-${n}`]={value:r.qty};});
  const ctx=vm.createContext({document:{getElementById:id=>nodes[id],querySelectorAll:()=>rows.map((_,n)=>({dataset:{line:String(n)}}))},items:[{id:'printer',item_type:'equipment'},{id:'paper',item_type:'consumable'}],api:async(...a)=>calls.push(a),showToast:m=>messages.push(m),loadSummary(){},currentTabIdx:-1});
  vm.runInContext(source.match(/async function saveTransfer\(\) \{[\s\S]*?\n\}/)[0],ctx);
  return {ctx,calls,messages,nodes};
}
test('transfer submission identifies the selected unit and preserves consumable quantity',async()=>{
  const s=setup([{item:'printer',unit:'printer-second',qty:99},{item:'paper',qty:'2.5'}]);await vm.runInContext('saveTransfer()',s.ctx);
  assert.equal(s.calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0][2].lines)),[{item_id:'printer',equipment_unit_id:'printer-second',quantity:1},{item_id:'paper',quantity:2.5}]);assert.equal(s.nodes['tr-save'].disabled,false);
});
test('anonymous or repeated equipment and incomplete rows never submit partial transfers',async()=>{
  for(const rows of [[{item:'printer',unit:'',qty:2}],[{item:'printer',unit:'same'},{item:'printer',unit:'same'}],[{item:'paper',qty:3},{item:''}],[{item:'paper',qty:'NaN'}]]){
    const s=setup(rows);await vm.runInContext('saveTransfer()',s.ctx);assert.equal(s.calls.length,0);assert.ok(s.messages.length);
  }
});
test('transfer detail shows numbered identity and honestly labels anonymous old equipment',()=>{
  const ctx=vm.createContext({esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtNum:n=>String(n)});
  vm.runInContext(source.match(/function transferLineDescription\(line\) \{[\s\S]*?\n\}/)[0],ctx);
  const numbered=ctx.transferLineDescription({item_name:'Printer',quantity:1,equipment_unit_id:'unit',inventory_number:'INV-2',serial_number:'SN-2'});assert.match(numbered,/INV-2/);assert.match(numbered,/SN-2/);
  assert.match(ctx.transferLineDescription({item_name:'Printer',quantity:2,item_type:'equipment'}),/не указаны/);
  assert.doesNotMatch(ctx.transferLineDescription({item_name:'Paper',quantity:2,item_type:'consumable'}),/не указаны/);
});
test('location check saves only a draft and retains unsaved observations on failure',async()=>{
  const calls=[],controls=[{disabled:false}],status={};let fail=false;
  const original={version:0,observations:{},unknown_entries:[]};
  const ctx=vm.createContext({equipmentCheck:{draft:original,changes:{unit:{equipment_unit_id:'unit',state:'found',observed_warehouse_id:'different'}},unknown:[],dirty:true},document:{getElementById:id=>id==='eq-check-modal'?{querySelectorAll:()=>controls}:status},api:async(...a)=>{calls.push(a);if(fail)throw new Error('Conflict');return {version:1,observations:{unit:a[2].observations[0]},unknown_entries:[]};},showToast(){},updateEquipmentCheckStatus(){}});
  vm.runInContext(source.match(/async function saveEquipmentCheck\(\)\{[\s\S]*?\n\}/)[0],ctx);
  fail=true;await vm.runInContext('saveEquipmentCheck()',ctx);assert.equal(ctx.equipmentCheck.dirty,true);assert.ok(ctx.equipmentCheck.changes.unit);assert.equal(controls[0].disabled,false);
  fail=false;await vm.runInContext('saveEquipmentCheck()',ctx);assert.equal(ctx.equipmentCheck.dirty,false);assert.equal(ctx.equipmentCheck.draft.version,1);
  assert.ok(calls.every(c=>c[0]==='POST'&&c[1]==='/equipment-location-checks/current'));
});
