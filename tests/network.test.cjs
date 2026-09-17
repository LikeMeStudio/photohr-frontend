const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync('assets/photohr.js','utf8');
function setup(host, fetch) {
  let timeout;
  const storage=new Map();
  const window = {crypto:webcrypto,atob,localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},location:{hostname:host,origin:'https://'+host,href:'https://'+host+'/'},fetch};
  vm.runInNewContext(source,{window,URL,AbortController,Headers,Response,TextDecoder,setTimeout(fn){timeout=fn;return 1;},clearTimeout(){}});
  return {api:window.PhotoHR,expire:()=>timeout()};
}
test('regional calls and nested uploaded images use the same origin',async()=>{
  let calls=0;
  const x=setup('hr.likeme.studio',async()=>{calls++;return new Response(JSON.stringify({files:['https://fotohr-server-production.up.railway.app/uploads/photos/test.jpg'],external:'https://example.com/pic'}),{headers:{'content-type':'application/json'}});});
  assert.equal(x.api.API,'https://hr.likeme.studio/api');
  const result=await x.api.fetch(x.api.API+'/items');
  assert.deepEqual(await result.json(),{files:['https://hr.likeme.studio/uploads/photos/test.jpg'],external:'https://example.com/pic'});
  assert.equal(calls,1);
  assert.equal(setup('likemestudio.github.io',async()=>{}).api.API,'https://hr.likeme.studio/api');
});
test('a hung login is aborted once; no automatic repeat',async()=>{
  let calls=0;
  const x=setup('hr.likeme.studio',(_,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('AbortError'))));});
  const pending=x.api.fetch(x.api.API+'/auth/login',{method:'POST',body:'synthetic'});
  x.expire();
  await assert.rejects(pending,/попробуйте войти/); assert.equal(calls,1);
});
test('timeout also covers a stalled response body and warns about uncertain writes',async()=>{
  let signal;
  const x=setup('hr.likeme.studio',async(_,options)=>{signal=options.signal;return {arrayBuffer:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('AbortError'))))};});
  const pending=x.api.fetch(x.api.API+'/stock/set',{method:'POST'});
  await new Promise(resolve=>setImmediate(resolve)); x.expire();
  await assert.rejects(pending,/проверьте результат/);
});
test('all HTML inline scripts parse and application pages load the shared client first',()=>{
  for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){
    const html=fs.readFileSync(file,'utf8');
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1],{filename:file});
    if(html.includes('const API')){
      assert.ok(html.indexOf('assets/photohr.js')<html.indexOf('const API'),file);
      assert.ok(!/\bconst API\s*=\s*window/.test(html),file);
    }
  }
});

test('Google callback must match a fresh locally initiated flow and cannot replay',()=>{
 const {api}=setup('hr.likeme.studio',async()=>{});
 const nonce=api.beginGoogleFlow();
 assert.match(nonce,/^[a-f0-9]{64}$/);
 const token='synthetic.'+Buffer.from(JSON.stringify({nonce})).toString('base64url')+'.signature-checked-on-server';
 const params=new URLSearchParams({id_token:token,state:'wrong'});
 assert.equal(api.acceptGoogleReturn(params),false);
 params.set('state',nonce);assert.equal(api.acceptGoogleReturn(params),true);
 assert.equal(api.acceptGoogleReturn(params),false);
});
