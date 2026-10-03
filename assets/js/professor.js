let currentUser = null;
let currentUserData = null;
let html5QrCode = null;
let selectedEquipmentForBorrow = null;
let selectedBorrowingForReturn = null;
let selectedBorrowingForExtend = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { user, userData } = await checkAuth('professor');
        currentUser = user;
        currentUserData = userData;

        initializeDashboard();

        handleBorrowDeepLink();
    } catch (error) {
        console.error('Authentication error:', error);
    }
});

async function handleBorrowDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const equipmentCode = params.get("borrow");
    if (!equipmentCode) return;

    try {
        const browseNav = document.querySelector('.nav-item[data-view="browse"]');
        if (browseNav) browseNav.click();

        const snap = await db.collection("equipment")
            .where("equipmentId", "==", equipmentCode)
            .limit(1)
            .get();

        if (snap.empty) {
            showToast(`Equipment not found: ${equipmentCode}`, "error");
            return;
        }

        const doc = snap.docs[0];
        const equipment = { id: doc.id, ...doc.data() };

        if (equipment.status !== "available") {
            showToast("This equipment is not available right now.", "error");
            return;
        }

        await openBorrowModal(equipment.id);

        window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
        console.error("Deep link borrow error:", err);
        showToast("Failed to open borrow form.", "error");
    }
}


function initializeDashboard() {
    updateUserInfo();
    watchUserProfile(currentUser.uid, userData => {
        currentUserData = { ...currentUserData, ...userData };
        updateUserInfo();
    });
    initializeNavigation();
    startViewAutoRefresh(
        () => document.querySelector('.view-container.active')?.id.replace(/View$/, ''),
        {
            browse: loadEquipment,
            myborrowed: loadBorrowedItems,
            history: loadHistory,
            incidents: loadMyIncidents
        }
    );
    loadEquipment();
    loadBorrowedItems();
    setupQRScanner();
    initializeModals();
    initializeFilters();
    initializeSidebar();
    initializeProfileDropdown();
    initializeTheme();
    initializeHistoryExport();
    initializeIncidentReporting();

}


function updateUserInfo() {
    const name = currentUserData.name || 'Professor';
    const email = currentUser.email || '';
    const initials = getUserInitials(name);
    const photoURL = currentUserData.photoURL || null;

    const ids = ['userInitial', 'topbarInitial', 'menuInitial'];
    const containers = ['sidebarAvatarContainer', 'topbarAvatarContainer', 'menuAvatarContainer'];

    containers.forEach((containerId, index) => {
        const container = document.getElementById(containerId);
        const initialEl = document.getElementById(ids[index]);
        if (!container) return;

        if (photoURL) {
            container.innerHTML = `<img src="${photoURL}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            container.innerHTML = `<span id="${ids[index]}" style="border-radius: 50%;">${initials}</span>`;
        }
    });

    const nameEls = ['userName', 'topbarUserName', 'menuUserName'];
    nameEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
    });

    const emailEls = ['userEmail', 'menuUserEmail'];
    emailEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = email;
    });
}

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const views = document.querySelectorAll('.view-container');
    const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');
    const topbarMobileTitle = document.getElementById('topbarMobileTitle');

    const viewLabels = {
        browse: 'Browse Equipment',
        scan: 'Scan QR Code',
        myborrowed: 'My Borrowed Items',
        history: 'Borrowing History',
        incidents: 'Incident Reports',
        settings: 'Settings'
    };

    function activateView(viewId) {
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
        if (topbarMobileTitle) topbarMobileTitle.textContent = label;

        if (viewId === 'browse') loadEquipment();
        else if (viewId === 'myborrowed') loadBorrowedItems();
        else if (viewId === 'history') loadHistory();
        else if (viewId === 'scan') startQRScanner();
        else if (viewId === 'settings') loadSettings();
        else if (viewId === 'incidents') loadMyIncidents();

        try { localStorage.setItem('professor-active-view', viewId); } catch (e) { }

        if (window.innerWidth <= 768) {
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
            const profileTrigger = document.getElementById('profileTrigger');
            if (profileTrigger) {
                profileTrigger.click();
            }
        });
    }

    // Export globally for onclick handlers
    window.switchView = activateView;

    const saved = (() => { try { return localStorage.getItem('professor-active-view'); } catch (e) { return null; } })();
    if (saved && document.getElementById(`${saved}View`)) {
        activateView(saved);
    } else {
        activateView('browse');
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

async function loadEquipment() {
    const equipmentGrid = document.getElementById('equipmentGrid');
    if (!equipmentGrid) return;

    try {
        const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
        const statusFilter = document.getElementById('statusFilter')?.value || 'available';
        const searchQuery = document.getElementById('searchEquipment')?.value.toLowerCase() || '';

        let query = db.collection('equipment');

        if (statusFilter === 'available') {
            query = query.where('status', '==', 'available');
        }

        const snapshot = await query.get();

        let equipment = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (categoryFilter !== 'all') {
            equipment = equipment.filter(e => e.category === categoryFilter);
        }

        if (searchQuery) {
            equipment = equipment.filter(e =>
                e.name.toLowerCase().includes(searchQuery) ||
                e.equipmentId.toLowerCase().includes(searchQuery)
            );
        }

        if (equipment.length === 0) {
            equipmentGrid.innerHTML = `
                <div class="empty-state">
                    <h3>No equipment found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
        } else {
            equipmentGrid.innerHTML = equipment.map(item => {
                const imgPath = getEquipmentImage(item.category);
                return `
                <div class="equipment-card">
                    <div style="background: rgba(11, 31, 58, 0.03); border-bottom: 1px solid var(--border); margin: -1.5rem -1.5rem 1rem -1.5rem; padding: 1.5rem; border-top-left-radius: 12px; border-top-right-radius: 12px; display: flex; justify-content: center; align-items: center; min-height: 180px; cursor: zoom-in;" onclick="openImageZoomModal('${imgPath}')" title="Click to zoom">
                        <img src="${imgPath}" alt="${item.name}" style="max-height: 140px; max-width: 100%; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">
                    </div>
                    <div class="equipment-header">
                        <span class="equipment-id">${item.equipmentId}</span>
                        <span class="equipment-status ${item.status}">${capitalize(item.status)}</span>
                    </div>
                    <div class="equipment-name">${item.name}</div>
                    <div class="equipment-category">${capitalize(item.category)}</div>
                    ${item.description ? `<p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">${item.description}</p>` : ''}
                    <div class="equipment-actions">
                        ${item.status === 'available' ? `
                            <button class="btn btn-primary btn-sm" onclick="openBorrowModal('${item.id}')">
                                Borrow
                            </button>
                        ` : `
                            <button class="btn btn-secondary btn-sm" disabled>Not Available</button>
                        `}
                    </div>
                </div>
            `}).join('');
        }
    } catch (error) {
        console.error('Error loading equipment:', error);
        equipmentGrid.innerHTML = `
            <div class="empty-state">
                <h3>Error loading equipment</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

function initializeFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('searchEquipment');

    if (categoryFilter) {
        categoryFilter.addEventListener('change', loadEquipment);
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', loadEquipment);
    }

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(loadEquipment, 300);
        });
    }
}

function setupQRScanner() {
    const manualSubmitBtn = document.getElementById('manualSubmitBtn');
    if (manualSubmitBtn) {
        manualSubmitBtn.addEventListener('click', () => {
            const equipmentId = document.getElementById('manualEquipmentId').value.trim();
            if (equipmentId) {
                processQRCode(equipmentId);
            } else {
                showToast('Please enter an equipment ID', 'error');
            }
        });
    }
}

function extractEquipmentId(decodedText) {
    if (!decodedText) return "";

    let text = String(decodedText).trim();

    try {
        if (text.startsWith("http")) {
            const url = new URL(text);
            const fromQuery = url.searchParams.get("id") ||
                url.searchParams.get("equipmentId") ||
                url.searchParams.get("borrow");
            if (fromQuery) return fromQuery.trim();

            const last = url.pathname.split("/").pop();
            if (last && !last.endsWith(".html")) return last.trim();
        }
    } catch (e) { }

    text = text.split("|")[0].trim();
    text = text.split("\n")[0].trim();

    return text;
}

async function processQRCode(decodedText) {
    showToast('🔍 Looking up equipment…', 'info');

    try {
        const equipmentId = extractEquipmentId(decodedText);

        if (!equipmentId) {
            showToast('Invalid QR code content', 'error');
            setTimeout(() => startQRScanner(), 1500);
            return;
        }

        const equipmentSnapshot = await db.collection('equipment')
            .where('equipmentId', '==', equipmentId)
            .limit(1)
            .get();

        if (equipmentSnapshot.empty) {
            showToast(`Equipment not found: ${equipmentId}`, 'error');
            setTimeout(() => startQRScanner(), 2000);
            return;
        }

        const equipmentDoc = equipmentSnapshot.docs[0];
        const equipment = { id: equipmentDoc.id, ...equipmentDoc.data() };

        if (equipment.status === 'available') {
            const browseNav = document.querySelector('.nav-item[data-view="browse"]');
            if (browseNav) browseNav.click();
            await openBorrowModal(equipment.id);

        } else if (equipment.status === 'borrowed') {
            const borrowingSnapshot = await db.collection('borrowings')
                .where('equipmentId', '==', equipment.id)
                .where('userId', '==', currentUser.uid)
                .where('status', '==', 'borrowed')
                .limit(1)
                .get();

            if (!borrowingSnapshot.empty) {
                const borrowedNav = document.querySelector('.nav-item[data-view="myborrowed"]');
                if (borrowedNav) borrowedNav.click();
                await openReturnModal(borrowingSnapshot.docs[0].id);
            } else {
                showToast('This equipment is currently borrowed by someone else', 'error');
                setTimeout(() => startQRScanner(), 2000);
            }
        } else {
            showToast('This equipment is currently unavailable', 'error');
            setTimeout(() => startQRScanner(), 2000);
        }
    } catch (error) {
        console.error('Error processing QR code:', error);
        showToast('Error reading QR code. Please try again.', 'error');
        setTimeout(() => startQRScanner(), 2000);
    }
}

async function openBorrowModal(equipmentId) {
    try {
        const equipmentDoc = await db.collection('equipment').doc(equipmentId).get();
        const equipment = { id: equipmentDoc.id, ...equipmentDoc.data() };

        selectedEquipmentForBorrow = equipment;

        const borrowDetail = document.getElementById('borrowDetail');
        borrowDetail.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong>Equipment:</strong> ${equipment.name}<br>
                <strong>ID:</strong> ${equipment.equipmentId}<br>
            </div>
        `;

        const returnTimeInput = document.getElementById('returnTime');
        if (returnTimeInput) {
            const now = new Date();
            now.setSeconds(0, 0);
            now.setHours(now.getHours() + 1);

            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            returnTimeInput.value = `${hh}:${mm}`;
        }

        document.getElementById('borrowModal').classList.add('active');
    } catch (error) {
        console.error('Error opening borrow modal:', error);
        showToast('Error loading equipment details', 'error');
    }
}

function initializeModals() {
    const borrowModal = document.getElementById('borrowModal');
    const closeBorrowModal = document.getElementById('closeBorrowModal');
    const cancelBorrow = document.getElementById('cancelBorrow');
    const confirmBorrow = document.getElementById('confirmBorrow');

    if (closeBorrowModal) {
        closeBorrowModal.addEventListener('click', () => {
            borrowModal.classList.remove('active');
        });
    }

    if (cancelBorrow) {
        cancelBorrow.addEventListener('click', () => {
            borrowModal.classList.remove('active');
        });
    }

    if (confirmBorrow) {
        confirmBorrow.addEventListener('click', async () => {
            await borrowEquipment();
        });
    }

    const returnModal = document.getElementById('returnModal');
    const closeReturnModal = document.getElementById('closeReturnModal');
    const cancelReturn = document.getElementById('cancelReturn');
    const confirmReturn = document.getElementById('confirmReturn');

    if (closeReturnModal) {
        closeReturnModal.addEventListener('click', () => {
            returnModal.classList.remove('active');
        });
    }

    if (cancelReturn) {
        cancelReturn.addEventListener('click', () => {
            returnModal.classList.remove('active');
        });
    }

    if (confirmReturn) {
        confirmReturn.addEventListener('click', async () => {
            await returnEquipment();
        });
    }

    if (borrowModal) {
        borrowModal.addEventListener('click', (e) => {
            if (e.target === borrowModal) {
                borrowModal.classList.remove('active');
            }
        });
    }

    if (returnModal) {
        returnModal.addEventListener('click', (e) => {
            if (e.target === returnModal) {
                returnModal.classList.remove('active');
            }
        });
    }

    const extendModal = document.getElementById('extendModal');
    const closeExtendModal = document.getElementById('closeExtendModal');
    const cancelExtend = document.getElementById('cancelExtend');
    const confirmExtend = document.getElementById('confirmExtend');

    if (closeExtendModal) closeExtendModal.onclick = () => extendModal.classList.remove('active');
    if (cancelExtend) cancelExtend.onclick = () => extendModal.classList.remove('active');
    if (confirmExtend) confirmExtend.onclick = () => requestExtension();

    if (extendModal) {
        extendModal.onclick = (e) => {
            if (e.target === extendModal) extendModal.classList.remove('active');
        }
    }
}

async function borrowEquipment() {
    const returnTime = document.getElementById('returnTime').value;
    const purpose = document.getElementById('purpose').value;
    const room = document.getElementById('room').value.trim();

    if (!room) {
        showToast('Please enter the room', 'error');
        return;
    }

    if (!returnTime) {
        showToast('Please select a return time', 'error');
        return;
    }

    const now = new Date();
    const [hh, mm] = returnTime.split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm, 0, 0);

    if (target < now) {
        target.setDate(target.getDate() + 1);
    }

    const diffHours = (target - now) / (1000 * 60 * 60);
    if (diffHours > 3.01) {
        showToast('Maximum borrowing time is 3 hours', 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirmBorrow');
    const originalContent = confirmBtn.innerHTML;

    try {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span>Processing...</span>';

        await db.collection('borrowings').add({
            equipmentId: selectedEquipmentForBorrow.id,
            equipmentCode: selectedEquipmentForBorrow.equipmentId,
            equipmentName: selectedEquipmentForBorrow.name,
            equipmentCategory: selectedEquipmentForBorrow.category,

            room: room,

            userId: currentUser.uid,
            userName: currentUserData.name,
            userEmail: currentUser.email,
            userMobile: currentUserData.mobile || 'N/A',
            facultyId: currentUserData.facultyId || 'N/A',
            userPhotoURL: currentUserData.photoURL || null,
            borrowedAt: firebase.firestore.FieldValue.serverTimestamp(),
            expectedReturnTime: returnTime,

            purpose: purpose || 'Not specified',
            status: 'pending_borrow'
        });

        showToast('Borrow request submitted! Awaiting admin approval.', 'success');
        document.getElementById('borrowModal').classList.remove('active');

        document.getElementById('room').value = '';
        document.getElementById('returnTime').value = '';

        loadEquipment();
        loadBorrowedItems();

    } catch (error) {
        console.error('Error borrowing equipment:', error);
        showToast('Failed to submit borrow request', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalContent;
    }
}

async function loadBorrowedItems() {
    const borrowedItemsGrid = document.getElementById('borrowedItemsGrid');
    const borrowedCountBadge = document.getElementById('borrowedCount');
    const borrowedCountMobile = document.getElementById('borrowedCountMobile');

    if (!borrowedItemsGrid) return;

    try {
        const [borrowedSnap, pendingBorrowSnap, pendingExtendSnap] = await Promise.all([
            db.collection('borrowings').where('userId', '==', currentUser.uid).where('status', '==', 'borrowed').get(),
            db.collection('borrowings').where('userId', '==', currentUser.uid).where('status', '==', 'pending_borrow').get(),
            db.collection('borrowings').where('userId', '==', currentUser.uid).where('status', '==', 'pending_extension').get()
        ]);

        const borrowedItems = [
            ...borrowedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            ...pendingBorrowSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            ...pendingExtendSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        ].sort((a, b) => {
            const aTime = a.borrowedAt?.seconds || 0;
            const bTime = b.borrowedAt?.seconds || 0;
            return bTime - aTime;
        });

        if (borrowedCountBadge) {
            const count = borrowedItems.filter(i => i.status === 'borrowed').length;
            borrowedCountBadge.textContent = count;
            if (borrowedCountMobile) {
                borrowedCountMobile.textContent = count;
                borrowedCountMobile.style.display = count > 0 ? 'flex' : 'none';
            }
        }

        if (borrowedItems.length === 0) {
            borrowedItemsGrid.innerHTML = `
                <div class="empty-state">
                    <h3>No borrowed items</h3>
                    <p>You haven't borrowed any equipment yet</p>
                </div>
            `;
        } else {
            borrowedItemsGrid.innerHTML = borrowedItems.map(item => {
                const isPendingBorrow = item.status === 'pending_borrow';
                const isPendingReturn = item.status === 'pending_return';
                const isPendingExtend = item.status === 'pending_extension';
                const isBorrowed = item.status === 'borrowed';

                let statusBadge = '';
                if (isPendingBorrow) {
                    statusBadge = `<span class="badge badge-status" style="background: rgba(245,158,11,0.1); color: var(--warning); font-size:0.75rem;">Pending Approval</span>`;
                } else if (isPendingExtend) {
                    statusBadge = `<span class="badge badge-status" style="background: rgba(30,64,175,0.1); color: #1e40af; font-size:0.75rem;">Extension Pending</span>`;
                } else if (isBorrowed) {
                    statusBadge = `<span class="badge badge-status" style="background: rgba(16,185,129,0.1); color: var(--success); font-size:0.75rem;">Approved</span>`;
                }

                let actions = '';
                if (isBorrowed) {
                    actions = `
                        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openExtendModal('${item.id}')">
                            Extend Time
                        </button>
                        <button class="btn btn-secondary btn-sm" style="flex:1; border-color:var(--danger); color:var(--danger);" onclick="switchView('incidents'); setTimeout(() => openNewIncidentForm('${item.id}'), 100)">
                            Report
                        </button>
                    `;
                } else if (isPendingBorrow) {
                    actions = `
                        <button class="btn btn-secondary btn-sm" style="flex:1; border-color: var(--danger); color: var(--danger);" onclick="cancelBorrowRequest('${item.id}')">
                            Cancel Request
                        </button>
                    `;
                } else if (isPendingExtend) {
                    actions = `
                        <button class="btn btn-secondary btn-sm" style="flex:1; border-color: var(--danger); color: var(--danger);" onclick="cancelExtensionRequest('${item.id}')">
                            Cancel Extension
                        </button>
                    `;
                } else {
                    actions = `<div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 0.5rem; background: var(--bg-secondary); border-radius: var(--radius-md); width:100%;">
                        📋 Action is confirmed by the admin
                    </div>`;
                }

                return `
                    <div class="borrowed-item-card">
                        <div class="borrowed-item-header">
                            <div class="borrowed-item-info">
                                <div class="borrowed-item-name">${item.equipmentName}</div>
                                <div class="borrowed-item-id">ID: ${item.equipmentCode || 'N/A'}</div>
                            </div>
                            ${statusBadge}
                        </div>
                        <div class="borrowed-item-meta">
                            <span><i class="fa-solid fa-calendar"></i> Borrowed: ${formatDate(item.borrowedAt)}</span>
                            |
                            <span class="due-date">
                                <i class="fa-solid fa-clock"></i> Due Time: ${formatTimeTo12h(item.expectedReturnTime)}
                            </span>
                        </div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;">
                            <strong>Room:</strong> ${item.room || 'N/A'}
                            &nbsp; <strong>Purpose:</strong> ${item.purpose}
                        </div>
                        <div class="borrowed-item-actions" style="display:flex; gap:0.5rem;">
                            ${actions}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading borrowed items:', error);
        borrowedItemsGrid.innerHTML = `
            <div class="empty-state">
                <h3>Error loading borrowed items</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

async function openReturnModal(borrowingId) {
    try {
        const borrowingDoc = await db.collection('borrowings').doc(borrowingId).get();
        const borrowing = { id: borrowingDoc.id, ...borrowingDoc.data() };

        selectedBorrowingForReturn = borrowing;

        const returnDetail = document.getElementById('returnDetail');
        returnDetail.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong>Equipment:</strong> ${borrowing.equipmentName}<br>
                <strong>Borrowed:</strong> ${formatDate(borrowing.borrowedAt)}<br>
                <strong>Room:</strong> ${borrowing.room || 'N/A'}<br>
                <strong>Expected Return Time:</strong> ${formatTimeTo12h(borrowing.expectedReturnTime)}
            </div>
        `;

        document.getElementById('returnModal').classList.add('active');
    } catch (error) {
        console.error('Error opening return modal:', error);
        showToast('Error loading borrowing details', 'error');
    }
}

async function returnEquipment() {
    const condition = document.getElementById('condition').value;
    const notes = document.getElementById('notes').value;

    if (!condition) {
        showToast('Please select equipment condition', 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirmReturn');
    const originalContent = confirmBtn.innerHTML;

    try {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span>Processing...</span>';

        await db.collection('borrowings').doc(selectedBorrowingForReturn.id).update({
            status: 'pending_return',
            pendingReturnCondition: condition,
            pendingReturnNotes: notes || ''
        });

        showToast('Return request submitted! Awaiting admin approval.', 'success');
        document.getElementById('returnModal').classList.remove('active');

        document.getElementById('condition').value = '';
        document.getElementById('notes').value = '';

        loadBorrowedItems();
        loadHistory();

    } catch (error) {
        console.error('Error submitting return request:', error);
        showToast('Failed to submit return request', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalContent;
    }
}

async function loadHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    try {
        const startDate = document.getElementById('historyStartDate')?.value;
        const endDate = document.getElementById('historyEndDate')?.value;
        const equipmentFilter = document.getElementById('historyEquipmentFilter')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('historyStatusFilter')?.value || 'all';
        const sortValue = document.getElementById('historySort')?.value || 'borrowedAt_desc';

        const snapshot = await db.collection('borrowings')
            .where('userId', '==', currentUser.uid)
            .limit(100)
            .get();

        let history = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (startDate) {
            const start = new Date(startDate);
            history = history.filter(h => h.borrowedAt?.toDate() >= start);
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59);
            history = history.filter(h => h.borrowedAt?.toDate() <= end);
        }

        if (equipmentFilter) {
            history = history.filter(h =>
                (h.equipmentName || '').toLowerCase().includes(equipmentFilter) ||
                (h.equipmentCode || '').toLowerCase().includes(equipmentFilter)
            );
        }

        if (statusFilter !== 'all') {
            history = history.filter(h => h.status === statusFilter);
        }

        const [field, order] = sortValue.split('_');
        history.sort((a, b) => {
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

        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <h3>No history found</h3>
                    <p>Try adjusting your filters or borrow some equipment</p>
                </div>
            `;
        } else {
            const statusLabels = {
                'pending_borrow': 'Pending Approval',
                'pending_return': 'Return Pending',
                'pending_extension': 'Extension Pending',
                'borrowed': 'Borrowed',
                'returned': 'Returned',
                'rejected': 'Rejected'
            };

            historyList.innerHTML = history.map(item => {
                const statusLabel = statusLabels[item.status] || capitalize(item.status);
                return `
                <div class="log-item">
                    <div class="log-item-header">
                        <span class="log-item-title">${item.equipmentName}</span>
                        <span class="history-status ${item.status}">${statusLabel}</span>
                    </div>

                    <div class="log-item-info">
                        <div class="log-field">
                            <span class="log-label">Equipment ID:</span>
                            <span class="log-value">${item.equipmentCode || 'N/A'}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">Borrowed:</span>
                            <span class="log-value">${formatDate(item.borrowedAt)}</span>
                        </div>

                        ${item.returnedAt ? `
                            <div class="log-field">
                                <span class="log-label">Returned:</span>
                                <span class="log-value">${formatDate(item.returnedAt)}</span>
                            </div>
                        ` : `
                            <div class="log-field">
                                <span class="log-label">Due Time:</span>
                                <span class="log-value">${item.expectedReturnTime || 'N/A'}</span>
                            </div>
                        `}

                        <div class="log-field">
                            <span class="log-label">Room:</span>
                            <span class="log-value">${item.room || 'N/A'}</span>
                        </div>
                        <div class="log-field">
                            <span class="log-label">Purpose:</span>
                            <span class="log-value">${item.purpose || 'N/A'}</span>
                        </div>

                        ${item.returnCondition ? `
                            <div class="log-field">
                                <span class="log-label">Return Condition:</span>
                                <span class="log-value">${capitalize(item.returnCondition)}</span>
                            </div>
                        ` : ''}

                        <div class="log-field">
                            <span class="log-label">Status History:</span>
                            <span class="log-value">
                                ${item.wasOverdue ? '<span class="badge" style="background:rgba(239,68,68,0.1); color:var(--danger); font-size:0.7rem; padding: 2px 6px;">WAS OVERDUE</span>' : ''}
                                ${item.hasExtension ? '<span class="badge" style="background:rgba(30,64,175,0.1); color:#1e40af; font-size:0.7rem; padding: 2px 6px;">EXTENDED</span>' : ''}
                                ${!item.wasOverdue && !item.hasExtension ? '<span style="color:var(--text-tertiary); font-size:0.8rem;">Regular</span>' : ''}
                            </span>
                        </div>
                    </div>
                </div>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading history:', error);
        historyList.innerHTML = `
            <div class="empty-state">
                <h3>Error loading history</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

function initializeHistoryExport() {
    const exportBtn = document.getElementById('exportHistoryBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', async () => {
        try {
            const snapshot = await db.collection('borrowings')
                .where('userId', '==', currentUser.uid)
                .orderBy('borrowedAt', 'desc')
                .get();

            const rows = [['Equipment', 'Equipment ID', 'Status', 'Borrowed At', 'Due Time', 'Returned At', 'Return Condition', 'Room', 'Purpose', 'Was Overdue', 'Had Extension']];

            const fmtDate = (ts) => {
                if (!ts || !ts.toDate) return '';
                const d = ts.toDate();
                const pad = n => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };

            snapshot.docs.forEach(doc => {
                const d = doc.data();
                rows.push([
                    d.equipmentName || '',
                    d.equipmentCode || '',
                    d.status || '',
                    fmtDate(d.borrowedAt),
                    d.expectedReturnTime || '',
                    fmtDate(d.returnedAt),
                    d.returnCondition || '',
                    d.room || '',
                    d.purpose || '',
                    d.wasOverdue ? 'Yes' : 'No',
                    d.hasExtension ? 'Yes' : 'No'
                ]);
            });

            const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my-borrowing-history-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('History exported successfully!', 'success');
        } catch (err) {
            console.error('Export error:', err);
            showToast('Failed to export history', 'error');
        }
    });
}



function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const topbarToggle = document.getElementById('topbarToggle');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

    const openSidebar = () => {
        sidebar?.classList.remove('collapsed');
        sidebar?.classList.add('mobile-open');
        sidebarOverlay?.classList.add('active');
    };

    const closeSidebar = () => {
        sidebar?.classList.remove('mobile-open');
        sidebarOverlay?.classList.remove('active');
    };

    const toggleDesktop = () => {
        sidebar?.classList.toggle('collapsed');
    };

    if (topbarToggle) {
        topbarToggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) openSidebar();
            else toggleDesktop();
        });
    }

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', closeSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeSidebar();
    });
}

function initializeProfileDropdown() {
    const profileDropdown = document.getElementById('profileDropdown');
    const profileTrigger = document.getElementById('profileTrigger');
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    const changePassBtn = document.getElementById('changePassBtn');
    const settingsChangePassBtn = document.getElementById('settingsChangePassBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!profileTrigger || !profileDropdown) return;

    profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = profileDropdown.classList.contains('open');
        profileDropdown.classList.toggle('open', !isOpen);
    });

    document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });

    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', () => {
            profileDropdown.classList.remove('open');
            openProfileModal();
        });
    }

    const openChangePw = () => {
        profileDropdown.classList.remove('open');
        openPasswordModal();
    };

    if (changePassBtn) changePassBtn.addEventListener('click', openChangePw);
    if (settingsChangePassBtn) settingsChangePassBtn.addEventListener('click', openChangePw);

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (!await showConfirm({
                title: 'Logout',
                message: 'Are you sure you want to logout of your account?',
                confirmText: 'Logout',
                type: 'danger'
            })) return;

            profileDropdown.classList.remove('open');
            try {
                if (html5QrCode) { try { await html5QrCode.stop(); } catch (e) { } }
                await auth.signOut();
                showToast('Logged out successfully', 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Failed to logout. Please try again.', 'error');
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

function openProfileModal() {
    document.getElementById("profileModal").classList.add("active");

    document.getElementById("profileFirstName").value = currentUserData.firstName || (!currentUserData.lastName ? currentUserData.name : "");
    document.getElementById("profileMiddleInitial").value = currentUserData.middleInitial || "";
    document.getElementById("profileLastName").value = currentUserData.lastName || "";
    document.getElementById("profileEmail").value = currentUser.email || "";
    document.getElementById("profileFacultyId").value = currentUserData.facultyId || "";
    document.getElementById("profileDepartment").value = currentUserData.department || "";

    const yearLevelGroup = document.getElementById("profileYearLevel")?.closest('.form-group');
    if (yearLevelGroup) yearLevelGroup.style.display = 'none';
    const sectionGroup = document.getElementById("profileSection")?.closest('.form-group');
    if (sectionGroup) sectionGroup.style.display = 'none';
    const courseGroup = document.getElementById("profileCourse")?.closest('.form-group');
    if (courseGroup) courseGroup.style.display = 'none';

    document.getElementById("profileMobile").value = currentUserData.mobile || "";
    document.getElementById("profileGender").value = currentUserData.gender || "";
    document.getElementById("profileYearLevel").value = currentUserData.yearLevel || "";
    document.getElementById("profileSection").value = currentUserData.section || "";

    // Reset file input
    const photoInput = document.getElementById("profilePhotoInput");
    if (photoInput) photoInput.value = "";

    // Set initial preview
    const previewContainer = document.getElementById("profileEditAvatarContainer");
    if (previewContainer) {
        if (currentUserData.photoURL) {
            previewContainer.innerHTML = `<img src="${currentUserData.photoURL}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            const initials = getUserInitials(currentUserData.name || "S");
            previewContainer.innerHTML = `<span id="profileEditInitial">${initials}</span>`;
        }
    }
}

function closeProfileModal() {
    document.getElementById("profileModal").classList.remove("active");
}

async function saveProfile() {
    console.log("saveProfile button clicked");

    if (!currentUser) {
        showToast("Error: Current user not identified. Please refresh.", "error");
        return;
    }

    const firstName = document.getElementById("profileFirstName")?.value.trim();
    const middleInitial = document.getElementById("profileMiddleInitial")?.value.trim() || "";
    const lastName = document.getElementById("profileLastName")?.value.trim();

    const mInitial = middleInitial ? `${middleInitial}. ` : '';
    const name = `${firstName} ${mInitial}${lastName}`;

    const email = document.getElementById("profileEmail")?.value;
    const facultyId = document.getElementById("profileFacultyId")?.value;
    const mobile = document.getElementById("profileMobile")?.value;
    const gender = document.getElementById("profileGender")?.value;
    const department = document.getElementById("profileDepartment")?.value;

    const photoInput = document.getElementById("profilePhotoInput");

    const saveBtn = document.querySelector("#profileModal .btn-primary") || document.querySelector("button[onclick='saveProfile()']");

    if (!saveBtn) {
        console.error("Save button not found!");
        return;
    }

    const originalContent = saveBtn.innerHTML;

    try {
        console.log(">>> [STEP 1] Starting saveProfile...");

        if (facultyId && facultyId.length !== 10) {
            showToast("Faculty ID must be exactly 10 characters.", "error");
            return;
        }

        if (mobile && !/^[0-9]{11}$/.test(mobile)) {
            showToast("Mobile number must be exactly 11 digits.", "error");
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerHTML = "<span>Saving...</span>";

        let updateData = {
            name, firstName, middleInitial, lastName, email, mobile, gender, facultyId, department
        };

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
        const dbPromise = db.collection("users").doc(currentUser.uid).update(updateData);
        const dbTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Database update timed out (15s)")), 15000)
        );

        await Promise.race([dbPromise, dbTimeout]);
        console.log(">>> [STEP 9] Firestore update successful.");

        // Update local data
        currentUserData = { ...currentUserData, ...updateData };

        if (email !== currentUser.email) {
            console.log(">>> [STEP 10] Updating Auth email...");
            await currentUser.updateEmail(email);
        }

        updateUserInfo();
        showToast("Profile updated", "success");
        closeProfileModal();
    } catch (err) {
        console.error("!!! [ERROR] Save profile failed:", err);
        showToast("Failed to update profile: " + err.message, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalContent;
    }
}

function previewProfilePhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (typeof window.openImageCropper === 'function') {
            window.openImageCropper({
                file: file,
                title: 'Crop Professor Profile Photo',
                shape: 'circle',
                onCrop: (croppedBase64) => {
                    const previewContainer = document.getElementById("profileEditAvatarContainer");
                    if (previewContainer) {
                        previewContainer.innerHTML = `<img src="${croppedBase64}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                    input._croppedBase64 = croppedBase64;
                },
                onCancel: () => {
                    if (!input._croppedBase64) input.value = "";
                }
            });
        } else {
            const reader = new FileReader();
            reader.onload = function (e) {
                const previewContainer = document.getElementById("profileEditAvatarContainer");
                if (previewContainer) {
                    previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">`;
                }
            };
            reader.readAsDataURL(file);
        }
    }
}

function openPasswordModal() {
    const email = (currentUser && currentUser.email) || (currentUserData && currentUserData.email) || '';
    const hintEl = document.getElementById('profEmailHint');
    if (hintEl && email) {
        hintEl.innerHTML = `Verification code will be sent to <strong>${email}</strong>`;
    }
    document.getElementById("passwordModal").classList.add("active");
}

function closePasswordModal() {
    document.getElementById("passwordModal").classList.remove("active");
}

let profOtpCooldown = null;
async function sendPasswordChangeOtp() {
    const email = (currentUser && currentUser.email) || (currentUserData && currentUserData.email) || '';
    if (!email) {
        showToast("Unable to identify professor email.", "error");
        return;
    }

    const btn = document.getElementById("sendProfOtpBtn");
    const textEl = document.getElementById("sendProfOtpText");

    btn.disabled = true;
    if (textEl) textEl.textContent = "Sending...";

    try {
        const res = await auth.sendPasswordOtp(email);
        showToast(res.message || "Verification code sent to your email!", "success");
        if (res.devCode) {
            showToast(`[DEV MODE] Verification Code: ${res.devCode}`, "info");
            const codeInput = document.getElementById("passwordOtpCodeProf");
            if (codeInput) codeInput.value = res.devCode;
        }

        let seconds = 60;
        if (textEl) textEl.textContent = `Resend (${seconds}s)`;
        clearInterval(profOtpCooldown);
        profOtpCooldown = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(profOtpCooldown);
                btn.disabled = false;
                if (textEl) textEl.textContent = "Resend Code";
            } else {
                if (textEl) textEl.textContent = `Resend (${seconds}s)`;
            }
        }, 1000);
    } catch (err) {
        console.error("Professor OTP error:", err);
        showToast(err.message || "Failed to send code.", "error");
        btn.disabled = false;
        if (textEl) textEl.textContent = "Send Code";
    }
}

async function changePassword() {
    const currentPass = document.getElementById("currentPassword").value;
    const newPass = document.getElementById("newPassword").value;
    const confirmPass = document.getElementById("confirmPassword").value;
    const otpCode = document.getElementById("passwordOtpCodeProf")?.value.trim();

    if (!currentPass || !newPass || !confirmPass) {
        showToast("Please fill in all password fields", "error");
        return;
    }

    if (!otpCode) {
        showToast("Please enter the 6-digit email verification code", "error");
        return;
    }

    if (newPass.length < 6) {
        showToast("New password must be at least 6 characters", "error");
        return;
    }

    if (newPass !== confirmPass) {
        showToast("New passwords do not match", "error");
        return;
    }

    const changePassBtn = document.querySelector("#passwordModal .btn-primary");
    const originalContent = changePassBtn.innerHTML;

    try {
        changePassBtn.disabled = true;
        changePassBtn.innerHTML = "<span>Updating...</span>";

        await currentUser.updatePassword(newPass, currentPass, otpCode);

        showToast("Password updated successfully!", "success");
        closePasswordModal();

        document.getElementById("currentPassword").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("confirmPassword").value = "";
        const otpInput = document.getElementById("passwordOtpCodeProf");
        if (otpInput) otpInput.value = "";

    } catch (err) {
        console.error("Change password error:", err);
        showToast(err.message || "Failed to update password", "error");
    } finally {
        changePassBtn.disabled = false;
        changePassBtn.innerHTML = originalContent;
    }
}

async function startQRScanner() {
    const readerEl = document.getElementById("qr-reader");
    if (!readerEl) return;

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
        showToast("Camera needs HTTPS. Please open using https link.", "error");
        return;
    }

    try {
        if (html5QrCode) {
            try { await html5QrCode.stop(); } catch (e) { }
        } else {
            html5QrCode = new Html5Qrcode("qr-reader");
        }

        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                try { await html5QrCode.stop(); } catch (e) { }
                await processQRCode(decodedText);
            }
        );

    } catch (err) {
        console.error("QR start error:", err);
        showToast("Camera blocked. Check browser permission settings.", "error");
    }
}

async function openExtendModal(borrowingId) {
    try {
        const doc = await db.collection("borrowings").doc(borrowingId).get();
        if (!doc.exists) return;
        const data = { id: doc.id, ...doc.data() };
        selectedBorrowingForExtend = data;

        const extendDetail = document.getElementById("extendDetail");
        extendDetail.innerHTML = `
            <div style="padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md);">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">${data.equipmentName}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Current Due: ${data.expectedReturnTime}</div>
            </div>
        `;

        const newReturnTimeInput = document.getElementById("newReturnTime");
        if (newReturnTimeInput) {
            const date = new Date();
            date.setHours(date.getHours() + 1);
            date.setSeconds(0, 0);

            const hh = String(date.getHours()).padStart(2, "0");
            const mm = String(date.getMinutes()).padStart(2, "0");
            newReturnTimeInput.value = `${hh}:${mm}`;
        }

        document.getElementById("extendModal").classList.add("active");
    } catch (err) {
        console.error(err);
        showToast("Error opening extension modal", "error");
    }
}

async function requestExtension() {
    const newTime = document.getElementById("newReturnTime").value;
    const reason = document.getElementById("extendReason").value;

    if (!newTime) {
        showToast("Please select a new return time", "error");
        return;
    }

    const now = new Date();
    const [hh, mm] = newTime.split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm, 0, 0);

    if (target < now) {
        target.setDate(target.getDate() + 1);
    }

    const diffHours = (target - now) / (1000 * 60 * 60);
    if (diffHours > 3.01) {
        showToast('Maximum time limit is 3 hours from now', 'error');
        return;
    }

    const confirmBtn = document.getElementById("confirmExtend");
    const originalContent = confirmBtn.innerHTML;

    try {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = "<span>Sending...</span>";

        await db.collection("borrowings").doc(selectedBorrowingForExtend.id).update({
            status: "pending_extension",
            requestedReturnTime: newTime,
            extensionReason: reason || "Not specified",
        });

        showToast("Extension request sent! Awaiting admin approval.", "success");
        document.getElementById("extendModal").classList.remove("active");
        document.getElementById("extendReason").value = "";
        loadBorrowedItems();
    } catch (err) {
        console.error(err);
        showToast("Failed to send extension request", "error");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalContent;
    }
}

async function cancelBorrowRequest(borrowingId) {
    if (!await showConfirm({
        title: 'Cancel Request',
        message: 'Are you sure you want to cancel this borrow request?',
        confirmText: 'Cancel Request',
        type: 'danger'
    })) return;
    try {
        console.log("Cancelling Request ID:", borrowingId);
        await db.collection("borrowings").doc(borrowingId).delete();
        showToast("Borrow request cancelled", "success");
        loadBorrowedItems();
    } catch (err) {
        console.error("Cancellation Error Detailed:", err);
        showToast("Error: " + (err.message || "Unknown error"), "error");
    }
}

async function cancelExtensionRequest(borrowingId) {
    if (!await showConfirm({
        title: 'Cancel Extension',
        message: 'Are you sure you want to cancel this extension request?',
        confirmText: 'Cancel Extension',
        type: 'danger'
    })) return;
    try {
        await db.collection("borrowings").doc(borrowingId).update({
            status: "borrowed",
            requestedReturnTime: firebase.firestore.FieldValue.delete(),
            extensionReason: firebase.firestore.FieldValue.delete(),
        });
        showToast("Extension request cancelled", "success");
        loadBorrowedItems();
    } catch (err) {
        console.error(err);
        showToast("Error cancelling extension", "error");
    }
}



window.openBorrowModal = openBorrowModal;
window.openReturnModal = openReturnModal;
window.openExtendModal = openExtendModal;
window.cancelBorrowRequest = cancelBorrowRequest;
window.cancelExtensionRequest = cancelExtensionRequest;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.changePassword = changePassword;
window.previewProfilePhoto = previewProfilePhoto;
window.saveProfile = saveProfile;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;

function loadSettings() {
    console.log("Settings view loaded");
    // Specific settings logic if needed
}

// ═══════════════════════════════════════════════════════════════
// INCIDENT REPORTING SYSTEM
// ═══════════════════════════════════════════════════════════════
let currentUserIncidentId = null;
let userIncidentChatUnsub = null;

function initializeIncidentReporting() {
    const newBtn = document.getElementById('newIncidentBtn');
    if (newBtn) newBtn.addEventListener('click', openNewIncidentForm);

    const backBtn = document.getElementById('backToMyIncidentsBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (userIncidentChatUnsub) { userIncidentChatUnsub(); userIncidentChatUnsub = null; }
            currentUserIncidentId = null;
            loadMyIncidents();
        });
    }

    const sendBtn = document.getElementById('userSendChatBtn');
    const chatInput = document.getElementById('userChatInput');
    if (sendBtn) sendBtn.addEventListener('click', sendUserIncidentMessage);
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendUserIncidentMessage();
        });
    }
}

async function openNewIncidentForm(preselectedBorrowingId = null) {
    // Load currently borrowed equipment for selection
    try {
        // Simple query to strictly fetch by user ID to avoid composite index requirement
        const snapshot = await db.collection('borrowings')
            .where('userId', '==', currentUser.uid)
            .get();

        // Filter valid statuses: strictly 'borrowed' as requested
        const validStatuses = ['borrowed'];
        const borrowings = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(b => validStatuses.includes(b.status))
            .sort((a, b) => {
                const timeA = a.borrowedAt?.toMillis ? a.borrowedAt.toMillis() : 0;
                const timeB = b.borrowedAt?.toMillis ? b.borrowedAt.toMillis() : 0;
                return timeB - timeA;
            })
            .slice(0, 30);

        if (borrowings.length === 0) {
            showToast('You need to have borrowed equipment before reporting an incident.', 'error');
            return;
        }

        const optionsHtml = borrowings.map(b =>
            `<option value="${b.id}" data-name="${b.equipmentName}" data-code="${b.equipmentCode || b.equipmentId || ''}" data-eqid="${b.equipmentId}">${b.equipmentName} (${b.equipmentCode || b.equipmentId || 'N/A'})</option>`
        ).join('');

        const listEl = document.getElementById('myIncidentsList');
        const detailPanel = document.getElementById('userIncidentDetailPanel');
        if (detailPanel) detailPanel.style.display = 'none';

        listEl.innerHTML = `
            <div class="incident-form-card">
                <h3 style="margin-bottom: 1rem;"><i class="fa-solid fa-triangle-exclamation" style="color: var(--danger); margin-right: 0.5rem;"></i>New Incident Report</h3>
                <div class="form-group">
                    <label>Select Equipment</label>
                    <select id="incidentEquipmentSelect" class="form-control" style="width: 100%;">
                        <option value="">— Choose equipment —</option>
                        ${optionsHtml}
                    </select>
                </div>
                <div class="form-group">
                    <label>Describe the damage or issue</label>
                    <textarea id="incidentDescription" rows="5" placeholder="Describe what happened, what is damaged, and the condition of the equipment..." style="width: 100%; resize: vertical;"></textarea>
                </div>
                <div class="form-group">
                    <label>Attach Photo (optional)</label>
                    <input type="file" id="incidentPhoto" accept="image/*" />
                </div>
                <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick="loadMyIncidents()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitIncidentReport()">Submit Report</button>
                </div>
            </div>
        `;

        // Handle pre-selection if provided
        if (preselectedBorrowingId) {
            const select = document.getElementById('incidentEquipmentSelect');
            if (select) {
                select.value = preselectedBorrowingId;
            }
        }
    } catch (error) {
        console.error('Error loading borrowings for incident:', error);
        showToast('Failed to load equipment list', 'error');
    }
}

async function submitIncidentReport() {
    const select = document.getElementById('incidentEquipmentSelect');
    const description = document.getElementById('incidentDescription')?.value.trim();
    const photoInput = document.getElementById('incidentPhoto');

    if (!select?.value) {
        showToast('Please select equipment', 'error');
        return;
    }
    if (!description) {
        showToast('Please describe the incident', 'error');
        return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const equipmentName = selectedOption.dataset.name;
    const equipmentCode = selectedOption.dataset.code;
    const borrowingId = select.value;

    try {
        showToast('Submitting report...', 'info');

        let photoURL = null;
        if (photoInput?.files?.[0]) {
            try {
                photoURL = await resizeImage(photoInput.files[0], 800, 600);
            } catch (e) {
                console.error('Photo resize error:', e);
            }
        }

        const incidentData = {
            reporterId: currentUser.uid,
            reporterName: currentUserData?.name || currentUser.displayName || 'Unknown',
            reporterRole: 'professor',
            reporterEmail: currentUser.email || '',
            reporterId_number: currentUserData?.facultyId || 'N/A',
            borrowingId: borrowingId,
            equipmentName: equipmentName,
            equipmentCode: equipmentCode,
            description: description,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (photoURL) incidentData.photoURL = photoURL;

        const docRef = await db.collection('incidents').add(incidentData);

        // Add initial message
        await db.collection('incidents').doc(docRef.id).collection('messages').add({
            senderId: currentUser.uid,
            senderName: currentUserData?.name || 'User',
            senderRole: 'professor',
            message: `Incident report submitted: ${description.substring(0, 200)}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Incident report submitted successfully!', 'success');
        loadMyIncidents();

    } catch (error) {
        console.error('Error submitting incident:', error);
        showToast('Failed to submit report: ' + error.message, 'error');
    }
}

async function loadMyIncidents() {
    const listEl = document.getElementById('myIncidentsList');
    const detailPanel = document.getElementById('userIncidentDetailPanel');
    if (!listEl) return;

    listEl.style.display = '';
    if (detailPanel) detailPanel.style.display = 'none';

    try {
        // Query only by reporterId to avoid needing a composite index, sort client-side
        const snapshot = await db.collection('incidents')
            .where('reporterId', '==', currentUser.uid)
            .get();

        const incidents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort by createdAt descending
        incidents.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        if (incidents.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <h3>No incident reports</h3>
                    <p>Click "New Report" to report a damaged or defective equipment</p>
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
                <div class="incident-card" onclick="openUserIncidentDetail('${inc.id}')">
                    <div class="incident-card-header">
                        <div>
                            <strong>${inc.equipmentName || 'Unknown'}</strong>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);"> — ${inc.equipmentCode || ''}</span>
                        </div>
                        <span class="badge" style="${statusStyle} padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600;">${statusLabel}</span>
                    </div>
                    <div class="incident-card-body">
                        <p style="margin: 0.25rem 0; color: var(--text-secondary); font-size: 0.85rem;">${dateStr}</p>
                        <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem;">${(inc.description || '').substring(0, 100)}${(inc.description || '').length > 100 ? '...' : ''}</p>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading incidents:', error);
        if (error.code === 'permission-denied' || error.message?.includes('permission')) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <h3>Firestore Rules Update Needed</h3>
                    <p style="max-width: 500px; margin: 0.5rem auto;">The <strong>incidents</strong> collection needs Firestore Security Rules. Go to Firebase Console → Firestore → Rules and add rules for the <code>incidents</code> collection.</p>
                </div>
            `;
        } else {
            listEl.innerHTML = '<div class="empty-state"><h3>Error loading reports</h3></div>';
        }
    }
}

async function openUserIncidentDetail(incidentId) {
    currentUserIncidentId = incidentId;
    const listEl = document.getElementById('myIncidentsList');
    const detailPanel = document.getElementById('userIncidentDetailPanel');
    if (listEl) listEl.style.display = 'none';
    if (detailPanel) detailPanel.style.display = '';

    try {
        const doc = await db.collection('incidents').doc(incidentId).get();
        const inc = { id: doc.id, ...doc.data() };

        const statusEl = document.getElementById('userIncidentStatus');
        const statusLabel = (inc.status || 'pending').replace('_', ' ').toUpperCase();
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-status">${statusLabel}</span>`;

        const infoCard = document.getElementById('userIncidentInfoCard');
        if (infoCard) {
            const dateStr = inc.createdAt?.toDate ? inc.createdAt.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
            infoCard.innerHTML = `
                <div class="incident-info-grid">
                    <div><strong>Equipment:</strong> ${inc.equipmentName} (${inc.equipmentCode || 'N/A'})</div>
                    <div><strong>Date:</strong> ${dateStr}</div>
                    <div><strong>Status:</strong> ${statusLabel}</div>
                </div>
                <div style="margin-top: 0.75rem;">
                    <strong>Description:</strong>
                    <p style="margin: 0.25rem 0; color: var(--text-secondary);">${inc.description || 'No description'}</p>
                </div>
                ${inc.photoURL ? `<div style="margin-top: 0.75rem;"><strong>Photo:</strong><br><img src="${inc.photoURL}" style="max-width: 280px; border-radius: 8px; margin-top: 0.5rem;" /></div>` : ''}
                ${inc.approvedBy ? `<div style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(16,185,129,0.1); border-radius: 8px;"><strong>Approved by:</strong> ${inc.approvedBy}</div>` : ''}
            `;
        }

        // Real-time chat
        if (userIncidentChatUnsub) userIncidentChatUnsub();
        const chatContainer = document.getElementById('userChatMessages');
        userIncidentChatUnsub = db.collection('incidents').doc(incidentId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                if (!chatContainer) return;
                const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                if (messages.length === 0) {
                    chatContainer.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 2rem;">No messages yet.</div>';
                } else {
                    chatContainer.innerHTML = messages.map(msg => {
                        const isMe = msg.senderId === currentUser.uid;
                        const time = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
                        return `
                            <div class="chat-bubble ${isMe ? 'chat-user' : 'chat-admin'}">
                                <div class="chat-sender">${msg.senderName} <span class="chat-role">(${capitalize(msg.senderRole)})</span></div>
                                <div class="chat-text">${msg.message}</div>
                                <div class="chat-time">${time}</div>
                            </div>
                        `;
                    }).join('');
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });

    } catch (error) {
        console.error('Error opening incident detail:', error);
        showToast('Failed to load incident details', 'error');
    }
}

async function sendUserIncidentMessage() {
    if (!currentUserIncidentId) return;
    const input = document.getElementById('userChatInput');
    const message = input?.value.trim();
    if (!message) return;

    try {
        const userRole = currentUserData?.role || 'professor';
        await db.collection('incidents').doc(currentUserIncidentId).collection('messages').add({
            senderId: currentUser.uid,
            senderName: currentUserData?.name || 'User',
            senderRole: userRole,
            message: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
    }
}

window.openUserIncidentDetail = openUserIncidentDetail;
window.submitIncidentReport = submitIncidentReport;
window.loadMyIncidents = loadMyIncidents;
window.openNewIncidentForm = openNewIncidentForm;
window.openImageZoomModal = function(src) { 
    const modal = document.getElementById('imageZoomModal'); 
    const zoomedImage = document.getElementById('zoomedImagePreview'); 
    if (!modal || !zoomedImage || !src) return; 
    zoomedImage.src = src; 
    modal.classList.add('active'); 
    modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); }; 
};
