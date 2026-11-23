
# Задачи в локальном Bloglist

[English](tasks-local.md)

Соберите Tasks 1.0.0 в его репозитории командами `npm ci` и
`npm run build:runtime`. Затем в Bloglist с собранной CMS 0.16.1 и
локальным `.env` выполните:

```powershell
node --env-file=.env scripts/install-tasks.mjs ../zarya-addon-tasks/artifacts/tasks-1.0.0
```

Скрипт регистрирует сборку в CMS, включает её на существующем сайте
`BloglistTrial` и выводит digest и статус подключения. Запустите сайт из
IDE и откройте «Задачи» в админке CMS. Старую базу SQLite можно хранить как
резервную копию.

## Исполнители и проверка

В **Настройки → Доступ** создайте отдельные учётные записи и роли для Hermes
и Codex. Добавьте их в нужную группу. Назначьте права из
[таблицы Actions](tasks-local.md#accounts-and-schedules). Доступ к записи в
каталог Bloglist выдавайте проверяющему только для согласованного сценария.
Эти права действуют в пределах всего сайта.

Создайте шаблон с инструкцией и задание с нужной группой и режимом повторения.
Сохраните [две конфигурации](tasks-local.md#accounts-and-schedules) в
`.secrets` и укажите в них локальный адрес админки, идентификаторы, учётные
данные CMS и пути к исполняемым файлам. Храните журналы в закрытом каталоге NTFS.

```powershell
node scripts/run-tasks-client.mjs worker .secrets/tasks-hermes.json
node scripts/run-tasks-client.mjs reviewer .secrets/tasks-codex.json
```

Эти команды можно запускать через Windows Task Scheduler с рабочим каталогом
Bloglist и режимом «Не запускать новый экземпляр». Клиенты используют
отдельные сессии CMS и ограничивают время запросов. В пределах аренды
исполнитель продолжает работу и повторяет отправку с тем же ключом. При
включённом `allowCatalogCreate` проверяющий подтверждает запись в Bloglist
перед сохранением решения со ссылками на каталог.

## Изолированная проверка

```powershell
node --env-file=.env scripts/check-tasks-integration.mjs ../zarya-addon-tasks/artifacts/tasks-1.0.0 --upgrade ../zarya-addon-tasks/artifacts/tasks-1.0.1
```

Скрипт проверяет установку и обновление, права через HTTP, браузер и запись
в каталог в новой базе `bloglist_trial_qa_*`. Для прогона локальных моделей
укажите `TASKS_QA_HERMES_EXE` и `TASKS_QA_CODEX_ENTRY`. Если задана одна
переменная, вторая роль получает синтетический ответ. Для проверки используются
вымышленные данные.
