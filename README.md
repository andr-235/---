````markdown
# Центр расследований ОСИНТ - руководство разработчика

## 1. Обзор проекта

**Центр расследований ОСИНТ** - это простое настольное приложение на Electron для работы с OSINT-кейсами. Оно позволяет:

- создавать кейсы,
- просматривать сайты и соцсети во встроенном браузере,
- сохранять доказательства (скриншоты, HTML, URL),
- добавлять заметки и теги,
- выгружать отчёт по кейсу.

Все данные **хранятся локально**: SQLite + файловая система.  
Никаких серверов, аккаунтов и облаков.

> Это greenfield-проект — **всё пишется с нуля**, шаг за шагом.

---

## 2. Начало работы: настройка окружения

### 2.1. Что нужно установить

- Node.js **18 или 20**
- yarn
- Git
- ОС: Windows (основная) или Linux (для разработки)

Проверка:

```bash
node -v
yarn -v
git --version
```
````

---

### 2.2. Создание проекта

```bash
mkdir osint-case-center
cd osint-case-center
npm init -y
```

Установка Electron и БД:

```bash
npm install --save-dev electron
npm install better-sqlite3
```

---

### 2.3. Минимальный запуск Electron

#### `src/main/index.js`

```js
const { app, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
  });

  win.loadURL("http://localhost:5173");
});
```

#### `package.json`

```json
{
  "main": "src/main/index.js",
  "scripts": {
    "dev": "vite",
    "electron": "electron ."
  }
}
```

Запуск:

```bash
npm run dev
npm run electron
```

Если окно открылось — всё работает.

---

## 3. Основные функции

### Кейсы

- Создать кейс
- Отредактировать
- Удалить

### Встроенный браузер

- Открытие сайтов
- Авторизация в соцсетях
- Просмотр страниц

### Артефакты

- Скриншот страницы
- Сохранение HTML
- URL + дата

### Заметки

- Текстовые комментарии
- Теги

### Отчёт

- Экспорт кейса в PDF или HTML

---

## 4. Стек технологий (минимум)

- **Electron** — десктоп
- **SQLite** — локальная БД
- **better-sqlite3** — простой доступ к БД
- **React (опционально)** - интерфейс

Ничего лишнего.

---

## 5. Архитектура (упрощённо)

### Процессы

- **Главный процесс (Main)**

  - База данных
  - Файлы
  - Скриншоты

- **Процесс рендеринга (Renderer)**

  - Интерфейс
  - Кнопки, формы

- **Preload (предзагрузка)**

  - Передаёт команды от интерфейса в Main

Схема:

```
Интерфейс -> Preload -> Main -> Диск
```

---

## 6. База данных (SQLite)

### Таблица `cases`

```sql
CREATE TABLE cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);
```

### Таблица `artifacts`

```sql
CREATE TABLE artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER,
  type TEXT,
  path TEXT,
  url TEXT,
  created_at TEXT
);
```

Этого достаточно для старта.

---

## 7. Пользовательские сценарии

### Создание кейса

1. Пользователь вводит название
2. Интерфейс вызывает `saveCase`
3. Запись в SQLite
4. Создаётся папка кейса

---

### Захват артефакта

1. Пользователь нажимает «Скриншот»
2. Electron делает скриншот
3. Файл сохраняется
4. В БД добавляется запись

---

## 8. IPC API (минимум)

### `saveCase`

**Renderer (интерфейс)**

```js
window.api.saveCase({ title, description });
```

**Main (главный процесс)**

```js
ipcMain.handle("saveCase", (_, data) => {
  db.prepare(
    `
    INSERT INTO cases (title, description, created_at)
    VALUES (?, ?, ?)
  `
  ).run(data.title, data.description, new Date().toISOString());
});
```

---

### `captureArtifact`

- Делает скриншот
- Возвращает путь к файлу

---

## 9. Безопасность (без фанатизма)

### Включить contextIsolation

```js
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    preload: "src/preload/index.js",
  },
});
```

### Preload (предзагрузка)

```js
contextBridge.exposeInMainWorld("api", {
  saveCase: (data) => ipcRenderer.invoke("saveCase", data),
});
```

Этого достаточно.

---

## 10. Структура проекта

```
osint-case-center/
├─ src/
│  ├─ main/
│  │  ├─ index.js
│  │  ├─ app.js
│  │  ├─ controllers/
│  │  ├─ services/
│  │  └─ utils/
│  ├─ db/
│  │  ├─ index.js
│  │  └─ repositories/
│  ├─ preload/
│  │  └─ index.js
│  └─ renderer/
│     ├─ index.html
│     ├─ renderer.css
│     └─ index.js
├─ db/
│  └─ osint.sqlite
└─ package.json
```

---

## 11. Порядок реализации

1. Electron окно
2. SQLite + src/db/index.js
3. IPC (`saveCase`)
4. Интерфейс кейсов
5. BrowserView
6. Скриншоты
7. Экспорт отчёта

---

## 12. Разработка и сборка

Запуск:

```bash
npm run dev
npm run electron
```

Сборка:

```bash
npm install --save-dev electron-builder
npm run build
```

---

## 13. Частые проблемы

### IPC не работает

- preload не подключён
- contextIsolation выключен

### Файлы не сохраняются

- неверный путь
- нет прав на папку

---

## 14. Обработка ошибок (просто)

```js
try {
  // действие
} catch (e) {
  console.error(e);
}
```

Если ошибка — показать сообщение пользователю.

---

## Итог

Это **простое, понятное Electron-приложение**:

- без микросервисов,
- без лишних абстракций,
- без оверинжиниринга.

Сначала **рабочий продукт**, потом улучшения.

```

```
