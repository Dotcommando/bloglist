export default {
  resourceProcessesTotalCMSProcesses: 'Всего процессов CMS:',
  resourceProcessesSites: 'сайты:',
  resourceProcessesServices: 'служебные:',
  resourceProcessesDumps: 'дампы:',
  resourceProcessesAwaitingAPID: 'Ожидают запуска (ещё без PID):',
  resourceProcessesCMSProcesses: 'Процессы CMS',
  resourceProcessesRole: 'Назначение',
  resourceProcessesState: 'Состояние',
  resourceProcessesStartingAndDrainingProcessesAre:
    'Показаны также запускаемые и завершаемые процессы. При замене их временно больше '
    + 'назначенного числа.',
  resourceProcessesProcessInventoryUnavailable: 'Сведения о процессах недоступны.',
  resourceProcessesCoordinator: 'Управляющий процесс',
  resourceProcessesAdministrationAndBackgroundWork: 'Администрирование и фоновые задачи',
  resourceProcessesDumpCapture: 'Создание дампа',
  resourceProcessesStarting: 'Запускается',
  resourceProcessesReady: 'Готов',
  resourceProcessesDraining: 'Завершается',
  resourceSettingsInstallationResources: 'Ресурсы установки',
  resourceSettingsSharedCMSCPUQuotaAfter: 'После сохранения общая CPU-квота CMS:',
  resourceSettingsInstallation: 'Установка',
  resourceSettingsInfrastructureReserve: 'Резерв инфраструктуры:',
  resourceSettingsActualDatabaseCPUQuota: 'Фактическая CPU-квота БД:',
  resourceSettingsDockerControlIsUnavailableThe: 'Управление Docker недоступно. Квота БД доступна только для чтения.',
  resourceSettingsTheDatabaseIsRemoteIts: 'БД на другой машине. Её CPU не вычитаются из бюджета CMS.',
  resourceSettingsTheLocalDatabaseIsManaged:
    'Локальная БД управляется отдельно. CMS использует заданный при развёртывании CPU-бюджет.',
  resourceSettingsMongoDBConnections: 'Соединения с MongoDB',
  resourceSettingsMaximumConnectionsPerSiteProcess: 'Максимум соединений на процесс сайта',
  resourceSettingsSaved: 'Сохранено:',
  resourceSettingsAppliedToAllSiteProcesses: 'Применено ко всем процессам сайтов:',
  resourceSettingsServicePoolPerProcessCoordinator: 'Служебный пул на процесс (координатор и администрирование):',
  resourceSettingsConfiguredAtStartup: '(задаётся при запуске).',
  resourceSettingsPoolsOpenConnectionsOnDemand:
    'Пулы открывают соединения по мере необходимости. У каждого процесса отдельные пулы к '
    + 'узлам БД; служебные соединения мониторинга MongoDB учитываются отдельно. При '
    + 'применении процессы сайтов заменяются по очереди: новый процесс запускается до '
    + 'остановки старого.',
  resourceSettingsAllCMSProcesses: 'Все процессы CMS',
  resourceSettingsSharedCPUQuotaForAll: 'Общая CPU-квота всех процессов:',
  resourceSettingsOSProcessesNotCPUCores: 'Процессы ОС, не ядра: все используют эту общую квоту.',
  resourceSettingsAddOns: 'Аддоны:',
  resourceSettingsProcessesForThisSite: 'Процессы этого сайта',
  resourceSettingsSiteAssigned: 'Сайт: назначено',
  resourceSettingsRunningNow: 'работает сейчас',
  resourceSettingsOneProcessIsTemporarilyLent:
    'Один процесс временно передан созданию дампа; затем будет восстановлен.',
  resourceSettingsThisSiteIsCreatingA: 'Выполняется создание дампа этого сайта.',
  resourceSettingsSomeAssignedProcessesCouldNot:
    'Не все назначенные процессы запущены. Проверьте сохранённое и работающее количество.',
  resourceSettingsSiteProcessesOnly: 'Только процессы сайтов',
  resourceSettingsAssignedToSites: 'Назначено сайтам:',
  resourceSettingsRunningForSites: 'Работает для сайтов:',
  resourceSettingsEnteredValuesNotAppliedYet: 'По введённым значениям · ещё не применено',
  resourceSettingsCPURecommendation: 'Рекомендация по CPU',
  resourceSettingsSiteProcessesInTheForm: 'Процессов сайтов в форме:',
  resourceSettingsCPUGuidelineForSiteProcesses: 'Ориентир по CPU для процессов сайтов:',
  resourceSettingsUnallocatedCPUBudget: 'Нераспределённый CPU-бюджет:',
  resourceSettingsTheDatabaseAndSitesShare: 'БД и сайты совместно работают на одном CPU. Распределение недоступно.',
  resourceSettingsWhenYouCreateASite:
    'Когда вы создаёте дамп сайта в продакшене через «Настройки → Дампы → Создать дамп», '
    + 'при таком распределении ресурсов:',
  resourceSettingsAfterApplyingTheEnteredValues: 'После применения введённых значений:',
  resourceSettingsOneSiteProcessWillStop:
    'Для дампа один процесс сайта будет завершён. Остальные продолжат отвечать. После дампа '
    + 'процесс будет восстановлен.',
  resourceSettingsSingleProcessCapture:
    'Дамп будет создан в единственном процессе сайта. На время операции сайт может подвиснуть.',
  resourceSettingsRequestedProcessesTotalRecommendedBy:
    'Запрошено процессов: {total}; рекомендуется по CPU: {recommendation}. Можно превысить '
    + 'рекомендацию по CPU. Это не рекомендуется: процессы будут конкурировать за общий '
    + 'CPU-бюджет.',
  resourceSettingsNoUnsavedChanges: 'Нет несохранённых изменений',
  resourceSettingsAllocationSaved: 'Распределение сохранено',
  resourceSettingsSaveAllocation: 'Сохранить распределение',
  resourceSettingsTheSavedAllocationIsNot:
    'Сохранённое распределение применено не полностью. Фактические квоты и работающие '
    + 'процессы показаны выше.',
  resourceSettingsApplyingAllocation: 'Применяем распределение…',
  resourceSettingsCouldNotRefreshTheActual: 'Не удалось обновить фактическое состояние ресурсов.',
  resourceSettingsAllocationSavedAssignedAndRunning:
    'Распределение сохранено. Назначенные и работающие процессы показаны выше.',
  resourceSettingsSaveResponseTimedOutChanges:
    'Ответ на сохранение не получен вовремя. Настройки могли примениться. Обновляем '
    + 'фактическое состояние.',
  resourceSettingsAllocationRejectedCheckCPUQuotas:
    'Распределение отклонено. Проверьте CPU-квоты и количество процессов.',
  resourceSettingsSaveRejectedAllocationChangedOr:
    'Сохранение отклонено: распределение изменилось или выполняется другая операция. '
    + 'Обновите данные перед повтором.',
  resourceSettingsCouldNotFinishApplyingThe:
    'Не удалось завершить применение распределения. Проверьте текущее состояние выше.',
  resourceSettingsSaveConfirmedAllAssignedProcesses: 'Сохранение подтверждено. Все назначенные процессы работают.',
  resourceSettingsSaveOrDiscardYourCurrent:
    'Рекомендация не подставлена: сначала сохраните или сбросьте текущие правки.',
  resourceSettingsCalibrationResultFilledPressSave:
    'Подставлен результат калибровки. Нажмите «Сохранить распределение», чтобы применить его.',
};
