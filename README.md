
# Лабораторная работа №5 — DevOps

## Календарь повторяющихся событий

### Описание проекта

Веб-приложение для создания повторяющихся мероприятий по заданному шаблону.

Пользователь может указать параметры события, выбрать исполнителя,
площадку и жанр, настроить интервал и количество повторений.

Перед сохранением приложение формирует расписание и проверяет
его через Backend API.

### Функциональность

- Создание событий.
- Выбор исполнителя из API.
- Выбор площадки из API.
- Выбор жанра и возрастного ограничения.
- Настройка даты и времени начала.
- Настройка продолжительности мероприятия.
- Настройка интервала повторения в днях или неделях.
- Настройка количества повторений.
- Предварительный просмотр расписания.
- Проверка событий через API без сохранения.
- Пакетное сохранение событий в базу данных.

### Технологии

- React
- Vite
- JavaScript
- CSS
- NGINX
- Docker
- Docker Compose
- FastAPI
- PostgreSQL
- PostGIS

### Архитектура

Проект состоит из трёх сервисов:

1. Frontend — пользовательский интерфейс на React.
2. Backend — готовый API Kazan Events.
3. Database — PostgreSQL с расширением PostGIS.

NGINX обслуживает frontend и перенаправляет запросы
/api/ на Backend.

### Структура проекта

```text
PSUTI-DevOps-Lab5/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── package.json
│   └── vite.config.js
├── compose.yml
├── README.md
└── .gitignore
```

### Требования

Для запуска необходимы:

- Windows 11 / Linux / macOS
- Docker Desktop или Docker Engine
- Docker Compose

### Запуск проекта

Клонирование репозитория:

```bash
git clone https://github.com/ReMirable/PSUTI-DevOps-Lab5.git
cd PSUTI-DevOps-Lab5
```

Запуск всех сервисов:

```bash
docker compose up -d --build
```

Проверка контейнеров:

```bash
docker compose ps
```

Просмотр логов:

```bash
docker compose logs -f
```

### Адреса приложения

Frontend:

http://localhost:8080

Backend Swagger:

http://localhost:8000/docs

Backend API:

http://localhost:8000/api/v1/meta

### Алгоритм создания повторяющихся событий

1. Пользователь заполняет форму события.
2. Выбирает исполнителя, площадку и жанр.
3. Указывает дату, время и продолжительность.
4. Устанавливает интервал повторения.
5. Указывает количество событий.
6. Frontend формирует расписание.
7. Backend проверяет пакет событий в режиме dry_run.
8. Пользователь просматривает результат.
9. После подтверждения события сохраняются в базу данных.

Для пакетного создания используется endpoint:

POST /api/v1/events/bulk

При сохранении используется Idempotency-Key.

### Остановка проекта

```bash
docker compose down
```

Данные PostgreSQL сохраняются в Docker volume.

Для повторного запуска:

```bash
docker compose up -d
```

### Автор

ReMirable

PSUTI — DevOps
Лабораторная работа №5