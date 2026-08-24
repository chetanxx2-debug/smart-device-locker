const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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
// ── PWA: Service Worker — serve BEFORE static (correct MIME + no-cache) ──
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'sw.js'));
});

// ── PWA: Manifest — serve BEFORE static (correct MIME type) ──────────
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, '..', 'manifest.json'));
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
    users: [
        {
            id: "USR-SUPERADMIN",
            username: "superadmin",
            password: "superadmin.xx2", // Master Super Admin Password
            role: "super_admin",
            name: "Master Super Admin",
            shopName: "Smart Device Locker HQ",
            phone: "+91 98765 43210",
            status: "active",
            createdAt: new Date().toISOString()
        }
    ],
    devices: [],
    logs: [
        {
            id: 1,
            timestamp: new Date().toISOString(),
            deviceId: "SYSTEM",
            action: "SYSTEM_INIT",
            details: "Smart Device Locker Multi-Tenant Server initialized successfully.",
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
        const parsed = JSON.parse(data);
        if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
            parsed.users = initialDb.users;
            saveDb(parsed);
        }
        if (!parsed.devices) parsed.devices = [];
        if (!parsed.logs) parsed.logs = [];
        return parsed;
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

// In-Memory Token Sessions: token -> user
const activeSessions = new Map();

// Helper: Extract user from request headers
function authenticateUser(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'] || req.query.token;
    if (!authHeader) {
        req.user = null;
        return next();
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
    if (activeSessions.has(token)) {
        const sessionUser = activeSessions.get(token);
        // Verify user still exists in DB and is still active (detects delete/block in real-time)
        const db = loadDb();
        const dbUser = db.users.find(u => u.id === sessionUser.id);
        if (!dbUser || dbUser.status !== 'active') {
            // User deleted or blocked — kill session immediately
            activeSessions.delete(token);
            req.user = null;
        } else {
            req.user = sessionUser;
        }
    } else {
        req.user = null;
    }
    next();
}

app.use(authenticateUser);

// Strict Auth Middleware (rejects if not logged in)
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Authentication required. Please login." });
    }
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Access denied. Master Super Admin only." });
    }
    next();
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

                // Update device lastSeen & Location
                const db = loadDb();
                const dev = db.devices.find(d => d.id === connectedDeviceId);
                if (dev) {
                    dev.lastSeen = new Date().toISOString();
                    if (data.battery) dev.battery = data.battery;
                    if (data.network) dev.network = data.network;
                    if (data.lat && data.lng) {
                        dev.location = {
                            lat: parseFloat(data.lat),
                            lng: parseFloat(data.lng),
                            accuracy: data.accuracy || null,
                            mapsUrl: `https://www.google.com/maps?q=${data.lat},${data.lng}`,
                            updatedAt: new Date().toISOString()
                        };
                    }
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
                    if (data.lat && data.lng) {
                        dev.location = {
                            lat: parseFloat(data.lat),
                            lng: parseFloat(data.lng),
                            accuracy: data.accuracy || null,
                            mapsUrl: `https://www.google.com/maps?q=${data.lat},${data.lng}`,
                            updatedAt: new Date().toISOString()
                        };
                    }
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
        name: "Smart Device Locker Multi-Tenant Cloud Backend",
        status: "ONLINE",
        version: "3.0.0",
        localIp: localIp,
        serverUrl: `http://${localIp}:${PORT}`,
        activeConnections: activeSockets.size
    });
});

// ===== AUTHENTICATION ENDPOINTS =====

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const db = loadDb();
    const cleanUser = String(username).trim().toLowerCase();
    const user = db.users.find(u => String(u.username).trim().toLowerCase() === cleanUser && String(u.password) === String(password).trim());

    if (!user) {
        return res.status(401).json({ success: false, message: "Invalid username or password. Please contact Super Admin." });
    }

    if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: "Your shop account has been deactivated. Please contact Super Admin." });
    }

    // Generate Session Token
    const token = 'sdl_' + crypto.randomBytes(32).toString('hex');
    const userProfile = {
        id: user.id,
        username: user.username,
        role: user.role, // 'super_admin' or 'retailer'
        name: user.name,
        shopName: user.shopName || user.name,
        phone: user.phone || ""
    };

    activeSessions.set(token, userProfile);

    res.json({
        success: true,
        message: "Login successful!",
        token: token,
        user: userProfile
    });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Not authenticated." });
    }
    res.json({ success: true, user: req.user });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
    if (authHeader) {
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
        activeSessions.delete(token);
    }
    res.json({ success: true, message: "Logged out successfully." });
});

// ===== SUPER ADMIN: RETAILER MANAGEMENT ENDPOINTS =====

// GET /api/admin/retailers
app.get('/api/admin/retailers', (req, res) => {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Access denied. Super Admin only." });
    }

    const db = loadDb();
    const retailers = (db.users || []).filter(u => u.role === 'retailer').map(r => {
        const shopDevices = db.devices.filter(d => d.retailerId === r.id);
        return {
            id: r.id,
            username: r.username,
            password: r.password, // Super Admin can view passwords to share with retailers
            name: r.name,
            shopName: r.shopName,
            phone: r.phone,
            status: r.status,
            createdAt: r.createdAt,
            deviceCount: shopDevices.length,
            pairedCount: shopDevices.filter(d => d.isPaired).length,
            lockedCount: shopDevices.filter(d => d.isLocked).length
        };
    });

    res.json({ success: true, retailers });
});

// POST /api/admin/retailers
app.post('/api/admin/retailers', (req, res) => {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Access denied. Super Admin only." });
    }

    const { username, password, name, shopName, phone } = req.body;
    if (!username || !password || !shopName) {
        return res.status(400).json({ success: false, message: "Username, password, and shop name are required." });
    }

    const db = loadDb();
    const cleanUser = String(username).trim().toLowerCase();
    if (db.users.some(u => String(u.username).trim().toLowerCase() === cleanUser)) {
        return res.status(400).json({ success: false, message: "This username is already taken. Please choose another." });
    }

    const newRetailer = {
        id: `RET-${Math.floor(1000 + Math.random() * 9000)}`,
        username: String(username).trim(),
        password: String(password).trim(),
        role: "retailer",
        name: name || shopName,
        shopName: String(shopName).trim(),
        phone: phone || "",
        status: "active",
        createdAt: new Date().toISOString()
    };

    db.users.push(newRetailer);
    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: "ADMIN",
        action: "RETAILER_CREATED",
        details: `New shop account "${newRetailer.shopName}" (${newRetailer.username}) created by Super Admin.`,
        status: "SUCCESS"
    });

    saveDb(db);
    res.status(201).json({ success: true, message: "Shop account created successfully!", retailer: newRetailer });
});

// Helper: Kill all sessions of a given retailer ID
function killRetailerSessions(retailerId) {
    for (const [token, user] of activeSessions.entries()) {
        if (user.id === retailerId) {
            activeSessions.delete(token);
        }
    }
}

// PUT /api/admin/retailers/:id
app.put('/api/admin/retailers/:id', (req, res) => {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Access denied. Super Admin only." });
    }

    const db = loadDb();
    const retailer = db.users.find(u => u.id === req.params.id && u.role === 'retailer');
    if (!retailer) {
        return res.status(404).json({ success: false, message: "Retailer account not found." });
    }

    if (req.body.password) retailer.password = String(req.body.password).trim();
    if (req.body.status) {
        retailer.status = req.body.status; // 'active' or 'blocked'
        // If blocked, kill all active sessions immediately (force logout)
        if (req.body.status === 'blocked') {
            killRetailerSessions(retailer.id);
        }
    }
    if (req.body.shopName) retailer.shopName = String(req.body.shopName).trim();
    if (req.body.name) retailer.name = String(req.body.name).trim();
    if (req.body.phone) retailer.phone = String(req.body.phone).trim();

    saveDb(db);
    res.json({ success: true, message: "Retailer updated successfully!", retailer });
});

// DELETE /api/admin/retailers/:id
app.delete('/api/admin/retailers/:id', (req, res) => {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Access denied. Super Admin only." });
    }

    const db = loadDb();
    const idx = db.users.findIndex(u => u.id === req.params.id && u.role === 'retailer');
    if (idx === -1) {
        return res.status(404).json({ success: false, message: "Retailer not found." });
    }

    const removed = db.users.splice(idx, 1)[0];

    // Kill all active sessions of this retailer immediately (force logout)
    killRetailerSessions(removed.id);

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: "ADMIN",
        action: "RETAILER_DELETED",
        details: `Shop account "${removed.shopName}" (${removed.username}) deleted and force-logged-out by Super Admin.`,
        status: "WARNING"
    });

    saveDb(db);
    res.json({ success: true, message: `Retailer ${removed.shopName} (${removed.username}) deleted and logged out.` });
});

// ===== DEVICE MANAGEMENT (ISOLATED BY SHOP) =====

// Get all devices (Filtered by Shop / Retailer)
app.get('/api/devices', (req, res) => {
    const db = loadDb();
    let devices = db.devices;

    // Multi-tenant filter: Retailer only sees their own devices
    if (req.user && req.user.role === 'retailer') {
        devices = devices.filter(d => d.retailerId === req.user.id);
    } else if (req.query.retailerId) {
        devices = devices.filter(d => d.retailerId === req.query.retailerId);
    }

    // Attach online status
    const devicesWithStatus = devices.map(d => ({
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

    // Assign to logged-in Retailer or Super Admin
    const retailerId = req.user ? req.user.id : "USR-SUPERADMIN";
    const shopName = req.user ? (req.user.shopName || req.user.name) : "Smart Device Locker HQ";
    const retailerPhone = req.user ? (req.user.phone || "") : "+91 98765 43210";

    const platform = req.body.platform || ((model && model.toLowerCase().includes('iphone')) ? 'ios' : 'android');

    const newDevice = {
        id: deviceId,
        platform: platform,
        retailerId: retailerId,
        shopName: shopName,
        retailerPhone: retailerPhone,
        imei: imei || `86${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
        model: model || (platform === 'ios' ? "Apple iPhone 15" : "Android Smartphone"),
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
        lastMessage: platform === 'ios' ? "Welcome to Smart Device Locker Apple Protection" : "Welcome to Smart Device Locker Protection",
        battery: 100,
        network: "Wi-Fi",
        lastSeen: new Date().toISOString()
    };

    db.devices.push(newDevice);
    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        retailerId: retailerId,
        action: "DEVICE_REGISTERED",
        details: `Device ${model} registered for ${customerName} at ${shopName}. Pair Code: ${pairCode}`,
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

    // Attach retailer details
    const ownerUser = (db.users || []).find(u => u.id === device.retailerId);
    const retailerPhone = device.retailerPhone || (ownerUser ? ownerUser.phone : "+91 98765 43210");
    const shopName = device.shopName || (ownerUser ? (ownerUser.shopName || ownerUser.name) : "Smart Device Locker HQ");
    device.retailerPhone = retailerPhone;
    device.shopName = shopName;

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: device.id,
        retailerId: device.retailerId || "USR-SUPERADMIN",
        action: "DEVICE_PAIRED",
        details: `Device ${device.model} (${device.customerName}) verified & paired successfully at ${shopName}.`,
        status: "SUCCESS"
    });

    saveDb(db);
    console.log(`[PAIR SUCCESS] Verified & paired: ${device.id} (${device.customerName}) with generated code ${pairCode}`);

    res.json({
        success: true,
        message: "Device paired successfully!",
        deviceId: device.id,
        device: {
            ...device,
            retailerPhone: retailerPhone,
            shopName: shopName
        }
    });
});

// Send Remote Command (LOCK, UNLOCK, SIREN, MESSAGE, WIPE, UNINSTALL_APP)
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

    // Ownership check for Retailers
    if (req.user && req.user.role === 'retailer' && device.retailerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied. You do not own this device." });
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
    } else if (action === 'UNINSTALL_APP') {
        // Force uninstall: send via WebSocket + set pendingCommand as fallback for poll
        commandPayload.type = "UNINSTALL_APP";
        commandPayload.message = "Shopkeeper ne app uninstall karne ka command bheja hai.";
        device.pendingCommand = 'UNINSTALL_APP'; // poll fallback
        device.status = "uninstalled";
    }

    // Push via WebSocket (instant delivery if device is online)
    const isSent = sendCommandToDevice(device.id, commandPayload);

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        retailerId: device.retailerId || "USR-SUPERADMIN",
        action: `COMMAND_${action}`,
        details: `Command ${action} executed by ${req.user ? req.user.name : 'Admin'}. Dispatched Live: ${isSent}`,
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

    // Capture location query parameters if provided
    if (req.query.lat && req.query.lng) {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
            device.location = {
                lat: lat,
                lng: lng,
                accuracy: req.query.acc ? parseFloat(req.query.acc) : null,
                mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
                updatedAt: new Date().toISOString()
            };
        }
    }

    if (req.query.battery) {
        const bat = parseInt(req.query.battery);
        if (!isNaN(bat)) device.battery = bat;
    }

    // Deliver pendingCommand once (one-shot: clear after sending)
    const pendingCommand = device.pendingCommand || '';
    if (pendingCommand) {
        device.pendingCommand = ''; // Clear after delivery
    }
    saveDb(db);

    const ownerUser = (db.users || []).find(u => u.id === device.retailerId);
    const retailerPhone = device.retailerPhone || (ownerUser ? ownerUser.phone : "+91 98765 43210");
    const shopName = device.shopName || (ownerUser ? (ownerUser.shopName || ownerUser.name) : "Smart Device Locker HQ");

    res.json({
        success: true,
        deviceId: device.id,
        location: device.location || null,
        isLocked: device.isLocked,
        sirenActive: device.sirenActive,
        message: device.lastMessage,
        offlineMasterCode: device.offlineMasterCode || '',
        dueDate: device.dueDate || '',
        retailerPhone: retailerPhone,
        shopName: shopName,
        pendingCommand: pendingCommand
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

    if (req.user && req.user.role === 'retailer' && device.retailerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied." });
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
            retailerId: device.retailerId || "USR-SUPERADMIN",
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

// Allow Uninstall (Shop Owner grants permission to uninstall app)
app.post('/api/devices/:id/allow-uninstall', requireAuth, (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const device = db.devices.find(d => d.id === deviceId);

    if (!device) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    // Retailer only for their own devices
    if (req.user && req.user.role === 'retailer' && device.retailerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Set pendingCommand — Android app will pick this up on next poll
    device.pendingCommand = 'ALLOW_UNINSTALL';

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        retailerId: device.retailerId || "USR-SUPERADMIN",
        action: "ALLOW_UNINSTALL",
        details: `Shop owner granted uninstall permission for ${device.customerName || deviceId}.`,
        status: "SUCCESS"
    });

    saveDb(db);
    res.json({ success: true, message: "Uninstall permission sent to device." });
});

// Update Device Live Location
app.post('/api/devices/:id/location', (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const device = db.devices.find(d => d.id === deviceId || d.imei === deviceId);

    if (!device) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    const { lat, lng, accuracy } = req.body;
    if (lat && lng) {
        device.location = {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            accuracy: accuracy ? parseFloat(accuracy) : null,
            mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
            updatedAt: new Date().toISOString()
        };
        device.lastSeen = new Date().toISOString();
        saveDb(db);
        return res.json({ success: true, location: device.location });
    }

    res.status(400).json({ success: false, message: "Valid latitude and longitude required." });
});

// Delete Device
app.delete('/api/devices/:id', (req, res) => {
    const db = loadDb();
    const deviceId = req.params.id;
    const deviceIndex = db.devices.findIndex(d => d.id === deviceId);

    if (deviceIndex === -1) {
        return res.status(404).json({ success: false, message: "Device not found." });
    }

    const device = db.devices[deviceIndex];
    if (req.user && req.user.role === 'retailer' && device.retailerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    const removedDevice = db.devices.splice(deviceIndex, 1)[0];

    db.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        retailerId: removedDevice.retailerId || "USR-SUPERADMIN",
        action: "DEVICE_DELETED",
        details: `Device ${deviceId} (${removedDevice.customerName} - ${removedDevice.model}) was permanently removed from system by ${req.user ? req.user.name : 'Admin'}.`,
        status: "SUCCESS"
    });

    saveDb(db);
    res.json({ success: true, message: `Device ${deviceId} deleted successfully.` });
});

// Get Audit Logs (Filtered by Shop / Retailer)
app.get('/api/logs', (req, res) => {
    const db = loadDb();
    let logs = db.logs || [];

    if (req.user && req.user.role === 'retailer') {
        const myDeviceIds = new Set(db.devices.filter(d => d.retailerId === req.user.id).map(d => d.id));
        logs = logs.filter(l => l.retailerId === req.user.id || myDeviceIds.has(l.deviceId));
    } else {
        const pairedIds = new Set(db.devices.filter(d => d.isPaired).map(d => d.id));
        logs = logs.filter(l => !l.deviceId || pairedIds.has(l.deviceId) || l.deviceId === "ADMIN" || l.deviceId === "SYSTEM");
    }

    res.json(logs);
});

// =========================================================================
// 🍏 APPLE iOS MDM & CONFIGURATION PROFILE (OTA ENROLLMENT) SYSTEM
// =========================================================================

// Generate Apple XML Configuration Profile (.mobileconfig)
function generateIosProfile(device, origin) {
    const orgName = device ? (device.shopName || "Smart Device Locker") : "Smart Device Locker";
    const devId = device ? device.id : "DEV-GENERIC";
    const custName = device ? (device.customerName || "Customer") : "Customer";
    const retailerPhone = device ? (device.retailerPhone || "+91 98765 43210") : "+91 98765 43210";
    const profileUuid = crypto.randomUUID ? crypto.randomUUID() : `SDL-UUID-${Date.now()}`;
    const webClipUuid = `SDL-WEBCLIP-${Date.now()}`;
    const mdmUuid = `SDL-MDM-${Date.now()}`;
    const accessUuid = `SDL-ACCESS-${Date.now()}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadDescription</key>
    <string>Enforces authorized EMI device protection, due reminders, and remote lost mode management.</string>
    <key>PayloadDisplayName</key>
    <string>Smart Locker EMI Protection (${orgName})</string>
    <key>PayloadIdentifier</key>
    <string>com.smartlocker.ios.profile.${devId}</string>
    <key>PayloadOrganization</key>
    <string>${orgName}</string>
    <key>PayloadRemovalDisallowed</key>
    <true/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUuid}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadContent</key>
    <array>
        <!-- 1. Web Clip for Customer EMI Portal & Payment -->
        <dict>
            <key>FullScreen</key>
            <true/>
            <key>IsRemovable</key>
            <false/>
            <key>Label</key>
            <string>Smart Locker</string>
            <key>PayloadDescription</key>
            <string>Access your monthly EMI schedule, payment gateway, and shopkeeper support.</string>
            <key>PayloadDisplayName</key>
            <string>Smart Locker EMI Portal</string>
            <key>PayloadIdentifier</key>
            <string>com.apple.webClip.managed.${devId}</string>
            <key>PayloadType</key>
            <string>com.apple.webClip.managed</string>
            <key>PayloadUUID</key>
            <string>${webClipUuid}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>Precomposed</key>
            <true/>
            <key>URL</key>
            <string>${origin}/ios/client.html?id=${encodeURIComponent(devId)}</string>
        </dict>
        <!-- 2. Apple MDM Configuration Payload -->
        <dict>
            <key>AccessRights</key>
            <integer>8191</integer>
            <key>CheckInURL</key>
            <string>${origin}/ios/mdm/checkin?id=${encodeURIComponent(devId)}</string>
            <key>CheckOutWhenRemoved</key>
            <true/>
            <key>IdentityCertificateUUID</key>
            <string>${profileUuid}</string>
            <key>PayloadDescription</key>
            <string>Configures Apple Managed Lost Mode, remote lockdown, and security policies.</string>
            <key>PayloadDisplayName</key>
            <string>Apple MDM Service</string>
            <key>PayloadIdentifier</key>
            <string>com.apple.mdm.${devId}</string>
            <key>PayloadType</key>
            <string>com.apple.mdm</string>
            <key>PayloadUUID</key>
            <string>${mdmUuid}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>ServerURL</key>
            <string>${origin}/ios/mdm/server?id=${encodeURIComponent(devId)}</string>
            <key>SignMessage</key>
            <false/>
            <key>Topic</key>
            <string>com.apple.mgmt.external.${devId}</string>
        </dict>
        <!-- 3. Security Restrictions Payload -->
        <dict>
            <key>PayloadDescription</key>
            <string>Protects device against unauthorized removal or diagnostic changes.</string>
            <key>PayloadDisplayName</key>
            <string>Security Restrictions</string>
            <key>PayloadIdentifier</key>
            <string>com.apple.applicationaccess.${devId}</string>
            <key>PayloadType</key>
            <string>com.apple.applicationaccess</string>
            <key>PayloadUUID</key>
            <string>${accessUuid}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>allowDiagnosticSubmission</key>
            <false/>
            <key>allowFingerprintForUnlock</key>
            <true/>
        </dict>
    </array>
</dict>
</plist>`;
}

// 1. iOS Enrollment Landing Page
app.get('/ios/enroll', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'ios', 'enroll.html'));
});

// 2. Download Apple Configuration Profile (.mobileconfig)
app.get(['/ios/enroll.mobileconfig', '/ios/profile.mobileconfig'], (req, res) => {
    const db = loadDb();
    const pairCode = String(req.query.pairCode || req.query.code || '').trim();
    const deviceId = String(req.query.id || req.query.deviceId || '').trim();

    let device = null;
    if (pairCode) {
        device = db.devices.find(d => String(d.pairCode).trim() === pairCode);
    } else if (deviceId) {
        device = db.devices.find(d => d.id === deviceId);
    }

    if (device) {
        device.platform = 'ios';
        device.isPaired = true;
        device.lastSeen = new Date().toISOString();
        db.logs.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            deviceId: device.id,
            retailerId: device.retailerId || "USR-SUPERADMIN",
            action: "IOS_ENROLLED",
            details: `Apple iPhone (${device.model}) enrolled with OTA MDM Profile at ${device.shopName || 'Shop'}.`,
            status: "SUCCESS"
        });
        saveDb(db);
    }

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const origin = `${protocol}://${host}`;

    const profileXml = generateIosProfile(device, origin);

    res.set({
        'Content-Type': 'application/x-apple-aspen-config; charset=utf-8',
        'Content-Disposition': `attachment; filename="SmartDeviceLocker_${device ? device.id : 'Profile'}.mobileconfig"`
    });
    res.send(profileXml);
});

// 3. Apple MDM CheckIn Endpoint (Authenticate, TokenUpdate, CheckOut)
app.all('/ios/mdm/checkin', (req, res) => {
    const deviceId = req.query.id || req.query.deviceId || '';
    console.log(`[Apple MDM CheckIn] Received for device: ${deviceId}`);

    if (deviceId) {
        const db = loadDb();
        const device = db.devices.find(d => d.id === deviceId);
        if (device) {
            device.platform = 'ios';
            device.isPaired = true;
            device.lastSeen = new Date().toISOString();
            saveDb(db);
        }
    }

    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Status</key>
    <string>Acknowledged</string>
</dict>
</plist>`);
});

// 4. Apple MDM Server Endpoint (Command Delivery & Lost Mode)
app.all('/ios/mdm/server', (req, res) => {
    const deviceId = req.query.id || req.query.deviceId || '';
    const db = loadDb();
    const device = db.devices.find(d => d.id === deviceId);

    res.set('Content-Type', 'application/xml');

    if (!device) {
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Status</key><string>Acknowledged</string></dict></plist>`);
    }

    device.lastSeen = new Date().toISOString();

    // Check if device is in Locked / Lost Mode
    if (device.isLocked) {
        const lockMsg = device.lastMessage || `⚠️ Device Locked: Monthly EMI payment is overdue. Please contact ${device.shopName || 'Shop'} to unlock.`;
        const phone = device.retailerPhone || '+91 98765 43210';
        const footnote = `Managed by ${device.shopName || 'Smart Device Locker'}`;

        saveDb(db);
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CommandUUID</key>
    <string>CMD-LOCK-${Date.now()}</string>
    <key>Command</key>
    <dict>
        <key>RequestType</key>
        <string>EnableLostMode</string>
        <key>Message</key>
        <string>${lockMsg}</string>
        <key>PhoneNumber</key>
        <string>${phone}</string>
        <key>Footnote</key>
        <string>${footnote}</string>
    </dict>
</dict>
</plist>`);
    }

    if (device.sirenActive) {
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CommandUUID</key>
    <string>CMD-SIREN-${Date.now()}</string>
    <key>Command</key>
    <dict>
        <key>RequestType</key>
        <string>PlayLostModeSound</string>
    </dict>
</dict>
</plist>`);
    }

    // Default Idle status
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CommandUUID</key>
    <string>CMD-IDLE-${Date.now()}</string>
    <key>Command</key>
    <dict>
        <key>RequestType</key>
        <string>DeviceInformation</string>
        <key>Queries</key>
        <array>
            <string>BatteryLevel</string>
            <string>DeviceName</string>
            <string>OSVersion</string>
            <string>ModelName</string>
        </array>
    </dict>
</dict>
</plist>`);
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`\n======================================================`);
    console.log(`🛡️ SMART DEVICE LOCKER MULTI-TENANT BACKEND RUNNING!`);
    console.log(`🔗 Web Dashboard URL:    http://localhost:${PORT}`);
    console.log(`📱 Mobile Network IP:    http://${localIp}:${PORT}`);
    console.log(`⚡ WebSocket Server:     ws://${localIp}:${PORT}`);
    console.log(`======================================================\n`);
});
