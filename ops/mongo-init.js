/* global db */
const applicationDatabase = process.env.MONGO_APP_DATABASE;

const applicationPassword = process.env.MONGO_APP_PASSWORD;

if (!applicationDatabase || !applicationPassword) {
  throw new Error('Explicit application database and password required');
}

db.getSiblingDB(applicationDatabase).createUser({
  user: 'zarya_app',
  pwd: applicationPassword,
  roles: [
    { role: 'readWrite', db: applicationDatabase },
    { role: 'dbAdmin', db: applicationDatabase },
  ],
});
