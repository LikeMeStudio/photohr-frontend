# PhotoHR — MASTER CONTEXT
# Обновлено: 27.03.2026

## Бэкенд
- Файл: `backend/index.js`, 14167 строк, 293 эндпоинта (`app.get/post/patch/put/delete`).
- Последние изменения (shifts v2, Этап A):
  - добавлены поля `venues.default_shifts*` и `shifts.target_role/shift_name/required_count`;
  - добавлен helper `createShiftsFromConfig(client, event, venue)`;
  - обновлено создание смен в `POST /api/events`, `POST /api/events/bulk`;
  - новые API: `POST /api/events/:event_id/shifts`, `PATCH /api/shifts/:id`, `DELETE /api/shifts/:id`;
  - `GET /api/events/:id/staffing-needs` переведен на расчет по сменам.
- Таблицы БД (по миграциям в `index.js`):
  - auto-create: `purchase_orders`, `purchase_order_lines`, `stock_transfer_requests`, `stock_transfer_lines`, `inventory_sessions`, `inventory_session_lines`, `printer_counter_logs`, `peer_likes`, `team_members`, `bonus_schemes`, `venue_bonus_config`, `calendar_day_overrides`, `pay_scheme_history`, `grade_definitions`, `grade_history`, `grade_check_results`, `schedule_snapshots`, `schedule_change_log`, `availability_history`, `monthly_bonus_rules`, `staffing_config`, `pay_supplements`, `schedule_publish_log`;
  - altered in migrations: `inventory_items`, `warehouses`, `stock_balances`, `equipment_units`, `users`, `achievements`, `comments`, `venue_products`, `sale_lines`, `daily_reports`, `photographers`, `checkins`, `venues`, `events`, `shifts`, `availability`, `shift_assignments`.

## Фронтенд
- Страницы (10) и текущие размеры по строкам:
  - `index.html` — 4402
  - `venue.html` — 2263
  - `team.html` — 2062
  - `recruiting.html` — 1362
  - `stock.html` — 1324
  - `aquagrim.html` — 1285
  - `schedule.html` — 667
  - `calendar.html` — 620
  - `checkin.html` — 346
  - `my.html` — 314
- `schedule.html` есть. Структура:
  - вкладки: `📅 Площадки`, `📋 Заявки`, `🧩 Расстановка`, `📊 Обзор`;
  - ключевые функции: `loadTab0`, `openSingleCreate`, `openBulkForVenue`, `doBulkCreateAction`, `confirmSchedulePeriod`;
  - ключевые API: `/events/calendar-data`, `/events/bulk-create`, `/events/confirm-schedule`, `/availability/*`, `/staffing/auto-assign`, `/schedule/snapshots`, `/schedule/publish`.
- Что затронуто shifts v2:
  - затронут backend;
  - `calendar.html` shifts v2 изменения откатаны (commit `063c8ef`);
  - `schedule.html` shifts v2 в этом шаге не реализован.

## Текущий статус задач
- ✅ Этап A: shifts v2 БД + API
- ❌ Этап B+C: фронтенд schedule.html (НЕ СДЕЛАН)
- [ ] Следующий шаг: реализовать shifts v2 во `frontend/schedule.html` (рендер и управление сменами по ролям/названиям/required_count).
