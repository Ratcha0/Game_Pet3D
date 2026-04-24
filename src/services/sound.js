/**
 * SoundManager - ระบบเสียงสังเคราะห์และ Royalty-Free SFX
 * ปราศจากปัญหาลิขสิทธิ์ 100% (สร้างเสียงจาก Web Audio API)
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        // โหลดสถานะเดิมที่เคยตั้งไว้ (Default เป็น true ถ้ายังไม่เคยตั้ง)
        this.enabled = localStorage.getItem('pw3d_sfx_enabled') !== 'false';
        this.musicEnabled = localStorage.getItem('pw3d_music_enabled') !== 'false';
        
        // --- ส่วนที่ปรับความดังได้ง่ายๆ ตรงนี้ครับ ---
        this.masterVolume = 0.5; // ความดังเสียงเอฟเฟกต์ทั่วไป (0.0 - 1.0)
        this.bgmVolume = 0.05;   // ความดังเพลงพื้นหลัง (0.0 - 1.0)
        
        this.assets = {};
        this.sounds = {
            meow: '/cat.mp3'
        };
        // Pre-load assets
        Object.keys(this.sounds).forEach(key => {
            const audio = new Audio(this.sounds[key]);
            audio.crossOrigin = "anonymous";
            audio.preload = "auto";
            this.assets[key] = audio;
        });
    }

    // --- ✨ สังเคราะห์เสียงฉลองเลเวลอัป (Level Up Fanfare) ---
    playLevelUp() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        
        // ทำนองแบบ Arpeggio (C4 -> E4 -> G4 -> C5)
        const notes = [261.63, 329.63, 392.00, 523.25]; 
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square'; // เสียงแบบ 8-bit เกมกด
            osc.frequency.setValueAtTime(freq, now + (i * 0.12));
            
            gain.gain.setValueAtTime(0, now + (i * 0.12));
            gain.gain.linearRampToValueAtTime(0.05 * this.masterVolume, now + (i * 0.12) + 0.02);
            gain.gain.linearRampToValueAtTime(0, now + (i * 0.12) + 0.3);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now + (i * 0.12));
            osc.stop(now + (i * 0.12) + 0.3);
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
        localStorage.setItem('pw3d_sfx_enabled', this.enabled);
        return this.enabled;
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        localStorage.setItem('pw3d_music_enabled', this.musicEnabled);
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
    
    // --- สังเคราะห์เสียงแตร (Car Honk) - ปรับปรุงให้เป็น Dual Tone เหมือนแตรจริง ---
    playHonk() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        
        // ความถี่คู่ (Major Third) ทำให้เสียงแตรดูมีน้ำหนักและสมจริง
        [440, 554].forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.04 * this.masterVolume, now + 0.02);
            gain.gain.linearRampToValueAtTime(0, now + 0.25);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.25);
        });
    }

    // --- BACKGROUND MUSIC (Local MP3 Asset) ---
    startBGM() {
        if (!this.musicEnabled || this.bgm) return;
        
        const bgmUrl = '/Music/Sugar_Coated_Combo.mp3';
        
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
        }
    }

    playAsset(name) {
        if (!this.enabled) return;
        this.init(); 

        const now = this.ctx.currentTime;

        // --- 🐱 เล่นเสียงแมวจริงจากไฟล์ ---
        if (name === 'meow') {
            if (!this.assets.meow) return;
            const audio = this.assets.meow.cloneNode();
            audio.volume = 0.6 * this.masterVolume;
            audio.play().catch(e => console.warn("Cat sound blocked:", e));
            return;
        }

        // --- 🌿 สังเคราะห์เสียงพฤกษา (Nature/Sparkle) ---
        if (name === 'bell') {
            const notes = [1200, 1500, 1800, 2200];
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.05);
                gain.gain.setValueAtTime(0, now + i * 0.05);
                gain.gain.linearRampToValueAtTime(0.02 * this.masterVolume, now + i * 0.05 + 0.02);
                gain.gain.linearRampToValueAtTime(0, now + i * 0.05 + 0.2);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.05);
                osc.stop(now + i * 0.05 + 0.2);
            });
            return;
        }

        // --- ✨ เสียงฉลองเลเวลอัป ---
        if (name === 'level') {
            this.playLevelUp();
            return;
        }

        if (name === 'click') {
            this.playClick();
            return;
        }
        if (name === 'error') {
            this.playError();
            return;
        }

        if (!this.assets[name]) return;
        const audio = this.assets[name].cloneNode();
        audio.volume = 0.5 * this.masterVolume;
        audio.play().catch(() => {});
    }
}

export const SFX = new SoundManager();
