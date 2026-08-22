/* Tiger Locker - Internationalization / Multi-Language Support System (js/i18n.js) */

const translations = {
    en: {
        app_title: "SMART DEVICE LOCKER",
        app_subtitle: "EMI & REMOTELY AUTHORIZED DEVICE MANAGEMENT SYSTEM",
        server_status: "Backend Cloud Server: <strong>ONLINE (HTTPS Encrypted)</strong>",
        reset_demo: "Reset Demo Data",
        fast_forward: "Simulate +30 Days (EMI Missed)",

        // Nav Tabs
        tab_dashboard: "Dashboard",
        tab_add_device: "Add Customer & Device",
        tab_devices_list: "Managed Devices",
        tab_emi_payments: "EMI & Payments",
        tab_audit_logs: "Audit Security Logs",

        // Metrics
        metric_total_devices: "Total Managed Devices",
        metric_active_devices: "Active Devices",
        metric_locked_devices: "Locked Devices",
        metric_pending_emi: "Pending Overdue EMI",

        // Dashboard Headings & Console
        live_commands_header: "Live Command Stream",
        remote_console_header: "Selected Device Remote Console",
        select_device_label: "Select Device to Control:",
        cust_name_label: "Customer Name:",
        imei_number_label: "IMEI Number:",
        device_status_label: "Device Status:",

        // Remote Action Buttons
        btn_cmd_lock: "Lock Device",
        btn_cmd_unlock: "Unlock Device",
        btn_cmd_msg: "Send Message",
        btn_cmd_sound: "Alarm Siren",
        btn_cmd_info: "SIM & Battery Status",
        btn_cmd_wipe: "Remote Data Wipe",

        // Add Device Form
        form_title: "Register New Customer & Device",
        form_sec_1: "1. Customer Info & KYC Details",
        cust_name_input_label: "Customer Full Name *",
        cust_phone_input_label: "Mobile Number *",
        cust_kyc_input_label: "Aadhaar / PAN (KYC Number)",

        form_sec_2: "2. Device Hardware Details",
        dev_model_input_label: "Device Model Name *",
        dev_imei_input_label: "IMEI / Serial Number (15 Digits) *",

        form_sec_3: "3. EMI & Payment Plan",
        total_price_label: "Total Device Price (₹) *",
        down_payment_label: "Down Payment (₹) *",
        tenure_label: "EMI Tenure (Months) *",
        monthly_emi_label: "Calculated Monthly EMI",
        btn_add_device_submit: "Register Device & Generate QR / Pairing Code",

        // Tables
        th_imei: "IMEI / ID",
        th_customer: "Customer Info",
        th_model: "Model",
        th_emi_status: "EMI Status",
        th_device_status: "Device Status",
        th_last_ping: "Last Ping",
        th_actions: "Actions",

        th_installment_no: "Installment #",
        th_amount: "Amount (₹)",
        th_due_date: "Due Date",
        th_payment_status: "Payment Status",

        th_timestamp: "Timestamp",
        th_action_type: "Action Type",
        th_operator: "Operator / Seller",
        th_details: "Details / Reason",

        // Phone Simulator
        sim_phone_title: "Customer Android Phone (Live Simulator)",
        sim_welcome_title: "TIGER LOCKER",
        sim_welcome_sub: "Device Security & EMI Control Agent",
        sim_pair_title: "Pair New Device",
        sim_pair_desc: "Enter 6-digit pairing code from Seller Dashboard:",
        sim_btn_pair: "Register & Connect Device",
        sim_perm_notice: "Device Admin Permission required during registration.",

        sim_user_greeting: "Hello,",
        sim_status_protected: "Protected",
        sim_card_device_info: "Device Status",
        sim_card_emi_info: "Upcoming EMI Payment",
        sim_btn_pay_now: "Pay Installment Now (UPI)",

        sim_locked_header: "Device Remotely Locked",
        sim_lock_reason: "EMI Payment Overdue",
        sim_btn_lock_pay: "Pay Installment Online (UPI)",
        sim_btn_lock_call: "Call Seller Support",
        sim_siren_title: "SIREN ALARM ACTIVE",
        sim_siren_desc: "Security alarm triggered by Seller!"
    },

    hi: {
        app_title: "SMART DEVICE LOCKER",
        app_subtitle: "EMI & डिवाइस रिमोट कंट्रोल सिस्टम",
        server_status: "बैकएंड सर्वर: <strong>ऑनलाइन (HTTPS Encrypted)</strong>",
        reset_demo: "रिसेट डेमो डेटा",
        fast_forward: "सिमुलेट +30 दिन (EMI Missed)",

        // Nav Tabs
        tab_dashboard: "डैशबोर्ड",
        tab_add_device: "नया ग्राहक & डिवाइस",
        tab_devices_list: "मैनेज्ड डिवाइस लिस्ट",
        tab_emi_payments: "EMI & किश्त भुगतान",
        tab_audit_logs: "ऑडिट लॉग्स (Security)",

        // Metrics
        metric_total_devices: "कुल मैनेज्ड डिवाइस",
        metric_active_devices: "एक्टिव डिवाइसेस",
        metric_locked_devices: "लॉक्ड डिवाइसेस",
        metric_pending_emi: "पेंडिंग किश्तें (EMI Due)",

        // Dashboard Headings & Console
        live_commands_header: "रिमोट कंट्रोल कमांड स्ट्रीम (Live Commands)",
        remote_console_header: "सिलेक्टेड डिवाइस रिमोट कंसोल",
        select_device_label: "कंट्रोल करने के लिए डिवाइस चुनें:",
        cust_name_label: "ग्राहक का नाम:",
        imei_number_label: "IMEI नंबर:",
        device_status_label: "डिवाइस स्टेटस:",

        // Remote Action Buttons
        btn_cmd_lock: "लॉक डिवाइस",
        btn_cmd_unlock: "अनलॉक डिवाइस",
        btn_cmd_msg: "मैसेज भेजें",
        btn_cmd_sound: "अलार्म सायरन",
        btn_cmd_info: "सिम व बैटरी स्टेटस",
        btn_cmd_wipe: "रिमोट डेटा वाइप",

        // Add Device Form
        form_title: "नया ग्राहक और डिवाइस रजिस्टर करें",
        form_sec_1: "1. ग्राहक विवरण (Customer Info & KYC)",
        cust_name_input_label: "ग्राहक का नाम (Customer Name) *",
        cust_phone_input_label: "मोबाइल नंबर (Mobile Number) *",
        cust_kyc_input_label: "आधार / PAN (KYC Number)",

        form_sec_2: "2. डिवाइस डिटेल्स (Device Hardware Details)",
        dev_model_input_label: "डिवाइस मॉडल (Model Name) *",
        dev_imei_input_label: "IMEI / Serial Number (15 Digits) *",

        form_sec_3: "3. EMI & भुगतान योजना (Payment Plan)",
        total_price_label: "कुल डिवाइस कीमत (Total Price ₹) *",
        down_payment_label: "डाउन पेमेंट (Down Payment ₹) *",
        tenure_label: "EMI अवधि (Tenure Months) *",
        monthly_emi_label: "मासिक EMI किश्त (Calculated Monthly EMI)",
        btn_add_device_submit: "डिवाइस ऐड करें और QR/पेयरिंग कोड जनरेट करें",

        // Tables
        th_imei: "IMEI / ID",
        th_customer: "ग्राहक विवरण",
        th_model: "मॉडल",
        th_emi_status: "EMI स्टेटस",
        th_device_status: "डिवाइस स्टेटस",
        th_last_ping: "लास्ट पिंग",
        th_actions: "एक्शंस",

        th_installment_no: "किश्त #",
        th_amount: "राशि (₹)",
        th_due_date: "देय तिथि (Due Date)",
        th_payment_status: "भुगतान स्टेटस",

        th_timestamp: "टाइमस्टैम्प",
        th_action_type: "एक्शन प्रकार",
        th_operator: "ऑपरेटर / सेलर",
        th_details: "कारण / विवरण",

        // Phone Simulator
        sim_phone_title: "ग्राहक का एंड्रॉइड फोन (Live Simulator)",
        sim_welcome_title: "TIGER LOCKER",
        sim_welcome_sub: "डिवाइस सुरक्षा एवं EMI कंट्रोल एजेंट",
        sim_pair_title: "डिवाइस पेयर करें",
        sim_pair_desc: "सेलर डैशबोर्ड से प्राप्त 6-अंकों का पेयरिंग कोड डालें:",
        sim_btn_pair: "डिवाइस रजिस्टर व कनेक्ट करें",
        sim_perm_notice: "रजिस्ट्रेशन के समय Device Admin अनुमति आवश्यक है।",

        sim_user_greeting: "नमस्ते,",
        sim_status_protected: "संरक्षित",
        sim_card_device_info: "डिवाइस स्थिति",
        sim_card_emi_info: "आगामी EMI किश्त",
        sim_btn_pay_now: "अभी किश्त जमा करें (Pay UPI)",

        sim_locked_header: "डिवाइस लॉक कर दिया गया है",
        sim_lock_reason: "EMI भुगतान देय है",
        sim_btn_lock_pay: "किश्त ऑनलाइन जमा करें (UPI)",
        sim_btn_lock_call: "सेलर को कॉल करें (Support)",
        sim_siren_title: "तेज़ अलार्म (SIREN ACTIVE)",
        sim_siren_desc: "सेलर द्वारा सुरक्षा सायरन ट्रिगर किया गया है!"
    },

    hinglish: {
        app_title: "SMART DEVICE LOCKER",
        app_subtitle: "EMI & REMOTELY AUTHORIZED DEVICE MANAGEMENT SYSTEM",
        server_status: "Backend Cloud Server: <strong>ONLINE (HTTPS Encrypted)</strong>",
        reset_demo: "Reset Demo Data",
        fast_forward: "Simulate +30 Days (EMI Missed)",

        // Nav Tabs
        tab_dashboard: "Dashboard",
        tab_add_device: "Naya Customer & Device Add Kare",
        tab_devices_list: "Managed Devices List",
        tab_emi_payments: "EMI & Payment Tracker",
        tab_audit_logs: "Security Audit Logs",

        // Metrics
        metric_total_devices: "Total Managed Devices",
        metric_active_devices: "Active Devices",
        metric_locked_devices: "Locked Devices",
        metric_pending_emi: "Pending Overdue EMI",

        // Dashboard Headings & Console
        live_commands_header: "Live Commands Stream",
        remote_console_header: "Selected Device Remote Console",
        select_device_label: "Device Control karne ke liye Select kare:",
        cust_name_label: "Customer Ka Naam:",
        imei_number_label: "IMEI Number:",
        device_status_label: "Device Status:",

        // Remote Action Buttons
        btn_cmd_lock: "Lock Device",
        btn_cmd_unlock: "Unlock Device",
        btn_cmd_msg: "Message Bheje",
        btn_cmd_sound: "Alarm Siren",
        btn_cmd_info: "SIM & Battery Status",
        btn_cmd_wipe: "Remote Data Wipe",

        // Add Device Form
        form_title: "Naya Customer & Device Register Kare",
        form_sec_1: "1. Customer Details & KYC",
        cust_name_input_label: "Customer Ka Full Name *",
        cust_phone_input_label: "Mobile Number *",
        cust_kyc_input_label: "Aadhaar / PAN (KYC Number)",

        form_sec_2: "2. Device Details",
        dev_model_input_label: "Device Model Name *",
        dev_imei_input_label: "IMEI / Serial Number (15 Digits) *",

        form_sec_3: "3. EMI & Payment Plan",
        total_price_label: "Total Price (₹) *",
        down_payment_label: "Down Payment (₹) *",
        tenure_label: "Tenure Months *",
        monthly_emi_label: "Monthly EMI Amount",
        btn_add_device_submit: "Device Add Kare & QR / Pairing Code Generate Kare",

        // Tables
        th_imei: "IMEI / ID",
        th_customer: "Customer Info",
        th_model: "Model",
        th_emi_status: "EMI Status",
        th_device_status: "Device Status",
        th_last_ping: "Last Ping",
        th_actions: "Actions",

        th_installment_no: "Installment #",
        th_amount: "Amount (₹)",
        th_due_date: "Due Date",
        th_payment_status: "Payment Status",

        th_timestamp: "Timestamp",
        th_action_type: "Action Type",
        th_operator: "Operator / Seller",
        th_details: "Details / Reason",

        // Phone Simulator
        sim_phone_title: "Customer Android Phone (Live Simulator)",
        sim_welcome_title: "TIGER LOCKER",
        sim_welcome_sub: "Device Security & EMI Control Agent",
        sim_pair_title: "Device Pair Kare",
        sim_pair_desc: "Seller Dashboard se 6-digit pairing code yahan daale:",
        sim_btn_pair: "Register & Connect Device",
        sim_perm_notice: "Device Admin Permission allow karna zaroori hai.",

        sim_user_greeting: "Namaste,",
        sim_status_protected: "Protected",
        sim_card_device_info: "Device Status",
        sim_card_emi_info: "Upcoming EMI Installment",
        sim_btn_pay_now: "Pay EMI Now (UPI)",

        sim_locked_header: "Device Remotely Lock Ho Gaya Hai",
        sim_lock_reason: "EMI Payment Overdue",
        sim_btn_lock_pay: "Pay Installment Online (UPI)",
        sim_btn_lock_call: "Call Seller Support",
        sim_siren_title: "SIREN ALARM ACTIVE",
        sim_siren_desc: "Security Alarm trigger kiya gaya hai!"
    }
};

class I18nEngine {
    constructor() {
        this.currentLang = localStorage.getItem('tiger_locker_lang') || 'en';
        this.init();
    }

    init() {
        this.applyLanguage(this.currentLang);
    }

    setLanguage(lang) {
        if (!translations[lang]) return;
        this.currentLang = lang;
        localStorage.setItem('tiger_locker_lang', lang);
        this.applyLanguage(lang);
    }

    applyLanguage(lang) {
        const dict = translations[lang];
        if (!dict) return;

        // Replace all DOM elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                if (el.tagName === 'INPUT' && el.type === 'placeholder') {
                    el.placeholder = dict[key];
                } else {
                    el.innerHTML = dict[key];
                }
            }
        });
    }

    t(key) {
        return translations[this.currentLang][key] || key;
    }
}

window.i18n = new I18nEngine();
