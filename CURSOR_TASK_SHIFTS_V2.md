# ЗАДАЧА ДЛЯ CURSOR: Переделка модели смен и ролей
## PhotoHR — расширение системы расписания

> **ПЕРЕД НАЧАЛОМ** — прочитай MASTER_CONTEXT.md, CURSOR_TASK_SCHEDULING.md и убедись что работаешь с актуальным index.js.
> **ПРАВИЛА:** str_replace точечных блоков. НЕ переписывать файлы целиком. НЕ разбивать index.js. НЕ выносить JS/CSS из HTML. Каждый catch: `logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message });`
> **ПОСЛЕ КАЖДОГО ЭТАПА:** `git add -A && git commit -m "shifts-v2: этап N — описание" && git push`

---

# КОНТЕКСТ

Текущая модель: при создании мероприятия (event) создаётся 1 shift (смена). Фотографы, админы, менеджеры назначаются на эту одну смену через shift_assignments с role_in_shift.

**Проблема:** В реальности на площадке может быть несколько смен фотографов (утро/вечер), при этом админы и менеджеры работают весь день. Также нужны наставники и помощники (неполный день, фикс + процент).

**Новая модель:**
- Мероприятие (event) = 1 день на 1 площадке
- У мероприятия несколько смен (shifts), каждая со своей ролью (target_role)
- Дефолтная конфигурация смен хранится в venues.default_shifts (JSONB)
- При создании мероприятия — смены создаются автоматически из конфигурации площадки
- HR может корректировать количество и время смен на конкретном мероприятии
- Помощник — это роль на смене, может быть любой сотрудник, работает неполный день, оплата: фикс + процент

---

# ЭТАП 1: МИГРАЦИИ БД

Добавить в блок автомиграций в index.js (перед `logger.info('schedule & grades migration ready')`):

```js
  // ============================================================
  // SHIFTS V2 — расширенная модель смен
  // ============================================================

  // --- Конфигурация смен в площадке ---
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_shifts JSONB DEFAULT '${JSON.stringify({
    photographer: [
      { name: "Основная", start: "10:00", end: "20:00" }
    ],
    admin: [
      { name: "Полный день", start: "09:30", end: "22:00" }
    ],
    manager: [
      { name: "Полный день", start: "09:30", end: "22:00" }
    ],
    mentor: [],
    helper: []
  })}'`).catch(() => {});

  // --- Расширение shifts ---
  await db.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT 'photographer'`).catch(() => {});
  await db.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_name TEXT`).catch(() => {});
  await db.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => {});
  await db.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS required_count INTEGER DEFAULT 1`).catch(() => {});

  // --- Расширение shift_assignments для помощников ---
  await db.query(`ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS actual_start TIME`).catch(() => {});
  await db.query(`ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS actual_end TIME`).catch(() => {});
  await db.query(`ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS helper_fixed_pay NUMERIC`).catch(() => {});
  await db.query(`ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS helper_percent NUMERIC`).catch(() => {});

  // --- Добавить 'helper' в допустимые employee_roles ---
  // (employee_roles — TEXT[], просто новый вариант, менять тип не нужно)

  // --- Мероприятие: поле для количества смен (override от площадки) ---
  await db.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS shifts_config JSONB`).catch(() => {});
  // Если NULL — используется venues.default_shifts
  // Если заполнено — override конфигурации смен для этого конкретного мероприятия

  // --- Обновить существующие shifts: проставить target_role ---
  // Существующие shifts не имеют target_role, ставим 'photographer' как дефолт
  await db.query(`UPDATE shifts SET target_role='photographer' WHERE target_role IS NULL`).catch(() => {});

  // --- Venues: настройки по типам дней для смен ---
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_shifts_weekend JSONB`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS default_shifts_holiday JSONB`).catch(() => {});
  // Если NULL — используется default_shifts (будни = дефолт, weekend/holiday = override если есть)

  logger.info('shifts-v2 migration ready');
```

**git commit + push.**

---

# ЭТАП 2: API — ОБНОВЛЕНИЕ СОЗДАНИЯ МЕРОПРИЯТИЙ И СМЕН

### 2.1. Хелпер: создание смен из конфигурации

Добавить перед блоком роутов расписания (перед `// ROUTES: CALENDAR DAY OVERRIDES`):

```js
// Хелпер: создать смены из конфигурации площадки/мероприятия
async function createShiftsFromConfig(eventId, shiftsConfig, venueDefaults, dayType) {
  // shiftsConfig — override из events.shifts_config (может быть null)
  // venueDefaults — venues.default_shifts / default_shifts_weekend / default_shifts_holiday
  // dayType — 'weekday' / 'weekend' / 'holiday'

  let config = shiftsConfig;
  if (!config) {
    // Выбрать конфиг площадки по типу дня
    if (dayType === 'weekend' && venueDefaults.default_shifts_weekend) {
      config = venueDefaults.default_shifts_weekend;
    } else if (dayType === 'holiday' && venueDefaults.default_shifts_holiday) {
      config = venueDefaults.default_shifts_holiday;
    } else {
      config = venueDefaults.default_shifts;
    }
  }

  if (!config || typeof config !== 'object') {
    // Fallback: одна смена для фотографов
    await db.query(
      `INSERT INTO shifts (event_id, shift_type, target_role, shift_name, start_time, end_time, sort_order, required_count, status)
       VALUES ($1, 'main', 'photographer', 'Основная', $2, $3, 0, $4, 'open')`,
      [eventId, venueDefaults.default_staff_arrival || '10:00', venueDefaults.default_event_end || '20:00',
       venueDefaults.required_photographers || 2]
    );
    return;
  }

  const roles = ['photographer', 'admin', 'manager', 'mentor', 'helper'];
  const requiredFields = {
    photographer: 'required_photographers',
    admin: 'required_admins',
    manager: 'required_admins', // менеджеры используют то же поле или отдельное
    mentor: null,
    helper: null,
  };

  let globalSort = 0;
  for (const role of roles) {
    const roleShifts = config[role];
    if (!Array.isArray(roleShifts) || roleShifts.length === 0) continue;

    for (let idx = 0; idx < roleShifts.length; idx++) {
      const s = roleShifts[idx];
      const shiftName = s.name || `${role} смена ${idx + 1}`;
      const reqCount = s.required_count || (requiredFields[role] ? (venueDefaults[requiredFields[role]] || 1) : 0);

      await db.query(
        `INSERT INTO shifts (event_id, shift_type, target_role, shift_name, start_time, end_time, sort_order, required_count, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')`,
        [eventId, idx === 0 ? 'main' : 'additional', role, shiftName,
         s.start || null, s.end || null, globalSort++, reqCount]
      );
    }
  }
}
```

### 2.2. Обновить POST /api/events/bulk-create

Найти в текущем bulk-create место где создаётся shift:
```js
await db.query(
  `INSERT INTO shifts (event_id, shift_type, start_time, end_time) VALUES ($1,'main',$2,null)`,
```

Заменить на:
```js
await createShiftsFromConfig(
  rows[0].id,
  null, // нет override — используем конфиг площадки
  venue,
  item.day_type
);
```

### 2.3. Обновить POST /api/events (одиночное создание)

Аналогично: найти создание shift после INSERT INTO events и заменить на вызов createShiftsFromConfig.

Если в req.body есть shifts_config — передать его:
```js
await createShiftsFromConfig(
  rows[0].id,
  req.body.shifts_config || null,
  venue,
  dayType
);
```

### 2.4. Обновить POST /api/events/:id/duplicate

Аналогично заменить создание shift на createShiftsFromConfig.

### 2.5. Новый API: управление сменами мероприятия

```js
// GET /api/events/:id/shifts — все смены мероприятия (сгруппированные по роли)
app.get('/api/events/:id/shifts-detail', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM shift_assignments sa
         WHERE sa.shift_id = s.id AND sa.status != 'cancelled') as assigned_count,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', sa.id, 'photographer_id', sa.photographer_id,
            'name', p.name, 'role_in_shift', sa.role_in_shift,
            'status', sa.status, 'actual_start', sa.actual_start, 'actual_end', sa.actual_end
          ) ORDER BY p.name)
          FROM shift_assignments sa
          JOIN photographers p ON p.id = sa.photographer_id
          WHERE sa.shift_id = s.id AND sa.status != 'cancelled'
        ), '[]') as assignments
      FROM shifts s
      WHERE s.event_id = $1
      ORDER BY s.sort_order, s.target_role, s.start_time
    `, [req.params.id]);
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/events/:id/shifts — добавить смену к мероприятию
app.post('/api/events/:id/shifts', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { target_role, shift_name, start_time, end_time, required_count } = req.body;
    if (!target_role) return res.status(400).json({ error: 'target_role обязателен' });

    // Определить sort_order
    const { rows: maxSort } = await db.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM shifts WHERE event_id=$1', [req.params.id]
    );

    const { rows } = await db.query(
      `INSERT INTO shifts (event_id, shift_type, target_role, shift_name, start_time, end_time, sort_order, required_count)
       VALUES ($1, 'additional', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, target_role, shift_name || null, start_time || null, end_time || null,
       maxSort[0].next, required_count || 1]
    );
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// PATCH /api/shifts/:id — редактировать смену
app.patch('/api/shifts/:id', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const fields = ['shift_name', 'start_time', 'end_time', 'target_role', 'required_count', 'sort_order', 'status'];
    const updates = []; const vals = []; let i = 1;
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f}=$${i++}`); vals.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Нет полей' });
    vals.push(req.params.id);
    const { rows } = await db.query(`UPDATE shifts SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Смена не найдена' });
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// DELETE /api/shifts/:id — удалить смену (только если нет назначений или отчётов)
app.delete('/api/shifts/:id', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { rows: check } = await db.query(
      `SELECT COUNT(*) as cnt FROM shift_assignments WHERE shift_id=$1 AND status!='cancelled'`, [req.params.id]
    );
    if (parseInt(check[0].cnt) > 0) {
      return res.status(400).json({ error: 'Нельзя удалить — есть назначенные сотрудники. Сначала снимите назначения.' });
    }
    await db.query('DELETE FROM shifts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});
```

### 2.6. Обновить назначение на смену — поддержка помощников

В существующем `POST /api/shifts/:id/assignments` добавить обработку полей помощника.

Найти блок INSERT INTO shift_assignments и расширить:
```js
const { photographer_id, role_in_shift, notes, actual_start, actual_end, helper_fixed_pay, helper_percent } = req.body;
```

В INSERT добавить поля:
```sql
INSERT INTO shift_assignments (shift_id, photographer_id, role_in_shift, assignment_type, assigned_by, notes, actual_start, actual_end, helper_fixed_pay, helper_percent)
VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9) RETURNING *
```

С соответствующими параметрами.

### 2.7. Обновить PATCH /api/venues/:id — поддержка default_shifts

Добавить в деструктуризацию req.body: `default_shifts, default_shifts_weekend, default_shifts_holiday`

В блок updates:
```js
if ('default_shifts' in req.body) { updates.push(`default_shifts=$${i++}`); vals.push(JSON.stringify(default_shifts)); }
if ('default_shifts_weekend' in req.body) { updates.push(`default_shifts_weekend=$${i++}`); vals.push(JSON.stringify(default_shifts_weekend)); }
if ('default_shifts_holiday' in req.body) { updates.push(`default_shifts_holiday=$${i++}`); vals.push(JSON.stringify(default_shifts_holiday)); }
```

### 2.8. Обновить GET /api/venues — добавить default_shifts в SELECT

В GET /api/venues добавить в SELECT: `default_shifts, default_shifts_weekend, default_shifts_holiday`.

### 2.9. Обновить GET /api/events/calendar-data

Добавить в SELECT для events: `e.shifts_config, e.event_end, e.manager_arrival`.

Добавить подсчёт назначенных ПО РОЛЯМ (не только photographer):
```sql
(SELECT json_agg(json_build_object(
  'role', s2.target_role, 'shift_name', s2.shift_name,
  'required', s2.required_count, 'assigned',
  (SELECT COUNT(*) FROM shift_assignments sa2 WHERE sa2.shift_id=s2.id AND sa2.status!='cancelled')
))
FROM shifts s2 WHERE s2.event_id=e.id
) as shifts_summary
```

### 2.10. Обновить GET /api/events/:id/staffing-needs

Переписать чтобы учитывать новую модель:
- Потребности считать по shifts.target_role и shifts.required_count
- Назначенные — по shift_assignments на каждый shift

**git commit + push.**

---

# ЭТАП 3: ФРОНТЕНД — МОДАЛКИ СОЗДАНИЯ МЕРОПРИЯТИЙ

### 3.1. Модалка одиночного создания (drag-and-drop) — переделать

Текущие поля "Фотографов / Операторов / Менеджеров" заменить на блок смен.

Структура модалки:

```
┌─ Создание мероприятия ──────────────────────────────┐
│                                                      │
│ Площадка: Vegas City Hall                            │
│ Дата: суббота, 22 марта · Тип дня: выходной         │
│                                                      │
│ ── Мероприятие ───────────────────── (#9b8dff фон)  │
│ Запуск гостей [10:00]  Начало [10:30]  Конец [22:00]│
│                                                      │
│ ── Фотографы ────────────────────── (#7c6cff фон)   │
│ Смена 1: Сбор [09:30] Конец [20:00] Нужно: [3]     │
│ Смена 2: Сбор [11:30] Конец [22:00] Нужно: [2]     │
│ [+ Добавить смену]                                   │
│                                                      │
│ ── АдМэны ───────────────────────── (#3ecf8e фон)   │
│ Админ:    Приход [09:30] Конец [22:00] Нужно: [1]   │
│ Менеджер: Приход [09:30] Конец [22:00] Нужно: [1]   │
│                                                      │
│ ── Доп. роли ────────────────────── (#f5a623 фон)   │
│ [+ Наставник] [+ Помощник]                           │
│                                                      │
│ Название мероприятия: [Опционально__________]        │
│                                                      │
│            [Отмена]  [Создать]                        │
└──────────────────────────────────────────────────────┘
```

Логика:
- Данные смен подтягиваются из venue.default_shifts (или default_shifts_weekend/holiday по day_type)
- Если у площадки default_shifts содержит 2 смены фотографов — показывается 2
- Кнопка "+ Добавить смену" — добавляет ещё одну строку для фотографов
- Кнопка "+ Наставник" — добавляет строку наставника (Приход / Конец / Нужно)
- Кнопка "+ Помощник" — добавляет строку помощника (Приход / Конец / Нужно / Фикс оплата / % от продаж)
- Можно удалить добавленную смену (крестик)
- Каждая секция визуально отделена цветом фона (полупрозрачный)

При нажатии "Создать":
1. POST /api/events/bulk-create (1 дата) с shifts_config в body
2. shifts_config формируется из полей модалки:
```json
{
  "photographer": [
    {"name": "Смена 1", "start": "09:30", "end": "20:00", "required_count": 3},
    {"name": "Смена 2", "start": "11:30", "end": "22:00", "required_count": 2}
  ],
  "admin": [{"name": "Админ", "start": "09:30", "end": "22:00", "required_count": 1}],
  "manager": [{"name": "Менеджер", "start": "09:30", "end": "22:00", "required_count": 1}]
}
```

### 3.2. Модалка массового создания — добавить смены

В массовой модалке — под блоком времён (Будни/Выходные) добавить:

```
── Смены фотографов ──
Будни: [1 смена ▼]  |  Выходные: [2 смены ▼]

Будни - Смена 1: Сбор [10:00] Конец [20:00] Нужно [2]
Выходные - Смена 1: Сбор [09:30] Конец [20:00] Нужно [3]
Выходные - Смена 2: Сбор [11:30] Конец [22:00] Нужно [2]
```

Количество смен выбирается из select (1/2/3). Значения подтягиваются из venue.default_shifts и default_shifts_weekend.

При массовом создании: shifts_config отправляется разный для будних и выходных дат (через weekday_times/weekend_times override в bulk-create).

### 3.3. Обновить отображение мероприятий в календаре

В ячейках дней показывать не просто название площадки, а:
```
Vegas City Hall
📸2 🖨1 👔1
```
Где 📸 = фотографы (назначено/нужно), 🖨 = операторы, 👔 = менеджеры.

Цвет текста:
- Красный если назначено < нужно
- Зелёный если укомплектовано
- Серый если нет мероприятия

### 3.4. Обновить bulk-create API для поддержки shifts_config

В POST /api/events/bulk-create добавить:
- Приём shifts_config из body
- Приём weekday_shifts_config и weekend_shifts_config (для массового создания с разными конфигами по дням)
- При создании каждого event — вызвать createShiftsFromConfig с правильным конфигом

**git commit + push.**

---

# ЭТАП 4: СПРАВОЧНИК ПЛОЩАДОК — НАСТРОЙКА СМЕН

Сейчас нет отдельного UI для настройки default_shifts площадки. Нужно добавить.

### 4.1. В venue.html (раздел настроек площадки) или в schedule.html — блок настройки смен

При клике на площадку в правой панели schedule.html — добавить иконку ⚙️ рядом с названием. При клике на ⚙️ — открывается drawer/модалка настроек площадки:

```
┌─ Настройки: Vegas City Hall ────────────────────────┐
│                                                      │
│ ── Мероприятие (стандартное время) ──                │
│ Будни:     Гости [10:00] Начало [10:30] Конец [22:00]
│ Выходные:  Гости [10:00] Начало [10:30] Конец [22:00]
│ Праздники: Гости [10:00] Начало [10:30] Конец [22:00]
│                                                      │
│ ── Смены фотографов ──                              │
│ Будни:                                               │
│   Смена 1: Сбор [10:00] Конец [20:00] Нужно [2]    │
│   [+ Добавить смену]                                │
│ Выходные:                                            │
│   Смена 1: Сбор [09:30] Конец [20:00] Нужно [3]    │
│   Смена 2: Сбор [11:30] Конец [22:00] Нужно [2]    │
│   [+ Добавить смену]                                │
│                                                      │
│ ── АдМэны ──                                        │
│ Будни:     Админ [09:30-22:00] ×1  Менеджер [09:30-22:00] ×1
│ Выходные:  Админ [09:30-22:00] ×1  Менеджер [09:30-22:00] ×1
│                                                      │
│ ── Доп. настройки ──                                │
│ Приоритет: [●●○ Стандартный ▼]                      │
│ Тяжёлость: [Обычная ▼]                              │
│ Порядок:   [0]                                       │
│                                                      │
│ ── Штатный min/max ──                               │
│ Фотографы: min [1] max [5]                          │
│ Операторы: min [1] max [2]                          │
│ Менеджеры: min [0] max [2]                          │
│                                                      │
│         [Отмена]  [Сохранить]                        │
└──────────────────────────────────────────────────────┘
```

При сохранении:
- PATCH /api/venues/:id с полями: default_shifts, default_shifts_weekend, default_shifts_holiday, times_weekday, times_weekend, times_holiday, staffing_min, staffing_max, priority_level, difficulty

### 4.2. Каждая площадка в правой панели — показать мини-инфо

Вместо просто имени площадки показывать:
```
Vegas City Hall          ⚙️
📸2 смены · 🖨1 · 👔1
```
Мелким шрифтом под названием — сколько смен фотографов по дефолту.

**git commit + push.**

---

# ЭТАП 5: ОБНОВЛЕНИЕ ВКЛАДКИ "РАССТАНОВКА" — УЧЁТ СМЕН

На вкладке "Расстановка" (тетрис) сетка должна учитывать смены:

### 5.1. Ячейки сетки

Сейчас: одна ячейка на площадку × день.
Нужно: если у площадки 2 смены фотографов — показывать 2 подстроки:

```
│         │ 1 апр      │ 2 апр      │
│─────────┼────────────┼────────────│
│ Москва- │ Смена 1    │ Смена 1    │
│ риум    │ 🟢 3/3     │ 🟡 2/3     │
│         │ Смена 2    │ Смена 2    │
│         │ 🟢 2/2     │ 🔴 0/2     │
│         │ Адм: 1/1 ✅│ Адм: 1/1 ✅│
│         │ Мен: 1/1 ✅│ Мен: 0/1 ❌│
```

### 5.2. Пул сотрудников — фильтр по роли

В пуле свободных добавить фильтр:
```
[📸 Фотографы] [🖨 Операторы] [👔 Менеджеры] [🎓 Наставники] [🤝 Помощники]
```

При drag-and-drop фотографа на ячейку смены — назначать на конкретную смену (shift_id), а не просто на мероприятие.

### 5.3. Автораспределение — учитывать смены

В POST /api/staffing/auto-assign:
- Загружать shifts для каждого event
- Распределять отдельно по каждой смене
- Учитывать что один фотограф не может быть на 2 сменах в один день (на одной площадке может, на разных — нет)

**git commit + push.**

---

# ЭТАП 6: ВЫРАВНИВАНИЕ UI + МЕЛОЧИ

### 6.1. Модалка создания — выровнять

- Все инпуты одинаковой ширины
- Секции визуально разделены цветными полосками:
  - Мероприятие: фиолетовый (#9b8dff, opacity 0.1 фон)
  - Фотографы: акцентный (#7c6cff, opacity 0.1 фон)
  - АдМэны: зелёный (#3ecf8e, opacity 0.1 фон)
  - Доп. роли: оранжевый (#f5a623, opacity 0.1 фон)
- Заголовки секций — жирные, с иконкой
- Инпуты time — width: 80px
- Инпуты number (нужно) — width: 50px
- Компактная сетка, не растянутая

### 6.2. Массовая модалка — аналогичное выравнивание

### 6.3. Toast — на русском

"Создано: Vegas City Hall → 22 марта (2 смены)"
"Создано 15 мероприятий на Океанариум Крокус"
"Мероприятие удалено"

### 6.4. Drag-and-drop визуал

- При перетаскивании площадки — ячейки дней подсвечиваются (border: 2px dashed var(--accent))
- Ghost элемент — полупрозрачная карточка с названием площадки
- При hover над ячейкой — фон чуть светлее

**git commit + push.**

---

# ПРОВЕРОЧНЫЙ ЧЕКЛИСТ

- [ ] shifts.target_role — поле добавлено, старые обновлены
- [ ] shifts.shift_name, sort_order, required_count — добавлены
- [ ] shift_assignments — actual_start/end, helper_fixed_pay/percent
- [ ] venues.default_shifts — JSONB с конфигурацией по ролям
- [ ] При создании мероприятия через bulk-create — создаются правильные смены из конфига площадки
- [ ] Если у площадки 2 смены фотографов — создаётся 2 shifts с target_role='photographer'
- [ ] Модалка одиночного создания показывает секции: Мероприятие / Фотографы / АдМэны / Доп.роли
- [ ] Модалка массового создания показывает конфигурацию смен для будней и выходных
- [ ] В ячейках календаря видно количество назначенных по ролям
- [ ] GET /api/events/:id/shifts-detail возвращает смены с назначениями
- [ ] POST /api/events/:id/shifts — можно добавить смену
- [ ] PATCH /api/shifts/:id — можно отредактировать
- [ ] DELETE /api/shifts/:id — можно удалить (если нет назначений)
- [ ] Настройки площадки (⚙️) позволяют задать default_shifts
- [ ] На вкладке расстановки — видны подстроки по сменам
