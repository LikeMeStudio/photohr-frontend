const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('stock.html','utf8');
function setup(api){const status={textContent:''},buttons=[{disabled:false}],downloads=[],toasts=[],modal={querySelectorAll:()=>buttons};const ctx=vm.createContext({URLSearchParams,Date,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:f=>f(),api,showToast:(...a)=>toasts.push(a),document:{getElementById:id=>id==='equipment-label-status'?status:modal,body:{appendChild(){}},createElement:()=>({click(){downloads.push(this.download);},remove(){}})}});vm.runInContext('let equipmentLabelBusy=false;let equipmentLabelIds=["00000000-0000-4000-8000-000000000001"];'+source.match(/async function saveEquipmentLabels\([^]*?\n\}/)[0],ctx);return{ctx,status,buttons,downloads,toasts};}
test('single and bulk label downloads go through the refreshing raw API and preserve selected IDs',async()=>{
 const calls=[],s=setup(async(...args)=>{calls.push(args);return{blob:async()=>Buffer.from('binary')};});
 await s.ctx.saveEquipmentLabels('zip');assert.equal(calls[0][0],'GET');assert.match(calls[0][1],/\/label\?format=zip$/);assert.equal(calls[0][3],true);assert.match(s.downloads[0],/\.zip$/);
 vm.runInContext('equipmentLabelIds.push("00000000-0000-4000-8000-000000000002")',s.ctx);await s.ctx.saveEquipmentLabels('docx');assert.equal(calls[1][0],'POST');assert.equal(calls[1][2].ids.length,2);assert.equal(calls[1][3],true);assert.match(s.downloads[1],/\.docx$/);assert.equal(s.buttons[0].disabled,false);
});
test('failed or expired requests cannot download a bogus file; retry controls recover',async()=>{
 for(const api of [async()=>undefined,async()=>{throw new Error('Данные не помещаются');}]){const s=setup(api);await s.ctx.saveEquipmentLabels('pdf');assert.equal(s.downloads.length,0);assert.ok(s.status.textContent);assert.equal(s.buttons[0].disabled,false);assert.equal(s.toasts.length,1);}
});
test('duplicate clicks are suppressed while a label request is pending',async()=>{
 let done,count=0;const s=setup(()=>{count++;return new Promise(r=>{done=r;});});const pending=s.ctx.saveEquipmentLabels('pdf');await s.ctx.saveEquipmentLabels('zip');assert.equal(count,1);done({blob:async()=>Buffer.from('binary')});await pending;assert.equal(s.downloads.length,1);
});
