const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mislend-jwt-super-secret-key-change-in-production-2026';

if (process.env.VERCEL && JWT_SECRET === 'mislend-jwt-super-secret-key-change-in-production-2026') {
    throw new Error('Set a unique JWT_SECRET in the Vercel project environment variables.');
}

// -----------------------------------------------------------------------------
// OTP & Email Verification Store for Password Changes
// -----------------------------------------------------------------------------
const passwordOtps = new Map(); // key: email.toLowerCase(), value: { code, expiresAt, attempts }

function maskEmail(email) {
    if (!email || !email.includes('@')) return email || '';
    const [name, domain] = email.split('@');
    if (name.length <= 2) return `${name[0]}*@${domain}`;
    return `${name[0]}${'*'.repeat(Math.max(name.length - 2, 2))}${name.slice(-1)}@${domain}`;
}

function getMailTransporter() {
    const settings = {
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS
    };
    const configured = Object.values(settings).some(value => value);
    if (!configured) return null;

    const missing = Object.entries(settings)
        .filter(([, value]) => !value)
        .map(([key]) => key);
    if (missing.length) {
        throw new Error(`Incomplete SMTP configuration. Set ${missing.join(', ')} in server/.env.`);
    }

    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT must be a valid port number between 1 and 65535.');
    }

    const secureSetting = process.env.SMTP_SECURE;
    if (secureSetting && !['true', 'false'].includes(secureSetting.toLowerCase())) {
        throw new Error('SMTP_SECURE must be either true or false.');
    }

    return nodemailer.createTransport({
        host: settings.SMTP_HOST,
        port,
        secure: secureSetting ? secureSetting.toLowerCase() === 'true' : port === 465,
        auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASS }
    });
}

// CORS setup: allow all local origins and frontend requests
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increase JSON payload limit for Base64 photos (e.g. Student ID captures)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..')));

// -----------------------------------------------------------------------------
// Database Initialization: Supabase SQL Client with Local File/Memory Fallback
// -----------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const isPlaceholderCredentials = !supabaseUrl || 
    supabaseUrl.includes('YOUR_PROJECT_ID') || 
    !supabaseKey || 
    supabaseKey.includes('YOUR_SUPABASE');

if (process.env.VERCEL && isPlaceholderCredentials) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in Vercel. Local file storage is not persistent on Vercel.');
}

let supabase = null;
let useLocalStore = isPlaceholderCredentials;

// Path to local storage fallback JSON file
const dataDir = path.join(__dirname, 'data');
const storeFilePath = path.join(dataDir, 'store.json');

// Default initial state
const defaultStore = {
    users: [
        {
            id: 'admin_demo_01',
            email: 'admin@cs1a.com',
            password: '$2a$10$yreAgMQUmBHnIfdwlsbK/eL1bkDKYmvPcW2NQ5aFV.0gBVcZtw7Qa', // admin123
            name: 'System Administrator',
            firstName: 'System',
            lastName: 'Administrator',
            role: 'admin',
            status: 'approved',
            adminId: 'admin',
            isHeadAdmin: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: 'student_demo_01',
            email: 'roshjingel@gmail.com',
            password: '$2a$10$1vPbKG/O.b1bFtBBeDtVO.ToZnIZFASWdGJnLG9PMmcA6sKzqZvM6', // @UCCIAN2025@
            name: 'Rosh Jingel',
            firstName: 'Rosh',
            lastName: 'Jingel',
            role: 'student',
            status: 'approved',
            studentId: '20251234-S',
            course: 'BSCS',
            yearLevel: '1',
            section: 'A',
            yearSection: '1-A',
            mobile: '09123456789',
            gender: 'Male',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: 'prof_demo_01',
            email: 'prof@cs1a.com',
            password: '$2a$10$yreAgMQUmBHnIfdwlsbK/eL1bkDKYmvPcW2NQ5aFV.0gBVcZtw7Qa', // admin123
            name: 'Prof. Roberto Santos',
            firstName: 'Roberto',
            lastName: 'Santos',
            role: 'professor',
            status: 'approved',
            facultyId: 'PROF-202501',
            department: 'Computer Studies',
            mobile: '09187654321',
            gender: 'Male',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    ],
    equipment: [
        {
            id: 'eq_lap_01',
            name: 'Dell Latitude 5420 Laptop',
            category: 'Laptops',
            model: 'Latitude 5420',
            serialNumber: 'SN-DL-88231',
            assetNumber: 'AST-2025-001',
            status: 'available',
            condition: 'Good',
            location: 'Lab 301, Cabinet A',
            description: 'Intel Core i5 11th Gen, 16GB RAM, 512GB SSD for laboratory programming.',
            totalQuantity: 5,
            availableQuantity: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: 'eq_proj_01',
            name: 'Epson EB-X06 Projector',
            category: 'Projectors',
            model: 'EB-X06 XGA 3600 Lumens',
            serialNumber: 'SN-EP-44109',
            assetNumber: 'AST-2025-002',
            status: 'available',
            condition: 'Good',
            location: 'AVR Equipment Room',
            description: 'High brightness 3600-lumen XGA 3LCD projector with HDMI/VGA.',
            totalQuantity: 3,
            availableQuantity: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: 'eq_ard_01',
            name: 'Arduino Uno R3 Ultimate Starter Kit',
            category: 'Laboratory Kits',
            model: 'Uno R3 Kit v2',
            serialNumber: 'SN-ARD-10928',
            assetNumber: 'AST-2025-003',
            status: 'available',
            condition: 'Good',
            location: 'Robotics & Embedded Lab',
            description: 'Complete microcontroller starter kit with sensors and breadboard.',
            totalQuantity: 10,
            availableQuantity: 10,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: 'eq_cam_01',
            name: 'Canon EOS 3000D DSLR Camera Kit',
            category: 'Audio/Visual',
            model: 'EOS 3000D + 18-55mm',
            serialNumber: 'SN-CN-76512',
            assetNumber: 'AST-2025-004',
            status: 'available',
            condition: 'Good',
            location: 'Media Lab, Locker B',
            description: '18.0 MP APS-C CMOS sensor camera kit for multimedia projects.',
            totalQuantity: 2,
            availableQuantity: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    ],
    borrowings: [],
    incidents: [],
    messages: [],
    feedback: [],
    admin_audit_logs: []
};

function loadLocalStore() {
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (fs.existsSync(storeFilePath)) {
            const raw = fs.readFileSync(storeFilePath, 'utf8');
            return JSON.parse(raw);
        } else {
            saveLocalStore(defaultStore);
            return defaultStore;
        }
    } catch (e) {
        console.error('Error reading local store, using default memory store:', e);
        return defaultStore;
    }
}

function saveLocalStore(data) {
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving local store:', e);
    }
}

let localStore = loadLocalStore();

// Try initializing Supabase if valid credentials provided
if (!isPlaceholderCredentials) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });
        console.log(`[MISLend Backend] Connected to Supabase at: ${supabaseUrl}`);
    } catch (err) {
        console.warn(`[MISLend Backend] Supabase init failed: ${err.message}. Falling back to local store.`);
        useLocalStore = true;
    }
} else {
    console.log('[MISLend Backend] Supabase placeholder credentials detected in server/.env.');
    console.log('[MISLend Backend] Using local store fallback. Real accounts, logins, borrowings, and equipment work immediately!');
    console.log('[MISLend Backend] To connect to live Supabase: replace placeholder values in server/.env with your real Supabase credentials.');
}

// -----------------------------------------------------------------------------
// Authentication Middleware
// -----------------------------------------------------------------------------
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) {
            req.user = user;
        } else {
            req.user = null;
        }
        next();
    });
}

app.use(authenticateToken);

const HEAD_ADMIN_EMAILS = [
    'uccmislend@gmail.com',
    'efrenpvictoria@gmail.com',
    'teodoroamacaraeg@gmail.com',
    'admin@cs1a.com'
];

function hasHeadAdminPrivileges(user) {
    if (user?.role !== 'admin') return false;
    if (user.isHeadAdmin !== undefined && user.isHeadAdmin !== null) {
        return user.isHeadAdmin === true || user.isHeadAdmin === 'true';
    }
    if (user.adminType) return user.adminType === 'head_admin';
    return HEAD_ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
}

async function findUserProfile(uid) {
    if (useLocalStore || !supabase) {
        return (localStore.users || []).find(user =>
            String(user.id) === String(uid) || String(user.users_id) === String(uid)
        ) || null;
    }

    if (/^\d+$/.test(String(uid))) {
        const { data, error } = await supabase.from('users').select('*')
            .eq('id', parseInt(uid, 10)).maybeSingle();
        if (error) throw error;
        if (data) return data;
    }

    const { data, error } = await supabase.from('users').select('*')
        .eq('users_id', String(uid)).maybeSingle();
    if (error) throw error;
    return data;
}

async function authorizeHeadAdminPrivilegeGrant(req, res, targetId, targetRole) {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Only a Head Admin can grant Head Admin access.' });
        return false;
    }

    const callerProfile = await findUserProfile(req.user.uid);
    if (!hasHeadAdminPrivileges(callerProfile)) {
        res.status(403).json({ error: 'Only a Head Admin can grant Head Admin access.' });
        return false;
    }

    let role = targetRole;
    if (!role && targetId) {
        const targetProfile = await findUserProfile(targetId);
        role = targetProfile?.role;
    }
    if (role !== 'admin') {
        res.status(400).json({ error: 'Head Admin access can only be granted to an administrator.' });
        return false;
    }
    return true;
}

function requestsHeadAdminPrivilege(record) {
    return record?.isHeadAdmin === true || record?.isHeadAdmin === 'true' ||
        record?.adminType === 'head_admin';
}

function getBorrowingDueAt(borrowing) {
    if (!borrowing?.borrowedAt || !borrowing?.expectedReturnTime) return null;
    const borrowedAt = typeof borrowing.borrowedAt.toDate === 'function'
        ? borrowing.borrowedAt.toDate()
        : new Date(borrowing.borrowedAt);
    const timeMatch = String(borrowing.expectedReturnTime).match(/^(\d{1,2}):(\d{2})$/);
    if (Number.isNaN(borrowedAt.getTime()) || !timeMatch) return null;

    const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(borrowedAt).split('-').map(Number);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (hours > 23 || minutes > 59) return null;

    return new Date(Date.UTC(year, month - 1, day, hours - 8, minutes));
}

function getBorrowingRecordId(borrowing) {
    return String(borrowing.borrowings_id || borrowing.id);
}

async function getBorrowingRecord(id) {
    if (useLocalStore || !supabase) {
        return (localStore.borrowings || []).find(item =>
            String(item.id) === String(id) || String(item.borrowings_id) === String(id)
        ) || null;
    }

    let query = supabase.from('borrowings').select('*');
    query = applyRecordIdFilter(query, 'borrowings', id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
}

async function updateBorrowingRecord(id, updates) {
    if (useLocalStore || !supabase) {
        const record = (localStore.borrowings || []).find(item =>
            String(item.id) === String(id) || String(item.borrowings_id) === String(id)
        );
        if (!record) throw new Error('Borrowing record was not found.');
        Object.assign(record, updates, { updatedAt: new Date().toISOString() });
        saveLocalStore(localStore);
        return record;
    }

    let query = supabase.from('borrowings').update({
        ...updates,
        updatedAt: new Date().toISOString()
    });
    query = applyRecordIdFilter(query, 'borrowings', id);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Borrowing record was not found.');
    return data;
}

async function getOverdueRecipient(borrowing) {
    let profile = null;
    if (borrowing.userId) profile = await findUserProfile(borrowing.userId);
    return {
        name: borrowing.userName || profile?.name || profile?.firstName || 'Borrower',
        email: borrowing.userEmail || profile?.email || '',
        mobile: borrowing.userMobile || profile?.mobile || '',
        gender: profile?.gender || ''
    };
}

function escapeEmailHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

async function deliverOverdueEmail(borrowing, recipient) {
    let transporter;
    try {
        transporter = getMailTransporter();
    } catch (error) {
        throw new Error(`Email configuration error: ${error.message}`);
    }
    if (!transporter) {
        throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env.');
    }
    if (!recipient.email) throw new Error('Borrower has no email address on record.');

    const name = recipient.name;
    const equipmentName = borrowing.equipmentName || 'borrowed equipment';
    await transporter.sendMail({
        from: process.env.SMTP_FROM || `"MISLend" <${process.env.SMTP_USER}>`,
        to: recipient.email,
        subject: `Overdue Equipment Reminder: ${equipmentName}`,
        text: `Hello ${name},\n\nOur records show that the equipment (${equipmentName}) you borrowed from the UCC MIS Office is overdue. Please return it as soon as possible.\n\nThank you,\nUCC MIS Office`,
        html: `<p>Hello <strong>${escapeEmailHtml(name)}</strong>,</p><p>Our records show that the equipment (<strong>${escapeEmailHtml(equipmentName)}</strong>) you borrowed from the UCC MIS Office is overdue. Please return it as soon as possible.</p><p>Thank you,<br>UCC MIS Office</p>`
    });
}

async function deliverOverdueSms(borrowing, recipient) {
    const apiKey = process.env.TEXTBEE_API_KEY;
    if (!apiKey) {
        throw new Error('SMS delivery is not configured. Set TEXTBEE_API_KEY in server/.env.');
    }
    if (!recipient.mobile) throw new Error('Borrower has no mobile number on record.');

    const toAscii = value => String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '');
    const name = toAscii(recipient.name).slice(0, 35);
    const equipmentName = toAscii(borrowing.equipmentName || 'equipment').slice(0, 45);
    const message = `Hello Ma'am/Sir ${name}, this is UCC MIS Office. Just reminding you that ${equipmentName} is overdue. Please return it ASAP. Thank you.`;
    if (message.length > 160) {
        throw new Error('SMS reminder exceeds 160 characters and may incur multipart carrier charges.');
    }

    const payload = {
        recipients: [recipient.mobile],
        message
    };
    if (process.env.TEXTBEE_DEVICE_ID) {
        payload.deviceId = process.env.TEXTBEE_DEVICE_ID;
    }

    const response = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        const detail = result?.message || result?.error || `TextBee returned HTTP ${response.status}.`;
        throw new Error(`SMS delivery failed: ${detail}`);
    }
}

const overdueNotificationLocks = new Set();
let overdueScanRunning = false;

async function sendOverdueNotification(borrowing, type, { automatic = false } = {}) {
    if (!['email', 'sms'].includes(type)) throw new Error('Notification type must be email or sms.');
    if (!['borrowed', 'pending_extension'].includes(borrowing.status)) {
        throw new Error('This borrowing is no longer eligible for overdue reminders.');
    }
    const dueAt = getBorrowingDueAt(borrowing);
    if (!dueAt || dueAt.getTime() > Date.now()) {
        throw new Error('This borrowing is not overdue.');
    }

    const id = getBorrowingRecordId(borrowing);
    const sentField = type === 'email' ? 'overdueEmailSentAt' : 'overdueSmsSentAt';
    const attemptedField = type === 'email' ? 'overdueEmailAttemptedAt' : 'overdueSmsAttemptedAt';
    const lockKey = `${id}:${type}`;
    if (overdueNotificationLocks.has(lockKey)) {
        return { sent: false, skipped: true, message: 'A reminder is already being sent.' };
    }
    if (automatic && borrowing[sentField]) {
        return { sent: false, skipped: true, message: 'Automatic reminder was already sent.' };
    }
    if (automatic && type === 'sms' && borrowing[attemptedField]) {
        return { sent: false, skipped: true, message: 'Automatic SMS reminder was already attempted.' };
    }
    if (automatic && type === 'email' && borrowing[attemptedField] &&
        Date.now() - new Date(borrowing[attemptedField]).getTime() < 15 * 60 * 1000) {
        return { sent: false, skipped: true, message: 'Automatic email reminder retry is waiting.' };
    }

    overdueNotificationLocks.add(lockKey);
    try {
        if (automatic) {
            borrowing = await updateBorrowingRecord(id, { [attemptedField]: new Date().toISOString() });
        }
        const recipient = await getOverdueRecipient(borrowing);
        if (type === 'email') await deliverOverdueEmail(borrowing, recipient);
        else await deliverOverdueSms(borrowing, recipient);
        try {
            await updateBorrowingRecord(id, { [sentField]: new Date().toISOString() });
        } catch (error) {
            console.error(`Overdue ${type} reminder was delivered but its sent status could not be saved for borrowing ${id}:`, error);
            return {
                sent: true,
                trackingSaved: false,
                message: `${type === 'email' ? 'Email' : 'SMS'} was sent to ${recipient.name}, but MISLend could not save its sent status. Check the server error and apply server/migrations/20261018_add_overdue_notification_tracking.sql if needed. Do not resend until this is resolved.`
            };
        }
        return { sent: true, message: `${type === 'email' ? 'Email' : 'SMS'} reminder sent to ${recipient.name}.` };
    } finally {
        overdueNotificationLocks.delete(lockKey);
    }
}

async function runOverdueNotificationScan() {
    if (overdueScanRunning) return { skipped: true, reason: 'A scan is already running.' };
    overdueScanRunning = true;
    const summary = { checked: 0, sentEmail: 0, sentSms: 0, failures: 0 };
    try {
        let borrowings;
        if (useLocalStore || !supabase) {
            borrowings = (localStore.borrowings || []).filter(item =>
                ['borrowed', 'pending_extension'].includes(item.status)
            );
        } else {
            const { data, error } = await supabase.from('borrowings')
                .select('*')
                .in('status', ['borrowed', 'pending_extension'])
                .limit(500);
            if (error) throw error;
            borrowings = data || [];
        }

        for (const borrowing of borrowings) {
            const dueAt = getBorrowingDueAt(borrowing);
            if (!dueAt || dueAt.getTime() > Date.now()) continue;
            summary.checked++;
            for (const type of ['email', 'sms']) {
                try {
                    const result = await sendOverdueNotification(borrowing, type, { automatic: true });
                    if (result.sent) {
                        if (type === 'email') summary.sentEmail++;
                        else summary.sentSms++;
                    }
                } catch (error) {
                    summary.failures++;
                    console.error(`Automatic overdue ${type} reminder failed for borrowing ${getBorrowingRecordId(borrowing)}:`, error.message);
                }
            }
        }
        return summary;
    } finally {
        overdueScanRunning = false;
    }
}

// -----------------------------------------------------------------------------
// Helper functions for collection mapping
// -----------------------------------------------------------------------------
function mapCollectionName(name) {
    if (name === 'adminAuditLogs') return 'admin_audit_logs';
    return name;
}

function sanitizeDocumentForViewer(collection, document, user) {
    if (collection !== 'borrowings' || !document || user?.role === 'admin' ||
        !Array.isArray(document.activityHistory)) {
        return document;
    }

    return {
        ...document,
        activityHistory: document.activityHistory.map(event => {
            if (!event || typeof event !== 'object' || Array.isArray(event)) {
                return event;
            }
            const { staffPhotoURL, ...safeEvent } = event;
            return safeEvent;
        })
    };
}

// -----------------------------------------------------------------------------
// Auth Routes
// -----------------------------------------------------------------------------

app.post('/api/auth/admin-create-user', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can create user accounts.' });
        }

        const creator = await findUserProfile(req.user.uid);
        if (!creator || creator.role !== 'admin') {
            return res.status(403).json({ error: 'Administrator profile could not be verified.' });
        }

        const {
            email, password, name, firstName, middleInitial, lastName, role,
            studentId, facultyId, adminId, course, department, yearLevel,
            section, yearSection, mobile, gender, photoURL, isHeadAdmin
        } = req.body || {};

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ error: 'Enter a valid email address.' });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Password should be at least 6 characters.' });
        }
        if (!['student', 'professor', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Select a valid user role.' });
        }
        if (!firstName?.trim() || !lastName?.trim()) {
            return res.status(400).json({ error: 'First name and last name are required.' });
        }
        if ((role === 'student' && (!studentId || studentId.length !== 10)) ||
            (role === 'professor' && (!facultyId || facultyId.length !== 10)) ||
            (role === 'admin' && !adminId)) {
            return res.status(400).json({ error: 'A valid ID is required for the selected role.' });
        }
        if ((role === 'student' || role === 'professor') && (!mobile || !/^\d{11}$/.test(mobile))) {
            return res.status(400).json({ error: 'Mobile number must be exactly 11 digits.' });
        }
        if (role === 'student' && (!gender || !course || !yearLevel || !section)) {
            return res.status(400).json({ error: 'Student gender, course, year level, and section are required.' });
        }
        if (role === 'professor' && (!gender || !department)) {
            return res.status(400).json({ error: 'Faculty gender and department are required.' });
        }
        if (isHeadAdmin && !await authorizeHeadAdminPrivilegeGrant(req, res, null, role)) {
            return;
        }

        const accountId = role === 'student' ? studentId : role === 'professor' ? facultyId : adminId;
        if (useLocalStore || !supabase) {
            const duplicate = localStore.users.find(user =>
                user.email?.toLowerCase() === normalizedEmail ||
                (accountId && [user.studentId, user.facultyId, user.adminId].includes(accountId))
            );
            if (duplicate) {
                return res.status(400).json({ error: 'Email or ID is already registered.' });
            }
        } else {
            const duplicateQueries = [
                supabase.from('users').select('id').eq('email', normalizedEmail).limit(1)
            ];
            if (accountId) {
                duplicateQueries.push(
                    supabase.from('users').select('id').eq('studentId', accountId).limit(1),
                    supabase.from('users').select('id').eq('facultyId', accountId).limit(1),
                    supabase.from('users').select('id').eq('admin_id', accountId).limit(1)
                );
            }
            const duplicateResults = await Promise.all(duplicateQueries);
            const duplicateError = duplicateResults.find(result => result.error);
            if (duplicateError) throw duplicateError.error;
            if (duplicateResults.some(result => result.data?.length)) {
                return res.status(400).json({ error: 'Email or ID is already registered.' });
            }
        }

        const newUid = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const profile = {
            id: newUid,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10),
            name: name || `${firstName.trim()} ${middleInitial ? `${middleInitial.trim().replace(/\.+$/, '')}. ` : ''}${lastName.trim()}`,
            firstName: firstName.trim(),
            middleInitial: (middleInitial || '').trim().replace(/\.+$/, ''),
            lastName: lastName.trim(),
            role,
            status: 'approved',
            studentId: role === 'student' ? studentId : null,
            facultyId: role === 'professor' ? facultyId : null,
            adminId: role === 'admin' ? adminId : null,
            course: role === 'student' ? course : null,
            department: role === 'professor' ? department : null,
            yearLevel: role === 'student' ? yearLevel : null,
            section: role === 'student' ? section : null,
            yearSection: role === 'student' ? (yearSection || `${yearLevel}-${section}`) : null,
            mobile: role === 'admin' ? null : mobile,
            gender: role === 'admin' ? null : gender,
            photoURL: photoURL || null,
            isHeadAdmin: role === 'admin' && isHeadAdmin === true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (useLocalStore || !supabase) {
            localStore.users.push(profile);
            saveLocalStore(localStore);
        } else {
            const docToSave = sanitizeDocForSupabase('users', profile);
            docToSave.admin_id = docToSave.adminId;
            delete docToSave.adminId;
            const { error } = await supabase.from('users').insert([docToSave]);
            if (error) throw error;
        }

        const { password: _, ...safeProfile } = profile;
        return res.status(201).json({ user: safeProfile });
    } catch (err) {
        console.error('Admin account creation error:', err);
        return res.status(500).json({ error: err.message || 'Failed to create user account.' });
    }
});

// Sign Up / Register
app.get('/api/auth/turnstile-config', (req, res) => {
    const siteKey = process.env.TURNSTILE_SITE_KEY;
    if (!siteKey) {
        return res.status(503).json({ error: 'Registration verification is not configured.' });
    }
    return res.json({ siteKey });
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const {
            email, password, name, firstName, middleInitial, lastName,
            role, studentId, facultyId, course, department, yearLevel,
            section, yearSection, mobile, gender, turnstileToken
        } = req.body;

        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (!turnstileSecret) {
            console.error('Registration rejected: TURNSTILE_SECRET_KEY is not configured.');
            return res.status(503).json({ error: 'Registration verification is not configured. Please contact support.' });
        }
        if (typeof turnstileToken !== 'string' || !turnstileToken.trim()) {
            return res.status(400).json({ error: 'Please complete the human verification check.' });
        }

        const verificationResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: turnstileSecret,
                response: turnstileToken.trim(),
                ...(req.ip ? { remoteip: req.ip } : {})
            })
        });
        if (!verificationResponse.ok) {
            console.error(`Turnstile verification request failed with status ${verificationResponse.status}.`);
            return res.status(502).json({ error: 'Unable to verify the human check. Please try again.' });
        }
        const verification = await verificationResponse.json();
        if (!verification.success) {
            console.warn('Registration rejected: Turnstile verification failed.', verification['error-codes'] || []);
            return res.status(400).json({ error: 'Human verification failed or expired. Please try again.' });
        }

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        if (!['student', 'professor'].includes(role || 'student')) {
            return res.status(400).json({ error: 'Registration is only available for student and faculty accounts.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const idValue = studentId || facultyId;
        const registrationData = {
            name: name || `${firstName || ''} ${lastName || ''}`.trim(),
            firstName: firstName || '',
            middleInitial: middleInitial || '',
            lastName: lastName || '',
            role: role || 'student',
            status: 'pending',
            studentId: studentId || null,
            facultyId: facultyId || null,
            course: course || null,
            department: department || null,
            yearLevel: yearLevel || null,
            section: section || null,
            yearSection: yearSection || (yearLevel && section ? `${yearLevel}-${section}` : null),
            mobile: mobile || null,
            gender: gender || null
        };
        const canCompletePendingRegistration = user =>
            user.status === 'pending' &&
            user.role !== 'admin' &&
            !user.studentId &&
            !user.facultyId &&
            (!user.firstName || !user.lastName);

        // Check for existing user
        if (useLocalStore || !supabase) {
            const existingEmail = localStore.users.find(u => u.email?.toLowerCase() === normalizedEmail);
            if (existingEmail) {
                if (!canCompletePendingRegistration(existingEmail) ||
                    !(await bcrypt.compare(password, existingEmail.password))) {
                    return res.status(400).json({ error: 'This email is already registered.' });
                }
                const conflictingId = localStore.users.find(u =>
                    u.id !== existingEmail.id && (u.studentId === idValue || u.facultyId === idValue)
                );
                if (idValue && conflictingId) {
                    return res.status(400).json({ error: 'This ID is already registered.' });
                }

                Object.assign(existingEmail, registrationData, {
                    email: normalizedEmail,
                    updatedAt: new Date().toISOString()
                });
                saveLocalStore(localStore);
                const token = jwt.sign(
                    { uid: existingEmail.id, email: existingEmail.email, role: existingEmail.role },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );
                const { password: _, ...userData } = existingEmail;
                return res.json({ user: userData, token });
            }
            if (idValue) {
                const existingId = localStore.users.find(u => u.studentId === idValue || u.facultyId === idValue);
                if (existingId) {
                    return res.status(400).json({ error: 'This ID is already registered.' });
                }
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

            const newUser = {
                id: newUid,
                email: normalizedEmail,
                password: hashedPassword,
                ...registrationData,
                photoURL: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            localStore.users.push(newUser);
            saveLocalStore(localStore);

            const token = jwt.sign({ uid: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
            const { password: _, ...userData } = newUser;
            return res.json({ user: userData, token });
        } else {
            // Check Supabase
            const { data: existingUsers, error: checkErr } = await supabase
                .from('users')
                .select('*')
                .or(`email.eq.${normalizedEmail}${idValue ? `,studentId.eq.${idValue},facultyId.eq.${idValue}` : ''}`);

            if (checkErr) throw checkErr;
            if (existingUsers && existingUsers.length > 0) {
                const existingEmail = existingUsers.find(u => u.email?.toLowerCase() === normalizedEmail);
                const idConflict = existingUsers.some(u =>
                    u !== existingEmail && (u.studentId === idValue || u.facultyId === idValue)
                );
                if (existingEmail &&
                    canCompletePendingRegistration(existingEmail) &&
                    !idConflict &&
                    await bcrypt.compare(password, existingEmail.password)) {
                    const { data: completedUser, error: updateError } = await supabase
                        .from('users')
                        .update({ ...registrationData, email: normalizedEmail, updatedAt: new Date().toISOString() })
                        .eq('id', existingEmail.id)
                        .select()
                        .single();
                    if (updateError) throw updateError;

                    const uid = existingEmail.users_id || String(existingEmail.id);
                    const token = jwt.sign({ uid, email: normalizedEmail, role: completedUser.role }, JWT_SECRET, { expiresIn: '7d' });
                    const { password: _, ...userData } = completedUser;
                    return res.json({ user: { ...userData, id: uid }, token });
                }
                return res.status(400).json({
                    error: idConflict ? 'Email or ID is already registered.' : 'This email is already registered.'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

            const newUser = {
                id: newUid,
                email: normalizedEmail,
                password: hashedPassword,
                ...registrationData,
                photoURL: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const userToSave = sanitizeDocForSupabase('users', newUser);
            const { data, error } = await supabase.from('users').insert([userToSave]).select();
            if (error) throw error;
            if (!data || !data[0]) {
                throw new Error('Registration was saved but the account profile could not be loaded. Please retry or contact an administrator.');
            }

            const token = jwt.sign({ uid: newUid, email: normalizedEmail, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
            const { password: _, ...userData } = data[0];
            userData.id = newUid;
            return res.json({ user: userData, token });
        }
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: err.message || 'Registration failed.' });
    }
});

app.post('/api/notifications/overdue-reminder', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can send overdue reminders.' });
        }
        const { borrowingId, type } = req.body || {};
        if (!borrowingId || !['email', 'sms'].includes(type)) {
            return res.status(400).json({ error: 'A borrowing ID and valid reminder type are required.' });
        }

        const borrowing = await getBorrowingRecord(borrowingId);
        if (!borrowing) return res.status(404).json({ error: 'Borrowing record was not found.' });
        const result = await sendOverdueNotification(borrowing, type);
        return res.json(result);
    } catch (error) {
        console.error('Manual overdue reminder failed:', error);
        const status = /not overdue|no .* on record|no longer eligible/i.test(error.message) ? 400 : 502;
        return res.status(status).json({ error: error.message || 'Unable to send overdue reminder.' });
    }
});

app.post('/api/admin/users/:id/approve', async (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can approve accounts.' });
    }

    try {
        const adminProfile = await findUserProfile(req.user.uid);
        if (!adminProfile || adminProfile.role !== 'admin') {
            return res.status(403).json({ error: 'Administrator account could not be verified.' });
        }

        const userId = req.params.id;
        const targetProfile = await findUserProfile(userId);
        if (!targetProfile) return res.status(404).json({ error: 'Account was not found.' });
        if (!['student', 'professor'].includes(targetProfile.role)) {
            return res.status(400).json({ error: 'Only student and professor accounts can be approved.' });
        }
        if (targetProfile.status !== 'pending') {
            return res.status(409).json({ error: 'This account is no longer pending approval.' });
        }

        const approval = {
            status: 'approved',
            updatedAt: new Date().toISOString()
        };
        if (useLocalStore || !supabase) {
            const target = (localStore.users || []).find(user =>
                String(user.id) === String(userId) || String(user.users_id) === String(userId)
            );
            if (!target || target.status !== 'pending') {
                return res.status(409).json({ error: 'This account is no longer pending approval.' });
            }
            Object.assign(target, approval);
            saveLocalStore(localStore);
        } else {
            let updateQuery = supabase.from('users').update(approval).eq('status', 'pending');
            updateQuery = applyRecordIdFilter(updateQuery, 'users', userId);
            const { data, error } = await updateQuery.select().maybeSingle();
            if (error) throw error;
            if (!data) return res.status(409).json({ error: 'This account is no longer pending approval.' });
        }

        let emailSent = false;
        let emailError = '';
        if (!targetProfile.email) {
            emailError = 'The account does not have an email address.';
        } else {
            try {
                const transporter = getMailTransporter();
                if (!transporter) {
                    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env.');
                }

                const recipientName = targetProfile.name ||
                    [targetProfile.firstName, targetProfile.lastName].filter(Boolean).join(' ') ||
                    'MISLend user';
                const safeName = escapeEmailHtml(recipientName);
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"MISLend" <${process.env.SMTP_USER}>`,
                    to: targetProfile.email,
                    subject: 'Your MISLend account is ready',
                    text: `Hello ${recipientName},\n\nYour MISLend account has been approved and is now active. You can sign in and start using MISLend.\n\nThank you,\nUCC MIS Office`,
                    html: `<p>Hello <strong>${safeName}</strong>,</p><p>Your MISLend account has been approved and is now active. You can sign in and start using MISLend.</p><p>Thank you,<br>UCC MIS Office</p>`
                });
                emailSent = true;
            } catch (error) {
                emailError = error.message || 'Email delivery failed.';
                console.error(`Account activation email failed for account ${userId}:`, error);
            }
        }

        return res.json({ success: true, emailSent, emailError });
    } catch (error) {
        console.error(`Account approval failed for ${req.params.id}:`, error);
        return res.status(500).json({ error: error.message || 'Unable to approve account.' });
    }
});

app.post('/api/admin/users/:id/suspend', async (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can suspend accounts.' });
    }

    try {
        const adminProfile = await findUserProfile(req.user.uid);
        if (!adminProfile || adminProfile.role !== 'admin') {
            return res.status(403).json({ error: 'Administrator account could not be verified.' });
        }

        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        if (reason.length < 5 || reason.length > 500) {
            return res.status(400).json({ error: 'Enter a suspension reason between 5 and 500 characters.' });
        }

        const userId = req.params.id;
        const targetProfile = await findUserProfile(userId);
        if (!targetProfile) return res.status(404).json({ error: 'Account was not found.' });
        if (!['student', 'professor'].includes(targetProfile.role)) {
            return res.status(400).json({ error: 'Only student and professor accounts can be suspended.' });
        }
        if (targetProfile.status === 'suspended') {
            return res.status(409).json({ error: 'This account is already suspended.' });
        }

        const suspension = {
            status: 'suspended',
            suspendedAt: new Date().toISOString(),
            suspendedReason: reason,
            updatedAt: new Date().toISOString()
        };

        if (useLocalStore || !supabase) {
            const target = (localStore.users || []).find(user =>
                String(user.id) === String(userId) || String(user.users_id) === String(userId)
            );
            if (!target) return res.status(404).json({ error: 'Account was not found.' });
            Object.assign(target, suspension);
            saveLocalStore(localStore);
        } else {
            let updateQuery = supabase.from('users').update(suspension);
            updateQuery = applyRecordIdFilter(updateQuery, 'users', userId);
            const { data, error } = await updateQuery.select().maybeSingle();
            if (error?.code === '42703' || error?.code === 'PGRST204') {
                throw new Error('Database schema is missing suspendedReason. Run server/migrations/20261018_add_suspended_reason.sql in the Supabase SQL Editor.');
            }
            if (error) throw error;
            if (!data) return res.status(404).json({ error: 'Account was not found.' });
        }

        let emailSent = false;
        let emailError = '';
        if (!targetProfile.email) {
            emailError = 'The account does not have an email address.';
        } else {
            try {
                const transporter = getMailTransporter();
                if (!transporter) {
                    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env.');
                }

                const recipientName = targetProfile.name || targetProfile.firstName || 'MISLend user';
                const safeName = escapeEmailHtml(recipientName);
                const safeReason = escapeEmailHtml(reason);
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"MISLend" <${process.env.SMTP_USER}>`,
                    to: targetProfile.email,
                    subject: 'MISLend account suspended',
                    text: `Hello ${recipientName},\n\nYour MISLend account has been suspended.\n\nReason: ${reason}\n\nPlease contact the MIS office if you have questions.`,
                    html: `<p>Hello <strong>${safeName}</strong>,</p><p>Your MISLend account has been suspended.</p><p><strong>Reason:</strong> ${safeReason}</p><p>Please contact the MIS office if you have questions.</p>`
                });
                emailSent = true;
            } catch (error) {
                emailError = error.message || 'Email delivery failed.';
                console.error(`Suspension email failed for account ${userId}:`, error);
            }
        }

        return res.json({ success: true, emailSent, emailError });
    } catch (error) {
        console.error(`Account suspension failed for ${req.params.id}:`, error);
        return res.status(500).json({ error: error.message || 'Unable to suspend account.' });
    }
});

app.get('/api/notifications/overdue-scan', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return res.status(503).json({ error: 'Scheduled notification scan is not configured.' });
    }
    const authorization = req.headers.authorization || '';
    const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expectedBuffer = Buffer.from(cronSecret);
    const providedBuffer = Buffer.from(providedSecret);
    if (expectedBuffer.length !== providedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return res.status(401).json({ error: 'Unauthorized scheduled notification request.' });
    }

    try {
        const summary = await runOverdueNotificationScan();
        return res.json({ success: true, ...summary });
    } catch (error) {
        console.error('Scheduled overdue notification scan failed:', error);
        return res.status(500).json({ error: 'Scheduled overdue notification scan failed.' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { emailOrId, password } = req.body;
        if (!emailOrId || !password) {
            return res.status(400).json({ error: 'Please provide both ID/Email and password.' });
        }

        let userRecord = null;

        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(u => 
                (u.email && u.email.toLowerCase() === emailOrId.toLowerCase()) ||
                u.studentId === emailOrId ||
                u.facultyId === emailOrId ||
                u.adminId === emailOrId
            );
        } else {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .or(`email.ilike.${emailOrId},studentId.eq.${emailOrId},facultyId.eq.${emailOrId},adminId.eq.${emailOrId}`)
                .limit(1);

            if (error) throw error;
            if (data && data.length > 0) {
                userRecord = data[0];
            }
        }

        if (!userRecord) {
            return res.status(401).json({ error: 'Invalid email/ID or password.' });
        }

        // Verify password
        const passwordMatches = await bcrypt.compare(password, userRecord.password);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email/ID or password.' });
        }

        // Account status checks
        if (userRecord.role === 'student' || userRecord.role === 'professor') {
            if (userRecord.status === 'suspended') {
                return res.status(403).json({ error: 'Your account has been suspended. Please contact administrator.' });
            }
            if (userRecord.status === 'pending') {
                return res.status(403).json({ error: 'Your account is waiting for admin approval.' });
            }
        }

        const token = jwt.sign(
            { uid: userRecord.id, email: userRecord.email, role: userRecord.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const { password: _, ...userData } = userRecord;
        return res.json({ user: userData, token });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: err.message || 'Login failed.' });
    }
});

// Current User profile
app.get('/api/auth/me', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated.' });
        }

        let userRecord = null;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(u => u.id === req.user.uid);
        } else {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', req.user.uid)
                .single();
            if (error) throw error;
            userRecord = data;
        }

        if (!userRecord) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const { password: _, ...userData } = userRecord;
        return res.json({ user: userData });
    } catch (err) {
        console.error('Auth me error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Request a 6-digit OTP code for password changes and forgotten passwords.
app.post('/api/auth/send-password-otp', async (req, res) => {
    try {
        const purpose = req.body && req.body.purpose ? req.body.purpose : 'change';
        if (!['change', 'forgot'].includes(purpose)) {
            return res.status(400).json({ error: 'Invalid password verification purpose.' });
        }

        let email = req.body && req.body.email;
        if (!email && req.user && req.user.email) {
            email = req.user.email;
        }
        if (!email && req.user && req.user.uid) {
            if (useLocalStore || !supabase) {
                const u = localStore.users.find(x => x.id === req.user.uid);
                if (u) email = u.email;
            } else {
                const { data } = await supabase.from('users').select('email').eq('id', req.user.uid).single();
                if (data) email = data.email;
            }
        }

        if (typeof email !== 'string' || !email.trim()) {
            return res.status(400).json({ error: 'Valid user email address is required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ error: 'Valid user email address is required.' });
        }
        const emailSearchPattern = normalizedEmail.replace(/[\\%_]/g, '\\$&');

        // Check if user exists
        let userRecord = null;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(u => u.email?.toLowerCase() === normalizedEmail);
        } else {
            const { data, error } = await supabase.from('users').select('id, name, firstName, email').ilike('email', emailSearchPattern).maybeSingle();
            if (error) throw error;
            userRecord = data;
        }

        if (!userRecord) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        // Generate 6-digit cryptographically strong OTP code
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        passwordOtps.set(normalizedEmail, {
            code: otpCode,
            expiresAt,
            attempts: 0,
            purpose
        });

        const masked = maskEmail(normalizedEmail);
        let transporter;
        try {
            transporter = getMailTransporter();
        } catch (configErr) {
            passwordOtps.delete(normalizedEmail);
            console.error('[Email OTP] Invalid SMTP configuration:', configErr.message);
            return res.status(503).json({ error: configErr.message });
        }
        let emailSent = false;

        if (transporter) {
            try {
                const userName = userRecord.name || userRecord.firstName || 'User';
                const isForgotPassword = purpose === 'forgot';
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"MISLend Security" <${process.env.SMTP_USER}>`,
                    to: normalizedEmail,
                    subject: isForgotPassword
                        ? 'MISLend - Password Reset Verification Code'
                        : 'MISLend - Your Password Verification Code',
                    html: `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                            <div style="text-align: center; margin-bottom: 24px;">
                                <h2 style="color: #1e40af; margin: 0; font-size: 22px;">MISLend Equipment Management</h2>
                                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">${isForgotPassword ? 'Password Reset' : 'Password Change Authorization'}</p>
                            </div>
                            <p style="font-size: 15px; color: #1e293b;">Hello <strong>${userName}</strong>,</p>
                            <p style="font-size: 14px; color: #475569; line-height: 1.5;">You requested to ${isForgotPassword ? 'reset' : 'change'} your MISLend account password. Please enter the following 6-digit verification code to ${isForgotPassword ? 'reset your password' : 'confirm this change'}:</p>
                            <div style="text-align: center; margin: 28px 0;">
                                <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1e40af; background: #eff6ff; padding: 14px 28px; border-radius: 10px; border: 1px dashed #3b82f6;">
                                    ${otpCode}
                                </span>
                            </div>
                            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">This code will expire in <strong>10 minutes</strong>. If you did not make this request, please contact your laboratory administrator right away.</p>
                            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0 16px;" />
                            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">University of Caloocan City &bull; MISLend System</p>
                        </div>
                    `
                });
                emailSent = true;
                console.log(`[Email OTP] Verification email successfully sent to ${normalizedEmail}`);
            } catch (mailErr) {
                passwordOtps.delete(normalizedEmail);
                console.error('[Email OTP] SMTP delivery failed:', mailErr);
                if (mailErr.responseCode === 534) {
                    return res.status(502).json({
                        error: 'Google requires an App Password for SMTP. Enable 2-Step Verification, create a Google App Password, set it as SMTP_PASS, and restart the backend.'
                    });
                }
                if (mailErr.code === 'EAUTH' || mailErr.responseCode === 535) {
                    return res.status(502).json({
                        error: 'Gmail rejected the SMTP login. Check SMTP_USER and replace SMTP_PASS with a current Google App Password, then restart the backend.'
                    });
                }
                return res.status(502).json({
                    error: 'Email delivery failed. Check the SMTP host, port, and security settings, then try again.'
                });
            }
        } else if (process.env.NODE_ENV === 'production') {
            passwordOtps.delete(normalizedEmail);
            return res.status(503).json({ error: 'Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env.' });
        } else {
            console.log(`[PASSWORD OTP] Development code for ${normalizedEmail}: ${otpCode} (expires in 10 minutes)`);
        }

        return res.json({
            success: true,
            message: `Verification code sent to ${masked}.`,
            maskedEmail: masked,
            emailSent: emailSent,
            devCode: !emailSent ? otpCode : undefined
        });
    } catch (err) {
        console.error('Send password OTP error:', err);
        return res.status(500).json({ error: err.message || 'Failed to send verification code.' });
    }
});

// Change Password for logged in user (with Email OTP verification)
app.post('/api/auth/change-password', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const { currentPassword, newPassword, otpCode } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Require OTP code
        if (!otpCode || !String(otpCode).trim()) {
            return res.status(400).json({ error: 'Email verification code is required. Please click "Send Code" first.' });
        }

        let userRecord = null;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(u => u.id === req.user.uid);
            if (!userRecord) return res.status(404).json({ error: 'User not found.' });

            if (currentPassword) {
                const matches = await bcrypt.compare(currentPassword, userRecord.password);
                if (!matches) return res.status(400).json({ error: 'Current password incorrect.' });
            }
        } else {
            const { data, error } = await supabase.from('users').select('*').eq('id', req.user.uid).single();
            if (error || !data) return res.status(404).json({ error: 'User not found.' });
            userRecord = data;

            if (currentPassword) {
                const matches = await bcrypt.compare(currentPassword, data.password);
                if (!matches) return res.status(400).json({ error: 'Current password incorrect.' });
            }
        }

        // Validate OTP code
        const userEmail = (userRecord.email || req.user.email || '').toLowerCase().trim();
        const storedOtp = passwordOtps.get(userEmail);

        if (!storedOtp || storedOtp.purpose !== 'change') {
            return res.status(400).json({ error: 'No active verification code found. Please click "Send Code" to receive one.' });
        }

        if (Date.now() > storedOtp.expiresAt) {
            passwordOtps.delete(userEmail);
            return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
        }

        if (storedOtp.code !== String(otpCode).trim()) {
            storedOtp.attempts = (storedOtp.attempts || 0) + 1;
            if (storedOtp.attempts >= 5) {
                passwordOtps.delete(userEmail);
                return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
            }
            return res.status(400).json({ error: 'Invalid verification code. Please check your email and try again.' });
        }

        // Verification successful — delete OTP
        passwordOtps.delete(userEmail);

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();

        if (useLocalStore || !supabase) {
            userRecord.password = hashedPassword;
            userRecord.updatedAt = now;
            saveLocalStore(localStore);
        } else {
            await supabase.from('users').update({ password: hashedPassword, updatedAt: now }).eq('id', req.user.uid);
        }

        return res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        console.error('Change password error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Admin Set User Password
app.post('/api/auth/admin-set-password', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only authenticated admins can change other users’ passwords.' });
        }

        const { uid, password } = req.body;
        if (!uid || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Valid user ID and password (min 6 chars) required.' });
        }
        if (String(uid) === String(req.user.uid)) {
            return res.status(400).json({ error: 'Use Change Password to update your own password.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        if (useLocalStore || !supabase) {
            const user = localStore.users.find(u => u.id === uid);
            if (!user) return res.status(404).json({ error: 'User not found.' });
            user.password = hashedPassword;
            user.updatedAt = new Date().toISOString();
            saveLocalStore(localStore);
        } else {
            const { error } = await supabase.from('users').update({
                password: hashedPassword,
                updatedAt: new Date().toISOString()
            }).eq('id', uid);
            if (error) throw error;
        }

        return res.json({ ok: true, message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Admin set password error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Send a password reset link without revealing whether an email has an account.
app.post('/api/auth/forgot-password-reset-link', async (req, res) => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Enter a valid email address.' });
        }

        const emailSearchPattern = email.replace(/[\\%_]/g, '\\$&');
        let userRecord;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(user => user.email?.toLowerCase() === email);
        } else {
            const { data, error } = await supabase
                .from('users')
                .select('id, email, name, firstName')
                .ilike('email', emailSearchPattern)
                .maybeSingle();
            if (error) throw error;
            userRecord = data;
        }

        if (userRecord) {
            let baseUrl;
            if (process.env.APP_BASE_URL) {
                baseUrl = process.env.APP_BASE_URL.trim().replace(/\/+$/, '');
            } else if (process.env.NODE_ENV === 'production') {
                return res.status(503).json({ error: 'Password reset email is not configured. Please contact an administrator.' });
            } else {
                baseUrl = `http://localhost:${PORT}`;
            }

            let parsedBaseUrl;
            try {
                parsedBaseUrl = new URL(baseUrl);
            } catch {
                return res.status(503).json({ error: 'Password reset email is not configured. Please contact an administrator.' });
            }
            if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) ||
                (process.env.NODE_ENV === 'production' && parsedBaseUrl.protocol !== 'https:')) {
                return res.status(503).json({ error: 'Password reset email is not configured. Please contact an administrator.' });
            }

            let transporter;
            try {
                transporter = getMailTransporter();
            } catch (configErr) {
                console.error('[Forgot Password Link] Invalid SMTP configuration:', configErr.message);
                return res.status(503).json({ error: 'Password reset email is not configured. Please contact an administrator.' });
            }
            if (!transporter) {
                return res.status(503).json({ error: 'Password reset email is not configured. Please contact an administrator.' });
            }

            const resetToken = jwt.sign(
                { uid: String(userRecord.id), purpose: 'forgot-password-reset' },
                JWT_SECRET,
                { expiresIn: '1h' }
            );
            const resetLink = new URL('/reset-password.html', `${parsedBaseUrl.origin}/`);
            resetLink.searchParams.set('token', resetToken);
            const userName = String(userRecord.name || userRecord.firstName || 'User');
            const escapedUserName = userName.replace(/[&<>"']/g, char => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[char]);

            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"MISLend Security" <${process.env.SMTP_USER}>`,
                    to: userRecord.email,
                    subject: 'MISLend - Password Reset Link',
                    text: `Hello ${userName},\n\nWe received a request to reset the password for your MISLend account. Use this link within one hour to choose a new password:\n\n${resetLink.href}\n\nIf you did not request this, you can ignore this email.`,
                    html: `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                            <h2 style="color: #1e40af; margin: 0 0 20px;">MISLend Password Reset</h2>
                            <p style="font-size: 15px; color: #1e293b;">Hello <strong>${escapedUserName}</strong>,</p>
                            <p style="font-size: 14px; color: #475569; line-height: 1.5;">We received a request to reset your MISLend account password. Click below to choose a new password. This link expires in one hour.</p>
                            <p style="text-align: center; margin: 28px 0;">
                                <a href="${resetLink.href}" style="display: inline-block; padding: 12px 22px; border-radius: 8px; background: #1e40af; color: #ffffff; font-weight: 600; text-decoration: none;">Choose a New Password</a>
                            </p>
                            <p style="font-size: 12px; color: #64748b; line-height: 1.5;">If the button does not work, copy and paste this link into your browser:<br><a href="${resetLink.href}">${resetLink.href}</a></p>
                            <p style="font-size: 12px; color: #94a3b8;">If you did not request this, you can ignore this email.</p>
                        </div>
                    `
                });
            } catch (mailErr) {
                console.error('[Forgot Password Link] Email delivery failed:', mailErr);
                return res.status(502).json({ error: 'Could not send the password reset email. Check the email service and try again.' });
            }
        }

        return res.json({
            success: true,
            message: 'If an account exists for that email, a password reset link has been sent.'
        });
    } catch (err) {
        console.error('[Forgot Password Link] Request failed:', err);
        return res.status(500).json({ error: 'Unable to request a password reset link. Please try again.' });
    }
});

// Send a signed, expiring password-reset link to a user from the admin dashboard.
app.post('/api/auth/admin-send-password-reset-link', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can send password reset links.' });
        }

        const { uid } = req.body || {};
        if (typeof uid !== 'string' || !uid.trim()) {
            return res.status(400).json({ error: 'A valid user ID is required.' });
        }

        let userRecord;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(user => user.id === uid.trim());
        } else {
            const { data, error } = await supabase
                .from('users')
                .select('id, email, name, firstName, updatedAt')
                .eq('id', uid.trim())
                .maybeSingle();
            if (error) throw error;
            userRecord = data;
        }

        if (!userRecord || !userRecord.email) {
            return res.status(404).json({ error: 'User account or email address not found.' });
        }

        let baseUrl;
        if (process.env.APP_BASE_URL) {
            baseUrl = process.env.APP_BASE_URL.trim().replace(/\/+$/, '');
        } else if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ error: 'Set APP_BASE_URL to the public MISLend website URL before sending reset links.' });
        } else {
            baseUrl = `http://localhost:${PORT}`;
        }

        let parsedBaseUrl;
        try {
            parsedBaseUrl = new URL(baseUrl);
        } catch {
            return res.status(503).json({ error: 'APP_BASE_URL must be a valid public website URL.' });
        }
        if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) ||
            (process.env.NODE_ENV === 'production' && parsedBaseUrl.protocol !== 'https:')) {
            return res.status(503).json({ error: 'APP_BASE_URL must use HTTPS in production.' });
        }

        let transporter;
        try {
            transporter = getMailTransporter();
        } catch (configErr) {
            console.error('[Password Reset Link] Invalid SMTP configuration:', configErr.message);
            return res.status(503).json({ error: configErr.message });
        }
        if (!transporter) {
            return res.status(503).json({ error: 'Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.' });
        }

        const resetToken = jwt.sign(
            { uid: String(userRecord.id), purpose: 'admin-password-reset' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        const resetLink = new URL('/reset-password.html', `${parsedBaseUrl.origin}/`);
        resetLink.searchParams.set('token', resetToken);
        const userName = String(userRecord.name || userRecord.firstName || 'User');
        const escapedUserName = userName.replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);

        await transporter.sendMail({
            from: process.env.SMTP_FROM || `"MISLend Security" <${process.env.SMTP_USER}>`,
            to: userRecord.email,
            subject: 'MISLend - Password Reset Link',
            text: `Hello ${userName},\n\nAn administrator requested a password reset for your MISLend account. Use this link within one hour to choose a new password:\n\n${resetLink.href}\n\nIf you did not expect this email, you can ignore it.`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                    <h2 style="color: #1e40af; margin: 0 0 20px;">MISLend Password Reset</h2>
                    <p style="font-size: 15px; color: #1e293b;">Hello <strong>${escapedUserName}</strong>,</p>
                    <p style="font-size: 14px; color: #475569; line-height: 1.5;">An administrator requested a password reset for your MISLend account. Click below to choose a new password. This link expires in one hour.</p>
                    <p style="text-align: center; margin: 28px 0;">
                        <a href="${resetLink.href}" style="display: inline-block; padding: 12px 22px; border-radius: 8px; background: #1e40af; color: #ffffff; font-weight: 600; text-decoration: none;">Choose a New Password</a>
                    </p>
                    <p style="font-size: 12px; color: #64748b; line-height: 1.5;">If the button does not work, copy and paste this link into your browser:<br><a href="${resetLink.href}">${resetLink.href}</a></p>
                    <p style="font-size: 12px; color: #94a3b8;">If you did not expect this email, you can ignore it.</p>
                </div>
            `
        });

        return res.json({ success: true, message: `Password reset link sent to ${maskEmail(userRecord.email)}.` });
    } catch (err) {
        console.error('[Password Reset Link] Email delivery failed:', err);
        return res.status(502).json({ error: 'Could not send the password reset email. Check SMTP settings and try again.' });
    }
});

// Verify an emailed password-reset link without requiring an existing session.
app.get('/api/auth/password-reset-link/:token', async (req, res) => {
    try {
        const decoded = jwt.verify(req.params.token, JWT_SECRET);
        if (!['admin-password-reset', 'forgot-password-reset'].includes(decoded.purpose) ||
            typeof decoded.uid !== 'string' || !decoded.iat) {
            return res.status(400).json({ error: 'This password reset link is invalid. Request a new link.' });
        }

        let userRecord;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(user => user.id === decoded.uid);
        } else {
            const { data, error } = await supabase
                .from('users')
                .select('email, updatedAt')
                .eq('id', decoded.uid)
                .maybeSingle();
            if (error) throw error;
            userRecord = data;
        }

        if (!userRecord) {
            return res.status(404).json({ error: 'The account for this reset link could not be found.' });
        }
        if (userRecord.updatedAt && new Date(userRecord.updatedAt).getTime() > decoded.iat * 1000) {
            return res.status(400).json({ error: 'This password reset link has already been used or is no longer valid. Request a new link.' });
        }

        return res.json({ success: true, email: maskEmail(userRecord.email) });
    } catch (err) {
        if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
            return res.status(400).json({ error: 'This password reset link is invalid or expired. Request a new link.' });
        }
        console.error('[Password Reset Link] Verification failed:', err);
        return res.status(500).json({ error: 'Unable to verify this password reset link.' });
    }
});

// Complete a password reset using the emailed, expiring link.
app.post('/api/auth/password-reset-link', async (req, res) => {
    try {
        const { token, newPassword } = req.body || {};
        if (typeof token !== 'string' || !token) {
            return res.status(400).json({ error: 'A valid password reset link is required.' });
        }
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
                return res.status(400).json({ error: 'This password reset link is invalid or expired. Request a new link.' });
            }
            throw err;
        }
        if (!['admin-password-reset', 'forgot-password-reset'].includes(decoded.purpose) ||
            typeof decoded.uid !== 'string' || !decoded.iat) {
            return res.status(400).json({ error: 'This password reset link is invalid. Request a new link.' });
        }

        let userRecord;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(user => user.id === decoded.uid);
        } else {
            const { data, error } = await supabase
                .from('users')
                .select('id, updatedAt')
                .eq('id', decoded.uid)
                .maybeSingle();
            if (error) throw error;
            userRecord = data;
        }
        if (!userRecord) {
            return res.status(404).json({ error: 'The account for this reset link could not be found.' });
        }
        if (userRecord.updatedAt && new Date(userRecord.updatedAt).getTime() > decoded.iat * 1000) {
            return res.status(400).json({ error: 'This password reset link has already been used or is no longer valid. Request a new link.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updatedAt = new Date(Math.max(Date.now(), decoded.iat * 1000 + 1000)).toISOString();
        if (useLocalStore || !supabase) {
            userRecord.password = hashedPassword;
            userRecord.updatedAt = updatedAt;
            saveLocalStore(localStore);
        } else {
            const { error } = await supabase.from('users')
                .update({ password: hashedPassword, updatedAt })
                .eq('id', userRecord.id);
            if (error) throw error;
        }

        return res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
        console.error('[Password Reset Link] Password update failed:', err);
        return res.status(500).json({ error: 'Unable to reset this password. Please try again.' });
    }
});

// Complete a forgotten-password reset after email OTP verification.
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otpCode, newPassword } = req.body || {};
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            return res.status(400).json({ error: 'A valid email address is required.' });
        }
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        if (!otpCode || !String(otpCode).trim()) {
            return res.status(400).json({ error: 'Email verification code is required.' });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const emailSearchPattern = normalizedEmail.replace(/[\\%_]/g, '\\$&');
        const storedOtp = passwordOtps.get(normalizedEmail);
        if (!storedOtp || storedOtp.purpose !== 'forgot') {
            return res.status(400).json({ error: 'No active password reset code found. Request a new code.' });
        }
        if (Date.now() > storedOtp.expiresAt) {
            passwordOtps.delete(normalizedEmail);
            return res.status(400).json({ error: 'Verification code has expired. Request a new code.' });
        }
        if (storedOtp.code !== String(otpCode).trim()) {
            storedOtp.attempts = (storedOtp.attempts || 0) + 1;
            if (storedOtp.attempts >= 5) {
                passwordOtps.delete(normalizedEmail);
                return res.status(400).json({ error: 'Too many incorrect attempts. Request a new code.' });
            }
            return res.status(400).json({ error: 'Invalid verification code. Check your email and try again.' });
        }

        let userRecord;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(user => user.email?.toLowerCase() === normalizedEmail);
        } else {
            const { data, error } = await supabase.from('users').select('id').ilike('email', emailSearchPattern).maybeSingle();
            if (error) throw error;
            userRecord = data;
        }
        if (!userRecord) {
            passwordOtps.delete(normalizedEmail);
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();
        if (useLocalStore || !supabase) {
            userRecord.password = hashedPassword;
            userRecord.updatedAt = now;
            saveLocalStore(localStore);
        } else {
            const { error } = await supabase.from('users')
                .update({ password: hashedPassword, updatedAt: now })
                .eq('id', userRecord.id);
            if (error) throw error;
        }

        passwordOtps.delete(normalizedEmail);
        return res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
        console.error('Forgot password reset error:', err);
        return res.status(500).json({ error: err.message || 'Failed to reset password.' });
    }
});

// -----------------------------------------------------------------------------
// Generic Collection CRUD & Query API
// -----------------------------------------------------------------------------

function extractMissingColumn(error) {
    if (!error || !error.message) return null;
    const msg = error.message;

    // PostgREST PGRST204: Could not find the 'equipmentCode' column of 'borrowings' in the schema cache
    const m1 = msg.match(/Could not find the '([^']+)' column/i);
    if (m1) return m1[1];

    // PostgREST: Could not find the column 'equipmentCode'
    const m2 = msg.match(/column '([^']+)'/i);
    if (m2) return m2[1];

    // Postgres 42703: column borrowings.equipmentCode does not exist or column "equipmentCode" does not exist
    const m3 = msg.match(/column "?(?:[\w]+\.)?([a-zA-Z0-9_]+)"? (?:does not exist|of relation)/i);
    if (m3) return m3[1];

    // General single-quoted token before 'column'
    const m4 = msg.match(/'([a-zA-Z0-9_]+)'\s*column/i);
    if (m4) return m4[1];

    return null;
}

function sanitizeDocForSupabase(col, record) {
    const docToSave = { ...record };
    const strId = docToSave.id ? String(docToSave.id) : `${col.substring(0, 3)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Populate table-specific string ID column
    if (col === 'users') docToSave.users_id = docToSave.users_id || strId;
    if (col === 'equipment') {
        docToSave.equipment_id = docToSave.equipment_id || strId;
        docToSave.equipmentId = docToSave.equipmentId || docToSave.equipment_id;
    }
    if (col === 'borrowings') docToSave.borrowings_id = docToSave.borrowings_id || strId;
    if (col === 'incidents') {
        docToSave.incidents_id = docToSave.incidents_id || strId;
        if (docToSave.reporterId && !docToSave.reportedBy) docToSave.reportedBy = docToSave.reporterId;
        if (docToSave.reportedBy && !docToSave.reporterId) docToSave.reporterId = docToSave.reportedBy;
    }
    if (col === 'messages') {
        docToSave.messages_id = docToSave.messages_id || strId;
        docToSave.text = docToSave.text || docToSave.message || '';
        docToSave.message = docToSave.message || docToSave.text || '';
    }
    if (col === 'feedback') docToSave.feedback_id = docToSave.feedback_id || strId;
    if (col === 'admin_audit_logs') docToSave.admin_audit_logs_id = docToSave.admin_audit_logs_id || strId;

    // Primary key 'id': If non-numeric, delete it so Postgres BIGSERIAL auto-increments
    if (docToSave.id !== undefined && !/^\d+$/.test(String(docToSave.id))) {
        delete docToSave.id;
    } else if (docToSave.id !== undefined && /^\d+$/.test(String(docToSave.id))) {
        docToSave.id = parseInt(docToSave.id, 10);
    }

    // Foreign key BIGINT columns (user_id, equipment_id, borrowing_id, incident_id):
    // Omit non-numeric string values to prevent Postgres 22P02 invalid input syntax for bigint
    const bigintFkCols = ['user_id', 'borrowing_id', 'incident_id'];
    if (col !== 'equipment') bigintFkCols.push('equipment_id');

    for (const fk of bigintFkCols) {
        if (docToSave[fk] !== undefined && docToSave[fk] !== null) {
            if (!/^\d+$/.test(String(docToSave[fk]))) {
                delete docToSave[fk];
            } else {
                docToSave[fk] = parseInt(docToSave[fk], 10);
            }
        }
    }

    if (col !== 'messages') {
        docToSave.createdAt = docToSave.createdAt || new Date().toISOString();
        docToSave.updatedAt = new Date().toISOString();
    }

    return docToSave;
}

// Query documents in collection
app.post('/api/data/:collection/query', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const { filters = [], orderBy, orderDir = 'asc', limit } = req.body;

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            let items = [...localStore[col]];

            // Apply filters: [field, op, value]
            for (const [field, op, val] of filters) {
                items = items.filter(item => {
                    const actual = item[field];
                    if (op === '==' || op === 'eq') return actual === val;
                    if (op === '!=' || op === 'neq') return actual !== val;
                    if (op === '>' || op === 'gt') return actual > val;
                    if (op === '>=' || op === 'gte') return actual >= val;
                    if (op === '<' || op === 'lt') return actual < val;
                    if (op === '<=' || op === 'lte') return actual <= val;
                    if (op === 'in') return Array.isArray(val) && val.includes(actual);
                    if (op === 'array-contains') return Array.isArray(actual) && actual.includes(val);
                    return true;
                });
            }

            // Ordering
            if (orderBy) {
                items.sort((a, b) => {
                    const valA = a[orderBy];
                    const valB = b[orderBy];
                    if (valA === valB) return 0;
                    if (valA == null) return 1;
                    if (valB == null) return -1;
                    const res = valA > valB ? 1 : -1;
                    return orderDir === 'desc' ? -res : res;
                });
            }

            // Limit
            if (limit && limit > 0) {
                items = items.slice(0, limit);
            }

            // Strip password from users list for security
            if (col === 'users') {
                items = items.map(({ password, ...u }) => u);
            }

            items = items.map(item => sanitizeDocumentForViewer(col, item, req.user));
            return res.json({ data: items });
        } else {
            let query = supabase.from(col).select('*');

            // Apply filters — skip any filter on a column that doesn't exist in Supabase
            let skipQuery = false;
            for (const [field, op, val] of filters) {
                if (field === 'id' || field === '__name__') {
                    if (op === 'in') query = query.in('id', val);
                    else if (op === '==' || op === 'eq') query = query.eq('id', val);
                } else {
                    if (op === '==' || op === 'eq') query = query.eq(field, val);
                    else if (op === '!=' || op === 'neq') query = query.neq(field, val);
                    else if (op === '>' || op === 'gt') query = query.gt(field, val);
                    else if (op === '>=' || op === 'gte') query = query.gte(field, val);
                    else if (op === '<' || op === 'lt') query = query.lt(field, val);
                    else if (op === '<=' || op === 'lte') query = query.lte(field, val);
                    else if (op === 'in') query = query.in(field, val);
                }
            }

            if (orderBy) {
                query = query.order(orderBy, { ascending: orderDir === 'asc' });
            }

            if (limit && limit > 0) {
                query = query.limit(limit);
            }

            const { data, error } = await query;

            // Gracefully handle "column does not exist" errors (Postgres 42703)
            // This happens when frontend queries a column not yet in the Supabase schema.
            // Return empty results instead of crashing.
            if (error) {
                if (error.code === '42703' || error.code === 'PGRST204') {
                    if (col === 'equipment' && extractMissingColumn(error) === 'equipmentId') {
                        return res.status(500).json({
                            error: 'The equipment table is missing the equipmentId column. Run server/migrations/20261003_add_equipment_id.sql in the Supabase SQL Editor.',
                            code: 'equipment_id_schema_missing'
                        });
                    }
                    console.warn(`[Query] Column not found in "${col}" — returning empty. Details: ${error.message}`);
                    return res.json({ data: [] });
                }
                throw error;
            }

            let items = data || [];
            if (col === 'users') {
                items = items.map(({ password, ...u }) => ({
                    ...u,
                    adminId: u.adminId || u.admin_id || ''
                }));
            }

            items = items.map(item => sanitizeDocumentForViewer(col, item, req.user));
            return res.json({ data: items });
        }
    } catch (err) {
        console.error(`Query error on ${req.params.collection}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

function applyRecordIdFilter(query, col, idVal) {
    if (/^\d+$/.test(String(idVal))) {
        return query.eq('id', parseInt(idVal, 10));
    }
    if (col === 'users') {
        return query.eq('users_id', String(idVal));
    }
    if (col === 'equipment') {
        return query.or(`equipment_id.eq.${idVal},equipmentId.eq.${idVal}`);
    }
    if (col === 'borrowings') {
        return query.eq('borrowings_id', String(idVal));
    }
    if (col === 'incidents') {
        return query.eq('incidents_id', String(idVal));
    }
    if (col === 'messages') {
        return query.eq('messages_id', String(idVal));
    }
    if (col === 'feedback') {
        return query.eq('feedback_id', String(idVal));
    }
    if (col === 'admin_audit_logs') {
        return query.eq('admin_audit_logs_id', String(idVal));
    }
    return query.eq('id', idVal);
}

// Get document by ID
app.get('/api/data/:collection/:id', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const { id } = req.params;

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            const item = localStore[col].find(i => String(i.id) === String(id) || i.users_id === id || i.equipment_id === id || i.equipmentId === id || i.borrowings_id === id);
            if (!item) return res.status(404).json({ error: 'Document not found' });
            if (col === 'users') {
                const { password, ...safeUser } = item;
                return res.json({ data: safeUser });
            }
            return res.json({ data: sanitizeDocumentForViewer(col, item, req.user) });
        } else {
            let query = supabase.from(col).select('*');
            query = applyRecordIdFilter(query, col, id);
            const { data, error } = await query.maybeSingle();
            if (error) {
                console.error(`Get error on ${req.params.collection}/${req.params.id}:`, error);
                if (col === 'borrowings' && error.code === '42P01') {
                    return res.status(500).json({
                        error: 'The borrowings table is missing from this Supabase project. Run server/schema.sql first, then run the activity-history migration.'
                    });
                }
                return res.status(500).json({ error: error.message || 'Unable to load document.' });
            }
            if (!data) return res.status(404).json({ error: 'Document not found' });
            if (col === 'users') {
                const { password, ...safeUser } = data;
                return res.json({ data: safeUser });
            }
            return res.json({ data: sanitizeDocumentForViewer(col, data, req.user) });
        }
    } catch (err) {
        console.error(`Get error on ${req.params.collection}/${req.params.id}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

// Add new document to collection
app.post('/api/data/:collection', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const record = req.body || {};
        if (col === 'users' && requestsHeadAdminPrivilege(record) &&
            !await authorizeHeadAdminPrivilegeGrant(req, res, null, record.role)) {
            return;
        }
        const docToSave = sanitizeDocForSupabase(col, record);

        if (useLocalStore || !supabase) {
            docToSave.id = docToSave.id || (localStore[col] ? localStore[col].length + 1 : 1);
            if (!localStore[col]) localStore[col] = [];
            localStore[col].push(docToSave);
            saveLocalStore(localStore);
            return res.json({ data: sanitizeDocumentForViewer(col, docToSave, req.user) });
        } else {
            let data = null;
            let error = null;
            let maxRetries = 10;

            while (maxRetries > 0) {
                const res = await supabase.from(col).insert([docToSave]).select();
                data = res.data;
                error = res.error;

                if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                    const missingCol = extractMissingColumn(error);
                    if (missingCol && docToSave[missingCol] !== undefined) {
                        if (col === 'incidents') {
                            throw new Error(`Incident report schema is missing the "${missingCol}" column. Run server/migrations/20261016_add_official_incident_report_fields.sql in the Supabase SQL Editor.`);
                        }
                        console.warn(`[Insert] Stripping unknown column "${missingCol}" from ${col}`);
                        delete docToSave[missingCol];
                        maxRetries--;
                        continue;
                    }
                }
                break;
            }

            if (error) throw error;
            return res.json({ data: sanitizeDocumentForViewer(col, data ? data[0] : docToSave, req.user) });
        }
    } catch (err) {
        console.error(`Add error on ${req.params.collection}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

// Update / Set document (PUT)
app.put('/api/data/:collection/:id', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const { id } = req.params;
        const updates = req.body || {};
        if (col === 'users' && requestsHeadAdminPrivilege(updates) &&
            !await authorizeHeadAdminPrivilegeGrant(req, res, id, updates.role)) {
            return;
        }

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            const idx = localStore[col].findIndex(i => String(i.id) === String(id) || i.users_id === id || i.equipment_id === id || i.equipmentId === id || i.borrowings_id === id);
            const now = new Date().toISOString();

            if (idx >= 0) {
                localStore[col][idx] = {
                    ...localStore[col][idx],
                    ...updates,
                    updatedAt: now
                };
            } else {
                localStore[col].push({
                    ...updates,
                    createdAt: now,
                    updatedAt: now
                });
            }
            saveLocalStore(localStore);
            return res.json({ data: sanitizeDocumentForViewer(col, { id, ...updates }, req.user) });
        } else {
            const now = new Date().toISOString();
            let payload = { ...updates, updatedAt: now };
            if (/^\d+$/.test(String(id))) {
                payload.id = parseInt(id, 10);
            } else {
                delete payload.id;
            }
            let data = null;
            let error = null;
            let maxRetries = 10;

            while (maxRetries > 0) {
                let upsertQuery = supabase.from(col).upsert([payload]);
                const res = await upsertQuery.select();
                data = res.data;
                error = res.error;

                if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                    const missingCol = extractMissingColumn(error);
                    if (col === 'equipment' && missingCol === 'equipmentId') {
                        throw new Error('The equipment table is missing the equipmentId column. Run server/migrations/20261003_add_equipment_id.sql in the Supabase SQL Editor.');
                    }
                    if (missingCol && payload[missingCol] !== undefined) {
                        console.warn(`[Upsert] Stripping unknown column "${missingCol}" from ${col}`);
                        delete payload[missingCol];
                        maxRetries--;
                        continue;
                    }
                }
                break;
            }

            if (error) throw error;
            return res.json({ data: sanitizeDocumentForViewer(col, data ? data[0] : { id, ...updates }, req.user) });
        }
    } catch (err) {
        console.error(`Put error on ${req.params.collection}/${req.params.id}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

// Partial update document (PATCH)
app.patch('/api/data/:collection/:id', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const { id } = req.params;
        const updates = req.body || {};
        let approver = null;

        if (col === 'borrowings' && updates.status === 'pending_extension' &&
            (typeof updates.extensionReason !== 'string' || !updates.extensionReason.trim())) {
            return res.status(400).json({ error: 'A reason is required for an extension request.' });
        }

        if (col === 'users' && requestsHeadAdminPrivilege(updates) &&
            !await authorizeHeadAdminPrivilegeGrant(req, res, id, updates.role)) {
            return;
        }

        if (col === 'incidents' && updates.status === 'approved') {
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Only an authenticated Head Admin can approve incident reports.' });
            }

            const adminProfile = await findUserProfile(req.user.uid);
            if (!hasHeadAdminPrivileges(adminProfile)) {
                return res.status(403).json({ error: 'Only the Head Admin can approve incident reports.' });
            }

            const approverName = adminProfile.name ||
                [adminProfile.firstName, adminProfile.lastName].filter(Boolean).join(' ') ||
                adminProfile.email;
            const approverEmail = adminProfile.email || req.user.email || '';
            approver = {
                approvedBy: approverEmail ? `${approverName} (${approverEmail})` : approverName,
                approvedByName: approverName,
                approvedByEmail: approverEmail,
                approvedById: String(req.user.uid),
                approvedAt: new Date().toISOString()
            };
        }

        // Remove sentinel keys like FieldValue.delete() marked by frontend as __DELETE__
        const sanitized = {};
        for (const [k, v] of Object.entries(updates)) {
            if (v === '__DELETE__') {
                sanitized[k] = null;
            } else {
                sanitized[k] = v;
            }
        }
        if (approver) Object.assign(sanitized, approver);
        sanitized.updatedAt = new Date().toISOString();
        if (sanitized.id !== undefined && !/^\d+$/.test(String(sanitized.id))) {
            delete sanitized.id;
        }

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            const item = localStore[col].find(i => String(i.id) === String(id) || i.users_id === id || i.equipment_id === id || i.equipmentId === id || i.borrowings_id === id);
            if (!item) return res.status(404).json({ error: 'Document not found' });

            Object.assign(item, sanitized);
            saveLocalStore(localStore);
            return res.json({ data: sanitizeDocumentForViewer(col, item, req.user) });
        } else {
            let data = null;
            let error = null;
            let maxRetries = 10;

            while (maxRetries > 0) {
                let updateQuery = supabase.from(col).update(sanitized);
                updateQuery = applyRecordIdFilter(updateQuery, col, id);
                const res = await updateQuery.select();
                data = res.data;
                error = res.error;

                if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                    const missingCol = extractMissingColumn(error);
                    if (col === 'equipment' && missingCol === 'equipmentId') {
                        throw new Error('The equipment table is missing the equipmentId column. Run server/migrations/20261003_add_equipment_id.sql in the Supabase SQL Editor.');
                    }
                    if (missingCol && sanitized[missingCol] !== undefined) {
                        if (col === 'users') {
                            throw new Error(`User profile schema is missing the "${missingCol}" column. Run server/migrations/20261016_add_profile_edit_fields.sql in the Supabase SQL Editor.`);
                        }
                        if (col === 'borrowings' && missingCol === 'activityHistory') {
                            throw new Error('Borrowing history schema is missing the "activityHistory" column. Run server/migrations/20261020_add_borrowing_activity_history.sql in the Supabase SQL Editor.');
                        }
                        if (col === 'borrowings' && missingCol === 'returnPhoto') {
                            throw new Error('Borrowing return-photo schema is missing the "returnPhoto" column. Run server/migrations/20261025_add_return_item_photo.sql in the Supabase SQL Editor.');
                        }
                        if (col === 'incidents' && approver) {
                            throw new Error(`Incident approval schema is missing the "${missingCol}" column. Run server/migrations/20261016_restrict_incident_approval.sql in the Supabase SQL Editor.`);
                        }
                        console.warn(`[Update] Stripping unknown column "${missingCol}" from ${col}`);
                        delete sanitized[missingCol];
                        maxRetries--;
                        continue;
                    }
                }
                break;
            }

            if (error) throw error;
            if (col === 'users' && (!data || data.length === 0)) {
                return res.status(404).json({ error: 'Profile record not found. Sign out and sign in again, then retry.' });
            }
            return res.json({ data: sanitizeDocumentForViewer(col, data ? data[0] : sanitized, req.user) });
        }
    } catch (err) {
        console.error(`Patch error on ${req.params.collection}/${req.params.id}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

// Delete document
app.delete('/api/data/:collection/:id', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const { id } = req.params;

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            localStore[col] = localStore[col].filter(i => String(i.id) !== String(id) && i.users_id !== id && i.equipment_id !== id && i.equipmentId !== id && i.borrowings_id !== id);
            saveLocalStore(localStore);
            return res.json({ success: true, id });
        } else {
            let delQuery = supabase.from(col).delete();
            delQuery = applyRecordIdFilter(delQuery, col, id);
            const { error } = await delQuery;
            if (error) throw error;
            return res.json({ success: true, id });
        }
    } catch (err) {
        console.error(`Delete error on ${req.params.collection}/${req.params.id}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

// Subcollection Messages: GET /api/data/incidents/:id/messages
app.get('/api/data/incidents/:id/messages', async (req, res) => {
    try {
        const incidentId = req.params.id;

        if (useLocalStore || !supabase) {
            if (!localStore.messages) localStore.messages = [];
            const list = localStore.messages
                .filter(m => m.incidentId === incidentId)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            return res.json({ data: list });
        } else {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('incidentId', incidentId)
                .order('timestamp', { ascending: true });
            if (error) throw error;
            return res.json({ data: data || [] });
        }
    } catch (err) {
        console.error('Messages fetch error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Subcollection Messages: POST /api/data/incidents/:id/messages
app.post('/api/data/incidents/:id/messages', async (req, res) => {
    try {
        const incidentId = req.params.id;
        const msg = req.body || {};

        if (req.user?.role !== 'admin') {
            let incident = null;
            if (useLocalStore || !supabase) {
                incident = (localStore.incidents || []).find(item =>
                    String(item.id) === String(incidentId) ||
                    String(item.incidents_id) === String(incidentId)
                );
            } else {
                let incidentQuery = supabase.from('incidents').select('status');
                incidentQuery = applyRecordIdFilter(incidentQuery, 'incidents', incidentId);
                const { data, error } = await incidentQuery.maybeSingle();
                if (error) throw error;
                incident = data;
            }

            if (!incident) {
                return res.status(404).json({ error: 'Incident report not found.' });
            }
            if (['approved', 'resolved'].includes(String(incident.status || '').toLowerCase())) {
                return res.status(403).json({ error: 'This incident conversation is read-only.' });
            }
        }

        const id = msg.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const newMsg = {
            ...msg,
            id,
            incidentId,
            timestamp: msg.timestamp || new Date().toISOString()
        };

        if (useLocalStore || !supabase) {
            if (!localStore.messages) localStore.messages = [];
            localStore.messages.push(newMsg);
            saveLocalStore(localStore);
            return res.json({ data: newMsg });
        } else {
            const msgToSave = sanitizeDocForSupabase('messages', newMsg);
            let data = null;
            let error = null;
            let maxRetries = 10;
            while (maxRetries > 0) {
                const res = await supabase.from('messages').insert([msgToSave]).select();
                data = res.data;
                error = res.error;
                if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                    const missingCol = extractMissingColumn(error);
                    if (missingCol && msgToSave[missingCol] !== undefined) {
                        console.warn(`[Insert Message] Stripping unknown column "${missingCol}" from messages`);
                        delete msgToSave[missingCol];
                        maxRetries--;
                        continue;
                    }
                }
                break;
            }
            if (error) throw error;
            return res.json({ data: data ? data[0] : msgToSave });
        }
    } catch (err) {
        console.error('Messages add error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Batch operations (replaces db.batch())
app.post('/api/batch', async (req, res) => {
    const operations = req.body?.operations || [];
    try {
        for (const op of operations) {
            const col = mapCollectionName(op.collection);
            const { type, id, data } = op;

            if (useLocalStore || !supabase) {
                if (!localStore[col]) localStore[col] = [];

                if (type === 'set') {
                    const idx = localStore[col].findIndex(i => i.id === id);
                    const now = new Date().toISOString();
                    if (idx >= 0) {
                        localStore[col][idx] = { ...localStore[col][idx], ...data, id, updatedAt: now };
                    } else {
                        localStore[col].push({ ...data, id, createdAt: now, updatedAt: now });
                    }
                } else if (type === 'update') {
                    const item = localStore[col].find(i => i.id === id);
                    if (item) {
                        const sanitized = {};
                        for (const [k, v] of Object.entries(data || {})) {
                            sanitized[k] = v === '__DELETE__' ? null : v;
                        }
                        Object.assign(item, sanitized, { updatedAt: new Date().toISOString() });
                    }
                } else if (type === 'delete') {
                    localStore[col] = localStore[col].filter(i => i.id !== id);
                }
            } else {
                if (type === 'set') {
                    const docToSave = sanitizeDocForSupabase(col, { ...data, id });
                    let maxRetries = 10;
                    while (maxRetries > 0) {
                        const resInsert = await supabase.from(col).insert([docToSave]);
                        if (resInsert.error && (resInsert.error.code === '42703' || resInsert.error.code === 'PGRST204')) {
                            const missingCol = extractMissingColumn(resInsert.error);
                            if (missingCol && docToSave[missingCol] !== undefined) {
                                console.warn(`[Batch Set] Stripping unknown column "${missingCol}" from ${col}`);
                                delete docToSave[missingCol];
                                maxRetries--;
                                continue;
                            }
                        }
                        if (resInsert.error) throw resInsert.error;
                        break;
                    }
                } else if (type === 'update') {
                    const sanitized = {};
                    for (const [k, v] of Object.entries(data || {})) {
                        sanitized[k] = v === '__DELETE__' ? null : v;
                    }
                    sanitized.updatedAt = new Date().toISOString();
                    if (sanitized.id !== undefined && !/^\d+$/.test(String(sanitized.id))) {
                        delete sanitized.id;
                    }

                    let maxRetries = 10;
                    while (maxRetries > 0) {
                        let q = supabase.from(col).update(sanitized);
                        q = applyRecordIdFilter(q, col, id);
                        const resUpdate = await q;
                        if (resUpdate.error && (resUpdate.error.code === '42703' || resUpdate.error.code === 'PGRST204')) {
                            const missingCol = extractMissingColumn(resUpdate.error);
                            if (missingCol && sanitized[missingCol] !== undefined) {
                                if (col === 'borrowings' && missingCol === 'activityHistory') {
                                    throw new Error('Borrowing history schema is missing the "activityHistory" column. Run server/migrations/20261020_add_borrowing_activity_history.sql in the Supabase SQL Editor.');
                                }
                                if (col === 'borrowings' && missingCol === 'returnPhoto') {
                                    throw new Error('Borrowing return-photo schema is missing the "returnPhoto" column. Run server/migrations/20261025_add_return_item_photo.sql in the Supabase SQL Editor.');
                                }
                                console.warn(`[Batch Update] Stripping unknown column "${missingCol}" from ${col}`);
                                delete sanitized[missingCol];
                                maxRetries--;
                                continue;
                            }
                        }
                        if (resUpdate.error) throw resUpdate.error;
                        break;
                    }
                } else if (type === 'delete') {
                    let q = supabase.from(col).delete();
                    q = applyRecordIdFilter(q, col, id);
                    const { error } = await q;
                    if (error) throw error;
                }
            }
        }

        if (useLocalStore || !supabase) {
            saveLocalStore(localStore);
        }

        return res.json({ success: true, count: operations.length });
    } catch (err) {
        console.error('Batch error:', err);
        if (operations?.some(op => mapCollectionName(op.collection) === 'borrowings') && err.code === '42P01') {
            return res.status(500).json({
                error: 'The borrowings table is missing from this Supabase project. Run server/schema.sql first, then run the activity-history migration.'
            });
        }
        return res.status(500).json({ error: err.message });
    }
});

// Server status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        database: useLocalStore ? 'local_fallback' : 'supabase_sql',
        supabaseConfigured: !isPlaceholderCredentials,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`  MISLend Backend Server is running on port ${PORT}`);
        console.log(`  http://localhost:${PORT}`);
        console.log(`  Database Mode: ${useLocalStore ? 'Local Storage / SQLite fallback' : 'Supabase SQL'}`);
        console.log(`=======================================================`);
        runOverdueNotificationScan().catch(error =>
            console.error('Initial overdue notification scan failed:', error)
        );
        const overdueScanInterval = setInterval(() => {
            runOverdueNotificationScan().catch(error =>
                console.error('Scheduled overdue notification scan failed:', error)
            );
        }, 60 * 1000);
        overdueScanInterval.unref();
    });
}

module.exports = app;
