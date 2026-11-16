export const config = {
    schedule: '*/5 * * * *'
};

export default async function overdueScan() {
    const siteUrl = process.env.URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) {
        throw new Error('Netlify URL and CRON_SECRET environment variables are required.');
    }

    const response = await fetch(new URL('/api/notifications/overdue-scan', siteUrl), {
        headers: {
            authorization: `Bearer ${cronSecret}`
        }
    });
    if (!response.ok) {
        throw new Error(`Overdue notification scan failed with HTTP ${response.status}.`);
    }
}
