const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addMissingColumns() {
    const alterStatements = [
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "wasOverdue" BOOLEAN DEFAULT false',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "hasExtension" BOOLEAN DEFAULT false',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "releasedBy" TEXT',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "releasedByName" TEXT',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMPTZ',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "extensionApprovedAt" TIMESTAMPTZ',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "extensionApprovedBy" TEXT',
        'ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "notificationCount" INTEGER DEFAULT 0',
    ];

    for (const sql of alterStatements) {
        console.log('Running:', sql);
        const { data, error } = await sb.rpc('pg_query', { query_text: sql });
        if (error) {
            // RPC might not exist, try raw SQL endpoint
            console.log('  RPC failed, trying raw approach...');
            try {
                const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/pg_query`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                    },
                    body: JSON.stringify({ query_text: sql })
                });
                console.log('  REST status:', res.status);
            } catch (e2) {
                console.log('  REST also failed:', e2.message);
            }
        } else {
            console.log('  OK:', data);
        }
    }

    // Verify by selecting columns from information_schema
    console.log('\nVerifying columns...');
    const { data, error } = await sb
        .from('borrowings')
        .select('*')
        .limit(0);

    if (error) {
        console.log('Verify error:', error.message);
    } else {
        console.log('Borrowings table accessible, no errors!');
    }

    // Also test wasOverdue query specifically
    const { data: d2, error: e2 } = await sb
        .from('borrowings')
        .select('*')
        .eq('wasOverdue', true)
        .limit(1);

    if (e2) {
        console.log('wasOverdue query FAILED:', e2.message);
    } else {
        console.log('wasOverdue query OK, returned', d2.length, 'rows');
    }
}

addMissingColumns().catch(err => console.error('Fatal:', err));
