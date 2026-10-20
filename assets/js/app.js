/**
 * MISLend Core Application Client
 * Backend: Node.js + Express
 * Database: Supabase SQL (with local storage fallback)
 * 100% design and interface compatibility layer
 */

(function (window) {
    'use strict';

    window.DEFAULT_PROFILE_IMAGE = 'assets/images/default-profile.png';

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
                err.code = json.code || (res.status === 401 ? 'auth/unauthenticated' : (res.status === 403 ? 'permission-denied' : (res.status === 404 ? 'not-found' : 'request-failed')));
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
    // API document reference
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
    // API query
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
    // API collection
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
    // API write batch
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

        async sendPasswordOtp(email, purpose = 'change') {
            return apiRequest('/auth/send-password-otp', 'POST', {
                email: email || (this._currentUser && this._currentUser.email),
                purpose
            });
        }

        async confirmPasswordReset(email, otpCode, newPassword) {
            return apiRequest('/auth/reset-password', 'POST', { email, otpCode, newPassword });
        }

        onAuthStateChanged(callback) {
            this._listeners.push(callback);
            // Notify listeners asynchronously after registration.
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

        async createUserWithEmailAndPassword(email, password, profile = {}, turnstileToken) {
            const res = await apiRequest('/auth/register', 'POST', { email, password, ...profile, turnstileToken });
            if (!this.isSecondary) {
                localStorage.setItem(TOKEN_KEY, res.token);
                localStorage.setItem(USER_KEY, JSON.stringify(res.user));
                this._currentUser = this._createSessionUser(res.user);
                this._notifyListeners();
            }
            return { user: this._createSessionUser(res.user) };
        }

        async getRegistrationTurnstileConfig() {
            return apiRequest('/auth/turnstile-config');
        }

        async createAdminManagedUser(profile) {
            return apiRequest('/auth/admin-create-user', 'POST', profile);
        }

        async sendOverdueReminder(borrowingId, type) {
            return apiRequest('/notifications/overdue-reminder', 'POST', { borrowingId, type });
        }

        async suspendAccount(userId, reason) {
            return apiRequest(`/admin/users/${encodeURIComponent(userId)}/suspend`, 'POST', { reason });
        }

        async approveAccount(userId) {
            return apiRequest(`/admin/users/${encodeURIComponent(userId)}/approve`, 'POST');
        }

        async signOut() {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            this._currentUser = null;
            this._notifyListeners();
            return Promise.resolve();
        }

        async sendPasswordResetEmail(email) {
            return apiRequest('/auth/forgot-password-reset-link', 'POST', { email });
        }

        async sendAdminPasswordResetLink(uid) {
            return apiRequest('/auth/admin-send-password-reset-link', 'POST', { uid });
        }

        async setUserPassword(uid, password) {
            return apiRequest('/auth/admin-set-password', 'POST', { uid, password });
        }

        async verifyPasswordResetToken(token) {
            return apiRequest(`/auth/password-reset-link/${encodeURIComponent(token)}`);
        }

        async confirmPasswordResetLink(token, newPassword) {
            return apiRequest('/auth/password-reset-link', 'POST', { token, newPassword });
        }

    }

    // -------------------------------------------------------------------------
    // Shared API clients
    // -------------------------------------------------------------------------
    const mainAuth = new AuthClient(false);
    const secondaryAuth = new AuthClient(true);

    const dbInstance = {
        collection: (name) => new CollectionReference(name),
        batch: () => new WriteBatch(),
        FieldValue: {
            serverTimestamp: () => ({ __type: 'serverTimestamp' }),
            delete: () => '__DELETE__',
            increment: (n) => ({ __type: 'increment', value: n })
        },
        FieldPath: {
            documentId: () => ({ __isDocId: true })
        }
    };

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
        }, type === 'warning' ? 8000 : 3000);
    }

    function showConfirm(options = {}) {
        const {
            title = 'Are you sure?',
            message = 'Do you want to proceed with this action?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'danger',
            inputLabel = '',
            inputPlaceholder = '',
            selectLabel = '',
            selectOptions = [],
            selectPlaceholder = 'Select an option',
            selectDefault = '',
            selectHelpText = ''
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
                        <p id="confirmMessage" style="color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;"></p>
                        <div id="confirmInputWrap" style="display: none; margin-bottom: 20px; text-align: left;">
                            <label id="confirmInputLabel" style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; color: var(--text-primary);"></label>
                            <input type="text" id="confirmInput" style="width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); font-size: 0.9rem; background: var(--bg-secondary, #f8fafc); color: var(--text-primary); outline: none; transition: border-color 0.2s;" />
                            <select id="confirmSelect" style="display: none; width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); font-size: 0.9rem; background: var(--bg-secondary, #f8fafc); color: var(--text-primary); outline: none;"></select>
                            <p id="confirmSelectHelp" style="display: none; font-size: 0.78rem; color: var(--text-secondary); margin-top: 6px;"></p>
                            <p id="confirmInputError" style="display: none; font-size: 0.78rem; color: var(--danger, #ef4444); margin-top: 4px;"></p>
                        </div>
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
            const inputWrap = modal.querySelector('#confirmInputWrap');
            const inputLabel_el = modal.querySelector('#confirmInputLabel');
            const inputEl = modal.querySelector('#confirmInput');
            const selectEl = modal.querySelector('#confirmSelect');
            const selectHelp = modal.querySelector('#confirmSelectHelp');
            const inputError = modal.querySelector('#confirmInputError');

            titleEl.textContent = title;
            messageEl.textContent = message;
            cancelBtn.textContent = cancelText;
            confirmBtn.textContent = confirmText;
            confirmBtn.className = `btn btn-${type}`;

            // Handle optional input field
            const hasInput = !!inputLabel;
            const hasSelect = !!selectLabel;
            if (hasInput || hasSelect) {
                inputWrap.style.display = 'block';
                inputLabel_el.textContent = hasSelect ? selectLabel : inputLabel;
                inputLabel_el.insertAdjacentHTML('beforeend', ' <span style="color: var(--danger, #ef4444);">*</span>');
                inputEl.placeholder = inputPlaceholder || '';
                inputEl.style.display = hasInput ? '' : 'none';
                inputEl.value = '';
                selectEl.style.display = hasSelect ? '' : 'none';
                selectEl.replaceChildren();
                if (hasSelect) {
                    const placeholderOption = document.createElement('option');
                    placeholderOption.value = '';
                    placeholderOption.textContent = selectPlaceholder;
                    selectEl.appendChild(placeholderOption);
                    (Array.isArray(selectOptions) ? selectOptions : []).forEach(option => {
                        const optionEl = document.createElement('option');
                        optionEl.value = option.value;
                        optionEl.textContent = option.label;
                        selectEl.appendChild(optionEl);
                    });
                    selectEl.value = selectDefault;
                    selectEl.style.borderColor = 'var(--border)';
                }
                selectHelp.textContent = selectHelpText;
                selectHelp.style.display = hasSelect && selectHelpText ? 'block' : 'none';
                inputError.style.display = 'none';
                inputEl.style.borderColor = 'var(--border)';
            } else {
                inputWrap.style.display = 'none';
                inputEl.value = '';
                selectEl.replaceChildren();
            }

            const cleanup = (result) => {
                modal.classList.remove('active');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                modal.onclick = null;
                if (inputEl) {
                    inputEl.oninput = null;
                    inputEl.onkeydown = null;
                }
                if (selectEl) selectEl.onkeydown = null;
                resolve(result);
            };

            if (hasInput) {
                inputEl.oninput = () => {
                    if (inputEl.value.trim()) {
                        inputError.style.display = 'none';
                        inputEl.style.borderColor = 'var(--border)';
                    }
                };
                inputEl.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmBtn.click();
                    }
                };
            }
            if (hasSelect) {
                selectEl.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmBtn.click();
                    }
                };
            }
            confirmBtn.onclick = () => {
                if (hasInput) {
                    const val = inputEl.value.trim();
                    if (!val) {
                        inputError.textContent = 'This field is required.';
                        inputError.style.display = 'block';
                        inputEl.style.borderColor = 'var(--danger, #ef4444)';
                        inputEl.focus();
                        return;
                    }
                    cleanup(val);
                } else if (hasSelect) {
                    const val = selectEl.value;
                    if (!val) {
                        inputError.textContent = 'Please select a staff member.';
                        inputError.style.display = 'block';
                        selectEl.style.borderColor = 'var(--danger, #ef4444)';
                        selectEl.focus();
                        return;
                    }
                    cleanup(val);
                } else {
                    cleanup(true);
                }
            };
            cancelBtn.onclick = () => cleanup(false);
            modal.onclick = (e) => {
                if (e.target === modal) cleanup(false);
            };

            setTimeout(() => {
                modal.classList.add('active');
                if (hasInput) inputEl.focus();
            }, 10);
        });
    }

    function initializeNotificationDropdown(loadNotifications) {
        const wrapper = document.getElementById('notificationDropdown');
        const button = document.getElementById('topbarNotificationBtn');
        const menu = document.getElementById('notificationMenu');
        const list = document.getElementById('notificationList');
        const badge = document.getElementById('topbarNotificationBadge');
        if (!wrapper || !button || !menu || !list || typeof loadNotifications !== 'function') return;
        if (wrapper.dataset.initialized === 'true') return;
        wrapper.dataset.initialized = 'true';
        const notificationIdentity = () => {
            const userId = window.auth?.currentUser?.uid;
            if (userId) return userId;
            try {
                const storedUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
                return storedUser?.id || storedUser?.uid || window.location.pathname;
            } catch (error) {
                console.error('Could not determine notification account:', error);
                return window.location.pathname;
            }
        };
        const readStorageKey = () => `mislend_read_notifications:${notificationIdentity()}`;
        let readNotificationIds = new Set();
        try {
            const storedIds = JSON.parse(localStorage.getItem(readStorageKey()) || '[]');
            if (Array.isArray(storedIds)) readNotificationIds = new Set(storedIds.filter(id => typeof id === 'string'));
        } catch (error) {
            console.error('Could not load read notification state:', error);
        }
        const getNotificationId = notification => String(notification.id ||
            `${notification.view || ''}|${notification.title || ''}|${notification.message || ''}|${notification.createdAt?.toMillis?.() || notification.createdAt?.toDate?.().getTime?.() || notification.createdAt || ''}`);
        let unreadNotificationCount = 0;

        const closeMenu = () => {
            wrapper.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
            menu.setAttribute('aria-hidden', 'true');
        };

        const renderNotifications = notifications => {
            const timestampValue = value => {
                if (!value) return 0;
                if (typeof value.toMillis === 'function') return value.toMillis();
                if (typeof value.toDate === 'function') return value.toDate().getTime();
                const timestamp = new Date(value).getTime();
                return Number.isNaN(timestamp) ? 0 : timestamp;
            };
            const latestFirst = notifications.slice().sort((a, b) =>
                timestampValue(b.createdAt) - timestampValue(a.createdAt)
            );
            const visibleNotifications = latestFirst.slice(0, 10);
            unreadNotificationCount = latestFirst.filter(notification => !readNotificationIds.has(getNotificationId(notification))).length;
            badge.textContent = unreadNotificationCount > 9 ? '9+' : String(unreadNotificationCount);
            badge.hidden = unreadNotificationCount === 0;
            list.replaceChildren();

            if (visibleNotifications.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'notification-empty';
                empty.textContent = "You're all caught up.";
                list.appendChild(empty);
                return;
            }

            visibleNotifications.forEach(notification => {
                const item = document.createElement('button');
                item.className = 'notification-item';
                item.type = 'button';
                item.dataset.view = notification.view;
                item.dataset.notificationId = getNotificationId(notification);
                const isUnread = !readNotificationIds.has(item.dataset.notificationId);
                item.classList.toggle('notification-unread', isUnread);

                const icon = document.createElement('span');
                icon.className = 'notification-item-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = '<i class="fa-regular fa-bell"></i>';

                const content = document.createElement('span');
                content.className = 'notification-item-content';
                const title = document.createElement('span');
                title.className = 'notification-item-title';
                title.textContent = notification.title;
                const message = document.createElement('span');
                message.className = 'notification-item-message';
                message.textContent = notification.message;
                content.append(title, message);
                item.append(icon, content);
                if (isUnread) {
                    const unreadDot = document.createElement('span');
                    unreadDot.className = 'notification-unread-dot';
                    unreadDot.setAttribute('aria-label', 'Unread');
                    item.appendChild(unreadDot);
                }
                list.appendChild(item);
            });
        };

        const refresh = async () => {
            list.innerHTML = '<div class="notification-empty">Loading notifications...</div>';
            try {
                const notifications = await loadNotifications();
                renderNotifications(Array.isArray(notifications) ? notifications : []);
            } catch (error) {
                console.error('Could not load notifications:', error);
                list.innerHTML = '<div class="notification-empty notification-error">Unable to load notifications. Please try again.</div>';
                badge.hidden = true;
            }
        };

        button.addEventListener('click', () => {
            const isOpen = wrapper.classList.toggle('open');
            button.setAttribute('aria-expanded', String(isOpen));
            menu.setAttribute('aria-hidden', String(!isOpen));
            if (isOpen) refresh();
        });

        menu.setAttribute('aria-hidden', 'true');

        list.addEventListener('click', event => {
            const item = event.target.closest('.notification-item');
            if (!item) return;
            const notificationId = item.dataset.notificationId;
            if (notificationId && !readNotificationIds.has(notificationId)) {
                readNotificationIds.add(notificationId);
                item.classList.remove('notification-unread');
                item.querySelector('.notification-unread-dot')?.remove();
                unreadNotificationCount = Math.max(0, unreadNotificationCount - 1);
                badge.textContent = unreadNotificationCount > 9 ? '9+' : String(unreadNotificationCount);
                badge.hidden = unreadNotificationCount === 0;
                try {
                    localStorage.setItem(readStorageKey(), JSON.stringify(Array.from(readNotificationIds).slice(-300)));
                } catch (error) {
                    console.error('Could not save read notification state:', error);
                }
            }
            const destination = Array.from(document.querySelectorAll('.nav-item'))
                .find(nav => nav.dataset.view === item.dataset.view);
            closeMenu();
            destination?.click();
        });

        document.addEventListener('click', event => {
            if (!wrapper.contains(event.target)) closeMenu();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeMenu();
        });

        window.refreshNotificationDropdown = refresh;
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

    function getBorrowingActivityEvents(borrowing) {
        const savedEvents = Array.isArray(borrowing.activityHistory) ? borrowing.activityHistory : [];
        if (savedEvents.length) {
            return savedEvents.map(event => ({ ...event }));
        }

        const events = [];
        const isBorrowed = ['borrowed', 'pending_return', 'pending_extension', 'returned'].includes(borrowing.status);
        if (isBorrowed || borrowing.approvedAt || borrowing.approvedByName || borrowing.approvedBy) {
            events.push({
                type: 'borrowed',
                at: borrowing.approvedAt || borrowing.borrowedAt || borrowing.createdAt,
                staffName: borrowing.approvedByName || borrowing.approvedBy || '',
                expectedReturnTime: borrowing.expectedReturnTime || ''
            });
        } else if (['pending_borrow', 'rejected'].includes(borrowing.status)) {
            events.push({
                type: borrowing.status,
                at: borrowing.borrowedAt || borrowing.createdAt,
                staffName: '',
                expectedReturnTime: borrowing.expectedReturnTime || ''
            });
        }

        if (borrowing.hasExtension || borrowing.extensionApprovedAt) {
            events.push({
                type: 'extended',
                at: borrowing.extensionApprovedAt || borrowing.updatedAt || borrowing.borrowedAt,
                staffName: borrowing.extensionApprovedByName || '',
                previousReturnTime: borrowing.originalExpectedReturnTime || '',
                expectedReturnTime: borrowing.expectedReturnTime || '',
                reason: borrowing.extensionReason || ''
            });
        }

        if (borrowing.status === 'pending_return') {
            events.push({
                type: 'return_requested',
                at: borrowing.returnRequestedAt || borrowing.updatedAt || borrowing.borrowedAt,
                condition: borrowing.pendingReturnCondition || '',
                notes: borrowing.pendingReturnNotes || ''
            });
        }

        if (borrowing.status === 'returned' || borrowing.returnedAt) {
            events.push({
                type: 'returned',
                at: borrowing.returnedAt || borrowing.returnConfirmedAt || borrowing.returnApprovedAt,
                staffName: borrowing.returnApprovedByName || borrowing.returnConfirmedByName || '',
                condition: borrowing.returnCondition || '',
                notes: borrowing.returnNotes || ''
            });
        }

        return events;
    }

    function escapeBorrowingHistoryHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function getBorrowingDueAt(borrowedAtValue, expectedReturnTime) {
        if (!borrowedAtValue || typeof expectedReturnTime !== 'string') return null;

        const timeMatch = expectedReturnTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (!timeMatch) return null;

        const borrowedAt = typeof borrowedAtValue.toDate === 'function'
            ? borrowedAtValue.toDate()
            : new Date(borrowedAtValue);
        let hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        const meridiem = timeMatch[3]?.toUpperCase();
        if (Number.isNaN(borrowedAt.getTime()) || minutes > 59) return null;
        if (meridiem) {
            if (hours < 1 || hours > 12) return null;
            if (meridiem === 'PM' && hours < 12) hours += 12;
            if (meridiem === 'AM' && hours === 12) hours = 0;
        } else if (hours > 23) {
            return null;
        }

        const dateParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(borrowedAt).reduce((parts, part) => {
            if (part.type !== 'literal') parts[part.type] = Number(part.value);
            return parts;
        }, {});

        return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hours - 8, minutes));
    }

    function isOverdueStrikeActive(borrowing, now = new Date()) {
        if (!borrowing || borrowing.status !== 'returned' || borrowing.wasOverdue !== true) return false;
        const returnedAt = borrowing.returnedAt || borrowing.returnConfirmedAt || borrowing.returnApprovedAt;
        const returnedDate = typeof returnedAt?.toDate === 'function'
            ? returnedAt.toDate()
            : new Date(typeof returnedAt?.seconds === 'number' ? returnedAt.seconds * 1000 : returnedAt);
        if (!Number.isFinite(returnedDate.getTime())) return false;

        const cutoff = new Date(now);
        const dayOfMonth = cutoff.getDate();
        cutoff.setDate(1);
        cutoff.setMonth(cutoff.getMonth() - 1);
        const lastDayOfPreviousMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
        cutoff.setDate(Math.min(dayOfMonth, lastDayOfPreviousMonth));
        return returnedDate > cutoff && returnedDate <= now;
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

    function initRequiredAsterisks() {
        function updateIndicators() {
            const inputs = document.querySelectorAll('input, select, textarea');
            inputs.forEach(el => {
                if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') return;

                let label = null;
                if (el.id) {
                    label = document.querySelector(`label[for="${el.id}"]`);
                }
                if (!label && el.closest) {
                    const wrapper = el.closest('.password-field, .input-wrapper');
                    if (wrapper && wrapper.previousElementSibling?.tagName === 'LABEL') {
                        label = wrapper.previousElementSibling;
                    }
                }
                if (!label && el.closest) {
                    const parent = el.closest('.form-group, .field, .input-group, .col-first, .col-last, .col-mi, .terms-agreement');
                    if (parent) {
                        label = parent.querySelector('label');
                    }
                }
                if (!label && el.previousElementSibling?.tagName === 'LABEL') {
                    label = el.previousElementSibling;
                }

                if (!label) return;

                const isRequired = el.hasAttribute('required') || el.required;
                let existingAsterisk = label.querySelector('.required-asterisk');

                if (isRequired) {
                    if (!existingAsterisk && !label.textContent.includes('*')) {
                        const span = document.createElement('span');
                        span.className = 'required-asterisk';
                        span.setAttribute('aria-hidden', 'true');
                        span.textContent = ' *';
                        label.appendChild(span);
                    } else if (existingAsterisk) {
                        existingAsterisk.style.display = 'inline';
                    }
                } else if (existingAsterisk) {
                    existingAsterisk.style.display = 'none';
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateIndicators);
        } else {
            updateIndicators();
        }

        let scheduled = false;
        const debouncedUpdate = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                updateIndicators();
                scheduled = false;
            });
        };

        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
                if (m.type === 'attributes' && m.attributeName === 'required') {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) debouncedUpdate();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['required']
        });

        return updateIndicators;
    }

    const updateRequiredAsterisks = initRequiredAsterisks();

    // Attach utilities to window
    window.resizeImage = resizeImage;
    window.getSecondaryAuth = getSecondaryAuth;
    window.showToast = showToast;
    window.showConfirm = showConfirm;
    window.initializeNotificationDropdown = initializeNotificationDropdown;
    window.formatDate = formatDate;
    window.getBorrowingActivityEvents = getBorrowingActivityEvents;
    window.escapeBorrowingHistoryHtml = escapeBorrowingHistoryHtml;
    window.getBorrowingDueAt = getBorrowingDueAt;
    window.isOverdueStrikeActive = isOverdueStrikeActive;
    window.formatTimeTo12h = formatTimeTo12h;
    window.capitalize = capitalize;
    window.getUserInitials = getUserInitials;
    window.checkAuth = checkAuth;
    window.updateRequiredAsterisks = updateRequiredAsterisks;

    // Page loader animation
    window.addEventListener('DOMContentLoaded', () => {
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