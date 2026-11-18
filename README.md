# Cyber Check

**Перевір. Оціни. Захисти.**

Cyber Check – україномовний MVP для самоаудиту інформаційної безпеки малого бізнесу. Застосунок проводить користувача від анкети до рейтингу, оцінки очікуваних річних збитків, плану дій, мікроуроків, вікторини та друкованого звіту.

## Можливості

- Реєстрація та вхід з Argon2id, JWT у HttpOnly cookie, CSRF double-submit cookie та обмеженням частоти входу.
- 14 запитань у 8 категоріях із серверним автозбереженням чернетки.
- Рейтинг 0–100, три найслабші категорії та текстовий рівень ризику.
- Калькулятор SLE/ALE для п’яти сценаріїв і трьох варіантів припущень.
- Рекомендації, власники, строки й статуси виконання.
- Вісім мікроуроків, вікторина з 12 прикладами та звіт із друком у PDF.
- Дашборд з історією, трендом, розподілом за категоріями, збитками та прогресом.
- Premium feature flag (`PREMIUM_ENABLED`): у MVP за замовчуванням увімкнений; платежів немає.

Питання, сценарії, уроки й вікторина є тимчасовим навчальним контентом. Кожен seed-файл містить позначку про заміну на матеріали команди. Не використовуйте розрахунки як фінансову чи юридичну оцінку.

## Вимоги

- Python 3.12
- Node.js 20+ і pnpm 11
- SQLite для локального запуску або PostgreSQL для Docker/продакшну

## Локальний запуск

```powershell
Copy-Item .env.example .env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

API: http://127.0.0.1:8000, OpenAPI: http://127.0.0.1:8000/docs.

В іншому терміналі:

```powershell
cd frontend
pnpm install
pnpm dev
```

Відкрийте http://127.0.0.1:5173. У Vite налаштовано проксі `/api` на локальний FastAPI.

За потреби задайте `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE`, `CORS_ORIGINS` і `PREMIUM_ENABLED` у `.env`. Для локального HTTP встановіть `COOKIE_SECURE=false`; у production потрібні HTTPS, `COOKIE_SECURE=true` і довгий випадковий `JWT_SECRET`.

## Міграції та сідинг

Команди запускаються з `backend/`:

```powershell
alembic upgrade head
python -m app.seed
alembic downgrade base
```

Сідинг ідемпотентний: він додає відсутні шаблонні записи та не видаляє користувацькі аудити. Після зміни схеми створюйте міграцію командою `alembic revision --autogenerate -m "опис"` і переглядайте її перед застосуванням.

## Тести та перевірки

З кореня репозиторію:

```powershell
cd backend
python -m pytest
python -m ruff check app tests
python -m pip_audit
cd ../frontend
pnpm test
pnpm lint
pnpm build
pnpm exec playwright test
```

E2E команда сама запускає окремі API та фронтенд, застосовує міграцію й seed для тестової SQLite-БД. Перед першим запуском встановіть браузер: `pnpm exec playwright install chromium`. Ручні сценарії й security checklist наведені в `docs/test-cases.md`.

## Docker Compose

Створіть `.env`, задайте `POSTGRES_PASSWORD` і `JWT_SECRET`, потім:

```powershell
docker compose up --build
```

Compose підіймає PostgreSQL, API та Vite. Після першого старту API виконайте міграцію й seed у контейнері:

```powershell
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
```

## Структура

```text
backend/   FastAPI, SQLAlchemy, Alembic, JSON seed, pytest
frontend/  React, TypeScript, Vite, Tailwind, TanStack Query, Vitest, Playwright
docs/      Ручні тест-кейси та безпековий checklist
```

## Безпека й межі MVP

- Кожен маршрут аудиту перевіряє власника об’єкта; чужі й відсутні ID повертають однаковий 404.
- API не повертає хеші паролів і не розкриває, чи існує email під час входу.
- Мутуючі автентифіковані запити потребують CSRF-заголовок, звірений з окремою cookie.
- Секрети беруться зі змінних середовища. Не додавайте `.env`, бази даних, токени або персональні дані в Git.
- Rate limit входу зберігається в пам’яті процесу; для кількох реплік потрібне спільне сховище лімітів.
- Premium прапорець лише керує доступом до історії та PDF у UI/API; платіжного процесингу немає.

Деталі API доступні у вбудованому OpenAPI за адресою `/docs`.
