import { init3D, updateTemplate, updateEnvironment, spawnPoop, setPoopCallbacks, collectPoopByUI, spawnReward, setRewardCallback, updateEngineConfig, updatePetScale } from '../engine/3d_engine.js';
import { logScoreAction, fetchLeaderboard } from '../services/supabase.js';

import { 
    STATE, SPECIAL_QUEST_POOL, 
    loadState, saveState, applyConfigToState, loadAdminConfigLocal, setUserId,
    currentUserId, loadGameConfigCloud
} from '../store/state.js';

const $ = id => document.getElementById(id);

function updateUI() {
    const un=$('hud-username'); if(un) un.innerText=STATE.username;
    const t=$('hud-tokens'); if(t) t.innerText=Math.floor(STATE.tokens).toLocaleString();
    const s=$('hud-score'); if(s) s.innerText=Math.floor(STATE.score).toLocaleString();
    const l=$('hud-level'); if(l) l.innerText=STATE.level;
    const xpBar=$('bar-xp'); if(xpBar) xpBar.style.width=`${(STATE.xp/STATE.maxExp)*100}%`;
    const xpVal=$('hud-xp-val'); if(xpVal) xpVal.innerText=`${Math.floor(STATE.xp)}/${Math.floor(STATE.maxExp)} XP`;

    // Update Shop display from config
    ['small','medium','large'].forEach(tier => {
        const c = $(`shop-cost-${tier}`); if(c) c.innerText = STATE.config.shop[tier].cost;
        const a = $(`shop-amt-${tier}`); if(a) a.innerText = STATE.config.shop[tier].amt;
    });

    const labels = {
        pet:   { h:'ความหิว', l:'ความรัก', c:'ความสะอาด', s:'พลังงาน', af:'ป้อนอาหาร', ac:'อาบน้ำ', ar:'เก็บอึ', ap:'เล่นด้วย' },
        car:   { h:'เชื้อเพลิง', l:'สภาพรถ', c:'ล้างรถ', s:'แบตเตอรี่', af:'เติมน้ำมัน', ac:'ล้างรถ', ar:'ซ่อมบำรุง', ap:'ลองเครื่อง' },
        plant: { h:'ค่าระดับน้ำ', l:'ค่าปุ๋ย', c:'ความสะอาด', s:'ความสดชื่น', af:'รดน้ำ', ac:'ให้ปุ๋ย', ar:'กำจัดแมลง', ap:'เปิดเพลง' }
    };
    // ไอคอนแถบสเตตัส (ด้านซ้าย)
    const statIcons = {
        pet:   { hunger:'🍖', happy:'💖', clean:'🧼', stamina:'⚡' },
        car:   { hunger:'⛽', happy:'🔧', clean:'🚿', stamina:'🔋' },
        plant: { hunger:'💧', happy:'🌱', clean:'🧹', stamina:'☀️' }
    };
    // ไอคอนปุ่มกิจกรรม (ด้านล่าง)
    const actIcons = {
        pet:   { feed:'🍗', clean:'🧼', repair:'💩', play:'🎾' },
        car:   { feed:'⛽', clean:'🚿', repair:'🔧', play:'🏎️' },
        plant: { feed:'💧', clean:'🌿', repair:'🐛', play:'🎵' }
    };
    const cur = labels[STATE.config.template] || labels.pet;
    const si = statIcons[STATE.config.template] || statIcons.pet;
    const ai = actIcons[STATE.config.template] || actIcons.pet;

    // อัปเดตไอคอนแถบสเตตัส
    const ih=$('icon-hunger'); if(ih) ih.innerText = si.hunger;
    const ihp=$('icon-happy'); if(ihp) ihp.innerText = si.happy;
    const ic=$('icon-clean'); if(ic) ic.innerText = si.clean;

    [['bar-hunger','val-hunger',STATE.hunger, cur.h],['bar-happy','val-happy',STATE.love, cur.l],
     ['bar-clean','val-clean',STATE.clean, cur.c],['bar-stamina','val-stamina',STATE.stamina, cur.s]]
    .forEach(([b,v,val,label])=>{
        const maxVal = (b === 'bar-stamina') ? (STATE.maxStamina || 100) : 100;
        const bar = $(b); if(bar) bar.style.width = `${Math.min(100, (val/maxVal)*100)}%`;
        const txt = $(v); if(txt) {
            txt.innerHTML = `${label} <span class="text-white/30 italic">${Math.round(val)}%</span>`;
        }
    });

    // อัปเดตไอคอน + ข้อความ ปุ่มกิจกรรม
    const af=$('lbl-act-feed'); if(af) af.innerText = cur.af;
    const ac=$('lbl-act-clean'); if(ac) ac.innerText = cur.ac;
    const ar=$('lbl-act-repair'); if(ar) ar.innerText = cur.ar;
    const ap=$('lbl-act-play'); if(ap) ap.innerText = cur.ap;
    
    const iaf=$('icon-act-feed'); if(iaf) iaf.innerText = ai.feed;
    const iac=$('icon-act-clean'); if(iac) iac.innerText = ai.clean;
    const iar=$('icon-act-repair'); if(iar) iar.innerText = ai.repair;
    const iap=$('icon-act-play'); if(iap) iap.innerText = ai.play;

    // Update HUD Mood Emoji (Header)
    const moodEl = $('mood-emoji');
    const moodVal = $('mood-val');
    if(moodEl && moodVal) {
        // use 'love' instead of 'happy' for the main mood feeling
        const curLove = Math.round(STATE.love);
        moodVal.innerText = `${curLove}%`;
        if(curLove > 85) moodEl.innerText = '😍';
        else if(curLove > 50) moodEl.innerText = '😊';
        else if(curLove > 20) moodEl.innerText = '😐';
        else moodEl.innerText = '🥺';
    }

    const btnRepair = $('btn-repair');
    if (btnRepair) {
        // Only show manual repair button in "EASY" mode. 
        // In Normal/Hard, players must walk to clean it up.
        const mode = STATE.config.difficulty_mode || 'normal';
        btnRepair.style.display = (mode === 'easy') ? 'flex' : 'none';
    }

    // Season
    const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name;
    const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_weeks}W`;

    // Quest Check for Pure Love
    if(STATE.love >= 100) incrementSpecialQuest('pure_love');

    updateQuestUI();
}

function updateQuestUI() {
    const q = STATE.quests;
    if(!q) return;
    const tiers = ['feed','clean','play'];
    let allDone = true;
    
    tiers.forEach(t => {
        const bar = $(`q-bar-${t}`); if(bar) bar.style.width = `${Math.min(100, (q[t]/q[`${t}_max`])*100)}%`;
        const val = $(`q-val-${t}`); if(val) val.innerText = `${q[t]}/${q[`${t}_max`]}`;
        if(q[t] < q[`${t}_max`]) allDone = false;
    });

    // Special Quest
    const specBar = $('q-bar-special');
    const specVal = $('q-val-special');
    const specLabel = $('q-label-special');
    const specIcon = $('q-icon-special');

    if(specLabel) specLabel.innerText = `Challenge: ${q.special.label}`;
    if(specIcon) specIcon.innerText = q.special.icon;
    if(specBar) specBar.style.width = `${Math.min(100, (q.special.current/q.special.target)*100)}%`;
    if(specVal) specVal.innerText = `${q.special.current}/${q.special.target}`;
    if(q.special.current < q.special.target) allDone = false;

    // Show Buff Icon next to stamina if active
    const buffIcon = $('stamina-buff-icon');
    if(buffIcon) {
        const isActive = STATE.buffs.regen > 1 && Date.now() < STATE.buffs.regen_expiry;
        buffIcon.classList.toggle('hidden', !isActive);
    }

    const btn = $('btn-claim-quest');
    const dot = $('quest-noti-dot');
    if(btn) {
        if(q.claimed) {
            btn.innerText = '✅ รับของขวัญวันนี้แล้ว';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/5 text-white/20 font-black uppercase text-xs cursor-not-allowed';
            if(dot) dot.classList.add('hidden');
        } else if(allDone) {
            btn.innerText = '🎁 เปิดรับของขวัญ (เหรียญ + ฟื้นพลังเร็ว)';
            btn.disabled = false;
            btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-r from-neon-gold to-orange-500 text-black font-black uppercase text-sm shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse';
            if(dot) {
                dot.classList.remove('hidden');
                dot.querySelector('.animate-ping')?.classList.remove('hidden');
            }
        } else {
            btn.innerText = '🔒 ดูแลน้องให้ครบตามเป้าหมาย';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/10 text-white/40 font-black uppercase text-xs cursor-not-allowed';
            if(dot) {
                dot.classList.add('hidden'); // Only show when ALL quests are done and ready to claim
            }
        }
    }
}

function incrementSpecialQuest(type, amt = 1) {
    if(!STATE.quests || !STATE.quests.special) return;
    const spec = STATE.quests.special;
    if(spec.type === type && spec.current < spec.target) {
        spec.current = Math.min(spec.target, spec.current + amt);
        updateQuestUI();
    }
}

function spawn(text) {
    const a=$('spawn-area'); if(!a) return;
    const e=document.createElement('div');
    e.className='absolute text-2xl font-black float-up pointer-events-none z-[60] text-white drop-shadow-[0_0_15px_rgba(139,92,246,0.6)]';
    e.style.left=`${Math.random()*50+25}%`;
    e.style.top=`${Math.random()*40+20}%`;
    e.innerText=text;
    a.appendChild(e);
    setTimeout(()=>e.remove(),2000);
}

window.toggleShop = (close) => {
    const m = $('shop-modal'); if(!m) return;
    if(close) m.classList.add('translate-y-full');
    else m.classList.remove('translate-y-full');
};

window.toggleNameModal = (close) => {
    const m = $('name-modal'); if(!m) return;
    const input = $('input-pet-name');
    
    if(close) {
        m.classList.remove('opacity-100');
        m.children[0].classList.remove('translate-y-0');
        setTimeout(() => m.classList.add('hidden'), 300);
    } else {
        m.classList.remove('hidden');
        if(input) input.value = STATE.username;
        // force reflow
        void m.offsetWidth;
        m.classList.add('opacity-100');
        m.children[0].classList.add('translate-y-0');
        if(input) setTimeout(() => input.focus(), 100);
    }
};

window.editPetName = () => {
    toggleNameModal(false);
};

window.savePetNameUI = () => {
    const input = $('input-pet-name');
    if(input && input.value.trim().length > 0) {
        STATE.username = input.value.trim().substring(0, 15);
        updateUI();
        saveState();
        spawn('✏️ เปลี่ยนชื่อเรียบร้อยแล้ว');
        toggleNameModal(true);
    } else {
        spawn('⚠️ กรุณาใส่ชื่อที่ต้องการ');
    }
};

// ==========================================
// PIN LOCK SCREEN LOGIC
// ==========================================
let currentPin = '';

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
        if (msg.innerText.indexOf('SUCCESS') === -1 && msg.innerText.indexOf('INCORRECT') === -1) {
            if (isNew) {
                if (pinTitle) pinTitle.innerText = "Set New PIN";
                if (pinIcon) pinIcon.innerText = "✨";
                msg.innerHTML = `ยินดีต้อนรับคุณ <span class="text-neon-purple">${STATE.username}</span><br>กรุณาตั้งรหัสผ่าน 4 หลักสำหรับไอดีนี้`;
            } else {
                if (pinTitle) pinTitle.innerText = "Security Lock";
                if (pinIcon) pinIcon.innerText = "🔒";
                msg.innerHTML = `ยินดีต้อนรับกลับคุณ <span class="text-neon-pink">${STATE.username}</span><br>กรุณาใส่รหัสผ่านเพื่อเข้าสู่ระบบ`;
            }
        }
    }
}

// --- NEW LOGIN FLOW FUNCTIONS ---
window.confirmUsername = async () => {
    const input = $('login-username-input');
    if (!input || !input.value.trim()) {
        spawn('⚠️ กรุณาใส่ชื่อผู้ใช้ก่อนครับ');
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
    updateUI();
    
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
// --------------------------------

function verifyPin() {
    const dots = document.querySelectorAll('.pin-dot');
    const isNew = !STATE.pin_code || STATE.pin_code === "";
    
    if (isNew) {
        // --- 1. โหมดตั้งรหัสใหม่ ---
        STATE.pin_code = currentPin;
        saveState(); // บันทึกดึงขึ้น Database ทันที
        
        dots.forEach(d => d.classList.add('pin-success'));
        $('pin-msg').innerText = "PIN CREATED! UNLOCKING...";
        $('pin-msg').classList.remove('text-white/50', 'text-red-400');
        $('pin-msg').classList.add('text-green-400');
        
        setTimeout(unlockScreen, 600);
    } else {
        // --- 2. โหมดปลดล็อคปกติ ---
        if (currentPin === STATE.pin_code) {
            dots.forEach(d => d.classList.add('pin-success'));
            $('pin-msg').innerText = "SUCCESS! UNLOCKING...";
            $('pin-msg').classList.remove('text-white/50', 'text-red-400');
            $('pin-msg').classList.add('text-green-400');
            setTimeout(unlockScreen, 600);
        } else {
            dots.forEach(d => d.classList.add('pin-error'));
            $('pin-msg').innerText = "INCORRECT PIN. TRY AGAIN.";
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
        spawn('🔓 ปลดล็อคระบบสำเร็จ!');
    }
}

window._pressPin = (num) => {
    if (currentPin.length < 4) {
        currentPin += num;
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

// ==========================================

window.buyPackage = (tier) => {
    const pkg = STATE.config.shop[tier];
    if (!pkg) return;
    if (STATE.tokens < pkg.cost) { spawn('🪙 เหรียญ (Tokens) ไม่พอครับ!'); return; }

    STATE.tokens -= pkg.cost;
    STATE.stamina += pkg.amt; 
    
    // บันทึก Log การซื้อของ
    logScoreAction(currentUserId, 'SHOP_PURCHASE', 0, -pkg.cost, `ซื้อแพ็คเกจ ${tier.toUpperCase()}`);

    spawn(`📦 ซื้อแพ็ค ${tier.toUpperCase()} สำเร็จ! (+${pkg.amt})`);
    updateUI(); saveState();
    setTimeout(() => toggleShop(true), 500); 
};

window.doAction = (type) => {
    const cost = STATE.config.costs[type];
    if (STATE.stamina < cost) { spawn('⚡ พลังงานไม่พอ!'); return; }
    
    // Validate if action is possible (especially for repair)
    if (type === 'repair' && !collectPoopByUI()) {
        spawn('✨ พื้นสะอาดอยู่แล้ว');
        return;
    }

    STATE.stamina -= cost;
    incrementSpecialQuest('spend', cost);

    const mech = STATE.config.mechanics || {
        rst_feed:15, rxp_feed:15, rst_clean:20, rxp_clean:10, 
        rst_play:10, rxp_play:25, rst_repair:10, rxp_repair:12,
        rscore_scoop: 20
    };

    const scoreGainPerAction = 10; // คะแนนพื้นฐานที่ได้ทุกครั้ง
    STATE.score += scoreGainPerAction;

    const hungerBefore = STATE.hunger;
    const cleanBefore = STATE.clean;
    const isDirty = STATE.clean < 25; // สภาวะสกปรกจนหงุดหงิด

    // ตัวคูณ XP ตาม Level (Level ยิ่งสูง XP ยิ่งเยอะ)
    // Level 1 = 1.0x, Level 5 = 1.4x, Level 10 = 1.9x, Level 20 = 2.9x
    const xpMult = 1.0 + (STATE.level - 1) * 0.1;

    switch(type) {
        case 'feed': 
            STATE.hunger = Math.min(100, STATE.hunger + mech.rst_feed); 
            let feedJoy = (hungerBefore < 30) ? 10 : 2;
            if (isDirty) feedJoy *= 0.3; 
            STATE.love = Math.min(100, STATE.love + feedJoy);
            
            const feedXP = Math.floor(mech.rxp_feed * xpMult);
            STATE.xp += feedXP; 
            if(STATE.quests.feed < STATE.quests.feed_max) STATE.quests.feed++;
            spawn(`🍖 อร่อย! +${feedXP}XP (x${xpMult.toFixed(1)})`); 
            break;

        case 'clean': 
            STATE.clean = Math.min(100, STATE.clean + mech.rst_clean); 
            let cleanJoy = (cleanBefore < 30) ? 12 : 3;
            STATE.love = Math.min(100, STATE.love + cleanJoy);

            const cleanXP = Math.floor(mech.rxp_clean * xpMult);
            STATE.xp += cleanXP; 
            if(STATE.quests.clean < STATE.quests.clean_max) STATE.quests.clean++;
            spawn(`🧼 สะอาดสบายตัว! +${cleanXP}XP (x${xpMult.toFixed(1)})`); 
            break;

        case 'repair': 
            onPoopCollectedManual(); 
            if(STATE.quests.clean < STATE.quests.clean_max) STATE.quests.clean++;
            break;

        case 'play': 
            let playJoy = mech.rst_play; 
            if (STATE.hunger < 20) playJoy *= 0.2;
            if (isDirty) playJoy *= 0.5;
            
            STATE.love = Math.min(100, STATE.love + playJoy);
            const playXP = Math.floor(mech.rxp_play * xpMult);
            STATE.xp += playXP; 
            if(STATE.quests.play < STATE.quests.play_max) STATE.quests.play++;
            spawn(`🎾 สนุกจัง! +${playXP}XP (x${xpMult.toFixed(1)})`); 
            break;
    }

    // บันทึก Log กิจกรรมทั่วไป
    logScoreAction(currentUserId, `ACTION_${type.toUpperCase()}`, scoreGainPerAction, 0);


    checkLevelUp();
    updateUI(); saveState();
};

// --- ฟังก์ชันรวมศูนย์สำหรับคำนวณรางวัลเมื่อเก็บกวาดอึ (เรียกจากทั้งคลิก 3D และปุ่ม UI) ---
window.onPoopCollectedManual = () => {
    const mech = STATE.config.mechanics || { rst_repair:10, rxp_repair:12, rscore_scoop: 20 };
    STATE.clean = Math.min(100, STATE.clean + mech.rst_repair);
    STATE.love = Math.min(100, STATE.love + 5); // เก็บอึให้ก็เพิ่มความผูกพัน (💖)
    
    // --- QUEST PROGRESS ---
    incrementSpecialQuest('scoop');

    // --- GACHA: RARE DROP ---
    const rareRate = (mech.rare_rate ?? 10) / 100;
    const isRare = Math.random() < rareRate;
    const rareMult = mech.rare_xp_mult ?? 3;
    const gainedXP = isRare ? mech.rxp_repair * rareMult : mech.rxp_repair;
    STATE.xp += gainedXP;

    const actionScore = mech.rscore_scoop || 25; 
    STATE.score += actionScore;

    if (isRare) {
        const tMin = mech.rare_token_min ?? 20;
        const tMax = mech.rare_token_max ?? 50;
        const jackpotTokens = Math.floor(tMin + Math.random() * (tMax - tMin));
        STATE.tokens += jackpotTokens;
        
        // บันทึก Log กรณีได้ Rare Drop
        logScoreAction(currentUserId, 'SCOOP_RARE', actionScore, jackpotTokens, 'เจอของแรร์ในกองอึ!');
        
        spawn(`✨ ทาดา! ซ่อนของแรร์ไว้ (+${jackpotTokens} Token)`);
    } else {
        // บันทึก Log ปกติ
        logScoreAction(currentUserId, 'SCOOP_POOP', actionScore, 0);
        
        spawn(`💩 เก็บแล้ว! +${gainedXP}XP +${actionScore}🏆`);
    }
    
    checkLevelUp();
    updateUI(); saveState();
};

function checkLevelUp() {
    if (STATE.xp >= STATE.maxExp) {
        STATE.level++;
        STATE.xp -= STATE.maxExp;
        STATE.maxExp = Math.floor(STATE.maxExp * 1.25); // ปรับจาก 1.2 เป็น 1.25 เพื่อให้ยากขึ้นทวีคูณ
        
        const bonusScore = 5000 + (STATE.level * 1000); 
        const bonusTokens = 500 + (STATE.level * 50); 
        
        STATE.score += bonusScore;
        STATE.tokens += bonusTokens;
        
        // เมื่อเลเวลเพิ่ม จะได้โบนัสค่าสถานะเล็กน้อย (ไม่รีเซ็ตเต็ม 100 เพื่อความท้าทาย)
        STATE.hunger = Math.min(100, STATE.hunger + 30);
        STATE.love = Math.min(100, STATE.love + 20);
        STATE.clean = Math.min(100, STATE.clean + 30);
        STATE.stamina = Math.min(STATE.maxStamina, STATE.stamina + 50); // โบนัสพลังงานแต่ไม่เกิน max

        // 🐈 ปรับขนาดสัตว์เลี้ยงตาม Level ใหม่
        updatePetScale(STATE.level);

        // บันทึก Log การอัปเลเวล
        logScoreAction(currentUserId, 'LEVEL_UP', bonusScore, bonusTokens, `เลเวลเพิ่มเป็น ${STATE.level}`);

        spawn(`🆙 LEVEL UP! ตอนนี้เลเวล ${STATE.level} แล้ว! 🎉`);
        spawn(`🎁 รับรางวัลเลเวลใหม่ +${bonusScore.toLocaleString()} 🏆 และ +${bonusTokens} 🪙`);
        
        checkLevelUp();
    }
}

// local storage save/load functions now handled by state.js

window.addEventListener('storage', (e) => {
    if(e.key==='pw3d_config') {
        loadAdminConfigLocal();
        updateTemplate(STATE.config.template, STATE.config.custom_model);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateEngineConfig({
            poop_lifetime: STATE.config.poop_lifetime,
            reward_lifetime: STATE.config.reward_lifetime,
            max_poops: STATE.config.max_poops,
            max_rewards: STATE.config.max_rewards
        });
        updateUI();
    }
});

window.addEventListener('message', (e) => {
    if(e.data && e.data.type === 'PW3D_PREVIEW') {
        applyConfigToState(e.data.config);
        updateTemplate(STATE.config.template, STATE.config.custom_model);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateEngineConfig({
            poop_lifetime: STATE.config.poop_lifetime,
            reward_lifetime: STATE.config.reward_lifetime,
            max_poops: STATE.config.max_poops,
            max_rewards: STATE.config.max_rewards
        });
        
        // Bypass PIN Lock in Preview Mode
        if ($('pin-lock-screen')) {
            unlockScreen();
        }
        
        updateUI();
    }
});

function loadBoard() {
    const list=$('ranking-list'); if(!list) return;
    const medals=['🥇','🥈','🥉'];
    list.innerHTML = MOCK_BOARD.map((p,i)=>`
        <div class="rounded-xl p-3 flex items-center gap-3 ${i<3?'bg-neon-purple/10 border border-neon-purple/20':'bg-white/3 border border-white/5'}">
            <div class="w-8 h-8 rounded-lg ${i<3?'bg-neon-purple/20':'bg-white/5'} flex items-center justify-center font-black text-sm">${medals[i]||'#'+(i+1)}</div>
            <div class="flex-1"><div class="font-bold text-sm text-white/80">Player ${p.id.substring(0,6)}</div><div class="text-[8px] text-white/30">Lv.${p.level}</div></div>
            <div class="font-black text-neon-gold text-sm">${(p.score).toLocaleString()} 🏆</div>
        </div>
    `).join('');
}

window.toggleQuest = (close) => {
    const m = $('quest-modal'); if(!m) return;
    if(close) m.classList.add('translate-y-full');
    else {
        m.classList.remove('translate-y-full');
        updateQuestUI();
    }
};

window.claimQuestReward = () => {
    if(STATE.quests.claimed) return;
    const tiers = ['feed','clean','play'];
    let allDone = true;
    tiers.forEach(t => { if(STATE.quests[t] < STATE.quests[`${t}_max`]) allDone = false; });
    if(STATE.quests.special.current < STATE.quests.special.target) allDone = false;
    
    if(!allDone) { spawn('🔒 เควสยังไม่ครบ!'); return; }

    STATE.tokens += 500;
    STATE.score += 5000;
    STATE.quests.claimed = true;
    
    STATE.buffs.regen = STATE.config.q_special_mult || 1.5;
    STATE.buffs.regen_expiry = Date.now() + (24 * 60 * 60 * 1000); 

    // บันทึก Log การรับรางวัลเควส
    logScoreAction(currentUserId, 'QUEST_CLAIM', 5000, 500, 'สำเร็จภารกิจรายวัน');

    spawn('🎁 รับของขวัญสำเร็จ! (แถมเหรียญ + ฟื้นพลังเร็ว x1.5)');
    updateUI(); saveState();
};

function resetDailyQuests() {
    const last = localStorage.getItem('pw3d_last_quest');
    const now = new Date().toDateString();
    if (last !== now) {
        const randIndex = Math.floor(Math.random() * SPECIAL_QUEST_POOL.length);
        const picked = SPECIAL_QUEST_POOL[randIndex];
        
        let target = 5;
        if(picked.type === 'scoop') target = STATE.config.qt_scoop || 10;
        if(picked.type === 'fever') target = STATE.config.qt_fever || 2;
        if(picked.type === 'pure_love') target = STATE.config.qt_love || 10;
        if(picked.type === 'spend') target = STATE.config.qt_spend || 100;

        STATE.quests = {
            feed: 0, feed_max: STATE.config.q_feed || 3,
            clean: 0, clean_max: STATE.config.q_clean || 2,
            play: 0, play_max: STATE.config.q_play || 1,
            special: { 
                type: picked.type, 
                label: picked.label, 
                icon: picked.icon, 
                target: target, 
                current: 0 
            },
            claimed: false
        };
        localStorage.setItem('pw3d_last_quest', now);
        updateUI(); saveState();
    }
}

window.toggleRanking = async (forcedState) => {
    const m = $('ranking-modal');
    if (!m) return;
    
    if (forcedState === true) {
        m.classList.add('translate-y-full');
        return;
    } else if (forcedState === false) {
        m.classList.remove('translate-y-full');
    } else {
        m.classList.toggle('translate-y-full');
    }

    if (!m.classList.contains('translate-y-full')) {
        const listEl = $('ranking-list');
        listEl.innerHTML = '<div class="text-white/30 text-center py-12 animate-pulse">⏳ กำลังโหลดอันดับโลก...</div>';

        // ดึงข้อมูลจริงจาก Cloud
        const { data, error } = await fetchLeaderboard();
        
        if (data && data.length > 0) {
            listEl.innerHTML = data.map((p, i) => {
                const isMe = p.player_id === currentUserId;
                const shortName = p.player_id === 'ADMIN_TEST_MODE' ? 'ADMIN' : p.player_id;
                
                return `
                    <div class="${isMe ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-white/5 border-white/5'} flex items-center justify-between p-4 rounded-2xl border transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-8 h-8 flex items-center justify-center rounded-full ${i < 3 ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/50'} font-black italic">
                                ${i + 1}
                        </div>
                        <div>
                            <div class="font-black text-sm ${isMe ? 'text-indigo-300' : 'text-white'}">${shortName} ${isMe ? '(คุณ)' : ''}</div>
                            <div class="text-[10px] font-bold text-white/30 uppercase">LEVEL ${p.level || 1}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="text-amber-400 font-black tracking-tight">${(p.score || 0).toLocaleString()} <span class="text-[10px]">🏆</span></div>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = '<div class="text-white/20 text-center py-12">ยังไม่มีข้อมูลอันดับในขณะนี้</div>';
        }
    }
};

window.toggleMinimize = () => {
    const container = $('game-container');
    const reopenBtn = $('reopen-btn');
    const hud = document.querySelector('.hud');
    const isMin = container.classList.contains('minimized');

    if (isMin) {
        container.classList.remove('minimized');
        container.style.cssText = "";
        if(reopenBtn) reopenBtn.classList.add('hidden');
        if(hud) { hud.style.opacity="1"; hud.style.pointerEvents="auto"; }
        spawn('🏠 กลับสู่หน้าหลัก');
    } else {
        container.classList.add('minimized');
        container.style.cssText = `
            position: fixed; bottom: 85px; right: 25px;
            width: 140px; height: 140px; border-radius: 40px;
            z-index: 250; border: 3px solid #8b5cf6;
            box-shadow: 0 15px 40px rgba(0,0,0,0.6);
            overflow: hidden; pointer-events: none;
        `;
        if(reopenBtn) reopenBtn.classList.remove('hidden');
        if(hud) { hud.style.opacity="0"; hud.style.pointerEvents="none"; }
        spawn('➖ ย่อหน้าต่างแล้ว');
    }
    window.dispatchEvent(new Event('resize'));
};

window.toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            spawn('❌ อุปกรณ์ไม่รองรับ Full Screen');
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
};


(async () => {
    // 1. ตรวจสอบชื่อจาก Session Storage หรือ URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionUser = sessionStorage.getItem('pw3d_session_user');
    const urlUserId = urlParams.get('userId'); // เผื่อยังอยากเข้าผ่านลิงก์ได้อยู่
    
    const userId = sessionUser || urlUserId;
    const userNameParam = urlParams.get('username');

    const step1 = $('login-step-1');
    const step2 = $('login-step-2');

    if (userId) {
        // --- กรณีมีชื่อจำไว้แล้ว ---
        setUserId(userId);
        await loadState();
        
        // ใช้ชื่อจาก ID หรือ URL มาเป็นชื่อแสดงผล
        STATE.username = userNameParam || userId;
        
        updatePinUI();
        
        if (step1 && step2) {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            step2.classList.remove('opacity-0', 'translate-y-8');
        }
    } else {
        // --- กรณีไม่มีชื่อ (เริ่มใหม่) ---
        if (step1) {
            step1.classList.remove('hidden');
            // focus input
            setTimeout(() => $('login-username-input')?.focus(), 500);
        }
    }
    
    loadAdminConfigLocal();
    init3D('three-canvas', STATE.config.template, { 
        sky:STATE.config.sky, ground:STATE.config.ground, 
        customModel: STATE.config.custom_model 
    });
    updatePetScale(STATE.level); 
    resetDailyQuests(); 
    updateUI();
    
    setPoopCallbacks(
        window.onPoopCollectedManual,
        () => {
            const mech = STATE.config.mechanics || { dec_happy_poop: 12 };
            STATE.love = Math.max(0, STATE.love - (mech.dec_happy_poop || 12));
            spawn('💩 อึเน่าเกินไป! -12♥');
            updateUI(); saveState();
        }
    );

    setRewardCallback((type, val) => {
        const mech = STATE.config.mechanics || {};
        if (type === 'coin') {
            const min = mech.rare_token_min || 20;
            const max = mech.rare_token_max || 50;
            const tokenGain = Math.floor(min + Math.random() * (max - min));
            
            STATE.tokens += tokenGain;
            STATE.xp += (mech.rxp_repair || 12) * (mech.rare_xp_mult || 1);
            
            spawn(`🪙 เก็บเหรียญได้ +${tokenGain} Token! (+Bonus XP)`);
            updateUI(); saveState();
        }
    });

    function scheduleNextPoop() {
        const mech = STATE.config.mechanics || { sp_min:60, sp_max:150 };
        const baseDelay = (mech.sp_min + Math.random() * (mech.sp_max - mech.sp_min)) * 1000;
        
        setTimeout(() => {
            if (spawnPoop()) {
                spawn('💩 น้องปวดท้องอึ / ของร่วงลงแหมะ!');
            }
            scheduleNextPoop();
        }, baseDelay);
    }
    scheduleNextPoop();

    function scheduleNextReward() {
        const mech = STATE.config.mechanics || { r_min:90, r_max:240, rare_rate: 10, fever_threshold: 80 };
        const delay = (mech.r_min + Math.random() * (mech.r_max - (mech.r_min || 0))) * 1000;
        
        setTimeout(() => {
            const dropRate = (mech.rare_rate || 10) / 100;
            const threshold = mech.fever_threshold || 80;
            if (STATE.love > threshold && Math.random() < dropRate) {
                if (spawnReward('coin')) {
                    spawn('🎁 น้องอารมณ์ดีมากจนอยากให้รางวัล!');
                }
            }
            scheduleNextReward();
        }, delay);
    }
    scheduleNextReward();

    setInterval(()=>{
        const mech = STATE.config.mechanics || { dec_hunger: 0.12, dec_happy: 0.08, dec_clean: 0.06, reg_stamina: 0.5 };
        STATE.maxStamina = STATE.maxStamina || 100;
        
        STATE.hunger = Math.max(0, STATE.hunger - mech.dec_hunger);
        STATE.clean = Math.max(0, STATE.clean - mech.dec_clean);

        let happyDecay = mech.dec_happy || 0.08;
        // ลอจิกความทุกข์: ถ้าปล่อยให้อดอยากหรือสกปรก ความสุขจะลดลงเร็วขึ้น 3 เท่า!
        if (STATE.hunger < 20 || STATE.clean < 20) happyDecay *= 3;
        STATE.love = Math.max(0, STATE.love - happyDecay); 

        // ลอจิกความสุขสะสม: ถ้าดูแลดีจนทุกอย่างเกิน 85% ความรักจะค่อยๆ เพิ่มขึ้นเอง (Passive Joy)
        if (STATE.hunger > 85 && STATE.clean > 85) {
            STATE.love = Math.min(100, STATE.love + 0.1); 
        }
        
        let currentRegen = mech.reg_stamina;
        const thr = mech.fever_threshold ?? 80;
        const isPerfect = (STATE.hunger >= thr && STATE.love >= thr && STATE.clean >= thr);
        
        let multiplier = 1.0;
        if (isPerfect) {
            multiplier *= (mech.fever_mult ?? 1.5);
            if (Math.random() < 0.05) {
                spawn('🌟 น้องแฮปปี้สุดๆ! (ฟื้นพลังไวขึ้น)');
                incrementSpecialQuest('fever');
            }
        }

        // --- REWARD BUFF x1.5 FROM QUEST ---
        if (STATE.buffs.regen > 1 && Date.now() < STATE.buffs.regen_expiry) {
            multiplier *= STATE.buffs.regen;
        }

        // --- REGEN LOGIC: Allow exceeding Max but don't regen if over ---
        if (STATE.stamina < STATE.maxStamina) {
            STATE.stamina = Math.min(STATE.maxStamina, STATE.stamina + (currentRegen * multiplier));
        }

        updateUI();
    }, 5000);
})();
