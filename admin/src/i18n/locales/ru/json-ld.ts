export default {
  jsonLdProfileReadOnlyHint: 'Профиль доступен для просмотра. Чтобы изменить его или его привязки, запросите '
    + 'право сохранения JSON-LD.',
  jsonLdAssignmentsJSONLDProfilesAndInputs: 'Профили и входные данные JSON-LD',
  jsonLdAssignmentsCouldNotLoadProfiles: 'Не удалось загрузить профили.',
  jsonLdAssignmentsPageField: 'Поле страницы',
  jsonLdAssignmentsSnippet: 'Сниппет',
  jsonLdAssignmentsMissingObject: 'Объект отсутствует',
  jsonLdAssignmentsNoProfilesAssignedToThis: 'Для этого шаблона нет профилей.',
  jsonLdAssignmentsRequiredValuesEditPageFields:
    '* Обязательные значения. Поля страницы и TV редактируются ниже; общие ссылки — в JSON-LD.',
  jsonLdAssignmentsConfigureJSONLDProfilesAnd: 'Настроить профили и ссылки JSON-LD',
  jsonLdSourceEditorSource: 'Источник',
  jsonLdSourceEditorValue: 'Значение',
  jsonLdSourceEditorFirstValueSecondValue: 'Первое значение\nВторое значение',
  jsonLdSourceEditorForExampleAName: 'Например, название',
  jsonLdSourceEditorValueType: 'Тип значения',
  jsonLdSourceEditorListOneValuePerLine: 'Список (по одному значению в строке)',
  jsonLdSourceEditorNumber: 'Число',
  jsonLdSourceEditorBoolean: 'Логическое',
  jsonLdSourceEditorNodeRole: 'Роль узла',
  jsonLdSourceEditorEntityPage: 'Страница объекта',
  jsonLdSourceEditorEntityRole: 'Роль объекта',
  jsonLdSourceEditorTVNameSnippetAlias: 'Имя TV / псевдоним сниппета',
  jsonLdSourceEditorPropertyPathDotSeparatedOptional: 'Путь к свойству (через точку, необязательно)',
  jsonLdSourceEditorOrganizationPerson: 'Организация / человек',
  jsonLdSourceEditorExactAddress: 'Точный адрес',
  jsonLdSourceEditorThisAddressRedirectsTheExact: 'Адрес является редиректом. Сохранится выбранный точный адрес.',
  jsonLdSourceEditorAbsoluteHTTPSAddress: 'Абсолютный HTTP(S) адрес',
  jsonLdSourceEditorRequiredProperty: 'Обязательное свойство',
  jsonLdSourceEditorCurrentPageNode: 'Узел текущей страницы',
  jsonLdSourceEditorPageBackedEntity: 'Объект на странице сайта',
  jsonLdSourceEditorConstant: 'Константа',
  jsonLdSourceEditorTemplateVariable: 'TV-поле',
  jsonLdSourceEditorPreparedSnippetValue: 'Результат сниппета',
  jsonLdSourceEditorSharedObject: 'Общий объект',
  jsonLdSourceEditorCurrentPageWebPage: 'Текущая страница (WebPage)',
  jsonLdSourceEditorPageOfThisSite: 'Страница сайта',
  jsonLdSourceEditorExactSiteAddress: 'Точный адрес сайта',
  jsonLdSourceEditorExternalAddress: 'Внешний адрес',
  jsonLdSourceEditorUnpublished: 'Не опубликована',
  jsonLdUrlEditorAddressSource: 'Источник адреса',
  jsonLdUrlEditorAddressIsNotPublishedYet: 'Адрес ещё не опубликован',
  jsonLdUrlEditorEnterAFullHTTPS: 'Введите полный HTTP(S) адрес. Теги шаблона здесь не выполняются.',
  jsonLdValueSourceEditorPropertyPathDotSeparated: 'Путь к свойству (через точку)',
  jsonLdSharedObjects: 'Общие объекты',
  jsonLdSearchJSONLD: 'Поиск JSON-LD',
  jsonLdCreateFromPreset: 'Создать из заготовки',
  jsonLdNoEntries: 'Список пуст',
  jsonLdBackToList: 'Вернуться к списку',
  jsonLdJSONLDHelp: 'Справка по JSON-LD',
  jsonLdJSONLDGettingStarted: 'JSON-LD: с чего начать',
  jsonLdDescribeAPersonOrOrganization: '1. Опишите человека или организацию',
  jsonLdExampleAPrivatePsychologistIn:
    'Пример: сайт частного психолога. Во вкладке «Общие объекты» нажмите «+» и выберите '
    + '«Человек» (Person).',
  jsonLdListNameIsAnAdmin: '«Название в списке» — подпись только для админки, например «Автор сайта». Имя, которое '
    + 'попадёт в JSON-LD, задаётся отдельно в свойстве name.',
  jsonLdExampleTextProperties: 'Примеры текстовых свойств:',
  jsonLdFullName: 'Имя Фамилия',
  jsonLdPsychologist: 'Психолог',
  jsonLdIndividualConsultations: 'Индивидуальные консультации',
  jsonLdForUrlChooseValueType: 'Для свойства url выберите тип значения «Адрес», источник «Страница сайта» и страницу '
    + 'специалиста в списке. CMS сама получит её полный опубликованный адрес.',
  jsonLdLinksToPagesThatUnambiguously:
    'ссылки на страницы, которые однозначно описывают того же человека. В этом примере это '
    + 'внешние профили на других сайтах. Выберите тип значения «Список» и вводите полные URL '
    + 'по одному в строке, без кавычек и запятых:',
  jsonLdUseUrlAndThePage: 'Страницу специалиста на этом сайте задавайте через url и выбор страницы. В JSON-LD не '
    + 'выполняются теги шаблона вроде ',
  jsonLdDoNotEnterThemIn: ': не вставляйте их в адреса, текст или списки. Для внешнего адреса вводите полный '
    + 'HTTPS URL.',
  jsonLdForImageUseAPublic: 'Для image используйте публичный адрес фотографии, например',
  jsonLdAddOnlyActualPublicDetails: 'Добавляйте только реальные публичные данные и сохраните объект.',
  jsonLdConfigureAPageProfile: '2. Настройте профиль страниц',
  jsonLdInProfilesPressAndChoose: 'Во вкладке «Профили» нажмите «+» и выберите «Веб-страница», «Статья» или «Услуга». '
    + 'Назовите профиль, например «Основные страницы»; это название видно только в админке. '
    + 'Назначьте нужные HTML-шаблоны: профиль применяется ко всем страницам с этими '
    + 'шаблонами.',
  jsonLdInSchemaOrgTypeIs: 'в поле «Тип Schema.org» — стандартный тип веб-страницы, а не произвольное название. Он '
    + 'попадёт в публичную разметку как ',
  jsonLdTheCorrespondingTypesArePerson: 'Для человека таким типом будет Person, для статьи — Article.',
  jsonLdInNodeRoleIsA: 'в поле «Роль узла» — постоянный технический ключ внутри профиля. CMS использует его '
    + 'для связей и формирования публичного @id. Это не заголовок страницы; после настройки '
    + 'связей роль лучше не менять.',
  jsonLdAPropertyDescribesTheNode:
    'Свойство — характеристика узла, источник — место, откуда взять значение. Для WebPage '
    + 'свяжите name с полем страницы title, description — с metaDescription, inLanguage — с '
    + 'language. Например, name получит заголовок «О психологе».',
  jsonLdForPagesAboutThePsychologist:
    'В профиле страниц о психологе добавьте about: источник «Общий объект», затем выберите '
    + 'человека. Общий объект включается в разметку через эту ссылку; само его создание не '
    + 'добавляет его на все страницы. Сохраните профиль.',
  jsonLdIfTheSiteHasArticles: '3. Если есть статьи',
  jsonLdForTheArticleTemplateConfigure:
    'Для шаблона статей настройте профиль с узлами WebPage и Article. Кнопка «Добавить '
    + 'Article» создаёт заготовку узла статьи.',
  jsonLdForArticleMapHeadlineTo:
    'У Article свяжите headline с заголовком страницы, author — с общим объектом психолога, '
    + 'mainEntityOfPage — с источником «Текущая страница (WebPage)». Данные автора вводятся '
    + 'один раз и используются повторно.',
  jsonLdInspectAndPublish: '4. Проверьте и опубликуйте',
  jsonLdSaveTheObjectProfileAnd:
    'Сначала сохраните объект, профиль и страницу. В разделе «Страницы» откройте страницу, '
    + 'раскройте JSON-LD в панели действий и выберите «JSON-LD сохранённого черновика». '
    + 'Просмотр использует сохранённый черновик.',
  jsonLdResolvePropertyAndReferenceErrors:
    'Исправьте ошибки свойств и ссылок, затем опубликуйте страницу или весь сайт. '
    + 'Сохранение не обновляет публичный сайт. После публикации проверьте «Опубликованный '
    + 'JSON-LD».',
  jsonLdMainPages: 'Основные страницы',
  jsonLdHTMLTemplates: 'HTML-шаблоны',
  jsonLdAddTemplate: 'Добавить шаблон',
  jsonLdNodeRoleStableKey: 'Роль узла (постоянный ключ)',
  jsonLdStableKeyUsedByReferences: 'Постоянный ключ для связей и публичного @id.',
  jsonLdSchemaOrgType: 'Тип Schema.org',
  jsonLdStandardTypePublishedAsType: 'Стандартный тип; публикуется как @type.',
  jsonLdEntityKey: 'Ключ сущности',
  jsonLdPageAndRole: 'По странице и роли',
  jsonLdFromASource: 'Из выбранного источника',
  jsonLdNodePresence: 'Присутствие узла',
  jsonLdAlways: 'Всегда',
  jsonLdFromABooleanValue: 'По логическому значению',
  jsonLdEntityKeySource: 'Источник ключа сущности',
  jsonLdStableStringASCIILettersDigits:
    'Стабильная строка: 1–128 латинских букв, цифр, дефисов или подчёркиваний. Одинаковые '
    + 'роль и ключ обозначают одну сущность на разных страницах сайта.',
  jsonLdNodePresenceCondition: 'Условие присутствия узла',
  jsonLdNodePresenceSource: 'Источник условия присутствия',
  jsonLdTrueIncludesTheNodeFalse:
    'true включает узел. false или отсутствие значения убирает узел до проверки его свойств.',
  jsonLdAuthor: 'Автор',
  jsonLdProvider: 'Исполнитель',
  jsonLdNotSpecified: 'Не указывать',
  jsonLdChooseAPersonOrOrganization: 'Выберите человека или организацию из «Общих объектов», если это применимо.',
  jsonLdProperty: 'Свойство',
  jsonLdAddProperty: 'Добавить свойство',
  jsonLdRemoveNode: 'Удалить узел',
  jsonLdNode: 'Узел',
  jsonLdAddNode: 'Добавить узел',
  jsonLdAddArticle: 'Добавить Article',
  jsonLdListName: 'Название в списке',
  jsonLdSiteAuthor: 'Автор сайта',
  jsonLdList: 'Список',
  jsonLdObject: 'Объект',
  jsonLdAddress: 'Адрес',
  jsonLdRelatedObject: 'Связанный объект',
  jsonLdValuesOnePerLine: 'Значения (по одному в строке)',
  jsonLdChooseAProfileOrShared: 'Выберите профиль или общий объект. Настройки сохраняются как черновик до публикации '
    + 'страницы.',
  jsonLdPerson: 'Человек',
  jsonLdOrganization: 'Организация',
  jsonLdWebPage: 'Веб-страница',
  jsonLdArticle: 'Статья',
  jsonLdService: 'Услуга',
  jsonLdWebSite: 'Веб-сайт',
  jsonLdCustomType: 'Другой тип',
  jsonLdAnotherEditorChangedThisCatalog:
    'Данные изменены другим редактором. Ваши поля сохранены здесь. Скопируйте изменения '
    + 'перед обновлением.',
  jsonLdCheckThePropertiesReferencesAnd:
    'Проверьте свойства, ссылки и выбранные HTML-шаблоны. Введённые данные сохранены в '
    + 'редакторе.',
  jsonLdReplaceUnsavedChanges: 'Заменить несохранённые изменения?',
  jsonLdDraftSavedPublishingAPage:
    'Черновик сохранён. Публикация страницы обновит связанные опубликованные графы вместе.',
  jsonLdDeleteDependentReferencesRemainFor:
    'Удалить? Зависимые ссылки останутся для исправления; публикация проверит их.',
  jsonLdForExampleText: 'Например, текст',
};
