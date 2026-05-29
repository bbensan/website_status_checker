const { drizzle } = require('drizzle-orm/node-postgres');
const Pool = require('pg').Pool;
const schema = require('./schema');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

const db = drizzle(pool, { schema });

module.exports = db;
