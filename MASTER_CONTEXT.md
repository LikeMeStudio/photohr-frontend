# PhotoHR — MASTER CONTEXT
# Обновлено: 27.03.2026

## КРИТИЧЕСКИЕ ПРАВИЛА (читать первым)
- Бэкенд: один файл `backend/index.js`, не дробить на модули.
- Фронтенд: Vanilla JS, один HTML = одна страница, JS/CSS инлайн.
- В backend `catch`-блоки в едином стиле: `logger.error(e.message)` + `res.status(500).json({ error: 'Ошибка сервера: ' + e.message })`.
- Новые DB-поля: только `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Важные действия журналировать через `audit(...)`.
- Все защищенные API - через `authenticate`; доступ - через `requireRole(...)`/спец middleware.

## О ПРОЕКТЕ
PhotoHR - HR/операционная система LikeMe Studio для фотографов-продавцов и аквагримеров на площадках Москвы/СПБ: найм, графики, смены, чекины, отчеты, склад, зарплаты, рекрутинг и аналитика.

## ДЕПЛОЙ
- Backend: Railway - https://fotohr-server-production.up.railway.app
- Frontend: GitHub Pages - https://likemestudio.github.io/photohr-frontend/
- Типовой цикл обновления: `git add -A && git commit -m "..." && git push origin main`

## СТЕК
- Backend: Node.js, Express, PostgreSQL, JWT, bcrypt, multer, sharp, ExcelJS.
- Frontend: Vanilla JS + HTML (без фреймворков), общая auth-модель через `localStorage`.

## РОЛЕВАЯ МОДЕЛЬ (12 базовых ролей)
- `photographer_user` - ЛК фотографа.
- `viewer` - линейный менеджер (чтение).
- `print_operator` - оператор печати.
- `venue_admin` - админ площадки.
- `manager` - менеджер.
- `stock_manager` - складской менеджер.
- `recruiter` - внешний рекрутер.
- `controller` - контролер.
- `editor` - редактор карточек.
- `hr_director` - HR + расширенные данные.
- `admin` - полный доступ.
- `exec_director` - расширенный управленческий доступ.

Дополнительно в коде есть спецроли: `hr_manager`, `cashier`, `tech_director`, `site_specialist`, `aq_manager`, `aq_user`.

## СХЕМА БАЗЫ ДАННЫХ (ключевые таблицы)
- `users` - учетные записи и роли.
- `refresh_tokens` - refresh-сессии.
- `photographers` - карточки сотрудников-фотографов.
- `aquagrimers` - карточки аквагримеров.
- `venues` - площадки и параметры работы.
- `events` - мероприятия по датам.
- `shifts` - смены внутри мероприятий.
- `shift_assignments` - назначения сотрудников на смены.
- `checkins` - факт чекина/опозданий.
- `daily_reports` - отчеты смен.
- `sale_lines` - продажи в отчетах.
- `payroll_entries`/`payouts` - начисления и выплаты.
- `availability`/`availability_periods` - доступность сотрудников.
- `warehouses`/`inventory_items`/`stock_balances`/`stock_movements` - складской контур.
- `recruiting_stages`/`candidates` - рекрутинг-воронка.
- `comments`/`audit_log` - комментарии и аудит.

## РЕАЛИЗОВАННЫЕ МОДУЛИ (✅)
- Auth: login/register/google/refresh/logout/verify/reset.
- Users + approvals + link photographer.
- Photographers + team + comments + photo upload/export.
- Aquagrim staff + events + shifts + reports + payroll.
- Venues/products/pay-rates.
- Events/shifts/assignments/staffing-needs.
- **Расписание** (`schedule.html`): вкладки «Площадки» (календарь, drag-and-drop мероприятий, ⚙️ настройки `default_shifts`/времён/штатов площадки), «Заявки» (периоды доступности), «Расстановка» (сетка по дням, пул сотрудников, автораспределение, снимки/публикация), «Обзор» (дашборд `GET /api/schedule/overview`, прогресс по площадкам, фотографы, проблемы, история снимков).
- Checkin QR + гео + штрафы/отмена штрафов.
- Daily reports lifecycle + расчеты бонусов.
- Payroll + payouts + dashboard + premium/adjustments.
- Sales history + sales plans.
- Warehouse/stock: закупки, перемещения, инвентаризации, дефицит, аналитика.
- Mentorships + peer reviews + peer likes.
- Trainings + attendees + report.
- Achievements + leaderboard + auto-check.
- Recruiting kanban + stage management + analytics.
- Telegram subscriptions + webhook.

## СТРАНИЦЫ ФРОНТЕНДА
- `index.html` (4402) - сотрудники, авторизация, админский UI.
- `recruiting.html` (1362) - канбан рекрутинга.
- `venue.html` (2263) - интерфейс площадки, отчетность/операционка.
- `calendar.html` (620) - календарная сетка мероприятий.
- `schedule.html` (~1480) - расписание: площадки, заявки, расстановка, обзор.
- `stock.html` (1324) - склад.
- `team.html` (2062) - командный модуль.
- `aquagrim.html` (1285) - аквагрим-направление.
- `my.html` (~540) - ЛК сотрудника.
- `checkin.html` (346) - мобильный QR-чекин.

## API ЭНДПОИНТЫ (ключевые группы)
- `/api/auth/*`, `/api/users*`.
- `/api/photographers*`, `/api/team*`, `/api/comments*`.
- `/api/aq/*` (аквагрим контур).
- `/api/venues*`, `/api/products*`, `/api/venues/:id/products`, `/api/venues/:id/pay-rates`.
- `/api/events*`, `/api/shifts*`, `/api/shift-assignments*`, `/api/staffing/*`, `/api/schedule/overview`, `/api/schedule/snapshots`, `/api/schedule/publish`.
- `/api/checkins*`, `/api/my-shifts`.
- `/api/daily-reports*`, `/api/sale-lines*`.
- `/api/payroll*`, `/api/payouts*`, `/api/bonus-rules*`, `/api/bonus-awards*`.
- `/api/availability*`, `/api/sales-plans*`.
- `/api/warehouses*`, `/api/stock*`, `/api/inventory-*`, `/api/purchase-orders*`, `/api/stock-transfers*`.
- `/api/recruiting/*`, `/api/candidates*`, `/api/audit`, `/api/telegram/*`, `/api/tg-webhook`.

## ТЕКУЩИЙ СТАТУС ЗАДАЧ
- ✅ База и API крупными блоками реализованы (~300 HTTP-маршрутов в `backend/index.js`).
- ✅ Фронтенд расширен до 10 страниц.
- 🔄 Идет поддержка/стабилизация schedule/recruiting/stock модулей.
- 🔄 Нужна регулярная синхронизация контекста после больших изменений.

## СЛЕДУЮЩИЕ ЗАДАЧИ (приоритет)
- Закрыть интеграционный E2E-сценарий: событие -> назначение -> чекин -> отчет -> начисление.
- Точечные UX-улучшения мобильной версии страниц.
- Доработка аналитических дашбордов и экспортных сценариев.
- Уточнение/документирование SLA по рекрутингу и операционным метрикам.

## КАК ОБНОВЛЯТЬ ЭТОТ ФАЙЛ
1. После крупной задачи пересчитать факты из кода (`index.js` строки/эндпоинты, HTML количество).
2. Обновлять только актуальное состояние, без архивных ТЗ.
3. Держать `backend/MASTER_CONTEXT.md` и `frontend/MASTER_CONTEXT.md` идентичными.
4. Устаревшие описания переносить в `archive/`, не удалять.
