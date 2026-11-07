// Screens that follow the server change «closed endpoints» (fotohr-server claude/open-endpoints-fix):
// no buttons that the server now refuses, and a hint where the server returns only part of the data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('owner account: a non-owner cannot change role, password, activity or archive it from the edit form', () => {
  const page = fs.readFileSync('admin.html', 'utf8');
  assert.match(page, /const ownerLocked = u\.role === 'super_admin' && currentUser\?\.role !== 'super_admin';/);
  assert.match(page, /for \(const fid of \['eu-role', 'eu-pass', 'eu-active'\]\) document\.getElementById\(fid\)\.disabled = ownerLocked;/);
  assert.match(page, /\(u\.id === currentUser\.id \|\| ownerLocked\) \? 'none' : 'block'/);
  assert.match(page, /id="eu-owner-note" hidden/);
});

test('QR join requests: accept/reject only for venue editors and colleagues on this shift, never for own request', () => {
  const page = fs.readFileSync('venue.html', 'utf8');
  assert.match(page, /const canDecideJoin = a => isEditor\(\) \|\| \(onThisShift && a\.photographer_id !== U\.photographer_id\);/);
  const buttons = page.indexOf("onclick=\"approveQrJoin('${a.id}')\"");
  assert.ok(buttons > 0);
  assert.match(page.slice(buttons - 200, buttons), /\$\{canDecideJoin\(a\) \? `<div/);
});

test('management team comments: non-HR roles are told they see only their own and important public comments', () => {
  const page = fs.readFileSync('team.html', 'utf8');
  assert.match(page, /const partialNote = canManageComments\(\) \? '' : '<div[^>]*>Здесь видны ваши комментарии и важные общие\./);
  assert.match(page, /body\.innerHTML = `\$\{partialNote\}/);
});
