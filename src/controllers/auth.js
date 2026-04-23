import { STATE, saveState, loadState, setUserId } from '../store/state.js';
import { SFX } from '../services/sound.js';

const $ = id => document.getElementById(id);

let currentPin = '';
export let isGameActive = false; // exported to be used by game loop

function updatePinUI() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
        if (index < currentPin.length) {
            dot.classList.add('pin-active');
        } else {
            dot.classList.remove('pin-active');
            dot.classList.remove('pin-error');
            dot.classList.remove('pin-success');
        }
    });

    const isNew = !STATE.pin_code || STATE.pin_code === "";
    const msg = $('pin-msg');
    const pinTitle = $('pin-title');
    const pinIcon = $('pin-icon');

    if (msg) {
        if (msg.innerText.indexOf('สำเร็จ') === -1 && msg.innerText.indexOf('ผิด') === -1) {
            if (isNew) {
                if (pinTitle) pinTitle.innerText = "ตั้งรหัสผ่านใหม่";
                if (pinIcon) pinIcon.innerText = "✨";
                msg.innerHTML = `ยินดีต้อนรับคุณ <span class="text-neon-purple">${STATE.username}</span><br>กรุณาตั้งรหัสผ่าน 4 หลักสำหรับไอดีนี้`;
            } else {
                if (pinTitle) pinTitle.innerText = "ระบบความปลอดภัย";
                if (pinIcon) pinIcon.innerText = "🔒";
                msg.innerHTML = `ยินดีต้อนรับกลับคุณ <span class="text-neon-pink">${STATE.username}</span><br>กรุณาใส่รหัสผ่านเพื่อเข้าสู่ระบบ`;
            }
        }
    }
}

// โค้ดสำหรับพ่นข้อความ (import มาจาก game.js หรือเขียนแยกก็ได้ ในที่นี้เขียนแยกให้ใช้งานง่าย)
function spawnAlert(msg, cls = "text-white") {
    // ใช้เรียก window.spawn ถ้ามี
    if (window.spawn) {
        window.spawn(msg, cls);
    }
}

// --- NEW LOGIN FLOW FUNCTIONS ---
window.confirmUsername = async () => {
    SFX.init(); // ปลุกระบบเสียง
    SFX.playClick();
    const input = $('login-username-input');
    if (!input || !input.value.trim()) {
        spawnAlert('⚠️ กรุณาใส่ชื่อผู้ใช้ก่อนครับ');
        return;
    }

    const name = input.value.trim().substring(0, 15);
    STATE.username = name;
    setUserId(name); // ใช้ชื่อเป็น ID

    // บันทึกลง Session Storage (แคชชั่วคราว)
    sessionStorage.setItem('pw3d_session_user', name);

    // โหลดข้อมูลจาก Cloud/Local
    await loadState();
    
    // บังคับให้ใช้ชื่อที่กรอกมาเป็นชื่อในเกมด้วย (ป้องกันค่าเริ่มต้นมาทับ)
    STATE.username = name;
    
    // อัปเดต UI PIN และหน้าจอหลัก
    updatePinUI();
    if(window.updateUI) window.updateUI();
    
    const step1 = $('login-step-1');
    const step2 = $('login-step-2');
    
    if (step1 && step2) {
        step1.classList.add('opacity-0', '-translate-y-8');
        setTimeout(() => {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            void step2.offsetWidth; // force reflow
            step2.classList.remove('opacity-0', 'translate-y-8');
        }, 300);
    }
};

window.backToStep1 = () => {
    const step1 = $('login-step-1');
    const step2 = $('login-step-2');
    if (step1 && step2) {
        step2.classList.add('opacity-0', 'translate-y-8');
        setTimeout(() => {
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
            void step1.offsetWidth;
            step1.classList.remove('opacity-0', '-translate-y-8');
        }, 300);
    }
};

function verifyPin() {
    const dots = document.querySelectorAll('.pin-dot');
    const isNew = !STATE.pin_code || STATE.pin_code === "";
    
    if (isNew) {
        // --- 1. โหมดตั้งรหัสใหม่ ---
        STATE.pin_code = currentPin;
        saveState(); // บันทึกดึงขึ้น Database ทันที
        
        dots.forEach(d => d.classList.add('pin-success'));
        $('pin-msg').innerText = "สร้างรหัสสำเร็จ! กำลังเข้าสู่ระบบ...";
        $('pin-msg').classList.remove('text-white/50', 'text-red-400');
        $('pin-msg').classList.add('text-green-400');
        
        setTimeout(unlockScreen, 600);
    } else {
        // --- 2. โหมดปลดล็อคปกติ ---
        if (currentPin === STATE.pin_code) {
            dots.forEach(d => d.classList.add('pin-success'));
            $('pin-msg').innerText = "รหัสถูกต้อง! กำลังเข้าสู่ระบบ...";
            $('pin-msg').classList.remove('text-white/50', 'text-red-400');
            $('pin-msg').classList.add('text-green-400');
            setTimeout(unlockScreen, 600);
        } else {
            dots.forEach(d => d.classList.add('pin-error'));
            $('pin-msg').innerText = "รหัสผิด! กรุณาลองใหม่...";
            $('pin-msg').classList.remove('text-white/50', 'text-green-400');
            $('pin-msg').classList.add('text-red-400');
            setTimeout(() => {
                currentPin = '';
                updatePinUI();
            }, 500);
        }
    }
}

function unlockScreen() {
    const screen = $('pin-lock-screen');
    if(screen) {
        screen.classList.add('opacity-0');
        screen.classList.add('scale-110');
        screen.style.pointerEvents = 'none';
        setTimeout(() => screen.remove(), 500); 
        spawnAlert('🔓 ปลดล็อคระบบสำเร็จ!', 'text-emerald-400');
        
        // เริ่มต้นชีวิตสัตว์เลี้ยง (Start Lifecycles)
        isGameActive = true;
    }
}

window._pressPin = (num) => {
    SFX.init(); // ปลุกระบบเสียงและเริ่มเพลงทันทีที่สัมผัสปุ่ม
    if (currentPin.length < 4) {
        currentPin += num;
        SFX.playClick();
        updatePinUI();
        if (currentPin.length === 4) {
            verifyPin();
        }
    }
};

window._clearPin = () => {
    currentPin = '';
    updatePinUI();
};

window._deletePin = () => {
    if (currentPin.length > 0) {
        currentPin = currentPin.slice(0, -1);
        updatePinUI();
    }
};

export const initAuth = async () => {
    // Check if running in admin preview iframe
    const isAdminPreview = window.self !== window.top;
    
    const urlParams = new URLSearchParams(window.location.search);
    const sessionUser = sessionStorage.getItem('pw3d_session_user');
    const urlUserId = urlParams.get('userId'); 
    
    let userId = sessionUser || urlUserId;
    if (!userId && isAdminPreview) userId = 'Beemmy'; // Default for admin preview

    const userNameParam = urlParams.get('username');

    const step1 = $('login-step-1');
    const step2 = $('login-step-2');

    if (userId) {
        setUserId(userId);
        await loadState();
        
        STATE.username = userNameParam || userId;
        updatePinUI();
        
        if (step1 && step2) {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            step2.classList.remove('opacity-0', 'translate-y-8');
        }

        // Automatic bypass for Admin Preview
        if (isAdminPreview) {
            console.log("Admin Preview Detected: Bypassing PIN screen...");
            setTimeout(unlockScreen, 500);
        }
    } else {
        if (step1) {
            step1.classList.remove('hidden');
            setTimeout(() => $('login-username-input')?.focus(), 500);
        }
    }
};
