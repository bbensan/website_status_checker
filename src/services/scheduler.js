const db = require('../db');
const { monitors } = require('../db/schema');
const { checkUrl } = require('./checker');
const { eq } = require('drizzle-orm');

const tasks = new Map();

async function loadMonitors() {
    try {
        return await db.select().from(monitors).where(eq(monitors.isActive, true));
    } catch (err) {
        console.error('Failed to load monitors:', err.message);
        return [];
    }
}

async function startMonitor(monitor) {
    stopMonitor(monitor.id);

    const intervalMs = (monitor.checkInterval || monitor.check_interval) * 1000;

    checkUrl(monitor.id, monitor.url);

    const intervalId = setInterval(async () => {
        try {
            const res = await db.select().from(monitors).where(eq(monitors.id, monitor.id));
            if (res.length === 0 || !res[0].isActive) {
                stopMonitor(monitor.id);
                return;
            }
            await checkUrl(monitor.id, res[0].url);
        } catch (err) {
            console.error(`Error checking monitor ${monitor.id}:`, err.message);
        }
    }, intervalMs);

    tasks.set(monitor.id, { intervalId, monitor });
    console.log(`Monitor started: ${monitor.name} (every ${monitor.checkInterval || monitor.check_interval}s)`);
}

function stopMonitor(monitorId) {
    if (tasks.has(monitorId)) {
        clearInterval(tasks.get(monitorId).intervalId);
        tasks.delete(monitorId);
        console.log(`Monitor stopped: ${monitorId}`);
    }
}

async function reloadScheduler() {
    const monitorsList = await loadMonitors();

    const activeIds = new Set(monitorsList.map(m => m.id));

    for (const [id] of tasks) {
        if (!activeIds.has(id)) stopMonitor(id);
    }

    for (const monitor of monitorsList) {
        startMonitor(monitor);
    }
}

function stopAll() {
    for (const [id] of tasks) {
        stopMonitor(id);
    }
}

module.exports = { loadMonitors, startMonitor, stopMonitor, reloadScheduler, stopAll };
