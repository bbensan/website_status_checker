const express = require('express');
const router = express.Router();
const db = require('../db');
const { sql } = require('drizzle-orm');

router.get('/', async (req, res) => {
    try {
        const monitorsWithLastCheck = await db.execute(sql`
            SELECT
                m.id,
                m.name,
                m.url,
                m.check_interval,
                m.is_active,
                m.updated_at,
                cr.status_code,
                cr.response_time_ms,
                cr.is_up,
                cr.checked_at
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

        const uptimeData = await db.execute(sql`
            SELECT
                monitor_id,
                COUNT(*) FILTER (WHERE is_up = true) as up_count,
                COUNT(*) as total_count
            FROM check_results
            WHERE checked_at > NOW() - '24 hours'::INTERVAL
            GROUP BY monitor_id
        `);

        const uptimeMap = {};
        for (const row of uptimeData.rows) {
            const total = parseInt(row.total_count);
            const up = parseInt(row.up_count);
            uptimeMap[row.monitor_id] = total > 0 ? Math.round((up / total) * 100) : null;
        }

        const monitorsList = monitorsWithLastCheck.rows.map(m => ({
            ...m,
            uptime_24h: uptimeMap[m.id] ?? null,
        }));

        res.render('index', { monitors: monitorsList, title: 'Dashboard' });
    } catch (err) {
        console.error('Error loading dashboard:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
