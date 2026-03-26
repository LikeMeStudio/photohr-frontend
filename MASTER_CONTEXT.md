# PhotoHR — MASTER CONTEXT
# Последнее обновление: 26.03.2026
# Единственный источник правды. Обновляй после каждой значимой задачи.

---

## КРИТИЧЕСКИЕ ПРАВИЛА (ЧИТАЙ ПЕРВЫМ)

1. НЕ рефакторить существующий код. Только расширять.
2. НЕ использовать React/Vue/Angular. Только Vanilla JS.
3. НЕ выносить JS/CSS в отдельные файлы. Один HTML = одна страница, всё инлайн.
4. НЕ разбивать backend/index.js на модули. Один файл (~12 480 строк).
5. НЕ менять существующую ролевую модель без явного указания.
6. НЕ менять названия таблиц и API-пути существующих эндпоинтов.
7. Все изменения через str_replace конкретных блоков, НЕ переписывать файлы целиком.
8. Все пользовательские данные в innerHTML — через esc().
9. SQL — только параметризованные запросы, никакой строковой интерполяции.

---

## ПРОЦЕСС РАЗРАБОТКИ

Разработка идёт через Cursor. Claude (внешний ассистент) проектирует
архитектуру и формулирует задачи — Cursor их выполняет.

1. Пользователь описывает задачу Claude
2. Claude формулирует ТЗ для Cursor
3. Cursor выполняет, коммитит, пушит
4. Пользователь скидывает результат Claude
5. Claude проверяет и формулирует следующий шаг

---

## О ПРОЕКТЕ

PhotoHR — внутренняя HR-система для LikeMe Studio.
Три блока:
- Фото-блок — фотографы, операторы печати, менеджеры, наставники (index.html)
- Аквагрим-блок — аквагримёры и менеджеры аквагрима (aquagrim.html)
- Управленческая команда — HR, директора, тех-специалисты (team.html)

---

## ДЕПЛОЙ

| Что       | URL                                              | Репо                          | Деплой                        |
|-----------|--------------------------------------------------|-------------------------------|-------------------------------|
| Бэкенд    | https://fotohr-server-production.up.railway.app  | LikeMeStudio/fotohr-server    | Railway, автодеплой при push  |
| Фронтенд  | https://likemestudio.github.io/photohr-frontend/ | LikeMeStudio/photohr-frontend | GitHub Pages, автодеплой      |
| БД        | PostgreSQL на Railway                            | —                             | Частичная автомиграция        |

```bash
# Фронтенд
cd frontend && git add -A && git commit -m "описание" && git push origin main
# Бэкенд
cd backend && git add -A && git commit -m "описание" && git push origin main
```

БД: основная схема в backend/schema.sql. При старте сервера автоматически
создаются только 4 таблицы: peer_likes, team_members, bonus_schemes,
venue_bonus_config. Остальное — уже в продакшен-БД.
Миграции выполнять через: railway connect Postgres

---

## СТЕК

Backend: Node.js, Express, PostgreSQL (pool), JWT, bcrypt, multer, sharp,
         ExcelJS (lazy require в export), helmet, cors, compression,
         express-rate-limit, winston, uuid, crypto (AES-256-GCM)
Frontend: Vanilla JS, 9 HTML файлов, auth через localStorage
Логгер: winston (не console)
Шифрование: encrypt/decrypt — AES-256-GCM, только паспортные данные

---

## СТРАНИЦЫ ФРОНТЕНДА (9 HTML файлов)

| Файл           | Раздел                        | Размер   |
|----------------|-------------------------------|----------|
| index.html     | Фотографы                     | ~242 KB  |
| venue.html     | Площадка (отчёты, чекин)      | ~140 KB  |
| team.html      | Команда (управленцы)          | ~118 KB  |
| recruiting.html| Рекрутинг (канбан, тренинги)  | ~72 KB   |
| aquagrim.html  | Аквагримёры                   | ~66 KB   |
| calendar.html  | Календарь                     | ~38 KB   |
| stock.html     | Склад                         | ~22 KB   |
| checkin.html   | Чекин (QR)                    | ~20 KB   |
| my.html        | Личный кабинет                | ~19 KB   |

Навигация единая на всех страницах, рендерится через JS в #nav-links:
  Фотографы | Команда | Рекрутинг | Площадка | Склад | Календарь | [sep] Аквагрим
При изменении навигации — обновлять ВО ВСЕХ 9 файлах.

Тулбар на каждой странице: 🏆 Достижения | 🎂 Дни рождения | ❤️ Лайки

---

## СИСТЕМНЫЕ РОЛИ

```js
const VALID_ROLES = [
  'admin', 'exec_director', 'hr_director', 'hr_manager', 'recruiter',
  'tech_director', 'site_specialist', 'cashier',
  'aq_manager', 'photographer_user', 'aq_user', 'archived'
];
// Итого: 12 ролей
```

---

## БЭКЕНД — КЛЮЧЕВЫЕ ФАКТЫ

### Статистика index.js (актуально на 26.03.2026):
- Строк: ~12 479 (`wc -l backend/index.js`)
- Эндпоинтов: 252 (GET: 98, POST: 105, PATCH: 26, DELETE: 23) — примерно +15–20 к прежней отметке ~231 после складского модуля

### Rate limiting:
- Общий: /api/ — лимиты из env
- authLimiter: 15 мин, max 20 (login/register/forgot)
- exportLimiter: 1 мин, max 5
- registerLimiter: 1 час, max 10

### Auth-паттерн:
- authenticate — async middleware, проверяет Bearer JWT
- requireRole(...roles) — проверяет роль после authenticate
- Refresh tokens хранятся в БД как bcrypt-hash, ротируются при использовании

### Вспомогательные функции:
```js
// Аудит изменений:
async function audit(actorId, actorName, entity, entityId, action, field, oldVal, newVal, ip)

// PATCH-паттерн (динамический UPDATE):
const setParts = []; const vals = []; let i = 1;
if ('field' in req.body) { setParts.push(`field = $${i++}`); vals.push(value); }
setParts.push(`updated_by = $${i++}`); vals.push(req.user.id);
setParts.push(`updated_at = NOW()`);
vals.push(id);
await db.query(`UPDATE table SET ${setParts.join(', ')} WHERE id = $${i}`, vals);
```

Правила типов в PATCH: текстовые `|| null`, boolean/числа/JSONB `?? null`

### Порядок роутов — конкретные ПЕРЕД параметрическими:
```
GET /api/mentorships/dashboard  — до /api/mentorships/:id
GET /api/peer-likes/top         — до /api/peer-likes/:id
GET /api/photographers/export   — до /api/photographers/:id
```

---

## CSS — СТИЛИ (одинаковы во всех файлах)

```css
:root {
  --bg:#0f0f13; --bg2:#16161d; --bg3:#1e1e28;
  --card:#1a1a23; --border:#2e2e3d; --border2:#3a3a4f;
  --text:#e8e8f0; --text2:#9090a8; --text3:#5a5a72;
  --accent:#7c6cff; --accent2:#9b8dff;
  --rank1:#3ecf8e; --rank2:#f5a623; --rank3:#f25555;
}
```

Исключение — aquagrim.html переопределяет акцент:
```css
--aq-accent:#3ecfb4; --aq-accent2:#5ee8d0;
--accent:var(--aq-accent); --accent2:var(--aq-accent2);
```

Цветовые акценты по блокам:
- Фото: фиолетовый #7c6cff
- Аквагрим: бирюзовый #3ecfb4
- Достижения: золотой #f5a623
- Лайки: красный #e53e3e

Ранги:
- rank=1 медь:   background:#3d2000; color:#e8a060; border:1px solid #b87333
- rank=2 серебро: background:#1a2030; color:#b8cce0; border:1px solid #8a9bb0
- rank=3 золото:  background:#2a2000; color:#d4b840; border:1px solid #c9a84c

Шрифты: Unbounded (заголовки, font-weight 400/600), Golos Text (основной)
Подключены через Google Fonts во всех 9 файлах одинаково.

Мобильная адаптация: @media(max-width:768px) во всех файлах.
nav-links: class="nav-links" во всех файлах (не inline-стиль).

---

## РЕАЛИЗОВАННЫЕ МОДУЛИ

- ✅ Ролевая модель (12 ролей)
- ✅ Аутентификация (JWT + refresh rotation + bcrypt)
- ✅ XSS-защита (esc() везде)
- ✅ Аудит всех изменений (audit_log)
- ✅ Фото-блок: карточки, drawer, фильтры, комментарии, история
- ✅ Команда: team_members, синхронизация, карточки, drawer
- ✅ Аквагрим: 10 таблиц aq_*, aquagrim.html, venue/calendar интеграция
- ✅ Достижения: 19+ типов, auto-check, витрина locked/unlocked, seed-defaults
- ✅ Лайки LikeMe: 20/мес, макс 5 одному, 6 категорий, "Любимцы народа"
- ✅ Дни рождения: панель, birthday-glow анимация, сортировка именинников
- ✅ Кураторство/наставничество: назначение, бонусы, dashboard
- ✅ Рекрутинг: канбан, стадии, тренинги, аналитика
- ✅ Склад: полный модуль — справочники, закупки, перемещения,
  инвентаризация, счётчики принтеров, аналитика, Telegram-алерты
- ✅ Календарь: события фото + аквагрим, назначения
- ✅ Отчёты: submit/approve/return/reject (эндпоинты есть)
- ✅ Бонусные схемы: bonus_schemes, venue_bonus_config
- ✅ Мобильная адаптация: все 9 страниц (коммит aa39a05)

---

## СЛЕДУЮЩИЕ ЗАДАЧИ

1. **Новые типы достижений** (8 шт) — Молния, Летописец, План выполнен,
   Народный любимец, Универсал, Архитектор, Рекрутер месяца, Хранитель
2. **UI проведения отчётов** — approve/reject интерфейс для cashier/controller
3. **Анонимные отзывы** — видны только admin/hr_director/exec_director
4. **Автоматический рейтинг продаж** — пересчёт после approve отчёта
5. **Экспорт в Excel** — реализация кнопки "Экспорт" в index.html/team.html
6. **Личный кабинет (my.html)** — мои смены, рейтинг, статистика
7. **Telegram-интеграции** — уведомления о назначениях

---

## КАК ОБНОВЛЯТЬ ЭТОТ ФАЙЛ

После каждой выполненной задачи:
1. Перенести задачу из "Следующие" в "Реализованные модули"
2. Обновить цифры если изменились (строки index.js, кол-во эндпоинтов)
3. Зафиксировать номер коммита если важно
4. Обновить дату в строке 2

---

[КОНЕЦ ФАЙЛА]
