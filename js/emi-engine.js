/* Tiger Locker - EMI Schedule & Automated Grace Period Engine (js/emi-engine.js) */

class EMIEngine {
    constructor() {
        this.db = window.db;
        this.api = window.api;
    }

    // Fast-Forward Time by 30 days to simulate EMI Due / Overdue Auto-Lock
    simulateFastForward30Days() {
        const emiPlans = this.db.getEmiPlans();
        let changedCount = 0;

        emiPlans.forEach(emi => {
            if (emi.status === 'PENDING') {
                emi.status = 'OVERDUE';
                changedCount++;

                // Automated Rule: Lock the corresponding device due to payment default
                const lockMsg = `आपकी मासिक किश्त ₹${emi.amount.toLocaleString()} (किश्त #${emi.installmentNo}) देय तिथि निकल चुकी है। कृपया तुरंत जमा करें।`;
                this.api.sendDeviceCommand(emi.imei, 'LOCK_DEVICE', lockMsg);

                this.db.addAuditLog({
                    id: 'log_' + Date.now(),
                    timestamp: new Date().toISOString(),
                    action: 'AUTO_LOCK_TRIGGERED',
                    imei: emi.imei,
                    operator: 'System Auto-Rules Engine',
                    details: `Automated lock applied. Installment #${emi.installmentNo} overdue by 30 days.`,
                    status: 'SUCCESS'
                });
            }
        });

        this.db.save();
        return { success: true, changedCount };
    }

    // Calculate monthly EMI formula
    calculateMonthlyEmi(totalPrice, downPayment, tenureMonths) {
        const principal = totalPrice - downPayment;
        if (principal <= 0 || tenureMonths <= 0) return 0;
        // Simple flat 10% annual interest rate for demonstration
        const interestRate = 0.10;
        const totalAmountWithInterest = principal * (1 + interestRate * (tenureMonths / 12));
        return Math.round(totalAmountWithInterest / tenureMonths);
    }
}

window.emiEngine = new EMIEngine();
