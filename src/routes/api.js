const express = require('express');
const router = express.Router();
const db = require('../db');
const { sql } = require('drizzle-orm');

router.get('/monitors', async (req, res) => {
    try {
        const result = await db.execute(sql`
            SELECT
                m.id, m.name, m.url, m.check_interval, m.is_active,
                cr.status_code, cr.response_time_ms, cr.is_up, cr.checked_at
            FROM monitors m
            LEFT JOIN LATERAL (
                SELECT status_code, response_time_ms, is_up, checked_at
                FROM check_results
                WHERE monitor_id = m.id
                ORDER BY checked_at DESC
                LIMIT 1
            ) cr ON true
            ORDER BY m.name ASC
        `);

        const uptimeResult = await db.execute(sql`
            SELECT monitor_id,
                COUNT(*) FILTER (WHERE is_up = true) as up_count,
                COUNT(*) as total_count
            FROM check_results
            WHERE checked_at > NOW() - '24 hours'::INTERVAL
            GROUP BY monitor_id
        `);

        const uptimeMap = {};
        for (const row of uptimeResult.rows) {
            const total = parseInt(row.total_count);
            const up = parseInt(row.up_count);
            uptimeMap[row.monitor_id] = total > 0 ? Math.round((up / total) * 100) : null;
        }

        const monitors = result.rows.map(m => ({
            ...m,
            uptime_24h: uptimeMap[m.id] ?? null,
        }));

        res.json({ monitors });
    } catch (err) {
        console.error('Error fetching monitors:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/monitors/:id/history', async (req, res) => {
    const { id } = req.params;
    const hours = parseInt(req.query.hours) || 24;

    try {
        const result = await db.execute(
            sql`SELECT status_code, response_time_ms, is_up, error_message, checked_at
                FROM check_results
                WHERE monitor_id = ${id}
                  AND checked_at > NOW() - (${hours} || ' hours')::INTERVAL
                ORDER BY checked_at ASC`
        );

        res.json({
            monitor_id: id,
            hours,
            data: result.rows.map(r => ({
                status_code: r.status_code,
                response_time_ms: r.response_time_ms,
                is_up: r.is_up,
                error_message: r.error_message,
                checked_at: r.checked_at,
            })),
        });
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
