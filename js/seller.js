/* Smart Device Locker - Multi-Tenant Seller & Super Admin Portal UI Controller (js/seller.js) */

class SellerPortal {
    constructor() {
        this.db = window.db;
        this.api = window.api;
        this.emiEngine = window.emiEngine;
        this.backendDevices = []; // Live devices from backend server
        this.retailersList = [];  // List of shops for Super Admin
        this.quickSearchQuery = '';
        this.tableSearchQuery = '';
        this.selectedDeviceId = localStorage.getItem('tiger_active_device_id') || '';
        this.token = localStorage.getItem('sdl_auth_token') || '';
        this.currentUser = null;
        this.init();
    }

    init() {
        this.setupAuth();
        this.setupTabs();
        this.setupForm();
        this.setupSearch();
        this.setupCommandConsole();
        this.setupShopManagement();

        // Check authentication state
        this.checkAuth();

        // Auto-refresh backend devices every 4 seconds
        setInterval(() => {
            if (this.currentUser) {
                this.loadBackendDevicesAndRender();
                if (this.currentUser.role === 'super_admin') {
                    this.loadRetailersList();
                }
            }
        }, 4000);

        // Listen to FCM commands to keep live feed updated
        window.fcmBus.subscribe((noti) => {
            this.renderLiveFeed();
            this.renderMetrics();
            this.renderAuditLogs();
        });
    }

    getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    // ===== AUTHENTICATION & LOGIN LOGIC =====
    setupAuth() {
        const loginForm = document.getElementById('auth-login-form');
        const logoutBtn = document.getElementById('btn-auth-logout');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const userField = document.getElementById('auth-username');
                const passField = document.getElementById('auth-password');
                const errBox = document.getElementById('auth-error-msg');
                const submitBtn = document.getElementById('btn-auth-submit');

                const username = userField ? userField.value.trim() : '';
                const password = passField ? passField.value.trim() : '';

                if (!username || !password) return;

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
                }

                fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                })
                .then(r => r.json())
                .then(res => {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Login to Portal';
                    }

                    if (res.success && res.token) {
                        this.token = res.token;
                        this.currentUser = res.user;
                        localStorage.setItem('sdl_auth_token', this.token);
                        if (errBox) errBox.style.display = 'none';

                        this.applyUserSession();
                        this.showToast(`Welcome, ${res.user.name || res.user.shopName}!`, 'success');
                    } else {
                        if (errBox) {
                            errBox.textContent = res.message || 'Invalid username or password.';
                            errBox.style.display = 'block';
                        }
                    }
                })
                .catch(err => {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Login to Portal';
                    }
                    if (errBox) {
                        errBox.textContent = 'Server connection error. Please try again.';
                        errBox.style.display = 'block';
                    }
                });
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to sign out?')) {
                    this.logout();
                }
            });
        }
    }

    checkAuth() {
        if (!this.token) {
            this.showLoginModal();
            return;
        }

        fetch('/api/auth/me', {
            headers: this.getAuthHeaders()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success && res.user) {
                this.currentUser = res.user;
                this.applyUserSession();
            } else {
                this.token = '';
                localStorage.removeItem('sdl_auth_token');
                this.showLoginModal();
            }
        })
        .catch(() => {
            // Offline or server start: prompt login
            this.showLoginModal();
        });
    }

    showLoginModal() {
        const modal = document.getElementById('auth-modal-container');
        if (modal) modal.style.display = 'flex';

        const userBadge = document.getElementById('user-badge-display');
        const logoutBtn = document.getElementById('btn-auth-logout');
        const shopsTab = document.getElementById('nav-tab-shops');

        if (userBadge) userBadge.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (shopsTab) shopsTab.style.display = 'none';
    }

    applyUserSession() {
        const modal = document.getElementById('auth-modal-container');
        if (modal) modal.style.display = 'none';

        const userBadge = document.getElementById('user-badge-display');
        const userDisplayName = document.getElementById('user-display-name');
        const userRoleIcon = document.getElementById('user-role-icon');
        const logoutBtn = document.getElementById('btn-auth-logout');
        const shopsTab = document.getElementById('nav-tab-shops');

        if (this.currentUser) {
            if (userBadge && userDisplayName) {
                userBadge.style.display = 'inline-flex';
                if (this.currentUser.role === 'super_admin') {
                    userBadge.className = 'user-profile-badge super-admin';
                    userDisplayName.textContent = `👑 Master Admin (${this.currentUser.username})`;
                    if (userRoleIcon) userRoleIcon.className = 'fa-solid fa-crown';
                    if (shopsTab) shopsTab.style.display = 'inline-flex';
                    this.loadRetailersList();
                } else {
                    userBadge.className = 'user-profile-badge';
                    userDisplayName.textContent = `🏪 ${this.currentUser.shopName} (${this.currentUser.name})`;
                    if (userRoleIcon) userRoleIcon.className = 'fa-solid fa-store';
                    if (shopsTab) shopsTab.style.display = 'none';
                }
            }
            if (logoutBtn) logoutBtn.style.display = 'inline-flex';

            this.loadBackendDevicesAndRender();
        }
    }

    logout() {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: this.getAuthHeaders()
        }).finally(() => {
            this.token = '';
            this.currentUser = null;
            localStorage.removeItem('sdl_auth_token');
            this.showLoginModal();
            this.showToast('Logged out successfully.', 'info');
        });
    }

    // ===== SUPER ADMIN: SHOP / RETAILER MANAGEMENT =====
    setupShopManagement() {
        const createForm = document.getElementById('create-retailer-form');
        const refreshBtn = document.getElementById('btn-refresh-shops');

        if (createForm) {
            createForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const shopName = document.getElementById('new-shop-name').value.trim();
                const ownerName = document.getElementById('new-owner-name').value.trim();
                const phone = document.getElementById('new-shop-phone').value.trim();
                const username = document.getElementById('new-shop-username').value.trim();
                const password = document.getElementById('new-shop-password').value.trim();

                if (!shopName || !username || !password) return;

                fetch('/api/admin/retailers', {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify({ shopName, name: ownerName, phone, username, password })
                })
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        this.showToast(`✅ Shop "${shopName}" created! Login: ${username}`, 'success');
                        createForm.reset();
                        this.loadRetailersList();
                    } else {
                        this.showToast(`Error: ${res.message || 'Could not create shop'}`, 'danger');
                    }
                })
                .catch(err => {
                    console.error('Create retailer error:', err);
                    this.showToast('Network error while creating shop account.', 'danger');
                });
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadRetailersList();
                this.showToast('Shop accounts list refreshed.', 'info');
            });
        }
    }

    loadRetailersList() {
        if (!this.currentUser || this.currentUser.role !== 'super_admin') return;

        fetch('/api/admin/retailers', {
            headers: this.getAuthHeaders()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success && Array.isArray(res.retailers)) {
                this.retailersList = res.retailers;
                this.renderRetailersTable();
            }
        })
        .catch(err => console.error('Error fetching retailers:', err));
    }

    renderRetailersTable() {
        const tbody = document.getElementById('retailers-table-body');
        const statTotalShops = document.getElementById('stat-total-shops');
        const statShopsTotalDevices = document.getElementById('stat-shops-total-devices');

        if (statTotalShops) statTotalShops.textContent = this.retailersList.length;

        const totalNetworkDevices = this.retailersList.reduce((sum, r) => sum + (r.deviceCount || 0), 0);
        if (statShopsTotalDevices) statShopsTotalDevices.textContent = totalNetworkDevices;

        if (!tbody) return;

        if (!this.retailersList.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:20px;">No retailer shop accounts created yet. Use form above to create one.</td></tr>';
            return;
        }

        tbody.innerHTML = this.retailersList.map(r => {
            const isBlocked = r.status === 'blocked';
            const statusBadge = isBlocked ? '<span class="badge badge-danger">🔴 Blocked</span>' : '<span class="badge badge-success">🟢 Active</span>';

            return `
                <tr>
                    <td>
                        <strong style="color:var(--primary);">${r.shopName}</strong><br>
                        <small style="color:var(--text-muted); font-size:11px;">ID: ${r.id}</small>
                    </td>
                    <td>
                        <strong>${r.name || 'Owner'}</strong><br>
                        <small style="color:var(--text-muted);"><i class="fa-solid fa-phone"></i> ${r.phone || 'N/A'}</small>
                    </td>
                    <td><code>${r.username}</code></td>
                    <td><code style="color:#f59e0b; font-weight:700;">${r.password}</code></td>
                    <td>
                        <strong>${r.pairedCount || 0}</strong> Active <br>
                        <small style="color:var(--text-muted);">(${r.deviceCount || 0} Total)</small>
                    </td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            ${isBlocked 
                                ? `<button class="btn btn-sm btn-success" title="Unblock Shop" onclick="sellerPortal.toggleRetailerStatus('${r.id}', 'active')"><i class="fa-solid fa-check"></i> Activate</button>`
                                : `<button class="btn btn-sm btn-warning" title="Block Shop Access" onclick="sellerPortal.toggleRetailerStatus('${r.id}', 'blocked')"><i class="fa-solid fa-ban"></i> Block</button>`
                            }
                            <button class="btn btn-sm btn-danger" title="Delete Shop Account" onclick="sellerPortal.deleteRetailerAccount('${r.id}', '${(r.shopName || '').replace(/'/g, "\\'")}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    toggleRetailerStatus(retailerId, newStatus) {
        fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                this.showToast(`Shop account marked as ${newStatus}!`, 'success');
                this.loadRetailersList();
            } else {
                this.showToast(res.message || 'Update failed.', 'warning');
            }
        })
        .catch(err => console.error('Status update error:', err));
    }

    deleteRetailerAccount(retailerId, shopName) {
        if (!confirm(`⚠️ Are you sure you want to permanently delete shop account: "${shopName}"?`)) return;

        fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                this.showToast(`🗑️ Shop account "${shopName}" deleted.`, 'danger');
                this.loadRetailersList();
            } else {
                this.showToast(res.message || 'Delete failed.', 'warning');
            }
        })
        .catch(err => console.error('Delete retailer error:', err));
    }

    // ===== SEARCH & CONSOLE SETUP =====
    setupSearch() {
        const quickInput = document.getElementById('quick-search-device');
        const clearQuickBtn = document.getElementById('btn-clear-quick-search');
        if (quickInput) {
            quickInput.addEventListener('input', (e) => {
                this.quickSearchQuery = (e.target.value || '').trim().toLowerCase();
                this.renderDeviceDropdownFromBackend();
            });
        }
        if (clearQuickBtn && quickInput) {
            clearQuickBtn.addEventListener('click', () => {
                quickInput.value = '';
                this.quickSearchQuery = '';
                this.renderDeviceDropdownFromBackend();
            });
        }

        const tableSearchInput = document.getElementById('search-device');
        if (tableSearchInput) {
            tableSearchInput.addEventListener('input', (e) => {
                this.tableSearchQuery = (e.target.value || '').trim().toLowerCase();
                this.renderDevicesTableFromBackend();
            });
        }

        // Attach permanent dropdown change listener once
        const select = document.getElementById('active-device-select');
        if (select) {
            select.addEventListener('change', () => {
                this.selectedDeviceId = select.value;
                localStorage.setItem('tiger_active_device_id', this.selectedDeviceId);
                this.updateQuickConsoleInfoFromBackend();
            });
        }
    }

    // Load devices from backend server API (Filtered automatically by Shop)
    loadBackendDevicesAndRender() {
        if (!this.currentUser) return;

        fetch('/api/devices', {
            headers: this.getAuthHeaders()
        })
        .then(r => r.json())
        .then(devices => {
            this.backendDevices = Array.isArray(devices) ? devices : [];
            this.renderDeviceDropdownFromBackend();
            this.renderDevicesTableFromBackend();
            this.renderMetrics();
        })
        .catch(() => {
            this.renderDeviceDropdown();
            this.renderDevicesTable();
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.seller-nav .nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const targetId = tab.dataset.tab;
                const contentEl = document.getElementById(targetId);
                if (contentEl) contentEl.classList.add('active');
            });
        });
    }

    renderAll() {
        this.renderMetrics();
        this.renderLiveFeed();
        this.renderDeviceDropdown();
        this.renderDevicesTable();
        this.renderEmiTable();
        this.renderAuditLogs();
        if (window.i18n) window.i18n.applyLanguage(window.i18n.currentLang);
    }

    renderMetrics() {
        // ONLY count PAIRED devices
        const allDevices = this.backendDevices.length ? this.backendDevices : this.db.getDevices();
        const devices = allDevices.filter(d => d.isPaired);
        const emiPlans = this.db.getEmiPlans();

        const total = devices.length;
        const active = devices.filter(d => (!d.isLocked && d.isPaired)).length;
        const locked = devices.filter(d => d.isLocked).length;

        const overdueTotal = emiPlans
            .filter(e => e.status === 'OVERDUE')
            .reduce((sum, e) => sum + e.amount, 0);

        const elTotal = document.getElementById('stat-total-devices');
        const elActive = document.getElementById('stat-active-devices');
        const elLocked = document.getElementById('stat-locked-devices');
        const elPending = document.getElementById('stat-pending-emi');

        if (elTotal) elTotal.textContent = total;
        if (elActive) elActive.textContent = active;
        if (elLocked) elLocked.textContent = locked;
        if (elPending) elPending.textContent = `₹${overdueTotal.toLocaleString('en-IN')}`;
    }

    renderLiveFeed() {
        const feedContainer = document.getElementById('live-command-feed');
        if (!feedContainer) return;

        const commands = this.db.getCommands();
        if (commands.length === 0) {
            feedContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">No Command History</div>';
            return;
        }

        feedContainer.innerHTML = commands.slice(0, 10).map(cmd => {
            let iconClass = 'pair';
            let label = cmd.type;
            if (cmd.type === 'LOCK_DEVICE' || cmd.type === 'LOCK') { iconClass = 'lock'; label = '🔒 Remotely Locked'; }
            else if (cmd.type === 'UNLOCK_DEVICE' || cmd.type === 'UNLOCK') { iconClass = 'unlock'; label = '🔓 Remotely Unlocked'; }
            else if (cmd.type === 'SHOW_MESSAGE' || cmd.type === 'MESSAGE') { iconClass = 'msg'; label = '💬 Message Sent'; }
            else if (cmd.type === 'PLAY_SOUND' || cmd.type === 'SIREN_ON') { iconClass = 'sound'; label = '🔊 Siren Played'; }

            const timeStr = new Date(cmd.timestamp).toLocaleTimeString();

            return `
                <div class="feed-item">
                    <div class="feed-left">
                        <div class="feed-icon ${iconClass}">
                            <i class="fa-solid ${cmd.type === 'LOCK_DEVICE' || cmd.type === 'LOCK' ? 'fa-lock' : cmd.type === 'UNLOCK_DEVICE' || cmd.type === 'UNLOCK' ? 'fa-lock-open' : 'fa-bolt'}"></i>
                        </div>
                        <div class="feed-details">
                            <strong>${label}</strong>
                            <span>IMEI / Target: <code>${cmd.imei || cmd.deviceId || '-'}</code> - ${cmd.payload || ''}</span>
                        </div>
                    </div>
                    <div class="feed-time">${timeStr}</div>
                </div>
            `;
        }).join('');
    }

    renderDeviceDropdown() {
        const select = document.getElementById('active-device-select');
        if (!select) return;
        const devices = this.db.getDevices().filter(d => d.isPaired);
        const customers = this.db.getCustomers();
        select.innerHTML = devices.map(d => {
            const cust = customers.find(c => c.id === d.customerId);
            const custName = cust ? cust.name : 'Unknown';
            return `<option value="${d.imei}">${custName} (${d.model} - ${d.status})</option>`;
        }).join('');
        this.updateQuickConsoleInfo();
        select.addEventListener('change', () => this.updateQuickConsoleInfo());
    }

    // Dropdown populated directly from backend API devices with Search Filter (ONLY PAIRED DEVICES)
    renderDeviceDropdownFromBackend() {
        const select = document.getElementById('active-device-select');
        if (!select) return;

        // STRICT: ONLY show paired devices
        let devices = this.backendDevices.filter(d => d.isPaired);
        if (!devices.length) {
            select.innerHTML = '<option value="">-- No paired devices yet --</option>';
            const controlBtn = document.getElementById('btn-open-dedicated-control');
            if (controlBtn) {
                controlBtn.removeAttribute('href');
                controlBtn.innerHTML = `<i class="fa-solid fa-up-right-from-square"></i> <span>No Paired Devices Connected</span>`;
            }
            return;
        }

        // Apply quick search query if present
        if (this.quickSearchQuery) {
            devices = devices.filter(d => {
                const name = (d.customerName || '').toLowerCase();
                const phone = (d.customerPhone || '').toLowerCase();
                const imei = (d.imei || '').toLowerCase();
                const id = (d.id || '').toLowerCase();
                const model = (d.model || '').toLowerCase();
                return name.includes(this.quickSearchQuery) || 
                       phone.includes(this.quickSearchQuery) || 
                       imei.includes(this.quickSearchQuery) || 
                       id.includes(this.quickSearchQuery) || 
                       model.includes(this.quickSearchQuery);
            });
        }

        if (!devices.length) {
            select.innerHTML = `<option value="">-- No matches for "${this.quickSearchQuery}" --</option>`;
            return;
        }

        const optionsHtml = devices.map(d => {
            const statusLabel = d.isLocked ? '🔒 Locked' : '🟢 Active';
            const shopLabel = (this.currentUser && this.currentUser.role === 'super_admin' && d.shopName) ? ` [${d.shopName}]` : '';
            return `<option value="${d.id}">[${d.id}] ${d.customerName} — ${d.model}${shopLabel} (${statusLabel})</option>`;
        }).join('');

        if (select.innerHTML !== optionsHtml) {
            select.innerHTML = optionsHtml;
        }

        let targetId = this.selectedDeviceId;
        if (!targetId || !devices.find(d => d.id === targetId)) {
            targetId = devices[0].id;
        }

        this.selectedDeviceId = targetId;
        select.value = targetId;

        this.updateQuickConsoleInfoFromBackend();
    }

    selectDeviceForConsole(deviceId) {
        this.selectedDeviceId = deviceId;
        localStorage.setItem('tiger_active_device_id', deviceId);

        document.querySelectorAll('.seller-nav .nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const dashTabBtn = document.querySelector('[data-tab="tab-dashboard"]');
        if (dashTabBtn) dashTabBtn.classList.add('active');
        const dashTab = document.getElementById('tab-dashboard');
        if (dashTab) dashTab.classList.add('active');

        const quickInput = document.getElementById('quick-search-device');
        if (quickInput) quickInput.value = '';
        this.quickSearchQuery = '';
        this.renderDeviceDropdownFromBackend();

        const select = document.getElementById('active-device-select');
        if (select) {
            select.value = deviceId;
            this.updateQuickConsoleInfoFromBackend();
            select.scrollIntoView({ behavior: 'smooth', block: 'center' });
            select.style.boxShadow = '0 0 15px rgba(255, 107, 0, 0.8)';
            setTimeout(() => { select.style.boxShadow = ''; }, 2000);
        }
        this.showToast(`Selected device [${deviceId}] for Remote Console`, 'info');
    }

    updateQuickConsoleInfo() {
        const select = document.getElementById('active-device-select');
        if (!select || !select.value) return;
        const imei = select.value;
        const dev = this.db.getDeviceByImei(imei);
        if (!dev) return;
        const cust = this.db.getCustomers().find(c => c.id === dev.customerId);
        const nameEl = document.getElementById('quick-cust-name');
        const imeiEl = document.getElementById('quick-cust-imei');
        const statusBadge = document.getElementById('quick-cust-status');
        if (nameEl) nameEl.textContent = cust ? cust.name : 'Unknown';
        if (imeiEl) imeiEl.textContent = dev.imei;
        if (statusBadge) {
            statusBadge.textContent = dev.status;
            statusBadge.className = `badge ${dev.status === 'ACTIVE' ? 'badge-success' : dev.status === 'LOCKED' ? 'badge-danger' : 'badge-warning'}`;
        }
    }

    updateQuickConsoleInfoFromBackend() {
        const select = document.getElementById('active-device-select');
        if (!select || !select.value) return;
        const deviceId = select.value;
        const dev = this.backendDevices.find(d => d.id === deviceId);
        if (!dev) return;

        const nameEl = document.getElementById('quick-cust-name');
        const imeiEl = document.getElementById('quick-cust-imei');
        const statusBadge = document.getElementById('quick-cust-status');

        if (nameEl) nameEl.textContent = dev.customerName || 'Unknown';
        if (imeiEl) imeiEl.textContent = dev.imei || dev.id;

        if (statusBadge) {
            const statusText = dev.isLocked ? 'LOCKED' : dev.isPaired ? 'ACTIVE' : 'UNPAIRED';
            statusBadge.textContent = statusText;
            statusBadge.className = `badge ${dev.isLocked ? 'badge-danger' : dev.isPaired ? 'badge-success' : 'badge-warning'}`;
        }

        const controlBtn = document.getElementById('btn-open-dedicated-control');
        if (controlBtn) {
            controlBtn.href = `control.html?id=${encodeURIComponent(deviceId)}`;
            controlBtn.innerHTML = `<i class="fa-solid fa-up-right-from-square"></i> <span>Open Full Control Page for ${dev.customerName || deviceId}</span>`;
        }
    }

    sendBackendCommand(deviceId, action, message) {
        const url = `/api/devices/${encodeURIComponent(deviceId)}/command`;
        fetch(url, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ action, message: message || '' })
        })
        .then(r => r.json())
        .then(result => {
            console.log(`[CMD] ${action} → ${deviceId}:`, result);
            setTimeout(() => this.loadBackendDevicesAndRender(), 500);
        })
        .catch(e => console.error('Command error:', e));
    }

    setupCommandConsole() {
        const getSelectedDeviceId = () => document.getElementById('active-device-select').value;

        const btnLock = document.getElementById('cmd-lock');
        const btnUnlock = document.getElementById('cmd-unlock');
        const btnMsg = document.getElementById('cmd-msg');
        const btnSound = document.getElementById('cmd-sound');
        const btnInfo = document.getElementById('cmd-info');
        const btnWipe = document.getElementById('cmd-wipe');

        if (btnLock) {
            btnLock.addEventListener('click', () => {
                const deviceId = getSelectedDeviceId();
                if (!deviceId) return this.showToast('Please select a device first!', 'warning');
                this.sendBackendCommand(deviceId, 'LOCK', 'Device access restricted due to pending EMI.');
                this.showToast(`🔒 Lock Command sent to [${deviceId}]!`, 'danger');
            });
        }

        if (btnUnlock) {
            btnUnlock.addEventListener('click', () => {
                const deviceId = getSelectedDeviceId();
                if (!deviceId) return this.showToast('Please select a device first!', 'warning');
                this.sendBackendCommand(deviceId, 'UNLOCK');
                this.showToast(`🔓 Unlock Command sent to [${deviceId}]!`, 'success');
            });
        }

        if (btnMsg) {
            btnMsg.addEventListener('click', () => {
                const deviceId = getSelectedDeviceId();
                if (!deviceId) return this.showToast('Please select a device first!', 'warning');
                const customMsg = prompt('Enter message to display on phone screen:', 'Dear Customer, your EMI installment is due. Please pay today.');
                if (customMsg !== null && customMsg.trim() !== '') {
                    this.sendBackendCommand(deviceId, 'MESSAGE', customMsg.trim());
                    this.showToast(`💬 Message sent to [${deviceId}]!`, 'info');
                }
            });
        }

        if (btnSound) {
            btnSound.addEventListener('click', () => {
                const deviceId = getSelectedDeviceId();
                if (!deviceId) return this.showToast('Please select a device first!', 'warning');
                const dev = this.backendDevices.find(d => d.id === deviceId);
                if (dev && dev.sirenActive) {
                    this.sendBackendCommand(deviceId, 'STOP_SIREN');
                    this.showToast(`🔇 Siren Stopped on [${deviceId}]!`, 'info');
                } else {
                    this.sendBackendCommand(deviceId, 'SIREN');
                    this.showToast(`🔊 Siren Triggered on [${deviceId}]!`, 'warning');
                }
            });
        }

        if (btnInfo) {
            btnInfo.addEventListener('click', () => {
                const deviceId = getSelectedDeviceId();
                if (!deviceId) return this.showToast('Please select a device first!', 'warning');
                const dev = this.backendDevices.find(d => d.id === deviceId);
                if (dev) {
                    alert(`[DEVICE STATUS]\nCustomer: ${dev.customerName}\nShop: ${dev.shopName || 'Main'}\nIMEI: ${dev.imei}\nModel: ${dev.model}\nStatus: ${dev.isLocked ? 'LOCKED' : 'ACTIVE'}\nBattery: ${dev.battery}%\nNetwork: ${dev.network}\nLast Seen: ${new Date(dev.lastSeen).toLocaleString()}`);
                }
            });
        }

        if (btnWipe) {
            btnWipe.addEventListener('click', () => {
                const deviceId = getSelectedDeviceId();
                if (!deviceId) return this.showToast('Please select a device first!', 'warning');
                if (confirm('⚠️ Are you sure? This will send Remote Wipe command to the device!')) {
                    this.sendBackendCommand(deviceId, 'WIPE');
                    this.showToast('⚠️ Remote Wipe command dispatched!', 'danger');
                }
            });
        }
    }

    setupForm() {
        const form = document.getElementById('add-device-form');
        const totalPriceInput = document.getElementById('input-total-price');
        const downPaymentInput = document.getElementById('input-down-payment');
        const tenureSelect = document.getElementById('input-emi-tenure');
        const monthlyEmiInput = document.getElementById('input-monthly-emi');

        if (!form) return;

        const updateEmiCalculation = () => {
            const total = Number(totalPriceInput.value) || 0;
            const down = Number(downPaymentInput.value) || 0;
            const months = Number(tenureSelect.value) || 6;
            const emi = this.emiEngine.calculateMonthlyEmi(total, down, months);
            if (monthlyEmiInput) monthlyEmiInput.value = `₹${emi.toLocaleString('en-IN')} / month`;
        };

        if (totalPriceInput) totalPriceInput.addEventListener('input', updateEmiCalculation);
        if (downPaymentInput) downPaymentInput.addEventListener('input', updateEmiCalculation);
        if (tenureSelect) tenureSelect.addEventListener('change', updateEmiCalculation);

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const custName = document.getElementById('input-cust-name').value;
            const custPhone = document.getElementById('input-cust-phone').value;
            const custKyc = document.getElementById('input-cust-kyc').value;

            const devModel = document.getElementById('input-dev-model').value;
            const devImei = document.getElementById('input-dev-imei').value;

            const totalPrice = Number(totalPriceInput.value);
            const downPayment = Number(downPaymentInput.value);
            const tenure = Number(tenureSelect.value);
            const monthlyEmi = this.emiEngine.calculateMonthlyEmi(totalPrice, downPayment, tenure);

            // Call Backend /api/devices/register with Auth Headers
            fetch('/api/devices/register', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    customerName: custName,
                    customerPhone: custPhone,
                    model: devModel,
                    imei: devImei,
                    totalAmount: totalPrice,
                    downPayment: downPayment,
                    monthlyEmi: monthlyEmi,
                    tenureMonths: tenure
                })
            })
            .then(r => r.json())
            .then(res => {
                if (res.success && res.device) {
                    const otpCode = res.device.pairCode;
                    const modalResult = document.getElementById('pairing-modal-result');
                    const codeDisplay = document.getElementById('generated-otp-code');
                    const qrDisplay = document.getElementById('generated-qr-code');

                    if (modalResult) modalResult.classList.remove('hidden');
                    if (codeDisplay) codeDisplay.textContent = otpCode;
                    if (qrDisplay) {
                        qrDisplay.innerHTML = `
                            <svg viewBox="0 0 100 100" width="120" height="120">
                                <rect width="100" height="100" fill="white"/>
                                <path d="M10 10h30v30h-30z M15 15h20v20h-20z M60 10h30v30h-30z M65 15h20v20h-20z M10 60h30v30h-30z M15 65h20v20h-20z M45 10h10v10h-10z M45 30h10v10h-10z M45 60h10v10h-10z M60 60h15v15h-15z M75 75h15v15h-15z M60 80h10v10h-10z" fill="black"/>
                            </svg>
                        `;
                    }

                    this.showToast(`New Device Enrolled! Pairing Code: ${otpCode}`, 'success');
                    this.loadBackendDevicesAndRender();
                } else {
                    this.showToast(`Failed: ${res.message || 'Error registering device'}`, 'warning');
                }
            })
            .catch(err => {
                console.error('Register error:', err);
                this.showToast('Network error while registering device.', 'danger');
            });
        });
    }

    renderDevicesTable() {
        const tbody = document.getElementById('devices-table-body');
        if (!tbody) return;

        const devices = this.db.getDevices().filter(d => d.isPaired);
        const customers = this.db.getCustomers();

        tbody.innerHTML = devices.map(d => {
            const cust = customers.find(c => c.id === d.customerId);
            const custName = cust ? cust.name : 'N/A';
            const custPhone = cust ? cust.phone : 'N/A';

            return `
                <tr>
                    <td><code>${d.imei}</code></td>
                    <td><strong>${custName}</strong><br><small style="color:var(--text-muted);">${custPhone}</small></td>
                    <td>${d.model}</td>
                    <td>₹${d.monthlyEmi.toLocaleString()}/mo (${d.tenure}M)</td>
                    <td>
                        <span class="badge ${d.status === 'ACTIVE' ? 'badge-success' : d.status === 'LOCKED' ? 'badge-danger' : 'badge-warning'}">
                            ${d.status}
                        </span>
                    </td>
                    <td><small class="font-mono">${new Date(d.lastPing).toLocaleTimeString()}</small></td>
                    <td>
                        ${d.status === 'LOCKED' 
                            ? `<button class="btn btn-sm btn-success" onclick="api.sendDeviceCommand('${d.imei}', 'UNLOCK_DEVICE'); sellerPortal.showToast('Unlocked!', 'success');">Unlock</button>`
                            : `<button class="btn btn-sm btn-danger" onclick="api.sendDeviceCommand('${d.imei}', 'LOCK_DEVICE', 'Manual Seller Lock'); sellerPortal.showToast('Locked!', 'danger');">Lock</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Devices table populated from backend API (STRICT: ONLY PAIRED DEVICES)
    renderDevicesTableFromBackend() {
        const tbody = document.getElementById('devices-table-body');
        if (!tbody) return;

        // ONLY paired devices
        let devices = this.backendDevices.filter(d => d.isPaired);
        if (!devices.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:20px;">No active paired devices yet. Paired phones will appear here once connected.</td></tr>';
            return;
        }

        // Apply table search query
        if (this.tableSearchQuery) {
            devices = devices.filter(d => {
                const name = (d.customerName || '').toLowerCase();
                const phone = (d.customerPhone || '').toLowerCase();
                const imei = (d.imei || '').toLowerCase();
                const id = (d.id || '').toLowerCase();
                const model = (d.model || '').toLowerCase();
                const shop = (d.shopName || '').toLowerCase();
                return name.includes(this.tableSearchQuery) || 
                       phone.includes(this.tableSearchQuery) || 
                       imei.includes(this.tableSearchQuery) || 
                       id.includes(this.tableSearchQuery) || 
                       model.includes(this.tableSearchQuery) ||
                       shop.includes(this.tableSearchQuery);
            });
        }

        if (!devices.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:20px;">No devices found matching "${this.tableSearchQuery}"</td></tr>`;
            return;
        }

        tbody.innerHTML = devices.map(d => {
            const statusText = d.isLocked ? 'LOCKED' : 'ACTIVE';
            const statusClass = d.isLocked ? 'badge-danger' : 'badge-success';
            const onlineIcon = d.isOnline ? '🟢 Online' : '⚪ Standby';
            const lastSeenStr = d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : 'N/A';
            const isSirenOn = !!d.sirenActive;
            const shopBadge = (this.currentUser && this.currentUser.role === 'super_admin' && d.shopName) ? `<br><small style="color:#38bdf8;"><i class="fa-solid fa-store"></i> ${d.shopName}</small>` : '';

            return `
                <tr>
                    <td>
                        <strong style="color:var(--primary);">${d.id}</strong><br>
                        <code style="font-size:11px;">${d.imei || 'No IMEI'}</code>
                        ${shopBadge}
                    </td>
                    <td>
                        <strong>${d.customerName || 'N/A'}</strong><br>
                        <small style="color:var(--text-muted);"><i class="fa-solid fa-phone"></i> ${d.customerPhone || ''}</small><br>
                        <small style="color:var(--primary);"><i class="fa-solid fa-key"></i> Code: <strong>${d.pairCode || '-'}</strong></small>
                    </td>
                    <td>
                        <strong>${d.model || 'Android'}</strong><br>
                        <small class="font-mono">${onlineIcon}</small>
                    </td>
                    <td>₹${(d.monthlyEmi || 0).toLocaleString()}/mo (${d.tenureMonths || '?'}M)</td>
                    <td>
                        <span class="badge ${statusClass}">
                            ${statusText}
                        </span>
                        ${isSirenOn ? '<br><span class="badge badge-warning" style="animation:pulse 1s infinite;"><i class="fa-solid fa-bell"></i> Siren ON</span>' : ''}
                    </td>
                    <td><small class="font-mono">${lastSeenStr}</small></td>
                    <td>
                        <div style="display:flex; flex-wrap:wrap; gap:4px;">
                            <a href="control.html?id=${encodeURIComponent(d.id)}" class="btn btn-sm btn-primary" title="Open Dedicated Single-Device Control Page" style="text-decoration:none;">
                                <i class="fa-solid fa-up-right-from-square"></i> Open Control Page
                            </a>

                            ${d.isLocked
                                ? `<button class="btn btn-sm btn-success" title="Unlock Device" onclick="sellerPortal.sendBackendCommand('${d.id}', 'UNLOCK'); sellerPortal.showToast('Unlocked [${d.id}]!', 'success');"><i class="fa-solid fa-lock-open"></i> Unlock</button>`
                                : `<button class="btn btn-sm btn-danger" title="Lock Device" onclick="sellerPortal.sendBackendCommand('${d.id}', 'LOCK', 'Device Locked due to Overdue EMI'); sellerPortal.showToast('Locked [${d.id}]!', 'danger');"><i class="fa-solid fa-lock"></i> Lock</button>`
                            }

                            ${isSirenOn
                                ? `<button class="btn btn-sm btn-dark" title="Turn Siren OFF" onclick="sellerPortal.sendBackendCommand('${d.id}', 'SIREN_OFF'); sellerPortal.showToast('Siren Stopped [${d.id}]', 'info');"><i class="fa-solid fa-volume-xmark"></i> Siren OFF</button>`
                                : `<button class="btn btn-sm btn-warning" title="Play Siren Alarm" onclick="sellerPortal.sendBackendCommand('${d.id}', 'SIREN_ON'); sellerPortal.showToast('Siren Triggered [${d.id}]!', 'warning');"><i class="fa-solid fa-volume-high"></i> Siren</button>`
                            }

                            <button class="btn btn-sm btn-danger" style="background:#dc2626; color:#fff;" title="Delete Device from System" onclick="sellerPortal.confirmDeleteDevice('${d.id}', '${(d.customerName || '').replace(/'/g, "\\'")}')">
                                <i class="fa-solid fa-trash-can"></i> Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    confirmDeleteDevice(deviceId, customerName) {
        const displayName = customerName ? `${customerName} (${deviceId})` : deviceId;
        const confirmed = confirm(`⚠️ Are you sure you want to permanently DELETE device: ${displayName}?\n\nThis will remove it from database.`);
        if (!confirmed) return;

        fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                this.showToast(`🗑️ Device ${deviceId} deleted successfully!`, 'danger');
                if (this.selectedDeviceId === deviceId) {
                    this.selectedDeviceId = '';
                    localStorage.removeItem('tiger_active_device_id');
                }
                this.loadBackendDevicesAndRender();
            } else {
                this.showToast(`Failed to delete: ${res.message || 'Unknown error'}`, 'warning');
            }
        })
        .catch(err => {
            console.error('Delete error:', err);
            this.showToast('Network error while deleting device.', 'danger');
        });
    }

    renderEmiTable() {
        const tbody = document.getElementById('emi-table-body');
        if (!tbody) return;

        const emiPlans = this.db.getEmiPlans();

        tbody.innerHTML = emiPlans.map(e => {
            return `
                <tr>
                    <td><strong>#${e.installmentNo}</strong></td>
                    <td>${e.custName}<br><small style="color:var(--text-muted);">${e.imei}</small></td>
                    <td><strong>₹${e.amount.toLocaleString()}</strong></td>
                    <td>${e.dueDate}</td>
                    <td>
                        <span class="badge ${e.status === 'PAID' ? 'badge-success' : e.status === 'OVERDUE' ? 'badge-danger' : 'badge-warning'}">
                            ${e.status}
                        </span>
                    </td>
                    <td>
                        ${e.status !== 'PAID'
                            ? `<button class="btn btn-sm btn-primary" onclick="api.processEmiPayment('${e.id}'); sellerPortal.renderAll(); sellerPortal.showToast('Payment Processed!', 'success');"><i class="fa-solid fa-check"></i> Record Pay</button>`
                            : `<span style="color:var(--success); font-size:12px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Paid</span>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderAuditLogs() {
        const tbody = document.getElementById('audit-logs-body');
        if (!tbody) return;

        fetch('/api/logs', {
            headers: this.getAuthHeaders()
        })
        .then(r => r.json())
        .then(logs => {
            if (!Array.isArray(logs) || !logs.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:20px;">No audit log records</td></tr>';
                return;
            }

            tbody.innerHTML = logs.slice(0, 50).map(l => {
                return `
                    <tr>
                        <td><small class="font-mono">${new Date(l.timestamp).toLocaleString()}</small></td>
                        <td><span class="badge badge-secondary">${l.action}</span></td>
                        <td><code>${l.deviceId || '-'}</code></td>
                        <td>${l.retailerId || 'Admin'}</td>
                        <td>${l.details || ''}</td>
                        <td><span class="badge badge-success">${l.status || 'SUCCESS'}</span></td>
                    </tr>
                `;
            }).join('');
        })
        .catch(() => {
            // Fallback
            const logs = this.db.getAuditLogs();
            tbody.innerHTML = logs.map(l => `
                <tr>
                    <td><small class="font-mono">${new Date(l.timestamp).toLocaleString()}</small></td>
                    <td><span class="badge badge-secondary">${l.action}</span></td>
                    <td><code>${l.imei}</code></td>
                    <td>${l.operator}</td>
                    <td>${l.details}</td>
                    <td><span class="badge badge-success">${l.status}</span></td>
                </tr>
            `).join('');
        });
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

window.sellerPortal = new SellerPortal();
