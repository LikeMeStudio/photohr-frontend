const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('stock.html','utf8');
const apiSource=html.slice(html.indexOf('async function api('),html.indexOf('/** POST /inventory-sessions'));
function setup(fetch){
  let logout=false;const storage=new Map();
  const context=vm.createContext({API:'https://example.test/api',PhotoHR:{fetch},localStorage:{setItem:(k,v)=>storage.set(k,v)},doLogout:()=>{logout=true;}});
  vm.runInContext("let accessToken='old-access',refreshToken='old-refresh',refreshLock=null;"+apiSource,context);
  return{api:context.api,storage,loggedOut:()=>logout};
}
test('Excel requests refresh an expired session once and preserve the binary response',async()=>{
 const calls=[];const body=new Uint8Array([80,75,3,4,255]);
 const x=setup(async(url,o)=>{calls.push([url,{...o.headers}]);
  if(url.endsWith('/auth/refresh'))return new Response('{"accessToken":"new-access","refreshToken":"new-refresh"}');
  return calls.length===1?new Response('{"error":"expired"}',{status:401}):new Response(body,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
 });
 const r=await x.api('GET','/stock/warehouse-export?include=equipment',null,true);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),body);
 assert.equal(calls.length,3);assert.equal(calls[2][1].Authorization,'Bearer new-access');
 assert.equal(x.storage.get('fhr_refresh'),'new-refresh');assert.equal(x.loggedOut(),false);
});
test('failed refresh stops an Excel request and keeps the existing logout behavior',async()=>{
 let calls=0;const x=setup(async()=>{calls++;return new Response('{"error":"expired"}',{status:401});});
 assert.equal(await x.api('GET','/stock/warehouse-export',null,true),null);
 assert.equal(calls,2);assert.equal(x.loggedOut(),true);
});
test('ordinary JSON API responses retain their existing contract',async()=>{
 const x=setup(async()=>new Response('{"quantity":3}'));
 assert.deepEqual(await x.api('GET','/stock'),{quantity:3});
});
