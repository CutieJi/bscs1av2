let currentAdmin = null;
let currentAdminData = null;

let pendingBorrowApproval = null;
let studentIdCaptureImage = '';
let studentIdCameraStream = null;
let currentEquipmentList = [];

async function readFileAsBase64(file, maxWidth = 400, maxHeight = 400) {
    if (typeof window.resizeImage === 'function') {
        return window.resizeImage(file, maxWidth, maxHeight);
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeSidebar();
    initializeTopbarActions();

    try {
        const { user, userData } = await checkAuth('admin');
        currentAdmin = user;
        currentAdminData = userData;

        initializeDashboard();
    } catch (error) {
        // If authentication fails, do NOTHING. 
        // The checkAuth function in app.js will automatically redirect them to login.html.
        console.warn('Admin authorization pending or failed. Waiting for redirect...');
    }
});

function initializeUserManagement() {
    const roleSelect = document.getElementById('newUserRole');
    const additionalFields = document.getElementById('additionalStudentFields');

    if (roleSelect) {
        roleSelect.addEventListener('change', (e) => {
            const isStudent = e.target.value === 'student';
            if (additionalFields) additionalFields.style.display = isStudent ? 'block' : 'none';

            const studentIdInput = document.getElementById('newUserStudentId');
            if (studentIdInput) studentIdInput.required = isStudent;
        });
    }

    const editRoleSelect = document.getElementById('editUserRole');
    const editStudentContainer = document.getElementById('editStudentFieldsContainers');
    if (editRoleSelect && editStudentContainer) {
        editRoleSelect.addEventListener('change', (e) => {
            editStudentContainer.style.display = e.target.value === 'student' ? 'block' : 'none';
        });
    }

    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createNewUser();
        });
    }

    const closeAddUserModal = document.getElementById('closeAddUserModal');
    const cancelAddUser = document.getElementById('cancelAddUser');
    const addUserModal = document.getElementById('addUserModal');

    const closeAddUser = () => {
        addUserModal?.classList.remove('active');
        addUserForm?.reset();
        if (additionalFields) additionalFields.style.display = 'none';
    };

    if (closeAddUserModal) closeAddUserModal.addEventListener('click', closeAddUser);
    if (cancelAddUser) cancelAddUser.addEventListener('click', closeAddUser);
}

function initializeRealtimeListeners() {
    db.collection('borrowings')
        .where('status', 'in', ['pending_borrow', 'pending_return', 'pending_extension'])
        .onSnapshot((snapshot) => {
            // Count unique groups for a consistent experience
            const groups = new Set();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.status === 'pending_borrow') {
                    groups.add(data.submissionId || doc.id);
                } else {
                    // Returns and extensions are typically individual
                    groups.add(doc.id);
                }
            });

            const count = groups.size;
            const badge = document.getElementById('approvalsBadge');
            const badgeMobile = document.getElementById('approvalsBadgeMobile');
            const dashPendingCount = document.getElementById('pendingRequestsCount');
            const topbarNotificationBadge = document.getElementById('topbarNotificationBadge');

            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
            }
            if (topbarNotificationBadge) {
                topbarNotificationBadge.textContent = count > 9 ? '9+' : String(count);
                topbarNotificationBadge.hidden = count === 0;
            }
            if (badgeMobile) {
                badgeMobile.textContent = count;
                badgeMobile.style.display = count > 0 ? 'flex' : 'none';
            }
            if (dashPendingCount) {
                dashPendingCount.textContent = count;
            }

            const activeView = document.querySelector('.view-container.active')?.id;
            if (activeView === 'approvalsView') {
                loadPendingRequests();
            }
        });

    db.collection('users')
        .where('status', '==', 'pending')
        .onSnapshot((snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById("pendingCount");
            const badgeMobile = document.getElementById('usersBadgeMobile');

            if (badge) badge.textContent = count;
            if (badgeMobile) {
                badgeMobile.textContent = count;
                badgeMobile.style.display = count > 0 ? 'flex' : 'none';
            }

            const activeView = document.querySelector('.view-container.active')?.id;
            if (activeView === 'usersView') {
                loadPending();
            }
        });

    // Real-time Active Borrowings Badge
    db.collection('borrowings')
        .where('status', '==', 'borrowed')
        .onSnapshot((snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById('borrowedBadge');
            const badgeMobile = document.getElementById('borrowedBadgeMobile');

            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
            }
            if (badgeMobile) {
                badgeMobile.textContent = count;
                badgeMobile.style.display = count > 0 ? 'flex' : 'none';
            }

            // Also update dashboard stat if exists
            const dashBorrowedCount = document.getElementById('borrowedEquipment');
            if (dashBorrowedCount) dashBorrowedCount.textContent = count;
        });

    // Real-time Pending Incidents Badge
    db.collection('incidents')
        .where('status', 'in', ['pending', 'under_review'])
        .onSnapshot((snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById('incidentsBadge');
            const badgeMobile = document.getElementById('incidentsBadgeMobile');

            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
            }
            if (badgeMobile) {
                badgeMobile.textContent = count;
                badgeMobile.style.display = count > 0 ? 'flex' : 'none';
            }

            const activeView = document.querySelector('.view-container.active')?.id;
            if (activeView === 'incidentsView') {
                loadAllIncidents();
            }
        });
}

function initializeDashboard() {
    updateAdminInfo();
    watchUserProfile(currentAdmin.uid, userData => {
        currentAdminData = { ...currentAdminData, ...userData };
        updateAdminInfo();
    });
    initializeNavigation();
    startViewAutoRefresh(
        () => document.querySelector('.view-container.active')?.id.replace(/View$/, ''),
        {
            dashboard: loadDashboardData,
            equipment: loadAllEquipment,
            approvals: loadPendingRequests,
            borrowed: loadCurrentlyBorrowed,
            logs: loadBorrowingLogs,
            users: async () => {
                await Promise.all([loadUsers(), loadPending()]);
            },
            incidents: loadAllIncidents
        }
    );
    loadDashboardData();
    initializeEquipmentManagement();
    initializeUserManagement();
    initializeLogout();
    initializeRefresh();
    initializeExport();
    initializeProfileDropdown();
    initializeTheme();
    initializeStudentIdCaptureModal();
    initializeImageZoomModal();
    initializeRealtimeListeners();
    checkIncidentAccess();
}

function checkIncidentAccess() {
    const isHead = isHeadAdmin();
    const incidentsSidebarItem = document.getElementById('incidentsSidebarItem');
    const incidentsSidebarItemMobile = document.querySelector('.bottom-nav-item[data-view="incidents"]');

    if (incidentsSidebarItem) {
        incidentsSidebarItem.style.display = isHead ? 'block' : 'none';
    }
    if (incidentsSidebarItemMobile) {
        incidentsSidebarItemMobile.style.display = isHead ? 'flex' : 'none';
    }

    if (!isHead) {
        // If they are currently on incidents view, redirect to dashboard
        const activeView = localStorage.getItem('admin-active-view');
        if (activeView === 'incidents') {
            window.switchView('dashboard');
        }
    }
}

function isHeadAdmin() {
    if (!currentAdmin) return false;

    // 1. Check if head admin status is enabled in database user document
    if (currentAdminData?.isHeadAdmin === true || currentAdminData?.isHeadAdmin === 'true' || currentAdminData?.adminType === 'head_admin') {
        return true;
    }

    // 2. Default initial head admin emails (backward compatibility & first-time setup)
    const headEmails = ['uccmislend@gmail.com', 'efrenpvictoria@gmail.com', 'teodoroamacaraeg@gmail.com', 'admin@cs1a.com'];
    if (headEmails.includes(currentAdmin.email?.toLowerCase())) {
        return true;
    }

    return false;
}

function updateAdminInfo() {
    const email = currentAdmin.email || '';
    const name = currentAdminData?.name || 'Administrator';
    const photoURL = currentAdminData?.photoURL || null;
    const initials = getUserInitials(name);
    const isHead = isHeadAdmin();

    // Update emails
    ['adminEmail', 'topbarAdminEmail', 'profileViewEmail', 'profilePageEmail'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = email;
    });

    // Update avatars
    const containers = ['sidebarAvatarContainer', 'topbarAvatarContainer', 'menuAvatarContainer', 'profileViewAvatarContainer', 'profilePageAvatar'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;

        if (photoURL) {
            container.innerHTML = `<img src="${photoURL}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            container.innerHTML = `<span>${initials}</span>`;
        }
    });

    // Update names
    const nameEls = document.querySelectorAll('.profile-menu-name, .topbar-user-name, .profile-view-name, .sidebar-user-name, #profilePageName');
    nameEls.forEach(el => {
        el.textContent = name;
    });

    // Update role badge in Profile Modal
    const roleBadge = document.getElementById('profileViewRoleBadge');
    if (roleBadge) {
        roleBadge.className = `badge ${isHead ? 'badge-primary' : 'badge-category'}`;
        roleBadge.textContent = isHead ? 'Head Admin' : 'Admin';
    }

    const profilePageRole = document.getElementById('profilePageRole');
    const profilePageAccountType = document.getElementById('profilePageAccountType');
    const profilePageAccessStatus = document.getElementById('profilePageAccessStatus');
    const profilePageAccessDescription = document.getElementById('profilePageAccessDescription');
    if (profilePageRole) profilePageRole.textContent = isHead ? 'Head Admin' : 'Administrator';
    if (profilePageAccountType) profilePageAccountType.textContent = isHead ? 'Head Administrator' : 'Administrator';
    if (profilePageAccessStatus) profilePageAccessStatus.textContent = isHead ? 'Enabled' : 'Standard access';
    if (profilePageAccessDescription) {
        profilePageAccessDescription.textContent = isHead
            ? 'Can access Incident Reports and official report generation.'
            : 'Can manage MISLend equipment and borrowing records.';
    }

    // Update Head Admin quick toggle in Profile Modal
    const toggleBtn = document.getElementById('toggleMyHeadAdminBtn');
    const statusText = document.getElementById('profileHeadAdminStatusText');
    if (toggleBtn) {
        toggleBtn.textContent = isHead ? 'Revoke Access' : 'Grant Access';
        toggleBtn.className = `btn btn-sm ${isHead ? 'btn-secondary' : 'btn-primary'}`;
    }
    if (statusText) {
        statusText.innerHTML = isHead 
            ? '<span style="color: #10b981; font-weight: 600;">✓ Active</span> — Full access to Incident Reports' 
            : '<span style="color: var(--text-tertiary);">Inactive</span> — Click to enable full Report access';
    }
}

function openAdminProfileModal() {
    const data = currentAdminData || {};
    const nameParts = (data.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = document.getElementById('adminProfileFirstName');
    const lastName = document.getElementById('adminProfileLastName');
    const email = document.getElementById('adminProfileEmail');

    if (firstName) firstName.value = data.firstName || nameParts[0] || '';
    if (lastName) lastName.value = data.lastName || nameParts.slice(1).join(' ') || '';
    if (email) email.value = currentAdmin?.email || data.email || '';
    document.getElementById('profileModal')?.classList.add('active');
}

async function saveAdminProfile() {
    if (!currentAdmin) {
        showToast('Unable to identify the current admin account.', 'error');
        return;
    }

    const firstName = document.getElementById('adminProfileFirstName')?.value.trim() || '';
    const lastName = document.getElementById('adminProfileLastName')?.value.trim() || '';
    if (!firstName || !lastName) {
        showToast('Enter both your first and last name.', 'error');
        return;
    }

    const saveButton = document.getElementById('saveAdminProfileBtn');
    if (!saveButton) {
        showToast('Profile save button is unavailable. Please refresh and try again.', 'error');
        return;
    }

    const originalText = saveButton.textContent;
    const middleInitial = currentAdminData?.middleInitial || '';
    const name = `${firstName} ${middleInitial ? `${middleInitial.replace(/\.$/, '')}. ` : ''}${lastName}`;
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        const updateData = { firstName, lastName, middleInitial, name };
        await db.collection('users').doc(currentAdmin.uid).update(updateData);
        currentAdminData = { ...currentAdminData, ...updateData };
        updateAdminInfo();
        document.getElementById('profileModal')?.classList.remove('active');
        showToast('Profile updated successfully.', 'success');
    } catch (error) {
        console.error('Failed to update admin profile:', error);
        showToast(`Failed to update profile: ${error.message}`, 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = originalText;
    }
}

async function toggleCurrentAdminHeadStatus() {
    if (!currentAdmin) return;
    const currentStatus = isHeadAdmin();
    const newStatus = !currentStatus;

    try {
        await db.collection('users').doc(currentAdmin.uid).update({
            isHeadAdmin: newStatus
        });

        if (currentAdminData) {
            currentAdminData.isHeadAdmin = newStatus;
        }

        checkIncidentAccess();
        updateAdminInfo();
        if (typeof loadUsers === 'function') loadUsers();

        showToast(newStatus ? 'Head Admin privileges granted! Incident Reports enabled.' : 'Head Admin privileges revoked.', 'success');
    } catch (err) {
        console.error('Error toggling head admin status:', err);
        showToast('Failed to update privileges: ' + err.message, 'error');
    }
}
window.toggleCurrentAdminHeadStatus = toggleCurrentAdminHeadStatus;

async function uploadAdminPhoto(input) {
    console.log("uploadAdminPhoto triggered");
    alert("Uploading admin photo...");
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            showToast("Image too large. Max 2MB allowed.", "error");
            return;
        }

        try {
            if (!window.storage) {
                throw new Error("Firebase Storage is not initialized.");
            }
            console.log("Starting admin photo upload...");
            showToast("Uploading photo...", "info");
            const storageRef = window.storage.ref(`profile_photos/${currentAdmin.uid}`);
            console.log("Storage ref created:", `profile_photos/${currentAdmin.uid}`);
            const uploadTask = await storageRef.put(file);
            console.log("Upload task completed", uploadTask);
            const downloadURL = await uploadTask.ref.getDownloadURL();
            console.log("Download URL obtained:", downloadURL);

            await db.collection("users").doc(currentAdmin.uid).update({ photoURL: downloadURL });
            currentAdminData.photoURL = downloadURL;
            updateAdminInfo();
            showToast("Profile photo updated!", "success");
        } catch (err) {
            console.error("Upload error:", err);
            showToast("Failed to upload photo", "error");
        }
    }
}

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const views = document.querySelectorAll('.view-container');
    const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');

    const viewLabels = {
        dashboard: 'Dashboard',
        equipment: 'Manage Equipment',
        approvals: 'Pending Approvals',
        borrowed: 'Currently Borrowed',
        logs: 'Borrowing Logs',
        users: 'User Management',
        incidents: 'Incident Reports',
        history: 'Audit History',
        profile: 'User Profile'
    };

    function activateView(viewId) {
        if (viewId === 'incidents' && !isHeadAdmin()) {
            showToast('Access Denied: Only the Head Admin can access Incident Reports.', 'error');
            return;
        }

        navItems.forEach(nav => nav.classList.remove('active'));
        sidebarItems.forEach(si => si.classList.remove('active'));
        views.forEach(view => view.classList.remove('active'));

        // Bottom nav support
        const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
        bottomNavItems.forEach(bi => bi.classList.remove('active'));

        const matchingNav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (matchingNav) {
            matchingNav.classList.add('active');
            const parentLi = matchingNav.closest('.sidebar-item');
            if (parentLi) parentLi.classList.add('active');
        }

        const matchingBottom = document.querySelector(`.bottom-nav-item[data-view="${viewId}"]`);
        if (matchingBottom) matchingBottom.classList.add('active');

        const targetView = document.getElementById(`${viewId}View`);
        if (!targetView) return;
        targetView.classList.add('active');

        const label = viewLabels[viewId] || viewId;
        if (breadcrumbCurrent) breadcrumbCurrent.textContent = label;
        const mobileTitle = document.getElementById('topbarMobileTitle');
        if (mobileTitle) mobileTitle.textContent = label;

        if (viewId === 'dashboard') loadDashboardData();
        else if (viewId === 'equipment') loadAllEquipment();
        else if (viewId === 'approvals') loadPendingRequests();
        else if (viewId === 'borrowed') loadCurrentlyBorrowed();
        else if (viewId === 'logs') loadBorrowingLogs();
        else if (viewId === 'users') { loadUsers(); loadPending(); }
        else if (viewId === 'incidents') loadAllIncidents();

        try { localStorage.setItem('admin-active-view', viewId); } catch (e) { }

        if (window.innerWidth < 1280) {
            document.getElementById('sidebar')?.classList.remove('mobile-open');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            activateView(item.getAttribute('data-view'));
        });
    });

    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const view = item.getAttribute('data-view');
            if (!view) return;
            e.preventDefault();
            activateView(view);
        });
    });

    const bottomNavProfile = document.getElementById('bottomNavProfile');
    if (bottomNavProfile) {
        bottomNavProfile.addEventListener('click', (e) => {
            e.preventDefault();
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar && overlay) {
                sidebar.classList.add('mobile-open');
                overlay.classList.add('active');
                // Ensure sidebar is visible for this "Drawer" interaction
                sidebar.style.display = 'flex';
                sidebar.style.setProperty('display', 'flex', 'important');
            }
        });
    }

    // Export globally for onclick handlers
    window.switchView = activateView;


    const saved = (() => { try { return localStorage.getItem('admin-active-view'); } catch (e) { return null; } })();
    if (saved && document.getElementById(`${saved}View`)) {
        activateView(saved);
    } else {
        activateView('dashboard');
    }
}

function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const topbarToggle = document.getElementById('topbarToggle');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function toggleSidebar() {
        if (window.innerWidth < 1280) {
            sidebar.classList.toggle('mobile-open');
            sidebarOverlay.classList.toggle('active');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    }

    if (topbarToggle) topbarToggle.addEventListener('click', toggleSidebar);
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        });
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 1280) {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        }
    });
}

async function loadDashboardData() {
    try {
        const equipmentSnapshot = await db.collection('equipment').get();
        const equipment = equipmentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => u.status === 'approved');

        const totalEquipment = equipment.length;
        const availableEquipment = equipment.filter(e => e.status === 'available').length;
        const borrowedEquipment = equipment.filter(e => e.status === 'borrowed').length;
        const totalUsers = users.length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayBorrowsSnapshot = await db.collection('borrowings')
            .where('borrowedAt', '>=', today)
            .get();

        const todayBorrows = todayBorrowsSnapshot.size;

        const allBorrowsSnapshot = await db.collection('borrowings').get();
        const totalHistoricalBorrows = allBorrowsSnapshot.size;

        document.getElementById('totalEquipment').textContent = totalEquipment;
        document.getElementById('availableEquipment').textContent = availableEquipment;
        document.getElementById('todayBorrows').textContent = todayBorrows;
        document.getElementById('totalHistoricalBorrows').textContent = totalHistoricalBorrows;
        document.getElementById('totalUsers').textContent = totalUsers;

        await loadRecentActivities();

        await loadOverdueItems();

        if (window.syncDashboardCharts) {
            window.syncDashboardCharts();
        }


    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadRecentActivities() {
    const activitiesList = document.getElementById('recentActivities');
    if (!activitiesList) return;

    try {
        const snapshot = await db.collection('borrowings')
            .orderBy('borrowedAt', 'desc')
            .limit(5)
            .get();

        const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (activities.length === 0) {
            activitiesList.innerHTML = '<p style="color: var(--text-secondary);">No recent activities</p>';
        } else {
            activitiesList.innerHTML = activities.map(activity => `
                <div class="transaction-item ${activity.status === 'returned' ? 'success' : 'warning'}">
                    <div class="transaction-details">
                        <div class="transaction-title">${activity.status === 'returned' ? 'Returned' : 'Borrowed'}: ${activity.equipmentName}</div>
                        <div class="transaction-meta">${activity.userName}</div>
                    </div>
                    <div class="transaction-time">${formatDate(activity.borrowedAt)}</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading activities:', error);
    }
}

async function loadOverdueItems() {
    const overdueList = document.getElementById('overdueList');
    const sendAllRemindersBtn = document.getElementById('sendAllRemindersBtn');
    if (!overdueList) return;

    try {
        const now = new Date();

        const snapshot = await db.collection('borrowings')
            .where('status', 'in', ['borrowed', 'pending_extension'])
            .get();

        const overdue = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(item => {
                if (!item.expectedReturnTime || !item.borrowedAt) return false;

                const borrowedDate = item.borrowedAt.toDate();
                const [hh, mm] = String(item.expectedReturnTime).split(':').map(n => parseInt(n, 10));

                if (Number.isNaN(hh) || Number.isNaN(mm)) return false;

                const due = new Date(borrowedDate);
                due.setHours(hh, mm, 0, 0);

                return now > due;
            });
        if (typeof checkAllUsersForAutoSuspend === 'function') {
    checkAllUsersForAutoSuspend();
}

        if (sendAllRemindersBtn) {
            sendAllRemindersBtn.style.display = overdue.length > 0 ? 'inline-flex' : 'none';
            sendAllRemindersBtn.onclick = () => sendAllSMSReminders(overdue);
        }

        const sendAllEmailRemindersBtn = document.getElementById('sendAllEmailRemindersBtn');
        if (sendAllEmailRemindersBtn) {
            sendAllEmailRemindersBtn.style.display = overdue.length > 0 ? 'inline-flex' : 'none';
            sendAllEmailRemindersBtn.onclick = () => sendAllEmailReminders(overdue);
        }

        if (overdue.length === 0) {
            overdueList.innerHTML = `
                <div class="alert-item success">
                    <div class="alert-content">
                        <div class="alert-title">All Clear</div>
                        <div class="alert-message">No overdue items</div>
                    </div>
                </div>
            `;
        } else {
            overdueList.innerHTML = overdue.map(item => {
                const lastNotified = item.lastNotified ? formatDate(item.lastNotified) : 'Never';
                const typeLabel = item.notificationType ? ` (${item.notificationType.toUpperCase()})` : '';
                return `
                <div class="alert-item warning">
                    <div class="alert-content">
                        <div class="alert-title">${item.equipmentName}</div>
                        <div class="alert-message">
                            Borrowed by ${item.userName} - Due: ${formatTimeTo12h(item.expectedReturnTime)}<br>
                            <small style="opacity: 0.7; font-size: 0.7rem;">Notified: ${lastNotified}${typeLabel}</small>
                        </div>
                    </div>
                    <div class="alert-actions" style="margin-left: auto; display: flex; align-items: center; gap: 0.5rem;">
                        <button class="btn btn-icon" onclick="sendSMSOverdue('${item.userId}', '${item.equipmentName}', '${item.id}')" title="Send SMS Reminder">
                            <i class="fa-solid fa-comment-dots"></i>
                        </button>
                        <button class="btn btn-icon" onclick="sendEmailOverdue('${item.userId}', '${item.equipmentName}', '${item.id}')" title="Send Email Reminder">
                            <i class="fa-solid fa-envelope"></i>
                        </button>
                    </div>
                </div>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading overdue items:', error);
        overdueList.innerHTML = `
            <div class="alert-item warning">
                <div class="alert-icon"><i class="fa-solid fa-triangle-exclamation" style="color: rgb(255, 212, 59);"></i></div>
                <div class="alert-content">
                    <div class="alert-title">Error</div>
                    <div class="alert-message">Failed to load overdue list</div>
                </div>
            </div>
        `;
    }
}

async function checkAllUsersForAutoSuspend() {
    try {
        const activeSnapshot = await db.collection('borrowings')
            .where('status', 'in', ['borrowed', 'pending_extension'])
            .get();
        
        const historicalSnapshot = await db.collection('borrowings')
            .where('wasOverdue', '==', true)
            .get();

        const strikeMap = {};
        const now = new Date();

        // Calculate current active overdues
        activeSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId && data.borrowedAt && data.expectedReturnTime) {
                const borrowedDate = data.borrowedAt.toDate();
                const [hh, mm] = String(data.expectedReturnTime).split(':').map(Number);
                if (!isNaN(hh) && !isNaN(mm)) {
                    const due = new Date(borrowedDate);
                    due.setHours(hh, mm, 0, 0);
                    if (now > due) {
                        strikeMap[data.userId] = (strikeMap[data.userId] || 0) + 1;
                    }
                }
            }
        });

        // Calculate past overdues
        historicalSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId) strikeMap[data.userId] = (strikeMap[data.userId] || 0) + 1;
        });

        // Suspend users who hit 3 strikes
        for (const [userId, count] of Object.entries(strikeMap)) {
            if (count >= 3) {
                const userRef = db.collection('users').doc(userId);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData.status !== 'suspended' && userData.role !== 'admin') {
                        await userRef.update({
                            status: 'suspended',
                            suspendedReason: `Auto-suspended: Accumulated ${count} lifetime overdue items.`,
                            suspendedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            suspendedBy: 'system'
                        });
                        showToast(`System auto-suspended ${userData.name} for accumulating ${count} overdue items.`, 'warning');
                        if (typeof loadUsers === 'function') loadUsers();
                    }
                }
            }
        }
    } catch (err) {
        console.error("Auto-suspend error:", err);
    }
}

async function sendAllSMSReminders(overdueItems) {
    if (!overdueItems || overdueItems.length === 0) return;

    const count = overdueItems.length;
    if (!await showConfirm({
        title: 'Batch SMS Reminders',
        message: `This will initiate SMS reminders for ${count} users. You will need to click 'Send' in your SMS app for each one. Continue?`,
        confirmText: 'Continue',
        type: 'primary'
    })) return;

    for (const item of overdueItems) {
        await sendSMSOverdue(item.userId, item.equipmentName, item.id);
        await new Promise(r => setTimeout(r, 800));
    }
}

async function sendAllEmailReminders(overdueItems) {
    if (!overdueItems || overdueItems.length === 0) return;

    const count = overdueItems.length;
    if (!await showConfirm({
        title: 'Batch Email Reminders',
        message: `This will initiate Email reminders for ${count} users. Your mail app will open for each one. Continue?`,
        confirmText: 'Continue',
        type: 'primary'
    })) return;

    for (const item of overdueItems) {
        await sendEmailOverdue(item.userId, item.equipmentName, item.id);
        await new Promise(r => setTimeout(r, 1000));
    }
}



async function loadPendingRequests() {
    const pendingGrid = document.getElementById('pendingRequestsGrid');
    const badge = document.getElementById('approvalsBadge');
    const badgeMobile = document.getElementById('approvalsBadgeMobile');

    const dashPendingCount = document.getElementById('pendingRequestsCount');

    if (!pendingGrid) return;

    try {

        const [borrowSnapshot, returnSnapshot] = await Promise.all([
            db.collection('borrowings').where('status', '==', 'pending_borrow').get(),
            db.collection('borrowings').where('status', '==', 'pending_return').get()
        ]);

        const pBorrows = borrowSnapshot.docs.map(doc => ({ id: doc.id, type: 'borrow', ...doc.data() }));
        const pReturns = returnSnapshot.docs.map(doc => ({ id: doc.id, type: 'return', ...doc.data() }));

        const groupedBorrows = {};
        const individualPendingReturns = [...pReturns];

        // Register for bulk actions to avoid JSON stringify in onclick
        window.__pendingBulkStorage = {};

        pBorrows.forEach(req => {
            const submissionGroupId = req.submissionId || req.id;
            if (!groupedBorrows[submissionGroupId]) {
                groupedBorrows[submissionGroupId] = {
                    ...req,
                    items: []
                };
            }
            groupedBorrows[submissionGroupId].items.push({
                borrowingId: req.id,
                equipmentId: req.equipmentId,
                equipmentName: req.equipmentName,
                equipmentCode: req.equipmentCode
            });
        });

        const allPendingGrouped = [
            ...Object.values(groupedBorrows),
            ...individualPendingReturns
        ].sort((a, b) => {
            const timeA = (a.borrowedAt && a.borrowedAt.toDate) ? a.borrowedAt.toDate() : new Date(0);
            const timeB = (b.borrowedAt && b.borrowedAt.toDate) ? b.borrowedAt.toDate() : new Date(0);
            return timeB - timeA;
        });

        const count = allPendingGrouped.length;

        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        if (badgeMobile) {
            badgeMobile.textContent = count;
            badgeMobile.style.display = count > 0 ? 'flex' : 'none';
        }
        if (dashPendingCount) {
            dashPendingCount.textContent = count;
        }

        if (count === 0) {
            pendingGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="stat-icon" style="margin: 0 auto 1rem; width: 64px; height: 64px; background: rgba(16, 185, 129, 0.1); color: var(--success); display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <h3>All Caught Up!</h3>
                    <p style="color: var(--text-secondary);">There are no pending requests requiring your attention.</p>
                </div>
            `;
            return;
        }

        pendingGrid.innerHTML = allPendingGrouped.map(req => {
            const isBorrow = req.type === 'borrow';
            const isReturn = req.type === 'return';
            const submissionGroupId = req.submissionId || req.id;

            let actionColor = 'var(--primary)';
            let actionBg = 'rgba(60, 255, 154, 0.1)';
            let actionLabel = 'Borrow Request';
            let icon = '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>';

            if (isReturn) {
                actionColor = 'var(--warning)';
                actionBg = 'rgba(245, 158, 11, 0.1)';
                actionLabel = 'Return Request';
                icon = '<polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path>';
            }

            // For grouped borrows (cart submissions)
            const isBulk = isBorrow && req.items && req.items.length > 1;
            const itemsListHtml = isBulk 
                ? `<ul style="margin-top: 5px; list-style: none; padding-left: 0;">` + 
                  req.items.map(it => `<li style="font-size: 0.85rem; margin-bottom: 3px;"><i class="fa-solid fa-cube" style="font-size: 0.7rem; opacity: 0.6;"></i> ${it.equipmentName} (${it.equipmentCode})</li>`).join('') + 
                  `</ul>`
                : '';

            const equipmentDisplayName = isBulk ? `${req.items.length} Items Selected` : req.equipmentName;
            const equipmentDisplayCode = isBulk ? 'Cart Submission' : `ID: ${req.equipmentCode}`;

            let actionButtonsHtml = '';
            if (isBorrow) {
                const storageId = `bulk_${submissionGroupId}`;
                window.__pendingBulkStorage[storageId] = req.items;
                actionButtonsHtml = `
                    <button class="btn btn-primary" style="flex: 1;" onclick="approveBorrowBulk('${storageId}')">Approve</button>
                    <button class="btn btn-secondary" style="flex: 1; border-color: var(--danger); color: var(--danger);" onclick="rejectBorrowBulk('${storageId}')">Reject</button>
                `;
            } else {
                actionButtonsHtml = `
                    <button class="btn btn-primary" style="flex: 1;" onclick="approveReturn('${req.id}', '${req.equipmentId}', '${req.pendingReturnCondition}')">Approve</button>
                    <button class="btn btn-secondary" style="flex: 1; border-color: var(--danger); color: var(--danger);" onclick="rejectReturn('${req.id}', '${req.equipmentId}')">Reject</button>
                `;
            }

            return `
                <div class="equipment-card" style="border-top: 4px solid ${actionColor}">
                    <div class="card-header">
                        <div class="card-title-group">
                            <h3 class="card-title">${equipmentDisplayName}</h3>
                            <span class="card-subtitle">${equipmentDisplayCode}</span>
                        </div>
                        <div class="stat-icon" style="background: ${actionBg}; color: ${actionColor}; width: 32px; height: 32px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${icon}
                            </svg>
                        </div>
                    </div>
                    
                    <div class="card-details" style="margin: 1rem 0;">
                        <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-primary);">
                            ${actionLabel} by:
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                            <div class="topbar-user-avatar" style="width: 24px; height: 24px; font-size: 0.7rem; background: var(--bg-secondary); color: var(--text-primary); overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                ${req.userPhotoURL ? `<img src="${req.userPhotoURL}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : `<span>${req.userName.charAt(0).toUpperCase()}</span>`}
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; font-weight: 500;">${req.userName}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${req.studentId || req.facultyId || 'N/A'}</div>
                            </div>
                        </div>
                        
                        ${isBorrow ? `
                            <div class="detail-row"><span>Room:</span> <span>${req.room || 'N/A'}</span></div>
                            <div class="detail-row"><span>Purpose:</span> <span>${req.purpose || 'N/A'}</span></div>
                            <div class="detail-row"><span>Duration:</span> <span>Until ${formatTimeTo12h(req.expectedReturnTime)}</span></div>
                            ${itemsListHtml}
                        ` : isReturn ? `
                            <div class="detail-row"><span>Condition:</span> <span style="text-transform: capitalize;">${req.pendingReturnCondition || 'N/A'}</span></div>
                            <div class="detail-row"><span>Notes:</span> <span style="font-style: italic;">${req.pendingReturnNotes || 'None'}</span></div>
                        ` : `
                            <div class="detail-row"><span>Current Due:</span> <span>${formatTimeTo12h(req.expectedReturnTime)}</span></div>
                            <div class="detail-row"><span>New Requested:</span> <span style="font-weight:700; color:#1e40af;">${formatTimeTo12h(req.requestedReturnTime)}</span></div>
                            <div class="detail-row"><span>Reason:</span> <span>${req.extensionReason || 'N/A'}</span></div>
                        `}
                    </div>

                    <div class="card-actions" style="margin-top: auto; display: flex; gap: 0.5rem;">
                        ${actionButtonsHtml}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading pending requests:', error);
        pendingGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="alert-item warning">
                    <div class="alert-icon"><i class="fa-solid fa-triangle-exclamation" style="color: rgb(255, 212, 59);"></i></div>
                    <div class="alert-content">
                        <div class="alert-title">Error</div>
                        <div class="alert-message">Failed to load pending requests</div>
                    </div>
                </div>
            </div>
        `;
    }
}


function initializeImageZoomModal() {
    const modal = document.getElementById('imageZoomModal');
    const zoomedImage = document.getElementById('zoomedImagePreview');
    const closeBtn = document.getElementById('closeImageZoomModal');

    if (!modal || !zoomedImage || modal.dataset.zoomInitialized === 'true') return;
    modal.dataset.zoomInitialized = 'true';

    closeBtn?.addEventListener('click', closeImageZoomModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeImageZoomModal();
    });

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-zoom-src]');
        if (!trigger) return;
        const src = trigger.getAttribute('data-zoom-src');
        if (!src) return;
        openImageZoomModal(src);
    });
}

function openImageZoomModal(src) {
    const modal = document.getElementById('imageZoomModal');
    const zoomedImage = document.getElementById('zoomedImagePreview');
    if (!modal || !zoomedImage || !src) return;

    zoomedImage.src = src;
    modal.classList.add('active');
}

function closeImageZoomModal() {
    const modal = document.getElementById('imageZoomModal');
    const zoomedImage = document.getElementById('zoomedImagePreview');
    if (modal) modal.classList.remove('active');
    if (zoomedImage) zoomedImage.src = '';
}

function initializeStudentIdCaptureModal() {
    const modal = document.getElementById('studentIdCaptureModal');
    if (!modal || modal.dataset.initialized === 'true') return;
    modal.dataset.initialized = 'true';

    document.getElementById('closeStudentIdCaptureModal')?.addEventListener('click', closeStudentIdCaptureModal);
    document.getElementById('cancelStudentIdCaptureBtn')?.addEventListener('click', closeStudentIdCaptureModal);
    document.getElementById('openStudentIdCameraBtn')?.addEventListener('click', startStudentIdCamera);
    document.getElementById('captureStudentIdBtn')?.addEventListener('click', captureStudentIdPhoto);
    document.getElementById('retakeStudentIdBtn')?.addEventListener('click', retakeStudentIdPhoto);
    document.getElementById('saveStudentIdCaptureBtn')?.addEventListener('click', saveStudentIdCapture);
    document.getElementById('studentIdFileInput')?.addEventListener('change', handleStudentIdUpload);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeStudentIdCaptureModal();
    });
}

function setStudentIdCaptureStatus(message, type = 'info') {
    const statusEl = document.getElementById('studentIdCaptureStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--text-secondary)';
}

function resetStudentIdCaptureUI() {
    studentIdCaptureImage = '';

    const video = document.getElementById('studentIdVideo');
    const preview = document.getElementById('studentIdPreview');
    const fileInput = document.getElementById('studentIdFileInput');
    const captureBtn = document.getElementById('captureStudentIdBtn');
    const retakeBtn = document.getElementById('retakeStudentIdBtn');

    if (video) {
        video.style.display = '';
        video.srcObject = null;
    }
    if (preview) {
        preview.style.display = 'none';
        preview.removeAttribute('src');
    }
    if (fileInput) fileInput.value = '';
    if (captureBtn) captureBtn.style.display = '';
    if (retakeBtn) retakeBtn.style.display = 'none';

    setStudentIdCaptureStatus('Camera is ready. You can also upload a photo if camera access is blocked.');
}

async function startStudentIdCamera() {
    const video = document.getElementById('studentIdVideo');
    if (!video) return;

    try {
        stopStudentIdCamera();
        studentIdCameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        video.srcObject = studentIdCameraStream;
        await video.play().catch(() => { });
        setStudentIdCaptureStatus('Camera opened. Hold the ID steady, then press Capture.', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        setStudentIdCaptureStatus('Camera access failed. You can still upload a student ID photo.', 'error');
    }
}

function stopStudentIdCamera() {
    if (studentIdCameraStream) {
        studentIdCameraStream.getTracks().forEach(track => track.stop());
        studentIdCameraStream = null;
    }
}

function compressStudentIdCanvas(canvas, maxWidth = 900, maxHeight = 600, quality = 0.72) {
    let { width, height } = canvas;
    let targetWidth = width;
    let targetHeight = height;

    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        targetWidth = Math.round(width * ratio);
        targetHeight = Math.round(height * ratio);
    }

    const output = document.createElement('canvas');
    output.width = targetWidth;
    output.height = targetHeight;
    const ctx = output.getContext('2d');
    ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    return output.toDataURL('image/jpeg', quality);
}

function showStudentIdPreview(dataUrl, message = 'Student ID photo captured.') {
    const video = document.getElementById('studentIdVideo');
    const preview = document.getElementById('studentIdPreview');
    const captureBtn = document.getElementById('captureStudentIdBtn');
    const retakeBtn = document.getElementById('retakeStudentIdBtn');

    studentIdCaptureImage = dataUrl;
    if (preview) {
        preview.src = dataUrl;
        preview.style.display = 'block';
    }
    if (video) video.style.display = 'none';
    if (captureBtn) captureBtn.style.display = 'none';
    if (retakeBtn) retakeBtn.style.display = '';
    setStudentIdCaptureStatus(message, 'success');
}

function captureStudentIdPhoto() {
    const video = document.getElementById('studentIdVideo');
    const canvas = document.getElementById('studentIdCanvas');

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
        setStudentIdCaptureStatus('Open the camera first or upload a photo.', 'error');
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = compressStudentIdCanvas(canvas);
    showStudentIdPreview(dataUrl, 'Student ID photo captured from camera.');
    stopStudentIdCamera();
}

async function handleStudentIdUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const dataUrl = await resizeImage(file, 900, 600);
        showStudentIdPreview(dataUrl, 'Student ID photo uploaded successfully.');
        stopStudentIdCamera();
    } catch (error) {
        console.error('Upload preview error:', error);
        setStudentIdCaptureStatus('Failed to read the selected image.', 'error');
    }
}

async function openStudentIdCaptureModal(items) {
    pendingBorrowApproval = items;
    resetStudentIdCaptureUI();

    const modal = document.getElementById('studentIdCaptureModal');
    if (modal) modal.classList.add('active');

    if (!navigator.mediaDevices?.getUserMedia) {
        setStudentIdCaptureStatus('This browser cannot open the camera. Please upload a student ID photo.', 'error');
        return;
    }

    await startStudentIdCamera();
}

function retakeStudentIdPhoto() {
    resetStudentIdCaptureUI();
    startStudentIdCamera();
}

function closeStudentIdCaptureModal() {
    stopStudentIdCamera();
    resetStudentIdCaptureUI();
    pendingBorrowApproval = null;
    const modal = document.getElementById('studentIdCaptureModal');
    if (modal) modal.classList.remove('active');
}

async function saveStudentIdCapture() {
    if (!pendingBorrowApproval || (Array.isArray(pendingBorrowApproval) && pendingBorrowApproval.length === 0)) {
        showToast('Borrow request details are missing.', 'error');
        return;
    }

    if (!studentIdCaptureImage) {
        setStudentIdCaptureStatus('Please capture or upload the student ID first.', 'error');
        return;
    }

    await approveBorrow(pendingBorrowApproval, studentIdCaptureImage, true);
}


async function approveBorrow(items, capturedStudentIdPhoto = null, autoApprove = false) {
    if (!capturedStudentIdPhoto) {
        await openStudentIdCaptureModal(items);
        return;
    }

    if (!autoApprove && !await showConfirm({
        title: 'Approve Borrow',
        message: 'Save this student ID photo and approve the borrow request?',
        confirmText: 'Approve',
        type: 'success'
    })) return;

    try {
        const batch = db.batch();
        const itemsArray = Array.isArray(items) ? items : [items];
        
        for (const item of itemsArray) {
            const borrowDoc = await db.collection('borrowings').doc(item.borrowingId).get();
            const borrowData = borrowDoc ? borrowDoc.data() : {};

            batch.update(db.collection('borrowings').doc(item.borrowingId), {
                status: 'borrowed',
                studentIdPhoto: capturedStudentIdPhoto,
                studentIdPhotoCapturedAt: firebase.firestore.FieldValue.serverTimestamp(),
                studentIdPhotoCapturedBy: currentAdmin?.uid || null,
                studentIdPhotoCapturedByName: currentAdminData?.name || currentAdmin?.email || 'Administrator'
            });

            batch.update(db.collection('equipment').doc(item.equipmentId), {
                status: 'borrowed',
                borrowedBy: (borrowData && borrowData.userId) || null,
                borrowedAt: (borrowData && borrowData.borrowedAt) || firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();
        closeStudentIdCaptureModal();
        showToast(itemsArray.length > 1 ? `Approved ${itemsArray.length} items` : 'Borrow request approved', 'success');
        loadPendingRequests();
        loadCurrentlyBorrowed();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Error approving request', 'error');
    }
}

async function rejectBorrow(items) {
    const itemsArray = Array.isArray(items) ? items : [items];
    const message = itemsArray.length > 1 
        ? `Reject these ${itemsArray.length} borrow requests?` 
        : 'Reject this borrow request?';

    if (!await showConfirm({
        title: 'Reject Borrow',
        message: message,
        confirmText: 'Reject',
        type: 'danger'
    })) return;

    try {
        const batch = db.batch();
        for (const item of itemsArray) {
            batch.update(db.collection('borrowings').doc(item.borrowingId), { status: 'rejected' });
            batch.update(db.collection('equipment').doc(item.equipmentId), {
                status: 'available',
                borrowedBy: null,
                borrowedAt: null
            });
        }
        await batch.commit();
        showToast(itemsArray.length > 1 ? `Rejected ${itemsArray.length} items` : 'Borrow request rejected', 'success');
        loadPendingRequests();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Error rejecting request', 'error');
    }
}

// Global exposure for bulk actions
window.approveBorrowBulk = (storageId) => {
    const items = window.__pendingBulkStorage?.[storageId];
    if (items) approveBorrow(items);
    else showToast('Could not find request data', 'error');
};
window.rejectBorrowBulk = (storageId) => {
    const items = window.__pendingBulkStorage?.[storageId];
    if (items) rejectBorrow(items);
    else showToast('Could not find request data', 'error');
};

async function approveReturn(borrowingId, equipmentId, condition) {
    if (!await showConfirm({
        title: 'Approve Return',
        message: 'Approve this return request?',
        confirmText: 'Approve',
        type: 'success'
    })) return;
    try {

        const doc = await db.collection('borrowings').doc(borrowingId).get();
        const data = doc.data();

        await db.collection('borrowings').doc(borrowingId).update({
            status: 'returned',
            returnedAt: firebase.firestore.FieldValue.serverTimestamp(),
            returnCondition: data.pendingReturnCondition || condition,
            returnNotes: data.pendingReturnNotes || '',
            studentIdPhoto: firebase.firestore.FieldValue.delete(),
            studentIdPhotoCapturedAt: firebase.firestore.FieldValue.delete(),
            studentIdPhotoCapturedBy: firebase.firestore.FieldValue.delete(),
            studentIdPhotoCapturedByName: firebase.firestore.FieldValue.delete()
        });

        await db.collection('equipment').doc(equipmentId).update({
            status: (data.pendingReturnCondition || condition) === 'damaged' ? 'maintenance' : 'available',
            borrowedBy: null,
            borrowedAt: null
        });
        showToast('Return request approved', 'success');
        loadPendingRequests();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Error approving return', 'error');
    }
}

async function rejectReturn(borrowingId, equipmentId) {
    if (!await showConfirm({
        title: 'Reject Return',
        message: 'Reject this return request? The item will remain marked as Borrowed.',
        confirmText: 'Reject',
        type: 'danger'
    })) return;
    try {
        await db.collection('borrowings').doc(borrowingId).update({
            status: 'borrowed',
            pendingReturnCondition: firebase.firestore.FieldValue.delete(),
            pendingReturnNotes: firebase.firestore.FieldValue.delete()
        });
        await db.collection('equipment').doc(equipmentId).update({ status: 'borrowed' });
        showToast('Return request rejected', 'success');
        loadPendingRequests();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Error rejecting return', 'error');
    }
}

async function approveExtension(borrowingId) {
    if (!await showConfirm({
        title: 'Approve Extension',
        message: 'Approve this time extension request?',
        confirmText: 'Approve',
        type: 'success'
    })) return;
    try {
        const doc = await db.collection('borrowings').doc(borrowingId).get();
        const data = doc.data();

        const updateData = {
            status: 'borrowed',
            expectedReturnTime: data.requestedReturnTime,
            requestedReturnTime: firebase.firestore.FieldValue.delete(),
            extensionReason: firebase.firestore.FieldValue.delete(),
            hasExtension: true
        };

        if (!data.originalExpectedReturnTime) {
            updateData.originalExpectedReturnTime = data.expectedReturnTime;
        }

        await db.collection('borrowings').doc(borrowingId).update(updateData);

        showToast('Extension request approved', 'success');
        loadPendingRequests();
        loadCurrentlyBorrowed();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Error approving extension', 'error');
    }
}

async function rejectExtension(borrowingId) {
    if (!await showConfirm({
        title: 'Reject Extension',
        message: 'Reject this time extension request?',
        confirmText: 'Reject',
        type: 'danger'
    })) return;
    try {
        await db.collection('borrowings').doc(borrowingId).update({
            status: 'borrowed',
            requestedReturnTime: firebase.firestore.FieldValue.delete(),
            extensionReason: firebase.firestore.FieldValue.delete()
        });

        showToast('Extension request rejected', 'success');
        loadPendingRequests();
        loadCurrentlyBorrowed();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Error rejecting extension', 'error');
    }
}

async function adminConfirmReturn(borrowingId, equipmentId) {
    const conditionSelect = document.getElementById(`returnCondition_${borrowingId}`);
    const condition = conditionSelect ? conditionSelect.value : 'good';

    if (!await showConfirm({
        title: 'Confirm Return',
        message: `Confirm return of this item? Condition: ${condition}`,
        confirmText: 'Confirm',
        type: 'primary'
    })) return;

    try {
        const doc = await db.collection('borrowings').doc(borrowingId).get();
        const data = doc.data();

        let wasOverdue = false;
        if (data.expectedReturnTime) {
            const now = new Date();
            const borrowedDate = data.borrowedAt ? data.borrowedAt.toDate() : new Date();
            const [hh, mm] = data.expectedReturnTime.split(':').map(Number);
            const due = new Date(borrowedDate);
            due.setHours(hh, mm, 0, 0);
            wasOverdue = now > due;
        }

        await db.collection('borrowings').doc(borrowingId).update({
            status: 'returned',
            returnedAt: firebase.firestore.FieldValue.serverTimestamp(),
            returnCondition: condition,
            returnNotes: '',
            wasOverdue: wasOverdue,
            studentIdPhoto: firebase.firestore.FieldValue.delete(),
            studentIdPhotoCapturedAt: firebase.firestore.FieldValue.delete(),
            studentIdPhotoCapturedBy: firebase.firestore.FieldValue.delete(),
            studentIdPhotoCapturedByName: firebase.firestore.FieldValue.delete()
        });

        await db.collection('equipment').doc(equipmentId).update({
            status: condition === 'damaged' ? 'maintenance' : 'available',
            borrowedBy: null,
            borrowedAt: null
        });

        showToast('Return confirmed successfully', 'success');
        loadCurrentlyBorrowed();
        loadDashboardData();
        checkAllUsersForAutoSuspend();
    } catch (err) {
        console.error(err);
        showToast('Error confirming return', 'error');
    }
}

function previewEquipmentPhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 5 * 1024 * 1024) {
            showToast("Photo is too large (max 5MB)", "error");
            input.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById("addEquipmentPhotoImg");
            const placeholder = document.getElementById("addEquipmentPhotoPlaceholder");
            const removeBtn = document.getElementById("removeAddEquipmentPhotoBtn");
            if (img) {
                img.src = e.target.result;
                img.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'inline-flex';
        };
        reader.readAsDataURL(file);
    }
}

function clearAddEquipmentPhoto() {
    const input = document.getElementById("equipmentPhotoInput");
    if (input) input.value = "";
    const img = document.getElementById("addEquipmentPhotoImg");
    const placeholder = document.getElementById("addEquipmentPhotoPlaceholder");
    const removeBtn = document.getElementById("removeAddEquipmentPhotoBtn");
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'none';
}

function initializeEquipmentManagement() {
    const addEquipmentBtn = document.getElementById('addEquipmentBtn');
    const addEquipmentModal = document.getElementById('addEquipmentModal');
    const closeEquipmentModal = document.getElementById('closeEquipmentModal');
    const cancelEquipment = document.getElementById('cancelEquipment');
    const addEquipmentForm = document.getElementById('addEquipmentForm');

    if (addEquipmentBtn) {
        addEquipmentBtn.addEventListener('click', () => {
            addEquipmentModal.classList.add('active');
        });
    }

    if (closeEquipmentModal) {
        closeEquipmentModal.addEventListener('click', () => {
            addEquipmentModal.classList.remove('active');
            addEquipmentForm.reset();
            clearAddEquipmentPhoto();
        });
    }

    if (cancelEquipment) {
        cancelEquipment.addEventListener('click', () => {
            addEquipmentModal.classList.remove('active');
            addEquipmentForm.reset();
            clearAddEquipmentPhoto();
        });
    }

    if (addEquipmentModal) {
        addEquipmentModal.addEventListener('click', (e) => {
            if (e.target === addEquipmentModal) {
                addEquipmentModal.classList.remove('active');
                addEquipmentForm.reset();
                clearAddEquipmentPhoto();
            }
        });
    }

    if (addEquipmentForm) {
        addEquipmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addEquipment();
        });
    }
}

async function addEquipment() {
    const equipmentId = document.getElementById('equipmentId').value.trim();
    const name = document.getElementById('equipmentName').value.trim();
    const category = document.getElementById('equipmentCategory').value;
    const description = document.getElementById('equipmentDescription').value;

    const submitBtn = document.querySelector('#addEquipmentForm button[type="submit"]');
    const originalContent = submitBtn.innerHTML;

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Adding...</span>';

        const existingSnapshot = await db.collection('equipment')
            .where('equipmentId', '==', equipmentId)
            .get();

        if (!existingSnapshot.empty) {
            showToast('Equipment ID already exists', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalContent;
            return;
        }

        const photoInput = document.getElementById('equipmentPhotoInput');
        let photoURL = null;
        if (photoInput && photoInput.files && photoInput.files[0]) {
            try {
                photoURL = await readFileAsBase64(photoInput.files[0]);
            } catch (photoErr) {
                console.warn('Error reading equipment photo:', photoErr);
            }
        }

        const newEquipData = {
            equipmentId: equipmentId,
            name: name,
            category: category,
            description: description || '',
            status: 'available',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (photoURL) {
            newEquipData.photoURL = photoURL;
        }

        await db.collection('equipment').add(newEquipData);

        showToast('Equipment added successfully!', 'success');
        document.getElementById('addEquipmentModal').classList.remove('active');
        document.getElementById('addEquipmentForm').reset();
        clearAddEquipmentPhoto();

        loadAllEquipment();
        loadDashboardData();

    } catch (error) {
        console.error('Error adding equipment:', error);
        showToast(`Failed to add equipment: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    }
}

function getEquipmentImage(category) {
    const images = {
        'projector': 'assets/images/projector.png',
        'cable': 'assets/images/hdmi.png',
        'remote': 'assets/images/remote.png',
        'display': 'assets/images/display.png',
        'extension': 'assets/images/ext-cord.png',
        'laptop': 'assets/images/laptop.png',
        'network': 'assets/images/network-kit.png',
        'other': 'assets/images/other-kit.png'
    };
    return images[category] || 'assets/images/other-kit.png';
}

async function loadAllEquipment() {
    const equipmentList = document.getElementById('equipmentList');
    if (!equipmentList) return;

    try {
        const snapshot = await db.collection('equipment')
            .orderBy('createdAt', 'desc')
            .get();

        let equipment = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        currentEquipmentList = equipment;

        const searchInput = document.getElementById('equipmentSearchInput')?.value.trim();
        if (searchInput) {
            const searchLower = searchInput.toLowerCase();
            equipment = equipment.filter(item => {
                const match = String(item.equipmentId).match(/\d+/);
                const idNum = match ? match[0] : '';
                return idNum.includes(searchInput) ||
                    String(item.equipmentId).toLowerCase().includes(searchLower) ||
                    String(item.name || '').toLowerCase().includes(searchLower) ||
                    String(item.category || '').toLowerCase().includes(searchLower) ||
                    String(item.description || '').toLowerCase().includes(searchLower);
            });
        }

        const sortSelect = document.getElementById('equipmentSortSelect')?.value;
        if (sortSelect === 'id_asc' || sortSelect === 'id_desc') {
            equipment.sort((a, b) => {
                const matchA = String(a.equipmentId).match(/\d+/);
                const matchB = String(b.equipmentId).match(/\d+/);
                const numA = matchA ? parseInt(matchA[0], 10) : 0;
                const numB = matchB ? parseInt(matchB[0], 10) : 0;
                if (sortSelect === 'id_asc') {
                    return numA - numB;
                } else {
                    return numB - numA;
                }
            });
        }

        if (equipment.length === 0) {
            equipmentList.innerHTML = `
                <div class="empty-state">
                    <h3>No equipment found</h3>
                    <p>Start by adding new equipment</p>
                </div>
            `;
        } else {
            equipmentList.innerHTML = equipment.map(item => {
                const imgPath = item.photoURL || getEquipmentImage(item.category);
                return `
                <div class="equipment-list-item">
                    <div style="width: 60px; height: 60px; background: rgba(11, 31, 58, 0.03); border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 15px; flex-shrink: 0; cursor: zoom-in;" onclick="openImageZoomModal('${imgPath}')" title="Click to zoom">
                        <img src="${imgPath}" alt="${item.name}" style="max-width: 45px; max-height: 45px; object-fit: contain;">
                    </div>
                    <div class="equipment-list-info" style="flex:1;">
                        <div class="equipment-list-name">${item.name}</div>
                        <div class="equipment-list-meta">
                            <span class="badge badge-category">${item.equipmentId}</span>
                            <span class="badge badge-type">${capitalize(item.category)}</span>
                            <span class="badge badge-status ${item.status}">${capitalize(item.status)}</span>
                        </div>
                    </div>
                    <div class="equipment-list-actions">
                    <button class="btn btn-warning" onclick="openEditEquipment('${item.id}')" title="Edit">
                    Edit
                    </button>
                        <button class="btn btn-secondary btn-sm" onclick="generateQRCode('${item.id}', '${item.equipmentId}', '${item.name}')">
                            QR Code
                        </button>
                        <button class="btn btn-danger" onclick="deleteEquipment('${item.id}', '${item.name}')" title="Delete">
                        Delete
                        </button>
                    </div>
                </div>
            `}).join('');
        }
    } catch (error) {
        console.error('Error loading equipment:', error);
        equipmentList.innerHTML = `
            <div class="empty-state">
                <h3>Error loading equipment</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

async function deleteEquipment(equipmentId, equipmentName) {
    if (!await showConfirm({
        title: 'Delete Equipment',
        message: `Are you sure you want to delete "${equipmentName}"?\n\nThis action cannot be undone.`,
        confirmText: 'Delete',
        type: 'danger'
    })) {
        return;
    }

    try {
        const borrowingSnapshot = await db.collection('borrowings')
            .where('equipmentId', '==', equipmentId)
            .where('status', '==', 'borrowed')
            .get();

        if (!borrowingSnapshot.empty) {
            showToast('Cannot delete equipment that is currently borrowed', 'error');
            return;
        }

        await db.collection('equipment').doc(equipmentId).delete();
        showToast('Equipment deleted successfully', 'success');

        loadAllEquipment();
        loadDashboardData();
    } catch (error) {
        console.error('Error deleting equipment:', error);
        showToast('Failed to delete equipment', 'error');
    }
}

function generateQRCode(equipmentDocId, equipmentId, equipmentName) {
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = '';

    const baseUrl = window.location.origin;
    const deepLink = `${baseUrl}/student.html?borrow=${encodeURIComponent(equipmentId)}`;

    new QRCode(qrContainer, {
        text: deepLink,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('qrEquipmentId').textContent = equipmentId;
    document.getElementById('qrEquipmentName').textContent = equipmentName;

    document.getElementById('qrCodeModal').classList.add('active');

    setupQRActions(equipmentId);
}


function setupQRActions(equipmentId) {
    const downloadBtn = document.getElementById('downloadQrBtn');
    const printBtn = document.getElementById('printQrBtn');
    const closeQrModal = document.getElementById('closeQrModal');
    const qrModal = document.getElementById('qrCodeModal');

    downloadBtn.onclick = () => {
        const canvas = document.querySelector('#qrCodeContainer canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `QR-${equipmentId}.png`;
            link.href = canvas.toDataURL();
            link.click();
            showToast('QR Code downloaded', 'success');
        }
    };

    printBtn.onclick = () => {
        const canvas = document.querySelector('#qrCodeContainer canvas');
        if (canvas) {
            const printWindow = window.open('', '', 'width=600,height=600');
            printWindow.document.write(`
                <html>
                <head>
                    <title>QR Code - ${equipmentId}</title>
                    <style>
                        body { text-align: center; font-family: Arial, sans-serif; padding: 20px; }
                        img { max-width: 400px; margin: 20px 0; }
                        h2 { margin: 10px 0; }
                    </style>
                </head>
                <body>
                    <h2>Equipment QR Code</h2>
                    <p><strong>ID:</strong> ${equipmentId}</p>
                    <img src="${canvas.toDataURL()}" />
                    <p><em>Scan this code to borrow or return equipment</em></p>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };

    closeQrModal.onclick = () => {
        qrModal.classList.remove('active');
    };

    qrModal.onclick = (e) => {
        if (e.target === qrModal) {
            qrModal.classList.remove('active');
        }
    };
}

async function loadCurrentlyBorrowed() {
    const borrowedList = document.getElementById('borrowedList');
    if (!borrowedList) return;

    try {
        const now = new Date();

        const snapshot = await db.collection('borrowings')
            .where('status', 'in', ['borrowed', 'pending_extension'])
            .get();

        let borrowed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch user data for extra fields
        const userIds = [...new Set(borrowed.map(b => b.userId).filter(id => id))];
        const usersMap = {};
        if (userIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < userIds.length; i += 10) chunks.push(userIds.slice(i, i + 10));
            for (const chunk of chunks) {
                const uSnap = await db.collection("users").where(firebase.firestore.FieldPath.documentId(), "in", chunk).get();
                uSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });
            }
        }

        const sortVal = document.getElementById('borrowedSort')?.value || 'borrowedAt_desc';
        const [field, direction] = sortVal.split('_');

        borrowed.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            if (valA?.toDate) valA = valA.toDate();
            if (valB?.toDate) valB = valB.toDate();

            if (valA == null) return 1;
            if (valB == null) return -1;

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (direction === 'asc') {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });

        if (borrowed.length === 0) {
            borrowedList.innerHTML = `
                <div class="empty-state">
                    <h3>No borrowed equipment</h3>
                    <p>All equipment is available</p>
                </div>
            `;
        } else {
            borrowedList.innerHTML = borrowed.map(item => {
                const daysBorrowed = item.borrowedAt
                    ? Math.floor((new Date() - item.borrowedAt.toDate()) / (1000 * 60 * 60 * 24))
                    : 0;

                const isPendingExtend = item.status === 'pending_extension';
                let isOverdue = false;
                if (item.borrowedAt && item.expectedReturnTime) {
                    const borrowedDate = item.borrowedAt.toDate();
                    const [hh, mm] = String(item.expectedReturnTime).split(':').map(n => parseInt(n, 10));
                    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
                        const due = new Date(borrowedDate);
                        due.setHours(hh, mm, 0, 0);
                        isOverdue = now > due;
                    }
                }

                const userDoc = usersMap[item.userId] || {};
                const displayName = (userDoc.firstName && userDoc.lastName) ? `${userDoc.firstName} ${userDoc.lastName}` : item.userName;
                const courseInfo = userDoc.course ? userDoc.course : 'N/A';
                const yearSecInfo = userDoc.yearSection ? userDoc.yearSection : ((userDoc.yearLevel && userDoc.section) ? `${userDoc.yearLevel}-${userDoc.section}` : 'N/A');

                return `
                    <div class="borrowed-list-item" ${isPendingExtend ? 'style="border-left: 4px solid #1e40af; background: rgba(30, 64, 175, 0.02);"' : ''}>
                        <div class="borrowed-list-header">
                            <div>
                                <div class="borrowed-student">${displayName}</div>
                                <div class="borrowed-list-details">
                                    ${item.userEmail} • ID: ${item.studentId || item.facultyId || 'N/A'} <br>
                                    ${userDoc.role === 'professor' ? (userDoc.department || 'N/A') : `${courseInfo} • ${yearSecInfo}`}
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                ${isPendingExtend
                        ? '<span class="badge badge-status" style="background: rgba(30, 64, 175, 0.1); color: #1e40af">EXTENSION REQUESTED</span>'
                        : ''}
                                ${isOverdue
                        ? '<span class="badge badge-status" style="background: rgba(239, 68, 68, 0.1); color: var(--danger)">OVERDUE</span>'
                        : ''
                    }
                            </div>
                        </div>

                        <div class="borrowed-list-details" style="margin-top: 1rem;">
                            <strong>Equipment:</strong> ${item.equipmentName}<br>
                            <strong>Borrowed:</strong> ${formatDate(item.borrowedAt)}<br>
                            <strong>Current Due:</strong> ${item.expectedReturnTime || 'N/A'}<br>
                            ${item.studentIdPhoto ? `
                                <div style="margin-top: 0.9rem; padding: 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(11, 31, 58, 0.02); display: flex; gap: 0.9rem; align-items: center; flex-wrap: wrap;">
                                    <img src="${item.studentIdPhoto}" alt="Student ID" class="zoomable-id-photo" data-zoom-src="${item.studentIdPhoto}" title="Click to zoom" style="width: 120px; max-width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 0.75rem; border: 1px solid var(--border); background: #fff; cursor: zoom-in; transition: transform 0.2s ease, box-shadow 0.2s ease;">
                                    <div style="flex: 1; min-width: 180px;">
                                        <strong style="display:block; margin-bottom: 0.2rem;">Stored ID Photo</strong>
                                        <div style="color: var(--text-secondary); font-size: 0.85rem;">Click the photo to zoom. This captured ID will be removed automatically after the item is returned.</div>
                                        ${item.studentIdPhotoCapturedAt ? `<div style="margin-top: 0.35rem; font-size: 0.8rem; color: var(--text-secondary);">Captured: ${formatDate(item.studentIdPhotoCapturedAt)}</div>` : ''}
                                    </div>
                                </div>
                            ` : `
                                <div style="margin-top: 0.9rem; padding: 0.75rem 0.9rem; border-radius: var(--radius-md); background: rgba(245, 158, 11, 0.08); color: #9a6700; font-size: 0.85rem;">No student ID photo stored for this borrowing yet.</div>
                            `}
                            ${isPendingExtend ? `
                                <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(30, 64, 175, 0.05); border-radius: var(--radius-md); border: 1px dashed #1e40af;">
                                    <strong style="color: #1e40af;">New Requested Time:</strong> <span style="font-weight:700; color: #1e40af;">${item.requestedReturnTime}</span><br>
                                    <strong style="color: #1e40af;">Reason:</strong> ${item.extensionReason || 'Not specified'}
                                    <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
                                        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="approveExtension('${item.id}')">Approve Extension</button>
                                        <button class="btn btn-secondary btn-sm" style="flex:1; border-color: var(--danger); color: var(--danger);" onclick="rejectExtension('${item.id}')">Reject</button>
                                    </div>
                                </div>
                            ` : `
                                <strong>Room:</strong> ${item.room || 'N/A'}<br>
                                <strong>Purpose:</strong> ${item.purpose || 'N/A'}
                            `}
                        </div>

                        ${!isPendingExtend ? `
                            <div style="margin-top: 1rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                                ${item.userId ? `
                                    <button class="btn btn-blue btn-sm" onclick="sendSMSOverdue('${item.userId}', '${item.equipmentName}', '${item.id}')" title="Send SMS Reminder">
                                        SMS
                                    </button>
                                ` : ''}
                                <select id="returnCondition_${item.id}" style="flex: 1; min-width: 160px; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); font-family: var(--font-body); font-size: 0.875rem;">
                                    <option value="good">Good – No issues</option>
                                    <option value="minor">Minor Issues</option>
                                    <option value="damaged">Damaged – Needs repair</option>
                                </select>
                                <button class="btn btn-primary btn-sm" onclick="adminConfirmReturn('${item.id}', '${item.equipmentId}')">
                                    Confirm Return
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading borrowed items:', error);
        borrowedList.innerHTML = `
            <div class="empty-state">
                <h3>Error loading borrowed items</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

async function loadBorrowingLogs() {
    const logsList = document.getElementById('logsList');
    if (!logsList) return;

    try {
        const startDate = document.getElementById('startDate')?.value;
        const endDate = document.getElementById('endDate')?.value;
        const studentFilter = document.getElementById('studentFilter')?.value.toLowerCase() || '';
        const equipmentFilter = document.getElementById('equipmentFilter')?.value.toLowerCase() || '';

        const snapshot = await db.collection('borrowings')
            .orderBy('borrowedAt', 'desc')
            .limit(100)
            .get();

        let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const userIds = [...new Set(logs.map(l => l.userId).filter(id => id))];
        const usersMap = {};
        if (userIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < userIds.length; i += 10) chunks.push(userIds.slice(i, i + 10));
            for (const chunk of chunks) {
                const uSnap = await db.collection("users").where(firebase.firestore.FieldPath.documentId(), "in", chunk).get();
                uSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });
            }
        }

        if (startDate) {
            const start = new Date(startDate);
            logs = logs.filter(log => log.borrowedAt?.toDate() >= start);
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59);
            logs = logs.filter(log => log.borrowedAt?.toDate() <= end);
        }

        if (studentFilter) {
            logs = logs.filter(log =>
                (log.userName || '').toLowerCase().includes(studentFilter) ||
                (log.userEmail || '').toLowerCase().includes(studentFilter)
            );
        }

        if (equipmentFilter) {
            logs = logs.filter(log =>
                (log.equipmentName || '').toLowerCase().includes(equipmentFilter) ||
                (log.equipmentCode || '').toLowerCase().includes(equipmentFilter)
            );
        }

        const sortValue = document.getElementById('logsSort')?.value || 'borrowedAt_desc';
        const [field, order] = sortValue.split('_');

        logs.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            if (field === 'borrowedAt') {
                valA = valA?.toDate().getTime() || 0;
                valB = valB?.toDate().getTime() || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });

        if (logs.length === 0) {
            logsList.innerHTML = `
                <div class="empty-state">
                    <h3>No logs found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
        } else {
            logsList.innerHTML = logs.map(log => {
                const statusLabels = {
                    'pending_borrow': 'Pending Borrow',
                    'pending_return': 'Pending Return',
                    'borrowed': 'Borrowed',
                    'returned': 'Returned',
                    'rejected': 'Rejected'
                };
                const statusLabel = statusLabels[log.status] || capitalize(log.status);
                const userDoc = usersMap[log.userId] || {};
                const displayName = (userDoc.firstName && userDoc.lastName) ? `${userDoc.firstName} ${userDoc.lastName}` : log.userName;
                const courseInfo = userDoc.course ? userDoc.course : 'N/A';
                const yearSecInfo = userDoc.yearSection ? userDoc.yearSection : ((userDoc.yearLevel && userDoc.section) ? `${userDoc.yearLevel}-${userDoc.section}` : 'N/A');

                return `
                <div class="log-item">
                    <div class="log-item-header">
                        <span class="log-item-title">${log.equipmentName}</span>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            ${(log.status === 'borrowed' || log.status === 'pending_return') && log.userId ? `
                                <button class="btn btn-blue btn-sm" onclick="sendSMSOverdue('${log.userId}', '${log.equipmentName}', '${log.id}')" title="Send SMS Reminder">
                                    SMS
                                </button>
                            ` : ''}
                            <span class="history-status ${log.status}">${statusLabel}</span>
                        </div>
                    </div>

                    <div class="log-item-info">
                        <div class="log-field">
                            <span class="log-label">Borrower Name:</span>
                            <span class="log-value">${displayName}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">${userDoc.role === 'professor' ? 'Department' : 'Course'}:</span>
                            <span class="log-value">${userDoc.role === 'professor' ? (userDoc.department || 'N/A') : courseInfo}</span>
                        </div>
                        ${userDoc.role !== 'professor' ? `
                        <div class="log-field">
                            <span class="log-label">Year & Section:</span>
                            <span class="log-value">${yearSecInfo}</span>
                        </div>
                        ` : ''}
                        <div class="log-field">
                            <span class="log-label">Email:</span>
                            <span class="log-value">${log.userEmail}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">Mobile:</span>
                            <span class="log-value">${log.userMobile || 'N/A'}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">ID Number:</span>
                            <span class="log-value">${log.studentId || log.facultyId || 'N/A'}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">Borrowed:</span>
                            <span class="log-value">${formatDate(log.borrowedAt)}</span>
                        </div>

                        <div class="log-field">
                            <span class="log-label">Status History:</span>
                            <span class="log-value">
                                ${log.wasOverdue ? '<span class="badge" style="background:rgba(239,68,68,0.1); color:var(--danger); font-size:0.7rem; padding: 2px 6px;">WAS OVERDUE</span>' : ''}
                                ${log.hasExtension ? '<span class="badge" style="background:rgba(30,64,175,0.1); color:#1e40af; font-size:0.7rem; padding: 2px 6px;">EXTENDED</span>' : ''}
                                ${!log.wasOverdue && !log.hasExtension ? '<span style="color:var(--text-tertiary); font-size:0.8rem;">Regular</span>' : ''}
                            </span>
                        </div>

                        ${log.returnedAt ? `
                            <div class="log-field">
                                <span class="log-label">Returned:</span>
                                <span class="log-value">${formatDate(log.returnedAt)}</span>
                            </div>
                        ` : `
                            <div class="log-field">
                                <span class="log-label">Due Time:</span>
                                <span class="log-value">${log.expectedReturnTime || 'N/A'}</span>
                            </div>
                        `}

                        <div class="log-field">
                            <span class="log-label">Room:</span>
                            <span class="log-value">${log.room || 'N/A'}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">Purpose:</span>
                            <span class="log-value">${log.purpose || 'N/A'}</span>
                        </div>

                        ${log.returnCondition ? `
                            <div class="log-field">
                                <span class="log-label">Return Condition:</span>
                                <span class="log-value">${capitalize(log.returnCondition)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        logsList.innerHTML = `
            <div class="empty-state">
                <h3>Error loading logs</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

function initializeExport() {
    const exportLogsBtn = document.getElementById('exportLogsBtn');
    const applyFilterBtn = document.getElementById('applyFilterBtn');

    if (applyFilterBtn) applyFilterBtn.addEventListener('click', loadBorrowingLogs);

    const fmtDate = (ts) => {
        if (!ts || !ts.toDate) return "N/A";
        const d = ts.toDate();
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const safe = (v) => (v ?? "N/A").toString();

    const styles = {
        title: {
            font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "0D9488" } },
            alignment: { horizontal: "left", vertical: "center" }
        },
        summaryLabel: {
            font: { sz: 10, color: { rgb: "64748B" } },
            fill: { fgColor: { rgb: "F8FAFC" } },
            border: {
                top: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
        },
        summaryVal: {
            font: { bold: true, sz: 12, color: { rgb: "0F172A" } },
            fill: { fgColor: { rgb: "F8FAFC" } },
            alignment: { horizontal: "center" },
            border: {
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
        },
        summaryOverdue: {
            font: { bold: true, sz: 12, color: { rgb: "B91C1C" } },
            fill: { fgColor: { rgb: "F8FAFC" } },
            alignment: { horizontal: "center" },
            border: {
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
        },
        catHeader: {
            font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "0D9488" } },
            alignment: { horizontal: "left", vertical: "center" }
        },
        colHeader: {
            font: { bold: true, sz: 9, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "115E59" } },
            alignment: { horizontal: "center" }
        },
        cell: {
            font: { sz: 9 },
            alignment: { vertical: "center" },
            border: { bottom: { style: "thin", color: { rgb: "F1F5F9" } } }
        },
        cellLate: {
            font: { sz: 9, color: { rgb: "B91C1C" }, bold: true },
            alignment: { vertical: "center" },
            border: { bottom: { style: "thin", color: { rgb: "F1F5F9" } } }
        },
        subtotal: {
            font: { bold: true, sz: 9 },
            fill: { fgColor: { rgb: "F8FAFC" } },
            alignment: { horizontal: "right" }
        }
    };

    function applyStyle(ws, r, c, s) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = s;
    }

    const calcDelay = (expected, returned, borrowed) => {
        if (!expected || !returned || !borrowed) return { text: "N/A", late: false };
        try {
            const retDate = returned.toDate ? returned.toDate() : new Date(returned);
            const borDate = borrowed.toDate ? borrowed.toDate() : new Date(borrowed);
            const [hh, mm] = expected.split(':').map(Number);

            const expDate = new Date(borDate);
            expDate.setHours(hh, mm, 0, 0);
            if (expDate < borDate) expDate.setDate(expDate.getDate() + 1);

            const diffMin = Math.round((retDate - expDate) / (1000 * 60));
            if (diffMin <= 0) return { text: "On Time", late: false };

            const h = Math.floor(diffMin / 60);
            const m = diffMin % 60;
            return { text: h > 0 ? `${h}h ${m}m late` : `${m}m late`, late: true };
        } catch (e) { return { text: "Error", late: false }; }
    };

    if (exportLogsBtn) {
        exportLogsBtn.addEventListener("click", async () => {
            try {
                showToast("Preparing sophisticated report...", "info");
                const snapshot = await db.collection("borrowings").orderBy("borrowedAt", "desc").get();
                const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const wb = XLSX.utils.book_new();
                const wsData = [
                    ["BORROWING PERFORMANCE REPORT"], // R0
                    [], // R1
                    ["TOTAL RECORDS", "", "", "ON-TIME RETURNS", "", "", "OVERDUE FREQUENCY"], // R2
                    [logs.length, "", "", logs.filter(l => l.status === 'returned' && !l.wasOverdue).length, "", "", logs.filter(l => l.wasOverdue).length], // R3
                    [], // R4
                ];

                const categories = [...new Set(logs.map(l => l.equipmentCategory || "Uncategorized"))];
                let currentRow = 5;

                const headers = ["Equipment Item", "Student", "Room", "Borrowed At", "Expected Return", "Actual Return", "Delay/Difference"];

                categories.forEach(cat => {
                    wsData.push([cat.toUpperCase(), "", "", "", "", "", ""]); // Category row
                    wsData.push(headers); // Header row
                    const catLogs = logs.filter(l => (l.equipmentCategory || "Uncategorized") === cat);

                    catLogs.forEach(log => {
                        const delay = calcDelay(log.expectedReturnTime, log.returnedAt, log.borrowedAt);
                        wsData.push([
                            log.equipmentName,
                            log.userName,
                            log.room,
                            fmtDate(log.borrowedAt),
                            log.expectedReturnTime,
                            log.status === 'returned' ? fmtDate(log.returnedAt) : "Not Returned",
                            delay.text
                        ]);
                    });
                    wsData.push(["Subtotal", "", "", "", "", "", `${catLogs.length} items`]);
                    wsData.push([]); // Gap
                });

                const ws = XLSX.utils.aoa_to_sheet(wsData);

                // Apply Styling
                applyStyle(ws, 0, 0, styles.title);
                ws['!merges'] = [
                    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Title
                    { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }, // Labels
                    { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } },
                    { s: { r: 2, c: 6 }, e: { r: 2, c: 6 } },
                    { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }, // Values
                    { s: { r: 3, c: 3 }, e: { r: 3, c: 4 } },
                    { s: { r: 3, c: 6 }, e: { r: 3, c: 6 } }
                ];

                // Summary Styles
                [0, 3, 6].forEach(c => {
                    applyStyle(ws, 2, c, styles.summaryLabel);
                    applyStyle(ws, 3, c, c === 6 ? styles.summaryOverdue : styles.summaryVal);
                    // Fill merges
                    if (c < 6) {
                        applyStyle(ws, 2, c + 1, styles.summaryLabel);
                        applyStyle(ws, 3, c + 1, styles.summaryVal);
                    }
                });

                let r = 5;
                categories.forEach(cat => {
                    applyStyle(ws, r, 0, styles.catHeader);
                    for (let i = 1; i < 7; i++) applyStyle(ws, r, i, styles.catHeader);
                    ws['!merges'].push({ s: { r: r, c: 0 }, e: { r: r, c: 6 } });
                    r++;

                    for (let i = 0; i < 7; i++) applyStyle(ws, r, i, styles.colHeader);
                    r++;

                    const catLogs = logs.filter(l => (l.equipmentCategory || "Uncategorized") === cat);
                    catLogs.forEach(log => {
                        const delay = calcDelay(log.expectedReturnTime, log.returnedAt, log.borrowedAt);
                        for (let i = 0; i < 7; i++) {
                            applyStyle(ws, r, i, i === 6 && delay.late ? styles.cellLate : styles.cell);
                        }
                        r++;
                    });

                    applyStyle(ws, r, 0, styles.subtotal);
                    for (let i = 1; i < 7; i++) applyStyle(ws, r, i, styles.subtotal);
                    r += 2;
                });

                ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];

                XLSX.utils.book_append_sheet(wb, ws, "Performance Report");
                XLSX.writeFile(wb, `MISLend-Performance-${new Date().toISOString().split('T')[0]}.xlsx`);
                showToast("Budget-style report generated!", "success");
            } catch (error) {
                console.error("Export Error:", error);
                showToast("Failed to generate report", "error");
            }
        });
    }
}

function initializeTopbarActions() {
    const searchForm = document.getElementById('topbarSearchForm');
    const searchInput = document.getElementById('topbarSearchInput');
    const notificationButton = document.getElementById('topbarNotificationBtn');

    searchForm?.addEventListener('submit', event => {
        event.preventDefault();
        const query = searchInput?.value.trim();
        const equipmentSearch = document.getElementById('equipmentSearchInput');
        if (!query || !equipmentSearch) return;

        equipmentSearch.value = query;
        document.querySelector('.nav-item[data-view="equipment"]')?.click();
    });

    notificationButton?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-view="approvals"]')?.click();
    });

    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            searchInput?.focus();
        }
    });
}

function initializeUserManagement() {
    const addUserBtn = document.getElementById('addUserBtn');
    const addUserModal = document.getElementById('addUserModal');
    const closeAddUserModal = document.getElementById('closeAddUserModal');
    const cancelAddUser = document.getElementById('cancelAddUser');
    const addUserForm = document.getElementById('addUserForm');
    const newUserRole = document.getElementById('newUserRole');
    const additionalFields = document.getElementById('additionalStudentFields');

    const additionalAdminFields = document.getElementById('additionalAdminFields');

    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            addUserModal?.classList.add('active');
        });
    }

    if (newUserRole) {
        newUserRole.addEventListener('change', (e) => {
            const isStudent = e.target.value === 'student';
            const isAdmin = e.target.value === 'admin';
            const isProfessor = e.target.value === 'professor';

            if (additionalFields) additionalFields.style.display = isStudent ? 'block' : 'none';
            if (additionalAdminFields) additionalAdminFields.style.display = isAdmin ? 'block' : 'none';
            const profFields = document.getElementById('additionalProfessorFields');
            if (profFields) profFields.style.display = isProfessor ? 'block' : 'none';

            const studentIdInput = document.getElementById('newUserStudentId');
            if (studentIdInput) studentIdInput.required = isStudent;
        });
    }

    const closeAddUser = () => {
        addUserModal?.classList.remove('active');
        addUserForm?.reset();
        if (additionalFields) additionalFields.style.display = 'none';
        if (additionalAdminFields) additionalAdminFields.style.display = 'none';
        const profFields = document.getElementById('additionalProfessorFields');
        if (profFields) profFields.style.display = 'none';

        const avatarContainer = document.getElementById("addUserAvatarContainer");
        if (avatarContainer) {
            avatarContainer.innerHTML = `<span><i class="fa-solid fa-user"></i></span>`;
        }
    };

    if (closeAddUserModal) closeAddUserModal.addEventListener('click', closeAddUser);
    if (cancelAddUser) cancelAddUser.addEventListener('click', closeAddUser);
    if (addUserModal) {
        addUserModal.addEventListener('click', (e) => {
            if (e.target === addUserModal) closeAddUser();
        });
    }

    const editRoleSelect = document.getElementById('editUserRole');
    const editStudentContainer = document.getElementById('editStudentFieldsContainers');
    const editAdminContainer = document.getElementById('editAdminFieldsContainers');
    const editProfContainer = document.getElementById('editProfessorFieldsContainers');
    if (editRoleSelect) {
        editRoleSelect.addEventListener('change', (e) => {
            if (editStudentContainer) editStudentContainer.style.display = e.target.value === 'student' ? 'block' : 'none';
            if (editAdminContainer) editAdminContainer.style.display = e.target.value === 'admin' ? 'block' : 'none';
            if (editProfContainer) editProfContainer.style.display = e.target.value === 'professor' ? 'block' : 'none';
        });
    }

    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createNewUser();
        });
    }
}

async function createNewUser() {
    const firstName = document.getElementById('newUserFirstName').value.trim();
    const middleInitial = document.getElementById('newUserMiddleInitial').value.trim().replace(/\.+$/, '');
    const lastName = document.getElementById('newUserLastName').value.trim();

    // Auto-compose full name
    const mInitial = middleInitial ? `${middleInitial}. ` : '';
    const name = `${firstName} ${mInitial}${lastName}`;

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const studentId = document.getElementById('newUserStudentId')?.value.trim();
    const mobile = document.getElementById('newUserMobile')?.value.trim();
    const gender = document.getElementById('newUserGender')?.value;
    const course = document.getElementById('newUserCourse')?.value.trim();

    const yearLevel = document.getElementById('newUserYearLevel')?.value;
    const section = document.getElementById('newUserSection')?.value;
    const yearSection = (yearLevel && section) ? `${yearLevel}-${section}` : '';
    const photoInput = document.getElementById('newUserPhotoInput');
    const adminId = document.getElementById('newUserAdminId')?.value.trim();

    const submitBtn = document.querySelector('#addUserForm button[type="submit"]');
    const originalBtnContent = submitBtn.innerHTML;

    // --- Validation ---
    if (role === 'student') {
        if (!studentId) { showToast('Student ID is required.', 'error'); return; }
        if (studentId.length !== 10) { showToast('Student ID must be exactly 10 characters (e.g., 20250000-S).', 'error'); return; }
        if (!mobile) { showToast('Mobile number is required.', 'error'); return; }
        if (!/^[0-9]{11}$/.test(mobile)) { showToast('Mobile number must be exactly 11 digits.', 'error'); return; }
        if (!gender) { showToast('Gender is required.', 'error'); return; }
        if (!course) { showToast('Course is required.', 'error'); return; }
        if (!yearLevel) { showToast('Year level is required.', 'error'); return; }
        if (!section) { showToast('Section is required.', 'error'); return; }
    } else if (role === 'professor') {
        const facultyId = document.getElementById('newUserFacultyId')?.value.trim();
        const profMobile = document.getElementById('newUserProfMobile')?.value.trim();
        const department = document.getElementById('newUserDepartment')?.value.trim();
        const profGender = document.getElementById('newUserProfGender')?.value;
        
        if (!facultyId) { showToast('Faculty ID is required.', 'error'); return; }
        if (facultyId.length !== 10) { showToast('Faculty ID must be exactly 10 characters (e.g., 20250000-F).', 'error'); return; }
        if (!profMobile) { showToast('Mobile number is required.', 'error'); return; }
        if (!/^[0-9]{11}$/.test(profMobile)) { showToast('Mobile number must be exactly 11 digits.', 'error'); return; }
        if (!profGender) { showToast('Gender is required.', 'error'); return; }
        if (!department) { showToast('Department is required.', 'error'); return; }
    } else if (role === 'admin') {
        if (!adminId) { showToast('Admin ID is required.', 'error'); return; }
    }

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Creating...</span>';

        let idToCheck = "";
        if (role === 'student') idToCheck = studentId;
        else if (role === 'professor') idToCheck = document.getElementById('newUserFacultyId')?.value.trim();
        else if (role === 'admin') idToCheck = adminId;

        if (idToCheck) {
            const studentCheck = await db.collection('users').where('studentId', '==', idToCheck).limit(1).get();
            const facultyCheck = await db.collection('users').where('facultyId', '==', idToCheck).limit(1).get();
            const adminCheck = await db.collection('users').where('adminId', '==', idToCheck).limit(1).get();

            if (!studentCheck.empty || !facultyCheck.empty || !adminCheck.empty) {
                showToast('This ID is already registered to another user.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
                return;
            }
        }

        const secAuth = getSecondaryAuth();
        const userCredential = await secAuth.createUserWithEmailAndPassword(email, password);
        const newUser = userCredential.user;

        await newUser.updateProfile({ displayName: name });

        const userData = {
            name,
            email,
            role,
            status: role === "student" ? "approved" : "approved",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (role === 'student') {
            userData.studentId = studentId || "";
            userData.mobile = mobile || "";
            userData.gender = gender || "";
            userData.course = course || "";
            userData.yearSection = yearSection || "";
            userData.firstName = firstName;
            userData.middleInitial = middleInitial;
            userData.lastName = lastName;
            userData.yearLevel = yearLevel;
            userData.section = section;
        } else if (role === 'professor') {
            userData.facultyId = document.getElementById('newUserFacultyId')?.value.trim() || "";
            userData.department = document.getElementById('newUserDepartment')?.value.trim() || "";
            userData.mobile = document.getElementById('newUserProfMobile')?.value.trim() || "";
            userData.gender = document.getElementById('newUserProfGender')?.value || "";
            userData.firstName = firstName;
            userData.middleInitial = middleInitial;
            userData.lastName = lastName;
        } else if (role === 'admin') {
            userData.adminId = adminId || "";
            userData.isHeadAdmin = document.getElementById('newUserIsHeadAdmin')?.checked || false;
            userData.firstName = firstName;
            userData.middleInitial = middleInitial;
            userData.lastName = lastName;
        }

        if (photoInput && (photoInput._croppedBase64 || (photoInput.files && photoInput.files[0]))) {
            try {
                if (photoInput._croppedBase64) {
                    userData.photoURL = photoInput._croppedBase64;
                } else {
                    const base64Data = await resizeImage(photoInput.files[0], 200, 200);
                    userData.photoURL = base64Data;
                }
            } catch (resizeErr) {
                console.error("Resize error:", resizeErr);
                throw new Error("Failed to process image. Please try a different photo.");
            }
        }

        await db.collection('users').doc(newUser.uid).set(userData);

        await secAuth.signOut();

        showToast(`${capitalize(role)} account created successfully!`, 'success');

        document.getElementById('addUserModal').classList.remove('active');
        document.getElementById('addUserForm').reset();

        const avatarContainer = document.getElementById("addUserAvatarContainer");
        if (avatarContainer) {
            avatarContainer.innerHTML = `<span><i class="fa-solid fa-user"></i></span>`;
        }

        loadUsers();
        if (typeof loadPending === "function") loadPending();

    } catch (error) {
        console.error('Error creating user:', error);

        let errorMessage = 'Failed to create user. ';
        if (error.code === 'auth/email-already-in-use') errorMessage += 'This email is already registered.';
        else if (error.code === 'auth/invalid-email') errorMessage += 'Invalid email address.';
        else if (error.code === 'auth/weak-password') errorMessage += 'Password should be at least 6 characters.';
        else errorMessage += error.message;

        showToast(errorMessage, 'error');

    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
    }
}


async function loadUsers() {
    const usersTable = $('#usersTable');
    if (usersTable.length === 0) return;

    try {
        const snapshot = await db.collection('users')
            .orderBy('createdAt', 'desc')
            .get();

        const allUsersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const users = allUsersData.filter(user => user.status === 'approved' || user.status === 'suspended');

        // 1. Fetch active borrowings to calculate CURRENT overdue items
        const activeBorrowingsSnapshot = await db.collection('borrowings')
            .where('status', 'in', ['borrowed', 'pending_extension'])
            .get();

        // 2. Fetch historical borrowings to count PAST items that were returned late
        const pastOverdueSnapshot = await db.collection('borrowings')
            .where('wasOverdue', '==', true)
            .get();
        
        const overdueMap = {};
        const now = new Date();

        // Add current active overdues to the map
        activeBorrowingsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId && data.borrowedAt && data.expectedReturnTime) {
                const borrowedDate = data.borrowedAt.toDate();
                const [hh, mm] = String(data.expectedReturnTime).split(':').map(Number);
                if (!isNaN(hh) && !isNaN(mm)) {
                    const due = new Date(borrowedDate);
                    due.setHours(hh, mm, 0, 0);
                    if (now > due) {
                        overdueMap[data.userId] = (overdueMap[data.userId] || 0) + 1;
                    }
                }
            }
        });

        // Add past returned overdues to the map
        pastOverdueSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId) {
                overdueMap[data.userId] = (overdueMap[data.userId] || 0) + 1;
            }
        });

        if ($.fn.DataTable.isDataTable('#usersTable')) {
            usersTable.DataTable().clear().destroy();
        }

        const tbody = usersTable.find('tbody');
        if (users.length === 0) {
            tbody.html('');
        } else {
            tbody.html(users.map(user => {
                const initials = getUserInitials(user.name);
                const avatarHTML = user.photoURL
                    ? `<img src="${user.photoURL}" alt="" class="user-table-avatar">`
                    : `<span class="user-table-avatar user-table-avatar-initials">${initials}</span>`;

                const isUserHeadAdmin = user.role === 'admin' && (user.isHeadAdmin === true || user.isHeadAdmin === 'true' || user.adminType === 'head_admin');
                const roleBadge = isUserHeadAdmin
                    ? `<span class="badge badge-primary" style="background: var(--secondary);">Head Admin</span>`
                    : `<span class="badge badge-category ${user.role}">${capitalize(user.role)}</span>`;
                const isSuspended = user.status === 'suspended';
                const statusBadge = isSuspended ? `<span class="badge badge-status" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); margin-left: 5px;">SUSPENDED</span>` : '';

                const overdueCount = overdueMap[user.id] || 0;
                const overdueBadge = overdueCount > 0 ? `<br><span class="badge" style="background: rgba(245, 158, 11, 0.1); color: var(--warning); font-size: 0.7rem; margin-top: 4px;">${overdueCount} Overdue Item${overdueCount > 1 ? 's' : ''}</span>` : '';

                const idNum = (user.studentId || user.facultyId || user.adminId) ? `<br><small class="text-muted">ID: ${user.studentId || user.facultyId || user.adminId}</small>` : '';

                let actionHtml = '';
                if (user.id !== currentAdmin.uid) {
                    actionHtml = `
                        <div class="user-table-actions">
                            <button type="button" class="user-table-icon-btn" onclick="openEditUser('${user.id}','${user.name}','${user.email}','${user.role}','${user.studentId || ''}','${user.mobile || ''}','${user.gender || ''}','${user.course || ''}','${user.yearSection || ''}', '${user.photoURL || ''}', '${user.firstName || ''}', '${user.middleInitial || ''}', '${user.lastName || ''}', '${user.yearLevel || ''}', '${user.section || ''}', '${user.adminId || ''}', '${user.facultyId || ''}', '${user.department || ''}', ${isUserHeadAdmin})" title="Edit user details" aria-label="Edit user details">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                                <span class="sr-only">Edit user</span>
                            </button>

                            ${isSuspended ? `
                                <button type="button" class="user-table-icon-btn user-table-icon-btn-success" onclick="unsuspendUser('${user.id}', '${user.name.replace(/'/g, "\\'")}')" title="Unsuspend account" aria-label="Unsuspend account">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                                    <span class="sr-only">Unsuspend</span>
                                </button>
                            ` : `
                                <button type="button" class="user-table-icon-btn user-table-icon-btn-muted" onclick="suspendUser('${user.id}', '${user.name.replace(/'/g, "\\'")}')" title="Suspend account" aria-label="Suspend account">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>
                                    <span class="sr-only">Suspend</span>
                                </button>
                            `}

                            <button type="button" class="user-table-icon-btn user-table-icon-btn-danger" onclick="deleteUser('${user.id}', '${user.email}')" title="Delete user" aria-label="Delete user">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                                <span class="sr-only">Delete user</span>
                            </button>

                            <button type="button" class="user-table-icon-btn" onclick="openAdminSetPassword('${user.id}','${user.name}','${user.email}','${(user.photoURL || '').replace(/'/g, "&#39;")}')" title="Reset/change this user's password" aria-label="Reset password">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.65-8.65 2 2-2 2 2 2-3 3-2-2-2 2"/></svg>
                                <span class="sr-only">Reset password</span>
                            </button>
                        </div>
                    `;
                } else {
                    actionHtml = '<span style="font-size: 0.75rem; color: var(--text-tertiary);">(You)</span>';
                }

                return `
                    <tr class="${isSuspended ? 'user-row-suspended' : ''}">
                        <td class="user-table-user-cell">
                            <div class="user-table-user">
                                ${avatarHTML}
                                <div class="user-table-user-details">
                                    <strong>${user.name}</strong>${statusBadge}
                                </div>
                            </div>
                        </td>
                        <td style="vertical-align: middle;">${user.email}</td>
                        <td class="user-role-cell" style="vertical-align: middle;">${roleBadge}${idNum}${overdueBadge}</td>
                        <td class="user-actions-cell" style="vertical-align: middle;">${actionHtml}</td>
                    </tr>
                `;
            }).join(''));
        }

        usersTable.DataTable({
            responsive: false,
            pageLength: 10,
            lengthMenu: [10, 8, 5],
            autoWidth: false,
            pagingType: "simple_numbers",
            language: {
                search: "",
                searchPlaceholder: "Search...",
                lengthMenu: "Show _MENU_ entries",
                emptyTable: "No approved users found",
                zeroRecords: "No matching users found"
            }
        });
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Failed to load users', 'error');
    }
}

async function deleteUser(userId, userEmail) {
    if (!await showConfirm({
        title: 'Delete User',
        message: `Are you sure you want to delete the user: ${userEmail}?\n\nIMPORTANT: Deleting here only removes their dashboard access. You MUST also manually delete this email from the Firebase Console > Authentication to fully remove the account.`,
        confirmText: 'Delete',
        type: 'danger'
    })) {
        return;
    }

    try {
        await db.collection('users').doc(userId).delete();
        showToast('User removed from dashboard. Remember to delete their email in Auth Console!', 'success');
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Failed to delete user. Please try again.', 'error');
    }
}

async function suspendUser(userId, userName) {
    if (!await showConfirm({
        title: 'Suspend Account',
        message: `Are you sure you want to suspend ${userName}'s account?\n\nThey will be immediately logged out and blocked from logging in.`,
        confirmText: 'Suspend',
        type: 'danger'
    })) return;

    try {
        await db.collection('users').doc(userId).update({
            status: 'suspended',
            suspendedAt: firebase.firestore.FieldValue.serverTimestamp(),
            suspendedBy: currentAdmin?.uid || 'admin'
        });
        showToast(`Account for ${userName} has been suspended.`, 'success');
        loadUsers();
    } catch (error) {
        console.error('Error suspending user:', error);
        showToast('Failed to suspend account.', 'error');
    }
}

async function unsuspendUser(userId, userName) {
    if (!await showConfirm({
        title: 'Unsuspend & Reset Account',
        message: `Restore access for ${userName}?\n\nThis will also forgive their past overdue strikes, resetting their historical count to 0.`,
        confirmText: 'Restore & Reset',
        type: 'primary'
    })) return;

    try {
        // 1. Update the user's status back to approved
        await db.collection('users').doc(userId).update({
            status: 'approved',
            unsuspendedAt: firebase.firestore.FieldValue.serverTimestamp(),
            unsuspendedBy: currentAdmin?.uid || 'admin'
        });

        // 2. Find all of their past overdue borrowings
        const pastOverdueSnapshot = await db.collection('borrowings')
            .where('userId', '==', userId)
            .where('wasOverdue', '==', true)
            .get();

        // 3. Batch update them to clear the strike
        if (!pastOverdueSnapshot.empty) {
            const batch = db.batch();
            pastOverdueSnapshot.docs.forEach(doc => {
                batch.update(doc.ref, { 
                    wasOverdue: false,         // This removes the strike from the count
                    strikeForgiven: true       // Keeps an audit trail that this was forgiven
                });
            });
            await batch.commit();
        }

        showToast(`Account for ${userName} restored and overdue count reset.`, 'success');
        
        // Refresh the tables and check system
        loadUsers();
        if (typeof checkAllUsersForAutoSuspend === 'function') {
            checkAllUsersForAutoSuspend();
        }
        
    } catch (error) {
        console.error('Error unsuspending user:', error);
        showToast('Failed to restore account.', 'error');
    }
}

function initializeRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            await loadDashboardData();
            showToast('Dashboard refreshed', 'success');
            setTimeout(() => {
                refreshBtn.disabled = false;
            }, 1000);
        });
    }
}

function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (!await showConfirm({
                title: 'Logout',
                message: 'Are you sure you want to logout of your account?',
                confirmText: 'Logout',
                type: 'danger'
            })) return;

            try {
                await auth.signOut();
                showToast('Logged out successfully', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Failed to logout. Please try again.', 'error');
            }
        });
    }
}

let editEquipmentPhotoState = {
    action: 'keep',
    currentPhoto: null
};

function previewEditEquipmentPhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 5 * 1024 * 1024) {
            showToast("Photo is too large (max 5MB)", "error");
            input.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById("editEquipmentPhotoImg");
            const placeholder = document.getElementById("editEquipmentPhotoPlaceholder");
            const removeBtn = document.getElementById("removeEditEquipmentPhotoBtn");
            if (img) {
                img.src = e.target.result;
                img.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'inline-flex';
            editEquipmentPhotoState.action = 'change';
        };
        reader.readAsDataURL(file);
    }
}

function clearEditEquipmentPhoto() {
    const input = document.getElementById("editEquipmentPhotoInput");
    if (input) input.value = "";
    const img = document.getElementById("editEquipmentPhotoImg");
    const placeholder = document.getElementById("editEquipmentPhotoPlaceholder");
    const removeBtn = document.getElementById("removeEditEquipmentPhotoBtn");
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'none';
    editEquipmentPhotoState.action = 'remove';
}

function setEditEquipmentPhotoDisplay(photoURL) {
    const img = document.getElementById("editEquipmentPhotoImg");
    const placeholder = document.getElementById("editEquipmentPhotoPlaceholder");
    const removeBtn = document.getElementById("removeEditEquipmentPhotoBtn");
    const input = document.getElementById("editEquipmentPhotoInput");
    if (input) input.value = "";

    if (photoURL && photoURL !== 'null' && photoURL !== 'undefined' && photoURL !== '') {
        if (img) {
            img.src = photoURL;
            img.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
        if (img) {
            img.src = '';
            img.style.display = 'none';
        }
        if (placeholder) placeholder.style.display = 'block';
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function openEditEquipment(id, eid, name, cat, desc, status, photoURL) {
    let item = null;
    if (typeof currentEquipmentList !== 'undefined' && Array.isArray(currentEquipmentList)) {
        item = currentEquipmentList.find(e => e.id === id);
    }

    const finalEid = (item && item.equipmentId !== undefined) ? item.equipmentId : (eid || '');
    const finalName = (item && item.name !== undefined) ? item.name : (name || '');
    const finalCat = (item && item.category !== undefined) ? item.category : (cat || '');
    const finalDesc = (item && item.description !== undefined) ? item.description : (desc || '');
    const finalStatus = (item && item.status !== undefined) ? item.status : (status || 'available');
    const finalPhoto = (item && item.photoURL !== undefined) ? item.photoURL : (photoURL || null);

    document.getElementById("editDocId").value = id;
    document.getElementById("editEquipmentId").value = finalEid;
    document.getElementById("editEquipmentName").value = finalName;
    document.getElementById("editEquipmentCategory").value = finalCat;
    document.getElementById("editEquipmentDescription").value = finalDesc;
    document.getElementById("editEquipmentStatus").value = finalStatus;

    editEquipmentPhotoState = {
        action: 'keep',
        currentPhoto: finalPhoto
    };
    setEditEquipmentPhotoDisplay(finalPhoto);

    document.getElementById("editEquipmentModal").classList.add("active");
}

function closeEditEquipment() {
    document.getElementById("editEquipmentModal").classList.remove("active");
}

const editEquipmentForm = document.getElementById("editEquipmentForm");
if (editEquipmentForm) {
    editEquipmentForm.addEventListener("submit", async e => {
        e.preventDefault();

        const submitBtn = editEquipmentForm.querySelector('button[type="submit"]');
        const originalContent = submitBtn ? submitBtn.innerHTML : 'Save Changes';

        const id = document.getElementById("editDocId").value;
        const newStatus = document.getElementById("editEquipmentStatus").value;

        const updateData = {
            equipmentId: document.getElementById("editEquipmentId").value.trim(),
            name: document.getElementById("editEquipmentName").value.trim(),
            category: document.getElementById("editEquipmentCategory").value,
            description: document.getElementById("editEquipmentDescription").value,
            status: newStatus
        };

        // Note: Never include borrowedBy or borrowedAt here! They belong to the borrowings table.

        if (editEquipmentPhotoState.action === 'change') {
            const photoInput = document.getElementById("editEquipmentPhotoInput");
            if (photoInput && photoInput.files && photoInput.files[0]) {
                try {
                    const base64 = await readFileAsBase64(photoInput.files[0]);
                    updateData.photoURL = base64;
                } catch (photoErr) {
                    console.error('Error reading photo:', photoErr);
                    showToast('Failed to process photo, saving without new photo', 'warning');
                }
            }
        } else if (editEquipmentPhotoState.action === 'remove') {
            updateData.photoURL = null;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span>Saving...</span>';
            }

            await db.collection("equipment").doc(id).update(updateData);
            showToast("Equipment updated successfully", "success");
            closeEditEquipment();
            loadAllEquipment();
            loadDashboardData();
        } catch (error) {
            console.error("Error updating equipment:", error);
            showToast(`Failed to update equipment: ${error.message}`, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalContent;
            }
        }
    });
}

function openEditUser(id, name, email, role, studentId, mobile, gender, course, yearSection, photoURL, firstName, middleInitial, lastName, yearLevel, section, adminId, facultyId, department, isHeadAdmin = false) {
    document.getElementById("editUserId").value = id;
    document.getElementById("editUserEmail").value = email;
    document.getElementById("editUserRole").value = role;
    document.getElementById("editUserStudentId").value = studentId || "";
    document.getElementById("editUserMobile").value = mobile || "";
    document.getElementById("editUserGender").value = gender || "";
    document.getElementById("editUserCourse").value = course || "";
    document.getElementById("editUserAdminId").value = adminId || "";

    const headCheckbox = document.getElementById("editUserIsHeadAdmin");
    if (headCheckbox) {
        headCheckbox.checked = !!(isHeadAdmin === true || isHeadAdmin === 'true');
    }

    // Professor fields
    const facIdEl = document.getElementById("editUserFacultyId");
    const deptEl = document.getElementById("editUserDepartment");
    const profMobileEl = document.getElementById("editUserProfMobile");
    const profGenderEl = document.getElementById("editUserProfGender");
    if (facIdEl) facIdEl.value = facultyId || "";
    if (deptEl) deptEl.value = department || "";
    if (profMobileEl) profMobileEl.value = (role === 'professor' ? mobile : '') || "";
    if (profGenderEl) profGenderEl.value = (role === 'professor' ? gender : '') || "";

    // Older accounts may only have a full name or combined year/section value.
    const nameParts = (name || "").trim().split(/\s+/).filter(Boolean);
    const fallbackMiddle = nameParts.length > 2 ? `${nameParts[1].charAt(0)}.` : "";
    document.getElementById("editUserFirstName").value = firstName || nameParts[0] || "";
    document.getElementById("editUserMiddleInitial").value = middleInitial || fallbackMiddle;
    document.getElementById("editUserLastName").value = lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");

    const combinedYearSection = (yearSection || "").match(/^(.+?)[-\s]+([^-]+)$/);
    const storedYearLevel = yearLevel || (combinedYearSection ? combinedYearSection[1] : "");
    const normalizedYearLevel = ({
        "1st Year": "1",
        "2nd Year": "2",
        "3rd Year": "3",
        "4th Year": "4"
    })[storedYearLevel] || storedYearLevel;
    document.getElementById("editUserYearLevel").value = normalizedYearLevel;
    document.getElementById("editUserSection").value = section || (combinedYearSection ? combinedYearSection[2] : "");

    // Reset file input
    const photoInput = document.getElementById("editUserPhotoInput");
    if (photoInput) photoInput.value = "";

    // Set avatar preview
    const avatarContainer = document.getElementById("editUserAvatarContainer");
    if (avatarContainer) {
        if (photoURL && photoURL !== 'undefined' && photoURL !== '') {
            avatarContainer.innerHTML = `<img src="${photoURL}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            avatarContainer.innerHTML = `<span>${getUserInitials(name)}</span>`;
        }
    }

    const studentContainer = document.getElementById("editStudentFieldsContainers");
    const adminContainer = document.getElementById("editAdminFieldsContainers");
    const profContainer = document.getElementById("editProfessorFieldsContainers");
    if (studentContainer) {
        studentContainer.style.display = role === 'student' ? 'block' : 'none';
    }
    if (adminContainer) {
        adminContainer.style.display = role === 'admin' ? 'block' : 'none';
    }
    if (profContainer) {
        profContainer.style.display = role === 'professor' ? 'block' : 'none';
    }

    document.getElementById("editUserModal").classList.add("active");
}

function previewUserPhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            showToast("Image too large. Max 2MB allowed.", "error");
            input.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const avatarContainer = document.getElementById("editUserAvatarContainer");
            if (avatarContainer) {
                avatarContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">`;
            }
        };
        reader.readAsDataURL(file);
    }
}

function closeEditUser() {
    document.getElementById("editUserModal").classList.remove("active");
}

const editUserForm = document.getElementById("editUserForm");
if (editUserForm) {
    editUserForm.addEventListener("submit", async e => {
        e.preventDefault();
        console.log("editUserForm submitted");

        const id = document.getElementById("editUserId").value;
        const role = document.getElementById("editUserRole").value;
        const photoInput = document.getElementById("editUserPhotoInput");

        const submitBtn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button.btn-primary');
        if (!submitBtn) {
            console.error("Submit button not found in form!");
            return;
        }
        const originalContent = submitBtn.innerHTML;

        try {
            console.log(">>> [STEP 1] Starting editUserForm submit...");
            submitBtn.disabled = true;
            submitBtn.innerHTML = "<span>Saving...</span>";

            // --- Consolidation of values for validation ---
            const firstName = document.getElementById("editUserFirstName").value.trim();
            const lastName = document.getElementById("editUserLastName").value.trim();
            const email = document.getElementById("editUserEmail").value.trim();
            const middleInitial = document.getElementById("editUserMiddleInitial").value.trim().replace(/\.+$/, '');

            let idToCheck = "";
            if (role === 'student') idToCheck = document.getElementById("editUserStudentId").value.trim();
            else if (role === 'professor') idToCheck = document.getElementById("editUserFacultyId")?.value.trim() || "";
            else if (role === 'admin') idToCheck = document.getElementById("editUserAdminId")?.value.trim() || "";

            // --- Validation Block ---
            if (!firstName || !lastName || !email) {
                showToast("Basic information (Names, Email) is required.", "error");
                submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return;
            }

            if (role === 'student') {
                const sMobile = document.getElementById("editUserMobile").value.trim();
                const sGender = document.getElementById("editUserGender").value;
                const sCourse = document.getElementById("editUserCourse").value.trim();
                const sYear = document.getElementById("editUserYearLevel").value;
                const sSection = document.getElementById("editUserSection").value;

                if (!idToCheck) { showToast("Student ID is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (idToCheck.length !== 10) { showToast("Student ID must be exactly 10 characters.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!sMobile) { showToast("Mobile number is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!/^[0-9]{11}$/.test(sMobile)) { showToast("Mobile number must be exactly 11 digits.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!sGender) { showToast("Gender is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!sCourse) { showToast("Course is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!sYear) { showToast("Year Level is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!sSection) { showToast("Section is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
            } else if (role === 'professor') {
                const pMobile = document.getElementById("editUserProfMobile")?.value.trim();
                const pGender = document.getElementById("editUserProfGender")?.value;
                const pDept = document.getElementById("editUserDepartment")?.value.trim();

                if (!idToCheck) { showToast("Faculty ID is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (idToCheck.length !== 10) { showToast("Faculty ID must be exactly 10 characters.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!pMobile) { showToast("Mobile number is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!/^[0-9]{11}$/.test(pMobile)) { showToast("Mobile number must be exactly 11 digits.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!pGender) { showToast("Gender is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
                if (!pDept) { showToast("Department is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
            } else if (role === 'admin') {
                if (!idToCheck) { showToast("Admin ID is required.", "error"); submitBtn.disabled = false; submitBtn.innerHTML = originalContent; return; }
            }

            // --- ID Uniqueness Check ---
            if (idToCheck) {
                const studentCheck = await db.collection('users').where('studentId', '==', idToCheck).limit(1).get();
                const facultyCheck = await db.collection('users').where('facultyId', '==', idToCheck).limit(1).get();
                const adminCheck = await db.collection('users').where('adminId', '==', idToCheck).limit(1).get();

                const isDuplicate =
                    (!studentCheck.empty && studentCheck.docs.some(doc => doc.id !== id)) ||
                    (!facultyCheck.empty && facultyCheck.docs.some(doc => doc.id !== id)) ||
                    (!adminCheck.empty && adminCheck.docs.some(doc => doc.id !== id));

                if (isDuplicate) {
                    showToast('This ID is already registered to another user.', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalContent;
                    return;
                }
            }

            const mInitial = middleInitial ? `${middleInitial}. ` : '';
            const name = `${firstName} ${mInitial}${lastName}`;

            const updateData = {
                name: name,
                email: email,
                role: role,
                firstName: firstName,
                middleInitial: middleInitial,
                lastName: lastName
            };

            if (role === 'student') {
                const yearLevel = document.getElementById("editUserYearLevel").value;
                const section = document.getElementById("editUserSection").value;

                updateData.studentId = idToCheck;
                updateData.mobile = document.getElementById("editUserMobile").value.trim();
                updateData.gender = document.getElementById("editUserGender").value;
                updateData.course = document.getElementById("editUserCourse").value.trim();
                updateData.yearLevel = yearLevel;
                updateData.section = section;
                updateData.yearSection = (yearLevel && section) ? `${yearLevel}-${section}` : '';
            } else if (role === 'professor') {
                updateData.facultyId = document.getElementById("editUserFacultyId")?.value.trim() || '';
                updateData.department = document.getElementById("editUserDepartment")?.value.trim() || '';
                updateData.mobile = document.getElementById("editUserProfMobile")?.value.trim() || '';
                updateData.gender = document.getElementById("editUserProfGender")?.value || '';
            } else if (role === 'admin') {
                updateData.adminId = document.getElementById("editUserAdminId").value.trim();
                const headCheckbox = document.getElementById("editUserIsHeadAdmin");
                if (headCheckbox) {
                    updateData.isHeadAdmin = headCheckbox.checked;
                }
            }

            // Handle photo upload if a new file or cropped photo is selected
            if (photoInput && (photoInput._croppedBase64 || (photoInput.files && photoInput.files[0]))) {
                console.log(">>> [STEP 2] Photo selected, saving photoURL...");
                try {
                    if (photoInput._croppedBase64) {
                        updateData.photoURL = photoInput._croppedBase64;
                    } else {
                        const file = photoInput.files[0];
                        const base64Data = await resizeImage(file, 200, 200);
                        updateData.photoURL = base64Data;
                    }
                    console.log(">>> [STEP 5] Photo ready for save");
                } catch (resizeErr) {
                    console.error("Resize error:", resizeErr);
                    throw new Error("Failed to process image. Please try a different photo.");
                }
            }

            console.log(">>> [STEP 8] Updating Firestore document...");
            const dbPromise = db.collection("users").doc(id).update(updateData);
            const dbTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Database update timed out (15s)")), 15000)
            );

            await Promise.race([dbPromise, dbTimeout]);
            console.log(">>> [STEP 9] Firestore update successful.");

            // If the edited user is the currently logged in admin, update active session state
            if (currentAdmin && id === currentAdmin.uid) {
                if (updateData.isHeadAdmin !== undefined && currentAdminData) {
                    currentAdminData.isHeadAdmin = updateData.isHeadAdmin;
                }
                checkIncidentAccess();
                updateAdminInfo();
            }

            showToast("User updated", "success");
            document.getElementById("editUserModal").classList.remove("active");
            loadUsers();
        } catch (err) {
            console.error("!!! [ERROR] Edit user failed:", err);
            showToast("Failed to update user: " + err.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalContent;
        }
    });
}

async function loadPending() {
    const pendingTable = $('#pendingTable');
    const count = document.getElementById("pendingCount");

    if (pendingTable.length === 0) return;

    try {
        const snap = await db.collection("users")
            .where("status", "==", "pending")
            .get();

        if (count) count.textContent = snap.size;

        if ($.fn.DataTable.isDataTable('#pendingTable')) {
            pendingTable.DataTable().clear().destroy();
        }

        const tbody = pendingTable.find('tbody');

        if (snap.empty) {
            tbody.html('');

            // Still initialize an empty DataTable so the structure exists
            pendingTable.DataTable({
                responsive: false,
                pageLength: 10,
                lengthMenu: [10, 8, 5],
                autoWidth: false,
                pagingType: "simple_numbers",
                language: {
                    emptyTable: "No pending accounts",
                    search: "",
                    searchPlaceholder: "Search...",
                    lengthMenu: "Show _MENU_ entries"
                }
            });
            return;
        }

        tbody.html(snap.docs.map(doc => {
            const u = doc.data();
            return `
                <tr>
                    <td style="vertical-align: middle;"><strong>${u.name}</strong></td>
                    <td style="vertical-align: middle;">${u.email}</td>
                    <td style="vertical-align: middle;">ID: ${u.studentId || u.facultyId || "N/A"}</td>
                    <td style="text-align: center; vertical-align: middle;">
                        <div style="display:flex; gap:0.5rem; justify-content:center;">
                            <button class="btn btn-success btn-sm" onclick="approveUser('${doc.id}')">Approve</button>
                            <button class="btn btn-danger btn-sm" onclick="rejectUser('${doc.id}')">Reject</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join(""));

        pendingTable.DataTable({
            responsive: false,
            pageLength: 10,
            lengthMenu: [10, 8, 5],
            autoWidth: false,
            pagingType: "simple_numbers",
            language: {
                search: "",
                searchPlaceholder: "Search...",
                lengthMenu: "Show _MENU_ entries",
            },
            columnDefs: [
                { orderable: false, targets: [0, 3] }
            ],
            order: [[1, 'asc']]
        });
    } catch (err) {
        console.error("Error loading pending users:", err);
    }
}

async function approveUser(uid) {
    await db.collection("users").doc(uid).update({
        status: "approved"
    });
    showToast("User approved", "success");
    loadPending();
    loadUsers();
}

async function rejectUser(uid) {
    const userDoc = await db.collection("users").doc(uid).get();
    const email = userDoc.data()?.email || "this user";

    if (!await showConfirm({
        title: 'Reject User',
        message: `Reject and delete account for ${email}?\n\nREMINDER: You must also manually delete this email from the Firebase Console > Authentication.`,
        confirmText: 'Reject',
        type: 'danger'
    })) return;

    await db.collection("users").doc(uid).delete();
    showToast("User rejected. Please clean up their account in Auth Console.", "error");
    loadPending();
    loadUsers();
}



function initializeProfileDropdown() {
    const profileDropdown = document.getElementById('profileDropdown');
    const profileTrigger = document.getElementById('profileTrigger');
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    const changePassBtn = document.getElementById('changePassBtn');

    if (!profileTrigger || !profileDropdown) return;

    profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = profileDropdown.classList.contains('open');
        profileDropdown.classList.toggle('open', !isOpen);
        profileTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('open');
            profileTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', () => {
            profileDropdown.classList.remove('open');
            window.switchView('profile');
        });
    }

    const profilePageEditBtn = document.getElementById('profilePageEditBtn');
    if (profilePageEditBtn) {
        profilePageEditBtn.addEventListener('click', () => {
            openAdminProfileModal();
        });
    }
    document.getElementById('saveAdminProfileBtn')?.addEventListener('click', saveAdminProfile);
    if (changePassBtn) {
        changePassBtn.addEventListener('click', () => {
            profileDropdown.classList.remove('open');
            const email = (auth.currentUser && auth.currentUser.email) || (currentAdminData && currentAdminData.email) || '';
            const hintEl = document.getElementById('changePassEmailHint');
            if (hintEl && email) {
                hintEl.innerHTML = `Verification code will be sent to <strong>${email}</strong>`;
            }
            document.getElementById('changePassModal')?.classList.add('active');
        });
    }

    const closeProfileModal = document.getElementById('closeProfileModal');
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            document.getElementById('profileModal')?.classList.remove('active');
        });
    }
    const closeProfileModalFooter = document.getElementById('closeProfileModalFooter');
    if (closeProfileModalFooter) {
        closeProfileModalFooter.addEventListener('click', () => {
            document.getElementById('profileModal')?.classList.remove('active');
        });
    }

    const closeChangePassModal = document.getElementById('closeChangePassModal');
    const cancelChangePass = document.getElementById('cancelChangePass');
    const changePassModal = document.getElementById('changePassModal');

    const closeChangePw = () => {
        changePassModal?.classList.remove('active');
        document.getElementById('changePassForm')?.reset();
    };

    if (closeChangePassModal) closeChangePassModal.addEventListener('click', closeChangePw);
    if (cancelChangePass) cancelChangePass.addEventListener('click', closeChangePw);

    if (changePassModal) {
        changePassModal.addEventListener('click', (e) => {
            if (e.target === changePassModal) closeChangePw();
        });
    }

    // Email OTP sending logic for Admin change password
    const sendOtpBtn = document.getElementById('sendChangePassOtpBtn');
    const sendOtpText = document.getElementById('sendChangePassOtpText');
    let otpCooldownTimer = null;

    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', async () => {
            const email = (auth.currentUser && auth.currentUser.email) || (currentAdminData && currentAdminData.email) || '';
            if (!email) {
                showToast('Unable to determine account email.', 'error');
                return;
            }

            sendOtpBtn.disabled = true;
            if (sendOtpText) sendOtpText.textContent = 'Sending...';

            try {
                const res = await auth.sendPasswordOtp(email);
                showToast(res.message || 'Verification code sent to your email!', 'success');
                if (res.devCode) {
                    showToast(`[DEV MODE] Verification Code: ${res.devCode}`, 'info');
                    const otpInput = document.getElementById('changePassOtpCode');
                    if (otpInput) otpInput.value = res.devCode;
                }

                // 60-second cooldown
                let secondsLeft = 60;
                if (sendOtpText) sendOtpText.textContent = `Resend (${secondsLeft}s)`;
                clearInterval(otpCooldownTimer);
                otpCooldownTimer = setInterval(() => {
                    secondsLeft--;
                    if (secondsLeft <= 0) {
                        clearInterval(otpCooldownTimer);
                        sendOtpBtn.disabled = false;
                        if (sendOtpText) sendOtpText.textContent = 'Resend Code';
                    } else {
                        if (sendOtpText) sendOtpText.textContent = `Resend (${secondsLeft}s)`;
                    }
                }, 1000);
            } catch (err) {
                console.error('OTP request error:', err);
                showToast(err.message || 'Failed to send verification code.', 'error');
                sendOtpBtn.disabled = false;
                if (sendOtpText) sendOtpText.textContent = 'Send Code';
            }
        });
    }

    const changePassForm = document.getElementById('changePassForm');
    if (changePassForm) {
        changePassForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const otpCode = document.getElementById('changePassOtpCode')?.value.trim();

            if (!otpCode) {
                showToast('Please enter the 6-digit email verification code.', 'error');
                return;
            }

            if (newPassword.length < 6) {
                showToast('New password must be at least 6 characters', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('New passwords do not match', 'error');
                return;
            }

            const submitBtn = changePassForm.querySelector('button[type="submit"]');
            const originalContent = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Updating...</span>';

            try {
                const user = auth.currentUser;
                await user.updatePassword(newPassword, currentPassword, otpCode);
                showToast('Password updated successfully!', 'success');
                closeChangePw();
            } catch (error) {
                console.error('Change password error:', error);
                showToast(error.message || 'Failed to update password', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalContent;
            }
        });
    }
}

function initializeTheme() {
    const themeCheckbox = document.getElementById('themeCheckbox'); // sidebar
    const topbarCheckbox = document.getElementById('topbarThemeCheckbox'); // mobile topbar
    const themeLabel = document.querySelector('.theme-label');
    const themeIcon = document.querySelector('.theme-icon');

    const applyTheme = (isDark) => {
        // APPLY THEME (your system uses data-theme)
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

        // Update label
        if (themeLabel) {
            themeLabel.textContent = isDark ? 'Dark Mode' : 'Light Mode';
        }

        // Update icon
        if (themeIcon) {
            themeIcon.innerHTML = isDark
                ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
                : '<circle cx="12" cy="12" r="5"></circle>\
                   <line x1="12" y1="1" x2="12" y2="3"></line>\
                   <line x1="12" y1="21" x2="12" y2="23"></line>\
                   <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>\
                   <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>\
                   <line x1="1" y1="12" x2="3" y2="12"></line>\
                   <line x1="21" y1="12" x2="23" y2="12"></line>\
                   <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>\
                   <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';

            themeIcon.setAttribute('fill', isDark ? 'currentColor' : 'none');
        }

        // SYNC BOTH TOGGLES
        if (themeCheckbox) themeCheckbox.checked = isDark;
        if (topbarCheckbox) topbarCheckbox.checked = isDark;

        // SAVE THEME
        try {
            localStorage.setItem('mislend-theme', isDark ? 'dark' : 'light');
        } catch (e) { }
    };

    // LOAD SAVED THEME
    let savedTheme;
    try {
        savedTheme = localStorage.getItem('mislend-theme');
    } catch (e) {
        savedTheme = null;
    }

    // AUTO DETECT IF NONE
    if (!savedTheme) {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // APPLY INITIAL THEME
    applyTheme(savedTheme === 'dark');

    // SIDEBAR TOGGLE
    if (themeCheckbox) {
        themeCheckbox.addEventListener('change', () => {
            applyTheme(themeCheckbox.checked);
        });
    }

    // TOPBAR (MOBILE) TOGGLE
    if (topbarCheckbox) {
        topbarCheckbox.addEventListener('change', () => {
            applyTheme(topbarCheckbox.checked);
        });
    }
}

async function sendSMSOverdue(userId, equipmentName, borrowingId) {
    try {
        showToast("Initiating SMS reminder...", "info");
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (userData && userData.mobile) {
            const message = `Hello ${userData.gender === 'Female' ? 'Ma\'am' : 'Sir'} ${userData.name}, this is UCC MIS Office.\nReminder: your borrowed equipment (${equipmentName}) is now overdue. Please return it as soon as possible. Thank you!`;

            const smsUrl = `sms:${userData.mobile}?body=${encodeURIComponent(message)}`;

            try {
                window.location.href = smsUrl;
            } catch (e) {
                console.error("Location redirect failed, trying window.open", e);
                window.open(smsUrl, '_blank');
            }

            if (borrowingId) {
                await db.collection('borrowings').doc(borrowingId).update({
                    lastNotified: firebase.firestore.FieldValue.serverTimestamp(),
                    notificationType: 'sms'
                });
                console.log(`Updated lastNotified (SMS) for borrowing ${borrowingId}`);
                setTimeout(() => loadDashboardData(), 1500);
            }
        } else {
            showToast("User has no mobile number registered.", "warning");
        }
    } catch (error) {
        console.error("Error sending SMS:", error);
        showToast("Failed to initiate SMS: " + error.message, "error");
    }
}

async function sendEmailOverdue(userId, equipmentName, borrowingId) {
    try {
        showToast("Initiating Email reminder...", "info");
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (userData && userData.email) {
            const subject = encodeURIComponent(`Overdue Equipment Reminder: ${equipmentName}`);
            const body = encodeURIComponent(`Hello ${userData.gender === 'Female' ? 'Ma\'am' : 'Sir'} ${userData.name},\n\nOur records show that the equipment (${equipmentName}) you borrowed from the UCC MIS Office is now overdue.\n\nPlease return it to the office as soon as possible to avoid any further issues.\n\nThank you,\nUCC MIS Office`);

            const mailtoUrl = `mailto:${userData.email}?subject=${subject}&body=${body}`;

            try {
                window.location.href = mailtoUrl;
            } catch (e) {
                window.open(mailtoUrl, '_blank');
            }

            if (borrowingId) {
                await db.collection('borrowings').doc(borrowingId).update({
                    lastNotified: firebase.firestore.FieldValue.serverTimestamp(),
                    notificationType: 'email'
                });
                console.log(`Updated lastNotified (Email) for borrowing ${borrowingId}`);
                setTimeout(() => loadDashboardData(), 1500);
            }
        } else {
            showToast("User has no email registered.", "warning");
        }
    } catch (error) {
        console.error("Error sending Email:", error);
        showToast("Failed to initiate Email: " + error.message, "error");
    }
}

window.generateQRCode = generateQRCode;
window.deleteEquipment = deleteEquipment;
window.deleteUser = deleteUser;
window.suspendUser = suspendUser;
window.unsuspendUser = unsuspendUser;
window.sendSMSOverdue = sendSMSOverdue;
window.sendEmailOverdue = sendEmailOverdue;
window.openStudentIdCaptureModal = openStudentIdCaptureModal;
window.closeStudentIdCaptureModal = closeStudentIdCaptureModal;
window.approveBorrow = approveBorrow;
window.rejectBorrow = rejectBorrow;
window.approveReturn = approveReturn;
window.rejectReturn = rejectReturn;
window.approveExtension = approveExtension;
window.rejectExtension = rejectExtension;
async function uploadAdminPhoto(input) {
    if (input.files && input.files[0]) {
        if (typeof window.openImageCropper === 'function') {
            window.openImageCropper({
                file: input.files[0],
                title: 'Crop Profile Photo',
                shape: 'circle',
                onCrop: async (croppedBase64) => {
                    try {
                        showToast("Saving cropped photo...", "info");

                        if (!currentAdmin) {
                            throw new Error("You must be logged in to change your photo.");
                        }

                        await db.collection('users').doc(currentAdmin.uid).update({
                            photoURL: croppedBase64,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        if (currentAdminData) {
                            currentAdminData.photoURL = croppedBase64;
                        }

                        updateAdminInfo();
                        showToast("Profile photo updated successfully!", "success");
                    } catch (err) {
                        console.error("Admin photo upload error:", err);
                        showToast("Failed to update photo: " + err.message, "error");
                    } finally {
                        input.value = "";
                    }
                },
                onCancel: () => {
                    input.value = "";
                }
            });
        } else {
            // Fallback
            try {
                showToast("Processing photo...", "info");
                const base64Data = await resizeImage(input.files[0]);
                if (!currentAdmin) throw new Error("You must be logged in to change your photo.");
                await db.collection('users').doc(currentAdmin.uid).update({
                    photoURL: base64Data,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (currentAdminData) currentAdminData.photoURL = base64Data;
                updateAdminInfo();
                showToast("Profile photo updated!", "success");
            } catch (err) {
                console.error("Admin photo upload error:", err);
                showToast("Failed to update photo: " + err.message, "error");
            }
        }
    }
}

async function previewUserPhoto(input) {
    if (input.files && input.files[0]) {
        if (typeof window.openImageCropper === 'function') {
            window.openImageCropper({
                file: input.files[0],
                title: 'Crop User Photo',
                shape: 'circle',
                onCrop: (croppedBase64) => {
                    const avatarContainer = document.getElementById('editUserAvatarContainer');
                    if (avatarContainer) {
                        avatarContainer.innerHTML = `<img src="${croppedBase64}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                    input._croppedBase64 = croppedBase64;
                },
                onCancel: () => {
                    if (!input._croppedBase64) input.value = "";
                }
            });
        } else {
            const container = document.getElementById('editUserAvatarContainer');
            if (container) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    container.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                };
                reader.readAsDataURL(input.files[0]);
            }
        }
    }
}

async function previewNewUserPhoto(input) {
    if (input.files && input.files[0]) {
        if (typeof window.openImageCropper === 'function') {
            window.openImageCropper({
                file: input.files[0],
                title: 'Crop New User Photo',
                shape: 'circle',
                onCrop: (croppedBase64) => {
                    const avatarContainer = document.getElementById('addUserAvatarContainer');
                    if (avatarContainer) {
                        avatarContainer.innerHTML = `<img src="${croppedBase64}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                    input._croppedBase64 = croppedBase64;
                },
                onCancel: () => {
                    if (!input._croppedBase64) input.value = "";
                }
            });
        } else {
            const container = document.getElementById('addUserAvatarContainer');
            if (container) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    container.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                };
                reader.readAsDataURL(input.files[0]);
            }
        }
    }
}

window.adminConfirmReturn = adminConfirmReturn;
window.uploadAdminPhoto = uploadAdminPhoto;
window.previewUserPhoto = previewUserPhoto;
window.previewNewUserPhoto = previewNewUserPhoto;
window.openEditUser = openEditUser;
window.rejectReturn = rejectReturn;
window.approveExtension = approveExtension;
window.rejectExtension = rejectExtension;

function openAdminSetPassword(userId, userName, userEmail, userPhotoURL) {
    const form = document.getElementById('adminSetPasswordForm');
    if (form) form.reset();
    adminPassSwitchTab('direct');

    document.getElementById('adminSetPasswordUserId').value = userId;
    document.getElementById('adminSetPasswordUserEmail').value = userEmail;
    document.getElementById('adminSetPasswordUserName').textContent = userName;
    document.getElementById('adminSetPasswordUserEmailDisplay').textContent = userEmail;

    const avatarEl = document.getElementById('adminSetPasswordAvatar');
    if (avatarEl) {
        if (userPhotoURL && userPhotoURL !== '' && userPhotoURL !== 'undefined') {
            avatarEl.innerHTML = `<img src="${userPhotoURL}" alt="${userName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarEl.innerHTML = '';
            avatarEl.textContent = getUserInitials(userName);
        }
    }

    ['adminNewPassword', 'adminConfirmPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    document.getElementById('adminSetPasswordModal').classList.add('active');
}

function getAdminSetPasswordError(err) {
    const code = String(err && err.code ? err.code : '').replace(/^functions\//, '');
    const details = err && err.details;
    const detailText = typeof details === 'string'
        ? details
        : (details && details.message) ? details.message : '';
    const message = (err && err.message) || '';

    if (code === 'not-found' && /Authentication account/i.test(message + detailText)) {
        return message || detailText;
    }
    if (code === 'not-found' || /NOT_FOUND/i.test(message) || /does not exist/i.test(message)) {
        return 'Password function is not deployed yet. Run: firebase deploy --only functions';
    }
    if (code === 'unauthenticated') {
        return 'Please sign in again, then retry.';
    }
    if (code === 'permission-denied') {
        return message || 'Only admins can change other users’ passwords.';
    }
    if (code === 'invalid-argument' || code === 'failed-precondition') {
        return detailText || message || 'Could not update this password.';
    }
    if (code === 'internal' || /^internal$/i.test(message)) {
        return 'Firebase returned an internal error. Redeploy functions, confirm Blaze billing is on, then check Functions logs. If the user was created only in Firestore, they have no Auth account to update.';
    }
    return detailText || message || 'Failed to update password';
}

function closeAdminSetPasswordModal() {
    document.getElementById('adminSetPasswordModal').classList.remove('active');
    const form = document.getElementById('adminSetPasswordForm');
    if (form) form.reset();
}

function adminPassSwitchTab(tab) {
    const emailTab = document.getElementById('adminPassTabEmail');
    const directTab = document.getElementById('adminPassTabDirect');
    const btnEmail = document.getElementById('tabResetEmail');
    const btnDirect = document.getElementById('tabSetDirect');
    if (!emailTab || !directTab) return;

    if (tab === 'email') {
        emailTab.style.display = '';
        directTab.style.display = 'none';
        if (btnEmail) { btnEmail.className = 'btn btn-primary btn-sm'; btnEmail.style.flex = '1'; }
        if (btnDirect) { btnDirect.className = 'btn btn-secondary btn-sm'; btnDirect.style.flex = '1'; }
    } else {
        emailTab.style.display = 'none';
        directTab.style.display = '';
        if (btnEmail) { btnEmail.className = 'btn btn-secondary btn-sm'; btnEmail.style.flex = '1'; }
        if (btnDirect) { btnDirect.className = 'btn btn-primary btn-sm'; btnDirect.style.flex = '1'; }
    }
}

// Wire up modal controls once DOM is ready
(function initAdminSetPassword() {
    const modal = document.getElementById('adminSetPasswordModal');
    const closeBtn = document.getElementById('closeAdminSetPasswordModal');
    const cancelBtn = document.getElementById('cancelAdminSetPassword');
    const cancelBtn2 = document.getElementById('cancelAdminSetPassword2');
    const sendBtn = document.getElementById('adminSendResetEmailBtn');
    const form = document.getElementById('adminSetPasswordForm');

    const close = () => closeAdminSetPasswordModal();

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (cancelBtn2) cancelBtn2.addEventListener('click', close);
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) close(); });

    // ── Option A: Send Firebase password-reset email ──────────
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            const email = document.getElementById('adminSetPasswordUserEmail').value;
            if (!email) return;

            const orig = sendBtn.innerHTML;
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';

            try {
                await auth.sendPasswordResetEmail(email);
                showToast(`Password reset email sent to ${email}`, 'success');
                close();
            } catch (err) {
                console.error('Reset email error:', err);
                showToast('Failed to send reset email: ' + (err.message || ''), 'error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = orig;
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const uid = document.getElementById('adminSetPasswordUserId').value;
            const newPassword = document.getElementById('adminNewPassword').value;
            const confirmPassword = document.getElementById('adminConfirmPassword').value;

            if (!uid) {
                showToast('No user selected.', 'error');
                return;
            }
            if (newPassword.length < 6) {
                showToast('New password must be at least 6 characters', 'error');
                return;
            }
            if (newPassword !== confirmPassword) {
                showToast('New passwords do not match', 'error');
                return;
            }

            const submitBtn = document.getElementById('adminSetPasswordSubmitBtn') || form.querySelector('button[type="submit"]');
            const originalContent = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Updating...</span>';

            try {
                if (typeof firebase.functions !== 'function') {
                    throw new Error('Firebase Functions SDK is not loaded.');
                }
                const setPassword = firebase.app().functions('us-central1').httpsCallable('adminSetUserPassword');
                await setPassword({ uid, password: newPassword });
                showToast('Password updated. The user can sign in with the new password.', 'success');
                close();
            } catch (err) {
                console.error('Admin set password error:', err);
                showToast(getAdminSetPasswordError(err), 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalContent;
            }
        });
    }
})();

window.openAdminSetPassword = openAdminSetPassword;
window.adminPassSwitchTab = adminPassSwitchTab;
window.closeAdminSetPasswordModal = closeAdminSetPasswordModal;
window.adminConfirmReturn = adminConfirmReturn;
window.openImageZoomModal = openImageZoomModal;
window.closeImageZoomModal = closeImageZoomModal;

// ═══════════════════════════════════════════════════════════════
// INCIDENT REPORT MANAGEMENT
// ═══════════════════════════════════════════════════════════════
let currentIncidentId = null;
let incidentChatUnsubscribe = null;

async function loadAllIncidents() {
    const listEl = document.getElementById('adminIncidentsList');
    const detailPanel = document.getElementById('incidentDetailPanel');
    if (!listEl) return;

    // Show list, hide detail
    listEl.style.display = '';
    if (detailPanel) detailPanel.style.display = 'none';

    try {
        const snapshot = await db.collection('incidents')
            .orderBy('createdAt', 'desc')
            .get();

        const incidents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));



        if (incidents.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <h3>No incident reports</h3>
                    <p>Borrowers can submit damage reports from their dashboard</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = incidents.map(inc => {
            const statusColors = {
                pending: 'background: rgba(245,158,11,0.1); color: #92400e;',
                under_review: 'background: rgba(59,130,246,0.1); color: #1e40af;',
                approved: 'background: rgba(16,185,129,0.1); color: #065f46;',
                resolved: 'background: rgba(107,114,128,0.1); color: #374151;'
            };
            const statusStyle = statusColors[inc.status] || statusColors.pending;
            const statusLabel = (inc.status || 'pending').replace('_', ' ').toUpperCase();
            const dateStr = inc.createdAt?.toDate ? inc.createdAt.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

            return `
                <div class="incident-card" onclick="openIncidentDetail('${inc.id}')">
                    <div class="incident-card-header">
                        <div>
                            <strong>${inc.equipmentName || 'Unknown Equipment'}</strong>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);"> — ${inc.equipmentCode || ''}</span>
                        </div>
                        <span class="badge" style="${statusStyle} padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600;">${statusLabel}</span>
                    </div>
                    <div class="incident-card-body">
                        <p style="margin: 0.25rem 0; color: var(--text-secondary); font-size: 0.85rem;">
                            Reported by <strong>${inc.reporterName}</strong> (${capitalize(inc.reporterRole || 'user')}) — ${dateStr}
                        </p>
                        <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: var(--text-primary);">${(inc.description || '').substring(0, 120)}${(inc.description || '').length > 120 ? '...' : ''}</p>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading incidents:', error);
        listEl.innerHTML = '<div class="empty-state"><h3>Error loading incidents</h3></div>';
    }
}

async function openIncidentDetail(incidentId) {
    currentIncidentId = incidentId;
    const listEl = document.getElementById('adminIncidentsList');
    const detailPanel = document.getElementById('incidentDetailPanel');
    if (listEl) listEl.style.display = 'none';
    if (detailPanel) detailPanel.style.display = '';

    try {
        const doc = await db.collection('incidents').doc(incidentId).get();
        const inc = { id: doc.id, ...doc.data() };

        // Status
        const statusEl = document.getElementById('incidentDetailStatus');
        const statusLabel = (inc.status || 'pending').replace('_', ' ').toUpperCase();
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-status">${statusLabel}</span>`;

        // Info card
        const infoCard = document.getElementById('incidentInfoCard');
        if (infoCard) {
            const dateStr = inc.createdAt?.toDate ? inc.createdAt.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
            infoCard.innerHTML = `
                <div class="incident-info-grid">
                    <div><strong>Reporter:</strong> ${inc.reporterName} (${capitalize(inc.reporterRole || 'user')})</div>
                    <div><strong>Email:</strong> ${inc.reporterEmail || 'N/A'}</div>
                    <div><strong>ID:</strong> ${inc.reporterId_number || 'N/A'}</div>
                    <div><strong>Equipment:</strong> ${inc.equipmentName} (${inc.equipmentCode || 'N/A'})</div>
                    <div><strong>Date:</strong> ${dateStr}</div>
                    <div><strong>Status:</strong> ${statusLabel}</div>
                </div>
                <div style="margin-top: 0.75rem;">
                    <strong>Description:</strong>
                    <p style="margin: 0.25rem 0; color: var(--text-secondary);">${inc.description || 'No description'}</p>
                </div>
                ${inc.photoURL ? `<div style="margin-top: 0.75rem;"><strong>Photo:</strong><br><img src="${inc.photoURL}" style="max-width: 300px; border-radius: 8px; margin-top: 0.5rem; cursor: pointer;" onclick="openImageZoomModal(this.src)" /></div>` : ''}
                ${inc.approvedBy ? `<div style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(16,185,129,0.1); border-radius: 8px;"><strong>Approved by:</strong> ${inc.approvedBy}</div>` : ''}
            `;
        }

        // Show/hide actions
        const actionsRow = document.getElementById('incidentActionsRow');
        if (actionsRow) {
            actionsRow.style.display = (inc.status === 'approved' || inc.status === 'resolved') ? 'none' : '';
        }

        // Load chat messages (real-time)
        if (incidentChatUnsubscribe) incidentChatUnsubscribe();
        const chatContainer = document.getElementById('adminChatMessages');
        incidentChatUnsubscribe = db.collection('incidents').doc(incidentId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                if (!chatContainer) return;
                const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                if (messages.length === 0) {
                    chatContainer.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 2rem;">No messages yet. Start the conversation.</div>';
                } else {
                    chatContainer.innerHTML = messages.map(msg => {
                        const isAdmin = msg.senderRole === 'admin';
                        const time = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
                        return `
                            <div class="chat-bubble ${isAdmin ? 'chat-admin' : 'chat-user'}">
                                <div class="chat-sender">${msg.senderName} <span class="chat-role">(${capitalize(msg.senderRole)})</span></div>
                                <div class="chat-text">${msg.message}</div>
                                <div class="chat-time">${time}</div>
                            </div>
                        `;
                    }).join('');
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });

        // Mark as under_review if pending
        if (inc.status === 'pending') {
            await db.collection('incidents').doc(incidentId).update({ status: 'under_review' });
        }

    } catch (error) {
        console.error('Error opening incident detail:', error);
        showToast('Failed to load incident details', 'error');
    }
}

async function sendAdminIncidentMessage() {
    if (!currentIncidentId) return;
    const input = document.getElementById('adminChatInput');
    const message = input?.value.trim();
    if (!message) return;

    try {
        await db.collection('incidents').doc(currentIncidentId).collection('messages').add({
            senderId: currentAdmin.uid,
            senderName: currentAdminData?.name || 'Administrator',
            senderRole: 'admin',
            message: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
    }
}

async function approveIncident() {
    if (!currentIncidentId) return;
    const approvedBy = currentAdminData?.name || 'Administrator';

    if (!await showConfirm({
        title: 'Approve Incident Report',
        message: `Approve this incident report? Approved by: ${approvedBy}`,
        confirmText: 'Approve',
        type: 'success'
    })) return;

    try {
        await db.collection('incidents').doc(currentIncidentId).update({
            status: 'approved',
            approvedBy: approvedBy,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Incident report approved', 'success');
        openIncidentDetail(currentIncidentId);
    } catch (error) {
        console.error('Error approving incident:', error);
        showToast('Failed to approve', 'error');
    }
}

async function exportIncidentPDF() {
    if (!currentIncidentId) return;

    try {
        showToast('Generating PDF...', 'info');
        const doc = await db.collection('incidents').doc(currentIncidentId).get();
        const inc = { id: doc.id, ...doc.data() };

        // Load chat messages
        const msgSnap = await db.collection('incidents').doc(currentIncidentId).collection('messages').orderBy('timestamp', 'asc').get();
        const messages = msgSnap.docs.map(d => ({ ...d.data() }));

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 20;
        const contentWidth = pageWidth - 2 * margin;
        let y = 20;

        // Helper for page breaks
        const checkPageBreak = (neededHeight) => {
            if (y + neededHeight > 270) {
                pdf.addPage();
                y = 20;
            }
        };

        // ── School Logo / Seal area ──
        pdf.setFillColor(11, 31, 58);
        pdf.rect(0, 0, pageWidth, 40, 'F');

        // Helper to crop image to circle using Canvas
        const getCircularLogo = (imgPath) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = Math.min(img.width, img.height);
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    ctx.beginPath();
                    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.drawImage(img, (size - img.width) / 2, (size - img.height) / 2);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(imgPath); // Fallback to original
                img.src = imgPath;
            });
        };

        // Circular Logo 1 (Left: CS1A.png)
        try {
            const logo1Circle = await getCircularLogo('assets/images/CS1A.png');
            pdf.addImage(logo1Circle, 'PNG', margin, 7, 25, 25);
        } catch (e) {
            console.error("Logo 1 error:", e);
        }

        // Circular Logo 2 (Right: ucc.png)
        try {
            const logo2Circle = await getCircularLogo('assets/images/ucc.png');
            pdf.addImage(logo2Circle, 'PNG', pageWidth - margin - 25, 7, 25, 25);
        } catch (e) {
            console.error("Logo 2 error:", e);
        }

        // Watermark Seal (13.png)
        pdf.saveGraphicsState();
        try {
            const GState = pdf.GState || (window.jspdf && window.jspdf.GState);
            if (GState) {
                pdf.setGState(new GState({ opacity: 0.1 }));
            }
            const sealSize = 100;
            pdf.addImage('assets/images/logs.png', 'PNG', (pageWidth - sealSize) / 2, 80, sealSize, sealSize);
        } catch (e) {
            console.error("Watermark error:", e);
        } finally {
            pdf.restoreGraphicsState();
        }

        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        pdf.text('UNIVERSITY OF CALOOCAN CITY', pageWidth / 2, 15, { align: 'center' });
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Management Information Systems Office', pageWidth / 2, 22, { align: 'center' });
        pdf.text('Biglang Awa St., 11th Ave., East Grace Park, Caloocan City', pageWidth / 2, 27, { align: 'center' });

        y = 50;

        // ── TITLE ──
        pdf.setTextColor(13, 148, 136);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('INCIDENT REPORT', pageWidth / 2, y, { align: 'center' });
        y += 5;

        // Reference number and date
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const refNo = `IR-${(inc.createdAt?.toDate ? inc.createdAt.toDate().getFullYear() : new Date().getFullYear())}-${currentIncidentId.substring(0, 6).toUpperCase()}`;
        const dateStr = inc.createdAt?.toDate ? inc.createdAt.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-PH');
        pdf.text(`Reference No: ${refNo}`, margin, y + 5);
        pdf.text(`Date: ${dateStr}`, pageWidth - margin, y + 5, { align: 'right' });
        y += 12;

        // ── Separator ──
        pdf.setDrawColor(13, 148, 136);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 8;

        // ── Reporter Info ──
        pdf.setTextColor(30, 30, 30);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('REPORTER INFORMATION', margin, y);
        y += 7;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const reporterLines = [
            `Name: ${inc.reporterName || 'N/A'}`,
            `Role: ${capitalize(inc.reporterRole || 'User')}`,
            `ID: ${inc.reporterId_number || 'N/A'}`,
            `Email: ${inc.reporterEmail || 'N/A'}`
        ];
        reporterLines.forEach(line => {
            pdf.text(line, margin, y);
            y += 5;
        });
        y += 4;

        // ── Equipment Info ──
        checkPageBreak(30);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('EQUIPMENT INFORMATION', margin, y);
        y += 7;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const equipLines = [
            `Equipment: ${inc.equipmentName || 'N/A'}`,
            `Equipment Code: ${inc.equipmentCode || 'N/A'}`
        ];
        equipLines.forEach(line => {
            pdf.text(line, margin, y);
            y += 5;
        });
        y += 4;

        // ── Description ──
        checkPageBreak(30);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('INCIDENT DESCRIPTION', margin, y);
        y += 7;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const descLines = pdf.splitTextToSize(inc.description || 'No description provided.', contentWidth);
        descLines.forEach(line => {
            checkPageBreak(6);
            pdf.text(line, margin, y);
            y += 5;
        });
        y += 6;

        // ── Chat History ──
        if (messages.length > 0) {
            checkPageBreak(20);
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.text('COMMUNICATION LOG', margin, y);
            y += 7;

            messages.forEach(msg => {
                checkPageBreak(16);
                const time = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(13, 148, 136);
                pdf.text(`${msg.senderName} (${capitalize(msg.senderRole)}) — ${time}`, margin, y);
                y += 4;

                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(60, 60, 60);
                const msgLines = pdf.splitTextToSize(msg.message, contentWidth - 5);
                msgLines.forEach(line => {
                    checkPageBreak(5);
                    pdf.text(line, margin + 3, y);
                    y += 4;
                });
                y += 3;
            });
        }
        y += 6;

        // ── Approval Section ──
        checkPageBreak(50);
        pdf.setDrawColor(13, 148, 136);
        pdf.setLineWidth(0.3);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 10;

        if (inc.approvedBy) {
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(16, 120, 96);
            pdf.text('✓ APPROVED', pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setTextColor(30, 30, 30);
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(inc.approvedBy, pageWidth / 2, y, { align: 'center' });
            y += 5;

            // Signature line
            pdf.setDrawColor(30, 30, 30);
            pdf.setLineWidth(0.3);
            pdf.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
            y += 5;
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.text('Head / Authorized Signatory', pageWidth / 2, y, { align: 'center' });
            y += 4;

            if (inc.approvedAt?.toDate) {
                pdf.setFontSize(7);
                pdf.text(`Date Approved: ${inc.approvedAt.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, y, { align: 'center' });
            }
        } else {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(150, 150, 150);
            pdf.text('Pending Approval', pageWidth / 2, y, { align: 'center' });
        }

        // Watermark seal on last page
        pdf.setGState(new pdf.GState({ opacity: 0.08 }));
        pdf.setFontSize(60);
        pdf.setTextColor(13, 148, 136);
        pdf.text('UCC-MIS', pageWidth / 2, 160, { align: 'center', angle: 30 });
        pdf.setGState(new pdf.GState({ opacity: 1 }));

        // Footer
        const pageCount = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`MISLend System — Incident Report ${refNo} — Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
        }

        pdf.save(`Incident-Report-${refNo}.pdf`);
        showToast('PDF exported successfully!', 'success');

    } catch (error) {
        console.error('PDF export error:', error);
        showToast('Failed to export PDF', 'error');
    }
}

// ── Wire up incident panel buttons ──
(function initIncidentPanel() {
    const backBtn = document.getElementById('backToIncidentListBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (incidentChatUnsubscribe) { incidentChatUnsubscribe(); incidentChatUnsubscribe = null; }
            currentIncidentId = null;
            loadAllIncidents();
        });
    }

    const sendBtn = document.getElementById('adminSendChatBtn');
    const chatInput = document.getElementById('adminChatInput');
    if (sendBtn) sendBtn.addEventListener('click', sendAdminIncidentMessage);
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendAdminIncidentMessage();
        });
    }

    const approveBtn = document.getElementById('approveIncidentBtn');
    if (approveBtn) approveBtn.addEventListener('click', approveIncident);

    const exportBtn = document.getElementById('exportIncidentPdfBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportIncidentPDF);
})();

window.openIncidentDetail = openIncidentDetail;
window.loadAllIncidents = loadAllIncidents;
