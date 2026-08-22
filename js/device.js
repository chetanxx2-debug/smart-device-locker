/* Tiger Locker - Customer Device Simulator UI Controller (js/device.js) */

class CustomerDeviceSimulator {
    constructor() {
        this.db = window.db;
        this.api = window.api;
        this.fcm = window.fcmBus;
        this.activeImei = '864521049281734'; // Default simulated phone IMEI
        this.init();
    }

    init() {
        this.startClock();
        this.setupFCMListener();
        this.setupUIEvents();
        this.syncDeviceState();
    }

    startClock() {
        const clockEl = document.getElementById('phone-clock');
        const updateClock = () => {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    setupFCMListener() {
        this.fcm.subscribe((notification) => {
            if (notification.imei !== this.activeImei) return;

            // Show FCM Toast Banner on phone top
            this.showFCMBanner(notification.title, notification.body);

            // Handle specific push action commands
            if (notification.type === 'LOCK_DEVICE') {
                this.showLockedScreen(notification.body);
            } else if (notification.type === 'UNLOCK_DEVICE') {
                this.showActiveScreen();
            } else if (notification.type === 'PLAY_SOUND') {
                this.triggerAlarmOverlay();
            } else if (notification.type === 'WIPE_DATA') {
                alert('[ANDROID AGENT] Remote Data Wipe command received. Formatting device storage...');
            }

            this.syncDeviceState();
        });
    }

    setupUIEvents() {
        // Pair Device Button
        document.getElementById('btn-phone-pair').addEventListener('click', () => {
            const otpInput = document.getElementById('phone-otp-input').value.trim();
            if (!otpInput) {
                alert('Please enter the 6-digit pairing code!');
                return;
            }

            const res = this.api.pairDevice(otpInput);
            if (res.success) {
                this.activeImei = res.device.imei;
                alert('Device Paired Successfully! Device Admin Permission Granted.');
                this.syncDeviceState();
            } else {
                alert(res.message);
            }
        });

        // Pay Now Button (Active Screen)
        document.getElementById('btn-phone-pay-now').addEventListener('click', () => {
            this.processSimulatedPayment();
        });

        // Pay Now Button (Lock Screen)
        document.getElementById('btn-lock-screen-pay').addEventListener('click', () => {
            this.processSimulatedPayment();
        });

        // Call Seller Support Button
        document.getElementById('btn-lock-screen-call').addEventListener('click', () => {
            alert('Dialing Seller Support Helpline: 1800-123-4567');
        });
    }

    processSimulatedPayment() {
        const emiList = this.db.getEmiByImei(this.activeImei);
        const pendingOrOverdue = emiList.find(e => e.status === 'OVERDUE' || e.status === 'PENDING');

        if (!pendingOrOverdue) {
            alert('All your EMI installments are already fully paid!');
            return;
        }

        if (confirm(`Process payment of ₹${pendingOrOverdue.amount} via UPI / Card?`)) {
            const res = this.api.processEmiPayment(pendingOrOverdue.id);
            if (res.success) {
                alert('Payment Successful! UPI Txn ID: ' + Math.floor(Math.random()*1000000000));
                this.syncDeviceState();
                if (window.sellerPortal) window.sellerPortal.renderAll();
            }
        }
    }

    syncDeviceState() {
        const dev = this.db.getDeviceByImei(this.activeImei);
        const cust = dev ? this.db.getCustomers().find(c => c.id === dev.customerId) : null;

        const viewOnboarding = document.getElementById('phone-view-onboarding');
        const viewActive = document.getElementById('phone-view-active');
        const viewLocked = document.getElementById('phone-view-locked');

        viewOnboarding.classList.add('hidden');
        viewActive.classList.add('hidden');
        viewLocked.classList.add('hidden');

        if (!dev || !dev.isPaired) {
            viewOnboarding.classList.remove('hidden');
            return;
        }

        if (dev.status === 'LOCKED') {
            this.showLockedScreen(dev.lockMessage || 'This phone has been locked due to overdue EMI installment.');
        } else {
            viewActive.classList.remove('hidden');
            if (cust) document.getElementById('phone-user-name').textContent = cust.name;
            document.getElementById('phone-display-imei').textContent = dev.imei;
            document.getElementById('phone-display-model').textContent = dev.model;

            const emiList = this.db.getEmiByImei(this.activeImei);
            const nextEmi = emiList.find(e => e.status !== 'PAID');
            if (nextEmi) {
                document.getElementById('phone-emi-amount').textContent = `₹${nextEmi.amount.toLocaleString()}`;
                document.getElementById('phone-emi-due').textContent = `Due Date: ${nextEmi.dueDate}`;
            } else {
                document.getElementById('phone-emi-amount').textContent = '₹0 (Completed)';
                document.getElementById('phone-emi-due').textContent = 'All installments completed!';
            }
        }
    }

    showLockedScreen(message) {
        const viewLocked = document.getElementById('phone-view-locked');
        viewLocked.classList.remove('hidden');
        document.getElementById('phone-lock-message').textContent = message;

        const emiList = this.db.getEmiByImei(this.activeImei);
        const overdue = emiList.find(e => e.status === 'OVERDUE' || e.status === 'PENDING');
        document.getElementById('phone-lock-amount').textContent = overdue ? `₹${overdue.amount.toLocaleString()}` : '₹2,500';
    }

    showActiveScreen() {
        this.syncDeviceState();
    }

    showFCMBanner(title, body) {
        const banner = document.getElementById('fcm-notification-banner');
        document.getElementById('fcm-title').textContent = title;
        document.getElementById('fcm-body').textContent = body;
        banner.classList.remove('hidden');

        setTimeout(() => {
            banner.classList.add('hidden');
        }, 4000);
    }

    triggerAlarmOverlay() {
        const overlay = document.getElementById('alarm-overlay');
        overlay.classList.remove('hidden');

        // Play authentic dual-tone loud siren sound using Web Audio API
        this.fcm.startSirenSound();

        setTimeout(() => {
            overlay.classList.add('hidden');
            this.fcm.stopSirenSound();
        }, 5000);
    }
}

window.customerDevice = new CustomerDeviceSimulator();
