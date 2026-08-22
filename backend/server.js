const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
        if (raw && raw.trim()) {
            try {
                req.body = JSON.parse(raw.trim());
            } catch (e) {
                try {
                    const parsed = {};
                    new URLSearchParams(raw).forEach((v, k) => { parsed[k] = v; });
                    req.body = parsed;
                } catch (_) {
                    req.body = {};
                }
            }
        } else {
            req.body = req.body || {};
        }
        next();
    });
});
app.use(express.static(path.join(__dirname, '..')));

// Helper to get Local IP Address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// Initial Database Schema
const initialDb = {
    devices: [
        {
            id: "DEV-101",
            imei: "867493049281726",
            model: "Samsung Galaxy A14",
            customerName: "Rahul Sharma",
            customerPhone: "+91 98765 43210",
            totalAmount: 15000,
            downPayment: 3000,
            monthlyEmi: 2000,
            tenureMonths: 6,
            paidEmis: 2,
            dueDate: "2026-08-20",
            status: "active", // active, locked, grace_period
            isLocked: false,
            pairCode: "849201",
            isPaired: true,
            sirenActive: false,
            lastMessage: "Welcome to Tiger Locker Protection",
            battery: 84,
            network: "4G LTE (Jio)",
            lastSeen: new Date().toISOString()
        }
    ],
    logs: [
        {
            id: 1,
            timestamp: new Date().toISOString(),
            deviceId: "DEV-101",
            action: "SYSTEM_INIT",
            details: "Tiger Locker Server initialized successfully.",
            status: "SUCCESS"
        }
    ]
};

// Load or initialize Database
function loadDb() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
            return initialDb;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading database:', e);
        return initialDb;
    }
}

function saveDb(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving database:', e);
    }
}

// Store active WebSocket connections by deviceId
const activeSockets = new Map();

// WebSocket Connection handling
wss.on('connection', (ws, req) => {
    let connectedDeviceId = null;
    console.log('[WS] New connection established.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('[WS RECV]:', data);

            // Device Identification handshake
            if (data.type === 'REGISTER_DEVICE' || data.type === 'AUTH') {
                connectedDeviceId = data.deviceId;
                activeSockets.set(connectedDeviceId, ws);
                console.log(`[WS] Device registered on socket: ${connectedDeviceId}`);

                // Update device lastSeen
                const db = loadDb();
                const dev = db.devices.find(d => d.id === connectedDeviceId);
                if (dev) {
                    dev.lastSeen = new Date().toISOString();
                    if (data.battery) dev.battery = data.battery;
                    if (data.network) dev.network = data.network;
                    saveDb(db);
                }

                ws.send(JSON.stringify({
                    type: 'AUTH_SUCCESS',
                    deviceId: connectedDeviceId,
                    isLocked: dev ? dev.isLocked : false,
                    message: dev ? dev.lastMessage : ""
                }));
            }

            // Device Status Update / Heartbeat
            if (data.type === 'HEARTBEAT') {
                const db = loadDb();
                const dev = db.devices.find(d => d.id === data.deviceId);
                if (dev) {
                    dev.lastSeen = new Date().toISOString();
                    if (data.battery !== undefined) dev.battery = data.battery;
                    if (data.network) dev.network = data.network;
                    if (data.isLocked !== undefined) dev.isLocked = data.isLocked;
                    saveDb(db);
                }
            }
        } catch (e) {
            console.error('[WS] Error processing message:', e);
        }
    });

    ws.on('close', () => {
        if (connectedDeviceId) {
            console.log(`[WS] Device disconnected: ${connectedDeviceId}`);
            activeSockets.delete(connectedDeviceId);
        }
    });
});

// Broadcast command to specific device over WebSocket
function sendCommandToDevice(deviceId, commandPayload) {
    const ws = activeSockets.get(deviceId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(commandPayload));
        console.log(`[WS SENT to ${deviceId}]:`, commandPayload);
        return true;
    }
    return false; // Queued or offline
}

// ---------------- REST API ENDPOINTS ----------------

// Server Info & Health
app.get('/api/info', (req, res) => {
    const localIp = getLocalIpAddress();
    res.json({
        name: "Tiger Locker Master Backend",
        status: "ONLINE",
        version: "2.0.0",
        localIp: localIp,
        serverUrl: `http://${localIp}:${PORT}`,
        activeConnections: activeSockets.size
    });
});

// Get all devices
app.get('/api/devices', (req, res) => {
    const db = loadDb();
    // Attach online status
    const devicesWithStatus = db.devices.map(d => ({
        ...d,
        isOnline: activeSockets.has(d.id)
    }));
    res.json(devicesWithStatus);
});

// Register a new customer / device
app.post('/api/devices/register', (req, res) => {
    const db = loadDb();
    const {
        customerName, customerPhone, model, imei,
        totalAmount, downPayment, monthlyEmi, tenureMonths
    } = req.body;

    const deviceId = `DEV-${Math.floor(100 + Math.random() * 900)}`;
    const pairCode = req.body.pairCode || Math.floor(100000 + Math.random() * 900000).toString();

    const newDevice = {
        id: deviceId,
        imei: imei || `86${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
        model: model || "Android Smartphone",
        customerName: customerName || "Customer",
        customerPhone: customerPhone || "+91 9800000000",
        totalAmount: Number(totalAmount) || 12000,
        downPayment: Number(downPayment) || 2000,
        monthlyEmi: Number(monthlyEmi) || 1500,
        tenureMonths: Number(tenureMonths) || 6,
        paidEmis: 0,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "active",
        isLocked: false,
        pairCode: pairCode,
        offlineMasterCode: Math.floor(100000 + Math.random() * 900000).toString(),
        isPaired: false,
        sirenActive: false,
        lastMessage: "Welcome to Tiger Locker Protection",
        battery: 100,
        network: "Wi-Fi",
        lastSeen: new Date().toISOString()
    };

    db.devices.push(newDevice);
    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        action: "DEVICE_REGISTERED",
        details: `Device ${model} registered for ${customerName}. Pair Code: ${pairCode}`,
        status: "SUCCESS"
    });

    saveDb(db);
    res.status(201).json({ success: true, device: newDevice });
});

// Pair device from Android App (using Pair Code or QR)
app.post('/api/devices/pair', (req, res) => {
    const db = loadDb();
    const body = req.body || {};
    const pairCode = String(
        body.pairCode || 
        body.pair_code || 
        body.code || 
        body.otpCode || 
        req.query.pairCode || 
        req.query.code || 
        ""
    ).trim();
    
    const imei = body.imei || req.query.imei || "";
    const deviceModel = body.deviceModel || body.model || req.query.deviceModel || "Android Smartphone";

    if (!pairCode) {
        return res.status(400).json({ success: false, message: "Pair Code is required." });
    }

    // STRICT: Only allow pairing if this code was generated on the Dashboard
    const device = db.devices.find(d => String(d.pairCode).trim() === pairCode);
    
    if (!device) {
        console.log(`[PAIR REJECTED] Unregistered code entered: "${pairCode}"`);
        return res.status(400).json({
            success: false,
            message: `Invalid Pair Code (${pairCode})! Please enter the 6-digit code generated on the Seller Dashboard.`
        });
    }

    // Successfully paired with the registered device
    device.isPaired = true;
    if (imei) device.imei = imei;
    if (deviceModel) device.model = deviceModel;
    device.lastSeen = new Date().toISOString();

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: device.id,
        action: "DEVICE_PAIRED",
        details: `Device ${device.model} (${device.customerName}) verified & paired successfully with generated code ${pairCode}.`,
        status: "SUCCESS"
    });

    saveDb(db);
    console.log(`[PAIR SUCCESS] Verified & paired: ${device.id} (${device.customerName}) with generated code ${pairCode}`);

    res.json({
        success: true,
        message: "Device paired successfully!",
        deviceId: device.id,
        device: device
    });
});

// Send Remote Command (LOCK, UNLOCK, SIREN, MESSAGE, WIPE)
app.post('/api/devices/:id/command', (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const { action, message, sound } = req.body;

    const device = db.devices.find(d => 
        d.id === deviceId || 
        d.imei === deviceId || 
        d.id === 'DEV-' + deviceId || 
        (req.body && req.body.imei && d.imei === req.body.imei)
    );
    if (!device) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    let commandPayload = { type: action, deviceId: device.id };

    if (action === 'LOCK') {
        device.isLocked = true;
        device.status = "locked";
        commandPayload.message = message || "This device is locked due to pending EMI. Contact seller to unlock.";
        device.lastMessage = commandPayload.message;
    } else if (action === 'UNLOCK') {
        device.isLocked = false;
        device.status = "active";
        commandPayload.message = "Device Unlocked Successfully.";
    } else if (action === 'SIREN' || action === 'PLAY_SOUND' || action === 'SIREN_ON') {
        device.sirenActive = true;
        commandPayload.type = "SIREN";
        commandPayload.sound = true;
    } else if (action === 'STOP_SIREN' || action === 'STOP_SOUND' || action === 'SIREN_OFF') {
        device.sirenActive = false;
        commandPayload.type = "STOP_SIREN";
        commandPayload.sound = false;
    } else if (action === 'MESSAGE' || action === 'SHOW_MESSAGE') {
        commandPayload.message = message || "Urgent Notice from Retailer.";
        device.lastMessage = commandPayload.message;
    } else if (action === 'WIPE') {
        commandPayload.action = "WIPE_DATA";
    }

    // Push via WebSocket
    const isSent = sendCommandToDevice(deviceId, commandPayload);

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        action: `COMMAND_${action}`,
        details: `Command ${action} executed by Admin. Dispatched Live: ${isSent}`,
        status: isSent ? "DISPATCHED" : "QUEUED"
    });

    saveDb(db);
    res.json({
        success: true,
        dispatchedLive: isSent,
        device: device
    });
});

// Android App Poll (Fallback if WS is not active)
app.get('/api/devices/:id/poll', (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const device = db.devices.find(d => 
        d.id === deviceId || 
        d.imei === deviceId || 
        d.id === 'DEV-' + deviceId
    );

    if (!device) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    device.lastSeen = new Date().toISOString();
    saveDb(db);

    res.json({
        success: true,
        deviceId: device.id,
        isLocked: device.isLocked,
        sirenActive: device.sirenActive,
        message: device.lastMessage,
        offlineMasterCode: device.offlineMasterCode || "",
        dueDate: device.dueDate || ""
    });
});

// Pay EMI
app.post('/api/devices/:id/pay-emi', (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const device = db.devices.find(d => d.id === deviceId);

    if (!device) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    if (device.paidEmis < device.tenureMonths) {
        device.paidEmis += 1;
        // Extend next due date by 30 days
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 30);
        device.dueDate = nextDue.toISOString().split('T')[0];

        // If previously locked, auto-unlock
        if (device.isLocked) {
            device.isLocked = false;
            device.status = "active";
            sendCommandToDevice(deviceId, { type: 'UNLOCK', message: "EMI Received. Device Unlocked." });
        }

        db.logs.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            deviceId: deviceId,
            action: "EMI_PAID",
            details: `EMI payment of ₹${device.monthlyEmi} received for ${device.customerName}. Installment: ${device.paidEmis}/${device.tenureMonths}`,
            status: "SUCCESS"
        });

        saveDb(db);
        res.json({ success: true, device });
    } else {
        res.status(400).json({ success: false, message: "All EMIs already paid." });
    }
});

// Delete Device
app.delete('/api/devices/:id', (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const deviceIndex = db.devices.findIndex(d => d.id === deviceId);

    if (deviceIndex === -1) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    const removedDevice = db.devices.splice(deviceIndex, 1)[0];

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        action: "DEVICE_DELETED",
        details: `Device ${deviceId} (${removedDevice.customerName} - ${removedDevice.model}) was permanently removed from system by Admin.`,
        status: "SUCCESS"
    });

    saveDb(db);
    res.json({ success: true, message: `Device ${deviceId} deleted successfully.` });
});

// Get Audit Logs (STRICT: Only paired devices history)
app.get('/api/logs', (req, res) => {
    const db = loadDb();
    const pairedIds = new Set(db.devices.filter(d => d.isPaired).map(d => d.id));
    const pairedLogs = (db.logs || []).filter(l => !l.deviceId || pairedIds.has(l.deviceId));
    res.json(pairedLogs);
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`\n======================================================`);
    console.log(`🛡️ SMART DEVICE LOCKER MASTER BACKEND SERVER RUNNING!`);
    console.log(`🔗 Local Web Dashboard:  http://localhost:${PORT}`);
    console.log(`📱 Mobile Network IP:    http://${localIp}:${PORT}`);
    console.log(`⚡ WebSocket Server:     ws://${localIp}:${PORT}`);
    console.log(`======================================================\n`);
});
