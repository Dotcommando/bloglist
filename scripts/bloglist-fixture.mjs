import { readFile } from 'node:fs/promises';

const database = process.env.ZARYA_MONGO_DATABASE;

if (!/^bloglist_trial(?:_qa_[0-9]+)?$/.test(database ?? '')) {
  throw new Error('Fixture is restricted to the isolated Bloglist trial');
}

const origin = process.env.ZARYA_ADMIN_AUTH_ORIGIN;

if (origin !== 'http://localhost:3002') {
  throw new Error('Fixture requires the explicit local trial origin');
}

const root = '.tmp/' + database;

const credentials = JSON.parse(await readFile(root + '/credentials.json', 'utf8'));

const site = JSON.parse(await readFile(root + '/site.json', 'utf8'));

const login = await fetch(origin + '/api/admin/auth/login', {
  method: 'POST',
  headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
  body: JSON.stringify(credentials),
});

if (!login.ok) {
  throw new Error('Trial login failed: ' + login.status);
}

const cookies = login.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');

await login.json();

async function create(name, parentClusterId, key) {
  const response = await fetch(origin + '/api/admin/sites/' + site.siteId + '/bloglist/clusters', {
    method: 'POST',
    headers: {
      Origin: origin,
      'X-Zarya-Admin': '1',
      'Content-Type': 'application/json',
      Cookie: cookies,
      'Idempotency-Key': key,
    },
    body: JSON.stringify({ name, parentClusterId, descriptionMd: null, primaryQuery: null }),
  });

  if (!response.ok) {
    throw new Error('Fixture creation failed: ' + response.status + ' ' + await response.text());
  }

  return response.json();
}

const topics = ['Деревообработка', 'Путешествия', 'Образование', 'Красота', 'Наука',
  'Технологии', 'Кулинария', 'Спорт', 'Дизайн', 'Музыка', 'Фотография', 'Игры',
  'Книги', 'Садоводство', 'Архитектура', 'Ремонт', 'Автомобили', 'Языки',
  'Здоровье', 'Искусство', 'История', 'Кино', 'Животные', 'Экология', 'Инструменты'];

const roots = [];

for (let index = 1; index <= 125; index++) {
  roots.push(await create(topics[(index - 1) % topics.length] + ' · подборка ' + index,
    null, 'design-root-' + index));
}

for (const parent of roots.slice(-3)) {
  for (let index = 1; index <= 125; index++) {
    const name = index === 125 && parent === roots.at(-1)
      ? 'Блог про станки деревообработки'
      : parent.name + ' / направление ' + index;

    await create(name, parent.clusterId, 'design-child-' + parent.clusterId + '-' + index);
  }
}

process.stdout.write('Fixture verified: 125 root clusters and three lists of 125 children; '
  + 'creation keys prevent duplicates.\n');
