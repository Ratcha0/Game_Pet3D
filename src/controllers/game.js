import '@google/model-viewer';
import '../styles.css';
import { init3D, updateTemplate, updateEnvironment, spawnPoop, setPoopCallbacks, collectPoopByUI, spawnReward, setRewardCallback, updateEngineConfig, updatePetScale, triggerLevelUpEffect, setWorldSeed, showEmoticon, refreshPetAura, spawnWorldRock, clearWorldRocks, throwRockAtBoss, collectWorldRockAtPet, _getPetPosition, updateBossModel, flashBoss } from '../engine/3d_engine.js';
import { initBossController } from './boss_controller.js';
import * as SupabaseSvc from '../services/supabase.js';
const { logScoreAction, fetchLeaderboard, fetchSeasonRankings } = SupabaseSvc;
window.SupabaseSvc = SupabaseSvc;

import { 
    STATE, SPECIAL_QUEST_POOL, 
    loadState, saveState, applyConfigToState, loadAdminConfigLocal, 
    loadGameConfigCloud, getActiveConfig
} from '../store/state.js';
import { SFX } from '../services/sound.js';
import { isGameActive, initAuth } from './auth.js';
import { initShop } from './shop.js';
import { BossRewardController } from './boss_reward_controller.js';

const $ = id => document.getElementById(id);
const safeNum = (val, fallback) => { const n = parseFloat(val); return isNaN(n) ? fallback : n; };

/**
 * 📊 [QUEST UNIFICATION] ฟังก์ชันกลางสำหรับเพิ่มความก้าวหน้าเควส
 * รองรับทั้งเควสรายวันปกติ และเควสพิเศษ (Special Quest)
 */
window.incrementQuestProgress = (type, amount = 1) => {
    if (!STATE.quests) return;

    // 1. จัดการเควสรายวันหลัก (feed, clean, play)
    if (STATE.quests[type] !== undefined) {
        const activeCfg = getActiveConfig();
        const max = parseInt(activeCfg?.quests?.[`target_${type}`]) || parseInt(STATE.quests[`${type}_max`]) || 5;
        STATE.quests[type] = Math.min(max, (parseInt(STATE.quests[type]) || 0) + amount);
    }

    // 2. จัดการเควสพิเศษ (Special Quest)
    if (STATE.quests.special && STATE.quests.special.type === type) {
        const target = parseInt(STATE.quests.special.target) || 100;
        STATE.quests.special.current = Math.min(target, (parseInt(STATE.quests.special.current) || 0) + amount);
    }

    if (window.updateQuestUI) window.updateQuestUI();
};
window.incrementSpecialQuest = window.incrementQuestProgress; // Alias เพื่อรองรับโค้ดเก่า
const urlParams = new URLSearchParams(window.location.search);
window.SFX = SFX; // 🎵 [FIX] ทำให้หน้า HTML เรียกใช้ระบบเสียงได้โดยตรง
const viewType = urlParams.get('view') || 'mobile';
const isAdminPreview = urlParams.get('admin') === 'true' || window.name === 'admin-preview';
if (isAdminPreview) document.body.classList.add('is-admin-preview');
if (viewType === 'widget') document.body.classList.add('is-widget');

// [UTILITY] คำนวณตัวคูณคะแนนตามความยาก
function getDifficultyMultiplier() {
    const diff = STATE.config?.difficulty_mode || 'normal';
    if (diff === 'hard') return 1.75;
    if (diff === 'easy') return 0.75;
    return 1.0;
}

(async function() {
    // 🔥 [CRITICAL] โหลด Config ล่าสุดจาก Cloud
    await loadGameConfigCloud();
    
    window.STATE = STATE; // Expose to window for inline scripts and debugging
let spawnCount = 0;
window.spawn = function(msg, cls = "text-white text-[12px] sm:text-base md:text-xl") {
    const a=$('spawn-area'); if(!a) return;
    const e=document.createElement('div');
    e.className = `px-5 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/20 text-white font-black shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-none animate-float-up z-[9999] max-w-[85vw] text-center ${cls}`;
    e.style.position = 'fixed';
    e.style.left = '50%';
    const offset = (spawnCount % 5) * 45;
    e.style.top = `calc(35% + ${offset}px)`;
    e.style.transform = 'translate(-50%, -50%)'; 
    e.innerHTML = msg;
    if (window.twemoji) twemoji.parse(e);
    a.appendChild(e);
    spawnCount++;
    setTimeout(() => {
        e.classList.add('opacity-0', 'scale-90', 'transition-all', 'duration-500');
        setTimeout(() => {
            e.remove();
            if (spawnCount > 0) spawnCount--;
        }, 500);
    }, 2000);
};

// --- Sync UI with other instances ---
window.addEventListener('state-synced', () => {
    // 🔥 [AUDIT FIX] ลบโค้ดที่ค้างไว้และอัปเดตโมเดลให้ตรงกับ Level ล่าสุด
    updatePetScale(STATE.level);
    refreshPetAura(STATE.level);
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
        
        // 📈 XP Progress Bar & Levels
        const lvlEl = $('hud-level');
        const xpBar = $('bar-xp');
        const xpVal = $('hud-xp-val');
        
        const safeLvl = parseInt(STATE.level) || 1;
        const safeXP  = parseFloat(STATE.xp) || 0;
        const safeMax = parseFloat(STATE.max_exp) || 200;

        if (lvlEl) lvlEl.innerText = safeLvl;
        if (xpBar) {
            const percentage = (safeXP / safeMax) * 100;
            xpBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        }
        if (xpVal) xpVal.innerText = `${Math.floor(safeXP)}/${Math.floor(safeMax)} XP`;

        // Update Shop display from config
        const active = getActiveConfig();
        if (active && active.shop) {
            ['small','medium','large'].forEach(tier => {
                const c = $(`shop-cost-${tier}`); if(c) c.innerText = active.shop[`${tier}_tokens`];
                const a = $(`shop-amt-${tier}`); if(a) a.innerText = active.shop[`${tier}_amount`];
            });
        }

        // 🛡️ [AUTO-THEME SYNC] อัปเดตไอคอนและป้ายชื่อเมื่อ Template หรือ Skin เปลี่ยน
        const activeSkin = STATE.inventory?.equipped_skins?.pet || '';
        const uiKey = `${STATE.config.template}_${activeSkin}`;
        
        if (window._lastUIKey !== uiKey) {
            window._lastUIKey = uiKey;
            
            const isCarSkin = activeSkin.toLowerCase().includes('car');
            const effectiveTemplate = isCarSkin ? 'car' : (STATE.config.template || 'pet');
            
            const labels = {
                pet:   { h:'ความหิว', l:'ความรัก', c:'ความสะอาด', s:'พลังงาน', af:'ป้อนอาหาร', ac:'อาบน้ำ', ap:'เล่นด้วย' },
                car:   { h:'เชื้อเพลิง', l:'สภาพเครื่อง', c:'ความเงางาม', s:'แบตเตอรี่', af:'เติมน้ำมัน', ac:'ล้างรถ', ap:'จูนเครื่อง' },
                plant: { h:'ระดับน้ำ', l:'รับแสงแดด', c:'ความสดชื่น', s:'การเติบโต', af:'รดน้ำ', ac:'เช็ดใบ', ap:'เปิดเพลง' }
            };
            const statIcons = {
                pet:   { hunger:'🍖', happy:'💖', clean:'🧼', stamina:'⚡' },
                car:   { hunger:'⛽', happy:'🔧', clean:'✨', stamina:'🔋' },
                plant: { hunger:'💧', happy:'☀️', clean:'🌿', stamina:'☘️' }
            };
            const actIcons = {
                pet:   { feed:'🍗', clean:'🧼', play:'🎾' },
                car:   { feed:'⛽', clean:'🚿', play:'🏁' },
                plant: { feed:'💧', clean:'🌿', play:'🎵' }
            };

            const cur = labels[effectiveTemplate] || labels.pet;
            const si = statIcons[effectiveTemplate] || statIcons.pet;
            const ai = actIcons[effectiveTemplate] || actIcons.pet;

            const ih=$('icon-hunger'); if(ih) ih.innerText = si.hunger;
            const ihp=$('icon-happy'); if(ihp) ihp.innerText = si.happy;
            const ic=$('icon-clean'); if(ic) ic.innerText = si.clean;
            
            const stats = [['lbl-stat-hunger', cur.h], ['lbl-stat-happy', cur.l], ['lbl-stat-clean', cur.c], ['lbl-stat-stamina', cur.s]];
            stats.forEach(([id, val]) => { const el = $(id); if(el) el.innerText = val; });

            const acts = [['lbl-act-feed', cur.af], ['lbl-act-clean', cur.ac], ['lbl-act-play', cur.ap]];
            acts.forEach(([id, val]) => { const el = $(id); if(el) el.innerText = val; });
            
            const actBtnIcons = [['icon-act-feed', ai.feed], ['icon-act-clean', ai.clean], ['icon-act-play', ai.play]];
            actBtnIcons.forEach(([id, val]) => { const el = $(id); if(el) el.innerText = val; });

            // Update User Icon to match effective template
            const userIcon = $('hud-user-icon');
            if (userIcon) {
                const icons = { pet:'🐱', car:'🏎️', plant:'🌵' };
                userIcon.innerText = icons[effectiveTemplate] || '🐱';
                if (window.twemoji) twemoji.parse(userIcon);
            }

            // 🔥 [SHOP THEME SYNC] อัปเดตไอคอนและหน่วยในร้านค้าตามธีม
            const shopIcon = si.stamina || '⚡';
            ['small','medium','large'].forEach(tier => {
                const iconEl = $(`shop-icon-${tier}`);
                const unitEl = $(`shop-unit-${tier}`);
                if (iconEl) iconEl.innerText = tier === 'small' ? shopIcon : (tier === 'medium' ? shopIcon+shopIcon : shopIcon+shopIcon+shopIcon);
                if (unitEl) unitEl.innerText = shopIcon;
            });
            const shopTabStamina = $('btn-tab-stamina');
            if (shopTabStamina) shopTabStamina.innerText = `${shopIcon} ${cur.s || 'พลัง'}`;

            // 🛍️ [SHOP REFRESH]
            const isShopOpen = !document.getElementById('shop-modal')?.classList.contains('hidden');
            if (isShopOpen) {
                if (window.updateSkinButtons) window.updateSkinButtons();
                if (window.renderShopBoosters) window.renderShopBoosters();
                if (window.renderShopSkins) window.renderShopSkins();
            }
        } else if (window._forceRerender) {
            if (window.renderShopSkins) {
                window.renderShopSkins();
                window._forceRerender = false;
            }
        }

        const activeCfg = getActiveConfig() || {};
        const mechanics = activeCfg.mechanics || {};
        const maxStam = mechanics.max_stamina || 100;

        [['bar-hunger','val-hunger',STATE.hunger], ['bar-happy','val-happy',STATE.love],
         ['bar-clean','val-clean',STATE.clean], ['bar-stamina','val-stamina',STATE.stamina]]
        .forEach(([b,v,val])=>{
            const maxVal = (b === 'bar-stamina') ? maxStam : 100;
            const bar = $(b); 
            if(bar) {
                const currentVal = parseFloat(val) || 0;
                const percent = Math.min(100, Math.max(0, (currentVal / (maxVal || 100)) * 100));
                bar.style.width = `${percent}%`;
            }
            const txt = $(v); if(txt) {
                const isStamina = b === 'bar-stamina';
                const displayVal = Math.round(parseFloat(val) || 0);
                txt.innerHTML = isStamina ? `${displayVal}` : `${displayVal}%`;

                const parentBox = bar ? bar.parentElement : null;
                if (displayVal < 20 && b !== 'bar-stamina') {
                    txt.classList.add('alert-red');
                    if(parentBox) parentBox.classList.add('alert-red');
                } else {
                    txt.classList.remove('alert-red');
                    if(parentBox) parentBox.classList.remove('alert-red');
                }
            }
        });

        const moodEl = $('mood-emoji');
        const moodVal = $('mood-val');
        if(moodEl && moodVal) {
            const curLove = Math.round(STATE.love || 0);
            moodVal.innerText = `${curLove}%`;
            
            let newEmoji = '😐';
            if(curLove > 85) newEmoji = '😍';
            else if(curLove > 50) newEmoji = '😊';
            else if(curLove > 20) newEmoji = '😐';
            else newEmoji = '🥺';
            
            if (moodEl.innerText !== newEmoji) {
                moodEl.innerText = newEmoji;
                if (window.twemoji) twemoji.parse(moodEl);
            }
        }

        const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name || 'Season 1';
        const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_duration || 15}D`;

        if(STATE.love >= 100) incrementSpecialQuest('pure_love');

        if (window.updateBossThrowUI) window.updateBossThrowUI();

        const loginDot = $('login-noti-dot');
        if (loginDot) {
            const today = new Date().toDateString();
            const localLastLogin = localStorage.getItem('last_login_verified_' + STATE.username);
            const canClaim = STATE.last_login_date !== today && localLastLogin !== today;
            loginDot.classList.toggle('hidden', !canClaim);
        }

        updateQuestUI();
        updateBuffUI();
    } catch (e) {
        console.error("❌ updateUI Error:", e);
    }
}

window.toggleMainHUD = () => {
    const panel = $('main-stats-panel');
    const area = $('hud-toggle-area');
    const icon = area?.querySelector('.hud-toggle-icon');
    const text = area?.querySelector('.hud-toggle-text');
    
    if (!panel) return;
    
    const isCollapsed = panel.classList.toggle('collapsed');
    
    if (area) {
        area.classList.toggle('mini-mode', isCollapsed);
        if (text) text.innerText = isCollapsed ? 'แสดงหน้าจอ' : 'ย่อหน้าจอ';
        if (icon) {
            // ใช้สไตล์หมุนจาก CSS หรือ Inline
            icon.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            icon.innerText = '▼';
        }
    }
    
    // 🔥 แจ้งเตือนระบบบอสให้อัปเดต UI (ถ้ามี)
    if (window.updateSkillUI) window.updateSkillUI();
    
    SFX.playAsset('click');
};


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
                    <div class="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center relative overflow-hidden shadow-lg" style="box-shadow: 0 0 10px ${b.shadow}">
                        <div class="absolute inset-0 ${b.bg} opacity-30"></div>
                        <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="${radius}" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.1" />
                            <circle cx="20" cy="20" r="${radius}" fill="none" stroke="${b.color}" stroke-width="3" 
                                stroke-dasharray="${circum}" stroke-dashoffset="${offset}" stroke-linecap="round" 
                                style="filter: drop-shadow(0 0 3px ${b.color})" />
                        </svg>
                        <span class="text-[9px] sm:text-sm z-10">${b.icon}</span>
                        <div class="absolute -bottom-0.5 right-0.5 z-20 text-[6px] sm:text-[8px] font-black text-white drop-shadow-md">${timeLeft}m</div>
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
    let mainDone = true;
    
    // [AUTO-THEME SYNC] ตรวจสอบ Template จริงจากสกินที่ใส่อยู่
    const activeSkin = STATE.inventory?.equipped_skins?.pet || '';
    const isCarSkin = activeSkin.toLowerCase().includes('car');
    const effectiveTemplate = isCarSkin ? 'car' : (STATE.config.template || 'pet');
    
    // Template-aware quest labels
    const qLabels = {
        pet:   { feed:'ให้อาหารน้อง', clean:'ทำความสะอาด', play:'เล่นกับน้อง', feedi:'🍖', cleani:'🧼', playi:'🎾' },
        car:   { feed:'เติมน้ำมันรถ', clean:'ล้างรถให้เงา', play:'ทดสอบเครื่อง', feedi:'⛽', cleani:'🚿', playi:'🏎️' },
        plant: { feed:'รดน้ำต้นไม้', clean:'เล็มใบไม้', play:'เปิดเพลงให้ฟัง', feedi:'💧', cleani:'🌿', playi:'🎵' }
    };
    const ql = qLabels[effectiveTemplate] || qLabels.pet;

    const activeCfg = getActiveConfig();
    const qCfg = activeCfg?.quests || {};

    tiers.forEach(t => {
        const bar = $(`q-bar-${t}`); 
        const current = parseInt(q[t]) || 0;
        const max = parseInt(qCfg[`target_${t}`]) || parseInt(q[`${t}_max`]) || 1; 
        if(bar) bar.style.width = `${Math.min(100, (current / max) * 100)}%`;
        const val = $(`q-val-${t}`); 
        if(val) val.innerText = `${current}/${max}`;
        
        // 🔥 [UI SYNC FIX] อัปเดตข้อความและไอคอนให้ตรงตาม Template
        const labelEl = $(`q-lbl-${t}`);
        if(labelEl) labelEl.innerText = ql[t];
        const iconEl = $(`q-icon-${t}`);
        if(iconEl) iconEl.innerText = ql[`${t}i`];

        if(current < max) mainDone = false;
    });

    // 🛡️ [SPECIAL QUEST GUARD] ป้องกันการอ่าน Property ของ undefined
    const specBar = $('q-bar-special');
    const specVal = $('q-val-special');
    const specLabel = $('q-label-special');
    const special = q.special || { label: '...', current: 0, target: 100 };

    if(specLabel) specLabel.innerText = `${special.label}`;
    if(specBar) specBar.style.width = `${Math.min(100, (special.current / (special.target || 100)) * 100)}%`;
    if(specVal) specVal.innerText = `${special.current}/${special.target}`;
    
    const specialDone = special.current >= special.target;

    // Buff Icons
    const buffIcon = $('stamina-buff-icon');
    if(buffIcon) {
        const isActive = (STATE.buffs.regen_mult || 1) > 1 && Date.now() < (STATE.buffs.regen_expiry || 0);
        buffIcon.classList.toggle('hidden', !isActive);
    }

    const btn = $('btn-claim-quest');
    const specBtn = $('btn-claim-special');
    const dot = $('quest-noti-dot');

    // 🏆 Handling Main Reward
    if(btn) {
        if(q.claimed) {
            btn.innerText = '✅ รับของขวัญวันนี้แล้ว';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/5 text-white/20 font-black uppercase text-xs cursor-not-allowed';
        } else if(mainDone) {
            btn.innerText = '🎁 เปิดรับของขวัญ (เหรียญ + ฟื้นพลังเร็ว)';
            btn.disabled = false;
            btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-r from-neon-gold to-orange-500 text-black font-black uppercase text-sm shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse';
        } else {
            const lockLabels = { pet: '🔒 ดูแลน้องให้ครบตามเป้าหมาย', car: '🔒 ดูแลรถให้ครบตามเป้าหมาย', plant: '🔒 ดูแลต้นไม้ให้ครบตามเป้าหมาย' };
            btn.innerText = lockLabels[effectiveTemplate];
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/10 text-white/40 font-black uppercase text-xs cursor-not-allowed';
        }
    }

    // ✨ Handling Special Reward
    if (specBtn) {
        if (q.special_claimed) {
            specBtn.innerText = '✅ รับโบนัสพิเศษแล้ว';
            specBtn.disabled = true;
            specBtn.classList.remove('hidden');
            specBtn.className = 'w-full py-2.5 rounded-xl bg-white/5 text-white/20 font-black uppercase text-[10px] cursor-not-allowed';
        } else if (specialDone) {
            specBtn.innerText = '✨ รับโบนัสพิเศษ (+150🪙)';
            specBtn.disabled = false;
            specBtn.classList.remove('hidden', 'bg-amber-500/10');
            specBtn.className = 'w-full py-2.5 rounded-xl bg-amber-500 text-black font-black uppercase text-[10px] shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse';
        } else {
            specBtn.classList.add('hidden');
        }
    }

    // 🔴 Global Notification Dot
    const hasAnyToClaim = (!q.claimed && mainDone) || (!q.special_claimed && specialDone);
    if(dot) {
        dot.classList.toggle('hidden', !hasAnyToClaim);
        dot.querySelector('.animate-ping')?.classList.toggle('hidden', !hasAnyToClaim);
    }
}

window.claimSpecialQuestReward = () => {
    if(STATE.quests.special_claimed) return;
    const q = STATE.quests;
    if(q.special.current < q.special.target) return;

    const bonus = 150; 
    STATE.tokens += bonus;
    STATE.quests.special_claimed = true;
    saveState(true);

    spawn(`✨ มหัศจรรย์! รับโบนัสเควสเสริม +${bonus}🪙`, 'text-neon-gold pulse');
    SFX.playCoin();
    logScoreAction(STATE.username, 'QUEST_SPECIAL', 0, bonus, `รับรางวัลเควสเสริม: ${q.special.label}`);
    
    updateUI(); // 🔥 [BUGFIX] รีเฟรชหน้าต่างให้ปุ่มเปลี่ยนเป็น "รับแล้ว" ทันที
    saveState();
};

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
        
        saveState();
        spawn('✏️ เปลี่ยนชื่อเรียบร้อยแล้ว');
        toggleNameModal(true);
    } else {
        spawn('⚠️ กรุณาใส่ชื่อที่ต้องการ');
    }
};

// ==========================================

initShop();

let lastActionTime = 0;
window.doAction = async (type) => {
    console.log(`🎮 [ACTION] User triggered: ${type}`);
    if (!isGameActive) {
        console.warn("🎮 [ACTION] Ignored: Game is not active (locked).");
        return;
    }
    const now = Date.now();
    if (now - lastActionTime < 400) return; // Prevent spam
    lastActionTime = now;

    SFX.init(); // ประกันว่า AudioContext จะทำงานเมื่อมีการคลิกครั้งแรก
    
    const active = getActiveConfig();
    
    // 🛡️ [SYNC GAURD] เอาออกเนื่องจากทำให้ค่า Quest ถูก Reset กลับเป็นค่าเก่าที่ไม่ได้อัปเดต


    const actRaw = active.activities?.[type] || {};
    
    // 🛡️ [NUKER GUARD] ป้องกันปัญหาการตั้งค่า Admin ที่เป็นค่าว่างหรือพิมพ์ตัวหนังสือมา
    
    const act = {
        r:  safeNum(actRaw.r, 15),
        s:  safeNum(actRaw.s, 10),
        xp: safeNum(actRaw.xp, 5)
    };
    const cost = act.s;

    if (window.sanitizeState) window.sanitizeState();

    
    if (STATE.stamina < cost) { 
        SFX.playError();
        spawn('⚡ พลังงานไม่พอ!', 'text-amber-400 font-bold'); 
        return; 
    }

    STATE.stamina = Math.max(0, STATE.stamina - cost);

    incrementSpecialQuest('spend', cost);

    const mech = STATE.config.mechanics || {
        dec_hunger: 0.08, dec_clean: 0.04, dec_happy: 0.05, reg_stamina: 0.5,
        rare_rate: 10, fever_threshold: 80, fever_mult: 1.5
    };

    const tpl = STATE.config.template || 'pet';
    const feverThr = mech.fever_threshold || 85;
    const isFever = (STATE.hunger >= feverThr && STATE.love >= feverThr && STATE.clean >= feverThr);
    
    // 🧠 [PET INTELLIGENCE] ระบบเจริญอาหาร (Appetite Logic)
    const moodRegenMult = (isFever || STATE.love > 85) ? 1.2 : 1.0;
    const finalRegen = act.r * moodRegenMult;

    let scoreGainPerAction = act.xp || 10;
    if (isFever) scoreGainPerAction *= (mech.fever_mult || 1.5);
    
    // 🧠 [PET INTELLIGENCE] ระบบสะสมความภักดี (Loyalty Logic)
    if (!STATE.memory) STATE.memory = { interaction_counts: { feed: 0, clean: 0, play: 0 }, loyalty_bonus: 0 };
    if (!STATE.memory.interaction_counts[type]) STATE.memory.interaction_counts[type] = 0;
    
    STATE.memory.interaction_counts[type]++;
    STATE.memory.last_action_at = Date.now();
    
    const totalInteractions = Object.values(STATE.memory.interaction_counts || {}).reduce((a, b) => a + (b || 0), 0);
    const loyaltyMult = Math.max(1.0, 1.0 + Math.min(0.5, totalInteractions * 0.001));
    scoreGainPerAction *= loyaltyMult;
    
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
            if (hungerBefore >= 100) spawn('🍖 อิ่มแปล้แล้ว! (ได้รับเฉพาะ XP)', 'text-amber-400 font-bold');
            STATE.hunger = Math.min(100, STATE.hunger + finalRegen); 
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
            STATE.xp = (isNaN(STATE.xp) ? 0 : STATE.xp) + feedXP; 
            
            // 📊 [QUEST UNIFICATION] ใช้ฟังก์ชันกลางจัดการเควสทั้งหมด
            incrementQuestProgress('feed', 1);

            if (hungerBefore < 100) spawn(`${feedMsg[tpl] || feedMsg.pet} +${feedXP}XP`); 
            vibrate(20);
            break;

        case 'clean': 
            if (cleanBefore >= 100) spawn('✨ สะอาดวับอยู่แล้ว! (ได้รับเฉพาะ XP)', 'text-cyan-400 font-bold');
            STATE.clean = Math.min(100, STATE.clean + finalRegen); 
            let cleanJoy = (cleanBefore < 30) ? 6 : 2;
            STATE.love = Math.min(100, STATE.love + cleanJoy);

            const cleanEmo = { pet:'🧼', car:'🚿', plant:'🌿' }[tpl] || '🧼';
            showEmoticon(cleanEmo, 2000);
            if (Math.random() > 0.8) {
                const sparkEmo = { pet:'✨', car:'💎', plant:'☀️' }[tpl] || '✨';
                setTimeout(() => showEmoticon(sparkEmo, 2000), 800);
            }

            const cleanXP = Math.floor(act.xp * xpMult);
            STATE.xp = (isNaN(STATE.xp) ? 0 : STATE.xp) + cleanXP; 
            
            // 📊 [QUEST UNIFICATION]
            incrementQuestProgress('clean', 1);

            if (cleanBefore < 100) spawn(`${cleanMsg[tpl] || cleanMsg.pet} +${cleanXP}XP`); 
            vibrate(15);
            break;

        case 'play': 
            if (STATE.love >= 100) spawn('💖 มีความสุขล้นปริ่มแล้ว! (ได้รับเฉพาะ XP)', 'text-pink-400 font-bold');
            let playJoy = finalRegen; 
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
            STATE.xp = (isNaN(STATE.xp) ? 0 : STATE.xp) + playXP; 
            
            // 📊 [QUEST UNIFICATION]
            incrementQuestProgress('play', 1);

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
    logScoreAction(STATE.username, `ACTION_${type.toUpperCase()}`, scoreGainPerAction, 0);

    await checkLevelUp();
    updateUI();
     
    updateQuestUI(); // 🔥 [UI FIX] อัปเดตตัวเลขในหน้าต่างเควสทันที
    saveState(); 
};

// --- ระบบการเก็บไอเทมจากฉาก 3D ---
window.onPoopCollectedManual = (type, isRemote = false) => {
    if (isRemote) return; // จออื่นเก็บแล้ว เราแค่ลบภาพ (ซึ่ง 3D Engine ทำแล้ว)

    const active = getActiveConfig();
    const actRaw = active.activities?.['clean'] || {}; 
    
    const act = {
        r:  safeNum(actRaw.r, 15),
        xp: safeNum(actRaw.xp, 10)
    };

    // 🎯 [ECONOMY SYNC] ดึงรางวัลมาจาก Dashboard (Matrix)
    const matrix = getActiveConfig()?.rewards || {};
    const tokenReward = type === 'golden' ? (matrix.scoop_golden_tokens || 50) : (matrix.scoop_tokens || 15);
    const xpReward = type === 'golden' ? (matrix.scoop_golden_xp || 150) : (matrix.scoop_xp || 45);

    STATE.tokens += tokenReward;
    STATE.xp += xpReward;
    
    // เพิ่มค่าความสะอาดและความรัก
    STATE.clean = Math.min(100, STATE.clean + act.r);
    STATE.love = Math.min(100, STATE.love + 2);

    const tpl = STATE.config.template || 'pet';
    const msg = { 
        pet: type === 'golden' ? `✨ เก็บอึทองคำ! +${tokenReward}🪙 +${xpReward}XP` : `🧼 เก็บอึเรียบร้อย! +${tokenReward}🪙 +${xpReward}XP`,
        car: `🚿 เช็ดคราบน้ำมัน! +${tokenReward}🪙 +${xpReward}XP`,
        plant: `🌿 ถอนวัชพืช! +${tokenReward}🪙 +${xpReward}XP`
    };
    
    if (window.spawn) spawn(msg[tpl] || msg.pet, type === 'golden' ? 'text-neon-gold pulse' : 'text-cyan-400');
    if (SFX.playCoin) SFX.playCoin();
    
    logScoreAction(STATE.username, 'COLLECT_POOP', 0, tokenReward, `เก็บอึ (${type})`);
    
    // อัปเดตเควส
    incrementQuestProgress('clean', 1);
    incrementSpecialQuest('clean', 1);
    
    checkLevelUp();
    updateUI();
    saveState();
};

// --- ฟังก์ชัน Interaction พิเศษ (จิ้มที่ตัวโดยตรง) ---
// จิ้มเล่นได้ฟรี! (ไม่เสีย Stamina) แต่ได้ XP และ Love เล็กน้อย
window.doTouch = (isRemote = false) => {
    const tpl = STATE.config.template || 'pet';
    const touchMsg = { pet: '💖', car: '✨', plant: '🌿' };
    const playSFX = { pet: 'meow', car: 'honk', plant: 'bell' };
    const currentSFX = playSFX[tpl] || 'meow';
    
    // เอาคะแนนและ XP ออกเพื่อป้องกันการปั๊มคะแนน (Farming) ตามคำแนะนำ
    // เหลือเพียงเอฟเฟกต์เสียงและการสั่นเพื่อความเพลิดเพลิน
    if (!isRemote) {
        if (currentSFX === 'honk') { SFX.playHonk(); } 
        else { SFX.playAsset(currentSFX); }
    }
    
    vibrate(10); // สั่นเบาๆ
    spawn(touchMsg[tpl] || touchMsg.pet);
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

async function checkLevelUp() {
    let levelsGained = 0;
    let totalScoreBonus = 0;
    let totalTokenBonus = 0;
    const startLevel = STATE.level;

    if (STATE.xp >= STATE.max_exp) {
        console.log(`🆙 [LEVEL] Checking for Level Up... Current XP: ${STATE.xp}/${STATE.max_exp}`);
    }

    let safetyCounter = 0;
    while (STATE.xp >= STATE.max_exp && STATE.level < 100 && safetyCounter < 100) {
        safetyCounter++;
        levelsGained++;
        STATE.level++;
        
        // หัก XP เก่าออก
        STATE.xp = Math.max(0, STATE.xp - STATE.max_exp);
        
        // คำนวณเพดาน XP ใหม่สำหรับเลเวลปัจจุบัน
        STATE.max_exp = Math.floor(200 + (STATE.level * STATE.level * 1.25));
        
        totalScoreBonus += 5000 + (STATE.level * 1000); 
        totalTokenBonus += 500 + (STATE.level * 50); 
        
        // ฟื้นฟูสเตตัส (โบนัสอัปเวล)
        STATE.hunger = Math.min(100, STATE.hunger + 30);
        STATE.love = Math.min(100, STATE.love + 20);
        STATE.clean = Math.min(100, STATE.clean + 30);
        STATE.stamina = Math.min(STATE.max_stamina || 100, STATE.stamina + 50);

        // [SAFETY] กัน Loop ตายถ้าค่าเป็น NaN หรือเกิดเหตุไม่คาดคิด
        if (isNaN(STATE.xp) || isNaN(STATE.max_exp) || STATE.max_exp <= 0) {
            STATE.xp = 0;
            STATE.max_exp = 200;
            break;
        }
    }

    if (levelsGained > 0) {
        SFX.playAsset('level');
        STATE.score += totalScoreBonus;
        STATE.tokens = Math.floor(STATE.tokens + totalTokenBonus);
        
        // 🔥 [AUDIT FIX] บันทึกข้อมูลเลเวลใหม่ลง Cloud ทันทีเพื่อความปลอดภัยสูงสุด (ย้ายไปไว้ตอนจบฟังก์ชัน)
        updateUI();
        updateQuestUI();
        
        // เช็คการวิวัฒนาการ (เฉพาะเลเวลที่สำคัญ)
        const hitMilestone = [10, 25, 50].some(m => startLevel < m && STATE.level >= m);
        if (hitMilestone) {
            const tpl = STATE.config.template || 'pet';
            const evoMsgs = {
                pet: '🌟 มหัศจรรย์! น้องเกิดการวิวัฒนาการออร่าแล้ว!',
                car: '⚡ สุดยอด! เครื่องยนต์ของคุณได้รับการอัปเกรดระดับสูงแล้ว!',
                plant: '🌸 ว้าว! ต้นไม้ของคุณเริ่มเบ่งบานอย่างงดงามแล้ว!'
            };
            spawn(evoMsgs[tpl] || evoMsgs.pet, 'text-neon-gold scale-125');
        }

        logScoreAction(STATE.username, 'LEVEL_UP', totalScoreBonus, totalTokenBonus, `เลเวลอัพเป็น ${STATE.level}`);
        triggerLevelUpUI(STATE.level);
        
        spawn(`🆙 ตอนนี้เลเวล ${STATE.level} แล้ว! (+${totalScoreBonus.toLocaleString()}🏆 +${totalTokenBonus}🪙)`);
        showEmoticon('🆙', 5000);

        updatePetScale(STATE.level);
        triggerLevelUpEffect(); 

        // 🔥 [SYNC FIX] แจ้งเตือนหน้าจออื่นให้เปลี่ยนออร่าและขนาดตามเลเวลใหม่ทันที
        window.dispatchEvent(new CustomEvent('state-synced'));
         
        
        // 🔥 [CRITICAL FIX] บันทึกเลเวลใหม่ขึ้น Cloud ทันที และรอให้เสร็จก่อน (ป้องกันการรีเฟรชแล้วข้อมูลหาย)
        const saved = await saveState(true); 
        if (saved) {
            console.log("✅ Level Up Persisted Successfully.");
            spawn('☁️ ข้อมูลเลเวลถูกบันทึกลง Cloud สำเร็จ!', 'text-emerald-400 text-xs');
        } else {
            console.warn("🚨 [DB] Level Up Save Failed! Data might be out of sync.");
            spawnAlert('🚨 บันทึกเลเวลลง Cloud ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ');
        }
    }

    if (STATE.level >= 100) {
        STATE.level = 100;
        STATE.xp = Math.min(STATE.xp, STATE.max_exp - 1);
    }
}

window.resetDailyQuests = () => {
    // 🛡️ [AUDIT FIX] เพิ่มความปลอดภัยสูงสุด
    if (!window._isStateLoaded) {
        console.warn("⚠️ resetDailyQuests: State not loaded yet, aborting reset.");
        return; 
    }
    if (!STATE.username || STATE.username === 'LikeGotchi') return;
    if (STATE.level > 1 && STATE.score === 0) return; // ข้อมูลยังมาไม่ครบ ห้ามรีเซ็ต

    const now = new Date().toDateString();
    if (STATE.last_quest_date !== now) {
        console.log(`📅 [QUEST] New Day Detected (${now})! Resetting daily quests...`);
        isQuestsInitialized = true; // ล็อคทันทีที่เริ่มกระบวนการ
        const active = getActiveConfig();
        // 🛡️ [SYNC FIX] ใช้ Seed จากวันที่เพื่อให้ทุกหน้าจอได้เควสเดียวกันในวันนั้น
        const seed = now.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const randIndex = seed % SPECIAL_QUEST_POOL.length;
        const picked = SPECIAL_QUEST_POOL[randIndex];
        
        let target = 5;
        if(picked.type === 'scoop') target = active.quests?.target_scoop || 5;
        if(picked.type === 'fever') target = active.quests?.target_fever || 1;
        if(picked.type === 'pure_love') target = active.quests?.target_pure_love || 10;
        if(picked.type === 'spend') target = active.quests?.target_spend || 1000;

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
            feed: 0, feed_max: (active.quests?.target_feed !== undefined) ? parseInt(active.quests.target_feed) : 3,
            clean: 0, clean_max: (active.quests?.target_clean !== undefined) ? parseInt(active.quests.target_clean) : 2,
            play: 0, play_max: (active.quests?.target_play !== undefined) ? parseInt(active.quests.target_play) : 1,
            special: { 
                type: picked.type, 
                label: customLabel, 
                icon: customIcon, 
                target: target, 
                current: 0 
            },
            claimed: false,
            special_claimed: false // 🔒 [FIX] ป้องกันการรับรางวัลพิเศษซ้ำ
        };
        
        STATE.last_quest_date = now;
        saveState(true); // 🔥 บังคับบันทึกลง Cloud ทันที
    }
};

window.addEventListener('storage', (e) => {
    // 🔥 [BUGFIX] ทำให้จอจำลอง 2 ขนาดใน Admin Sync ข้อมูลกันแบบ Real-time
    if (e.key === 'likegotchi_state_' + STATE.username && e.newValue) {
        try {
            const newState = JSON.parse(e.newValue);
            Object.assign(STATE, newState);
            
            // 🛡️ [DEEP AUDIT] กรองข้อมูลเสียหลังจากการ Sync ข้ามหน้าต่าง
            if (window.sanitizeState) window.sanitizeState();
            
            if (window.updateUI) window.updateUI();
            
            // 🔥 [SYNC FIX] แจ้งเตือนให้ระบบ 3D อัปเดตขนาดและ Aura ตามเลเวลใหม่ทันที
            window.dispatchEvent(new CustomEvent('state-synced'));
        } catch (err) {
            console.error("Sync Error:", err);
        }
    }
});

    // --- 📢 Admin Preview Signal ---
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'PW3D_READY' }, '*');
    }

    // 🔥 [LOOP GUARD] สำหรับหน้าพรีวิว Admin ป้องกันการโหลดซ้ำจนเครื่องค้าง
    window.addEventListener('message', (e) => {
        if(e.data && e.data.type === 'PW3D_PREVIEW') {
            const cfg = e.data.config;
            const tpl = cfg.template || 'pet';
            const model = cfg.custom_model || '';
            const rot = cfg.custom_rotation_y || 0;

            // 🛡️ ถ้าค่าทุกอย่างเหมือนเดิม ห้ามอัปเดตเด็ดขาด! (เพิ่มการเช็ค Boss State เข้าไปใน Guard ด้วย)
            const bossActive = cfg.world_boss?.active || false;
            const bossHP = cfg.world_boss?.hp || 0;

            if (window._lastPreviewModel === model && window._lastPreviewTpl === tpl && 
                window._lastPreviewRot === rot && window._lastBossActive === bossActive && window._lastBossHP === bossHP) {
                return;
            }
            window._lastPreviewModel = model;
            window._lastPreviewTpl = tpl;
            window._lastPreviewRot = rot;
            window._lastBossActive = bossActive;
            window._lastBossHP = bossHP;

            applyConfigToState(cfg);
            const active = getActiveConfig();
            
            updateTemplate(tpl, model, rot);
            updateEnvironment(cfg.sky, cfg.ground);
            updateEngineConfig({
                poop_lifetime: active.mechanics?.poop_lifetime || 180,
                reward_lifetime: active.mechanics?.reward_lifetime || 150,
                max_poops: active.mechanics?.max_poops || 3,
                max_rewards: active.mechanics?.max_rewards || 3,
                drop_offset: cfg.drop_offset || {x:0, y:0.1, z:-0.2}
            });

        // 🔥 [FIX] อัปเดตโมเดลบอสและ HUD ในหน้าพรีวิวด้วย!
        if (STATE.config.world_boss) {
            if (typeof window.updateBossHUD === 'function') window.updateBossHUD(STATE.config.world_boss);
            if (typeof updateBossModel === 'function') updateBossModel(STATE.config.world_boss);
        }
        
        if (typeof unlockScreen === 'function' && $('pin-lock-screen')) unlockScreen();
        
        // 🔥 [CRITICAL FIX] สั่งให้ HUD และ UI ทั้งหมดอัปเดตตาม Config ใหม่ทันที (แก้ปัญหาเปลี่ยนโหมดแล้วแถบสถานะไม่เปลี่ยน)
        if (typeof updateUI === 'function') updateUI();
        if (typeof updateQuestUI === 'function') updateQuestUI();
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
    // 🔥 [DECOUPLED] ให้เควสหลักรับรางวัลได้เลย ไม่ต้องรอเควสพิเศษ (User Request)
    
    
    if(!allDone) { spawn('🔒 เควสยังไม่ครบ!'); return; }

    const active = getActiveConfig();
    const mult = (active.quests?.reward_mult !== undefined) ? parseFloat(active.quests.reward_mult) : 1.0;
    const base_tokens = Math.floor(((active.quests?.base_tokens !== undefined) ? parseFloat(active.quests.base_tokens) : 500) * mult);
    const base_score = Math.floor(((active.quests?.base_score !== undefined) ? parseFloat(active.quests.base_score) : 50000) * mult);
    const base_xp = Math.floor(((active.quests?.base_xp !== undefined) ? parseFloat(active.quests.base_xp) : 2500) * mult);

    const now = Date.now();
    const scoreMult = (STATE.buffs.score_mult || 1.0);
    const xpMult = 1.0; // เก็บไว้ขยายผลต่อ

    const diffMult = getDifficultyMultiplier();
    const gainedScore = Math.floor(base_score * scoreMult * diffMult);
    const gainedTokens = Math.floor(base_tokens * diffMult); // 🪙 [FIX] คูณ Tokens ตามความยากด้วย
    const gainedXP = Math.floor(base_xp * (diffMult >= 1.75 ? 1.5 : (diffMult < 1.0 ? 0.8 : 1.0))); // 🆙 คูณ XP ตามความยาก

    STATE.tokens += gainedTokens;
    STATE.score += gainedScore;
    STATE.xp += gainedXP;
    checkLevelUp(); // 🔥 [BUGFIX] แลกของขวัญแล้วต้องเช็กเลเวลทันที
    updateUI();
    STATE.quests.claimed = true;
    
    // Regen buff also scales with difficulty: Hard mode is more challenging
    const buffPower = isHardMode() ? 1.5 : (isEasyMode() ? 2.5 : 1.8);
    const rewardDuration = (active.quests?.reward_duration !== undefined) ? parseInt(active.quests.reward_duration) : 15;
    
    STATE.buffs.regen_mult = buffPower;
    STATE.buffs.regen_expiry = Date.now() + (rewardDuration * 60 * 1000); 

    logScoreAction(STATE.username, 'QUEST_CLAIM', gainedScore, gainedTokens, `สำเร็จภารกิจ (${STATE.config.difficulty_mode})`);
    saveState(true); // 🔥 บันทึกทันทีป้องกันข้อมูลหาย
    spawn(`🎁 เควสสำเร็จ! +${gainedTokens}🪙 +${gainedScore}🏆 (Buff x${buffPower})`);
     saveState();
};

function isHardMode() { return STATE.config.difficulty_mode === 'hard'; }
function isEasyMode() { return STATE.config.difficulty_mode === 'easy'; }

window.currentRankingTab = 'world';
window.selectedRankingSeason = null;

window.switchRankingTab = (tab) => {
    window.currentRankingTab = tab;
    const btnWorld = $('btn-rank-world');
    const btnBoss = $('btn-rank-boss');
    const seasonContainer = $('season-selector-container');
    const titleText = $('ranking-title-text');
    
    if (tab === 'world') {
        btnWorld.className = "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all bg-neon-purple text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]";
        btnBoss.className = "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all text-white/30 hover:bg-white/5";
        if(seasonContainer) seasonContainer.classList.remove('hidden');
        if(titleText) titleText.innerText = "อันดับโลก";
        
        // Populate custom dropdown seasons if not done
        const currentS = STATE.config?.season_number || 1;
        if (window.selectedRankingSeason === null) window.selectedRankingSeason = currentS;
        
        renderSeasonOptions(currentS);
    } else {
        btnBoss.className = "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all bg-neon-purple text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]";
        btnWorld.className = "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all text-white/30 hover:bg-white/5";
        if(seasonContainer) seasonContainer.classList.add('hidden');
        if(titleText) titleText.innerText = "นักล่าบอส";
    }
    refreshRankingList();
};

function renderSeasonOptions(currentS) {
    const optionsEl = $('rank-season-options');
    if (!optionsEl) return;
    
    let html = '';
    for (let i = currentS; i >= 1; i--) {
        const isActive = window.selectedRankingSeason === i;
        html += `<div onclick="selectSeason(${i})" class="season-option ${isActive ? 'active' : ''}">ซีซั่น ${i} ${i === currentS ? '(LIVE)' : ''}</div>`;
    }
    optionsEl.innerHTML = html;
    
    const label = $('rank-season-current');
    if (label) label.innerText = `ซีซั่น ${window.selectedRankingSeason} ${window.selectedRankingSeason === currentS ? '(LIVE)' : ''}`;
}

window.toggleCustomDropdown = (e) => {
    if (e) e.stopPropagation();
    const opts = $('rank-season-options');
    if (opts) opts.classList.toggle('hidden');
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const opts = $('rank-season-options');
    const btn = $('rank-season-btn');
    if (opts && !opts.classList.contains('hidden')) {
        if (!opts.contains(e.target) && !btn.contains(e.target)) {
            opts.classList.add('hidden');
        }
    }
});

window.selectSeason = (num) => {
    window.selectedRankingSeason = num;
    const opts = $('rank-season-options');
    if (opts) opts.classList.add('hidden');
    
    const label = $('rank-season-current');
    if (label) label.innerText = `ซีซั่น ${num} ${num === (STATE.config?.season_number || 1) ? '(LIVE)' : ''}`;
    
    // Update active class in options
    document.querySelectorAll('.season-option').forEach((el, idx) => {
        const seasonVal = (STATE.config?.season_number || 1) - idx;
        if (seasonVal === num) el.classList.add('active');
        else el.classList.remove('active');
    });

    refreshRankingList();
};

window.refreshRankingList = async () => {
    const listEl = $('ranking-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-white/30 text-center py-12 animate-pulse">⏳ กำลังโหลด...</div>';

    let data = [], error = null;
    
    if (window.currentRankingTab === 'world') {
        const currentS = STATE.config?.season_number || 1;
        if (window.selectedRankingSeason === currentS) {
            ({ data, error } = await SupabaseSvc.fetchLiveRankings(currentS));
        } else {
            ({ data, error } = await SupabaseSvc.fetchSeasonRankings(window.selectedRankingSeason));
        }
    } else {
        // Fetch Boss Leaderboard
        ({ data, error } = await SupabaseSvc.supabase.rpc('get_boss_leaderboard'));
        // Map boss data to standard format for the list
        if (data) {
            data = data.map(p => ({
                player_id: p.player_id,
                pet_name: p.pet_name, // If RPC returns it, otherwise use ID
                score: p.damage,
                level: p.level || '-',
                is_boss_tab: true
            }));
        }
    }

    if (data && data.length > 0) {
        listEl.innerHTML = data.map((p, i) => {
            const isMe = p.player_id === STATE.username;
            const shortName = p.pet_name || (p.player_id === 'ADMIN_TEST_MODE' ? 'ADMIN' : p.player_id.substring(0, 8));
            const score = p.score ?? 0;
            const level = p.level ?? 1;

            return `
                <div class="flex items-center justify-between p-3 rounded-2xl ${isMe ? 'bg-neon-purple/20 border border-neon-purple/30' : 'bg-white/5 border border-white/5'} transition-all hover:bg-white/10">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center font-black text-[10px] ${i < 3 ? 'text-amber-400 border border-amber-400/30' : 'text-white/40'}">
                            ${(i + 1)}
                        </div>
                        <div class="flex flex-col">
                            <div class="text-xs font-black ${isMe ? 'text-neon-purple' : 'text-white'} flex items-center gap-1">
                                ${shortName} ${isMe ? '<span class="text-[8px] bg-neon-purple px-1 rounded text-white">YOU</span>' : ''}
                            </div>
                            <div class="text-[9px] text-white/40 font-black uppercase">LV.${level}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="${window.currentRankingTab === 'boss' ? 'text-rose-400' : 'text-amber-400'} font-black tracking-tight">
                            ${score.toLocaleString()} 
                            <span class="text-[8px] uppercase opacity-50">${window.currentRankingTab === 'boss' ? 'DMG' : '🏆'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        listEl.innerHTML = `<div class="text-white/20 text-center py-12 italic">ยังไม่มีข้อมูลในส่วนนี้</div>`;
    }
};

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
    
    // Default to World tab
    window.switchRankingTab('world');

    setTimeout(() => {
        m.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.add('opacity-100', 'translate-y-0');
    }, 10);
};


let isQuestsInitialized = false; // 🔒 [FIX] ตัวล็อคป้องกันการเช็ครีเซ็ตซ้ำซ้อนระหว่างเล่น

function checkLoginReward() {
    // 🔥 [USER REQUEST] ไม่ต้องเปิดหน้าต่างอัตโนมัติ ให้ผู้เล่นกดเข้าเองจากจุดแดง
}
    
window.toggleLoginReward = (close) => {
    const m = $('login-reward-modal');
    if (!m) return;
    
    if (close === true || (close !== false && !m.classList.contains('hidden'))) {
        m.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.remove('opacity-100', 'translate-y-0');
        setTimeout(() => { if(m.classList.contains('opacity-0')) m.classList.add('hidden'); }, 500);
        return;
    }

    // Opening Login Reward
    if (window.toggleShop) window.toggleShop(true);
    if (window.toggleRanking) window.toggleRanking(true);
    if (window.toggleQuest) window.toggleQuest(true);

    m.classList.remove('hidden');
    setTimeout(() => {
        m.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none');
        m.classList.add('opacity-100', 'translate-y-0');
    }, 10);

    // Update Content
    const config = getActiveConfig();
    const rewards = config.login_rewards || [];
    // 🛡️ [AUDIT FIX] ดึงจาก LocalStorage เสมอถ้า Cloud เป็น 0 หรือเก่ากว่า เพื่อให้หน้าจอ "คงที่" ที่สุด
    const localLastClaimDate = localStorage.getItem('last_login_verified_' + STATE.username);
    const localStreak = parseInt(localStorage.getItem('login_streak_verified_' + STATE.username)) || 0;
    const today = new Date().toDateString();
    
    // ถ้าในเครื่องบอกว่าเช็คอินวันนี้ไปแล้ว ให้ยึด Streak จากในเครื่องไว้ก่อนเลย
    const streak = (localLastClaimDate === today) ? Math.max(STATE.login_streak || 0, localStreak) : (STATE.login_streak || 0);
    const duration = STATE.config?.season_duration || 7;

    const subtitle = $('login-reward-subtitle');
    if (subtitle) subtitle.innerText = `${duration}-DAY SEASON REWARDS`;

    const grid = $('login-rewards-grid');
    if (grid) {
        grid.innerHTML = rewards.map((r, i) => {
            const isClaimed = r.day <= streak;
            const isNext = r.day === streak + 1;
            const isJackpot = r.day % 7 === 0;
            
            let icon = '🪙';
            if (r.reward_type === 'gold') icon = isJackpot ? '💰' : '🪙';
            else if (r.reward_type === 'score') icon = '📊';
            else if (r.reward_type === 'decay') icon = '🛡️';
            else if (r.reward_type === 'luck') icon = '🍀';

            const rewardVal = r.reward_type === 'gold' ? r.reward_value.toLocaleString() : `${r.reward_value} MIN`;
            const rewardLabel = r.reward_type === 'gold' ? 'TOKENS' : 'ACTIVE BUFF';

            return `
                <div class="login-day-card relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${isJackpot ? 'col-span-2 flex-row gap-3 h-28' : 'h-28'} 
                    ${isClaimed ? 'bg-white/5 border-white/5 opacity-50' : (isNext ? 'bg-indigo-500/20 border-indigo-500/40 glow-indigo' : 'bg-white/5 border-white/5')}">
                    <span class="text-[7px] font-black text-white/30 uppercase absolute top-2">${isJackpot ? 'Jackpot' : ''} Day ${r.day}</span>
                    <span class="${isJackpot ? 'text-3xl' : 'text-xl'} mb-1 mt-2">${icon}</span>
                    <div class="flex flex-col items-center">
                        <span class="${isJackpot ? 'text-lg' : 'text-[10px]'} font-black text-white">${rewardVal}</span>
                        <span class="text-[7px] font-black text-indigo-400 uppercase mt-0.5">${rewardLabel}</span>
                    </div>
                    <div class="${isClaimed ? '' : 'hidden'} absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-[#0a0e1a]">
                        <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4"><path d="M5 13l4 4L19 7"/></svg>
                    </div>
                </div>
            `;
        }).join('');
    }

    const statusMsg = $('login-status-msg');
    const claimBtn = $('login-claim-btn');

    // 🛡️ [HYBRID CHECK] ตรวจสอบทั้ง Cloud และ Local
    const lastLoginSaved = STATE.last_login_date || localStorage.getItem('last_login_verified_' + STATE.username);
    const canClaim = lastLoginSaved !== today;

    if (statusMsg) {
        if (canClaim) {
            statusMsg.innerText = `🎁 วันนี้คุณมีรางวัลรออยู่! (ต่อเนื่อง ${streak} วัน)`;
            statusMsg.classList.add('text-emerald-400');
            statusMsg.classList.remove('text-white/40');
        } else {
            // 🔥 [FIX] แสดงผลตามจริงจาก Streak ที่คำนวณแบบ Hybrid
            statusMsg.innerText = `✅ วันนี้คุณรับรางวัลเช็คอินวันที่ ${streak} เรียบร้อยแล้ว`;
            statusMsg.classList.remove('text-emerald-400');
            statusMsg.classList.add('text-white/40');
        }
    }

    if (claimBtn) {
        claimBtn.style.display = canClaim ? 'block' : 'none';
    }
};

window.claimDailyReward = async () => {
    // 🌐 [SECURITY FIX] ใช้เวลาจริงจาก Server แทนเวลาเครื่องผู้เล่นเพื่อป้องกันการโกง
    let now = new Date();
    if (window.SupabaseSvc && window.SupabaseSvc.supabase) {
        try {
            const { data: timeData } = await window.SupabaseSvc.supabase.rpc('get_server_time');
            if (timeData) now = new Date(timeData);
            else {
                // Fallback: ถ้า RPC ไม่มี ให้ยึดเวลาจากข้อมูล updated_at ล่าสุด
                const { data } = await window.SupabaseSvc.supabase.from('game_configs').select('updated_at').limit(1).single();
                if (data && data.updated_at) now = new Date(data.updated_at);
            }
        } catch (e) { console.error("Server Time Fetch Error:", e); }
    }

    const today = now.toDateString();
    
    // 🛡️ [HYBRID CHECK] ดึงข้อมูลจาก Cloud ก่อน ถ้าไม่มีให้ใช้ Local (กัน Migration Error)
    const lastLoginSaved = STATE.last_login_date || localStorage.getItem('last_login_verified_' + STATE.username);
    
    if (lastLoginSaved === today) {
        spawn('⚠️ คุณได้รับรางวัลของวันนี้ไปแล้วครับ', 'text-amber-400');
        return;
    }

    // 1. คำนวณ Streak
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    // กู้คืนค่า Streak จาก Local ถ้าใน Cloud ไม่มี
    if (!STATE.last_login_date || STATE.last_login_date === "") {
        const localStreak = parseInt(localStorage.getItem('login_streak_verified_' + STATE.username)) || 0;
        if (lastLoginSaved === yesterdayStr && localStreak > 0) {
            console.log("💾 [AUTH] Recovering login streak from Local Storage...");
            STATE.login_streak = localStreak;
        }
    }

    if (lastLoginSaved === yesterdayStr) {
        STATE.login_streak = (STATE.login_streak || 0) + 1;
    } else {
        // ถ้าไม่ได้ล็อกอินต่อเนื่อง ให้เริ่มนับ 1 ใหม่
        STATE.login_streak = 1;
    }

    const seasonDuration = STATE.config?.season_duration || 7;
    if (STATE.login_streak > seasonDuration) STATE.login_streak = 1;
    STATE.last_login_date = today;

    // 2. รับรางวัลตาม Config
    const config = getActiveConfig();
    const rewards = config.login_rewards || [];
    const reward = rewards.find(r => r.day === STATE.login_streak);

    if (reward) {
        let rewardText = "";
        if (reward.reward_type === 'gold') {
            STATE.tokens += reward.reward_value;
            rewardText = `${reward.reward_value.toLocaleString()} 🪙`;
        } else {
            if (window.applyBuff) window.applyBuff(reward.reward_type, reward.reward_value);
            const buffLabel = reward.reward_type === 'score' ? 'คูณแต้ม' : (reward.reward_type === 'decay' ? 'กันหิว' : 'ดวงดี');
            rewardText = `บัฟ${buffLabel} (${reward.reward_value} นาที)`;
        }

        logScoreAction(STATE.username, 'LOGIN_REWARD', 0, (reward.reward_type === 'gold' ? reward.reward_value : 0), `รางวัลเช็คอินวันที่ ${STATE.login_streak} (${reward.reward_type})`);
        spawn(`🎉 รับรางวัลเช็คอินแล้ว: ${rewardText}`, 'text-neon-gold scale-125');
        SFX.playAsset('bell');
        showEmoticon('🎁', 3000);
    }

    STATE.last_login_date = today;
    
    // 🛡️ [AUDIT FIX] บันทึกหลักฐานการเช็คอินลงเครื่องทันที (Double-Layer Protection)
    localStorage.setItem('last_login_verified_' + STATE.username, today);
    localStorage.setItem('login_streak_verified_' + STATE.username, STATE.login_streak.toString());
    
    updateUI();
    saveState(true); 
    window.toggleLoginReward(true); // ปิดหน้าต่างหลังรับรางวัล
};

// Removed duplicated ranking tab state


// Removed duplicated switchRankingTab


// Removed duplicated refreshRankingList


// New toggleRanking logic is already defined above



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
    
    // Reusing urlParams from top scope
    const userId = sessionUser || urlParams.get('userId');

    // loadAdminConfigLocal();
    updateLoading(60);
    setWorldSeed(userId || 'GUEST_USER');
    
    window.refreshPetModel = () => {
        const tpl = STATE.config.template || 'pet';
        let finalModel = STATE.config.custom_model || '';
        
        if (STATE.inventory && STATE.inventory.equipped_skins) {
            if (STATE.inventory.equipped_skins[tpl]) {
                finalModel = STATE.inventory.equipped_skins[tpl];
            }
        }
        
        // Fallback ถ้าไม่มีโมเดลเลย ให้พยายามใช้ค่าจากสกินเริ่มต้น
        if (!finalModel) {
            const skins = STATE.config.available_skins || [];
            if (skins.length > 0) {
                finalModel = skins[0].model;
            } else {
                // 🛡️ [PREVIEW EMERGENCY] เลือกโมเดลพื้นฐานตามธีม
                const defaults = {
                    pet: '/toon_cat_free.glb',
                    car: '/car_carton.glb',
                    plant: '/stylized_tree.glb'
                };
                finalModel = defaults[tpl] || defaults.pet;
            }
        }

        const skins = STATE.config.available_skins || [];
        const equippedSkin = skins.find(s => s.model === finalModel);
        const finalRotation = equippedSkin ? (equippedSkin.rotationY || 0) : (STATE.config.custom_rotation_y || 0);

        // 🛡️ [LOOP GUARD FIX] เช็คก่อนโหลดจริง ถ้าเป็นตัวเดิม "และมีโมเดลอยู่ในฉากแล้ว" ถึงจะข้าม
        if (window._lastFinalModel === finalModel && window._lastFinalRot === finalRotation && window._petModel) {
            return;
        }
        window._lastFinalModel = finalModel;
        window._lastFinalRot = finalRotation;
        
        // 🔥 [SYNC GLOBAL GUARD] อัปเดตตัวแปรเดียวกันกับระบบ Preview เพื่อให้ Guard ทำงานร่วมกันได้
        window._lastPreviewModel = finalModel;
        window._lastPreviewTpl = tpl;
        window._lastPreviewRot = finalRotation;

        console.log("🔄 Refreshing Pet Model:", finalModel);
        updateTemplate(tpl, finalModel, finalRotation);
        if (equippedSkin) updateEngineConfig({ drop_offset: equippedSkin.drop_offset });
    };

    // 🌟 Pet Aura Effect (Visual glow based on level/mood)
    function refreshPetAura(level, isPerfect) {
        if (typeof refreshPetAura === 'function' && window._3dEngine) {
            // Aura effect is handled by the 3D engine if available
        }
    }
    window.refreshPetAura = refreshPetAura;

    // --- Initial Setup calculation ---
    const tpl = STATE.config.template || 'pet';
    let initModel = STATE.config.custom_model || '';
    if (STATE.inventory && STATE.inventory.equipped_skins && STATE.inventory.equipped_skins[tpl]) {
        initModel = STATE.inventory.equipped_skins[tpl];
    }
    if (!initModel) {
        const skins = STATE.config.available_skins || [];
        if (skins.length > 0) {
            initModel = skins[0].model;
        } else {
            // 🛡️ [INIT EMERGENCY] เลือกโมเดลพื้นฐานตามธีมตั้งแต่เริ่ม
            const defaults = {
                pet: '/toon_cat_free.glb',
                car: '/car_carton.glb',
                plant: '/stylized_tree.glb'
            };
            initModel = defaults[tpl] || defaults.pet;
        }
    }
    const skins = STATE.config.available_skins || [];
    const equippedSkin = skins.find(s => s.model === initModel);
    const initRotation = equippedSkin ? (equippedSkin.rotationY || 0) : (STATE.config.custom_rotation_y || 0);

    updateLoading(100);

    init3D('three-canvas', STATE.config.template, { 
        sky:STATE.config.sky, ground:STATE.config.ground, 
        customModel: initModel,
        customRotationY: initRotation
    });

    // ส่งค่า Config ของการดรอปของและฟิสิกส์เข้าไปใน Engine
    const active = getActiveConfig();
    updateEngineConfig(active.mechanics);
    updateEngineConfig(active.physics);
    if (equippedSkin) updateEngineConfig({ drop_offset: equippedSkin.drop_offset });
    
    window.checkLevelUp = checkLevelUp; // 🛡️ [AUDIT FIX] ส่งออกเพื่อให้ระบบบอสเรียกใช้ได้
    window.triggerLevelUpEffect = triggerLevelUpEffect; 
    updatePetScale(STATE.level); 
    refreshPetAura(STATE.level);
    
    // 🛡️ [UI SYNC FIX] สั่งให้วาดหน้าจอใหม่ทันทีที่โหลดข้อมูลและ Engine พร้อม
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateQuestUI === 'function') updateQuestUI();
    
    // 🛡️ [AUDIT FIX] ย้ายการเช็คเควสไปไว้หลังสุด เพื่อให้แน่ใจว่าโหลดข้อมูล STATE จาก Cloud ครบแล้ว
    // ป้องกันการรีเซ็ตเควสเป็น 0 เพราะข้อมูลยังมาไม่ถึง
    // resetDailyQuests(); // 🛡️ [CLEANUP] ปิดตัวเรียกซ้ำซ้อน เพราะระบบมี Interval และตัวเช็คตอนเปิดจออยู่แล้ว

    setTimeout(() => {
        if (window.refreshPetModel) window.refreshPetModel();
        updatePetScale(STATE.level);
    }, 1500); 
    
    
    setPoopCallbacks(
        (t, isRemote = false) => {
            // 🔥 [UNIFY REWARDS] ยุบรวมให้การเดินเก็บ ได้รางวัลเท่ากับปุ่มกด
            window.onPoopCollectedManual(t, isRemote);
        },
        () => {
            const mech = STATE.config.mechanics || { dec_happy_poop: 12 };
            const penaltyVal = mech.dec_happy_poop || 12;
            const cleanPenalty = 25; 
            
            STATE.love = Math.max(0, STATE.love - penaltyVal);
            STATE.clean = Math.max(0, STATE.clean - cleanPenalty);
            
            const tpl = STATE.config.template || 'pet';
            const expireMsg = { pet: `💩 อึเน่าคาบ้าน! -${penaltyVal}♥ -${cleanPenalty}🧼`, car: `🛢️ น้ำมันเลอะเครื่อง! -${penaltyVal}♥ -${cleanPenalty}🔧`, plant: `🍂 วัชพืชรกบ้าน! -${penaltyVal}♥ -${cleanPenalty}🌿` };
            spawn(expireMsg[tpl] || expireMsg.pet);
             saveState();
        }
    );

    setRewardCallback((type, val) => {
        const tpl = STATE.config.template || 'pet';
        const diff = STATE.config.difficulty_mode || 'normal';
        const matrix = (STATE.config.matrix[tpl] && STATE.config.matrix[tpl][diff]) ? STATE.config.matrix[tpl][diff] : {};
        const rew = matrix.rewards || { legendary_tokens: 250, rare_tokens: 80 };
        
        let tokens = 10;
        let xp = 10;
        const diffMult = getDifficultyMultiplier();
        const xpDiffMult = (diffMult >= 1.75 ? 1.5 : (diffMult < 1.0 ? 0.8 : 1.0)); // 🆙 ตัวคูณ XP
        
        let score = 0;
        let msg = '';
        
        if (type === 'diamond' || type === 'legend') {
            const min = (rew.diamond_min !== undefined) ? parseFloat(rew.diamond_min) : 800;
            const max = (rew.diamond_max !== undefined) ? parseFloat(rew.diamond_max) : 1500;
            tokens = Math.floor(min + Math.random() * (Math.max(1, max - min))); 
            xp = (rew.diamond_xp !== undefined) ? parseFloat(rew.diamond_xp) : 400;
            score = tokens * 1.5;
            msg = `💎 สมบัติระดับเพชร! +${tokens.toLocaleString()}🪙 (+${score.toLocaleString()}🏆)`;
        } else if (type === 'gold' || type === 'rare') {
            const min = (rew.gold_min !== undefined) ? parseFloat(rew.gold_min) : 200;
            const max = (rew.gold_max !== undefined) ? parseFloat(rew.gold_max) : 500;
            tokens = Math.floor(min + Math.random() * (Math.max(1, max - min)));
            xp = (rew.gold_xp !== undefined) ? parseFloat(rew.gold_xp) : 150;
            score = tokens * 1.2;
            msg = `🥇 เหรียญทองคำ! +${tokens}🪙 (+${score}🏆)`;
        } else {
            const min = (rew.silver_min !== undefined) ? parseFloat(rew.silver_min) : 15;
            const max = (rew.silver_max !== undefined) ? parseFloat(rew.silver_max) : 35;
            tokens = Math.floor(min + Math.random() * (Math.max(1, max - min)));
            xp = (rew.silver_xp !== undefined) ? parseFloat(rew.silver_xp) : 35;
            score = tokens * 5;
            msg = `🥈 เหรียญเงิน! +${tokens}🪙 (+${score}🏆)`;
        }

        
        const finalXP = Math.floor(xp * xpDiffMult); 
        STATE.tokens += tokens;
        STATE.xp += finalXP;
        checkLevelUp(); // 🔥 [BUGFIX] เก็บของบนพื้นแล้วต้องเช็กเลเวลทันที
        updateUI();
        STATE.score += score;
        
        if (type === 'diamond' || type === 'gold') SFX.playJingle();
        else SFX.playCoin();

        // 🚀 [DEEP AUDIT FIX] ใช้ระบบ Atomic Rewards (RPC) เพื่อป้องกันเงินหาย
        if (SupabaseSvc && SupabaseSvc.addPlayerRewards) {
            SupabaseSvc.addPlayerRewards(STATE.username, tokens, finalXP, score);
        }
        
        // ส่ง Log ขึ้น Cloud
        const finalScore = Math.floor(score * diffMult); // 🏆 คูณโหมดความยาก
        const logType = type ? type.toUpperCase() : 'UNKNOWN';
        logScoreAction(STATE.username, `COLLECT_${logType}`, finalScore, tokens);

        spawn(msg, 'text-neon-gold pulse');
        
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
            // 🎯 ดึงค่าตรงๆ จาก Dashboard (ถ้าไม่ได้ตั้งไว้ให้เป็น 0%)
            let rareRate = (parseFloat(mech.rare_rate) || 0) / 100;
            
            // 💖 Luck Bonus: Happiness + Luck Booster
            const love = STATE.love || 0;
            let luckMult = (love > 90) ? 2.0 : (love > 70 ? 1.3 : 1.0);
            
            // 🍀 Apply Booster Mult
            luckMult *= (STATE.buffs.luck_mult || 1.0);
            
            rareRate *= luckMult;
            
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
        
        // ⚡ [BUFF] ลดเวลาเกิดลงให้เท่ากับไอเทมปกติ (ไม่ต้องรอคูณ 1.5 แล้ว)
        const delay = (mech.sp_min + Math.random() * (mech.sp_max - mech.sp_min)) * 1000;
        
        setTimeout(() => {
            // 🎯 [BUFF] เพิ่มค่า Luck พื้นฐาน (Base Rate) เข้าไปกันเหนียว
            let rGold = (parseFloat(rew.gold_rate) || 12) / 100; // อย่างน้อย 12%
            let rDiamond = (parseFloat(rew.diamond_rate) || 5) / 100; // อย่างน้อย 5%
            
            // 💖 Luck Bonus from Happiness + Luck Booster
            const love = STATE.love || 0;
            let luckMult = (love > 90) ? 2.0 : (love > 70 ? 1.3 : 1.0);
            
            // 🍀 Apply Booster Mult
            luckMult *= (STATE.buffs.luck_mult || 1.0);

            rGold *= luckMult;
            rDiamond *= luckMult;

            const roll = Math.random();
            let rType = 'silver';
            
            // 🛡️ เช็คว่าดรอปอะไร (เพชร > ทอง > เงิน)
            if (roll < rDiamond) {
                rType = 'diamond';
            } else if (roll < (rDiamond + rGold)) {
                rType = 'gold';
            }

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
        // [FIX] ใช้ค่าจาก active config โดยตรงเพื่อป้องกัน Error จากฟิลด์ matrix ที่ไม่มีอยู่จริง
        const mRaw = mech; 
        
        if (Math.random() < 0.2) updatePetSentience();
        
        const now = Date.now();
        
        // 🛡️ เคลียร์บัฟที่หมดอายุ
        let buffExpired = false;
        if (STATE.buffs.score_expiry > 0 && now > STATE.buffs.score_expiry) { STATE.buffs.score_mult = 1.0; STATE.buffs.score_expiry = 0; buffExpired = true; }
        if (STATE.buffs.decay_expiry > 0 && now > STATE.buffs.decay_expiry) { STATE.buffs.decay_mult = 1.0; STATE.buffs.decay_expiry = 0; buffExpired = true; }
        if (STATE.buffs.luck_expiry > 0 && now > STATE.buffs.luck_expiry) { STATE.buffs.luck_mult = 1.0; STATE.buffs.luck_expiry = 0; buffExpired = true; }
        if (STATE.buffs.regen_expiry > 0 && now > STATE.buffs.regen_expiry) { STATE.buffs.regen_mult = 1.0; STATE.buffs.regen_expiry = 0; buffExpired = true; }
        
        // 🔥 [BUGFIX] ถ้าบัฟหมดอายุ ให้รีเฟรช UI ทันทีเพื่อให้ไอคอนหายไปและค่า Decay กลับมาปกติ
        if (buffExpired && window.updateUI) window.updateUI();

        // --- ⚙️ LOGIC UPDATES ---
        const decayMult = (STATE.buffs.decay_mult || 1.0);

        // 1. Hunger & Clean Decay
        const d_hunger = (mRaw.dec_hunger !== undefined) ? parseFloat(mRaw.dec_hunger) : 0.08;
        const d_clean  = (mRaw.dec_clean !== undefined) ? parseFloat(mRaw.dec_clean) : 0.06;
        const d_happy  = (mRaw.dec_happy !== undefined) ? parseFloat(mRaw.dec_happy) : 0.07;

        STATE.hunger = Math.max(0, STATE.hunger - (d_hunger * decayMult));
        STATE.clean = Math.max(0, STATE.clean - (d_clean * decayMult));

        let happyDecay = d_happy * decayMult;
        // ถ้าหิวมากหรือสกปรกมาก ความรักจะลดลง (เพิ่มความท้าทายแต่ไม่ให้ฮวบจนเกินไป)
        if (STATE.hunger < 20 || STATE.clean < 20) happyDecay *= 2.0; 
        STATE.love = Math.max(0, STATE.love - happyDecay); 

        // 💖 Passive Love (ต้อง Happy จริงๆ ถึงจะเด้ง)
        if (STATE.hunger > 90 && STATE.clean > 90 && STATE.love < 100) {
            STATE.love = Math.min(100, STATE.love + 0.005); // [BALANCED] ลดการ Regen ลงมาก เพื่อให้ความสุขไม่เต็มตลอดเวลา
        }
        
        // 🌟 Passive Emoticons
        const thr = (mRaw.fever_threshold !== undefined) ? parseFloat(mRaw.fever_threshold) : 85;
        const isPerfect = (STATE.hunger >= thr && STATE.love >= thr && STATE.clean >= thr);

        if (Math.random() < 0.05) { 
            const tpl = STATE.config.template || 'pet';
            if (isPerfect) {
                const happyEmos = { pet:['❤️','😊','✨','🐾'], car:['✨','🏎️','🔥','💎'], plant:['🌸','☀️','🌿','🎵'] }[tpl] || ['❤️','😊'];
                showEmoticon(happyEmos[Math.floor(Math.random() * happyEmos.length)], 2000);
            } else if (STATE.hunger < 30 || STATE.clean < 30) {
                const sadEmos = { pet:['😢','🍽️','🧼'], car:['⛽','🛠️','⚠️'], plant:['🥀','💧','☁️'] }[tpl] || ['😢'];
                showEmoticon(sadEmos[Math.floor(Math.random() * sadEmos.length)], 2000);
            }
        }

        // ⚡ Stamina Regen (Deep Audit Fix: Strict Max Lock)
        let regenMultiplier = 1.0;
        const f_mult = (mRaw.fever_mult !== undefined) ? parseFloat(mRaw.fever_mult) : 1.5;
        if (isPerfect) regenMultiplier *= f_mult;
        if (STATE.buffs.regen_mult > 1 && Date.now() < STATE.buffs.regen_expiry) regenMultiplier *= STATE.buffs.regen_mult;

        const baseRegen = (mRaw.reg_stamina !== undefined) ? parseFloat(mRaw.reg_stamina) : 0.75;
        const currentMaxStam = parseFloat(mRaw.max_stamina || 100);
        STATE.max_stamina = currentMaxStam;

        // 🛡️ [DEEP AUDIT] NaN Protection for vital stats
        if (isNaN(STATE.stamina)) STATE.stamina = 0;
        if (isNaN(STATE.xp)) STATE.xp = 0;

        if (STATE.stamina < currentMaxStam) {
            // บล็อกไม่ให้เกิน MaxStamina และปัดเศษเพื่อให้ UI แสดงผลสวยงาม
            const newStam = STATE.stamina + (baseRegen * regenMultiplier);
            STATE.stamina = Math.min(currentMaxStam, Math.round(newStam * 100) / 100);
        }

        // 2. UI Updates
        window.refreshPetAura(STATE.level, isPerfect);
        
        // 🔥 [UI FIX] อัปเดต UI ทุกวินาทีเพื่อให้หลอด Hunger/Stamina ขยับแบบ Real-time
        if (window.updateUI) window.updateUI();
        
        // 📅 [AUTO RESET] เช็คการรีเซ็ตเควสวันใหม่ทุกๆ 1 นาที (60 วินาที)
        if (now % 60000 < 1000) {
            if (window.resetDailyQuests) window.resetDailyQuests();
        }

        if (Math.random() < 0.05) saveState(); 
    }, 1000);

    window.addEventListener('click', () => SFX.init(), { once: true });
    window.addEventListener('touchend', () => SFX.init(), { once: true });

    // 🛡️ GUARDIAN AUTO-SAVE: บันทึกทุก 30 วินาที (Sync กับ Cloud สม่ำเสมอขึ้น)
    setInterval(() => {
        if (isGameActive && window._isStateLoaded) saveState();
    }, 30 * 1000); 

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && isGameActive && window._isStateLoaded) {
            saveState(true); // 🔥 บังคับส่ง Cloud ทันทีเมื่อพับจอ
        }
    });
    // 🔄 [SYNC] ฟังคำสั่งอัปเดตสถานะข้ามหน้าต่าง (เช่น เลเวลอัพจากเครื่องอื่น)
    window.addEventListener('state-synced', () => {
        if (window.updatePetScale) window.updatePetScale(STATE.level);
        if (window.refreshPetAura) window.refreshPetAura(STATE.level);
    });

    checkLoginReward(); 
    // resetDailyQuests(); // 🛡️ [CLEANUP] ย้ายไปรันเฉพาะตอนปลดล็อคจอหรือโหลดข้อมูลเสร็จจริงเท่านั้น เพื่อลด Warning ใน Log

    // 🕒 ตรวจเช็คการข้ามวันทุกๆ 5 นาที
    setInterval(() => {
        resetDailyQuests();
    }, 5 * 60 * 1000);     
    
    // 🔥 [BUGFIX] ซิงค์ค่า Engine ให้ตรงกับ Config ล่าสุด (เช่น จำนวนไอเทมสูงสุด, ระยะเวลา)
    const activeCfg = getActiveConfig();
    const mm = activeCfg.mechanics || {};
    updateEngineConfig({ 
        poop_lifetime: mm.poop_lifetime || 180, 
        reward_lifetime: mm.reward_lifetime || 150,
        max_poops: mm.max_poops || 3,
        max_rewards: mm.max_rewards || 3
    });

    // 💾 MANUAL SAVE FUNCTION
    window.manualSave = async () => {
        SFX.playClick();
        spawn('💾 กำลังบันทึกข้อมูลด่วน...', 'text-cyan-400');
        await saveState(true);
        spawn('✅ บันทึกข้อมูลสำเร็จ!', 'text-emerald-400');
    };

    // 🛡️ [USER REQUEST] ระบบป้องกันข้อมูลหายตอนรีเฟรชหรือหน้าจอ
    window.addEventListener('beforeunload', (e) => {
        if (isGameActive) {
            // สั่งเซฟด่วน (ยิงกระสุนนัดสุดท้าย Force Cloud ทันที)
            saveState(true); 
            
            // แสดงหน้าต่างยืนยันของเบราว์เซอร์
            e.preventDefault();
            e.returnValue = 'ระบบกำลังบันทึกข้อมูลของคุณ กรุณายืนยันการออกจากหน้าจอ';
        }
    });

    // 👹 START BOSS SYSTEM
    initBossController(STATE, { spawnWorldRock, clearWorldRocks, throwRockAtBoss, collectWorldRockAtPet, _getPetPosition, updateBossModel, flashBoss });
    BossRewardController.init();

    // 🎮 Game initialized successfully.
})();
