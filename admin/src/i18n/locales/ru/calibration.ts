export default {
  calibrationAvailabilityStopTheCurrentHTTPApplication:
    'Остановите текущий HTTP-процесс и запустите контейнеры CMS и управления ресурсами '
    + '(resource-control) по Docker-конфигурации установки. Затем нажмите «Обновить».',
  calibrationAvailabilityTheCMSProcessSupervisorIs: 'Супервизор процессов CMS не запущен.',
  calibrationAvailabilityTheDatabaseIsRemoteIts: 'БД размещена вне установки: её CPU-квота здесь не управляется.',
  calibrationAvailabilityTheLocalDatabaseIsNot: 'Локальная БД не подключена к управлению CPU-квотами.',
  calibrationAvailabilityCMSIsNotConnectedTo: 'CMS не подключена к управлению CPU-квотами Docker.',
  calibrationAvailabilityASharedDatabaseCMSBudget:
    'Для подбора общего бюджета БД и CMS нужна управляемая локальная БД и CMS в Docker. '
    + 'Настройте такое развёртывание и нажмите «Обновить».',
  calibrationAvailabilityCouldNotReadContainerState: 'Не удалось получить состояние контейнеров от Docker-helper.',
  calibrationAvailabilityCheckThatResourceControlIs:
    'Проверьте, что resource-control запущен и имеет доступ к Docker и приватному сокету '
    + 'CMS. После восстановления связи нажмите «Обновить».',
  calibrationAvailabilityActualDatabaseAndCMSCPU:
    'Фактические CPU-квоты БД и CMS не подтверждают сохранённое распределение.',
  calibrationAvailabilityCheckActualQuotasInGeneral:
    'В «Общие → Ресурсы» проверьте фактические квоты, примените распределение через '
    + 'Docker-helper и нажмите «Обновить».',
  calibrationAvailabilityTheLoadGeneratorSharesThe: 'Генератор нагрузки находится внутри CPU-квоты CMS.',
  calibrationAvailabilityStartASeparateResourceControl:
    'Запустите отдельный контейнер resource-control вне квоты CMS, подключите его к CMS и '
    + 'нажмите «Обновить».',
  calibrationAvailabilityTheSiteProcessConnectionPool: 'Изменение пула соединений процессов сайта недоступно.',
  calibrationAvailabilityStartTheCMSWithIts: 'Запустите CMS с супервизором fork-процессов, затем нажмите «Обновить».',
  calibrationAvailabilityThePreviousResourceAllocationWas: 'Предыдущее распределение ресурсов применено не полностью.',
  calibrationAvailabilityResolveTheApplicationErrorAnd:
    'В «Общие → Ресурсы» устраните ошибку применения и подтвердите фактическое состояние, '
    + 'затем нажмите «Обновить».',
  calibrationAvailabilityADumpOperationIsActive: 'Сейчас выполняется создание дампа.',
  calibrationAvailabilityWaitForTheOperationIn: 'Дождитесь завершения операции в «Дампы» и нажмите «Обновить».',
  calibrationAvailabilityNotAllAssignedSiteProcesses: 'Не все назначенные процессы сайтов готовы к работе.',
  calibrationAvailabilityCheckStartupErrorsAndRunning:
    'В «Общие → Ресурсы» проверьте ошибки запуска и число работающих процессов. Дождитесь '
    + 'готовности и нажмите «Обновить».',
  calibrationAvailabilityCouldNotCheckCalibrationAvailability:
    'Не удалось проверить доступность калибровки{http}. Проверьте соединение с CMS и '
    + 'нажмите «Обновить». Причина недоступности пока не определена.',
  calibrationAddonsAddOnsDuringMeasurement: 'Аддоны во время замера',
  calibrationAddonsNoEnabledAddOns: 'нет включённых аддонов',
  calibrationAddonsThisHistoricalRunHasNo:
    'В этом историческом замере состав аддонов не сохранён. Нужна повторная калибровка.',
  calibrationApiStepsPublicGETAfterPage: 'Публичный GET после страницы',
  calibrationApiStepsUnavailable: 'недоступен',
  calibrationApiStepsRemoveStep: 'Убрать шаг',
  calibrationApiStepsPublicAPI: '+ Публичный API',
  calibrationHistoryApplication: 'Приложение:',
  calibrationHistoryDatabase: 'БД:',
  calibrationHistoryDatabasePoolPerProcess: 'Пул соединений с БД на процесс:',
  calibrationHistoryGeneratorConnections: 'Соединений генератора:',
  calibrationHistoryLastCalibrations: 'Последние 10 калибровок',
  calibrationHistoryCompletingARunLeavesPersistent:
    'Завершение прогона не меняет постоянные настройки. Кнопка «Применить» сохраняет '
    + 'найденную конфигурацию.',
  calibrationHistoryNoRetainedRunsYet: 'Сохранённых прогонов пока нет.',
  calibrationHistoryMeasured: 'Измерено',
  calibrationHistoryProfileStatus: 'Профиль / состояние',
  calibrationHistoryReference: 'Отправная точка',
  calibrationHistoryResult: 'Результат',
  calibrationHistoryLegacyFixedResourcesCPUBudget: 'Старый замер: фиксированные ресурсы, без ограничения бюджетом',
  calibrationHistoryTotalBudget: 'общий бюджет',
  calibrationHistoryAddOnCompositionChangedOr: 'Состав аддонов изменился или не сохранён. Повторите калибровку.',
  calibrationHistoryDetails: 'Подробности',
  calibrationHistoryApply: 'Применить',
  calibrationHistoryFillResourceForm: 'Заполнить форму ресурсов',
  calibrationHistoryOriginalSettingsRestored: 'Исходные настройки восстановлены:',
  calibrationHistoryTypeDate: 'Тип / дата',
  calibrationHistoryConfiguration: 'Конфигурация',
  calibrationHistoryMean: 'Среднее',
  calibrationHistoryMedian: 'Медиана',
  calibrationHistoryErrorsPass: 'Ошибки / допуск',
  calibrationHistoryBySite: 'По сайтам',
  calibrationHistoryHide: 'Скрыть',
  calibrationHistoryApplyingSettings: 'Применяем настройки…',
  calibrationHistoryRequestFailedRefreshTheState: 'Не удалось выполнить запрос. Обновите данные перед повтором.',
  calibrationHistoryProcess: 'процесс',
  calibrationHistoryProcesses: 'процесса',
  calibrationHistoryProcesses2: 'процессов',
  calibrationHistoryRunning: 'Выполняется',
  calibrationHistoryCompleted: 'Завершена',
  calibrationHistoryCancelled: 'Отменена',
  calibrationHistoryFailed: 'Ошибка',
  calibrationHistoryInterruptedByRestart: 'Прервана перезапуском',
  calibrationHistoryRestorationRequired: 'Нужно восстановление',
  calibrationHistoryCalibrationResultApplied: 'Результат калибровки применён.',
  calibrationMetricsTableMean: 'Среднее:',
  calibrationMetricsTableMedian: 'Медиана:',
  calibrationMetricsTableRequests: 'Запросов:',
  calibrationMetricsTableErrors: 'Ошибок:',
  calibrationShareInputDecreaseShareBy: 'Уменьшить долю на 1%',
  calibrationShareInputIncreaseShareBy: 'Увеличить долю на 1%',
  calibrationStepMetricsScenarioRequests: 'Запросы сценариев',
  calibrationCalibrationTemporarilyChangesResourcesAnd:
    'Калибровка временно меняет ресурсы и создаёт HTTP-нагрузку. Сайт остаётся доступным; '
    + 'внешние запросы влияют на результат. После прогона исходные настройки '
    + 'восстанавливаются.',
  calibrationCheckingCalibrationAvailability: 'Проверяем доступность калибровки…',
  calibrationCalibrationUnavailable: 'Калибровка недоступна',
  calibrationCreateProfile: 'Создать профиль',
  calibrationProfiles: 'Профили',
  calibrationEditProfile: 'Изменить профиль',
  calibrationNewProfile: 'Новый профиль',
  calibrationProfileName: 'Название профиля',
  calibrationTotalDatabaseAndCMSCPU: 'Общий CPU-бюджет БД и CMS',
  calibrationSearchesDatabaseAndCMSCPU:
    'Подбираются CPU-квоты БД и CMS в пределах общего бюджета, пул соединений и число '
    + 'процессов каждого сайта. Перед замерами проверяются реальные квоты Docker.',
  calibrationThisLegacyProfileMeasuredProcesses:
    'Старый профиль измерял только процессы. Добавлены все сайты; задайте доли и сохраните '
    + 'профиль.',
  calibrationPagesAndTrafficShares: 'Страницы и доли запросов',
  calibrationEnterAURLRelativePath: 'Укажите URL, путь от корня сайта или числовой ID страницы. При сумме меньше 100% '
    + 'положительные доли приводятся к 100% пропорционально. Пустая доля сохраняется как 0%.',
  calibrationAddPage: 'Добавить страницу',
  calibrationShare: 'Доля, %',
  calibrationPageShare: 'Доля страницы ',
  calibrationRemovePageFromProfile: 'Убрать страницу из профиля',
  calibrationRemovePageRow: 'Убрать строку страницы ',
  calibrationAssignPositiveTrafficToThis: 'Для запуска задайте положительную долю нагрузки этому сайту.',
  calibrationTotalShare: 'Сумма долей:',
  calibrationMaximumWithPrecision: 'допустимо не больше 100%, с точностью до 0.01%.',
  calibrationLatencyLimitsMs: 'Предельная задержка, мс',
  calibrationABlankFieldDisablesThat: 'Пустое поле отключает критерий. Все заполненные критерии должны выполняться для '
    + 'каждого сайта.',
  calibrationSearchRangesAndExperimentTiming: 'Диапазоны и длительность эксперимента',
  calibrationTheseAreSearchParametersNot:
    'Это параметры поиска, а не ограничения CMS. Число параллельных HTTP-запросов '
    + 'генератора перебирается до нарушения критериев. Итог — лучшая проверенная конфигурация '
    + 'в заданных диапазонах и времени.',
  calibrationProcessCountCandidatesCommaSeparated: 'Число процессов: варианты через запятую',
  calibrationGeneratorConcurrencyLevels: 'Параллельные запросы генератора',
  calibrationPoolSizeCandidatesCommaSeparated: 'Размеры пула: варианты через запятую',
  calibrationDatabaseCPUStep: 'Шаг CPU для БД',
  calibrationWarmupSeconds: 'Прогрев, секунд',
  calibrationProbeSeconds: 'Проба, секунд',
  calibrationConfirmationSeconds: 'Подтверждение, секунд',
  calibrationTotalRunBudgetSeconds: 'Весь прогон, секунд',
  calibrationSaveProfile: 'Сохранить профиль',
  calibrationStartCalibration: 'Запустить калибровку',
  calibrationDeleteProfile: 'Удалить профиль',
  calibrationCurrentRun: 'Текущий прогон',
  calibrationRetainedMeasurements: 'Сохранено измерений:',
  calibrationStopAndRestoreSettings: 'Остановить и восстановить настройки',
  calibrationApplyingChanges: 'Применяем изменения…',
  calibrationDeleteProfile2: 'Удалить профиль?',
  calibrationMeasurementHistoryWillBeRetained: 'История измерений останется сохранённой.',
  calibrationParametersRejectedCheckTheProfile:
    'Параметры отклонены. Проверьте профиль, опубликованные страницы и доступный режим.',
  calibrationStateChangedOrAnotherOperation: 'Состояние изменилось или выполняется другая операция. Обновите данные.',
  calibrationRequestDidNotCompleteRefresh: 'Запрос не завершён. Обновите данные: операция могла выполниться.',
  calibrationProfileSaved: 'Профиль сохранён.',
  calibrationMeasurementsSavedAndOriginalSettings:
    'Измерения сохранены. Исходное распределение восстановлено. Рекомендация будет '
    + 'подставлена в «Общие → Ресурсы»; нажмите «Сохранить распределение», чтобы применить '
    + 'её.',
};
