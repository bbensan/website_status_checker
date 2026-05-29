const express = require('express');
const router = express.Router();
const db = require('../db');
const { sql } = require('drizzle-orm');

const PAGE_SIZE = 25;
const MAX_RANGE_HOURS = 48;

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    let range = parseInt(req.query.range) || 24;
    if (range > MAX_RANGE_HOURS) range = MAX_RANGE_HOURS;
    const offset = (page - 1) * PAGE_SIZE;

    try {
        const monitorResult = await db.execute(
            sql`SELECT id, name, url, check_interval, is_active, created_at, updated_at FROM monitors WHERE id = ${id}`
        );

        if (monitorResult.rows.length === 0) {
            return res.status(404).send('Monitor not found');
        }

        const monitor = monitorResult.rows[0];

        const lastCheckResult = await db.execute(
            sql`SELECT status_code, response_time_ms, is_up, error_message, checked_at
                FROM check_results
                WHERE monitor_id = ${id}
                ORDER BY checked_at DESC
                LIMIT 1`
        );

        const lastCheck = lastCheckResult.rows[0] || null;

        // Stats always over MAX_RANGE_HOURS (for consistency regardless of page/range)
        const statsResult = await db.execute(
            sql`SELECT
                    COUNT(*) FILTER (WHERE is_up = true) as up_count,
                    COUNT(*) as total_count,
                    AVG(response_time_ms)::int as avg_response_ms,
                    MIN(response_time_ms) as min_response_ms,
                    MAX(response_time_ms) as max_response_ms,
                    COUNT(*) FILTER (WHERE status_code >= 500) as server_error_count,
                    COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500) as client_error_count,
                    COUNT(*) FILTER (WHERE status_code >= 300 AND status_code < 400) as redirect_count,
                    COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as success_count
                FROM check_results
                WHERE monitor_id = ${id}
                  AND checked_at > NOW() - (${MAX_RANGE_HOURS} || ' hours')::INTERVAL`
        );

        const stats = statsResult.rows[0];

        // Chart: ALL rows within range, chronological
        const chartHistoryResult = await db.execute(
            sql`SELECT id, status_code, response_time_ms, is_up, error_message, checked_at
                FROM check_results
                WHERE monitor_id = ${id}
                  AND checked_at > NOW() - (${range} || ' hours')::INTERVAL
                ORDER BY checked_at ASC`
        );

        const chartHistory = chartHistoryResult.rows;

        // Table: paginated, newest-first
        const historyResult = await db.execute(
            sql`SELECT id, status_code, response_time_ms, is_up, error_message, checked_at
                FROM check_results
                WHERE monitor_id = ${id}
                  AND checked_at > NOW() - (${range} || ' hours')::INTERVAL
                ORDER BY checked_at DESC
                LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        );

        const countResult = await db.execute(
            sql`SELECT COUNT(*) as total FROM check_results
                WHERE monitor_id = ${id}
                  AND checked_at > NOW() - (${range} || ' hours')::INTERVAL`
        );

        const totalRows = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalRows / PAGE_SIZE);

        // Reverse for chronological display in table
        const history = historyResult.rows;

        const hourlyResult = await db.execute(
            sql`SELECT
                    DATE_TRUNC('hour', checked_at) as hour,
                    COUNT(*) FILTER (WHERE is_up = true) as up_count,
                    COUNT(*) as total_count,
                    AVG(response_time_ms)::int as avg_response_ms
                FROM check_results
                WHERE monitor_id = ${id}
                  AND checked_at > NOW() - (${range} || ' hours')::INTERVAL
                GROUP BY DATE_TRUNC('hour', checked_at)
                ORDER BY hour ASC`
        );

        const hourly = hourlyResult.rows;

        const uptimePercent = stats.total_count > 0 && stats.total_count !== '0'
            ? Math.round((parseInt(stats.up_count) / parseInt(stats.total_count)) * 100)
            : null;

        const monitorOut = {
            ...monitor,
            uptime_percent: uptimePercent,
            avg_response_ms: stats.avg_response_ms,
            min_response_ms: stats.min_response_ms,
            max_response_ms: stats.max_response_ms,
            total_checks: parseInt(stats.total_count),
            server_error_count: parseInt(stats.server_error_count),
            client_error_count: parseInt(stats.client_error_count),
            redirect_count: parseInt(stats.redirect_count),
            success_count: parseInt(stats.success_count),
        };

        res.render('check', {
            monitor: monitorOut,
            lastCheck,
            history,
            chartHistory,
            hourly,
            range,
            page,
            totalPages,
            totalRows,
            PAGE_SIZE,
            title: monitor.name,
        });
    } catch (err) {
        console.error('Error loading check page:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
