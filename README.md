# Requirements Management System

Веб-приложение для управления требованиями по проектам.

**ВНИМАНИЕ** - пока это MVP!

Возможности:

- вход аутентифицированного пользователя;
- выбор проекта и просмотр его требований;
- создание, редактирование и удаление требований;
- фильтрация по статусу и поиск по номеру, описанию и типу;
- хранение данных в `data/database.json`.

Справочники интерфейса вынесены в отдельные JSON-файлы в `public/config`:

- `statuses.json` — статусы;
- `priorities.json` — приоритеты;
- `complexities.json` — сложности;
- `types.json` — типы требований;
- `projects.json` — проекты.

Сейчас они загружаются клиентом как конфигурация. Позже функцию `loadConfig()` в `public/app.js` можно заменить на запрос к backend API.

## Run

```bash
npm start
```

The server starts at `http://localhost:3000`.

Тестовый пользователь: `admin` / `admin123`.

For development with automatic restarts:

```bash
npm run dev
```
