/**
 * MISLend Core Application Client
 * Backend: Node.js + Express
 * Database: Supabase SQL (with local storage fallback)
 * 100% design and interface compatibility layer
 */

(function (window) {
    'use strict';

    // -------------------------------------------------------------------------
    // Backend API Base URL Configuration
    // -------------------------------------------------------------------------
    const API_BASE = (() => {
        const configuredBase = window.MISLEND_API_BASE || window.__MISLEND_API_BASE__;
        if (configuredBase) return String(configuredBase).replace(/\/+$/, '');

        const { protocol, hostname, port } = window.location;
        const isHttpLike = protocol === 'http:' || protocol === 'https:';

        if (!isHttpLike) {
            return 'http://localhost:3000/api';
        }

        if (port === '3000') {
            return '/api';
        }

        if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
            return 'http://localhost:3000/api';
        }

        return '/api';
    })();

    const TOKEN_KEY = 'mislend_token';
    const USER_KEY = 'mislend_user';

    // -------------------------------------------------------------------------
    // Helper: Wrap Timestamps to support .toDate()
    // -------------------------------------------------------------------------
    function wrapDocData(data) {
        if (!data || typeof data !== 'object') return data;
        const result = Array.isArray(data) ? [] : {};

        for (const [key, val] of Object.entries(data)) {
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
                const d = new Date(val);
                result[key] = {
                    toDate: () => d,
                    toMillis: () => d.getTime(),
                    toISOString: () => val,
                    toString: () => d.toString()
                };
            } else if (val && typeof val === 'object' && val.__type === 'serverTimestamp') {
                const d = new Date(val.value || Date.now());
                result[key] = {
                    toDate: () => d,
                    toMillis: () => d.getTime(),
                    toISOString: () => d.toISOString(),
                    toString: () => d.toString()
                };
            } else if (val && typeof val === 'object' && !val.toDate) {
                result[key] = wrapDocData(val);
            } else {
                result[key] = val;
            }
        }
        return result;
    }

    function unwrapData(data) {
        if (!data || typeof data !== 'object') return data;
        const result = Array.isArray(data) ? [] : {};

        for (const [key, val] of Object.entries(data)) {
            if (val && typeof val === 'object') {
                if (typeof val.toDate === 'function') {
                    result[key] = val.toDate().toISOString();
                } else if (val.__type === 'serverTimestamp') {
                    result[key] = new Date().toISOString();
                } else if (val.__type === 'increment') {
                    result[key] = val.value;
                } else {
                    result[key] = unwrapData(val);
                }
            } else {
                result[key] = val;
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // HTTP API Request Helper
    // -------------------------------------------------------------------------
    async function apiRequest(endpoint, method = 'GET', body = null, tokenOverride = null) {
        const token = tokenOverride !== null ? tokenOverride : localStorage.getItem(TOKEN_KEY);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const config = { method, headers };
        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.body = JSON.stringify(body);
        }

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, config);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = new Error(json.error || `Request failed with status ${res.status}`);
                err.status = res.status;
                err.code = json.code || (res.status === 401 ? 'auth/unauthenticated' : (res.status === 404 ? 'not-found' : 'request-failed'));
                throw err;
            }
            return json;
        } catch (err) {
            if (err.message && err.message.includes('Failed to fetch')) {
                console.error('[MISLend] Cannot connect to Node.js backend at', API_BASE);
                console.error('[MISLend] Ensure `node server/index.js` or `npm start` is running in the server directory.');
            }
            throw err;
        }
    }

    // -------------------------------------------------------------------------
    // DocumentSnapshot and QuerySnapshot
    // -------------------------------------------------------------------------
    class DocumentSnapshot {
        constructor(id, data, ref) {
            this.id = id;
            this._data = data;
            this.exists = !!data;
            this.ref = ref;
        }

        data() {
            return this._data ? wrapDocData({ ...this._data }) : undefined;
        }
    }

    class QuerySnapshot {
        constructor(docs, ref) {
            this.docs = docs;
            this.empty = docs.length === 0;
            this.size = docs.length;
            this.ref = ref;
        }

        forEach(callback) {
            this.docs.forEach(callback);
        }
    }

    // -------------------------------------------------------------------------
    // Firestore DocumentReference
    // -------------------------------------------------------------------------
    class DocumentReference {
        constructor(collectionName, id, parentDocId = null) {
            this.collectionName = collectionName;
            this.id = id;
            this.parentDocId = parentDocId;
        }

        async get() {
            try {
                let endpoint = `/data/${this.collectionName}/${this.id}`;
                if (this.parentDocId && this.collectionName === 'messages') {
                    // Fetch incident messages
                    const res = await apiRequest(`/data/incidents/${this.parentDocId}/messages`);
                    const found = (res.data || []).find(m => m.id === this.id);
                    return new DocumentSnapshot(this.id, found || null, this);
                }
                const res = await apiRequest(endpoint);
                return new DocumentSnapshot(this.id, res.data || null, this);
            } catch (err) {
                if (err.status === 404) {
                    return new DocumentSnapshot(this.id, null, this);
                }
                throw err;
            }
        }

        async set(data, options = {}) {
            const clean = unwrapData(data);
            const endpoint = `/data/${this.collectionName}/${this.id}`;
            await apiRequest(endpoint, 'PUT', clean);
            return this;
        }

        async update(data) {
            const clean = unwrapData(data);
            const endpoint = `/data/${this.collectionName}/${this.id}`;
            await apiRequest(endpoint, 'PATCH', clean);
            return this;
        }

        async delete() {
            const endpoint = `/data/${this.collectionName}/${this.id}`;
            await apiRequest(endpoint, 'DELETE');
            return true;
        }

        collection(subCollectionName) {
            return new CollectionReference(subCollectionName, this.id);
        }

        onSnapshot(onNext, onError) {
            let active = true;
            let lastHash = '';

            const fetchLatest = async () => {
                if (!active) return;
                try {
                    const snap = await this.get();
                    if (!active) return;
                    const serialized = JSON.stringify(snap.data() || {});
                    if (serialized !== lastHash) {
                        lastHash = serialized;
                        onNext(snap);
                    }
                } catch (e) {
                    if (onError) onError(e);
                    else console.error('onSnapshot doc error:', e);
                }
            };

            fetchLatest();
            const intervalId = setInterval(fetchLatest, 3000);

            return () => {
                active = false;
                clearInterval(intervalId);
            };
        }
    }

    // -------------------------------------------------------------------------
    // Firestore Query
    // -------------------------------------------------------------------------
    class Query {
        constructor(collectionName, filters = [], orderByField = null, orderDirection = 'asc', limitCount = null, parentDocId = null) {
            this.collectionName = collectionName;
            this.filters = [...filters];
            this.orderByField = orderByField;
            this.orderDirection = orderDirection;
            this.limitCount = limitCount;
            this.parentDocId = parentDocId;
        }

        where(field, op, val) {
            const mappedField = (field && typeof field === 'object' && field.__isDocId) ? 'id' : field;
            return new Query(
                this.collectionName,
                [...this.filters, [mappedField, op, val]],
                this.orderByField,
                this.orderDirection,
                this.limitCount,
                this.parentDocId
            );
        }

        orderBy(field, direction = 'asc') {
            return new Query(
                this.collectionName,
                this.filters,
                field,
                direction,
                this.limitCount,
                this.parentDocId
            );
        }

        limit(count) {
            return new Query(
                this.collectionName,
                this.filters,
                this.orderByField,
                this.orderDirection,
                count,
                this.parentDocId
            );
        }

        async get() {
            if (this.parentDocId && this.collectionName === 'messages') {
                const res = await apiRequest(`/data/incidents/${this.parentDocId}/messages`);
                let items = res.data || [];
                if (this.orderByField) {
                    items.sort((a, b) => {
                        const valA = a[this.orderByField];
                        const valB = b[this.orderByField];
                        return this.orderDirection === 'desc' ? (valA < valB ? 1 : -1) : (valA > valB ? 1 : -1);
                    });
                }
                const docs = items.map(item => new DocumentSnapshot(item.id, item, new DocumentReference('messages', item.id, this.parentDocId)));
                return new QuerySnapshot(docs, this);
            }

            const res = await apiRequest(`/data/${this.collectionName}/query`, 'POST', {
                filters: this.filters,
                orderBy: this.orderByField,
                orderDir: this.orderDirection,
                limit: this.limitCount
            });

            const items = res.data || [];
            const docs = items.map(item => new DocumentSnapshot(item.id, item, new DocumentReference(this.collectionName, item.id)));
            return new QuerySnapshot(docs, this);
        }

        onSnapshot(onNext, onError) {
            let active = true;
            let lastHash = '';

            const fetchLatest = async () => {
                if (!active) return;
                try {
                    const snap = await this.get();
                    if (!active) return;
                    const serialized = JSON.stringify(snap.docs.map(d => d.data()));
                    if (serialized !== lastHash) {
                        lastHash = serialized;
                        onNext(snap);
                    }
                } catch (e) {
                    if (onError) onError(e);
                    else console.error('onSnapshot query error:', e);
                }
            };

            fetchLatest();
            const intervalId = setInterval(fetchLatest, 3000);

            return () => {
                active = false;
                clearInterval(intervalId);
            };
        }
    }

    // -------------------------------------------------------------------------
    // Firestore CollectionReference
    // -------------------------------------------------------------------------
    class CollectionReference extends Query {
        constructor(collectionName, parentDocId = null) {
            super(collectionName, [], null, 'asc', null, parentDocId);
        }

        doc(id = null) {
            const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            return new DocumentReference(this.collectionName, docId, this.parentDocId);
        }

        async add(data) {
            const clean = unwrapData(data);
            if (this.parentDocId && this.collectionName === 'messages') {
                const res = await apiRequest(`/data/incidents/${this.parentDocId}/messages`, 'POST', clean);
                const saved = res.data;
                return new DocumentReference('messages', saved.id, this.parentDocId);
            }

            const res = await apiRequest(`/data/${this.collectionName}`, 'POST', clean);
            const saved = res.data;
            return new DocumentReference(this.collectionName, saved.id);
        }
    }

    // -------------------------------------------------------------------------
    // Firestore WriteBatch
    // -------------------------------------------------------------------------
    class WriteBatch {
        constructor() {
            this.operations = [];
        }

        set(docRef, data, options = {}) {
            this.operations.push({
                type: 'set',
                collection: docRef.collectionName,
                id: docRef.id,
                data: unwrapData(data)
            });
            return this;
        }

        update(docRef, data) {
            this.operations.push({
                type: 'update',
                collection: docRef.collectionName,
                id: docRef.id,
                data: unwrapData(data)
            });
            return this;
        }

        delete(docRef) {
            this.operations.push({
                type: 'delete',
                collection: docRef.collectionName,
                id: docRef.id
            });
            return this;
        }

        async commit() {
            if (this.operations.length === 0) return true;
            await apiRequest('/batch', 'POST', { operations: this.operations });
            return true;
        }
    }

    // -------------------------------------------------------------------------
    // Auth Client
    // -------------------------------------------------------------------------
    class AuthClient {
        constructor(isSecondary = false) {
            this.isSecondary = isSecondary;
            this._currentUser = null;
            this._listeners = [];

            if (!isSecondary) {
                this._initSession();
            }
        }

        _initSession() {
            try {
                const savedUser = localStorage.getItem(USER_KEY);
                if (savedUser) {
                    this._currentUser = this._createSessionUser(JSON.parse(savedUser));
                }
            } catch (e) {
                console.warn('Failed parsing stored user:', e);
            }
        }

        get currentUser() {
            return this._currentUser;
        }

        _createSessionUser(userData) {
            if (!userData) return null;
            const uid = userData.id || userData.uid;
            const userObj = {
                uid: uid,
                id: uid,
                email: userData.email || '',
                displayName: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
                photoURL: userData.photoURL || null,
                role: userData.role || 'student',
                status: userData.status || 'approved',
                getIdToken: async () => localStorage.getItem(TOKEN_KEY) || '',
                updateProfile: async (profile) => {
                    const updates = {};
                    if (profile.displayName !== undefined) {
                        updates.name = profile.displayName;
                        userObj.displayName = profile.displayName;
                    }
                    if (profile.photoURL !== undefined) {
                        updates.photoURL = profile.photoURL;
                        userObj.photoURL = profile.photoURL;
                    }
                    await apiRequest(`/data/users/${uid}`, 'PATCH', updates);
                    localStorage.setItem(USER_KEY, JSON.stringify({ ...userData, ...updates }));
                },
                updatePassword: async (newPassword, currentPassword, otpCode) => {
                    return apiRequest('/auth/change-password', 'POST', { newPassword, currentPassword, otpCode });
                },
                reauthenticateWithCredential: async (cred) => {
                    return true;
                }
            };
            return userObj;
        }

        async sendPasswordOtp(email) {
            return apiRequest('/auth/send-password-otp', 'POST', { email: email || (this._currentUser && this._currentUser.email) });
        }

        async sendPasswordResetEmail(email) {
            return this.sendPasswordOtp(email);
        }

        onAuthStateChanged(callback) {
            this._listeners.push(callback);
            // Execute asynchronously like Firebase
            setTimeout(() => {
                callback(this._currentUser);
            }, 0);

            return () => {
                this._listeners = this._listeners.filter(cb => cb !== callback);
            };
        }

        _notifyListeners() {
            this._listeners.forEach(cb => {
                try {
                    cb(this._currentUser);
                } catch (e) {
                    console.error('Auth listener error:', e);
                }
            });
        }

        async signInWithEmailAndPassword(emailOrId, password) {
            const res = await apiRequest('/auth/login', 'POST', { emailOrId, password });
            if (!this.isSecondary) {
                localStorage.setItem(TOKEN_KEY, res.token);
                localStorage.setItem(USER_KEY, JSON.stringify(res.user));
                this._currentUser = this._createSessionUser(res.user);
                this._notifyListeners();
            }
            return { user: this._createSessionUser(res.user) };
        }

        async createUserWithEmailAndPassword(email, password) {
            const res = await apiRequest('/auth/register', 'POST', { email, password });
            if (!this.isSecondary) {
                localStorage.setItem(TOKEN_KEY, res.token);
                localStorage.setItem(USER_KEY, JSON.stringify(res.user));
                this._currentUser = this._createSessionUser(res.user);
                this._notifyListeners();
            }
            return { user: this._createSessionUser(res.user) };
        }

        async signOut() {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            this._currentUser = null;
            this._notifyListeners();
            return Promise.resolve();
        }

        async sendPasswordResetEmail(email) {
            return apiRequest('/auth/reset-password', 'POST', { email });
        }

        setPersistence() {
            return Promise.resolve();
        }
    }

    // -------------------------------------------------------------------------
    // Global Firebase Compatibility Object
    // -------------------------------------------------------------------------
    const mainAuth = new AuthClient(false);
    const secondaryAuth = new AuthClient(true);

    const dbInstance = {
        collection: (name) => new CollectionReference(name),
        batch: () => new WriteBatch()
    };

    const firebaseCompat = {
        auth: () => mainAuth,
        firestore: () => dbInstance,
        initializeApp: () => firebaseCompat,
        app: (name) => {
            if (name === 'Secondary') {
                return { auth: () => secondaryAuth };
            }
            return {
                auth: () => mainAuth,
                firestore: () => dbInstance,
                functions: (region) => ({
                    httpsCallable: (functionName) => {
                        return async (data) => {
                            if (functionName === 'adminSetUserPassword') {
                                const res = await apiRequest('/auth/admin-set-password', 'POST', data);
                                return { data: res };
                            }
                            throw new Error(`Function ${functionName} not found.`);
                        };
                    }
                })
            };
        }
    };

    // Firebase static properties
    firebaseCompat.auth.Auth = {
        Persistence: { LOCAL: 'LOCAL', SESSION: 'SESSION', NONE: 'NONE' }
    };
    firebaseCompat.auth.EmailAuthProvider = {
        credential: (email, password) => ({ email, password })
    };
    firebaseCompat.firestore.FieldValue = {
        serverTimestamp: () => ({ __type: 'serverTimestamp' }),
        delete: () => '__DELETE__',
        increment: (n) => ({ __type: 'increment', value: n })
    };
    firebaseCompat.firestore.FieldPath = {
        documentId: () => ({ __isDocId: true })
    };
    firebaseCompat.functions = () => firebaseCompat.app().functions();

    window.firebase = firebaseCompat;
    window.auth = mainAuth;
    window.db = dbInstance;
    window.watchUserProfile = (userId, onUpdate) => {
        if (!userId || typeof onUpdate !== 'function') {
            throw new Error('A user ID and profile update callback are required.');
        }

        return dbInstance.collection('users').doc(userId).onSnapshot(snapshot => {
            const userData = snapshot.data();
            if (userData) onUpdate(userData);
        }, error => {
            console.error('Unable to watch user profile updates:', error);
        });
    };
    window.startViewAutoRefresh = (getActiveView, refreshers, intervalMs = 5000) => {
        if (typeof getActiveView !== 'function' || !refreshers || typeof refreshers !== 'object') {
            throw new Error('An active-view getter and view refresh handlers are required.');
        }

        let refreshing = false;
        let active = true;
        const refresh = async () => {
            if (!active || refreshing || document.hidden ||
                document.querySelector('.modal.active, .mislend-cropper-overlay.active')) {
                return;
            }

            const view = getActiveView();
            const refreshView = refreshers[view];
            if (typeof refreshView !== 'function') return;

            refreshing = true;
            try {
                await refreshView();
            } catch (error) {
                console.error(`Unable to automatically refresh the ${view} view:`, error);
            } finally {
                refreshing = false;
            }
        };

        const onVisibilityChange = () => {
            if (!document.hidden) refresh();
        };
        const intervalId = setInterval(refresh, intervalMs);
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', refresh);

        const stop = () => {
            active = false;
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('pagehide', stop);
        };
        window.addEventListener('pagehide', stop, { once: true });
        return stop;
    };

    // -------------------------------------------------------------------------
    // UI Helpers (Preserved 100% from original design)
    // -------------------------------------------------------------------------
    function resizeImage(file, maxWidth = 200, maxHeight = 200) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width *= maxHeight / height;
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    function getSecondaryAuth() {
        return secondaryAuth;
    }

    function showToast(message, type = 'success') {
        console.log(`[TOAST] ${type.toUpperCase()}: ${message}`);
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.innerHTML = `<span>${message}</span>`;
        toast.className = `toast show ${type}`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function showConfirm(options = {}) {
        const {
            title = 'Are you sure?',
            message = 'Do you want to proceed with this action?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'danger'
        } = options;

        return new Promise((resolve) => {
            let modal = document.getElementById('confirmModal');

            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'confirmModal';
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-content" style="max-width: 400px; text-align: center;">
                        <div class="modal-header" style="justify-content: center; margin-bottom: 20px;">
                            <h2 id="confirmTitle" style="font-size: 1.3rem;"></h2>
                        </div>
                        <p id="confirmMessage" style="color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5;"></p>
                        <div class="modal-actions" style="justify-content: center; gap: 12px;">
                            <button id="confirmCancel" class="btn btn-secondary" style="flex: 1;"></button>
                            <button id="confirmBtn" class="btn" style="flex: 1;"></button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            const titleEl = modal.querySelector('#confirmTitle');
            const messageEl = modal.querySelector('#confirmMessage');
            const cancelBtn = modal.querySelector('#confirmCancel');
            const confirmBtn = modal.querySelector('#confirmBtn');

            titleEl.textContent = title;
            messageEl.textContent = message;
            cancelBtn.textContent = cancelText;
            confirmBtn.textContent = confirmText;
            confirmBtn.className = `btn btn-${type}`;

            const cleanup = (result) => {
                modal.classList.remove('active');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                modal.onclick = null;
                resolve(result);
            };

            confirmBtn.onclick = () => cleanup(true);
            cancelBtn.onclick = () => cleanup(false);
            modal.onclick = (e) => {
                if (e.target === modal) cleanup(false);
            };

            setTimeout(() => modal.classList.add('active'), 10);
        });
    }

    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', options).replace(',', '');
    }

    function formatTimeTo12h(timeStr) {
        if (!timeStr || !timeStr.includes(':')) return timeStr || 'N/A';
        const [hh, mm] = timeStr.split(':').map(Number);
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const h12 = hh % 12 || 12;
        const mPad = String(mm).padStart(2, '0');
        return `${h12}:${mPad} ${ampm}`;
    }

    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function getUserInitials(name) {
        if (!name) return 'U';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return parts[0][0] + parts[parts.length - 1][0];
        }
        return name.substring(0, 2);
    }

    function checkAuth(requiredRole = null) {
        return new Promise((resolve, reject) => {
            const unsub = mainAuth.onAuthStateChanged(async (user) => {
                unsub();

                if (!user) {
                    window.location.href = 'login.html';
                    reject('Not authenticated');
                    return;
                }

                if (!requiredRole) {
                    resolve({ user });
                    return;
                }

                try {
                    const userDoc = await dbInstance.collection('users').doc(user.uid).get();
                    const userData = userDoc.data();

                    if (userData?.role === requiredRole) {
                        // Monitor for real-time account suspension
                        dbInstance.collection('users').doc(user.uid).onSnapshot(doc => {
                            const updatedData = doc.data();
                            if (updatedData && updatedData.status === 'suspended') {
                                mainAuth.signOut().then(() => {
                                    localStorage.setItem('mislend_suspended_lockout', 'true');
                                    window.location.href = 'login.html';
                                });
                            }
                        }, err => {
                            console.error('Account status listener error:', err);
                        });

                        resolve({ user, userData });
                    } else {
                        let targetUrl = 'student.html';
                        if (userData?.role === 'admin') targetUrl = 'admin.html';
                        else if (userData?.role === 'professor') targetUrl = 'professor.html';

                        if (window.location.search && targetUrl !== 'admin.html') {
                            targetUrl += window.location.search;
                        }

                        window.location.href = targetUrl;
                        reject('Wrong role');
                    }
                } catch (err) {
                    console.error('Role check error:', err);
                    window.location.href = 'login.html';
                    reject(err);
                }
            });
        });
    }

    // Attach utilities to window
    window.resizeImage = resizeImage;
    window.getSecondaryAuth = getSecondaryAuth;
    window.showToast = showToast;
    window.showConfirm = showConfirm;
    window.formatDate = formatDate;
    window.formatTimeTo12h = formatTimeTo12h;
    window.capitalize = capitalize;
    window.getUserInitials = getUserInitials;
    window.checkAuth = checkAuth;

    // Page loader animation
    window.addEventListener('load', () => {
        const loader = document.getElementById('pageLoader');
        const content = document.getElementById('pageContent');

        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }

        if (content) {
            content.classList.add('visible');
        }
    });

})(window);