const express = require('express');
const router = express.Router();
const db = require('../db');
const { monitors } = require('../db/schema');
const { startMonitor, stopMonitor } = require('../services/scheduler');
const { checkUrl } = require('../services/checker');
const { eq, asc } = require('drizzle-orm');

router.get('/', async (req, res) => {
    try {
        const result = await db.select().from(monitors).orderBy(asc(monitors.name));
        res.render('config', {
            monitors: result.map(m => ({ ...m, check_interval: m.checkInterval, is_active: m.isActive })),
            error: null,
            title: 'Configuration',
        });
    } catch (err) {
        console.error('Error loading config:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/', async (req, res) => {
    const { name, url, check_interval } = req.body;

    if (!name || !url || !check_interval) {
        const monitorsList = await db.select().from(monitors).orderBy(asc(monitors.name));
        return res.render('config', {
            monitors: monitorsList.map(m => ({ ...m, check_interval: m.checkInterval, is_active: m.isActive })),
            error: 'Name, URL, and check interval are required.',
            title: 'Configuration',
        });
    }

    try {
        const result = await db.insert(monitors).values({
            name,
            url,
            checkInterval: parseInt(check_interval),
        }).returning();

        const monitor = result[0];
        if (monitor.isActive) {
            startMonitor(monitor);
        }
        res.redirect('/config');
    } catch (err) {
        console.error('Error creating monitor:', err);
        const monitorsList = await db.select().from(monitors).orderBy(asc(monitors.name));
        res.render('config', {
            monitors: monitorsList.map(m => ({ ...m, check_interval: m.checkInterval, is_active: m.isActive })),
            error: 'Failed to create monitor.',
            title: 'Configuration',
        });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, url, check_interval, is_active } = req.body;

    try {
        const result = await db.update(monitors)
            .set({
                name,
                url,
                checkInterval: parseInt(check_interval),
                isActive: is_active === 'true' || is_active === true,
            })
            .where(eq(monitors.id, id))
            .returning();

        if (result.length === 0) {
            return res.status(404).json({ error: 'Monitor not found' });
        }

        const updated = result[0];
        if (updated.isActive) {
            startMonitor(updated);
        } else {
            stopMonitor(updated.id);
        }

        res.redirect('/config');
    } catch (err) {
        console.error('Error updating monitor:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    stopMonitor(id);

    try {
        await db.delete(monitors).where(eq(monitors.id, id));
        res.redirect('/config');
    } catch (err) {
        console.error('Error deleting monitor:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/:id/check', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.select().from(monitors).where(eq(monitors.id, id));
        if (result.length === 0) {
            return res.status(404).json({ error: 'Monitor not found' });
        }

        const monitor = result[0];
        await checkUrl(monitor.id, monitor.url);
        res.redirect('/config');
    } catch (err) {
        console.error('Error triggering check:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
