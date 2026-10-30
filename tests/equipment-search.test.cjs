const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('stock.html','utf8');
function setup(extra={}){
  const ctx=vm.createContext({esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),...extra});
  for(const name of ['equipmentCustomFields','equipmentLegalName','equipmentFieldValue','equipmentTechnicalValues','equipmentIdentityLines','equipmentMatchesQuery','equipmentViewUnits','collectEquipmentCustomFields'])vm.runInContext(source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0],ctx);
  return ctx;
}
test('search covers every technical field and legacy JSON, with leading zeroes and multiple terms',()=>{
  const c=setup(),unit={id:'uuid-123',inventory_number:'ИНВ-42',serial_number:'SN-007',item_name:'Терминал',warehouse_name:'Зал',legal_entity_name:'ООО Пример',custom_fields:{factory_number:'000551',id_number:'ID-88',tech_number:'ТЕХ-9',sim_card:'SIM-123',unknown:{nested:'Доп-значение'},zero:0}};
  for(const query of ['00551','id-88','тех-9','пример','sim-123','доп-значение','000551 терминал пример','инв-42','uuid-123','0'])assert.equal(c.equipmentMatchesQuery(unit,query),true,query);
  assert.equal(c.equipmentMatchesQuery(unit,'000551 missing'),false);
  assert.equal(c.equipmentMatchesQuery({...unit,custom_fields:JSON.stringify(unit.custom_fields)},'00551'),true);
  assert.equal(c.equipmentMatchesQuery({custom_fields:'broken'},'SN'),false);
});
test('entity, category and warehouse filters intersect; unknown is explicit and sorting is natural',()=>{
  const c=setup(),units=[{id:'1',legal_entity_id:'a',legal_entity_name:'Альфа',item_category:'cashregisters',warehouse_id:'w',custom_fields:{factory_number:'010'}},{id:'2',legal_entity_id:'b',legal_entity_name:'Бета',item_category:'cashregisters',warehouse_id:'w',custom_fields:{factory_number:'002'}},{id:'3',legal_entity_id:'a',legal_entity_name:'Альфа',item_category:'printers',warehouse_id:'other'},{id:'4'}];
  assert.deepEqual(Array.from(c.equipmentViewUnits(units,{legalEntity:'a',category:'cashregisters',warehouse:'w'}),u=>u.id),['1']);
  assert.deepEqual(Array.from(c.equipmentViewUnits(units,{legalEntity:'__none__'}),u=>u.id),['4']);
  assert.deepEqual(Array.from(c.equipmentViewUnits(units,{sort:'factory_number:asc'}),u=>u.id),['2','1','3','4']);
  assert.deepEqual(Array.from(c.equipmentViewUnits(units,{sort:'legal_entity_name:desc'}),u=>u.id),['2','1','3','4']);
  assert.deepEqual(units.map(u=>u.id),['1','2','3','4']);
});
test('compact identity includes actual factory number and entity, with HTML escaped',()=>{
  const c=setup();
  assert.equal(c.equipmentIdentityLines({serial_number:'SN-only'}),'');
  const html=c.equipmentIdentityLines({custom_fields:{factory_number:'001<x>',legal_entity:'ООО "Тест"'}});
  assert.match(html,/Зав\. №: 001&lt;x>/);assert.match(html,/Юрлицо: ООО &quot;Тест&quot;/);assert.doesNotMatch(html,/<x>/);
});
test('saving visible fields preserves hidden data and removes only fields explicitly cleared',()=>{
  const c=setup(),original={factory_number:'000123',unknown:{nested:'keep'},cpu:'old',ram:'16'};
  const controls=[['cpu','New'],['ram','']].map(([key,value])=>({value,getAttribute:()=>key}));
  const saved=c.collectEquipmentCustomFields(original,controls);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)),{factory_number:'000123',unknown:{nested:'keep'},cpu:'New'});
  assert.equal(original.ram,'16');
});
test('stale legal picker keeps the stale id, so saving cannot silently clear the entity',()=>{
  const select={innerHTML:'',value:''},ctx=setup({equipmentLegalEntities:[{id:'new',name:'New'}],document:{getElementById:()=>select}});
  vm.runInContext(source.match(/function renderEquipmentLegalPicker\([^]*?\n\}/)[0],ctx);
  ctx.renderEquipmentLegalPicker('merged');assert.equal(select.value,'merged');assert.match(select.innerHTML,/изменилось/);
});
