/* Tiger Locker - REST API Backend Service Layer (js/api.js) */

class TigerAPI {
    constructor() {
        this.db = window.db;
        this.fcm = window.fcmBus;
    }

    // 1. Register Customer & Add Device (Seller Portal)
    registerDevice(customerData, deviceData, emiData) {
        const custId = 'cust_' + Date.now().toString().slice(-4);
        const customer = {
            id: custId,
            name: customerData.name,
            phone: customerData.phone,
            kyc: customerData.kyc || 'N/A',
            createdAt: new Date().toISOString()
        };

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        const device = {
            imei: deviceData.imei,
            customerId: custId,
            model: deviceData.model,
            totalPrice: Number(deviceData.totalPrice),
            downPayment: Number(deviceData.downPayment),
            tenure: Number(deviceData.tenure),
            monthlyEmi: Number(deviceData.monthlyEmi),
            otpCode: otpCode,
            status: 'UNPAIRED', // Pending customer pairing
            lockReason: '',
            lockMessage: '',
            fcmToken: `fcm_token_${deviceData.imei}`,
            batteryLevel: 90,
            simCarrier: 'Airtel 5G',
            lastPing: new Date().toISOString(),
            isPaired: false
        };

        // Create EMI Schedule
        const emiPlans = [];
        const monthlyAmount = Number(deviceData.monthlyEmi);
        for (let i = 1; i <= deviceData.tenure; i++) {
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + i);
            
            const plan = {
                id: `emi_${deviceData.imei.slice(-4)}_${i}`,
                imei: deviceData.imei,
                custName: customerData.name,
                installmentNo: i,
                amount: monthlyAmount,
                dueDate: dueDate.toISOString().split('T')[0],
                status: 'PENDING'
            };
            this.db.addEmiPlan(plan);
        }

        this.db.addCustomer(customer);
        this.db.addDevice(device);

        // Sync registration to live backend server
        try {
            fetch('/api/devices/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerName: customerData.name,
                    customerPhone: customerData.phone,
                    model: deviceData.model,
                    imei: deviceData.imei,
                    totalAmount: deviceData.totalPrice,
                    downPayment: deviceData.downPayment,
                    monthlyEmi: deviceData.monthlyEmi,
                    tenureMonths: deviceData.tenure,
                    pairCode: otpCode
                })
            }).catch(() => {});
        } catch (e) {
            console.error('Backend registration error:', e);
        }

        // Audit Log
        this.db.addAuditLog({
            id: 'log_' + Date.now(),
            timestamp: new Date().toISOString(),
            action: 'REGISTER_DEVICE',
            imei: device.imei,
            operator: 'Authorized Seller',
            details: `Registered ${device.model} for ${customer.name}. Generated Pairing Code ${otpCode}.`,
            status: 'SUCCESS'
        });

        return { success: true, otpCode, imei: device.imei };
    }

    // 2. Pair Device from Customer Android App
    pairDevice(otpCode) {
        const dev = this.db.getDeviceByOtp(otpCode);
        if (!dev) {
            return { success: false, message: 'Invalid 6-digit Pairing Code!' };
        }

        dev.status = 'ACTIVE';
        dev.isPaired = true;
        dev.lastPing = new Date().toISOString();
        this.db.save();

        const cust = this.db.getCustomers().find(c => c.id === dev.customerId);

        // Log command
        this.db.addCommand({
            id: 'cmd_' + Date.now(),
            imei: dev.imei,
            type: 'PAIR_DEVICE',
            payload: 'Device Admin Permission Granted & Paired',
            timestamp: new Date().toISOString(),
            status: 'EXECUTED'
        });

        this.db.addAuditLog({
            id: 'log_' + Date.now(),
            timestamp: new Date().toISOString(),
            action: 'PAIR_DEVICE',
            imei: dev.imei,
            operator: cust ? cust.name : 'Customer',
            details: `Device paired successfully via OTP ${otpCode}. Device Admin Active.`,
            status: 'SUCCESS'
        });

        // Notify FCM
        this.fcm.publish({
            imei: dev.imei,
            type: 'PAIR_SUCCESS',
            title: 'Device Paired Successfully!',
            body: 'Tiger Device Control Agent is now active.',
            payload: dev
        });

        return { success: true, device: dev, customer: cust };
    }

    // 3. Send Remote Command from Seller Portal
    sendDeviceCommand(imei, commandType, extraMsg = '') {
        const dev = this.db.getDeviceByImei(imei);
        if (!dev) return { success: false, message: 'Device not found' };

        let title = '';
        let body = '';
        let statusUpdate = dev.status;

        switch (commandType) {
            case 'LOCK_DEVICE':
                statusUpdate = 'LOCKED';
                dev.lockReason = 'Remote Manual Lock Applied by Seller';
                dev.lockMessage = extraMsg || 'This device has been remotely locked due to security / overdue EMI payment.';
                title = '🔒 LOCK DEVICE COMMAND';
                body = dev.lockMessage;
                break;

            case 'UNLOCK_DEVICE':
                statusUpdate = 'ACTIVE';
                dev.lockReason = '';
                dev.lockMessage = '';
                title = '🔓 UNLOCK DEVICE COMMAND';
                body = 'Your device has been remotely unlocked. Full access restored!';
                break;

            case 'SHOW_MESSAGE':
                title = '📢 Seller Warning Alert';
                body = extraMsg || 'Please pay attention to your upcoming EMI installment due date.';
                break;

            case 'PLAY_SOUND':
                title = '🔊 SIREN ALARM TRIGGERED!';
                body = 'High-decibel security siren is playing on device!';
                break;

            case 'WIPE_DATA':
                title = '⚠️ Remote Data Wipe Instruction';
                body = 'Legal remote wipe simulation started!';
                break;

            case 'FETCH_INFO':
                title = '📡 Device Status Ping';
                body = `Battery: ${dev.batteryLevel}%, SIM: ${dev.simCarrier}, IMEI: ${dev.imei}`;
                break;
        }

        this.db.updateDeviceStatus(imei, statusUpdate, dev.lockReason, dev.lockMessage);

        // Sync to real backend server for this specific device
        try {
            let backendAction = 'LOCK';
            if (commandType === 'LOCK_DEVICE') backendAction = 'LOCK';
            else if (commandType === 'UNLOCK_DEVICE') backendAction = 'UNLOCK';
            else if (commandType === 'PLAY_SOUND') backendAction = 'SIREN_ON';
            else if (commandType === 'STOP_SOUND') backendAction = 'SIREN_OFF';
            else if (commandType === 'SHOW_MESSAGE') backendAction = 'MESSAGE';
            else if (commandType === 'WIPE_DATA') backendAction = 'WIPE';

            const targetIdentifier = dev.id || dev.imei || 'DEV-101';
            fetch(`/api/devices/${encodeURIComponent(targetIdentifier)}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: backendAction, message: extraMsg || body, imei: dev.imei })
            }).catch(() => {});
        } catch (e) {
            console.error('Backend command dispatch error:', e);
        }

        const cmdObj = {
            id: 'cmd_' + Date.now(),
            imei: imei,
            type: commandType,
            payload: body,
            timestamp: new Date().toISOString(),
            status: 'EXECUTED'
        };
        this.db.addCommand(cmdObj);

        this.db.addAuditLog({
            id: 'log_' + Date.now(),
            timestamp: new Date().toISOString(),
            action: commandType,
            imei: imei,
            operator: 'Seller Admin Portal',
            details: body,
            status: 'SUCCESS'
        });

        // Dispatch via FCM
        this.fcm.publish({
            imei: imei,
            type: commandType,
            title: title,
            body: body,
            payload: { status: statusUpdate, reason: dev.lockReason, message: dev.lockMessage }
        });

        return { success: true, command: cmdObj };
    }

    // 4. Process Payment (UPI / Manual)
    processEmiPayment(emiId) {
        const emi = this.db.getEmiPlans().find(e => e.id === emiId);
        if (!emi) return { success: false, message: 'EMI record not found' };

        this.db.updateEmiStatus(emiId, 'PAID');

        // Check if all due EMI for this IMEI are paid
        const remainingOverdue = this.db.getEmiPlans().filter(e => e.imei === emi.imei && e.status === 'OVERDUE');
        if (remainingOverdue.length === 0) {
            // Unlock device automatically
            this.sendDeviceCommand(emi.imei, 'UNLOCK_DEVICE', 'Payment received. Device unlocked successfully!');
        }

        this.db.addAuditLog({
            id: 'log_' + Date.now(),
            timestamp: new Date().toISOString(),
            action: 'EMI_PAYMENT_PAID',
            imei: emi.imei,
            operator: 'Payment Gateway (UPI / PayU)',
            details: `EMI Installment #${emi.installmentNo} of ₹${emi.amount} marked as PAID.`,
            status: 'SUCCESS'
        });

        return { success: true, emi };
    }
}

window.api = new TigerAPI();
