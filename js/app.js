/* Tiger Locker - Master Application Entrypoint (js/app.js) */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[TIGER LOCKER] Multi-language system initialized.');

    // Language Selector Event Listener
    const langSelect = document.getElementById('lang-selector');
    if (langSelect) {
        // Set initial selected value from i18n stored setting
        langSelect.value = window.i18n.currentLang;

        langSelect.addEventListener('change', (e) => {
            const newLang = e.target.value;
            window.i18n.setLanguage(newLang);
            window.sellerPortal.renderAll();
            window.customerDevice.syncDeviceState();
            window.sellerPortal.showToast(`Language switched to: ${newLang.toUpperCase()}`, 'info');
        });
    }

    // Fast-Forward +30 Days Button (Simulates Overdue EMI & Auto Lock)
    const btnFastForward = document.getElementById('btn-fast-forward');
    if (btnFastForward) {
        btnFastForward.addEventListener('click', () => {
            const res = window.emiEngine.simulateFastForward30Days();
            window.sellerPortal.renderAll();
            window.customerDevice.syncDeviceState();
            window.sellerPortal.showToast(`Simulate +30 Days: ${res.changedCount} EMI overdue & Auto-lock applied!`, 'warning');
        });
    }

    // Reset Demo Data Button
    const btnReset = document.getElementById('btn-reset-demo');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (confirm('क्या आप डेमो डेटा को रिसेट करना चाहते हैं? / Reset Demo Data?')) {
                window.db.reset();
                window.sellerPortal.renderAll();
                window.customerDevice.syncDeviceState();
                window.sellerPortal.showToast('Demo Data Reset Successfully!', 'info');
            }
        });
    }
});
