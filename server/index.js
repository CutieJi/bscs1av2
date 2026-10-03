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

// -----------------------------------------------------------------------------
// Helper functions for collection mapping
// -----------------------------------------------------------------------------
function mapCollectionName(name) {
    if (name === 'adminAuditLogs') return 'admin_audit_logs';
    return name;
}

// -----------------------------------------------------------------------------
// Auth Routes
// -----------------------------------------------------------------------------

// Sign Up / Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const {
            email, password, name, firstName, middleInitial, lastName,
            role, studentId, facultyId, course, department, yearLevel,
            section, yearSection, mobile, gender
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const idValue = studentId || facultyId;

        // Check for existing user
        if (useLocalStore || !supabase) {
            const existingEmail = localStore.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (existingEmail) {
                return res.status(400).json({ error: 'This email is already registered.' });
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
                email,
                password: hashedPassword,
                name: name || `${firstName || ''} ${lastName || ''}`.trim(),
                firstName: firstName || '',
                middleInitial: middleInitial || '',
                lastName: lastName || '',
                role: role || 'student',
                status: 'pending', // Requires admin approval as per existing design
                studentId: studentId || null,
                facultyId: facultyId || null,
                course: course || null,
                department: department || null,
                yearLevel: yearLevel || null,
                section: section || null,
                yearSection: yearSection || (yearLevel && section ? `${yearLevel}-${section}` : null),
                mobile: mobile || null,
                gender: gender || null,
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
                .or(`email.eq.${email}${idValue ? `,studentId.eq.${idValue},facultyId.eq.${idValue}` : ''}`);

            if (checkErr) throw checkErr;
            if (existingUsers && existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email or ID is already registered.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

            const newUser = {
                id: newUid,
                email,
                password: hashedPassword,
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
                gender: gender || null,
                photoURL: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const { data, error } = await supabase.from('users').insert([newUser]).select();
            if (error) throw error;

            const token = jwt.sign({ uid: newUid, email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
            const { password: _, ...userData } = newUser;
            return res.json({ user: userData, token });
        }
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: err.message || 'Registration failed.' });
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

// Request 6-digit OTP code for Change Password
app.post('/api/auth/send-password-otp', async (req, res) => {
    try {
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

        if (!email) {
            return res.status(400).json({ error: 'Valid user email address is required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if user exists
        let userRecord = null;
        if (useLocalStore || !supabase) {
            userRecord = localStore.users.find(u => u.email?.toLowerCase() === normalizedEmail);
        } else {
            const { data } = await supabase.from('users').select('id, name, firstName, email').eq('email', normalizedEmail).single();
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
            attempts: 0
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
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"MISLend Security" <${process.env.SMTP_USER}>`,
                    to: normalizedEmail,
                    subject: 'MISLend - Your Password Verification Code',
                    html: `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                            <div style="text-align: center; margin-bottom: 24px;">
                                <h2 style="color: #1e40af; margin: 0; font-size: 22px;">MISLend Equipment Management</h2>
                                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Password Change Authorization</p>
                            </div>
                            <p style="font-size: 15px; color: #1e293b;">Hello <strong>${userName}</strong>,</p>
                            <p style="font-size: 14px; color: #475569; line-height: 1.5;">You requested to change your MISLend account password. Please enter the following 6-digit verification code to confirm this change:</p>
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

        if (!storedOtp) {
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

// Admin Set User Password (replaces firebase.functions adminSetUserPassword)
app.post('/api/auth/admin-set-password', async (req, res) => {
    try {
        const { uid, password } = req.body;
        if (!uid || !password || password.length < 6) {
            return res.status(400).json({ error: 'Valid user ID and password (min 6 chars) required.' });
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

// Password reset simulation
app.post('/api/auth/reset-password', (req, res) => {
    const { email } = req.body;
    return res.json({ success: true, message: `Password reset instructions sent to ${email}.` });
});

// -----------------------------------------------------------------------------
// Generic Collection CRUD & Query API
// -----------------------------------------------------------------------------

function extractMissingColumn(error) {
    if (!error || !error.message) return null;
    // Postgres 42703: column borrowings.wasOverdue does not exist
    const m1 = error.message.match(/column (?:[\w]+\.)?([a-zA-Z0-9_]+)/i);
    if (m1) return m1[1];
    // PostgREST PGRST204: Could not find the 'borrowedAt' column of 'equipment' in the schema cache
    const m2 = error.message.match(/['"]([a-zA-Z0-9_]+)['"]\s*column/i);
    if (m2) return m2[1];
    return null;
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
                    console.warn(`[Query] Column not found in "${col}" — returning empty. Details: ${error.message}`);
                    return res.json({ data: [] });
                }
                throw error;
            }

            let items = data || [];
            if (col === 'users') {
                items = items.map(({ password, ...u }) => u);
            }

            return res.json({ data: items });
        }
    } catch (err) {
        console.error(`Query error on ${req.params.collection}:`, err);
        return res.status(500).json({ error: err.message });
    }
});

// Get document by ID
app.get('/api/data/:collection/:id', async (req, res) => {
    try {
        const col = mapCollectionName(req.params.collection);
        const { id } = req.params;

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            const item = localStore[col].find(i => i.id === id);
            if (!item) return res.status(404).json({ error: 'Document not found' });
            if (col === 'users') {
                const { password, ...safeUser } = item;
                return res.json({ data: safeUser });
            }
            return res.json({ data: item });
        } else {
            const { data, error } = await supabase.from(col).select('*').eq('id', id).single();
            if (error || !data) return res.status(404).json({ error: 'Document not found' });
            if (col === 'users') {
                const { password, ...safeUser } = data;
                return res.json({ data: safeUser });
            }
            return res.json({ data });
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
        const id = record.id || `${col.substring(0, 3)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        const docToSave = {
            ...record,
            id,
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            localStore[col].push(docToSave);
            saveLocalStore(localStore);
            return res.json({ data: docToSave });
        } else {
            let { data, error } = await supabase.from(col).insert([docToSave]).select();
            // If column doesn't exist in Supabase, strip unknown fields and retry
            if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                const missingCol = extractMissingColumn(error);
                if (missingCol && docToSave[missingCol] !== undefined) {
                    console.warn(`[Insert] Stripping unknown column "${missingCol}" from ${col}`);
                    delete docToSave[missingCol];
                    const retry = await supabase.from(col).insert([docToSave]).select();
                    data = retry.data;
                    error = retry.error;
                }
            }
            if (error) throw error;
            return res.json({ data: data ? data[0] : docToSave });
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

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            const idx = localStore[col].findIndex(i => i.id === id);
            const now = new Date().toISOString();

            if (idx >= 0) {
                localStore[col][idx] = {
                    ...localStore[col][idx],
                    ...updates,
                    id,
                    updatedAt: now
                };
            } else {
                localStore[col].push({
                    ...updates,
                    id,
                    createdAt: now,
                    updatedAt: now
                });
            }
            saveLocalStore(localStore);
            return res.json({ data: { id, ...updates } });
        } else {
            const now = new Date().toISOString();
            let payload = { ...updates, id, updatedAt: now };
            let { data, error } = await supabase.from(col).upsert([payload]).select();
            // If column doesn't exist in Supabase, strip unknown fields and retry
            if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                const missingCol = extractMissingColumn(error);
                if (missingCol && payload[missingCol] !== undefined) {
                    console.warn(`[Upsert] Stripping unknown column "${missingCol}" from ${col}`);
                    delete payload[missingCol];
                    const retry = await supabase.from(col).upsert([payload]).select();
                    data = retry.data;
                    error = retry.error;
                }
            }
            if (error) throw error;
            return res.json({ data: data ? data[0] : { id, ...updates } });
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

        // Remove sentinel keys like FieldValue.delete() marked by frontend as __DELETE__
        const sanitized = {};
        for (const [k, v] of Object.entries(updates)) {
            if (v === '__DELETE__') {
                sanitized[k] = null;
            } else {
                sanitized[k] = v;
            }
        }
        sanitized.updatedAt = new Date().toISOString();

        if (useLocalStore || !supabase) {
            if (!localStore[col]) localStore[col] = [];
            const item = localStore[col].find(i => i.id === id);
            if (!item) return res.status(404).json({ error: 'Document not found' });

            Object.assign(item, sanitized);
            saveLocalStore(localStore);
            return res.json({ data: item });
        } else {
            let { data, error } = await supabase.from(col).update(sanitized).eq('id', id).select();
            // If column doesn't exist in Supabase, strip unknown fields and retry
            if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                const missingCol = extractMissingColumn(error);
                if (missingCol && sanitized[missingCol] !== undefined) {
                    console.warn(`[Update] Stripping unknown column "${missingCol}" from ${col}`);
                    delete sanitized[missingCol];
                    const retry = await supabase.from(col).update(sanitized).eq('id', id).select();
                    data = retry.data;
                    error = retry.error;
                }
            }
            if (error) throw error;
            return res.json({ data: data ? data[0] : sanitized });
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
            localStore[col] = localStore[col].filter(i => i.id !== id);
            saveLocalStore(localStore);
            return res.json({ success: true, id });
        } else {
            const { error } = await supabase.from(col).delete().eq('id', id);
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
            const { data, error } = await supabase.from('messages').insert([newMsg]).select();
            if (error) throw error;
            return res.json({ data: data ? data[0] : newMsg });
        }
    } catch (err) {
        console.error('Messages add error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Batch operations (replaces db.batch())
app.post('/api/batch', async (req, res) => {
    try {
        const { operations = [] } = req.body;

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
                    await supabase.from(col).upsert([{ ...data, id, updatedAt: new Date().toISOString() }]);
                } else if (type === 'update') {
                    const sanitized = {};
                    for (const [k, v] of Object.entries(data || {})) {
                        sanitized[k] = v === '__DELETE__' ? null : v;
                    }
                    sanitized.updatedAt = new Date().toISOString();
                    await supabase.from(col).update(sanitized).eq('id', id);
                } else if (type === 'delete') {
                    await supabase.from(col).delete().eq('id', id);
                }
            }
        }

        if (useLocalStore || !supabase) {
            saveLocalStore(localStore);
        }

        return res.json({ success: true, count: operations.length });
    } catch (err) {
        console.error('Batch error:', err);
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
    });
}

module.exports = app;
