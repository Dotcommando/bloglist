# Индексы и стоимость чтения

[Руководство](README.md) · [Справочник API](reference.md)

Каталог соответствует миграции 0000-schema-migrations.json
и фактическим запросам адаптеров.
У каждой коллекции также есть уникальный индекс MongoDB _id_.
Если дополнительных индексов нет, используется этот индекс.
Порядок полей существенен: (1) — возрастание, (-1) — убывание.
Условия, collation и TTL приведены буквально.

Сайты, аккаунты администраторов, регистрация установки и аутентификация —
глобальные объекты. Страницы, маршруты, медиа, элементы, подключения аддонов
и TV принадлежат сайту. Записи выполнения хуков различают сайт и установку
через installation/scope/generation. Глобальный индекс или непрозрачный _id
не дают доступа к чужим данным: операции проверяют доверенный сайт.

| Коллекция | Индекс | Поля в порядке индекса | Уникальный | Условия/параметры |
| --- | --- | --- | --- | --- |
| sites | sites_mark_unique | markKey(1) | Да | — |
| sites | sites_domain_unique | primaryDomain(1) | Да | — |
| sites | sites_serving_authority_unique | servingAuthority(1) | Да | {"partialFilterExpression":{"servingAuthority":{"$type":"string"}}} |
| pages | pages_site_mark_unique | siteId(1), markKey(1) | Да | — |
| pages | pages_site_identity | siteId(1), _id(1) | Нет | — |
| pages | pages_cluster_identity | clusterId(1), _id(1) | Нет | — |
| pages | pages_site_number_unique | siteId(1), pageNumber(1) | Да | {"partialFilterExpression":{"pageNumber":{"$type":"string"}}} |
| pages | pages_site_parent_order | siteId(1), parentPageId(1), sortOrder(1) | Нет | — |
| urls | urls_mark_unique | markKey(1) | Да | — |
| urls | urls_site_path_unique | siteId(1), path(1) | Да | — |
| urls | urls_current_page_unique | siteId(1), pageId(1) | Да | {"partialFilterExpression":{"kind":"PAGE"}} |
| urls | urls_parent_identity | siteId(1), parentUrlId(1), _id(1) | Нет | — |
| urls | urls_site_kind_path | siteId(1), kind(1), path(1) | Нет | — |
| url_history | url_history_order | siteId(1), urlId(1), createdAt(1), _id(1) | Нет | — |
| page_publications | page_publications_site_identity | _id(1), siteId(1) | Нет | — |
| publication_releases | publication_releases_site_identity | siteId(1), _id(1) | Нет | — |
| publication_activations | publication_activations_site_identity | siteId(1), _id(1) | Нет | — |
| assets | assets_owned_version_unique | siteId(1), assetId(1), _id(1) | Да | — |
| admin_users | admin_users_live_email_unique | email(1) | Да | {"partialFilterExpression":{"deletedAt":null},"collation":{"locale":"en","strength":2}} |
| admin_users | admin_users_live_created | deletedAt(1), createdAt(1), _id(1) | Нет | — |
| admin_users | admin_users_active | deletedAt(1), blocked(1) | Нет | — |
| admin_auth_sessions | admin_auth_token_unique | tokenDigest(1) | Да | — |
| admin_auth_sessions | admin_auth_owner_created | adminUserId(1), accountVersion(1), revokedAt(1), createdAt(1), _id(1) | Нет | — |
| admin_auth_sessions | admin_auth_expiry | expiresAt(1) | Нет | {"expireAfterSeconds":0} |
| admin_login_attempts | admin_login_attempt_expiry | expiresAt(1) | Нет | {"expireAfterSeconds":0} |
| site_content_guards | site_content_guard_site_unique | siteId(1) | Да | — |
| rendering_elements | rendering_elements_site_kind_key_unique | siteId(1), kind(1), key(1) | Да | — |
| rendering_element_sequences | rendering_element_sequences_site_kind_unique | siteId(1), kind(1) | Да | — |
| page_sequences | page_sequences_site_unique | siteId(1) | Да | — |
| media_libraries | media_libraries_site_unique | siteId(1) | Да | — |
| addon_installations | addon_installations_repository_unique | repositoryUrl(1) | Да | — |
| addon_installations | addon_installations_key_unique | addonKey(1) | Да | — |
| site_addons | site_addons_enabled | status(1), siteId(1) | Нет | — |
| site_addons | site_addons_site_key_unique | siteId(1), addonKey(1) | Да | — |
| cms_installations | installation_singleton | singletonKey(1) | Да | — |
| hook_registrations | hook_registration_identity | hookKey(1), schemaVersion(1) | Да | — |
| hook_handlers | hook_handlers_site_created | siteId(1), createdAt(1), _id(1) | Нет | — |
| hook_handler_versions | hook_handler_draft_unique | siteId(1), handlerId(1), sourceDraftVersion(1) | Да | — |
| hook_handler_versions | hook_handler_version_history | siteId(1), handlerId(1), appliedAt(1), _id(1) | Нет | — |
| hook_subscriptions | hook_subscription_matching | siteId(1), hookKey(1), schemaVersion(1), enabled(1) | Нет | — |
| hook_subscriptions | hook_subscription_handler | siteId(1), handlerId(1) | Нет | — |
| hook_subscriptions | hook_subscription_manifest | siteId(1), addonKey(1), manifestKey(1) | Да | {"partialFilterExpression":{"ownerKind":"Addon"}} |
| hook_scope_states | hook_scope_identity | installationId(1), scopeKey(1) | Да | — |
| hook_events | hook_event_sequence | installationId(1), scopeKey(1), generation(1), sequence(1) | Да | — |
| hook_events | hook_event_fact | installationId(1), scopeKey(1), generation(1), operationId(1), factKey(1) | Да | — |
| hook_events | hook_event_dispatch | installationId(1), scopeKey(1), generation(1), dispatchState(1), sequence(1) | Нет | — |
| hook_events | hook_event_history | siteId(1), occurredAt(-1), _id(-1) | Нет | — |
| hook_event_details | hook_event_detail_order | installationId(1), scopeKey(1), generation(1), eventId(1), ordinal(1) | Да | — |
| hook_execution_chains | hook_chain_root | installationId(1), scopeKey(1), generation(1), rootOperationId(1) | Да | — |
| hook_delivery_lanes | hook_lane_identity | installationId(1), scopeKey(1), generation(1), consumerId(1), subject(1) | Да | — |
| hook_deliveries | hook_delivery_unique | installationId(1), scopeKey(1), generation(1), eventId(1), subscriberId(1), unitKey(1) | Да | — |
| hook_deliveries | hook_delivery_lane_position | laneId(1), laneSequence(1) | Да | — |
| hook_deliveries | hook_delivery_due | state(1), nextAttemptAt(1), _id(1) | Нет | — |
| hook_deliveries | hook_delivery_history | siteId(1), createdAt(-1), _id(-1) | Нет | — |
| hook_executions | hook_execution_attempt | deliveryId(1), attemptNumber(1) | Да | {"partialFilterExpression":{"kind":"Event"}} |
| hook_executions | hook_execution_history | siteId(1), startedAt(-1), _id(-1) | Нет | — |
| hook_command_executions | hook_command_plan_key | deliveryId(1), commandKey(1) | Да | — |
| hook_command_executions | hook_command_idempotency | installationId(1), scopeKey(1), idempotencyKey(1) | Да | — |
| template_variables | template_variables_site_unique | siteId(1) | Да | — |


## Фактические пути чтения

| Семейство API | Чтение и подходящие запросы |
| --- | --- |
| sites | get использует идентичность сайта; resolve — нормализованный домен/serving authority. Уникальные доменные индексы подходят для точного разрешения. Список привязан к текущему сайту. |
| pages | get/getDraft читают по идентификатору и проверяют принадлежность сайту. list получает рабочие страницы сайта существующим портом, затем фильтрует и сортирует в памяти. Наличие filter.language или sortby.title в API не превращает их автоматически в индексированный запрос БД. |
| urls | findByPath({path:'/example/'}) использует точный ключ site/path. getHistory({urlId}) — порядок site/url/createdAt/_id. getCatalog объединяет рабочие URL, сведения страниц и опубликованный релиз. search сохраняет собственный контракт подсказок и его limit. |
| templates/chunks/snippets | Префикс запроса БД — siteId/kind. Каталог также объединяет файловые и встроенные элементы. Файловый fallback применяется при отсутствии записи, но не при ошибке БД. Имена/алиасы и окончательный порядок обрабатываются над объединённым результатом. |
| tvs | Каталог — один документ сайта с проверкой версии. Фильтр полей и сортировка sortOrder выполняются над вложенным массивом. getPage дополнительно читает черновик и готовит медиа. save заменяет полный захваченный каталог. |
| files | Библиотека — документ сайта с проверкой версии. Вложенные файлы/папки проецируются, затем пагинируются в памяти. Чтение содержимого использует принадлежащие сайту метаданные и настроенное хранилище. Версии assets имеют отдельный индекс site/asset. |
| addons | Каталог объединяет регистрации кода и сохранённые подключения сайта. Уникальный site/key индекс подходит для поиска подключения; статус и окончательный порядок применяются к объединённому результату. |
| hooks | Регистрации, обработчики и привязки собираются в дерево. history сначала получает существующее окно последних 200 доставок сайта по createdAt/_id. Индексы полос, квитанций команд и поколений защищают гарантии выполнения, а не произвольную сортировку API. |
| adminUsers | Существующая cursor-операция читает страницы до 100 профилей; API собирает все подходящие профили перед offset/sort. Индексы неудалённых createdAt/_id и статуса относятся к исходным запросам. Уникальность email использует указанную collation. Окончательная сортировка email выполняется в памяти. |
| pages.getPublished | Активный релиз выбирается один раз на вызов, либо читается явно выбранный готовый релиз. Контент берётся из проверяемого приватного артефакта, а не текущей pages. Текущий reader проверяет релиз и материализует набор артефактов; индекс MongoDB не ускоряет эти файловые чтения. |
| pages.listVersions | Документ публикаций страницы содержит до трёх снимков. Непрозрачные идентификаторы получаются из канонического контента. Это не неограниченная коллекция ревизий и не поиск по артефактам релизов. |
| publication | Маршрут читается из одного выбранного активированного манифеста. Request использует сохранённый план и готовые ресурсы. Эти операции автоматически не запускают новый список страниц БД или frontend-сборку. |

Для одного объекта предпочитайте точную операцию по идентичности/пути.
Списки API материализуют результат до фильтрации, сортировки и offset.
Индексный префикс помогает получить исходный набор, но не ускоряет последующую
сортировку в памяти. Глубокий offset может быть дорогим даже с подходящим
индексом. Несколько вызовов не образуют общий транзакционный снимок;
параллельные изменения могут менять состав и количество элементов.

Это описание алгоритмов и обоснованные замечания о стоимости, а не измеренные
планы запросов, бенчмарки или гарантии задержек. Новых индексов API не добавляет.
