require('dotenv').config();
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql } = require('drizzle-orm');
const Pool = require('pg').Pool;

async function runMigrations() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    const db = drizzle(pool);

    console.log('Running migrations...');

    // Step 1: Check if monitors table exists and has data
    const existing = await db.execute(sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'monitors' AND column_name = 'id'
    `);

    const isAlreadyUuid = existing.rows[0]?.data_type === 'uuid';

    if (isAlreadyUuid) {
        console.log('Schema already uses UUID. Skipping migration.');
        await pool.end();
        return;
    }

    // Step 2: Backup existing check_results data
    console.log('Backing up check_results...');
    const backup = await db.execute(sql`SELECT * FROM check_results`);
    const checkResultsBackup = backup.rows;

    // Step 3: Backup existing monitors data
    console.log('Backing up monitors...');
    const monitorBackup = await db.execute(sql`SELECT * FROM monitors`);
    const monitorsBackup = monitorBackup.rows;

    // Step 4: Drop FK constraint on check_results
    console.log('Dropping FK constraint...');
    await db.execute(sql`ALTER TABLE check_results DROP CONSTRAINT IF EXISTS check_results_monitor_id_monitors_id_fk`);

    // Step 5: Drop and recreate monitors with UUID
    console.log('Converting monitors id to UUID...');
    await db.execute(sql`DROP TABLE IF EXISTS monitors CASCADE`);
    await db.execute(sql`
        CREATE TABLE monitors (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            url text NOT NULL,
            check_interval integer NOT NULL DEFAULT 60,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        )
    `);

    // Step 6: Drop and recreate check_results with UUID FK
    console.log('Converting check_results to UUID...');
    await db.execute(sql`DROP TABLE IF EXISTS check_results`);
    await db.execute(sql`
        CREATE TABLE check_results (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
            status_code integer,
            response_time_ms integer,
            is_up boolean NOT NULL DEFAULT false,
            error_message text,
            checked_at timestamptz DEFAULT now()
        )
    `);
    await db.execute(sql`CREATE INDEX idx_check_results_monitor_id ON check_results(monitor_id)`);
    await db.execute(sql`CREATE INDEX idx_check_results_checked_at ON check_results(checked_at)`);

    // Step 7: Restore monitors with new UUIDs
    console.log('Restoring monitors with new UUIDs...');
    const idMap = {}; // old int id → new uuid
    for (const m of monitorsBackup) {
        await db.execute(sql`
            INSERT INTO monitors (name, url, check_interval, is_active, created_at, updated_at)
            VALUES (${m.name}, ${m.url}, ${m.check_interval}, ${m.is_active}, ${m.created_at}, ${m.updated_at})
        `);
        const result = await db.execute(sql`SELECT id FROM monitors WHERE name = ${m.name} AND url = ${m.url} ORDER BY created_at DESC LIMIT 1`);
        idMap[m.id] = result.rows[0].id;
    }

    // Step 8: Restore check_results with mapped UUIDs
    console.log('Restoring check_results with mapped UUIDs...');
    for (const cr of checkResultsBackup) {
        const newMonitorId = idMap[cr.monitor_id];
        if (!newMonitorId) continue;
        await db.execute(sql`
            INSERT INTO check_results (monitor_id, status_code, response_time_ms, is_up, error_message, checked_at)
            VALUES (${newMonitorId}, ${cr.status_code}, ${cr.response_time_ms}, ${cr.is_up}, ${cr.error_message}, ${cr.checked_at})
        `);
    }

    console.log('Migrations complete. ' + monitorsBackup.length + ' monitors, ' + checkResultsBackup.length + ' results migrated.');
    await pool.end();
}

runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
