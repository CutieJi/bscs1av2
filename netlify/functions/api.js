const serverless = require('serverless-http');

process.env.NETLIFY = 'true';
const app = require('../../server');
const expressHandler = serverless(app);

function normalizePath(pathname) {
    const functionPrefix = '/.netlify/functions/api';
    return pathname.startsWith(`${functionPrefix}/`)
        ? pathname.slice(functionPrefix.length)
        : pathname;
}

exports.handler = (event, context) => {
    const normalizedEvent = { ...event };
    if (normalizedEvent.path) {
        normalizedEvent.path = normalizePath(normalizedEvent.path);
    }
    if (normalizedEvent.rawPath) {
        normalizedEvent.rawPath = normalizePath(normalizedEvent.rawPath);
    }
    if (normalizedEvent.rawUrl) {
        const url = new URL(normalizedEvent.rawUrl);
        url.pathname = normalizePath(url.pathname);
        normalizedEvent.rawUrl = url.toString();
    }
    return expressHandler(normalizedEvent, context);
};
