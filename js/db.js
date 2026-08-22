/* Tiger Locker - Mock Database Service (js/db.js) */

class TigerDB {
    constructor() {
        this.STORAGE_KEY = 'tiger_locker_db_v1';
        this.data = this.loadData();
    }

    getDefaultData() {
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(now.getDate() + 15);

        const pastDue = new Date();
        pastDue.setDate(now.getDate() - 5);

        return {
            customers: [
                {
                    id: 'cust_101',
                    name: 'Rahul Sharma',
                    phone: '9876543210',
                    kyc: 'ABCD1234EF',
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'cust_102',
                    name: 'Priya Verma',
                    phone: '9812345678',
                    kyc: 'WXYZ9876GH',
                    createdAt: new Date().toISOString()
                }
            ],
            devices: [
                {
                    imei: '864521049281734',
                    customerId: 'cust_101',
                    model: 'Samsung Galaxy M34 5G',
                    totalPrice: 18000,
                    downPayment: 3000,
                    tenure: 6,
                    monthlyEmi: 2500,
                    otpCode: '582914',
                    status: 'ACTIVE', // ACTIVE, LOCKED, UNPAIRED
                    lockReason: '',
                    lockMessage: '',
                    fcmToken: 'fcm_token_rahul_101',
                    batteryLevel: 82,
                    simCarrier: 'Jio 5G (IN)',
                    lastPing: new Date().toISOString(),
                    isPaired: true
                },
                {
                    imei: '869123049581902',
                    customerId: 'cust_102',
                    model: 'Redmi Note 13 Pro',
                    totalPrice: 22000,
                    downPayment: 4000,
                    tenure: 9,
                    monthlyEmi: 2000,
                    otpCode: '104928',
                    status: 'LOCKED',
                    lockReason: 'EMI payment overdue by 5 days',
                    lockMessage: 'Your monthly EMI installment of ₹2,000 is overdue. Please complete payment immediately to unlock device.',
                    fcmToken: 'fcm_token_priya_102',
                    batteryLevel: 45,
                    simCarrier: 'Airtel 4G',
                    lastPing: new Date().toISOString(),
                    isPaired: true
                }
            ],
            emiPlans: [
                {
                    id: 'emi_101_1',
                    imei: '864521049281734',
                    custName: 'Rahul Sharma',
                    installmentNo: 1,
                    amount: 2500,
                    dueDate: futureDate.toISOString().split('T')[0],
                    status: 'PENDING' // PENDING, PAID, OVERDUE
                },
                {
                    id: 'emi_102_1',
                    imei: '869123049581902',
                    custName: 'Priya Verma',
                    installmentNo: 1,
                    amount: 2000,
                    dueDate: pastDue.toISOString().split('T')[0],
                    status: 'OVERDUE'
                }
            ],
            commands: [
                {
                    id: 'cmd_001',
                    imei: '864521049281734',
                    type: 'PAIR_DEVICE',
                    payload: 'Device Pair Request Completed',
                    timestamp: new Date().toISOString(),
                    status: 'EXECUTED'
                },
                {
                    id: 'cmd_002',
                    imei: '869123049581902',
                    type: 'LOCK_DEVICE',
                    payload: 'Auto Lock triggered due to Overdue EMI',
                    timestamp: new Date().toISOString(),
                    status: 'EXECUTED'
                }
            ],
            auditLogs: [
                {
                    id: 'log_001',
                    timestamp: new Date().toISOString(),
                    action: 'PAIR_DEVICE',
                    imei: '864521049281734',
                    operator: 'Admin Staff #1',
                    details: 'Customer Rahul Sharma device paired successfully.',
                    status: 'SUCCESS'
                },
                {
                    id: 'log_002',
                    timestamp: new Date().toISOString(),
                    action: 'LOCK_DEVICE',
                    imei: '869123049581902',
                    operator: 'System Auto-Rule',
                    details: 'Automated Lockdown applied for overdue payment.',
                    status: 'SUCCESS'
                }
            ]
        };
    }

    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error('Error parsing stored DB data, loading defaults.', e);
            }
        }
        const initial = this.getDefaultData();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(initial));
        return initial;
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    reset() {
        this.data = this.getDefaultData();
        this.save();
    }

    // Customer Queries
    getCustomers() { return this.data.customers; }
    addCustomer(cust) {
        this.data.customers.push(cust);
        this.save();
    }

    // Device Queries
    getDevices() { return this.data.devices; }
    getDeviceByImei(imei) { return this.data.devices.find(d => d.imei === imei); }
    getDeviceByOtp(otp) { return this.data.devices.find(d => d.otpCode === otp); }
    
    addDevice(device) {
        this.data.devices.push(device);
        this.save();
    }

    updateDeviceStatus(imei, status, lockReason = '', lockMessage = '') {
        const dev = this.getDeviceByImei(imei);
        if (dev) {
            dev.status = status;
            dev.lockReason = lockReason;
            if (lockMessage) dev.lockMessage = lockMessage;
            dev.lastPing = new Date().toISOString();
            this.save();
        }
    }

    // EMI Plan Queries
    getEmiPlans() { return this.data.emiPlans; }
    getEmiByImei(imei) { return this.data.emiPlans.filter(e => e.imei === imei); }
    
    addEmiPlan(plan) {
        this.data.emiPlans.push(plan);
        this.save();
    }

    updateEmiStatus(id, status) {
        const emi = this.data.emiPlans.find(e => e.id === id);
        if (emi) {
            emi.status = status;
            this.save();
        }
    }

    // Commands & Log Queries
    getCommands() { return this.data.commands; }
    addCommand(cmd) {
        this.data.commands.unshift(cmd);
        if (this.data.commands.length > 50) this.data.commands.pop();
        this.save();
    }

    getAuditLogs() { return this.data.auditLogs; }
    addAuditLog(log) {
        this.data.auditLogs.unshift(log);
        if (this.data.auditLogs.length > 100) this.data.auditLogs.pop();
        this.save();
    }
}

window.db = new TigerDB();
