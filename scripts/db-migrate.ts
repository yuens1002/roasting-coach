// Applies db/*.sql in name order, once each, recording them in schema_migrations.
// Usage: npm run db:migrate   (reads DATABASE_URL, defaulting to the docker-compose database)
import { connect } from "./db.js";
import { migrate } from "./migrate.js";

const client = await connect();
try {
  await migrate(client, (file) => console.log(`applied ${file}`));
  console.log("database is up to date");
} finally {
  await client.end();
}
