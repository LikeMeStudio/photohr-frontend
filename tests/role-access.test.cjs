const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client() {
  const window = {localStorage:{getItem(){return null;},setItem(){},removeItem(){}},location:{hostname:'hr.likeme.studio',origin:'https://hr.likeme.studio',href:'https://hr.likeme.studio/'},fetch:async()=>{}};
  vm.runInNewContext(fs.readFileSync('assets/photohr.js','utf8'),{window,URL,AbortController,Headers,Response,TextDecoder,TextEncoder,URLSearchParams,setTimeout,clearTimeout});
  return window.PhotoHR;
}

test('team list opens only for roles the server allows (photographers.list)', () => {
  const api = client();
  for (const role of ['super_admin','admin','exec_director','hr_director','hr_manager','site_specialist','cashier','photographer_user']) assert.equal(api.canOpen('team', role), true, role);
  for (const role of ['recruiter','tech_director','aq_manager','aq_user','archived',undefined]) assert.equal(api.canOpen('team', role), false, String(role));
  assert.equal(api.homeFor('recruiter'), 'recruiting.html');
  assert.equal(api.homeFor('tech_director'), 'stock.html');
  assert.equal(api.homeFor('aq_user'), 'aquagrim.html');
  assert.equal(api.homeFor('photographer_user'), 'my.html');
});

test('the team list is hidden from the menu of roles without access, and the page sends them home', () => {
  // recruiting.html is rewritten in the Recruiting 2 branch; a recruiter who follows its menu link is sent back by the guard below.
  for (const file of fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'recruiting.html')) {
    const html = fs.readFileSync(file, 'utf8');
    for (const line of html.split('\n').filter(l => /\(\s*'index'\s*,\s*'photographers\.html'|href="photographers\.html" style="' \+ ns|\['photographers\.html', 'Фотографы'\]|👥 Команда<\/a>/.test(l))) {
      assert.match(line, /canOpen\('team'/, `${file}: ${line.trim().slice(0, 120)}`);
    }
  }
  const page = fs.readFileSync('photographers.html', 'utf8');
  assert.match(page, /if \(!PhotoHR\.canOpen\('team', currentUser\.role\)\) \{/);
  assert.match(page, /'my\.html#account-security' : PhotoHR\.homeFor\(currentUser\.role\)/);
});

test('pages decide UI by explicit role lists, not by numeric role level', () => {
  // stock.html keeps its own warehouse checks (server warehouse routes have explicit lists since 2026-09).
  for (const file of fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'stock.html')) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\(ROLES\[[^\]]+\]\s*\?\?\s*-1\)\s*>=/, file);
  }
});
