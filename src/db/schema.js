const { pgTable, uuid, text, integer, boolean, timestamp, index } = require('drizzle-orm/pg-core');

const monitors = pgTable('monitors', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    checkInterval: integer('check_interval').notNull().default(60),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

const checkResults = pgTable('check_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    monitorId: uuid('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
    statusCode: integer('status_code'),
    responseTimeMs: integer('response_time_ms'),
    isUp: boolean('is_up').notNull().default(false),
    errorMessage: text('error_message'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
    monitorIdIdx: index('idx_check_results_monitor_id').on(table.monitorId),
    checkedAtIdx: index('idx_check_results_checked_at').on(table.checkedAt),
}));

module.exports = { monitors, checkResults };
