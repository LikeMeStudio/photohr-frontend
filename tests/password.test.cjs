const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const index=fs.readFileSync('index.html','utf8');
const my=fs.readFileSync('my.html','utf8');
const shared=fs.readFileSync('assets/photohr.js','utf8');
function fn(source,name){return source.match(new RegExp('async function '+name+'\\(\\)\\s*\\{[\\s\\S]*?\\n\\}'))[0];}
function setup(url='https://hr.likeme.studio/') {
  const storage=new Map([['fhr_access','old-access'],['fhr_refresh','old-refresh']]);
  const nodes=new Map(),events=[];
  const window={location:new URL(url),fetch:async()=>{throw new Error('Unexpected network request');},
    history:{replaceState(_s,_t,path){events.push(['clean-url',path]);window.location=new URL(path,window.location);}},
    localStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k),setItem:(k,v)=>storage.set(k,v)}};
  const ctx=vm.createContext({window,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Headers,Response,setTimeout,clearTimeout,
    localStorage:window.localStorage,accessToken:'old-access',refreshToken:'old-refresh',currentUser:{id:'synthetic'},API:'https://hr.likeme.studio/api',
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',style:{},disabled:false,textContent:''});return nodes.get(id);}},
    switchAuthTab:tab=>events.push(['tab',tab]),showLoginErr:text=>events.push(['error',text]),showLoginSuccess:text=>events.push(['success',text]),
    showPendingScreen:()=>events.push(['pending']),redirectByRole:()=>events.push(['redirect']),
    checkGoogleOAuthReturn:()=>false,tryAutoLogin:async()=>{events.push(['auto-login']);return true;}});
  vm.runInContext(shared,ctx);ctx.PhotoHR=window.PhotoHR;
  return {ctx,storage,nodes,events};
}
test('new fragment and legacy query links show confirmation without auto-login or network mutation',async()=>{
  for(const tail of ['#reset=synthetic','?reset=synthetic']) {
    const x=setup('https://hr.likeme.studio/'+tail);
    vm.runInContext(fn(index,'checkEmailVerification'),x.ctx);
    const boot=index.match(/\/\/ ── BOOT ──\s*([\s\S]*?)<\/script>/)[1];
    await vm.runInContext(boot,x.ctx);
    assert.equal(x.nodes.get('reset-token').value,'synthetic');assert.equal(x.nodes.get('login-screen').style.display,'flex');
    assert.ok(x.events.some(e=>e[0]==='tab'&&e[1]==='reset'));assert.ok(!x.events.some(e=>e[0]==='auto-login'));
    assert.equal(x.ctx.window.location.search,'');assert.equal(x.ctx.window.location.hash,'');
    assert.equal(x.storage.get('fhr_access'),'old-access');
  }
});
test('profile sends only a self-service request and restores controls after a mail failure',async()=>{
  const x=setup();x.ctx.api=async(...args)=>{assert.deepEqual(args,['POST','/auth/request-password-change']);throw new Error('Письмо не отправлено');};
  vm.runInContext(fn(my,'requestPasswordEmail'),x.ctx);await vm.runInContext('requestPasswordEmail()',x.ctx);
  assert.equal(x.nodes.get('password-email-btn').disabled,false);assert.equal(x.nodes.get('password-email-status').textContent,'Письмо не отправлено');
  assert.equal(x.storage.get('fhr_access'),'old-access');
  x.ctx.api=async()=>({confirmationRequired:true,email:'fixture@example.invalid'});await vm.runInContext('requestPasswordEmail()',x.ctx);
  assert.match(x.nodes.get('password-email-status').textContent,/fixture@example.invalid/);
});
test('confirmation validates matching passwords and clears login only after a successful commit',async()=>{
  const x=setup();let calls=0,ok=false;
  x.ctx.PhotoHR.fetch=async()=>{calls++;return {ok,json:async()=>ok?{ok:true}:{error:'Ссылка устарела'}};};
  vm.runInContext(fn(index,'resetPassword'),x.ctx);
  x.ctx.document.getElementById('rp-pass').value='NewPassword123';x.ctx.document.getElementById('rp-pass2').value='different';
  await vm.runInContext('resetPassword()',x.ctx);assert.equal(calls,0);
  x.nodes.get('rp-pass2').value='NewPassword123';x.ctx.document.getElementById('reset-token').value='synthetic';
  await vm.runInContext('resetPassword()',x.ctx);assert.equal(calls,1);assert.equal(x.storage.get('fhr_access'),'old-access');
  ok=true;await vm.runInContext('resetPassword()',x.ctx);
  assert.equal(x.storage.has('fhr_access'),false);assert.equal(x.storage.has('fhr_refresh'),false);
  assert.equal(x.nodes.get('rp-pass').value,'');assert.equal(x.nodes.get('reset-token').value,'');
  assert.equal(x.events.at(-1)[0],'success');assert.equal(x.nodes.get('reset-btn').disabled,false);
});
test('unicode password length agrees with the server bcrypt bound',()=>{
  const {ctx}=setup();assert.equal(ctx.PhotoHR.passwordError('пароль123','пароль123'),null);
  assert.ok(ctx.PhotoHR.passwordError('я'.repeat(37),'я'.repeat(37)));
  assert.ok(ctx.PhotoHR.passwordError('short','short'));
});
