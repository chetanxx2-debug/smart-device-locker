/* Tiger Locker - FCM Push Notification & Alarm Synthesizer (js/fcm.js) */

class FCMBus {
    constructor() {
        this.listeners = [];
        this.audioCtx = null;
        this.sirenOscillator = null;
        this.sirenGain = null;
        this.isSirenPlaying = false;
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    publish(notification) {
        // Notification payload: { imei, type, title, body, payload, timestamp }
        console.log('[FCM DISPATCH]', notification);
        this.listeners.forEach(cb => cb(notification));
    }

    // Play Alarm Siren using Web Audio API Synthesizer
    startSirenSound() {
        if (this.isSirenPlaying) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);

            // Alternate frequency between 800Hz and 1400Hz (Police Siren pattern)
            let high = false;
            this.sirenInterval = setInterval(() => {
                if (!this.audioCtx) return;
                osc.frequency.setValueAtTime(high ? 1400 : 800, this.audioCtx.currentTime);
                high = !high;
            }, 300);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start();

            this.sirenOscillator = osc;
            this.sirenGain = gain;
            this.isSirenPlaying = true;
        } catch (e) {
            console.error('AudioContext not allowed or supported', e);
        }
    }

    stopSirenSound() {
        if (this.sirenInterval) clearInterval(this.sirenInterval);
        if (this.sirenOscillator) {
            try {
                this.sirenOscillator.stop();
                this.sirenOscillator.disconnect();
            } catch (e) {}
        }
        if (this.audioCtx) {
            try { this.audioCtx.close(); } catch (e) {}
        }
        this.isSirenPlaying = false;
    }
}

window.fcmBus = new FCMBus();
