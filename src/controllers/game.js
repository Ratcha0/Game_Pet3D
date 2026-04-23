import '../styles.css';
import { init3D, updateTemplate, updateEnvironment, spawnPoop, setPoopCallbacks, collectPoopByUI, spawnReward, setRewardCallback, updateEngineConfig, updatePetScale, triggerLevelUpEffect, setWorldSeed, showEmoticon, refreshPetAura, spawnWorldRock, clearWorldRocks, throwRockAtBoss, collectWorldRockAtPet, _getPetPosition, updateBossModel } from '../engine/3d_engine.js';
import { initBossController } from './boss_controller.js';
import { logScoreAction, fetchLeaderboard } from '../services/supabase.js';

import { 
    STATE, SPECIAL_QUEST_POOL, 
    loadState, saveState, applyConfigToState, loadAdminConfigLocal, setUserId,
    currentUserId, loadGameConfigCloud, getActiveConfig
} from '../store/state.js';
import { SFX } from '../services/sound.js';
import { isGameActive, initAuth } from './auth.js';
import { initShop } from './shop.js';

const $ = id => document.getElementById(id);
const urlParams = new URLSearchParams(window.location.search);
const viewType = urlParams.get('view') || 'mobile';
const isAdminPreview = urlParams.get('admin') === 'true' || window.name === 'admin-preview';
if (isAdminPreview) document.body.classList.add('is-admin-preview');

(async function() {
window.STATE = STATE; // Expose to window for inline scripts and debugging
window.spawn = function(msg, cls = "text-white") {
    const a=$('spawn-area'); if(!a) return;
    const e=document.createElement('div');
    e.className = `px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/10 text-white font-black text-xs shadow-2xl pointer-events-none animate-float-up ${cls}`;
    e.style.position = 'absolute';
    e.style.left = `${40 + Math.random() * 20}%`;
    e.style.top = `${40 + Math.random() * 20}%`;
    e.innerHTML = msg;
    if (window.twemoji) twemoji.parse(e);
    a.appendChild(e);
    setTimeout(() => e.remove(), 2500);
};

// --- Sync UI with other instances ---
window.addEventListener('state-synced', () => {
    window.updateUI();
});

window.updateUI = function() {
    try {
        if (!STATE) return;

        const musicBtn = document.getElementById('music-btn');
        if (musicBtn) {
            musicBtn.innerText = SFX.musicEnabled ? '🎵' : '🔇';
        }

        const un=$('hud-username'); if(un) un.innerText=STATE.username;
        const t=$('hud-tokens'); if(t) t.innerText=Math.floor(STATE.tokens).toLocaleString();
        const s=$('hud-score'); if(s) s.innerText=Math.floor(STATE.score).toLocaleString();
        const l=$('hud-level'); if(l) l.innerText=STATE.level;
        const xpBar=$('bar-xp'); if(xpBar) xpBar.style.width=`${(STATE.xp/STATE.maxExp)*100}%`;
        const xpVal=$('hud-xp-val'); if(xpVal) xpVal.innerText=`${Math.floor(STATE.xp)}/${Math.floor(STATE.maxExp)} XP`;

        // Update Shop display from config
        const active = getActiveConfig();
        if (active && active.shop) {
            ['small','medium','large'].forEach(tier => {
                const c = $(`shop-cost-${tier}`); if(c) c.innerText = active.shop[`${tier}_tokens`];
                const a = $(`shop-amt-${tier}`); if(a) a.innerText = active.shop[`${tier}_amount`];
            });
        }

    const labels = {
        pet:   { h:'ความหิว', l:'ความรัก', c:'ความสะอาด', s:'พลังงาน', af:'ป้อนอาหาร', ac:'อาบน้ำ', ar:'เก็บอึ', ap:'เล่นด้วย' },
        car:   { h:'เชื้อเพลิง', l:'สภาพเครื่อง', c:'ความเงางาม', s:'แบตเตอรี่', af:'เติมน้ำมัน', ac:'ล้างรถ', ar:'เช็ดคราบ', ap:'จูนเครื่อง' },
        plant: { h:'ระดับน้ำ', l:'รับแสงแดด', c:'ความสดชื่น', s:'การเติบโต', af:'รดน้ำ', ac:'เช็ดใบ', ar:'ถอนวัชพืช', ap:'เปิดเพลง' }
    };
    // ไอคอนแถบสเตตัส (ด้านซ้าย)
    const statIcons = {
        pet:   { hunger:'🍖', happy:'💖', clean:'🧼', stamina:'⚡' },
        car:   { hunger:'⛽', happy:'🔧', clean:'✨', stamina:'🔋' },
        plant: { hunger:'💧', happy:'☀️', clean:'🌿', stamina:'☘️' }
    };
    // ไอคอนปุ่มกิจกรรม (ด้านล่าง)
    const actIcons = {
        pet:   { feed:'🍗', clean:'🧼', repair:'💩', play:'🎾' },
        car:   { feed:'⛽', clean:'🚿', repair:'🔧', play:'🏁' },
        plant: { feed:'💧', clean:'🌿', repair:'🍂', play:'🎵' }
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
            
            // แจ้งเตือนสถานะวิกฤต (Critical Warning)
            const parentBox = bar ? bar.parentElement : null;
            if (val < 20 && b !== 'bar-stamina') {
                txt.classList.add('alert-red');
                if(parentBox) parentBox.classList.add('alert-red');
            } else {
                txt.classList.remove('alert-red');
                if(parentBox) parentBox.classList.remove('alert-red');
            }
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
        if (window.twemoji) twemoji.parse(moodEl);
    }

    const btnRepair = $('btn-repair');
    if (btnRepair) {
        // Only show manual repair button in "EASY" mode. 
        // In Normal/Hard, players must walk to clean it up.
        const mode = STATE.config.difficulty_mode || 'normal';
        btnRepair.style.display = (mode === 'easy') ? 'flex' : 'none';
    }

    // Season
    const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name || 'Season 1';
    const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_duration || 15}D`;

    // Quest Check for Pure Love
    if(STATE.love >= 100) incrementSpecialQuest('pure_love');

    // Update User Icon to match current variant
    const userIcon = $('hud-user-icon');
    if (userIcon && STATE.config.custom_icon) {
        userIcon.innerText = STATE.config.custom_icon;
    } else if (userIcon) {
        const icons = { pet:'🐱', car:'🏎️', plant:'🌵' };
        userIcon.innerText = icons[STATE.config.template] || '🐱';
    }
    if (userIcon && window.twemoji) twemoji.parse(userIcon);

    updateQuestUI();
    updateBuffUI();
    } catch (e) {
        console.error("Critical UI Update Error: ", e);
    }
}

function updateBuffUI() {
    const buffBar = $('buff-bar');
    if (!buffBar) return;

    const buffs = [
        { key: 'score', name: 'Score', icon: '💎', color: 'rgba(255,185,0,1)', shadow: 'rgba(255,185,0,0.4)', bg: 'bg-[#ffd700]/20' },
        { key: 'decay', name: 'Decay', icon: '🛡️', color: 'rgba(0,210,255,1)', shadow: 'rgba(0,210,255,0.4)', bg: 'bg-[#00d2ff]/20' },
        { key: 'luck', name: 'Luck', icon: '🍀', color: 'rgba(168,224,99,1)', shadow: 'rgba(168,224,99,0.4)', bg: 'bg-[#a8e063]/20' },
        { key: 'regen', name: 'Regen', icon: '⚡', color: 'rgba(251,191,36,1)', shadow: 'rgba(251,191,36,0.4)', bg: 'bg-[#fbbf24]/20' }
    ];

    let html = '';
    const now = Date.now();
    const active = getActiveConfig().boosters || {};

    buffs.forEach(b => {
        const expiry = STATE.buffs[`${b.key}_expiry`];
        if (expiry && expiry > now) {
            const timeLeft = Math.ceil((expiry - now) / 60000);
            const durationMin = active[b.key]?.duration || (b.key === 'regen' ? 20 : 15);
            const totalMs = durationMin * 60000;
            const progress = Math.max(0, Math.min(100, ((expiry - now) / totalMs) * 100));
            
            const radius = 16;
            const circum = 2 * Math.PI * radius;
            const offset = circum - (progress / 100) * circum;

            html += `
                <div onclick="showBuffInfo('${b.key}')" class="relative group pointer-events-auto cursor-pointer active:scale-90 transition-transform animate-in zoom-in duration-500">
                    <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center relative overflow-hidden shadow-lg" style="box-shadow: 0 0 10px ${b.shadow}">
                        <div class="absolute inset-0 ${b.bg} opacity-30"></div>
                        <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="${radius}" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.1" />
                            <circle cx="20" cy="20" r="${radius}" fill="none" stroke="${b.color}" stroke-width="2.5" 
                                stroke-dasharray="${circum}" stroke-dashoffset="${offset}" stroke-linecap="round" 
                                style="filter: drop-shadow(0 0 3px ${b.color})" />
                        </svg>
                        <span class="text-[10px] sm:text-base z-10">${b.icon}</span>
                        <div class="absolute -bottom-0.5 right-0.5 z-20 text-[7px] sm:text-[8px] font-black text-white drop-shadow-md">${timeLeft}m</div>
                            <div id="skin-badge-${b.key}" class="absolute top-1 right-1 bg-white text-black text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce z-10 shadow-lg" style="display: none;">ใช้งานอยู่</div>
                    </div>
                </div>
            `;
        }
    });

    if (buffBar.innerHTML !== html) {
        buffBar.innerHTML = html;
        if (window.twemoji) twemoji.parse(buffBar);
    }
}

window.showBuffInfo = (key) => {
    const infoMap = {
        score: { n: 'แต้มทวีคูณ', d: 'เพิ่มคะแนนที่ได้รับจากกิจกรรม 10%', i: '💎' },
        decay: { n: 'เกราะกันหิว', d: 'ลดอัตราการลดลงของสเตตัส 20%', i: '🛡️' },
        luck: { n: 'ดวงมหาเฮง', d: 'เพิ่มโอกาสพบไอเทมหายาก 1.5 เท่า', i: '🍀' },
        regen: { n: 'ฟื้นพลังกายเร็วขึ้น', d: 'สตามิน่าฟื้นฟูไวขึ้นกว่าปกติ', i: '⚡' }
    };

    const b = infoMap[key];
    if (!b) return;

    const expiry = STATE.buffs[`${key}_expiry`];
    const timeLeft = Math.ceil((expiry - Date.now()) / 60000);
    
    if (window.spawn) {
        window.spawn(`${b.i} ${b.n}: ${b.d} (เหลือ ${timeLeft} นาที)`, "text-white font-bold");
    }
};

function updateQuestUI() {
    const q = STATE.quests;
    if(!q) return;
    const tiers = ['feed','clean','play'];
    let allDone = true;
    
    // Template-aware quest labels
    const qLabels = {
        pet:   { f:'ให้อาหารน้อง', c:'ทำความสะอาด', p:'เล่นกับน้อง', fi:'🍖', ci:'🧼', pi:'🎾' },
        car:   { f:'เติมน้ำมันรถ', c:'ล้างรถให้เงา', p:'ทดสอบเครื่อง', fi:'⛽', ci:'🚿', pi:'🏎️' },
        plant: { f:'รดน้ำต้นไม้', c:'เล็มใบไม้', p:'เปิดเพลงให้ฟัง', fi:'💧', ci:'🌿', pi:'🎵' }
    };
    const ql = qLabels[STATE.config.template] || qLabels.pet;

    tiers.forEach(t => {
        const bar = $(`q-bar-${t}`); if(bar) bar.style.width = `${Math.min(100, (q[t]/q[`${t}_max`])*100)}%`;
        const val = $(`q-val-${t}`); if(val) val.innerText = `${q[t]}/${q[`${t}_max`]}`;
        
        // Update Label & Icon
        const labelEl = $(`q-lbl-${t}`); if(labelEl) labelEl.innerText = ql[t.charAt(0)];
        const iconEl = $(`q-icon-${t}`); if(iconEl) iconEl.innerText = ql[t.charAt(0)+'i'];

        if(q[t] < q[`${t}_max`]) allDone = false;
    });

    // Special Quest
    const specBar = $('q-bar-special');
    const specVal = $('q-val-special');
    const specLabel = $('q-label-special');
    const specIcon = $('q-icon-special');

    if(specLabel) specLabel.innerText = `${q.special.label}`;
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
            const lockLabels = { pet: '🔒 ดูแลน้องให้ครบตามเป้าหมาย', car: '🔒 ดูแลรถให้ครบตามเป้าหมาย', plant: '🔒 ดูแลต้นไม้ให้ครบตามเป้าหมาย' };
            const curTpl = STATE.config.template || 'pet';
            btn.innerText = lockLabels[curTpl] || lockLabels.pet;
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/10 text-white/40 font-black uppercase text-xs cursor-not-allowed';
            if(dot) {
                dot.classList.add('hidden'); // Only show when ALL quests are done and ready to claim
            }
        }
    }
    // Targeted parsing only if necessary (usually only for quests)
    const questModal = $('quest-modal');
    if (questModal && !questModal.classList.contains('translate-y-full') && window.twemoji) {
        twemoji.parse(questModal);
    }
}

// --- MUSIC TOGGLE UI ---
window.toggleMusicUI = () => {
    const isEnabled = SFX.toggleMusic();
    const btn = document.getElementById('music-btn');
    if (btn) {
        btn.innerText = isEnabled ? '🎵' : '🔇';
        if (window.twemoji) twemoji.parse(btn);
    }
    SFX.playClick();
};

function incrementSpecialQuest(type, amt = 1) {
    if(!STATE.quests || !STATE.quests.special) return;
    const spec = STATE.quests.special;
    if(spec.type === type && spec.current < spec.target) {
        spec.current = Math.min(spec.target, spec.current + amt);
        updateQuestUI();
    }
}





window.toggleNameModal = (close) => {
    const m = $('name-modal');
    if (!m) return;
    const input = $('input-pet-name');
    
    if (close === true || (close !== false && !m.classList.contains('hidden'))) {
        m.classList.add('opacity-0', 'pointer-events-none');
        m.children[0].classList.add('translate-y-8');
        m.children[0].classList.remove('translate-y-0');
        setTimeout(() => { if(m.classList.contains('opacity-0')) m.classList.add('hidden'); }, 300);
        return;
    }

    // Opening Name Modal
    if (window.toggleShop) window.toggleShop(true);
    if (window.toggleRanking) window.toggleRanking(true);
    if (window.toggleQuest) window.toggleQuest(true);

    m.classList.remove('hidden');
    if (input) input.value = STATE.username || "LikeGotchi";
    
    setTimeout(() => {
        m.classList.remove('opacity-0', 'pointer-events-none');
        m.children[0].classList.remove('translate-y-8');
        m.children[0].classList.add('translate-y-0');
        if (input) input.focus();
    }, 10);
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

initShop();

window.doAction = (type) => {
    SFX.init(); // ประกันว่า AudioContext จะทำงานเมื่อมีการคลิกครั้งแรก
    
    const active = getActiveConfig();
    const act = active.activities[type] || { r: 15, s: 10, xp: 5 }; // ลด XP พื้นฐานลงจาก 10 เหลือ 5
    const cost = act.s;

    if (STATE.stamina < cost) { 
        SFX.playError();
        spawn('⚡ พลังงานไม่พอ!'); 
        return; 
    }
    
    // Validate if action is possible (especially for repair)
    const collectedType = (type === 'repair') ? collectPoopByUI() : null;
    if (type === 'repair' && !collectedType) {
        spawn('✨ พื้นสะอาดอยู่แล้ว');
        return;
    }

    STATE.stamina -= cost;
    incrementSpecialQuest('spend', cost);

    const mech = STATE.config.mechanics || {
        dec_hunger: 0.08, dec_clean: 0.04, dec_happy: 0.05, reg_stamina: 0.5,
        rare_rate: 10, fever_threshold: 80, fever_mult: 1.5
    };

    const tpl = STATE.config.template || 'pet';
    const feverThr = mech.fever_threshold || 85;
    const isFever = (STATE.hunger >= feverThr && STATE.love >= feverThr && STATE.clean >= feverThr);
    
    let scoreGainPerAction = act.xp || 10;
    if (isFever) scoreGainPerAction *= (mech.fever_mult || 1.5);
    
    // Apply Score Booster
    const scoreMult = (STATE.buffs.score_mult || 1.0);
    scoreGainPerAction *= scoreMult;
    
    STATE.score += Math.floor(scoreGainPerAction);

    const hungerBefore = STATE.hunger;
    const cleanBefore = STATE.clean;
    const isDirty = STATE.clean < 25; 
    const xpMult = Math.min(3.0, 1.0 + (STATE.level - 1) * 0.1);

    const feedMsg = { pet: '🍖 อร่อย!', car: '⛽ เติมน้ำมันเรียบร้อย!', plant: '💧 รดน้ำแล้ว!' };
    const cleanMsg = { pet: '🧼 สะอาดสบายตัว!', car: '🚿 รถเงาจ้า!', plant: '🌿 เล็มใบสวยเลย!' };
    const playMsg = { pet: '🎾 สนุกจัง!', car: '🏎️ จูนเครื่องเรียบร้อย!', plant: '🎵 น้องต้นไม้ชอบเพลง!' };

    switch(type) {
        case 'feed': 
            STATE.hunger = Math.min(100, STATE.hunger + act.r); 
            let feedJoy = (hungerBefore < 30) ? 5 : 1;
            if (isDirty) feedJoy *= 0.3; 
            STATE.love = Math.min(100, STATE.love + feedJoy);
            
            const feedEmo = { pet:'😋', car:'⛽', plant:'💧' }[tpl] || '😋';
            showEmoticon(feedEmo, 2000);
            if (Math.random() > 0.7) {
                const loveEmo = { pet:'❤️', car:'⚡', plant:'🌸' }[tpl] || '❤️';
                setTimeout(() => showEmoticon(loveEmo, 2000), 1200);
            }

            const feedXP = Math.floor(act.xp * xpMult);
            STATE.xp += feedXP; 
            if(STATE.quests.feed < STATE.quests.feed_max) STATE.quests.feed++;
            spawn(`${feedMsg[tpl] || feedMsg.pet} +${feedXP}XP (x${xpMult.toFixed(1)})`); 
            vibrate(20);
            break;

        case 'clean': 
            STATE.clean = Math.min(100, STATE.clean + act.r); 
            let cleanJoy = (cleanBefore < 30) ? 6 : 2;
            STATE.love = Math.min(100, STATE.love + cleanJoy);

            const cleanEmo = { pet:'🧼', car:'🚿', plant:'🌿' }[tpl] || '🧼';
            showEmoticon(cleanEmo, 2000);
            if (Math.random() > 0.8) {
                const sparkEmo = { pet:'✨', car:'💎', plant:'☀️' }[tpl] || '✨';
                setTimeout(() => showEmoticon(sparkEmo, 2000), 800);
            }

            const cleanXP = Math.floor(act.xp * xpMult);
            STATE.xp += cleanXP; 
            if(STATE.quests.clean < STATE.quests.clean_max) STATE.quests.clean++;
            spawn(`${cleanMsg[tpl] || cleanMsg.pet} +${cleanXP}XP (x${xpMult.toFixed(1)})`); 
            vibrate(15);
            break;

        case 'repair': 
            onPoopCollectedManual(collectedType); 
            if(STATE.quests.clean < STATE.quests.clean_max) STATE.quests.clean++;
            vibrate(25);
            break;

        case 'play': 
            let playJoy = act.r; 
            if (STATE.hunger < 20) {
                playJoy *= 0.6; // ลดโทษลงจาก 0.2 -> 0.6 (ยังได้ผลอยู่)
                spawn('🟡 น้องหิวเกินไป เล่นไม่ค่อยไหวคร้าบ');
            }
            if (isDirty) {
                playJoy *= 0.7; // ลดโทษลงจาก 0.5 -> 0.7
                spawn('🧼 น้องตัวเหนียวหนึบ ล้างตัวก่อนน้า');
            }
            STATE.love = Math.min(100, STATE.love + playJoy);

            const playXP = Math.floor(act.xp * xpMult);
            STATE.xp += playXP; 
            if(STATE.quests.play < STATE.quests.play_max) STATE.quests.play++;

            showEmoticon('🎾', 2000);
            const happyEmojis = ['💖', '🎈', '🎵', '⚡'];
            if (Math.random() > 0.5) setTimeout(() => showEmoticon(happyEmojis[Math.floor(Math.random() * happyEmojis.length)], 2000), 1000);

            const playSFX = { pet: 'meow', car: 'honk', plant: 'bell' };
            const currentSFX = playSFX[tpl] || 'meow';
            if (currentSFX === 'honk') {
                SFX.playHonk(); 
            } else {
                SFX.playAsset(currentSFX);
            }
            vibrate(30);
            spawn(`${playMsg[tpl] || playMsg.pet} +${playXP}XP (x${xpMult.toFixed(1)})`); 
            break;
    }

    // บันทึก Log กิจกรรมทั่วไป
    logScoreAction(currentUserId, `ACTION_${type.toUpperCase()}`, scoreGainPerAction, 0);


    checkLevelUp();
    SFX.playClick();
    updateUI(); saveState();
};

// --- ฟังก์ชัน Interaction พิเศษ (จิ้มที่ตัวโดยตรง) ---
// จิ้มเล่นได้ฟรี! (ไม่เสีย Stamina) แต่ได้ XP และ Love เล็กน้อย
window.doTouch = () => {
    const tpl = STATE.config.template || 'pet';
    const touchMsg = { pet: '💖', car: '✨', plant: '🌿' };
    const playSFX = { pet: 'meow', car: 'honk', plant: 'bell' };
    const currentSFX = playSFX[tpl] || 'meow';
    
    // เอาคะแนนและ XP ออกเพื่อป้องกันการปั๊มคะแนน (Farming) ตามคำแนะนำ
    // เหลือเพียงเอฟเฟกต์เสียงและการสั่นเพื่อความเพลิดเพลิน
    if (currentSFX === 'honk') { SFX.playHonk(); } 
    else { SFX.playAsset(currentSFX); }
    
    vibrate(10); // สั่นเบาๆ
    spawn(touchMsg[tpl] || touchMsg.pet);
};

// --- ฟังก์ชันรวมศูนย์สำหรับคำนวณรางวัลเมื่อเก็บกวาดอึ (เรียกจากทั้งคลิก 3D และปุ่ม UI) ---
window.onPoopCollectedManual = (type = 'normal') => {
    const active = getActiveConfig();
    const mech = active.mechanics || { rst_repair:10, rxp_repair:12, rscore_scoop: 20 };
    const rew = active.rewards || {};
    
    STATE.clean = Math.min(100, STATE.clean + mech.rst_repair);
    STATE.love = Math.min(100, STATE.love + 5); 
    
    // --- QUEST PROGRESS ---
    incrementSpecialQuest('scoop');

    // --- GACHA: RARE DROP (Luck Booster applied) ---
    const luckMult = (STATE.buffs.luck_mult || 1.0);
    const rareRate = ((mech.rare_rate ?? 10) * luckMult) / 100;
    const isRare = (type === 'gold') || (Math.random() < rareRate);
    const rareMult = mech.rare_xp_mult ?? 3;
    const gainedXP = isRare ? mech.rxp_repair * rareMult : mech.rxp_repair;
    STATE.xp += gainedXP;

    // Apply Score Booster
    const scoreMult = (STATE.buffs.score_mult || 1.0);
    const actionScore = (isRare ? (rew.rare_tokens * 1.6) : 50) * scoreMult; 
    STATE.score += Math.floor(actionScore);

    if (isRare) {
        if (type === 'gold') SFX.playJingle();
        else SFX.playCoin();

        const tMin = mech.rare_token_min ?? 20;
        const tMax = mech.rare_token_max ?? 50;
        const jackpotTokens = Math.floor(tMin + Math.random() * (tMax - tMin));
        STATE.tokens += jackpotTokens;
        
        const tpl = STATE.config.template || 'pet';
        const rareName = { pet: 'อึทองคำ', car: 'น้ำมันพิเศษ', plant: 'ใบไม้สีทอง' };
        const rareLoc = { pet: 'ในกองอึ', car: 'ในคราบน้ำมัน', plant: 'ตามกองใบไม้' };
        
        logScoreAction(currentUserId, 'SCOOP_RARE', actionScore, jackpotTokens, `เจอของแรร์${rareLoc[tpl]}`);
        
        const msg = (type === 'gold') ? `✨ สุดยอด! เก็บ${rareName[tpl]}สำเร็จ! (+${jackpotTokens}🪙)` : `🎁 ทาดา! ซ่อนของแรร์ไว้ (+${jackpotTokens} Token)`;
        spawn(msg, 'text-neon-gold pulse');
    } else {
        // บันทึก Log ปกติ
        logScoreAction(currentUserId, 'SCOOP_POOP', actionScore, 0);
        
        const tpl = STATE.config.template || 'pet';
        const scoopMsg = { pet: `💩 เก็บแล้ว!`, car: `🛢️ เก็บกวาดแล้ว!`, plant: `🍂 ถอนแล้ว!` };
        spawn(`${scoopMsg[tpl] || scoopMsg.pet} +${gainedXP}XP +${actionScore}🏆`);
    }
    
    checkLevelUp();
    updateUI(); saveState();
};

// --- ระบบสั่น (Haptic Feedback) ---
function vibrate(ms = 15) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

// --- ระบบตัวเลขวิ่ง (Rolling Numbers) ---
let displayScore = 0;
let displayTokens = 0;

function animateNumbers() {
    if (Math.abs(displayScore - STATE.score) > 0.5) {
        displayScore += (STATE.score - displayScore) * 0.15;
        const s = $('hud-score'); if(s) s.innerText = Math.floor(displayScore).toLocaleString();
    } else {
        const s = $('hud-score'); if(s) s.innerText = Math.floor(STATE.score).toLocaleString();
    }
    
    if (Math.abs(displayTokens - STATE.tokens) > 0.5) {
        displayTokens += (STATE.tokens - displayTokens) * 0.15;
        const t = $('hud-tokens'); if(t) t.innerText = Math.floor(displayTokens).toLocaleString();
    } else {
        const t = $('hud-tokens'); if(t) t.innerText = Math.floor(STATE.tokens).toLocaleString();
    }
    requestAnimationFrame(animateNumbers);
}

// เริ่มต้นระบบตัวเลขวิ่ง
setTimeout(() => {
    displayScore = STATE.score;
    displayTokens = STATE.tokens;
    animateNumbers();
}, 1000);

function triggerLevelUpUI(level) {
    const container = document.body;
    
    // 1. Screen Flash Overlay
    const flash = document.createElement('div');
    flash.className = 'fixed inset-0 bg-white z-[1000] pointer-events-none opacity-0 transition-opacity duration-300';
    container.appendChild(flash);
    
    // 2. Grand Label
    const label = document.createElement('div');
    const colors = level >= 50 ? 'from-neon-gold to-yellow-300' : 
                  (level >= 20 ? 'from-neon-purple to-pink-400' : 'from-neon-cyan to-blue-400');
    
    label.className = `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001] pointer-events-none flex flex-col items-center animate-level-up-reveal`;
    label.innerHTML = `
        <div class="text-[10px] font-black tracking-[0.5em] text-white/60 mb-2 uppercase">New Milestone Reached</div>
        <div class="text-6xl font-black italic bg-gradient-to-b ${colors} bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">LEVEL ${level}</div>
        <div class="h-1 w-24 bg-gradient-to-r ${colors} mt-4 rounded-full"></div>
    `;
    container.appendChild(label);

    // Trigger Flash
    requestAnimationFrame(() => {
        flash.style.opacity = '1';
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => flash.remove(), 300);
        }, 50);
    });

    // Cleanup Label
    setTimeout(() => {
        label.classList.add('opacity-0', 'scale-110', 'transition-all', 'duration-1000');
        setTimeout(() => label.remove(), 1000);
    }, 2500);
}

function checkLevelUp() {
    while (STATE.xp >= STATE.maxExp && STATE.level < 100) {
        SFX.playAsset('level');
        STATE.level++;
        STATE.xp -= STATE.maxExp;
        
        // --- 🛡️ UNIT-TESTED XP FORMULA ---
        // Ensuring consistency across all level-up triggers
        STATE.maxExp = Math.floor(200 + (STATE.level * STATE.level * 1.25));
        
        const bonusScore = 5000 + (STATE.level * 1000); 
        const bonusTokens = 500 + (STATE.level * 50); 
        
        STATE.score += bonusScore;
        STATE.tokens += bonusTokens;
        
        // --- 🌟 Achievements & Evolution Milestones ---
        if (STATE.level === 10 || STATE.level === 25 || STATE.level === 50) {
            spawn('🌟 มหัศจรรย์! น้องเกิดการวิวัฒนาการออร่าแล้ว!', 'text-neon-gold scale-125');
            for(let i=0; i<3; i++) setTimeout(() => triggerLevelUpEffect(), i * 600);
        }

        // บันทึก Log การอัปเลเวล
        logScoreAction(currentUserId, 'LEVEL_UP', bonusScore, bonusTokens, `เลเวลเพิ่มเป็น ${STATE.level}`);

        // สั่งแสดง UI แบบพรีเมียม
        triggerLevelUpUI(STATE.level);
        
        spawn(`🆙 ตอนนี้เลเวล ${STATE.level} แล้ว! 🎉`);
        spawn(`🎁 รับรางวัลเลเวลใหม่ +${bonusScore.toLocaleString()} 🏆 และ +${bonusTokens} 🪙`);
        showEmoticon('🆙', 5000);
        
        // ให้โบนัสค่าสถานะเล็กน้อย
        STATE.hunger = Math.min(100, STATE.hunger + 30);
        STATE.love = Math.min(100, STATE.love + 20);
        STATE.clean = Math.min(100, STATE.clean + 30);
        STATE.stamina = Math.min(STATE.maxStamina, STATE.stamina + 50);

        updatePetScale(STATE.level);
        triggerLevelUpEffect(); // 🎉 ระเบิดพลุพาร์ทิเคิลฉลอง!
    }
    if (STATE.level >= 100) {
        STATE.level = 100;
        STATE.xp = Math.min(STATE.xp, STATE.maxExp - 1);
    }
}

// local storage save/load functions now handled by state.js

window.addEventListener('storage', (e) => {
    if(e.key==='pw3d_config') {
        loadAdminConfigLocal();
        const active = getActiveConfig();
        const tpl = STATE.config.template || 'pet';
        
        let finalModel = STATE.config.custom_model;
        if (!isAdminPreview && STATE.inventory?.equipped_skins?.[tpl]) {
            finalModel = STATE.inventory.equipped_skins[tpl];
        }

        const skins = STATE.config.available_skins || [];
        const currentSkin = skins.find(s => s.model === finalModel) || skins.find(s => s.model === STATE.config.custom_model);
        const rotation = currentSkin ? (currentSkin.rotationY || 0) : (STATE.config.custom_rotation_y || 0);

        updateTemplate(STATE.config.template, finalModel, rotation);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateEngineConfig({
            poop_lifetime: active.mechanics?.poop_lifetime || 30,
            reward_lifetime: active.mechanics?.reward_lifetime || 20,
            max_poops: active.mechanics?.max_poops || 3,
            max_rewards: active.mechanics?.max_rewards || 3,
            drop_offset: currentSkin?.drop_offset || {x:0, y:0.1, z:-0.2}
        });
        updateUI();
    }
});

window.addEventListener('message', (e) => {
    if(e.data && e.data.type === 'PW3D_PREVIEW') {
        applyConfigToState(e.data.config);
        const active = getActiveConfig();
        
        let finalModel = STATE.config.custom_model;
        const tpl = STATE.config.template || 'pet';
        
        // ในหน้าพรีวิว Admin ให้เชื่อฟังค่าจาก Dashboard เท่านั้น ไม่ต้องสน Inventory ผู้เล่น
        if (!isAdminPreview && STATE.inventory?.equipped_skins?.[tpl]) {
            finalModel = STATE.inventory.equipped_skins[tpl];
        }

        const skins = STATE.config.available_skins || [];
        const currentSkin = skins.find(s => s.model === finalModel) || skins.find(s => s.model === STATE.config.custom_model);
        const rotation = currentSkin ? (currentSkin.rotationY || 0) : (STATE.config.custom_rotation_y || 0);

        updateTemplate(STATE.config.template, finalModel, rotation);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateEngineConfig({
            poop_lifetime: active.mechanics?.poop_lifetime || 30,
            reward_lifetime: active.mechanics?.reward_lifetime || 20,
            max_poops: active.mechanics?.max_poops || 3,
            max_rewards: active.mechanics?.max_rewards || 3,
            drop_offset: currentSkin?.drop_offset || {x:0, y:0.1, z:-0.2}
        });
        
        if (typeof unlockScreen === 'function' && $('pin-lock-screen')) unlockScreen();
        updateUI();
    }
});

// loadBoard ถูกแทนที่ด้วย toggleRanking (ดึงข้อมูลจริงจาก Supabase)

window.toggleQuest = (close) => {
    const m = $('quest-modal');
    if (!m) return;
    
    if (close === true || (close !== false && !m.classList.contains('hidden'))) {
        m.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.remove('opacity-100', 'translate-y-0');
        setTimeout(() => { if(m.classList.contains('opacity-0')) m.classList.add('hidden'); }, 500);
        return;
    }

    // Opening Quest
    if (window.toggleShop) window.toggleShop(true);
    if (window.toggleRanking) window.toggleRanking(true);
    if (window.toggleNameModal) window.toggleNameModal(true);

    m.classList.remove('hidden');
    setTimeout(() => {
        m.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.add('opacity-100', 'translate-y-0');
    }, 10);
    
    updateQuestUI();
};

window.claimQuestReward = () => {
    if(STATE.quests.claimed) return;
    const tiers = ['feed','clean','play'];
    let allDone = true;
    tiers.forEach(t => { if(STATE.quests[t] < STATE.quests[`${t}_max`]) allDone = false; });
    if(STATE.quests.special.current < STATE.quests.special.target) allDone = false;
    
    if(!allDone) { spawn('🔒 เควสยังไม่ครบ!'); return; }

    const active = getActiveConfig();
    const mult = active.quests.reward_mult || 1.0;
    const base_tokens = Math.floor(active.quests.base_tokens * mult);
    const base_score = Math.floor(active.quests.base_score * mult);
    const base_xp = Math.floor(2500 * mult);

    const now = Date.now();
    const scoreMult = (STATE.buffs.score_mult || 1.0);
    const xpMult = 1.0; // เก็บไว้ขยายผลต่อ

    const gainedScore = Math.floor(base_score * scoreMult);
    const gainedTokens = base_tokens;
    const gainedXP = base_xp;

    STATE.tokens += gainedTokens;
    STATE.score += gainedScore;
    STATE.xp += gainedXP;
    STATE.quests.claimed = true;
    
    // Regen buff also scales slightly with difficulty to help recovery
    const buffPower = isHardMode() ? 2.5 : (isEasyMode() ? 1.2 : 1.8);
    STATE.buffs.regen = buffPower;
    STATE.buffs.regen_expiry = Date.now() + (6 * 60 * 60 * 1000); 

    logScoreAction(currentUserId, 'QUEST_CLAIM', gainedScore, gainedTokens, `สำเร็จภารกิจ (${STATE.config.difficulty_mode})`);

    spawn(`🎁 เควสสำเร็จ! +${gainedTokens}🪙 +${gainedScore}🏆 (Buff x${buffPower})`);
    updateUI(); saveState();
};

function isHardMode() { return STATE.config.difficulty_mode === 'hard'; }
function isEasyMode() { return STATE.config.difficulty_mode === 'easy'; }

function resetDailyQuests() {
    const last = localStorage.getItem('pw3d_last_quest');
    const now = new Date().toDateString();
    if (last !== now) {
        const active = getActiveConfig();
        const randIndex = Math.floor(Math.random() * SPECIAL_QUEST_POOL.length);
        const picked = SPECIAL_QUEST_POOL[randIndex];
        
        let target = 5;
        if(picked.type === 'scoop') target = active.quests.target_scoop || 10;
        if(picked.type === 'fever') target = active.quests.target_fever || 2;
        if(picked.type === 'pure_love') target = 100;
        if(picked.type === 'spend') target = active.quests.target_spend || 1000;

        // ปรับแต่ง Label และ Icon ของ Special Quest ให้ตรงตาม Template
        const tpl = STATE.config.template || 'pet';
        let customLabel = picked.label;
        let customIcon = picked.icon;

        if (picked.type === 'scoop') {
            const labels = { pet: 'นักช้อนอึมือทอง', car: 'ระเบิดคราบน้ำมัน', plant: 'มือปราบวัชพืช' };
            const icons = { pet: '💩', car: '🛢️', plant: '🍂' };
             customLabel = labels[tpl] || labels.pet;
             customIcon = icons[tpl] || icons.pet;
        }

        STATE.quests = {
            feed: 0, feed_max: active.quests.target_feed || 3,
            clean: 0, clean_max: active.quests.target_clean || 2,
            play: 0, play_max: active.quests.target_play || 1,
            special: { 
                type: picked.type, 
                label: customLabel, 
                icon: customIcon, 
                target: target, 
                current: 0 
            },
            claimed: false
        };
        localStorage.setItem('pw3d_last_quest', now);
        updateUI(); saveState();
    }
}

function checkLoginReward() {
    const today = new Date().toDateString();
    if (STATE.last_login_date === today) return; 

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    if (STATE.last_login_date === yesterdayStr) {
        STATE.login_streak = (STATE.login_streak || 0) + 1;
    } else {
        STATE.login_streak = 1;
    }

    if (STATE.login_streak > 7) STATE.login_streak = 1;
    STATE.last_login_date = today;
    
    const config = getActiveConfig();
    const rewards = config.login_rewards || [];
    const reward = rewards.find(r => r.day === STATE.login_streak);
    
    if (reward) {
        STATE.tokens += reward.tokens;
        logScoreAction(currentUserId, 'LOGIN_REWARD', 0, reward.tokens, `รางวัลเช็คอินวันที่ ${STATE.login_streak}`);
        
        setTimeout(() => {
            if (window.spawn) {
                spawn(`📆 เช็คอินวันที่ ${STATE.login_streak}: รับ ${reward.tokens} 🪙`, 'text-neon-gold scale-125');
                SFX.playAsset('bell');
            }
        }, 3000);
    }
    saveState();
}

window.toggleRanking = async (close) => {
    const m = $('ranking-modal');
    if (!m) return;
    
    if (close === true || (close !== false && !m.classList.contains('hidden'))) {
        m.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.remove('opacity-100', 'translate-y-0');
        setTimeout(() => { if(m.classList.contains('opacity-0')) m.classList.add('hidden'); }, 500);
        return;
    }

    // Opening Ranking
    if (window.toggleShop) window.toggleShop(true);
    if (window.toggleQuest) window.toggleQuest(true);
    if (window.toggleNameModal) window.toggleNameModal(true);

    m.classList.remove('hidden');
    setTimeout(() => {
        m.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.add('opacity-100', 'translate-y-0');
    }, 10);


    if (!m.classList.contains('hidden')) {
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


function updateLoading(progress) {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = `${progress}%`;
    if (progress >= 100) {
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            const app = document.getElementById('app-content');
            if (splash) splash.style.opacity = '0';
            if (app) { app.style.opacity = '1'; app.style.pointerEvents = 'auto'; }
            setTimeout(() => { if (splash) splash.remove(); }, 800);
        }, 500);
    }
}

    updateLoading(20);
    // ถ้ายังไม่ได้เข้าสู่ระบบ ให้เอา Splash ออกเพื่อให้เห็นหน้า Login/PIN ได้เลย
    const sessionUser = sessionStorage.getItem('pw3d_session_user');
    if (!sessionUser) {
        updateLoading(100);
    }

    await initAuth();
    updateLoading(40);
    
    const urlParams = new URLSearchParams(window.location.search);
    const userId = sessionUser || urlParams.get('userId');

    loadAdminConfigLocal();
    updateLoading(60);
    setWorldSeed(userId || 'GUEST_USER');
    
    const tpl = STATE.config.template || 'pet';
    let finalModel = STATE.config.custom_model;
    
    if (STATE.inventory) {
        if (STATE.inventory.equipped_skins && STATE.inventory.equipped_skins[tpl]) {
            finalModel = STATE.inventory.equipped_skins[tpl];
        } else if (STATE.inventory.equipped_skin) {
            finalModel = STATE.inventory.equipped_skin;
            delete STATE.inventory.equipped_skin; 
        }
    }

    const skins = STATE.config.available_skins || [];
    const equippedSkin = skins.find(s => s.model === finalModel);
    const finalRotation = equippedSkin ? (equippedSkin.rotationY || 0) : (STATE.config.custom_rotation_y || 0);

    updateLoading(100);

    init3D('three-canvas', STATE.config.template, { 
        sky:STATE.config.sky, ground:STATE.config.ground, 
        customModel: finalModel,
        customRotationY: finalRotation
    });

    // ส่งค่า Config ของการดรอปของและฟิสิกส์เข้าไปใน Engine
    const active = getActiveConfig();
    updateEngineConfig(active.mechanics);
    updateEngineConfig(active.physics);
    if (equippedSkin) updateEngineConfig({ drop_offset: equippedSkin.drop_offset });
    
    updatePetScale(STATE.level); 
    refreshPetAura(STATE.level);
    resetDailyQuests(); 
    updateUI();
    
    setPoopCallbacks(
        (t) => {
            STATE.love = Math.min(100, STATE.love + 5);
            STATE.xp += 5;
            spawn('✨ ทำความสะอาดเรียบร้อย!', 'text-cyan-400');
            updateUI(); saveState();
        },
        () => {
            const mech = STATE.config.mechanics || { dec_happy_poop: 12 };
            const penaltyVal = mech.dec_happy_poop || 12;
            STATE.love = Math.max(0, STATE.love - penaltyVal);
            const tpl = STATE.config.template || 'pet';
            const expireMsg = { pet: `💩 อึเน่าเกินไป! -${penaltyVal}♥`, car: `🛢️ น้ำมันไหลเลอะเทอะ! -${penaltyVal}♥`, plant: `🍂 วัชพืชรกมาก! -${penaltyVal}♥` };
            spawn(expireMsg[tpl] || expireMsg.pet);
            updateUI(); saveState();
        }
    );

    setRewardCallback((type, val) => {
        const tpl = STATE.config.template || 'pet';
        const diff = STATE.config.difficulty_mode || 'normal';
        const matrix = (STATE.config.matrix[tpl] && STATE.config.matrix[tpl][diff]) ? STATE.config.matrix[tpl][diff] : {};
        const rew = matrix.rewards || { legendary_tokens: 250, rare_tokens: 80 };
        
        let tokens = 10;
        let xp = 10;
        let score = 0;
        let msg = '';
        
        if (type === 'diamond' || type === 'legend') {
            const min = rew.diamond_min || 1000;
            const max = rew.diamond_max || 2500;
            tokens = Math.floor(min + Math.random() * (max - min)); 
            xp = 500;
            score = tokens * 2;
            msg = `💎 สมบัติระดับเพชร! +${tokens.toLocaleString()}🪙 (+${score.toLocaleString()}🏆)`;
        } else if (type === 'gold' || type === 'rare') {
            const min = rew.gold_min || 150;
            const max = rew.gold_max || 300;
            tokens = Math.floor(min + Math.random() * (max - min));
            xp = 180;
            score = tokens * 1.8;
            msg = `🥇 เหรียญทองคำ! +${tokens}🪙 (+${score}🏆)`;
        } else {
            const min = rew.silver_min || 15;
            const max = rew.silver_max || 35;
            tokens = Math.floor(min + Math.random() * (max - min));
            xp = 35;
            score = tokens * 5;
            msg = `🥈 เหรียญเงิน! +${tokens}🪙 (+${score}🏆)`;
        }

        
        STATE.tokens += tokens;
        STATE.xp += xp;
        STATE.score += score;
        
        if (type === 'diamond' || type === 'gold') SFX.playJingle();
        else SFX.playCoin();

        
        // ส่ง Log ขึ้น Cloud
        const logType = type ? type.toUpperCase() : 'UNKNOWN';
        logScoreAction(currentUserId, `COLLECT_${logType}`, score, tokens);

        spawn(msg, 'text-neon-gold pulse');
        updateUI();
        saveState();
    });

    function scheduleNextPoop() {
        const tpl = STATE.config.template || 'pet';
        const diff = STATE.config.difficulty_mode || 'normal';
        const matrix = (STATE.config.matrix[tpl] && STATE.config.matrix[tpl][diff]) ? STATE.config.matrix[tpl][diff] : {};
        const mech = matrix.mechanics || { sp_min:60, sp_max:180 };
        
        // ดึงความถี่การเกิดมาจาก Dashboard (Matrix)
        const delayInSeconds = mech.sp_min + Math.random() * (Math.max(0, mech.sp_max - mech.sp_min));
        const baseDelay = Math.max(5000, delayInSeconds * 1000); 
        
        setTimeout(() => {
            let rareRate = (mech.rare_rate ?? 12) / 100;
            
            // 💖 Happiness Bonus: ยิ่งมีความสุข โอกาสเจอของแรร์ยิ่งสูง
            const love = STATE.love || 0;
            if (love > 90) rareRate *= 2.0;      // Fever: โอกาส x2
            else if (love > 70) rareRate *= 1.3; // Happy: โอกาส x1.3
            
            const type = Math.random() < rareRate ? 'gold' : 'normal';
            const tpl = STATE.config.template || 'pet';
            const poopMsg = { pet: '💩 น้องปวดท้องอึ!', car: '🛢️ น้ำมันหยดลงพื้น!', plant: '🍂 ใบไม้ร่วงแล้ว!' };
            const goldMsg = { pet: '✨ น้องทำทองร่วง!', car: '✨ น้ำมันพิเศษหยดลงมา!', plant: '✨ ใบไม้สีทองร่วงลงมา!' };

            if (spawnPoop(type)) {
                SFX.playSpawn();
                if (type === 'gold') spawn(goldMsg[tpl] || goldMsg.pet, 'text-neon-gold pulse');
                else spawn(poopMsg[tpl] || poopMsg.pet);
            }
            scheduleNextPoop();
        }, baseDelay);
    }
    if (viewType !== 'widget') scheduleNextPoop();

    function scheduleNextReward() {
        const tpl = STATE.config.template || 'pet';
        const diff = STATE.config.difficulty_mode || 'normal';
        const matrix = (STATE.config.matrix[tpl] && STATE.config.matrix[tpl][diff]) ? STATE.config.matrix[tpl][diff] : {};
        const mech = matrix.mechanics || { sp_min:60, sp_max:180 };
        const rew = matrix.rewards || {};
        
        // รางวัลพิเศษใช้ความถี่เดียวกับไอเทมจิปาถะ หรืออาจจะคูณ 1.5 เพื่อให้เกิดยากกว่านิดหน่อย
        const delay = (mech.sp_min * 1.5 + Math.random() * (mech.sp_max - mech.sp_min)) * 1000;
        
        setTimeout(() => {
            let rGold = (rew.gold_rate || rew.rare_rate || 25) / 100;
            let rDiamond = (rew.diamond_rate || rew.legendary_rate || 5) / 100;
            
            // 💖 Luck Bonus from Happiness
            const love = STATE.love || 0;
            const luckMult = (love > 90) ? 2.0 : (love > 70 ? 1.3 : 1.0);
            rGold *= luckMult;
            rDiamond *= luckMult;


            const roll = Math.random();
            let rType = 'silver';
            if (roll < rDiamond) rType = 'diamond';
            else if (roll < rDiamond + rGold) rType = 'gold';

            if (spawnReward(rType)) {

                SFX.playSpawn();
                if (rType === 'diamond') spawn('💎 ว้าว! สมบัติระดับเพชรร่วงลงมา!', 'text-cyan-400 pulse');
                else if (rType === 'gold') spawn('🥇 โอ้! เหรียญทองร่วงลงมาละ!', 'text-neon-gold');
                else spawn('🥈 มีเหรียญเงินร่วงลงมา!');
            }

            scheduleNextReward();
        }, delay);
    }
    if (viewType !== 'widget') scheduleNextReward();

    function updatePetSentience() {
        const tpl = STATE.config.template || 'pet';
        
        // --- 🎭 Icon Mapping based on Template ---
        const icons = {
            pet:   { hunger: '🍖', clean: '🚿', play: '🎾', happy: ['😊', '✨', '💖', '🎵'] },
            car:   { hunger: '⛽', clean: '🚿', play: '🔧', happy: ['🏎️', '🔥', '⚡', '💎'] },
            plant: { hunger: '💧', clean: '🌿', play: '🎵', happy: ['🌸', '✨', '☀️', '🌈'] }
        };
        const curIcons = icons[tpl] || icons.pet;

        if (STATE.hunger < 20) {
            showEmoticon(curIcons.hunger);
        }
        else if (STATE.clean < 20) {
            showEmoticon(curIcons.clean);
        }
        else if (STATE.love < 20) {
            showEmoticon(curIcons.play);
        }
        else if (STATE.hunger > 90 && STATE.love > 90 && Math.random() > 0.8) {
            const happyEmoji = curIcons.happy[Math.floor(Math.random() * curIcons.happy.length)];
            showEmoticon(happyEmoji);
        }
    }

    // --- ⚙️ START THE GAME LOOP ---
    setInterval(()=>{
        if (!isGameActive) return; 
        
        // 🧪 ดึงข้อมูล Config ล่าสุดมาคำนวณ
        const tpl = STATE.config.template || 'pet';
        const diff = STATE.config.difficulty_mode || 'normal';
        const active = getActiveConfig();
        const mech = active.mechanics || {};
        
        // mRaw เพื่อความเสถียรในการดึงแบบด่วน (Legacy Support)
        const matrix = (STATE.config.matrix[tpl] && STATE.config.matrix[tpl][diff]) ? STATE.config.matrix[tpl][diff] : {};
        const mRaw = matrix.mechanics || mech;
        
        if (Math.random() < 0.2) updatePetSentience();

        STATE.maxStamina = STATE.maxStamina || 100;
        const now = Date.now();
        
        // 🛡️ เคลียร์บัฟที่หมดอายุ
        if (STATE.buffs.score_expiry > 0 && now > STATE.buffs.score_expiry) { STATE.buffs.score_mult = 1.0; STATE.buffs.score_expiry = 0; }
        if (STATE.buffs.decay_expiry > 0 && now > STATE.buffs.decay_expiry) { STATE.buffs.decay_mult = 1.0; STATE.buffs.decay_expiry = 0; }
        if (STATE.buffs.luck_expiry > 0 && now > STATE.buffs.luck_expiry) { STATE.buffs.luck_mult = 1.0; STATE.buffs.luck_expiry = 0; }
        if (STATE.buffs.regen_expiry > 0 && now > STATE.buffs.regen_expiry) { STATE.buffs.regen = 1.0; STATE.buffs.regen_expiry = 0; }

        // --- ⚙️ LOGIC UPDATES ---
        const decayMult = (STATE.buffs.decay_mult || 1.0);

        // 1. Hunger & Clean Decay
        STATE.hunger = Math.max(0, STATE.hunger - ((mRaw.dec_hunger ?? 0.08) * decayMult));
        STATE.clean = Math.max(0, STATE.clean - ((mRaw.dec_clean ?? 0.05) * decayMult));

        let happyDecay = (mRaw.dec_happy ?? 0.06) * decayMult;
        if (STATE.hunger < 20 || STATE.clean < 20) happyDecay *= 2.0; 
        STATE.love = Math.max(0, STATE.love - happyDecay); 

        if (STATE.hunger > 85 && STATE.clean > 85) {
            STATE.love = Math.min(100, STATE.love + 0.05); 
        }
        
        let multiplier = 1.0;
        const thr = mech.fever_threshold ?? 85;
        const isPerfect = (STATE.hunger >= thr && STATE.love >= thr && STATE.clean >= thr);
        if (isPerfect) multiplier *= (mech.fever_mult ?? 1.5);
        if (STATE.buffs.regen > 1 && Date.now() < STATE.buffs.regen_expiry) multiplier *= STATE.buffs.regen;

        const currentRegen = mech.reg_stamina ?? 0.75;
        if (STATE.stamina < STATE.maxStamina) {
            STATE.stamina = Math.min(STATE.maxStamina, STATE.stamina + (currentRegen * multiplier));
        }

        // 2. UI Updates
        window.updateUI();
        refreshPetAura(STATE.level, isPerfect);
        
        if (Math.random() < 0.05) saveState(); 
    }, 1000);

    window.addEventListener('click', () => SFX.init(), { once: true });
    window.addEventListener('touchstart', () => SFX.init(), { once: true });

    // 🛡️ GUARDIAN AUTO-SAVE: บันทึกทุก 5 นาที + ทันทีที่พับหน้าจอ
    setInterval(() => saveState(), 5 * 60 * 1000); 
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveState();
    });
    window.addEventListener('beforeunload', () => saveState());

    // --- 🚀 START THE ENGINE 🚀 ---
    await loadState();
    await initAuth(); 
    checkLoginReward();
    
    updateUI(); 
    if (window.twemoji) {
        twemoji.parse($('game-container'));
    }

    // 👹 START BOSS SYSTEM
    initBossController(STATE, { spawnWorldRock, clearWorldRocks, throwRockAtBoss, collectWorldRockAtPet, _getPetPosition, updateBossModel });
})();
