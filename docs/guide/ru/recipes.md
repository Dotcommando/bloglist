# Рецепты

[Руководство](README.md) · [Справочник API](reference.md)

Примеры действительно меняют данные. Используйте уникальные имена/метки
на изолированном тестовом сайте. Это не установщики и не автоматически создаваемый контент.

## Чанк, шаблон и TV

Пример выполняется в доверенном контексте аддона/приложения с клиентом ICmsApi:

```typescript
const card = await cms.chunks.create({
  name: 'ApiCard', html: '<p>[[+text]]</p>', css: '',
  browserTypeScript: null,
  parameters: [{ name: 'text', kind: 'String', required: true }],
});
const template = await cms.templates.create({
  name: 'ApiTemplate',
  html: '<html><head><title>[[*title]]</title></head><body>[[$'
    + card.key + '? &text=`[[*lead]]`]]</body></html>',
  css: '', browserTypeScript: null, parameters: [],
});
const catalog = await cms.tvs.list({ limit: 256 });
const version = catalog.metadata?.version;
if (typeof version !== 'string') throw new Error('Нет версии каталога TV');
await cms.tvs.save({
  expectedVersion: version,
  fields: [...catalog.items, {
    name: 'lead', caption: 'Вступление', description: '',
    kind: 'Text', templateIds: [template.key], required: false,
    sortOrder: 10, defaultValue: 'Добро пожаловать',
  }],
});
const page = await cms.pages.create({
  mark: 'ApiExample', language: 'ru', title: 'Пример',
});
await cms.pages.configureRendering({
  pageId: page.pageId,
  rendering: {
    templateId: template.key, delivery: 'Static', interaction: 'None',
    parameters: {}, loaders: [],
  },
});
const details = await cms.tvs.getPage({ pageId: page.pageId });
await cms.tvs.savePage({
  pageId: page.pageId, templateId: template.key,
  values: { ...details.values, lead: 'Данные из API' },
  expectedUpdatedAt: details.updatedAt,
  catalogVersion: details.catalog.version,
  mediaVersion: details.mediaVersion,
});
await cms.pages.publishCurrent({
  pageId: page.pageId, templateId: template.key, path: '/api-example/',
});
```

Язык ru должен быть включён в настройках сайта.
Текущий контракт TV допускает до 256 полей; пример читает полный каталог перед
его заменой. Нельзя сохранять только первую страницу пагинированного списка.
savePage заменяет значения под проверками версий каталога, медиа и черновика.
Публичным документ становится после последней явной публикации.
Отсутствие TV, null и объявленное значение по умолчанию — разные состояния.

## Выбор версии контента

```typescript
const draft = await cms.pages.getDraft({ pageId });
const active = await cms.pages.getPublished({ pageId });
const released = await cms.pages.getPublished({ pageId, releaseId });
const versions = await cms.pages.listVersions({ pageId });
const selected = versions.items[0];
const retained = selected
  ? await cms.pages.getPublished({ pageId, pageVersionId: selected.pageVersionId })
  : null;
```

Первый элемент списка не обязан быть самым новым: порядок по умолчанию задаётся
стабильным идентификатором. Позиции restoreVersion — отдельный существующий
контракт. Несколько чтений не являются общим снимком БД; для чтения одного
релиза захватите releaseId и повторно используйте его.

## Расширение API аддоном

Дескриптор и вызов зарегистрированного метода приведены в
[примере серверного расширения](../../addon-development/code-standards.md#server-extension-example).

## Хуки и команды API

Команды CMS сохраняют существующие проверки и генерацию событий.
Создайте, примените и включите обработчик через hooks.create, hooks.apply,
hooks.setEnabled и hooks.subscribe, передавая захваченные версии.
Event-обработчик использует свой устойчивый API плана команд;
Check сохраняет отсутствие побочных эффектов по контракту хуков.
Новый cms не внедряется в worker хуков и не расширяет их grants автоматически.
Правила доставки, повторов и неопределённого исхода:
[контракты хуков](../../arch/hooks.md).

## Обновление установленного аддона

В карточке аддона, установленного из GitHub, нажмите «Проверить обновления».
Если найдена новая версия, она появится рядом с текущей версией, а кнопка
сменится на «Установить обновление». Для обновления из файла выберите готовый
addon.runtime.gz и нажмите «Проверить пакет».
Проверьте версии и режим паузы, затем нажмите «Обновить». Обновление действует
на все сайты установки и доступно глобальному администратору. Сайт продолжает
работать; при несовместимой миграции приостанавливаются операции этого аддона.
После потери ответа используйте «Проверить состояние» или «Продолжить обновление»
с сохранённым идентификатором. Подключения и бизнес-данные сохраняются.
Подробнее — [контракт обновления](../../arch/live-addon-updates.md).

В Настройки → Общие показаны PID и состояния служебных процессов и процессов сайтов под общей CPU-квотой CMS. В калибровке можно выбрать публичные API включённых аддонов как шаги после страницы. Результаты сохраняют измеренный состав аддонов; изменение версий или конфигурации требует нового прогона. Общая скорость относится к посещениям (страница и API), а детали запросов показывают ошибки и задержки каждого шага.

В production resource helper использует сетевое пространство CMS: внешний
генератор калибровки обращается к её loopback. Перед запуском HTTP приложение
дожидается приватного сокета helper. Запускайте оба сервиса одной операцией
Compose; процессы и учёт CPU у них раздельные. См.
[проверку настоящих Docker-квот](../../audits/0.15.0-docker-addon-calibration.md).
