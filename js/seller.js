/* Tiger Locker - Seller Portal UI Controller (js/seller.js) */

class SellerPortal {
    constructor() {
        this.db = window.db;
        this.api = window.api;
        this.emiEngine = window.emiEngine;
        this.backendDevices = []; // Live devices from backend server
        this.quickSearchQuery = '';
        this.tableSearchQuery = '';
        this.selectedDeviceId = localStorage.getItem('tiger_active_device_id') || '';
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupForm();
        this.setupSearch();
        this.setupCommandConsole();
        this.loadBackendDevicesAndRender();

        // Auto-refresh backend devices every 5 seconds
        setInterval(() => this.loadBackendDevicesAndRender(), 5000);

        // Listen to FCM commands to keep live feed updated
        window.fcmBus.subscribe((noti) => {
            this.renderLiveFeed();
            this.renderMetrics();
            this.renderAuditLogs();
        });
    }

    // Setup live search listeners
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

    // Load devices from backend server API (source of truth)
    loadBackendDevicesAndRender() {
        fetch('/api/devices')
            .then(r => r.json())
            .then(devices => {
                this.backendDevices = Array.isArray(devices) ? devices : [];
                this.renderDeviceDropdownFromBackend();
                this.renderDevicesTableFromBackend();
                this.renderMetrics();
            })
            .catch(() => {
                // Fallback to local db if server not reachable
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
                document.getElementById(targetId).classList.add('active');
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

        document.getElementById('stat-total-devices').textContent = total;
        document.getElementById('stat-active-devices').textContent = active;
        document.getElementById('stat-locked-devices').textContent = locked;
        document.getElementById('stat-pending-emi').textContent = `₹${overdueTotal.toLocaleString('en-IN')}`;
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
        // Fallback - use local db
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
            return `<option value="${d.id}">[${d.id}] ${d.customerName} — ${d.model} (${statusLabel})</option>`;
        }).join('');

        // Only update innerHTML if options changed to prevent glitching
        if (select.innerHTML !== optionsHtml) {
            select.innerHTML = optionsHtml;
        }

        // Strictly determine which device to select:
        let targetId = this.selectedDeviceId;
        if (!targetId || !devices.find(d => d.id === targetId)) {
            // Fallback to first available paired device in filtered list
            targetId = devices[0].id;
        }

        this.selectedDeviceId = targetId;
        select.value = targetId;

        this.updateQuickConsoleInfoFromBackend();
    }

    // Helper: Select device from table and scroll to Console
    selectDeviceForConsole(deviceId) {
        this.selectedDeviceId = deviceId;
        localStorage.setItem('tiger_active_device_id', deviceId);

        // Switch to Dashboard Tab
        document.querySelectorAll('.seller-nav .nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const dashTabBtn = document.querySelector('[data-tab="tab-dashboard"]');
        if (dashTabBtn) dashTabBtn.classList.add('active');
        const dashTab = document.getElementById('tab-dashboard');
        if (dashTab) dashTab.classList.add('active');

        // Clear search so all devices show
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
        document.getElementById('quick-cust-name').textContent = cust ? cust.name : 'Unknown';
        document.getElementById('quick-cust-imei').textContent = dev.imei;
        const statusBadge = document.getElementById('quick-cust-status');
        statusBadge.textContent = dev.status;
        statusBadge.className = `badge ${dev.status === 'ACTIVE' ? 'badge-success' : dev.status === 'LOCKED' ? 'badge-danger' : 'badge-warning'}`;
    }

    updateQuickConsoleInfoFromBackend() {
        const select = document.getElementById('active-device-select');
        if (!select || !select.value) return;
        const deviceId = select.value;
        const dev = this.backendDevices.find(d => d.id === deviceId);
        if (!dev) return;

        document.getElementById('quick-cust-name').textContent = dev.customerName || 'Unknown';
        document.getElementById('quick-cust-imei').textContent = dev.imei || dev.id;

        const statusBadge = document.getElementById('quick-cust-status');
        const statusText = dev.isLocked ? 'LOCKED' : dev.isPaired ? 'ACTIVE' : 'UNPAIRED';
        statusBadge.textContent = statusText;
        statusBadge.className = `badge ${dev.isLocked ? 'badge-danger' : dev.isPaired ? 'badge-success' : 'badge-warning'}`;

        const controlBtn = document.getElementById('btn-open-dedicated-control');
        if (controlBtn) {
            controlBtn.href = `control.html?id=${encodeURIComponent(deviceId)}`;
            controlBtn.innerHTML = `<i class="fa-solid fa-up-right-from-square"></i> <span>Open Full Control Page for ${dev.customerName || deviceId}</span>`;
        }
    }

    // Send command directly to backend by device ID
    sendBackendCommand(deviceId, action, message) {
        const url = `/api/devices/${encodeURIComponent(deviceId)}/command`;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, message: message || '' })
        })
        .then(r => r.json())
        .then(result => {
            console.log(`[CMD] ${action} → ${deviceId}:`, result);
            // Refresh device list to show updated status
            setTimeout(() => this.loadBackendDevicesAndRender(), 500);
        })
        .catch(e => console.error('Command error:', e));
    }

    setupCommandConsole() {
        const getSelectedDeviceId = () => document.getElementById('active-device-select').value;
        const getSelectedDevName = () => {
            const id = getSelectedDeviceId();
            const dev = this.backendDevices.find(d => d.id === id);
            return dev ? `[${id}] ${dev.customerName}` : `[${id}]`;
        };

        document.getElementById('cmd-lock').addEventListener('click', () => {
            const deviceId = getSelectedDeviceId();
            if (!deviceId) return this.showToast('Please select a device first!', 'warning');
            const targetName = getSelectedDevName();
            const msg = prompt(`Lock message to show on phone for ${targetName}:`, 'Your EMI is overdue. Please contact seller to unlock.');
            if (msg !== null) {
                this.sendBackendCommand(deviceId, 'LOCK', msg);
                this.showToast(`🔒 Lock command sent to ${targetName}!`, 'danger');
            }
        });

        document.getElementById('cmd-unlock').addEventListener('click', () => {
            const deviceId = getSelectedDeviceId();
            if (!deviceId) return this.showToast('Please select a device first!', 'warning');
            const targetName = getSelectedDevName();
            this.sendBackendCommand(deviceId, 'UNLOCK');
            this.showToast(`🔓 Unlock command sent to ${targetName}!`, 'success');
        });

        document.getElementById('cmd-message').addEventListener('click', () => {
            const deviceId = getSelectedDeviceId();
            if (!deviceId) return this.showToast('Please select a device first!', 'warning');
            const targetName = getSelectedDevName();
            const msg = prompt(`Message to send to ${targetName}:`, 'Reminder: Your EMI installment is due.');
            if (msg) {
                this.sendBackendCommand(deviceId, 'MESSAGE', msg);
                this.showToast(`📢 Message sent to ${targetName}!`, 'info');
            }
        });

        const soundBtn = document.getElementById('cmd-sound');
        let isSirenActive = false;

        soundBtn.addEventListener('click', () => {
            const deviceId = getSelectedDeviceId();
            if (!deviceId) return this.showToast('Please select a device first!', 'warning');

            if (!isSirenActive) {
                isSirenActive = true;
                this.sendBackendCommand(deviceId, 'SIREN_ON');
                soundBtn.classList.remove('btn-warning');
                soundBtn.classList.add('btn-danger', 'pulsing-btn');
                soundBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> <span>Siren: ON (Click to OFF)</span>';
                this.showToast('🔊 Alarm Siren ON!', 'warning');
            } else {
                isSirenActive = false;
                this.sendBackendCommand(deviceId, 'SIREN_OFF');
                soundBtn.classList.remove('btn-danger', 'pulsing-btn');
                soundBtn.classList.add('btn-warning');
                soundBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>Alarm Siren</span>';
                this.showToast('🔕 Alarm Siren OFF!', 'info');
            }
        });

        document.getElementById('cmd-info').addEventListener('click', () => {
            const deviceId = getSelectedDeviceId();
            if (!deviceId) return this.showToast('Please select a device first!', 'warning');
            const dev = this.backendDevices.find(d => d.id === deviceId);
            if (dev) {
                alert(`[DEVICE STATUS]\nCustomer: ${dev.customerName}\nIMEI: ${dev.imei}\nModel: ${dev.model}\nStatus: ${dev.isLocked ? 'LOCKED' : 'ACTIVE'}\nBattery: ${dev.battery}%\nNetwork: ${dev.network}\nLast Seen: ${new Date(dev.lastSeen).toLocaleString()}`);
            }
        });

        document.getElementById('cmd-wipe').addEventListener('click', () => {
            const deviceId = getSelectedDeviceId();
            if (!deviceId) return this.showToast('Please select a device first!', 'warning');
            if (confirm('⚠️ Are you sure? This will send Remote Wipe command to the device!')) {
                this.sendBackendCommand(deviceId, 'WIPE');
                this.showToast('⚠️ Remote Wipe command dispatched!', 'danger');
            }
        });
    }


    setupForm() {
        const form = document.getElementById('add-device-form');
        const totalPriceInput = document.getElementById('input-total-price');
        const downPaymentInput = document.getElementById('input-down-payment');
        const tenureSelect = document.getElementById('input-emi-tenure');
        const monthlyEmiInput = document.getElementById('input-monthly-emi');

        const updateEmiCalculation = () => {
            const total = Number(totalPriceInput.value) || 0;
            const down = Number(downPaymentInput.value) || 0;
            const months = Number(tenureSelect.value) || 6;
            const emi = this.emiEngine.calculateMonthlyEmi(total, down, months);
            monthlyEmiInput.value = `₹${emi.toLocaleString('en-IN')} / month`;
        };

        totalPriceInput.addEventListener('input', updateEmiCalculation);
        downPaymentInput.addEventListener('input', updateEmiCalculation);
        tenureSelect.addEventListener('change', updateEmiCalculation);

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

            const result = this.api.registerDevice(
                { name: custName, phone: custPhone, kyc: custKyc },
                { imei: devImei, model: devModel, totalPrice, downPayment, tenure, monthlyEmi },
                {}
            );

            // Display Pairing Output
            document.getElementById('pairing-modal-result').classList.remove('hidden');
            document.getElementById('generated-otp-code').textContent = result.otpCode;
            
            // Generate QR Code SVG
            document.getElementById('generated-qr-code').innerHTML = `
                <svg viewBox="0 0 100 100" width="120" height="120">
                    <rect width="100" height="100" fill="white"/>
                    <path d="M10 10h30v30h-30z M15 15h20v20h-20z M60 10h30v30h-30z M65 15h20v20h-20z M10 60h30v30h-30z M15 65h20v20h-20z M45 10h10v10h-10z M45 30h10v10h-10z M45 60h10v10h-10z M60 60h15v15h-15z M75 75h15v15h-15z M60 80h10v10h-10z" fill="black"/>
                </svg>
            `;

            this.showToast(`New Device Enrolled! Pairing Code: ${result.otpCode}`, 'success');
            this.loadBackendDevicesAndRender();
            this.renderAll();
        });
    }

    renderDevicesTable() {
        const tbody = document.getElementById('devices-table-body');
        if (!tbody) return;

        const devices = this.db.getDevices();
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
                return name.includes(this.tableSearchQuery) || 
                       phone.includes(this.tableSearchQuery) || 
                       imei.includes(this.tableSearchQuery) || 
                       id.includes(this.tableSearchQuery) || 
                       model.includes(this.tableSearchQuery);
            });
        }

        if (!devices.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:20px;">No devices found matching "${this.tableSearchQuery}"</td></tr>`;
            return;
        }

        tbody.innerHTML = devices.map(d => {
            const statusText = d.isLocked ? 'LOCKED' : d.isPaired ? 'ACTIVE' : 'UNPAIRED';
            const statusClass = d.isLocked ? 'badge-danger' : d.isPaired ? 'badge-success' : 'badge-warning';
            const onlineIcon = d.isOnline ? '🟢 Online' : '⚪ Standby';
            const lastSeenStr = d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : 'N/A';
            const isSirenOn = !!d.sirenActive;

            return `
                <tr>
                    <td>
                        <strong style="color:var(--primary);">${d.id}</strong><br>
                        <code style="font-size:11px;">${d.imei || 'No IMEI'}</code>
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

    // Permanently Delete Device
    confirmDeleteDevice(deviceId, customerName) {
        const displayName = customerName ? `${customerName} (${deviceId})` : deviceId;
        const confirmed = confirm(`⚠️ Are you sure you want to permanently DELETE device: ${displayName}?\n\nThis will remove it from Tiger Locker database.`);
        if (!confirmed) return;

        fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
            method: 'DELETE'
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                this.showToast(`🗑️ Device ${deviceId} deleted successfully!`, 'danger');
                // If the deleted device was selected in console, clear it
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

        const logs = this.db.getAuditLogs();

        tbody.innerHTML = logs.map(l => {
            return `
                <tr>
                    <td><small class="font-mono">${new Date(l.timestamp).toLocaleString()}</small></td>
                    <td><span class="badge badge-secondary">${l.action}</span></td>
                    <td><code>${l.imei}</code></td>
                    <td>${l.operator}</td>
                    <td>${l.details}</td>
                    <td><span class="badge badge-success">${l.status}</span></td>
                </tr>
            `;
        }).join('');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
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

