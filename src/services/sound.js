/**
 * SoundManager - ระบบเสียงสังเคราะห์และ Royalty-Free SFX
 * ปราศจากปัญหาลิขสิทธิ์ 100% (สร้างเสียงจาก Web Audio API)
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;      // สำหรับ SFX
        this.musicEnabled = true; // สำหรับ BGM
        
        // --- ส่วนที่ปรับความดังได้ง่ายๆ ตรงนี้ครับ ---
        this.masterVolume = 0.5; // ความดังเสียงเอฟเฟกต์ทั่วไป (0.0 - 1.0)
        this.bgmVolume = 0.3;   // ความดังเพลงพื้นหลัง (0.0 - 1.0)
        
        this.assets = {};
        this.sounds = {
            meow: 'https://actions.google.com/sounds/v1/animals/cat_meow.ogg',
            level: 'https://actions.google.com/sounds/v1/cartoon/congrats.ogg',
            bell: 'https://actions.google.com/sounds/v1/cartoon/clink_clank.ogg'
        };
        // Pre-load assets
        Object.keys(this.sounds).forEach(key => {
            const audio = new Audio(this.sounds[key]);
            audio.load();
            this.assets[key] = audio;
        });
    }

    async init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        if (this.musicEnabled) this.startBGM(); 
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        if (!this.musicEnabled) this.stopBGM();
        else this.startBGM();
        return this.musicEnabled;
    }

    // เสียงความสำเร็จที่น่าตื่นเต้น (Synthesized Fanfare)
    playJingle() {
        if (!this.enabled) return;
        this.init();
        
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            
            gain.gain.setValueAtTime(0.05 * this.masterVolume, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.15);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.15);
        });
    }

    playCoin() {
        if (!this.enabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(987.77, this.ctx.currentTime); 
        osc.frequency.exponentialRampToValueAtTime(1318.51, this.ctx.currentTime + 0.1); 

        gain.gain.setValueAtTime(0.05 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playSpawn() {
        if (!this.enabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.03 * this.masterVolume, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playClick() {
        if (!this.enabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.05 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playError() {
        if (!this.enabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.03 * this.masterVolume, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    // --- BACKGROUND MUSIC (Local MP3 Asset) ---
    startBGM() {
        if (!this.enabled || this.bgm) return;
        
        const bgmUrl = '/Music/Sugar_Coated_Combo.mp3';
        console.log("🎵 SoundManager: Playing Local BGM Asset...");
        
        this.bgm = new Audio(bgmUrl);
        this.bgm.loop = true;
        this.bgm.volume = 0; 
        
        this.bgm.play().then(() => {
            let vol = 0;
            const targetVol = this.bgmVolume || 0.15;
            const fade = setInterval(() => {
                vol += 0.01;
                if (this.bgm) this.bgm.volume = vol;
                if (vol >= targetVol) clearInterval(fade);
            }, 50);
        }).catch(e => console.warn("BGM Play Blocked:", e));
    }

    stopBGM() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm = null;
            console.log("🎵 SoundManager: BGM Stopped.");
        }
    }

    playAsset(name) {
        if (!this.enabled || !this.assets[name]) return;
        const audio = this.assets[name].cloneNode();
        audio.volume = 0.5 * this.masterVolume;
        audio.play().catch(() => {});
    }
}

export const SFX = new SoundManager();
