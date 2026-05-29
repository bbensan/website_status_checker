const db = require('../db');
const { checkResults } = require('../db/schema');

async function checkUrl(monitorId, url) {
    const start = Date.now();
    let isUp = false;
    let statusCode = null;
    let errorMessage = null;
    let responseTimeMs = null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'PostmanRuntime/7.54.0',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
            },
        });

        clearTimeout(timeout);
        statusCode = response.status;
        responseTimeMs = Date.now() - start;
        isUp = response.ok;
    } catch (err) {
        if (err.name === 'AbortError' || err.message.includes('timeout') || err.message.includes('aborted')) {
            statusCode = 0;
            errorMessage = 'Connection timeout';
        } else {
            statusCode = 0;
            errorMessage = err.message;
        }
        responseTimeMs = Date.now() - start;
    }

    try {
        await db.insert(checkResults).values({
            monitorId,
            statusCode,
            responseTimeMs,
            isUp,
            errorMessage,
        });
    } catch (err) {
        console.error(`Failed to save check result for monitor ${monitorId}:`, err.message);
    }

    return { monitorId, statusCode, responseTimeMs, isUp, errorMessage };
}

module.exports = { checkUrl };
