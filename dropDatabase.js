const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);

async function dropDatabase() {
  try {
    await client.connect();

    // Disconnect active connections to the database
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${databaseName}'
        AND pid <> pg_backend_pid();
    `);

    // Drop the database
    await client.query(`DROP DATABASE ${databaseName}`);
    console.log(`Database ${databaseName} dropped successfully.`);
  } catch (err) {
    console.error('Error dropping database:', err);
  } finally {
    await client.end();
  }
}

dropDatabase();
