# Руководство разработчика

[English version](../en/README.md)

Серверный API cms доступен доверенным сниппетам и аддонам. Он возвращает
типизированные данные и вызывает существующие операции соответствующих подсистем.

1. [Начало работы](getting-started.md).
2. [Модель и выполнение](concepts.md).
3. [Справочник серверного API](reference.md).
4. [Рецепты](recipes.md).
5. [Индексы и стоимость чтения](indexes.md).
6. [Диагностика](troubleshooting.md).

Публичный контракт — SDK 0.4.0, экспорты @zarya/addon-contracts/cms
и /cms-extensions. Полные типы находятся
[в переносимой декларации API](../../../packages/addon-contracts/src/cms.ts).
Принятые решения: [ADR 0044](../../adr/0044-system-object-api-and-bilingual-guide.md).
Границы реализации: [технический контракт](../../arch/system-object-api.md).
Сборка, тестирование и упаковка пакетов описаны в [руководстве по разработке аддонов](../../addon-development/README.md).
