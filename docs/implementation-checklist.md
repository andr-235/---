# Чек-лист миграции на TypeScript

1. **Понимание текущего состояния**
   - собрать список JavaScript-файлов для `main`, `preload`, `renderer`, `db`.
   - зафиксировать текущие npm-скрипты и зависимости (`better-sqlite3`, `electron` и др.).
   - описать существующие IPC-каналы и контракт `window.api.*`.

2. **Настройка инструментов**
   - добавить `typescript`, нужные типы (`@types/node`, `@types/electron`, `@types/better-sqlite3`), и, если нужно, сборщик/наблюдатель.
   - создать `tsconfig.json` с отдельными таргетами или проектными ссылками для `main`, `preload`, `renderer`.
   - обновить `package.json`-скрипты (`build`, `dev`, `start`, `postinstall`) и документацию.
   - предусмотреть копирование статики (`renderer/index.html`, assets) в `dist`.

3. **Перевод backend-логики**
   - последовательно переименовать `src/main/**/*.js` в `.ts`, добавив типы (config, IPC payloads, модели).
   - типизировать `createMainWindow`, `BrowserWindow`-опции, `ipcMain.handle`.
   - обеспечить корректную типизацию DAO и `better-sqlite3`.
   - настроить `ts-node`/`esm` при запуске dev (если нужно), либо компиляцию перед запуском.

4. **Обновление preload**
   - переписать `src/preload/index.ts` с типами `contextBridge`, `API` и строго ограниченным набором методов.
   - проверить соответствие контракту (cases, artifacts, tags, export).
   - убедиться, что в `preload` нет доступа к `nodeIntegration`.

5. **Переход renderer**
   - разбить `src/renderer` на `.ts`-модули (state, renderers, utils) или подключить сборщик (esbuild/vite) с обработкой TS.
   - импортировать типы API, использовать DOM-типы.
   - сохранить структуру sidebar/content/inspector и UI-потоки (`cases` → `sources` → `artifacts`).

6. **Сборка и проверка**
   - проверить `tsc --build`/сборку и запуск `electron .` с скомпилированными артефактами.
   - обновить инструкции в `README.md`.
   - прогнать ручные сценарии: создание дела, добавление источника, фиксация артефакта, экспорт отчёта.
   - зафиксировать изменения в `docs/architecture.md` и `docs/database.md` (если есть).

