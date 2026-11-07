// Recruiting 2 page: pure helpers (links, filters, reminder presets, timeline) and static safety rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('recruiting.html', 'utf8');
function core() {
  const m = html.match(/<script id="recruiting-core">([\s\S]*?)<\/script>/);
  assert.ok(m, 'core script block exists');
  const window = {};
  vm.runInNewContext(m[1], { window, URLSearchParams, Date, Math, String, Number, Array, Object });
  return window.R2;
}

test('call / WhatsApp / Telegram links from messy phone and username input', () => {
  const R = core();
  assert.equal(R.telHref('8 (900) 123-45-67'), 'tel:+79001234567');
  assert.equal(R.telHref('9001234567'), 'tel:+79001234567');
  assert.equal(R.telHref('+351 912 345 678'), 'tel:+351912345678');
  assert.equal(R.telHref(''), null);
  assert.equal(R.waHref('+7 900 123 45 67'), 'https://wa.me/79001234567');
  assert.equal(R.tgHref('@photo_ivan'), 'https://t.me/photo_ivan');
  assert.equal(R.tgHref('https://t.me/photo_ivan'), 'https://t.me/photo_ivan');
  assert.equal(R.tgHref('javascript:alert(1)'), null);
  assert.equal(R.safeUrl('javascript:alert(1)'), null);
  assert.equal(R.safeUrl('https://hh.ru/resume/1'), 'https://hh.ru/resume/1');
  assert.equal(R.color('red;background:url(x)'), '#7c6cff', 'only #RRGGBB colors reach style attributes');
});

test('escaping covers HTML and attribute contexts', () => {
  const R = core();
  assert.equal(R.esc(`<img src=x onerror="a('1')">`), '&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;');
  assert.equal(R.esc(null), '');
});

test('filters become a query string with known keys only', () => {
  const R = core();
  const q = R.filtersToQuery({ q: 'Иван', source: 'hh', city: '', overdue: '1', evil: 'x', recruiter: 'me' });
  const p = new URLSearchParams(q);
  assert.equal(p.get('q'), 'Иван'); assert.equal(p.get('source'), 'hh'); assert.equal(p.get('overdue'), '1');
  assert.equal(p.get('evil'), null); assert.equal(p.has('city'), false);
  assert.equal(R.countFilters({ q: 'x', source: 'hh', overdue: '1' }), 2, 'search text is not counted as a filter');
});

test('«перезвонить» presets', () => {
  const R = core();
  const now = new Date(2026, 10, 7, 19, 30); // 7 Nov 19:30 local
  assert.equal(R.presetDate('h1', now).getHours(), 20);
  const eve = R.presetDate('eve', now); assert.equal(eve.getDate(), 8); assert.equal(eve.getHours(), 18, 'evening already passed → tomorrow');
  const tom = R.presetDate('tom10', now); assert.equal(tom.getDate(), 8); assert.equal(tom.getHours(), 10);
  const ny = R.presetDate('newyear', now); assert.equal(ny.getFullYear(), 2027); assert.equal(ny.getMonth(), 10);
  const summer = R.presetDate('summer', now); assert.equal(summer.getFullYear(), 2027); assert.equal(summer.getMonth(), 4);
  assert.equal(R.presetDate('nope', now), null);
  assert.equal(R.toLocalInput(new Date(2026, 0, 2, 3, 4)), '2026-01-02T03:04');
});

test('due labels: overdue, today, tomorrow', () => {
  const R = core();
  const now = new Date(2026, 10, 7, 12, 0);
  assert.equal(R.dueLabel(new Date(2026, 10, 7, 10, 0), now).cls, 'red');
  assert.match(R.dueLabel(new Date(2026, 10, 7, 10, 0), now).text, /^просрочено 2 ч/);
  assert.equal(JSON.stringify(R.dueLabel(new Date(2026, 10, 7, 15, 0), now)), JSON.stringify({ text: 'сегодня 15:00', cls: 'amber' }));
  assert.equal(R.dueLabel(new Date(2026, 10, 8, 10, 0), now).text, 'завтра 10:00');
  assert.equal(R.pct(0, 0), '—'); assert.equal(R.pct(40, 10), '25%');
});

test('timeline merges stage moves, calls and finished reminders newest first; next/reject stage choice', () => {
  const R = core();
  const tl = R.timeline({
    stage_log: [{ created_at: '2026-11-01T10:00:00Z', to_stage_name: 'Новый отклик' }],
    comments: [{ created_at: '2026-11-02T10:00:00Z', comment_type: 'no_answer', call_result: 'no_answer', body: 'Не ответил', author_name: 'A' }],
    reminders: [{ status: 'done', done_at: '2026-11-03T10:00:00Z', kind: 'call', result: 'ok' }, { status: 'open', due_at: '2026-11-09T10:00:00Z' }],
  });
  assert.equal(tl.map(e => e.icon).join(' '), '✅ 📵 ➜');
  const stages = [
    { id: 'a', name: 'Новый отклик', sort_order: 1, kpi_step: 'response' }, { id: 'b', name: 'Обучение', sort_order: 2, kpi_step: 'training' },
    { id: 'c', name: 'Стажировка', sort_order: 3, kpi_step: 'internship' }, { id: 'h', name: 'Принят', sort_order: 4, is_terminal: true, terminal_type: 'hired' },
    { id: 'r1', name: 'Отказ после отклика', sort_order: 5, is_terminal: true, terminal_type: 'rejected' },
    { id: 'r2', name: 'Отказ после стажировки', sort_order: 6, is_terminal: true, terminal_type: 'rejected' }];
  assert.equal(R.nextStage(stages, 'a').id, 'b');
  assert.equal(R.nextStage(stages, 'c'), null, 'hire is a deliberate action, not «next»');
  assert.equal(R.rejectStage(stages, 'c').id, 'r2');
  assert.equal(R.rejectStage(stages, 'a').id, 'r1');
});

test('page safety: no inline handlers with interpolated ids, links open safely, no secrets', () => {
  assert.ok(!/\son(click|change|input|drop|dragstart)="/i.test(html), 'events are bound by delegation, ids live in data-*');
  for (const m of html.matchAll(/target="_blank"([^>]*)>/g)) assert.match(m[1] + m[0], /rel="noopener/, 'external links use rel=noopener');
  assert.ok(!/(client_secret|AVITO_CLIENT_SECRET=|HH_CLIENT_SECRET=)[^<`]*['"][A-Za-z0-9]{16,}/.test(html));
  assert.ok(html.includes('<script src="assets/photohr.js"></script>'));
});

test('interns funnel: first name for messages, templates, channel links', () => {
  const R = core();
  assert.equal(R.firstName('Петрова Ирина'), 'Ирина');
  assert.equal(R.firstName('Ирина Петрова'), 'Ирина');
  assert.equal(R.firstName('Иванов Иван Иванович'), 'Иван');
  assert.equal(R.firstName('Константин Лев'), 'Константин', 'first names that look like surnames stay first names');
  assert.equal(R.firstName(''), '');
  assert.equal(R.renderTemplate('{имя}, тренинг {дата_тренинга} в {время_тренинга}', { имя: 'Ира', дата_тренинга: 'сб 14 ноя' }), 'Ира, тренинг сб 14 ноя в …',
    'missing data becomes «…», never an empty gap');
  assert.equal(R.renderTemplate('{evil}<b>', {}), '…<b>', 'rendering does not escape — the text goes into a textarea via esc()');
  const c = { name: 'Петрова Ирина', assigned_to_name: 'Юлия Рекрутер', source: 'hh', source_url: 'https://hh.ru/resume/1', phone: '8 900 111-22-33',
    intern: { training: { date: '2026-11-14', time: '12:00', place: 'Офис', trainer_name: 'Пётр' },
      outings: [{ date: '2026-11-15', status: 'done', venue_name: 'Москвариум' }, { date: '2026-11-20', status: 'booked', venue_name: 'Крокус' }] } };
  const v = R.templateVars(c, { laika_bot: 'likeme_laika_bot', intern_chat_url: 'https://t.me/+abc' });
  assert.equal(v.имя, 'Ирина'); assert.equal(v.рекрутер, 'Юлия'); assert.equal(v.дата_тренинга, 'сб 14 ноя'); assert.equal(v.площадка, 'Москвариум');
  assert.equal(v.дата, 'пт 20 ноя'); assert.equal(v.ссылка_бот, 'https://t.me/likeme_laika_bot');
  assert.equal(R.channelOf(c), 'hh'); assert.equal(R.channelOf({ contact_channel: 'max' }), 'max'); assert.equal(R.channelOf({ telegram: '@x_name' }), 'telegram');
  assert.equal(R.channelHref('hh', c), 'https://hh.ru/resume/1');
  assert.equal(R.channelHref('phone', c), 'tel:+79001112233');
  assert.equal(R.channelHref('whatsapp', c), 'https://wa.me/79001112233');
  assert.equal(R.channelHref('telegram', { contact_link: '@photo_ivan' }), 'https://t.me/photo_ivan');
  assert.equal(R.channelHref('max', { contact_link: 'javascript:alert(1)' }), null, 'no script links from the contact field');
  assert.equal(R.channelHref('email', { contact_link: 'a@b.ru' }), 'mailto:a@b.ru');
});

test('interns funnel: checklist groups in funnel order, tasks per person, QR images only from SVG', () => {
  const R = core();
  const g = R.checklistGroups([{ code: 'x', stage: 'outing_1' }, { code: 'a', stage: 'training_1' }, { code: 'b', stage: 'training_1' }]);
  assert.equal(JSON.stringify(g.map(x => [x.stage, x.items.length])), JSON.stringify([['training_1', 2], ['outing_1', 1]]));
  const t = R.groupTasks([{ candidate_id: '1', item: 'a' }, { candidate_id: '2', item: 'b' }, { candidate_id: '1', item: 'c' }]);
  assert.equal(JSON.stringify(t.map(x => [x.candidate_id, x.items.map(i => i.item).join('')])), JSON.stringify([['1', 'ac'], ['2', 'b']]));
  assert.match(R.svgSrc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), /^data:image\/svg\+xml/);
  assert.equal(R.svgSrc('<script>alert(1)</script>'), null);
  assert.equal(R.dayLabel('2026-11-14'), 'сб 14 ноя');
  assert.ok(R.STEP.outing_3 && R.STEP.trainee && R.STEP.reserve, 'labels for the new KPI steps');
});

test('interns funnel: QR and templates never inject server HTML; checkboxes are handled by the change listener', () => {
  assert.ok(html.includes("addEventListener('change'") && html.includes('data-act="check-item"'));
  assert.ok(!/innerHTML\s*=\s*[a-z.]*qr_svg/i.test(html), 'server SVG goes through an <img> data: URL, not innerHTML');
  assert.ok(html.includes('<script src="assets/qrcode.min.js"></script>'));
  assert.ok(/textarea class="tpl-text"[^>]*>\$\{esc\(text\)\}/.test(html), 'template text is escaped into the textarea');
});
