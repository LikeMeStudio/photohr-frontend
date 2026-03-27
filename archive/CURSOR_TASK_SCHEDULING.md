# ЗАДАЧА ДЛЯ CURSOR: Система расписания и грейдов
## PhotoHR — полная реализация

> **ПЕРЕД НАЧАЛОМ** — прочитай MASTER_CONTEXT.md и убедись что работаешь с актуальным index.js и всеми HTML.
> **ПРАВИЛА:** Изменения через str_replace точечных блоков. НЕ переписывать файлы целиком. НЕ разбивать index.js на модули. НЕ выносить JS/CSS из HTML. Каждый catch: `logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message });`
> **ПОСЛЕ КАЖДОГО ЭТАПА:** `git add -A && git commit -m "schedule: этап N — описание" && git push`

---

# ЭТАП 1: МИГРАЦИИ БД

Добавить в блок автомиграций в `index.js` (IIFE перед `app.listen`), **после** строки `logger.info('bonus_schemes migration ready');` и **перед** закрывающей `})();`:

```js
  // ============================================================
  // SCHEDULE & GRADES MODULE — миграции
  // ============================================================

  // --- 1.1 Расширение photographers ---
  await db.query(`ALTER TABLE photographers ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'msk'`).catch(() => {});

  // --- 1.2 Расширение venues ---
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS staffing_weekday JSONB DEFAULT '{"photographers":2,"operators":1,"managers":1,"mentors":0}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS staffing_weekend JSONB DEFAULT '{"photographers":3,"operators":1,"managers":1,"mentors":0}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS staffing_holiday JSONB DEFAULT '{"photographers":3,"operators":1,"managers":1,"mentors":0}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS times_weekday JSONB DEFAULT '{"event_start":"11:00","guest_start":"10:30","staff_arrival":"10:00","admin_arrival":"09:30"}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS times_weekend JSONB DEFAULT '{"event_start":"11:00","guest_start":"10:30","staff_arrival":"10:00","admin_arrival":"09:30"}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS times_holiday JSONB DEFAULT '{"event_start":"11:00","guest_start":"10:30","staff_arrival":"10:00","admin_arrival":"09:30"}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS staffing_min JSONB DEFAULT '{"photographers":1,"operators":1,"managers":0,"mentors":0}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS staffing_max JSONB DEFAULT '{"photographers":5,"operators":2,"managers":2,"mentors":1}'`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS priority_level INTEGER DEFAULT 2`).catch(() => {});
  await db.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'normal'`).catch(() => {});

  // --- 1.3 Расширение events ---
  await db.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT`).catch(() => {});
  await db.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS day_type TEXT DEFAULT 'auto'`).catch(() => {});
  await db.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`).catch(() => {});

  // --- 1.4 Расширение availability ---
  await db.query(`ALTER TABLE availability ADD COLUMN IF NOT EXISTS available_from TIME`).catch(() => {});
  await db.query(`ALTER TABLE availability ADD COLUMN IF NOT EXISTS available_to TIME`).catch(() => {});
  await db.query(`ALTER TABLE availability ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1`).catch(() => {});
  await db.query(`ALTER TABLE availability ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`).catch(() => {});

  // --- 1.5 Праздничные даты ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS calendar_day_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      override_date DATE NOT NULL,
      day_type TEXT NOT NULL DEFAULT 'holiday',
      city TEXT,
      label TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cdo_date_city ON calendar_day_overrides(override_date, COALESCE(city,'_all_'))`).catch(() => {});

  // --- 1.6 История схемы оплаты ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS pay_scheme_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      photographer_id UUID NOT NULL REFERENCES photographers(id),
      scheme TEXT NOT NULL,
      started_at DATE NOT NULL,
      ended_at DATE,
      commission_pct NUMERIC DEFAULT 25,
      notes TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_psh_ph ON pay_scheme_history(photographer_id)`).catch(() => {});

  // --- 1.7 Система грейдов ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS grade_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role_type TEXT NOT NULL,
      grade_code TEXT NOT NULL,
      grade_name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      pay_bonus_pct NUMERIC DEFAULT 0,
      pay_mode TEXT DEFAULT 'percent_bonus',
      min_big_shifts INTEGER,
      min_total_shifts INTEGER,
      min_punctuality_pct NUMERIC,
      min_sales_plan_pct NUMERIC,
      max_waste_pct NUMERIC,
      check_items JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gd_role_code ON grade_definitions(role_type, grade_code) WHERE is_active=true`).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS grade_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      photographer_id UUID NOT NULL REFERENCES photographers(id),
      grade_definition_id UUID REFERENCES grade_definitions(id),
      grade_code TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      effective_from DATE NOT NULL,
      effective_to DATE,
      approved_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_gh_ph ON grade_history(photographer_id)`).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS grade_check_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      photographer_id UUID NOT NULL REFERENCES photographers(id),
      grade_definition_id UUID NOT NULL REFERENCES grade_definitions(id),
      check_item_index INTEGER NOT NULL,
      passed BOOLEAN DEFAULT false,
      checked_by UUID REFERENCES users(id),
      checked_at TIMESTAMPTZ DEFAULT now(),
      notes TEXT
    )
  `).catch(() => {});

  // --- 1.8 Снимки и логи расписания ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS schedule_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      city TEXT NOT NULL DEFAULT 'msk',
      snapshot_data JSONB NOT NULL,
      action_description TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS schedule_change_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID REFERENCES events(id),
      photographer_id UUID REFERENCES photographers(id),
      action TEXT NOT NULL,
      old_value JSONB,
      new_value JSONB,
      reason TEXT,
      auto_generated BOOLEAN DEFAULT false,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // --- 1.9 История заявок ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS availability_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      photographer_id UUID NOT NULL REFERENCES photographers(id),
      avail_date DATE NOT NULL,
      old_status TEXT,
      new_status TEXT,
      old_notes TEXT,
      new_notes TEXT,
      changed_at TIMESTAMPTZ DEFAULT now(),
      changed_by UUID REFERENCES users(id)
    )
  `).catch(() => {});

  // --- 1.10 Месячные премии ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS monthly_bonus_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      min_shifts INTEGER NOT NULL DEFAULT 15,
      revenue_threshold NUMERIC NOT NULL,
      bonus_amount NUMERIC NOT NULL,
      is_cumulative BOOLEAN DEFAULT false,
      revenue_step NUMERIC,
      step_bonus NUMERIC,
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
      effective_to DATE,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // --- 1.11 Настройки автораспределения ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS staffing_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      city TEXT NOT NULL DEFAULT 'msk',
      config_key TEXT NOT NULL,
      config_value JSONB NOT NULL,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_city_key ON staffing_config(city, config_key)`).catch(() => {});

  // --- 1.12 Надбавки ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS pay_supplements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      supplement_type TEXT NOT NULL,
      amount NUMERIC,
      percentage NUMERIC,
      conditions JSONB DEFAULT '{}',
      applies_to JSONB DEFAULT '["all"]',
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
      effective_to DATE,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // --- 1.13 Публикация расписаний ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS schedule_publish_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      city TEXT NOT NULL DEFAULT 'msk',
      published_by UUID REFERENCES users(id),
      published_at TIMESTAMPTZ DEFAULT now(),
      snapshot_id UUID REFERENCES schedule_snapshots(id),
      notes TEXT
    )
  `).catch(() => {});

  // --- 1.14 Seed: грейды по умолчанию ---
  const { rows: existingGrades } = await db.query('SELECT COUNT(*) as cnt FROM grade_definitions').catch(() => ({ rows: [{ cnt: '0' }] }));
  if (parseInt(existingGrades[0]?.cnt || '0') === 0) {
    const gradeSeeds = [
      // Админ/Оператор печати
      { role_type: 'admin', grade_code: '0', grade_name: 'А-0 (испытательный)', sort_order: 0, pay_bonus_pct: 0, pay_mode: 'percent_bonus', check_items: '[]' },
      { role_type: 'admin', grade_code: '1', grade_name: 'А-1', sort_order: 1, pay_bonus_pct: 10, pay_mode: 'percent_bonus', min_big_shifts: 10, min_punctuality_pct: 95,
        check_items: JSON.stringify([
          {category:'functional',text:'Инструкция Админа',required:true},
          {category:'functional',text:'Взаимодействие с администрацией площадок',required:true},
          {category:'functional',text:'Участие во всех собраниях',required:true},
          {category:'personnel',text:'Стажировки Админов',required:true},
          {category:'personnel',text:'Решение конфликтов',required:true},
          {category:'technical',text:'Монтаж точки печати',required:true},
          {category:'other',text:'Субординация',required:true},
          {category:'other',text:'Конфиденциальность',required:true},
          {category:'other',text:'Разделение ценностей команды',required:true},
          {category:'print_zone',text:'Чистота, порядок, внешний вид, культура речи',required:true},
          {category:'field',text:'Персонал: дресскод, рации, образцы',required:true}
        ])
      },
      { role_type: 'admin', grade_code: '2', grade_name: 'А-2', sort_order: 2, pay_bonus_pct: 20, pay_mode: 'percent_bonus', min_big_shifts: 15, min_total_shifts: 20, min_sales_plan_pct: 60, max_waste_pct: 10,
        check_items: JSON.stringify([
          {category:'functional',text:'Участие в развитии компании, генерация идей',required:true},
          {category:'personnel',text:'Повышение результатов: собрания, расстановка, схема продаж',required:true},
          {category:'personnel',text:'Стажировки фотографов',required:true},
          {category:'technical',text:'Настройки камеры',required:true},
          {category:'other',text:'Общение с гостями: решение конфликтов, сохранение и увеличение продаж',required:true},
          {category:'field',text:'Персонал: культура речи, смартфон, «лавочка»',required:true}
        ])
      },
      { role_type: 'admin', grade_code: 'top_admin', grade_name: 'ТопАд', sort_order: 3, pay_bonus_pct: 20, pay_mode: 'percent_plus_fix', min_sales_plan_pct: 70,
        check_items: JSON.stringify([
          {category:'functional',text:'Заместитель управляющего',required:true},
          {category:'functional',text:'Оперативная помощь и контроль работы коллег',required:true},
          {category:'functional',text:'Отчёты коллег (анализ-выводы-гипотезы-решения)',required:true},
          {category:'functional',text:'Учёт расходки',required:true},
          {category:'functional',text:'Апдейт бюрократии',required:true},
          {category:'functional',text:'Взаимодействие с тех.отделом и руководством',required:true},
          {category:'functional',text:'Контроль и поддержание порядка на площадках',required:true},
          {category:'functional',text:'Поддержание единых стандартов работы',required:true},
          {category:'functional',text:'Участие в созвонах с управленческой командой',required:true},
          {category:'personnel',text:'Корректировка работы Админов',required:true},
          {category:'personnel',text:'Собеседования новых Админов',required:true},
          {category:'personnel',text:'Решение конфликтов внутри команды',required:true},
          {category:'other',text:'Авторитет среди коллег',required:true},
          {category:'other',text:'Одобрение бэкофиса',required:true}
        ])
      },
      // Менеджер
      { role_type: 'manager', grade_code: '0', grade_name: 'М-0 (испытательный)', sort_order: 0, pay_bonus_pct: 0, pay_mode: 'percent_bonus', check_items: '[]' },
      { role_type: 'manager', grade_code: '1', grade_name: 'М-1', sort_order: 1, pay_bonus_pct: 15, pay_mode: 'percent_bonus', min_big_shifts: 10, min_punctuality_pct: 95, min_sales_plan_pct: 70,
        check_items: JSON.stringify([
          {category:'functional',text:'Инструкция Менеджера',required:true},
          {category:'functional',text:'Админка 1/2 (открытие, обед, закрытие)',required:true},
          {category:'functional',text:'Качественные, конструктивные отчёты',required:true},
          {category:'functional',text:'Контроль и помощь в работе Админа',required:true},
          {category:'functional',text:'Оперативный контакт с управленческой командой',required:true},
          {category:'functional',text:'Взаимодействие с администрацией площадок',required:true},
          {category:'personnel',text:'Участие во всех собраниях',required:true},
          {category:'personnel',text:'Стажировки фотографов',required:true},
          {category:'personnel',text:'Решение конфликтов',required:true},
          {category:'personnel',text:'Повышение результатов: собрания, расстановка, схема продаж',required:true},
          {category:'technical',text:'Настройки камеры',required:true},
          {category:'other',text:'Субординация, конфиденциальность, ценности команды',required:true},
          {category:'other',text:'Общение с гостями: сохранение и увеличение продаж, решение конфликтов',required:true},
          {category:'print_zone',text:'Чистота, порядок, внешний вид, культура речи',required:true},
          {category:'field',text:'Персонал: расстановка, дресскод, рации, образцы, смартфон, «лавочка»',required:true}
        ])
      },
      { role_type: 'manager', grade_code: '2', grade_name: 'М-2', sort_order: 2, pay_bonus_pct: 30, pay_mode: 'percent_bonus', min_big_shifts: 15, min_total_shifts: 20, min_sales_plan_pct: 80,
        check_items: JSON.stringify([
          {category:'functional',text:'Участие в развитии компании, генерация идей',required:true},
          {category:'functional',text:'Админ грейд «1» — выполнение функций',required:true},
          {category:'personnel',text:'Наставничество фотографов',required:true},
          {category:'personnel',text:'Стажировки Менеджеров и Админов',required:true},
          {category:'technical',text:'Монтаж точки печати',required:true},
          {category:'other',text:'Выход фотографом 5 смен',required:true}
        ])
      },
      { role_type: 'manager', grade_code: '3', grade_name: 'М-3', sort_order: 3, pay_bonus_pct: 35, pay_mode: 'percent_bonus', min_sales_plan_pct: 85,
        check_items: JSON.stringify([
          {category:'functional',text:'Проведение вводных тренингов',required:true},
          {category:'functional',text:'«Играющий тренер»: фотографом от 2 выходов в месяц',required:true}
        ])
      },
      { role_type: 'manager', grade_code: 'top_manager', grade_name: 'ТопМэн', sort_order: 4, pay_bonus_pct: 35, pay_mode: 'percent_plus_fix', min_sales_plan_pct: 90,
        check_items: JSON.stringify([
          {category:'functional',text:'Заместитель управляющего',required:true},
          {category:'functional',text:'Оперативная помощь и контроль работы коллег',required:true},
          {category:'functional',text:'Отчёты коллег (анализ-выводы-гипотезы-решения)',required:true},
          {category:'functional',text:'Апдейт бюрократии',required:true},
          {category:'functional',text:'Составление и ведение базы фотографов для обучения',required:true},
          {category:'functional',text:'Взаимодействие с тех.отделом и руководством',required:true},
          {category:'functional',text:'Контроль и поддержание порядка на площадках',required:true},
          {category:'functional',text:'Поддержание единых стандартов работы',required:true},
          {category:'functional',text:'Участие в созвонах с управленческой командой',required:true},
          {category:'personnel',text:'Корректировка работы Менеджеров',required:true},
          {category:'personnel',text:'Собеседования новых Менеджеров',required:true},
          {category:'personnel',text:'Проведение онлайн собраний',required:true},
          {category:'personnel',text:'Решение конфликтов внутри команды',required:true},
          {category:'other',text:'Авторитет среди коллег',required:true},
          {category:'other',text:'Одобрение бэкофиса',required:true}
        ])
      },
    ];
    for (const g of gradeSeeds) {
      await db.query(
        `INSERT INTO grade_definitions (role_type, grade_code, grade_name, sort_order, pay_bonus_pct, pay_mode, min_big_shifts, min_total_shifts, min_punctuality_pct, min_sales_plan_pct, max_waste_pct, check_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [g.role_type, g.grade_code, g.grade_name, g.sort_order, g.pay_bonus_pct, g.pay_mode, g.min_big_shifts||null, g.min_total_shifts||null, g.min_punctuality_pct||null, g.min_sales_plan_pct||null, g.max_waste_pct||null, g.check_items||'[]']
      ).catch(() => {});
    }
    logger.info('grade_definitions seeded');
  }

  // --- 1.15 Seed: настройки автораспределения ---
  const defaultConfigs = [
    { city: 'msk', config_key: 'max_consecutive_days', config_value: JSON.stringify({ normal: 5, hard: 2, easy: 7 }) },
    { city: 'msk', config_key: 'tier_balance_defaults', config_value: JSON.stringify({ tier_a_pct: 40, tier_b_pct: 40, tier_c_pct: 20 }) },
    { city: 'msk', config_key: 'timely_submission_bonus', config_value: JSON.stringify({ per_photo_bonus: 5, min_days: 7 }) },
    { city: 'spb', config_key: 'max_consecutive_days', config_value: JSON.stringify({ normal: 5, hard: 2, easy: 7 }) },
    { city: 'spb', config_key: 'tier_balance_defaults', config_value: JSON.stringify({ tier_a_pct: 40, tier_b_pct: 40, tier_c_pct: 20 }) },
    { city: 'spb', config_key: 'timely_submission_bonus', config_value: JSON.stringify({ per_photo_bonus: 5, min_days: 7 }) },
  ];
  for (const c of defaultConfigs) {
    await db.query(
      `INSERT INTO staffing_config (city, config_key, config_value) VALUES ($1,$2,$3) ON CONFLICT (city, config_key) DO NOTHING`,
      [c.city, c.config_key, c.config_value]
    ).catch(() => {});
  }

  // --- 1.16 Seed: надбавки по умолчанию ---
  const { rows: existingSupp } = await db.query('SELECT COUNT(*) as cnt FROM pay_supplements').catch(() => ({ rows: [{ cnt: '0' }] }));
  if (parseInt(existingSupp[0]?.cnt || '0') === 0) {
    const suppSeeds = [
      { name: 'Своевременная подача заявки', supplement_type: 'timely_submission', conditions: { per_photo_bonus: 5, min_days_in_period: 7 }, applies_to: ['photographer'] },
      { name: 'Госпраздничный день', supplement_type: 'holiday_bonus', amount: 500, applies_to: ['all'] },
      { name: 'Компенсация за отмену', supplement_type: 'cancel_compensation', amount: 1000, applies_to: ['all'] },
      { name: 'Санитарный день', supplement_type: 'sanitary_day', amount: 1000, applies_to: ['admin', 'manager'] },
      { name: '15-19 смен/мес', supplement_type: 'monthly_shifts', amount: 2500, conditions: { min_shifts: 15, max_shifts: 19 }, applies_to: ['admin', 'manager'] },
      { name: '20+ смен/мес', supplement_type: 'monthly_shifts', amount: 5000, conditions: { min_shifts: 20 }, applies_to: ['admin', 'manager'] },
      { name: '130-179 дней/год', supplement_type: 'annual_shifts', amount: 20000, conditions: { min_days: 130, max_days: 179 }, applies_to: ['admin', 'manager'] },
      { name: '180+ дней/год', supplement_type: 'annual_shifts', amount: 40000, conditions: { min_days: 180 }, applies_to: ['admin', 'manager'] },
      { name: 'Опыт 444+ смен', supplement_type: 'experience_444', percentage: 5, conditions: { threshold_shifts: 444 }, applies_to: ['admin', 'manager'] },
    ];
    for (const s of suppSeeds) {
      await db.query(
        `INSERT INTO pay_supplements (name, supplement_type, amount, percentage, conditions, applies_to) VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.name, s.supplement_type, s.amount || null, s.percentage || null, JSON.stringify(s.conditions || {}), JSON.stringify(s.applies_to)]
      ).catch(() => {});
    }
    logger.info('pay_supplements seeded');
  }

  // --- 1.17 Seed: месячные премии ---
  const { rows: existingMBR } = await db.query('SELECT COUNT(*) as cnt FROM monthly_bonus_rules').catch(() => ({ rows: [{ cnt: '0' }] }));
  if (parseInt(existingMBR[0]?.cnt || '0') === 0) {
    await db.query(
      `INSERT INTO monthly_bonus_rules (name, min_shifts, revenue_threshold, bonus_amount, is_cumulative, revenue_step, step_bonus)
       VALUES ('Базовая премия', 15, 210000, 5000, false, null, null)`
    ).catch(() => {});
    await db.query(
      `INSERT INTO monthly_bonus_rules (name, min_shifts, revenue_threshold, bonus_amount, is_cumulative, revenue_step, step_bonus)
       VALUES ('Расширенная премия', 15, 300000, 10000, true, 90000, 5000)`
    ).catch(() => {});
    logger.info('monthly_bonus_rules seeded');
  }

  logger.info('schedule & grades migration ready');
```

**Также** обновить venues PATCH endpoint — добавить обработку новых полей. Найти в существующем `PATCH /api/venues/:id` блок деструктуризации `req.body` и добавить новые поля:

В строке деструктуризации добавить:
```
staffing_weekday, staffing_weekend, staffing_holiday,
times_weekday, times_weekend, times_holiday,
staffing_min, staffing_max, sort_order, priority_level, difficulty
```

В блок `if/updates.push` добавить обработку каждого нового поля:
```js
if ('staffing_weekday' in req.body) { updates.push(`staffing_weekday=$${i++}`); vals.push(JSON.stringify(staffing_weekday)); }
if ('staffing_weekend' in req.body) { updates.push(`staffing_weekend=$${i++}`); vals.push(JSON.stringify(staffing_weekend)); }
if ('staffing_holiday' in req.body) { updates.push(`staffing_holiday=$${i++}`); vals.push(JSON.stringify(staffing_holiday)); }
if ('times_weekday' in req.body) { updates.push(`times_weekday=$${i++}`); vals.push(JSON.stringify(times_weekday)); }
if ('times_weekend' in req.body) { updates.push(`times_weekend=$${i++}`); vals.push(JSON.stringify(times_weekend)); }
if ('times_holiday' in req.body) { updates.push(`times_holiday=$${i++}`); vals.push(JSON.stringify(times_holiday)); }
if ('staffing_min' in req.body) { updates.push(`staffing_min=$${i++}`); vals.push(JSON.stringify(staffing_min)); }
if ('staffing_max' in req.body) { updates.push(`staffing_max=$${i++}`); vals.push(JSON.stringify(staffing_max)); }
if ('sort_order' in req.body) { updates.push(`sort_order=$${i++}`); vals.push(sort_order ?? 0); }
if ('priority_level' in req.body) { updates.push(`priority_level=$${i++}`); vals.push(priority_level ?? 2); }
if ('difficulty' in req.body) { updates.push(`difficulty=$${i++}`); vals.push(difficulty || 'normal'); }
```

Аналогично обновить `GET /api/venues` — добавить новые поля в SELECT.

Обновить `POST /api/venues` — добавить новые поля в INSERT.

Обновить `PATCH /api/photographers/:id` — добавить обработку поля `city`.

**git commit + push после этого этапа.**

---

# ЭТАП 2: API — ГРЕЙДЫ

Добавить **перед** блоком `// ============================================================ // START` (перед `app.listen`):

```js
// ============================================================
// ROUTES: GRADE DEFINITIONS (справочник грейдов)
// ============================================================

// GET /api/grade-definitions — все грейды
app.get('/api/grade-definitions', authenticate, async (req, res) => {
  try {
    const { role_type } = req.query;
    let where = 'WHERE is_active = true';
    const vals = [];
    if (role_type) { where += ` AND role_type = $1`; vals.push(role_type); }
    const { rows } = await db.query(`SELECT * FROM grade_definitions ${where} ORDER BY role_type, sort_order`, vals);
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/grade-definitions — создать/обновить грейд (admin)
app.post('/api/grade-definitions', authenticate, requireRole('admin', 'exec_director'), async (req, res) => {
  try {
    const { role_type, grade_code, grade_name, sort_order, pay_bonus_pct, pay_mode,
            min_big_shifts, min_total_shifts, min_punctuality_pct, min_sales_plan_pct,
            max_waste_pct, check_items } = req.body;
    if (!role_type || !grade_code || !grade_name) return res.status(400).json({ error: 'role_type, grade_code и grade_name обязательны' });
    const { rows } = await db.query(
      `INSERT INTO grade_definitions (role_type,grade_code,grade_name,sort_order,pay_bonus_pct,pay_mode,min_big_shifts,min_total_shifts,min_punctuality_pct,min_sales_plan_pct,max_waste_pct,check_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [role_type, grade_code, grade_name, sort_order||0, pay_bonus_pct||0, pay_mode||'percent_bonus',
       min_big_shifts||null, min_total_shifts||null, min_punctuality_pct||null, min_sales_plan_pct||null,
       max_waste_pct||null, JSON.stringify(check_items||[])]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Грейд с таким кодом уже существует' });
    logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
  }
});

// PATCH /api/grade-definitions/:id — обновить
app.patch('/api/grade-definitions/:id', authenticate, requireRole('admin', 'exec_director'), async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['grade_name','sort_order','pay_bonus_pct','pay_mode','min_big_shifts','min_total_shifts','min_punctuality_pct','min_sales_plan_pct','max_waste_pct','check_items','is_active'];
    const updates = []; const vals = []; let i = 1;
    for (const f of fields) {
      if (f in req.body) {
        updates.push(`${f}=$${i++}`);
        vals.push(f === 'check_items' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Нет полей' });
    updates.push(`updated_at=NOW()`);
    vals.push(id);
    const { rows } = await db.query(`UPDATE grade_definitions SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Грейд не найден' });
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/photographers/:id/grade — текущий грейд фотографа
app.get('/api/photographers/:id/grade', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT gh.*, gd.grade_name, gd.pay_bonus_pct, gd.pay_mode, gd.role_type
       FROM grade_history gh
       JOIN grade_definitions gd ON gd.id = gh.grade_definition_id
       WHERE gh.photographer_id = $1 AND gh.effective_to IS NULL
       ORDER BY gh.created_at DESC LIMIT 1`, [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/photographers/:id/grade-history — история грейдов
app.get('/api/photographers/:id/grade-history', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT gh.*, gd.grade_name, gd.pay_bonus_pct, u.name as approved_by_name
       FROM grade_history gh
       LEFT JOIN grade_definitions gd ON gd.id = gh.grade_definition_id
       LEFT JOIN users u ON u.id = gh.approved_by
       WHERE gh.photographer_id = $1
       ORDER BY gh.effective_from DESC`, [req.params.id]
    );
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/photographers/:id/grade/assign — присвоить грейд
app.post('/api/photographers/:id/grade/assign', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { grade_definition_id, effective_from, reason } = req.body;
    if (!grade_definition_id || !effective_from) return res.status(400).json({ error: 'grade_definition_id и effective_from обязательны' });

    const { rows: gd } = await db.query('SELECT * FROM grade_definitions WHERE id=$1', [grade_definition_id]);
    if (!gd.length) return res.status(404).json({ error: 'Грейд не найден' });

    // Закрыть текущий грейд
    await db.query(
      `UPDATE grade_history SET effective_to = ($1::date - INTERVAL '1 day')::date
       WHERE photographer_id = $2 AND effective_to IS NULL`,
      [effective_from, id]
    );

    // Определить action
    const { rows: prev } = await db.query(
      `SELECT gh.grade_code, gd2.sort_order as prev_sort
       FROM grade_history gh
       JOIN grade_definitions gd2 ON gd2.id = gh.grade_definition_id
       WHERE gh.photographer_id = $1
       ORDER BY gh.created_at DESC LIMIT 1`, [id]
    );
    let action = 'assigned';
    if (prev.length) {
      action = gd[0].sort_order > prev[0].prev_sort ? 'promoted' : gd[0].sort_order < prev[0].prev_sort ? 'demoted' : 'assigned';
    }

    const { rows } = await db.query(
      `INSERT INTO grade_history (photographer_id, grade_definition_id, grade_code, action, reason, effective_from, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, grade_definition_id, gd[0].grade_code, action, reason || null, effective_from, req.user.id]
    );

    // Обновить photographers.grade
    await db.query('UPDATE photographers SET grade=$1, updated_at=NOW() WHERE id=$2', [gd[0].grade_code, id]);

    await audit(req.user.id, req.user.name, 'grade', rows[0].id, action, 'photographer', id, gd[0].grade_name, req.ip);
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/photographers/:id/grade/checklist — чеклист проверок
app.get('/api/photographers/:id/grade/checklist', authenticate, async (req, res) => {
  try {
    const { grade_definition_id } = req.query;
    if (!grade_definition_id) return res.status(400).json({ error: 'grade_definition_id обязателен' });
    const { rows } = await db.query(
      `SELECT * FROM grade_check_results WHERE photographer_id=$1 AND grade_definition_id=$2 ORDER BY check_item_index`,
      [req.params.id, grade_definition_id]
    );
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/photographers/:id/grade/checklist — обновить пункт чеклиста
app.post('/api/photographers/:id/grade/checklist', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { grade_definition_id, check_item_index, passed, notes } = req.body;
    if (!grade_definition_id || check_item_index === undefined) return res.status(400).json({ error: 'grade_definition_id и check_item_index обязательны' });
    const { rows } = await db.query(
      `INSERT INTO grade_check_results (photographer_id, grade_definition_id, check_item_index, passed, checked_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (photographer_id, grade_definition_id, check_item_index)
       DO UPDATE SET passed=$4, checked_by=$5, checked_at=NOW(), notes=$6
       RETURNING *`,
      [req.params.id, grade_definition_id, check_item_index, passed !== false, req.user.id, notes || null]
    );
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});
```

Также добавить UNIQUE constraint для grade_check_results (чтобы ON CONFLICT работал):
В блок миграций (этап 1) добавить:
```js
await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gcr_ph_gd_idx ON grade_check_results(photographer_id, grade_definition_id, check_item_index)`).catch(() => {});
```

**git commit + push.**

---

# ЭТАП 3: API — PAY SCHEME HISTORY + НАДБАВКИ + МЕСЯЧНЫЕ ПРЕМИИ

Добавить после блока грейдов:

```js
// ============================================================
// ROUTES: PAY SCHEME HISTORY
// ============================================================

app.post('/api/photographers/:id/pay-scheme', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { scheme, started_at, commission_pct, notes } = req.body;
    if (!scheme || !started_at) return res.status(400).json({ error: 'scheme и started_at обязательны' });
    if (!['standard', 'premium'].includes(scheme)) return res.status(400).json({ error: 'scheme: standard или premium' });

    // Закрыть текущую запись
    await db.query(
      `UPDATE pay_scheme_history SET ended_at = ($1::date - INTERVAL '1 day')::date
       WHERE photographer_id = $2 AND ended_at IS NULL`,
      [started_at, id]
    );

    const { rows } = await db.query(
      `INSERT INTO pay_scheme_history (photographer_id, scheme, started_at, commission_pct, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, scheme, started_at, commission_pct || 25, notes || null, req.user.id]
    );

    // Обновить photographers.pay_scheme
    await db.query('UPDATE photographers SET pay_scheme=$1, pay_commission_pct=$2, updated_at=NOW() WHERE id=$3',
      [scheme, commission_pct || 25, id]);

    await audit(req.user.id, req.user.name, 'pay_scheme', rows[0].id, 'change', 'scheme', null, scheme, req.ip);
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.get('/api/photographers/:id/pay-scheme-history', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT psh.*, u.name as created_by_name FROM pay_scheme_history psh
       LEFT JOIN users u ON u.id = psh.created_by
       WHERE psh.photographer_id = $1 ORDER BY psh.started_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// ============================================================
// ROUTES: PAY SUPPLEMENTS (надбавки)
// ============================================================

app.get('/api/pay-supplements', authenticate, async (req, res) => {
  try {
    const { active_only } = req.query;
    const where = active_only === 'true' ? 'WHERE is_active=true AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)' : '';
    const { rows } = await db.query(`SELECT * FROM pay_supplements ${where} ORDER BY supplement_type, name`);
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.post('/api/pay-supplements', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { name, supplement_type, amount, percentage, conditions, applies_to, effective_from, effective_to } = req.body;
    if (!name || !supplement_type) return res.status(400).json({ error: 'name и supplement_type обязательны' });
    const { rows } = await db.query(
      `INSERT INTO pay_supplements (name,supplement_type,amount,percentage,conditions,applies_to,effective_from,effective_to,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, supplement_type, amount||null, percentage||null, JSON.stringify(conditions||{}),
       JSON.stringify(applies_to||['all']), effective_from||new Date().toISOString().split('T')[0], effective_to||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.patch('/api/pay-supplements/:id', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const fields = ['name','supplement_type','amount','percentage','conditions','applies_to','effective_from','effective_to','is_active'];
    const updates = []; const vals = []; let i = 1;
    for (const f of fields) {
      if (f in req.body) {
        updates.push(`${f}=$${i++}`);
        vals.push(['conditions','applies_to'].includes(f) ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Нет полей' });
    vals.push(req.params.id);
    const { rows } = await db.query(`UPDATE pay_supplements SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Надбавка не найдена' });
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// ============================================================
// ROUTES: MONTHLY BONUS RULES
// ============================================================

app.get('/api/monthly-bonus-rules', authenticate, async (req, res) => {
  try {
    const { active_only } = req.query;
    const where = active_only === 'true' ? 'WHERE is_active=true AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)' : '';
    const { rows } = await db.query(`SELECT * FROM monthly_bonus_rules ${where} ORDER BY revenue_threshold`);
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.post('/api/monthly-bonus-rules', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { name, min_shifts, revenue_threshold, bonus_amount, is_cumulative, revenue_step, step_bonus, effective_from, effective_to } = req.body;
    if (!name || !revenue_threshold || !bonus_amount) return res.status(400).json({ error: 'name, revenue_threshold и bonus_amount обязательны' });
    const { rows } = await db.query(
      `INSERT INTO monthly_bonus_rules (name,min_shifts,revenue_threshold,bonus_amount,is_cumulative,revenue_step,step_bonus,effective_from,effective_to,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, min_shifts||15, revenue_threshold, bonus_amount, is_cumulative||false, revenue_step||null, step_bonus||null,
       effective_from||new Date().toISOString().split('T')[0], effective_to||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.patch('/api/monthly-bonus-rules/:id', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const fields = ['name','min_shifts','revenue_threshold','bonus_amount','is_cumulative','revenue_step','step_bonus','effective_from','effective_to','is_active'];
    const updates = []; const vals = []; let i = 1;
    for (const f of fields) { if (f in req.body) { updates.push(`${f}=$${i++}`); vals.push(req.body[f]); } }
    if (!updates.length) return res.status(400).json({ error: 'Нет полей' });
    vals.push(req.params.id);
    const { rows } = await db.query(`UPDATE monthly_bonus_rules SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Правило не найдено' });
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/monthly-bonus/calculate — рассчитать премии за месяц (preview)
app.post('/api/monthly-bonus/calculate', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { month, year } = req.body; // month: 1-12, year: 2026
    if (!month || !year) return res.status(400).json({ error: 'month и year обязательны' });
    const periodStart = `${year}-${String(month).padStart(2,'0')}-01`;
    const periodEnd = new Date(year, month, 0).toISOString().split('T')[0];

    // Активные правила на этот период
    const { rows: rules } = await db.query(
      `SELECT * FROM monthly_bonus_rules WHERE is_active=true
       AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $1)
       ORDER BY revenue_threshold`, [periodStart, periodEnd]
    );

    // Считаем по каждому фотографу
    const { rows: phStats } = await db.query(`
      SELECT p.id, p.name,
        (SELECT COUNT(DISTINCT e.id) FROM shift_assignments sa
         JOIN shifts s ON s.id=sa.shift_id JOIN events e ON e.id=s.event_id
         WHERE sa.photographer_id=p.id AND sa.status!='cancelled'
           AND e.event_date >= $1 AND e.event_date <= $2
        ) as shift_count,
        COALESCE((SELECT SUM(sl.total) FROM sale_lines sl
         JOIN daily_reports dr ON dr.id=sl.report_id
         WHERE sl.photographer_id=p.id AND dr.status='approved'
           AND dr.report_date >= $1 AND dr.report_date <= $2
        ), 0) as total_revenue
      FROM photographers p WHERE p.is_active=true AND p.hire_status='active'
    `, [periodStart, periodEnd]);

    const results = phStats.map(ph => {
      const shifts = parseInt(ph.shift_count);
      const revenue = parseFloat(ph.total_revenue);
      let totalBonus = 0;
      const appliedRules = [];

      for (const rule of rules) {
        if (shifts >= rule.min_shifts && revenue >= parseFloat(rule.revenue_threshold)) {
          totalBonus += parseFloat(rule.bonus_amount);
          appliedRules.push(rule.name);
          // Шаговые доп. премии
          if (rule.is_cumulative && rule.revenue_step && rule.step_bonus) {
            const excess = revenue - parseFloat(rule.revenue_threshold);
            const steps = Math.floor(excess / parseFloat(rule.revenue_step));
            if (steps > 0) {
              totalBonus += steps * parseFloat(rule.step_bonus);
              appliedRules.push(`+${steps} шагов по ${rule.step_bonus}₽`);
            }
          }
        }
      }
      return { photographer_id: ph.id, name: ph.name, shifts, revenue, bonus: totalBonus, rules: appliedRules };
    }).filter(r => r.bonus > 0);

    res.json({ period: `${year}-${String(month).padStart(2,'0')}`, results, total: results.reduce((s,r) => s + r.bonus, 0) });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});
```

**git commit + push.**

---

# ЭТАП 4: API — РАСПИСАНИЕ ПЛОЩАДОК

Добавить после блока месячных премий:

```js
// ============================================================
// ROUTES: CALENDAR DAY OVERRIDES (праздники)
// ============================================================

app.get('/api/calendar-overrides', authenticate, async (req, res) => {
  try {
    const { month, year, city } = req.query;
    let where = 'WHERE 1=1'; const vals = []; let i = 1;
    if (month && year) {
      where += ` AND EXTRACT(MONTH FROM override_date)=$${i++} AND EXTRACT(YEAR FROM override_date)=$${i++}`;
      vals.push(month, year);
    }
    if (city) { where += ` AND (city=$${i++} OR city IS NULL)`; vals.push(city); }
    const { rows } = await db.query(`SELECT cdo.*, u.name as created_by_name FROM calendar_day_overrides cdo LEFT JOIN users u ON u.id=cdo.created_by ${where} ORDER BY override_date`, vals);
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.post('/api/calendar-overrides', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { override_date, day_type, city, label } = req.body;
    if (!override_date) return res.status(400).json({ error: 'override_date обязателен' });
    const { rows } = await db.query(
      `INSERT INTO calendar_day_overrides (override_date, day_type, city, label, created_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (override_date, COALESCE(city,'_all_')) DO UPDATE SET day_type=$2, label=$4
       RETURNING *`,
      [override_date, day_type || 'holiday', city || null, label || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.delete('/api/calendar-overrides/:id', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM calendar_day_overrides WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// ============================================================
// ROUTES: EVENTS — расширенные операции расписания
// ============================================================

// Хелпер: определить day_type для даты
async function resolveDayType(dateStr, city) {
  // Проверить calendar_day_overrides
  const { rows: overrides } = await db.query(
    `SELECT day_type FROM calendar_day_overrides WHERE override_date=$1 AND (city=$2 OR city IS NULL) ORDER BY city DESC NULLS LAST LIMIT 1`,
    [dateStr, city || 'msk']
  );
  if (overrides.length) return overrides[0].day_type;
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  return (dow === 0 || dow === 6) ? 'weekend' : 'weekday';
}

// POST /api/events/bulk-create — массовое создание мероприятий
app.post('/api/events/bulk-create', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { venue_id, dates, event_name, preview } = req.body;
    if (!venue_id || !Array.isArray(dates) || !dates.length) return res.status(400).json({ error: 'venue_id и dates[] обязательны' });

    const { rows: venueRows } = await db.query('SELECT * FROM venues WHERE id=$1', [venue_id]);
    if (!venueRows.length) return res.status(404).json({ error: 'Площадка не найдена' });
    const venue = venueRows[0];

    const results = [];
    for (const dateStr of dates) {
      const dayType = await resolveDayType(dateStr, venue.city);
      const timesField = `times_${dayType}`;
      const staffField = `staffing_${dayType}`;
      const times = venue[timesField] || venue.times_weekday || {};
      const staffing = venue[staffField] || venue.staffing_weekday || {};

      // Проверить дубликат
      const { rows: existing } = await db.query(
        'SELECT id FROM events WHERE venue_id=$1 AND event_date=$2', [venue_id, dateStr]
      );

      results.push({
        date: dateStr,
        day_type: dayType,
        event_start: times.event_start || venue.default_event_start,
        guest_start: times.guest_start || venue.default_guest_start,
        staff_arrival: times.staff_arrival || venue.default_staff_arrival,
        admin_arrival: times.admin_arrival || venue.default_admin_arrival,
        required_photographers: staffing.photographers || venue.required_photographers || 1,
        required_admins: staffing.managers || venue.required_admins || 1,
        required_operators: staffing.operators || venue.required_operators || 1,
        already_exists: existing.length > 0,
        existing_id: existing[0]?.id || null,
        event_name: event_name || null,
      });
    }

    if (preview) return res.json({ preview: true, items: results });

    // Создаём
    const created = [];
    for (const item of results) {
      if (item.already_exists) continue;
      const { rows } = await db.query(
        `INSERT INTO events (venue_id, event_date, event_start, guest_start, staff_arrival, admin_arrival,
          required_photographers, required_admins, required_operators, event_name, day_type, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'bulk_create',$12) RETURNING *`,
        [venue_id, item.date, item.event_start, item.guest_start, item.staff_arrival, item.admin_arrival,
         item.required_photographers, item.required_admins, item.required_operators,
         item.event_name, item.day_type, req.user.id]
      );
      // Создать shift
      if (rows.length) {
        await db.query(
          `INSERT INTO shifts (event_id, shift_type, start_time, end_time) VALUES ($1,'main',$2,null)`,
          [rows[0].id, item.staff_arrival]
        );
        created.push(rows[0]);
      }
    }

    res.status(201).json({ created: created.length, skipped: results.filter(r => r.already_exists).length, events: created });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/events/calendar-data — оптимизированные данные за месяц
app.get('/api/events/calendar-data', authenticate, async (req, res) => {
  try {
    const { month, year, city } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month и year обязательны' });
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to = new Date(year, month, 0).toISOString().split('T')[0];

    const { rows } = await db.query(`
      SELECT e.*, v.name as venue_name, v.city as venue_city, v.category as venue_category,
             v.staffing_min, v.staffing_max,
             COALESCE(e.required_photographers, v.required_photographers, 1) as need_photo,
             COALESCE(e.required_admins, v.required_admins, 1) as need_admin,
             COALESCE(e.required_operators, v.required_operators, 1) as need_ops,
             (SELECT COUNT(*) FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id
              WHERE s.event_id=e.id AND sa.status!='cancelled' AND sa.role_in_shift='photographer') as assigned_photo,
             (SELECT COUNT(*) FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id
              WHERE s.event_id=e.id AND sa.status!='cancelled' AND sa.role_in_shift='admin') as assigned_admin,
             (SELECT COUNT(*) FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id
              WHERE s.event_id=e.id AND sa.status!='cancelled' AND sa.role_in_shift='print_operator') as assigned_ops
      FROM events e JOIN venues v ON v.id=e.venue_id
      WHERE e.event_date >= $1 AND e.event_date <= $2
        ${city ? 'AND v.city = $3' : ''}
      ORDER BY e.event_date, v.sort_order, v.name
    `, city ? [from, to, city] : [from, to]);

    // Также подтянуть праздники
    const { rows: overrides } = await db.query(
      `SELECT * FROM calendar_day_overrides WHERE override_date >= $1 AND override_date <= $2
       ${city ? 'AND (city = $3 OR city IS NULL)' : ''}`,
      city ? [from, to, city] : [from, to]
    );

    res.json({ events: rows, overrides });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// PATCH /api/events/:id/move — перенести мероприятие
app.patch('/api/events/:id/move', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { new_date } = req.body;
    if (!new_date) return res.status(400).json({ error: 'new_date обязателен' });

    const { rows } = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Мероприятие не найдено' });
    const old_date = rows[0].event_date;

    await db.query('UPDATE events SET event_date=$1, updated_at=NOW() WHERE id=$2', [new_date, id]);

    // Лог изменения
    await db.query(
      `INSERT INTO schedule_change_log (event_id, action, old_value, new_value, created_by)
       VALUES ($1,'move',$2,$3,$4)`,
      [id, JSON.stringify({ date: old_date }), JSON.stringify({ date: new_date }), req.user.id]
    );

    await audit(req.user.id, req.user.name, 'event', id, 'move', 'event_date', old_date, new_date, req.ip);
    res.json({ ok: true });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/events/:id/duplicate — дублировать мероприятие
app.post('/api/events/:id/duplicate', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { new_date } = req.body;
    if (!new_date) return res.status(400).json({ error: 'new_date обязателен' });
    const { rows: orig } = await db.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    if (!orig.length) return res.status(404).json({ error: 'Мероприятие не найдено' });
    const o = orig[0];
    const { rows } = await db.query(
      `INSERT INTO events (venue_id, event_date, event_start, guest_start, staff_arrival, admin_arrival,
        required_photographers, required_admins, required_operators, event_name, day_type, source, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12,$13) RETURNING *`,
      [o.venue_id, new_date, o.event_start, o.guest_start, o.staff_arrival, o.admin_arrival,
       o.required_photographers, o.required_admins, o.required_operators, o.event_name, o.day_type, o.notes, req.user.id]
    );
    // Создать shift
    await db.query(`INSERT INTO shifts (event_id, shift_type, start_time) VALUES ($1,'main',$2)`, [rows[0].id, o.staff_arrival]);
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// DELETE /api/events/bulk-delete — массовое удаление
app.delete('/api/events/bulk-delete', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { event_ids } = req.body;
    if (!Array.isArray(event_ids) || !event_ids.length) return res.status(400).json({ error: 'event_ids[] обязателен' });
    let deleted = 0;
    for (const eid of event_ids) {
      const { rows: reps } = await db.query(
        `SELECT COUNT(*) as cnt FROM daily_reports dr JOIN shifts s ON s.id=dr.shift_id WHERE s.event_id=$1 AND dr.status='approved'`, [eid]
      );
      if (parseInt(reps[0].cnt) > 0) continue; // не удаляем если есть проведённые отчёты
      await db.query('DELETE FROM events WHERE id=$1', [eid]);
      deleted++;
    }
    res.json({ ok: true, deleted, skipped: event_ids.length - deleted });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});
```

**git commit + push.**

---

# ЭТАП 5: API — ЗАЯВКИ (расширение) + СНИМКИ + КОНФИГ

Добавить после блока расписания площадок:

```js
// ============================================================
// ROUTES: AVAILABILITY — расширенные операции
// ============================================================

// POST /api/availability/submit — отправить заявку
app.post('/api/availability/submit', authenticate, async (req, res) => {
  try {
    const photographerId = req.user.photographer_id;
    if (!photographerId) return res.status(400).json({ error: 'Аккаунт не привязан к карточке' });
    const { period_id } = req.body;
    if (!period_id) return res.status(400).json({ error: 'period_id обязателен' });

    const { rows: period } = await db.query('SELECT * FROM availability_periods WHERE id=$1', [period_id]);
    if (!period.length) return res.status(404).json({ error: 'Период не найден' });

    // Проставить submitted_at на все даты периода
    await db.query(
      `UPDATE availability SET submitted_at = NOW() WHERE photographer_id=$1 AND avail_date >= $2 AND avail_date <= $3 AND submitted_at IS NULL`,
      [photographerId, period[0].period_start, period[0].period_end]
    );
    res.json({ ok: true });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/availability/correct — коррекция заявки
app.post('/api/availability/correct', authenticate, async (req, res) => {
  try {
    const photographerId = req.user.photographer_id || req.body.photographer_id;
    if (!photographerId) return res.status(400).json({ error: 'photographer_id не определён' });
    const { dates } = req.body;
    if (!Array.isArray(dates) || !dates.length) return res.status(400).json({ error: 'dates[] обязателен' });

    const validStatuses = ['available_full', 'available_morning', 'available_evening', 'unavailable', 'day_off'];
    let saved = 0;
    for (const d of dates) {
      if (!d.date || !validStatuses.includes(d.status)) continue;
      // Сохранить историю
      const { rows: old } = await db.query(
        'SELECT status, notes FROM availability WHERE photographer_id=$1 AND avail_date=$2',
        [photographerId, d.date]
      );
      if (old.length) {
        await db.query(
          `INSERT INTO availability_history (photographer_id, avail_date, old_status, new_status, old_notes, new_notes, changed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [photographerId, d.date, old[0].status, d.status, old[0].notes, d.notes || null, req.user.id]
        );
      }
      await db.query(
        `INSERT INTO availability (photographer_id, avail_date, status, notes, available_from, available_to, version, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,NOW())
         ON CONFLICT (photographer_id, avail_date)
         DO UPDATE SET status=$3, notes=$4, available_from=$5, available_to=$6, version=availability.version+1, submitted_at=NOW(), updated_at=NOW()`,
        [photographerId, d.date, d.status, d.notes || null, d.available_from || null, d.available_to || null]
      );
      saved++;
    }
    res.json({ ok: true, saved });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/availability/my-status — статус моих заявок по периодам
app.get('/api/availability/my-status', authenticate, async (req, res) => {
  try {
    const photographerId = req.user.photographer_id;
    if (!photographerId) return res.json([]);
    const { rows: periods } = await db.query('SELECT * FROM availability_periods ORDER BY period_start DESC LIMIT 6');
    const result = [];
    for (const p of periods) {
      const { rows } = await db.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE status='available_full') as full_days,
                COUNT(*) FILTER (WHERE status='available_morning') as morning_days,
                COUNT(*) FILTER (WHERE status='available_evening') as evening_days,
                COUNT(*) FILTER (WHERE status='unavailable' OR status='day_off') as busy_days,
                MIN(submitted_at) as first_submitted,
                MAX(version) as max_version
         FROM availability WHERE photographer_id=$1 AND avail_date >= $2 AND avail_date <= $3`,
        [photographerId, p.period_start, p.period_end]
      );
      const st = rows[0];
      const isSubmitted = st.first_submitted != null;
      const onTime = isSubmitted && new Date(st.first_submitted) <= new Date(p.submit_deadline);
      result.push({
        period_id: p.id, period_start: p.period_start, period_end: p.period_end,
        submit_deadline: p.submit_deadline, period_status: p.status,
        submitted: isSubmitted, on_time: onTime, submitted_at: st.first_submitted,
        total_days: parseInt(st.total), full_days: parseInt(st.full_days),
        morning_days: parseInt(st.morning_days), evening_days: parseInt(st.evening_days),
        busy_days: parseInt(st.busy_days), corrections: parseInt(st.max_version || 1) - 1,
      });
    }
    res.json(result);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/availability/submissions — все заявки за период (HR)
app.get('/api/availability/submissions', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { period_id } = req.query;
    if (!period_id) return res.status(400).json({ error: 'period_id обязателен' });
    const { rows: period } = await db.query('SELECT * FROM availability_periods WHERE id=$1', [period_id]);
    if (!period.length) return res.status(404).json({ error: 'Период не найден' });
    const p = period[0];

    const { rows } = await db.query(`
      SELECT p.id, p.name, p.photo_url, p.rank, p.sales_score, p.pay_scheme, p.city,
             COUNT(a.id) as total_days,
             COUNT(*) FILTER (WHERE a.status='available_full') as full_days,
             COUNT(*) FILTER (WHERE a.status='available_morning') as morning_days,
             COUNT(*) FILTER (WHERE a.status='available_evening') as evening_days,
             COUNT(*) FILTER (WHERE a.status='unavailable' OR a.status='day_off') as busy_days,
             MIN(a.submitted_at) as submitted_at,
             MAX(a.version) as max_version,
             (MIN(a.submitted_at) IS NOT NULL AND MIN(a.submitted_at) <= $3) as on_time
      FROM photographers p
      LEFT JOIN availability a ON a.photographer_id=p.id AND a.avail_date >= $1 AND a.avail_date <= $2
      WHERE p.is_active=true AND p.hire_status='active'
        AND (p.employee_role='photographer' OR 'photographer'=ANY(p.employee_roles))
      GROUP BY p.id
      ORDER BY on_time DESC NULLS LAST, p.name
    `, [p.period_start, p.period_end, p.submit_deadline]);

    res.json({ period: p, submissions: rows });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// POST /api/availability/periods/:id/lock — закрыть период
app.post('/api/availability/periods/:id/lock', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE availability_periods SET status='locked' WHERE id=$1 RETURNING *`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Период не найден' });
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// ============================================================
// ROUTES: SCHEDULE SNAPSHOTS
// ============================================================

app.get('/api/schedule/snapshots', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { city } = req.query;
    let where = ''; const vals = [];
    if (city) { where = 'WHERE city=$1'; vals.push(city); }
    const { rows } = await db.query(
      `SELECT ss.*, u.name as created_by_name FROM schedule_snapshots ss LEFT JOIN users u ON u.id=ss.created_by ${where} ORDER BY ss.created_at DESC LIMIT 20`,
      vals
    );
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.post('/api/schedule/snapshots', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { period_start, period_end, city, action_description } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ error: 'period_start и period_end обязательны' });

    // Собрать текущее состояние назначений
    const { rows: assignments } = await db.query(`
      SELECT sa.*, e.event_date, e.venue_id, p.name as photographer_name
      FROM shift_assignments sa
      JOIN shifts s ON s.id=sa.shift_id
      JOIN events e ON e.id=s.event_id
      JOIN venues v ON v.id=e.venue_id
      JOIN photographers p ON p.id=sa.photographer_id
      WHERE e.event_date >= $1 AND e.event_date <= $2 AND sa.status!='cancelled'
        ${city ? 'AND v.city=$3' : ''}
      ORDER BY e.event_date, v.name
    `, city ? [period_start, period_end, city] : [period_start, period_end]);

    const { rows } = await db.query(
      `INSERT INTO schedule_snapshots (period_start, period_end, city, snapshot_data, action_description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [period_start, period_end, city || 'msk', JSON.stringify(assignments), action_description || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// ============================================================
// ROUTES: STAFFING CONFIG (настройки автораспределения)
// ============================================================

app.get('/api/staffing/config', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const city = req.query.city || 'msk';
    const { rows } = await db.query('SELECT * FROM staffing_config WHERE city=$1 ORDER BY config_key', [city]);
    const config = {};
    rows.forEach(r => { config[r.config_key] = r.config_value; });
    res.json(config);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

app.put('/api/staffing/config', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { city, config_key, config_value } = req.body;
    if (!config_key) return res.status(400).json({ error: 'config_key обязателен' });
    const { rows } = await db.query(
      `INSERT INTO staffing_config (city, config_key, config_value, updated_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (city, config_key) DO UPDATE SET config_value=$3, updated_by=$4, updated_at=NOW()
       RETURNING *`,
      [city || 'msk', config_key, JSON.stringify(config_value), req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// ============================================================
// ROUTES: SCHEDULE PUBLISH
// ============================================================

app.post('/api/schedule/publish', authenticate, requireRole('hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { period_start, period_end, city, notes } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ error: 'period_start и period_end обязательны' });

    // Сохранить снимок
    const { rows: snap } = await db.query(`
      SELECT sa.*, e.event_date, e.venue_id FROM shift_assignments sa
      JOIN shifts s ON s.id=sa.shift_id JOIN events e ON e.id=s.event_id JOIN venues v ON v.id=e.venue_id
      WHERE e.event_date >= $1 AND e.event_date <= $2 AND sa.status!='cancelled'
        ${city ? 'AND v.city=$3' : ''}
    `, city ? [period_start, period_end, city] : [period_start, period_end]);

    const { rows: ssRows } = await db.query(
      `INSERT INTO schedule_snapshots (period_start, period_end, city, snapshot_data, action_description, created_by)
       VALUES ($1,$2,$3,$4,'Публикация расписания',$5) RETURNING id`,
      [period_start, period_end, city || 'msk', JSON.stringify(snap), req.user.id]
    );

    // Подтвердить назначения
    await db.query(`
      UPDATE shift_assignments SET status='confirmed', confirmed_at=NOW()
      WHERE id IN (
        SELECT sa.id FROM shift_assignments sa
        JOIN shifts s ON s.id=sa.shift_id JOIN events e ON e.id=s.event_id JOIN venues v ON v.id=e.venue_id
        WHERE e.event_date >= $1 AND e.event_date <= $2 AND sa.status='assigned'
          ${city ? 'AND v.city=$3' : ''}
      )
    `, city ? [period_start, period_end, city] : [period_start, period_end]);

    // Лог публикации
    await db.query(
      `INSERT INTO schedule_publish_log (period_start, period_end, city, published_by, snapshot_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [period_start, period_end, city || 'msk', req.user.id, ssRows[0].id, notes || null]
    );

    res.json({ ok: true, snapshot_id: ssRows[0].id, confirmed: snap.length });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});

// GET /api/schedule/my-upcoming — мои ближайшие смены
app.get('/api/schedule/my-upcoming', authenticate, async (req, res) => {
  try {
    const photographerId = req.user.photographer_id;
    if (!photographerId) return res.json([]);
    const { rows } = await db.query(`
      SELECT e.event_date, e.event_start, e.staff_arrival, e.event_name,
             v.name as venue_name, v.address as venue_address,
             sa.role_in_shift, sa.status,
             (SELECT string_agg(p2.name, ', ') FROM shift_assignments sa2
              JOIN photographers p2 ON p2.id=sa2.photographer_id
              WHERE sa2.shift_id=sa.shift_id AND sa2.status!='cancelled' AND sa2.role_in_shift='admin'
             ) as admin_names,
             (SELECT string_agg(p2.name, ', ') FROM shift_assignments sa2
              JOIN photographers p2 ON p2.id=sa2.photographer_id
              WHERE sa2.shift_id=sa.shift_id AND sa2.status!='cancelled' AND sa2.role_in_shift='print_operator'
             ) as operator_names
      FROM shift_assignments sa
      JOIN shifts s ON s.id=sa.shift_id
      JOIN events e ON e.id=s.event_id
      JOIN venues v ON v.id=e.venue_id
      WHERE sa.photographer_id=$1 AND sa.status!='cancelled' AND e.event_date >= CURRENT_DATE
      ORDER BY e.event_date LIMIT 14
    `, [photographerId]);
    res.json(rows);
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});
```

**git commit + push.**

---

# ЭТАП 6: API — АВТОМАТИЧЕСКОЕ РАСПРЕДЕЛЕНИЕ

Добавить после блока publish:

```js
// ============================================================
// ROUTES: AUTO-ASSIGN (автоматическое распределение)
// ============================================================

app.post('/api/staffing/auto-assign', authenticate, requireRole('hr_manager', 'hr_director', 'exec_director', 'admin'), async (req, res) => {
  try {
    const { date_from, date_to, city, role, dry_run } = req.body;
    if (!date_from || !date_to) return res.status(400).json({ error: 'date_from и date_to обязательны' });
    const targetCity = city || 'msk';
    const targetRole = role || 'photographer';

    // 1. Загрузить конфиг
    const { rows: cfgRows } = await db.query('SELECT config_key, config_value FROM staffing_config WHERE city=$1', [targetCity]);
    const cfg = {};
    cfgRows.forEach(r => { cfg[r.config_key] = r.config_value; });
    const maxConsec = cfg.max_consecutive_days || { normal: 5, hard: 2, easy: 7 };
    const tierDefaults = cfg.tier_balance_defaults || { tier_a_pct: 40, tier_b_pct: 40, tier_c_pct: 20 };

    // 2. Загрузить мероприятия за период
    const { rows: events } = await db.query(`
      SELECT e.*, v.name as venue_name, v.city, v.priority_level, v.difficulty,
             COALESCE(e.required_photographers, v.required_photographers, 1) as need_photo,
             COALESCE(e.required_admins, v.required_admins, 1) as need_admin,
             COALESCE(e.required_operators, v.required_operators, 1) as need_ops,
             (SELECT array_agg(sa.photographer_id) FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id
              WHERE s.event_id=e.id AND sa.status!='cancelled') as already_assigned
      FROM events e JOIN venues v ON v.id=e.venue_id
      WHERE e.event_date >= $1 AND e.event_date <= $2 AND v.city=$3
      ORDER BY e.event_date, v.priority_level, v.name
    `, [date_from, date_to, targetCity]);

    // 3. Загрузить доступных сотрудников
    const roleField = targetRole === 'photographer' ? 'photographer' : targetRole;
    const { rows: staff } = await db.query(`
      SELECT p.id, p.name, p.rating_overall, p.sales_score, p.pay_scheme, p.grade, p.city,
             COALESCE(json_agg(
               json_build_object('date', a.avail_date, 'status', a.status)
             ) FILTER (WHERE a.avail_date IS NOT NULL), '[]') as availability,
             COALESCE(
               (SELECT json_agg(json_build_object('venue_id', pv.venue_id, 'attitude', pv.attitude))
                FROM photographer_venues pv WHERE pv.photographer_id=p.id
               ), '[]'
             ) as venue_prefs
      FROM photographers p
      LEFT JOIN availability a ON a.photographer_id=p.id AND a.avail_date >= $1 AND a.avail_date <= $2
      WHERE p.is_active=true AND p.hire_status='active' AND p.city=$3
        AND (p.employee_role=$4 OR $4=ANY(p.employee_roles))
      GROUP BY p.id
    `, [date_from, date_to, targetCity, roleField]);

    // 4. Классификация по tier
    const tier = (p) => {
      const r = parseFloat(p.rating_overall) || 0;
      const s = parseInt(p.sales_score) || 0;
      if (r >= 7 || s >= 7) return 'A';
      if (r >= 4) return 'B';
      return 'C';
    };
    staff.forEach(p => { p.tier = tier(p); });

    // 5. Распределение
    const assignments = [];
    const warnings = [];
    const unresolved = [];
    const assignedByDay = {}; // { photographer_id: [dates] }
    const assignedToday = {}; // { date: Set(photographer_ids) }

    // Подготовить структуры
    staff.forEach(p => { assignedByDay[p.id] = []; });

    // Сортировка мероприятий: сначала priority_level=1 (высокий)
    const sortedEvents = [...events].sort((a, b) => {
      if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
      return (a.priority_level || 2) - (b.priority_level || 2);
    });

    for (const ev of sortedEvents) {
      const dateStr = typeof ev.event_date === 'string' ? ev.event_date : ev.event_date.toISOString().split('T')[0];
      if (!assignedToday[dateStr]) assignedToday[dateStr] = new Set();
      const alreadySet = new Set(ev.already_assigned || []);

      const needField = targetRole === 'photographer' ? 'need_photo' : targetRole === 'print_operator' ? 'need_ops' : 'need_admin';
      const totalNeed = parseInt(ev[needField]) || 1;
      const currentCount = alreadySet.size;
      let remaining = totalNeed - currentCount;
      if (remaining <= 0) continue;

      // Кандидаты на эту дату + площадку
      const candidates = staff.filter(p => {
        if (assignedToday[dateStr].has(p.id)) return false;
        if (alreadySet.has(p.id)) return false;
        // Проверить доступность
        const avail = (p.availability || []).find(a => {
          const ad = typeof a.date === 'string' ? a.date : a.date?.toISOString?.()?.split('T')?.[0];
          return ad === dateStr;
        });
        if (!avail) return p.pay_scheme === 'premium'; // premium всегда доступны если нет day_off
        return ['available_full', 'available_morning', 'available_evening'].includes(avail.status);
      });

      // Скоринг
      const scored = candidates.map(p => {
        const prefs = Array.isArray(p.venue_prefs) ? p.venue_prefs : [];
        const vp = prefs.find(vp => vp.venue_id === ev.venue_id);
        let score = (parseFloat(p.rating_overall) || 5) * 10;
        if (vp?.attitude === 'loves') score += 20;
        if (vp?.attitude === 'dislikes') score -= 50;
        // Проверка consecutive days
        const days = assignedByDay[p.id] || [];
        const yesterday = new Date(new Date(dateStr).getTime() - 86400000).toISOString().split('T')[0];
        if (days.includes(yesterday)) score -= 15;
        // Меньше смен за период → приоритет
        if (days.length < 3) score += 10;
        return { ...p, score, isDislike: vp?.attitude === 'dislikes' };
      });

      scored.sort((a, b) => b.score - a.score);

      for (const cand of scored) {
        if (remaining <= 0) break;
        // Проверка max consecutive
        const diff = ev.difficulty || 'normal';
        const maxDays = maxConsec[diff] || 5;
        const days = assignedByDay[cand.id] || [];
        let consecutive = 0;
        let checkDate = new Date(dateStr);
        for (let d = 1; d <= maxDays; d++) {
          checkDate.setDate(checkDate.getDate() - 1);
          if (days.includes(checkDate.toISOString().split('T')[0])) consecutive++;
          else break;
        }
        if (consecutive >= maxDays) {
          warnings.push({
            text: `${cand.name}: ${consecutive} дней подряд, пропускаем ${ev.venue_name} ${dateStr}`,
            event_id: ev.id, photographer_id: cand.id, severity: 'info'
          });
          continue;
        }

        assignments.push({
          event_id: ev.id, photographer_id: cand.id, venue_name: ev.venue_name,
          date: dateStr, photographer_name: cand.name, tier: cand.tier,
          reason: cand.isDislike ? 'dislikes_but_needed' : 'auto'
        });

        if (cand.isDislike) {
          warnings.push({
            text: `${cand.name} не любит ${ev.venue_name}, но свободных сильных нет. Рекомендация: предупредить.`,
            event_id: ev.id, photographer_id: cand.id, severity: 'warning'
          });
        }

        assignedToday[dateStr].add(cand.id);
        if (!assignedByDay[cand.id]) assignedByDay[cand.id] = [];
        assignedByDay[cand.id].push(dateStr);
        remaining--;
      }

      if (remaining > 0) {
        unresolved.push({ event_id: ev.id, venue_name: ev.venue_name, date: dateStr, role: targetRole, missing: remaining });
      }
    }

    if (dry_run !== false) {
      return res.json({ dry_run: true, assignments, warnings, unresolved,
        stats: { total_assigned: assignments.length, total_warnings: warnings.length, total_unresolved: unresolved.length }
      });
    }

    // Применить
    // Сначала сохранить snapshot
    const snapData = assignments.map(a => ({ event_id: a.event_id, photographer_id: a.photographer_id }));
    const { rows: ssRows } = await db.query(
      `INSERT INTO schedule_snapshots (period_start, period_end, city, snapshot_data, action_description, created_by)
       VALUES ($1,$2,$3,$4,'Автораспределение',$5) RETURNING id`,
      [date_from, date_to, targetCity, JSON.stringify(snapData), req.user.id]
    );

    let applied = 0;
    for (const a of assignments) {
      // Найти shift
      const { rows: shifts } = await db.query('SELECT id FROM shifts WHERE event_id=$1 LIMIT 1', [a.event_id]);
      if (!shifts.length) continue;
      try {
        await db.query(
          `INSERT INTO shift_assignments (shift_id, photographer_id, role_in_shift, assignment_type, assigned_by)
           VALUES ($1,$2,$3,'auto',$4)`,
          [shifts[0].id, a.photographer_id, targetRole, req.user.id]
        );
        applied++;
      } catch { /* skip duplicates */ }
    }

    res.json({ dry_run: false, applied, snapshot_id: ssRows[0].id, warnings, unresolved });
  } catch (e) { logger.error(e.message); res.status(500).json({ error: 'Ошибка сервера: ' + e.message }); }
});
```

**git commit + push.**

---

# ЭТАП 7: ФРОНТЕНД — schedule.html

Создать новый файл `schedule.html` в `photohr-frontend/`.

Это большая страница с 4 вкладками. Скопируй структуру из любой существующей страницы (например stock.html) для шаблона:
- Те же CSS переменные, шрифты, навигация, auth-логика, api() функция
- Добавить в навигацию на ВСЕХ 9 существующих HTML страницах новую ссылку "Расписание" (schedule.html) — между "Календарь" и "Чекин", видна для ролей hr_manager, hr_director, exec_director, admin

**Структура schedule.html:**

Табы: `📅 Площадки` | `📋 Заявки` | `🧩 Расстановка` | `📊 Обзор`

**Вкладка 1: Расписание площадок**
- Верхняя панель: выбор города [МСК ▼ | СПБ], навигация месяца [◀ Апрель 2026 ▶], кнопки [Импорт Excel] [+ Создать]
- Левая часть (70%): календарь-месяц как сетка 7 колонок. В каждой ячейке дня:
  - Номер дня, если праздник → бейдж "🎄"
  - Карточки мероприятий (сокращённое имя площадки, цвет по категории)
  - Контекстное меню на карточке: Перенести, Дублировать, Удалить
  - Drop-зона для drag-and-drop
- Правая часть (30%): список площадок по городу, сгруппированных по категории
  - Каждая площадка — draggable элемент
  - Кнопка [☰] — открывает мультиселектор дат
  - Строка поиска сверху
- Drag-and-drop: HTML5 native (draggable="true", ondragstart/ondragover/ondrop)
- При drop: модалка подтверждения с временами из venues (по day_type)
- Модалка мультиселектора: таблица дат месяца, чекбоксы, кнопка "Создать N мероприятий"
- Клик на дату в хедере → можно пометить как праздник (overlay → POST /api/calendar-overrides)

**Вкладка 2: Заявки сотрудников**
- Управление периодами: список последних периодов, кнопка [Открыть новый период], кнопка [Закрыть приём]
- При открытии периода → модалка с period_start, period_end, submit_deadline
- Таблица заявок (GET /api/availability/submissions):
  - Столбцы: Фотограф, Подана, Своб.дней, Полных, Утро, Вечер, Статус
  - Цвета строк: 🟢 вовремя, 🟡 просрочено, 🔴 не подана, ⭐ premium
  - Клик на строку → детальный просмотр календаря фотографа (его availability по дням)

**Вкладка 3: Составление расписания (тетрис)**
- Верхняя панель: город, период, кнопки [🤖 Авто], [💾 Снимок], [⏪ Откатить], [✅ Опубликовать]
- Сетка: строки = площадки (с городом), столбцы = дни периода
  - В каждой ячейке: имена назначенных, цвет укомплектованности:
    🔴 < staffing_min, 🟡 ≥ min < required, 🟢 = required, 🔵 > required ≤ max, 🩷 > max
  - Drop-зона для drag-and-drop фотографов
- Под сеткой: пул свободных (по ролям: 📸 Фотографы, 🖨️ Операторы, 👔 Менеджеры)
  - Каждый — draggable, с бейджем tier (🥇/🥈/🥉)
  - Подсвечиваются зелёным те, кто доступен на выбранный день
- При клике на ячейку → popup: назначенные, кнопка снять, добавить вручную
- Кнопка [🤖 Авто] → POST /api/staffing/auto-assign (dry_run:true) → модалка с результатом:
  - Список предупреждений с кнопками [Принять ✅] [Исправить ✏️]
  - Кнопки [Применить все] [Отменить]
  - При применении → POST /api/staffing/auto-assign (dry_run:false)

**Вкладка 4: Обзор**
- Загрузка по площадкам за месяц (прогресс-бары)
- Загрузка по фотографам (кто сколько смен)
- История снимков (GET /api/schedule/snapshots)

**Дизайн:**
- Следовать существующему стилю: тёмная тема, CSS переменные, Unbounded + Golos Text
- Новые цвета для расписания:
```css
--sched-free:#3ecf8e; --sched-busy:#f25555; --sched-maybe:#f5a623;
--sched-morning:#6aa6e8; --sched-evening:#9b8dff;
--staff-critical:#f25555; --staff-warning:#f5a623; --staff-ok:#3ecf8e;
--staff-over:#6aa6e8; --staff-excess:#e86aa6;
```

**Мобильная адаптация:** @media(max-width:768px) — вкладки горизонтально скроллятся, сетка горизонтально скроллится, пул фотографов — выдвижная панель снизу.

**git commit + push.**

---

# ЭТАП 8: ФРОНТЕНД — my.html (блок расписания фотографа)

Добавить новую вкладку "📅 Расписание" в my.html. Вкладка видна всем photographer_user.

**Содержимое вкладки:**

1. **Активный период подачи заявок** (если есть открытый)
   - Показать: период, дедлайн, статус (не подана / подана / скорректирована)
   - Календарь месяца с интерактивными ячейками (только дни периода активны)
   - Под календарём: слоты-кнопки для drag-and-drop:
     [🟢 Свободен] [🔴 Занят] [❓ Под вопросом] [🌅 Утро] [🌆 Вечер]
   - При выборе Утро/Вечер → popup с полями "с __:__ по __:__"
   - Кнопки: [Отправить заявку] [Скорректировать] (если уже подана)
   - Для premium: упрощённый вид — "Выберите 2 выходных дня", остальные рабочие

2. **Моё подтверждённое расписание** (GET /api/schedule/my-upcoming)
   - Список ближайших смен: дата, площадка, время сбора, менеджер, оператор
   - Завтрашняя смена — выделена жёлтой рамкой
   - Если нет смен — "Расписание ещё не опубликовано"

3. **Пожелания по площадкам**
   - Текущие: ❤️ Люблю (список), ✓ Могу (список), ✕ Не люблю (список, макс 3)
   - Кнопка [Редактировать] → открывает список площадок с кнопками loves/can/dislikes
   - При попытке отметить >3 dislikes → toast "Максимум 3 площадки"

Данные:
- Заявки: GET /api/availability/my-status, POST /api/availability (существующий), POST /api/availability/submit, POST /api/availability/correct
- Смены: GET /api/schedule/my-upcoming
- Площадки: GET /api/venues + PATCH photographer_venues (существующий)

**git commit + push.**

---

# ЭТАП 9: НАВИГАЦИЯ + MASTER_CONTEXT

1. **Добавить ссылку на schedule.html** во ВСЕХ 9 HTML файлах в функцию setupNav():
   - Между "Календарь" и "Чекин"
   - Видна для: hr_manager, hr_director, exec_director, admin
   - Текст: "Расписание"
   - Код: `if(hasAnyRole(['hr_manager','hr_director','exec_director','admin'])) navBtns.push(a('schedule','schedule.html','Расписание'));`

2. **Обновить MASTER_CONTEXT.md** в обоих репо:
   - Добавить в "РЕАЛИЗОВАННЫЕ МОДУЛИ":
     ```
     - ✅ Расписание: schedule.html, грейды, заявки, автораспределение, публикация
     ```
   - Обновить цифры: строки index.js, количество эндпоинтов, 10 HTML страниц
   - Убрать "Расписание" из следующих задач если было

**git commit + push.**

---

# ПРОВЕРОЧНЫЙ ЧЕКЛИСТ

После всех этапов проверь:

- [ ] `index.js` запускается без ошибок (`node index.js`)
- [ ] Все новые таблицы созданы (проверить через railway)
- [ ] grade_definitions содержит 9 seed-записей
- [ ] GET /api/grade-definitions возвращает грейды
- [ ] GET /api/pay-supplements возвращает надбавки
- [ ] GET /api/monthly-bonus-rules возвращает правила
- [ ] POST /api/events/bulk-create с preview=true возвращает preview
- [ ] POST /api/events/bulk-create без preview создаёт мероприятия + shifts
- [ ] GET /api/events/calendar-data возвращает данные за месяц
- [ ] GET /api/availability/submissions возвращает заявки
- [ ] POST /api/staffing/auto-assign с dry_run=true возвращает результат
- [ ] schedule.html открывается, табы переключаются
- [ ] Drag-and-drop площадок на календарь работает
- [ ] my.html показывает вкладку "Расписание"
- [ ] Навигация на всех 10 страницах содержит ссылку "Расписание"
