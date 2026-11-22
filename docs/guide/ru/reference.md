# Справочник серверного API

[Руководство](README.md) · [Индексы](indexes.md)

Это серверные вызовы, а не HTTP-endpoint. Маршрут /api/cms и браузерный глобальный
объект не регистрируются. Существующий административный REST сохраняет свои
контракты и аутентификацию. Аргументы и ошибки прикладных операций сохраняются,
кроме служебных siteId/actorId/signal, выбора вида элемента группой и нового оформления списков.
Полные типы параметров и результатов:
[SDK cms.ts](../../../packages/addon-contracts/src/cms.ts).
Правила отдельных операций: [архитектурные контракты](../../arch/).

| Object | Operations |
| --- | --- |
| sites | create, get, resolve, list, update, archive |
| pages | create, get, getDraft, getPublished, list, listVersions, update, move, archive, configureRendering, publish, restoreVersion, preview, getPublicationOptions, publishCurrent, publishRelease |
| urls | assignInitial, findByPath, change, getHistory, getCatalog, search, changePublished, materialize, rebind, redirect, redirectPublished |
| templates / chunks / snippets | list, get, create, update, preview |
| tvs | list, save, getPage, savePage |
| files | list, createFolder, upload, changeImage, move, usages, delete, reconcile, readContent, getAsset, uploadAsset, processAsset |
| addons | list, get, enable, configure, disable |
| hooks | list, get, create, update, apply, setEnabled, subscribe, reorder, history, retry, skip |
| adminUsers | get, list, update, block, delete |
| publication | publishSite, publishRouting, resolvePath, renderPage, getArtifact, republishSnippetPages |


## Списки

list, listVersions, getHistory и hooks.history возвращают
{items, total, limit, offset}. Дополнительные данные каталога находятся в metadata:
версия и siteId для TV; папки, версия и pending для файлов; handlers для хуков.
Вложенные массивы других результатов автоматически не пагинируются.

Значения по умолчанию применяются только при отсутствии limit/offset/sortby:
50, 0 и пустой список сортировки. limit — положительное безопасное целое,
offset — неотрицательное безопасное целое. Верхнего числового ограничения нет.
null не считается отсутствием параметра пагинации.
sortby — упорядоченный массив {field, direction: 'asc' | 'desc'}.
filter задаёт равенство скалярных значений. Неизвестные аргументы, операторы,
поля и направления сортировки возвращают Validation до вызова списка.
Порядок обработки: фильтр, сортировка, offset/limit. В конце добавляется
сортировка по стабильному идентификатору по возрастанию. Строки сравниваются
детерминированно по кодовым единицам UTF-16, без зависимости от локали сервера.
При возрастании сначала идут отсутствующие поля, затем null, затем скалярные значения.

| Список | Поля фильтрации и сортировки |
| --- | --- |
| pages.list | pageId, parentPageId, pageNumber, sortOrder, mark, title, language, type, status, clusterId, createdAt, updatedAt, publishedAt |
| sites.list | siteId, mark, name, primaryDomain, status, createdAt, updatedAt |
| templates/chunks/snippets.list | key, name, version, createdAt, updatedAt |
| tvs.list | name, caption, kind, required, sortOrder |
| files.list | fileId, folderId, name, mode, mimeType, byteSize |
| addons.list | addonKey, status сохранённого подключения |
| hooks.list | hookKey, kind, provider, registeredAt, available |
| adminUsers.list | adminUserId, email, blocked, createdAt, updatedAt |
| pages.listVersions | pageVersionId |
| urls.getHistory | urlHistoryEntryId, urlId, kind, pageId, redirectTargetUrlId, redirectStatus, createdAt |
| hooks.history | deliveryId, state, attempts |

pages.list также принимает parentId, в том числе null для корневых страниц.
Это фильтр parentPageId, а не иерархии URL.
adminUsers.list сохраняет селектор status: All/Active/Blocked.
История хуков по существующему контракту содержит последние 200 доставок;
больший limit не создаёт отсутствующую историю.
Пагинация выполняется после материализации списка. Стоимость описана в справке индексов.

## Версии и публикация

pages.get — существующее чтение черновика; getDraft — явный синоним.
getPublished({pageId}) один раз выбирает активный релиз для данного вызова.
getPublished({pageId, releaseId}) читает выбранный готовый неизменяемый релиз.
getPublished({pageId, pageVersionId}) читает сохранённую публикацию страницы.
Одновременные releaseId и pageVersionId дают Validation.
Отсутствующая/удалённая версия возвращает null. Текущий черновик вместо
опубликованного снимка не подставляется.
Чтение чужой страницы через getDraft сохраняет существующую ошибку Scope.

listVersions выдаёт стабильные непрозрачные pageVersionId. По-прежнему хранятся
три публикации. restoreVersion сохраняет позиционный селектор
1 — последняя, 2 — предыдущая, 3 — самая старая, атомарные проверки
и изменение только черновика. Удалённые версии API не восстанавливает.

publish сохраняет контент страницы; publishRelease/publishCurrent активируют
релиз страницы. publication.publishSite — отдельный сценарий полного релиза
с существующей проверкой expectedActiveReleaseId.
Изменения маршрутов сохраняют опубликованный контент.
Новые релизы содержат полные приватные снимки страниц: это не публичные ресурсы
и не бесконечная история публикаций.

## Команды и ошибки

Передавайте захваченный expectedVersion и остальные проверки там, где они
предусмотрены операцией. Одинаковое проверенное состояние может быть no-op.
Сохраняются ошибки устаревшей версии, чужого объекта, конфликта и запрет
удаления последнего администратора. Удаления аддона и консольного создания
аккаунта через cms нет.

Коды BusinessError сохраняются. Неверный список и подмена служебной идентичности
дают Validation. В worker бизнес-ошибки имеют code/message; неожиданные внутренние
ошибки преобразуются в Unavailable без технических деталей.
Обязательный сниппет сохраняет существующую безопасную границу ошибки рендера.
Ошибка или fallback необязательного сниппета не отменяет завершённую команду.

Для файлов требуется явно настроенное хранилище.
Бинарные данные: {byteSize, mimeType, bytes: number[]}, байты — целые 0..255.
TV expectedUpdatedAt принимает точную возвращённую строку ISO.
Отсутствие хранилища/кода аддона, отключённая операция, неверные байты и повреждённый
снимок дают явную ошибку. Ограничения worker и результата независимы от limit:
[ограничения обмена](../../arch/transport-limits.md).

### Оформление админки аддонов

При создании экрана аддона следуйте [стандартам админки и браузерного кода](../../addon-development/code-standards.md#administration-and-browser-code).
