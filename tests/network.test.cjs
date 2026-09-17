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
  vm.runInNewContext(source,{window,URL,AbortController,Headers,Response,TextDecoder,TextEncoder,URLSearchParams,setTimeout(fn){timeout=fn;return 1;},clearTimeout(){}});
  return {api:window.PhotoHR,window,storage,expire:()=>timeout()};
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

test('concurrent refreshes reuse the fresh session instead of rotating a spent token',async()=>{
 let posts=0,reads=0;
 const x=setup('hr.likeme.studio',async(url,options)=>{
  if(url.endsWith('/auth/me')){reads++;assert.equal(options.headers.Authorization,'Bearer new-access');return new Response(JSON.stringify({id:'synthetic'}),{headers:{'content-type':'application/json'}});}
  posts++;assert.equal(JSON.parse(options.body).refreshToken,'old-refresh');
  return new Response(JSON.stringify({accessToken:'new-access',refreshToken:'new-refresh',user:{id:'synthetic'}}),{headers:{'content-type':'application/json'}});
 });
 x.storage.set('fhr_refresh','old-refresh');x.storage.set('fhr_access','old-access');
 const options={method:'POST',body:JSON.stringify({refreshToken:'old-refresh'})};
 const responses=await Promise.all([x.api.fetch(x.api.API+'/auth/refresh',options),x.api.fetch(x.api.API+'/auth/refresh',options)]);
 for(const response of responses)assert.equal((await response.json()).refreshToken,'new-refresh');
 assert.equal(posts,1);assert.equal(reads,1);
});

test('two tabs share the browser refresh lock and preserve logout errors',async()=>{
 const storage=new Map([['fhr_refresh','old-refresh'],['fhr_access','old-access']]);
 let queue=Promise.resolve(),posts=0;
 const locks={request(name,run){assert.equal(name,'photohr-session-refresh');const p=queue.then(run);queue=p.catch(()=>{});return p;}};
 const fetch=async(url)=>{if(url.endsWith('/auth/me'))return new Response('{"id":"synthetic"}',{headers:{'content-type':'application/json'}});posts++;return new Response('{"accessToken":"new-access","refreshToken":"new-refresh","user":{"id":"synthetic"}}',{headers:{'content-type':'application/json'}});};
 const a=setup('hr.likeme.studio',fetch),b=setup('hr.likeme.studio',fetch);
 for(const x of [a,b]) {x.window.navigator={locks};x.window.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};}
 const options={method:'POST',body:'{"refreshToken":"old-refresh"}'};
 await Promise.all([a.api.fetch(a.api.API+'/auth/refresh',options),b.api.fetch(b.api.API+'/auth/refresh',options)]);
 assert.equal(posts,1);
 const rejected=setup('hr.likeme.studio',async()=>new Response('{"error":"expired"}',{status:401,headers:{'content-type':'application/json'}}));
 assert.equal((await rejected.api.fetch(rejected.api.API+'/auth/refresh',options)).status,401);
 assert.equal(rejected.storage.size,0);
});
