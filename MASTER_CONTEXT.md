# PhotoHR — MASTER CONTEXT
# Обновлено: 02.04.2026

## КРИТИЧЕСКИЕ ПРАВИЛА (читать первым)
- Бэкенд: модульная структура. `index.js` — точка входа (~250 строк). Роуты в `routes/`, хелперы в `helpers/`.
- Новые эндпоинты — добавлять в существующий файл `routes/` или создавать новый.
- Новые хелперы — в `helpers/`.
- Фронтенд: Vanilla JS, один HTML = одна страница, JS/CSS инлайн.
- В catch-блоках: `logger.error(e.message)` + `res.status(500).json({ error: 'Ошибка сервера: ' + e.message })`.
- Новые DB-поля: только `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Важные действия журналировать через `audit(...)`.
- Все защищенные API — через `authenticate`; доступ — через `requireRole(...)`/спец middleware.

## О ПРОЕКТЕ
PhotoHR — HR/операционная система LikeMe Studio для фотографов-продавцов и аквагримеров на площадках Москвы/СПБ: найм, графики, смены, чекины, отчеты, склад, зарплаты, рекрутинг и аналитика.

## ДЕПЛОЙ
- Backend: Railway — https://fotohr-server-production.up.railway.app
- Frontend: GitHub Pages — https://likemestudio.github.io/photohr-frontend/
- Git: `git add` конкретных файлов → `git commit` → `git pull --rebase origin main` → `git push origin main`
- НЕ использовать `git add -A`

## СТЕК
- Backend: Node.js, Express, PostgreSQL, JWT, bcrypt, multer, sharp, ExcelJS.
- Frontend: Vanilla JS + HTML (без фреймворков), общая auth-модель через `localStorage`.

## АРХИТЕКТУРА БЭКЕНДА (после модуляризации 02.04.2026)

### Структура файлов
```
backend/
├── index.js                (~248 строк — точка входа)
├── helpers/                (13 файлов)
│   ├── db.js               — Pool, db.query, db.getClient
│   ├── logger.js           — winston
│   ├── crypto.js           — encrypt/decrypt (AES-256-GCM)
│   ├── constants.js        — VALID_ROLES, ROLE_LEVELS, LIKES_*, AQ_ROLES
│   ├── auth.js             — authenticate, requireRole, requireRecruiting, hasRole
│   ├── audit.js            — audit(), logShiftAssignmentHistory()
│   ├── bonus-calc.js       — calcBonus, computeV2PayrollSnapshot (~250 строк)
│   ├── telegram.js         — alertAdmin, alertTechDirector
│   ├── email.js            — sendEmail, sendVerificationEmail, ...
│   ├── brute-force.js      — failedLogins, checkBruteForce, ...
│   ├── sanitize.js         — sanitizeStr, sanitizeBody
│   ├── uploads.js          — UPLOADS_DIR, UPLOADS_BASE, PASSPORT_DIR, RECEIPT_DIR
│   └── shifts.js           — createShiftsFromConfig
├── routes/                 (24 файла)
│   ├── auth.js             — фабрика({registerLimiter, authLimiter, rateLimitStore})
│   ├── users.js            — CRUD, approve, link, archived
│   ├── venues.js           — venues CRUD, dashboard
│   ├── events.js           — events + shifts + shift-assignments
│   ├── products.js         — products, venue_products, active-scheme
│   ├── reports.js          — daily_reports lifecycle, review
│   ├── checkins.js         — фабрика({upload}), QR, geo, penalties
│   ├── team.js             — фабрика({upload}), team_members
│   ├── photographers.js    — фабрика({upload, exportLimiter}), photo, passport, comments
│   ├── telegram.js         — фабрика({failedLogins, rateLimitStore}), возвращает {router, registerTelegramWebhook}
│   ├── payroll.js          — payroll_entries, payouts, pay-rates
│   ├── bonus.js            — bonus-rules, bonus-awards, bonus-schemes
│   ├── availability.js     — availability, periods, propose-change, history
│   ├── sales.js            — sales_plans, sales_history, audit_log
│   ├── stock.js            — warehouses, items, transfers, inventory, equipment (~1560 строк)
│   ├── mentorships.js      — mentorships, bonuses
│   ├── social.js           — peer_reviews, peer_likes
│   ├── trainings.js        — trainings, attendees
│   ├── achievements.js     — achievement_types, leaderboard, auto-check
│   ├── recruiting.js       — stages, candidates, kanban, analytics
│   ├── aquagrim.js         — фабрика({upload}), aq staff + cycle
│   ├── schedule.js         — extended events, overview, snapshots, publish, auto-assign
│   ├── grades.js           — grade_definitions, pay_supplements, monthly_bonus_rules, calendar_overrides
│   └── my.js               — /my/stats, /my/upcoming-shifts, birthdays
├── migrations/
│   └── auto.js             — автомиграции БД (~780 строк)
└── package.json
```

### Порядок монтирования роутеров в index.js
1. auth → 2. users → 3. venues → 4. events → 5. products → 6. reports → 7. checkins → 8. photographers → 9. team → 10. telegram → 11. payroll → 12. bonus → 13. availability → 14. sales → 15. stock → 16. mentorships → 17. social → 18. trainings → 19. achievements → 20. recruiting → 21. aquagrim → 22. grades → 23. schedule → 24. my

### Правила добавления нового кода
- Новый эндпоинт → в существующий `routes/xxx.js` или новый файл `routes/new-feature.js`
- Новый helper → в `helpers/`
- В routes: `router.get(...)`, пути без `/api`, require через `../helpers/`
- В helpers: require через `./`
- Фабрики используются когда роуту нужен `upload` (multer), `rateLimitStore` или лимитеры из index.js
- Новый роутер → добавить `app.use('/api', newRouter)` в index.js, соблюдая порядок (конкретные пути до параметрических)

## РОЛЕВАЯ МОДЕЛЬ (12+ ролей)
- `photographer_user` (0), `aq_user` (0), `viewer` (0), `print_operator` (0)
- `venue_admin` (1), `manager` (1), `stock_manager` (1), `recruiter` (1)
- `controller` (2), `editor` (2), `hr_director` (2)
- `admin` (3/4), `exec_director` (3)
- Спецроли: `hr_manager`, `cashier`, `tech_director`, `site_specialist`, `aq_manager`

## СХЕМА БД (ключевые таблицы, ~79)
- `users`, `refresh_tokens`, `photographers`, `aquagrimers`
- `venues`, `events`, `shifts`, `shift_assignments`, `checkins`
- `daily_reports`, `sale_lines`, `payroll_entries`, `payouts`
- `availability`, `availability_periods`, `availability_history`
- `warehouses`, `inventory_items`, `stock_balances`, `stock_movements`, `equipment_units`
- `recruiting_stages`, `candidates`, `candidate_stage_log`
- `grade_definitions`, `grade_history`, `grade_check_results`
- `bonus_rules`, `bonus_awards`, `bonus_schemes`, `venue_bonus_config`
- `comments`, `audit_log`, `telegram_subscriptions`
- `mentorships`, `peer_reviews`, `trainings`, `achievement_types`, `achievements`

## РЕАЛИЗОВАННЫЕ МОДУЛИ (✅)
- Auth: login/register/google/refresh/logout/verify/reset
- Users + approvals + link photographer
- Photographers + team + comments + photo upload/export
- Aquagrim staff + events + shifts + reports + payroll
- Venues/products/pay-rates + bonus schemes v1/v2
- Events/shifts/assignments/staffing-needs
- Schedule v2: 5 вкладок (Площадки, Заявки, Расстановка, Обзор, Аналитика)
- Checkin QR + гео + штрафы
- Daily reports lifecycle + бонусы + автосписание расходников
- Payroll + payouts + dashboard + premium/adjustments
- Stock: 9 вкладок, закупки, перемещения, инвентаризация, аналитика
- Mentorships + peer reviews + peer likes
- Trainings + attendees
- Achievements + leaderboard + auto-check
- Recruiting kanban + analytics
- Telegram subscriptions + webhook
- admin.html: глобальная аналитика, сравнение месяцев

## СТРАНИЦЫ ФРОНТЕНДА
- `index.html` (660) — login + redirect
- `admin.html` (2595) — управление (iframe-модалка)
- `schedule.html` (3085) — расписание v2
- `stock.html` (2568) — склад
- `venue.html` (2682) — интерфейс площадки
- `team.html` (2107) — команда
- `aquagrim.html` (1363) — аквагрим
- `my.html` (1048) — ЛК сотрудника
- `checkin.html` (510) — QR-сканер
- `recruiting.html` (1387) — канбан рекрутинга
- `calendar.html` (620) — архивная

## МЕТРИКИ КОДА (02.04.2026)
- `index.js`: 248 строк (точка входа)
- `helpers/`: 13 файлов
- `routes/`: 24 файла, 327 HTTP-маршрутов
- Схема БД: ~79 таблиц

## СЛЕДУЮЩИЕ ЗАДАЧИ (бэклог)
1. UI review отчётов (approve/reject flow)
2. Детальный payroll при проведении отчёта
3. Digital Sales (цифровые продажи фотографов)
4. Live Shift Management (управление сменой в реальном времени)
5. Грейды UI (БД готова)
6. Excel-экспорт
7. Анонимный фидбек
8. Telegram расширение
9. AR «живые фото»
