import { createDefaultSettings } from './defaults.js';
import * as SupabaseSvc from '../services/supabase.js';

// 📋 [QUEST POOL] รายการเควสพิเศษที่สุ่มได้ (RESTORED TO OLD VERSION)
export const SPECIAL_QUEST_POOL = [
    { label: 'สะสม Stamina', type: 'spend', target: 100 },
    { label: 'เก็บอึผู้โชคดี', type: 'rare_poop', target: 2 },
    { label: 'เล่นกับสัตว์เลี้ยง', type: 'play', target: 10 },
    { label: 'ป้อนอาหารแสนอร่อย', type: 'feed', target: 10 }
];

export const setUserId = (id) => {
    currentUserId = id;
    localStorage.setItem('last_user_id', id);
};

export const loadAdminConfigLocal = () => {
    console.log("ℹ️ [STATE] Local config fallback skipped. Using Cloud authoritative config.");
};

export const STATE = {
    username: "ผู้เล่นทั่วไป",
    pin_code: "",
    is_banned: false, // 🔥 [FINAL LOCKDOWN]
    tokens: 500,  
    score: 0,     
    hunger: 80, clean: 80, stamina: 100, love: 50,
    max_stamina: 100, xp: 0, level: 1, max_exp: 200,
    current_season: 1,
    login_streak: 0,
    last_login_date: "",
    claimed_days: [], // 📅 [SEASON CALENDAR] เก็บวันที่เคยกดรับรางวัลจริง (Global Days)
    carrying_rock: 0,
    boss_skills: {
        lvl: 1, xp: 0, next: 5000, points: 0,
        damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
    },
    inventory: {
        equipped_skins: { pet: null, car: null, plant: null },
        skins: [], boosters: {}
    },
    buffs: {
        score_mult: 1, score_expiry: 0,
        decay_mult: 1, decay_expiry: 0,
        luck_mult: 1, luck_expiry: 0,
        regen_mult: 1, regen_expiry: 0
    },
    quests: {
        feed: 0, feed_max: 5,
        clean: 0, clean_max: 3,
        play: 0, play_max: 3,
        claimed: false,
        special: { label: 'สะสม Stamina', type: 'spend', current: 0, target: 100 },
        special_claimed: false
    },
    config: {
        template: 'pet', difficulty_mode: 'normal',
        sky: 'day', ground: 'grass',
        custom_model: '', custom_rotation_y: 0,
        available_skins: [],
        matrix: {},
        season_number: 0, // 👈 [FIX] เริ่มต้นที่ 0 เพื่อบังคับ Sync กับ Cloud ก่อนใช้งาน
        world_boss: { active: false, hp: 0, max_hp: 1000000, schedules: [] }
    }
};

export let currentUserId = null;
let _isStateLoaded = false;
let _isConfigLoaded = false;
let _activeChannels = [];
let _isSavingNow = false;
let _lastCloudSave = 0;
let _lastSignificantData = ""; 


export function resetStateToDefaults() {
    console.log("🧹 [STATE] Resetting to defaults...");
    STATE.pin_code = "";
    STATE.is_banned = false; // 🔥 [FINAL LOCKDOWN]
    STATE.tokens = 500;
    STATE.score = 0;
    STATE.boss_damage = 0; // 🔥 [FIX] ล้างดาเมจบอสของคนเก่าออก
    STATE.hunger = 80;
    STATE.clean = 80;
    STATE.stamina = 100;
    STATE.love = 50;
    STATE.level = 1;
    STATE.xp = 0;
    STATE.max_exp = 200;
    
    // 🔥 [AUDIT FIX] ล้างข้อมูลกิจกรรมและการล็อกอินทั้งหมด (ป้องกันการ Leak ข้ามไอดี)
    STATE.last_quest_date = ""; 
    STATE.last_login_date = "";
    STATE.login_streak = 0; 
    STATE.claimed_days = []; // 🛡️ ล้างข้อมูลการรับรางวัลเก่า
    STATE.achievements = [];

    // 🛡️ [ZERO-LEAKAGE HARDENING] ล้างข้อมูลเชิงลึกทั้งหมด
    STATE.carrying_rock = 0;
    STATE.boss_skills = { 
        lvl: 1, xp: 0, next: 5000, points: 0,
        damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
    };
    STATE.inventory = {
        equipped_skins: { pet: null, car: null, plant: null },
        skins: [], boosters: {}
    };

    STATE.quests = {
        feed: 0, feed_max: 5,
        clean: 0, clean_max: 3,
        play: 0, play_max: 3,
        claimed: false,
        special: { label: 'สะสม Stamina', type: 'spend', current: 0, target: 100 },
        special_claimed: false
    };

    STATE.buffs = {
        score_mult: 1, score_expiry: 0,
        decay_mult: 1, decay_expiry: 0,
        luck_mult: 1, luck_expiry: 0,
        regen_mult: 1, regen_expiry: 0
    };

    // 🛡️ [CONFIG AUTHORITY] ไม่รีเซ็ต STATE.config เพราะเป็นค่า Global จาก Cloud
    // ที่ถูกโหลดไว้ตั้งแต่เริ่มแอป (ใน loadGameConfigCloud)
    console.log("🛡️ [STATE] Preserving Global Config during reset.");
}

export async function loadState(forceId = null) {
    currentUserId = forceId || localStorage.getItem('last_user_id');
    if (!currentUserId) return STATE;
    window._isStateLoaded = false;
    
    // 🔥 [FIX] ล้างข้อมูลเก่าออกก่อนโหลดคนใหม่
    resetStateToDefaults();

    console.log(`📂 [STATE] Loading data for: ${currentUserId}`);

    try {
        const { data: cloudData, error } = await SupabaseSvc.loadPetState(currentUserId);

        if (error) {
            console.error("🚨 [STATE] Cloud load failed, falling back to local/default:", error);
            // 🛡️ [RESILIENCE] ถ้าโหลด Cloud ไม่ได้ ให้ลองโหลดจาก LocalStorage เป็นตัวสำรอง
            const local = localStorage.getItem('likegotchi_state_' + currentUserId);
            if (local) {
                console.log("📦 [STATE] Recovered from LocalStorage fallback.");
                Object.assign(STATE, JSON.parse(local));
            }
        } else if (cloudData) {
            // 🛡️ [SMART RECONCILIATION] เปรียบเทียบข้อมูล Cloud vs Local
            // เพื่อป้องกันข้อมูลย้อนกลับ (Rollback) กรณีรีเฟรชหน้าจอระหว่าง Cooldown
            const localRaw = localStorage.getItem('likegotchi_state_' + currentUserId);
            let finalData = cloudData;
            
            if (localRaw) {
                const local = JSON.parse(localRaw);
                
                // 🛡️ [CRITICAL] ถ้าซีซั่นเปลี่ยน → ห้ามใช้ข้อมูลเก่าจาก localStorage เด็ดขาด!
                const cloudSeason = parseInt(cloudData.current_season) || 1;
                const localSeason = parseInt(local.current_season) || 1;
                
                if (cloudSeason !== localSeason) {
                    // ซีซั่นเปลี่ยนแล้ว → ล้าง localStorage ทิ้งทั้งหมด ใช้ Cloud เท่านั้น
                    console.warn(`🚨 [STATE] Season changed (Local: S${localSeason} → Cloud: S${cloudSeason}). Discarding local cache.`);
                    localStorage.removeItem('likegotchi_state_' + currentUserId);
                    // 🔥 [FIX] ล้างบันทึกการรับรางวัลด้วย เพื่อให้รับรางวัลซีซั่นใหม่ได้ทันที
                    localStorage.removeItem('last_login_verified_' + currentUserId);
                    localStorage.removeItem('login_streak_verified_' + currentUserId);
                } else {
                    // ซีซั่นเดียวกัน → เปรียบเทียบตามปกติ
                    const cloudXP = parseFloat(cloudData.xp) || 0;
                    const localXP = parseFloat(local.xp) || 0;
                    const cloudTokens = parseFloat(cloudData.tokens) || 0;
                    const localTokens = parseFloat(local.tokens) || 0;

                    // ⚖️ ถ้าข้อมูลในเครื่องใหม่กว่า (XP หรือ Tokens เยอะกว่า) ให้ใช้ค่าในเครื่องนำทาง
                    if (localXP > cloudXP || localTokens > cloudTokens) {
                        console.log("📦 [STATE] Local data is newer than Cloud. Using Local for session.");
                        finalData = { ...cloudData, ...local };
                    }
                }
            }

            Object.assign(STATE, finalData);
            
            // 🛡️ [CONFIG AUTHORITY] ผู้เล่นสามารถมีระดับความยากส่วนตัวได้ (Personalized Config)
            if (cloudData.config_meta) {
                STATE.config.template = cloudData.config_meta.template || STATE.config.template; 
                STATE.config.difficulty_mode = cloudData.config_meta.difficulty_mode || STATE.config.difficulty_mode;
                STATE.config.difficulty_season = cloudData.config_meta.difficulty_season || null;
            }
            
            // คำนวณความเสียหายบอส
            if (cloudData.boss_damage) STATE.boss_damage = cloudData.boss_damage;

            // 🛡️ [BUGFIX] คำนวณ max_exp ใหม่เสมอเมื่อดึงเลเวลมาจาก Cloud
            STATE.max_exp = Math.floor(200 + (Math.pow(STATE.level, 2) * 45));

            // 🕰️ [OFFLINE CALCULATIONS] คำนวณค่าสถานะที่ลดลงขณะปิดเกม
            if (cloudData.last_interaction_at) {
                const lastTime = new Date(cloudData.last_interaction_at).getTime();
                const now = Date.now();
                const diffMinutes = (now - lastTime) / (1000 * 60);

                if (diffMinutes > 5) { // คำนวณเฉพาะถ้าหายไปนานกว่า 5 นาที
                    const activeCfg = getActiveConfig();
                    const m = activeCfg.mechanics || {};
                    const dMult = STATE.buffs?.decay_mult || 1;
                    const hungerDecay = (m.dec_hunger || 0.08) * diffMinutes * dMult;
                    const cleanDecay = (m.dec_clean || 0.05) * diffMinutes * dMult;
                    
                    STATE.hunger = Math.max(0, STATE.hunger - hungerDecay);
                    STATE.clean = Math.max(0, STATE.clean - cleanDecay);
                    
                    console.log(`🕰️ [OFFLINE] หายไป ${Math.floor(diffMinutes)} นาที: หิว -${hungerDecay.toFixed(1)}, สกปรก -${cleanDecay.toFixed(1)}`);
                }
            }

            sanitizeState();
            subscribeToPlayerState();
            if (window.updateUI) window.updateUI();
        } else {
            console.log("🆕 [STATE] New User or No Cloud Data. Using defaults.");
            STATE.username = currentUserId; // 👈 [FIX] ตั้งชื่อตาม ID ตั้งแต่เริ่ม
            localStorage.removeItem('likegotchi_state_' + currentUserId);
            sanitizeState();
        }
    } catch (e) {
        console.error("❌ loadState Critical Error:", e);
    } finally {
        window._isStateLoaded = true; // 🛡️ บังคับให้เป็น true เพื่อให้ UI เลิกค้าง
        checkSeasonReset();
    }
    return STATE;
}

export async function saveState(force = false) {
    // 🛡️ [PREVIEW GUARD] ไม่ต้องเซฟข้อมูลในหน้าพรีวิว Admin (ยกเว้นกดปุ่มบังคับ)
    if (window._isAdminPreview && !force) return false;

    if (!currentUserId) return false;

    // 💾 [LAYER 1: LOCAL FIRST] บันทึกลง LocalStorage ทันทีทุุกครั้งที่เรียก (Zero Latency)
    localStorage.setItem('likegotchi_state_' + currentUserId, JSON.stringify(STATE));

    // 🛡️ [GUARD] ถ้ากำลังบันทึกอยู่ ให้ข้ามการส่ง Cloud ในรอบนี้ไปก่อน
    if (_isSavingNow) return true;

    // 🛡️ [LAYER 2: SMART CLOUD SAVE] เช็ค Cooldown
    const now = Date.now();
    const CLOUD_COOLDOWN = 10000; // ⏳ ปรับเป็น 10 วินาทีเพื่อความเสถียร
    const isCooldownOver = (now - _lastCloudSave > CLOUD_COOLDOWN);

    // ถ้าไม่ถูกบังคับ (Force) และยังไม่ถึงเวลา Cooldown ให้จบงานแค่การเซฟ Local
    if (!force && !isCooldownOver) {
        return true;
    }

    _isSavingNow = true;
    try {
        _lastCloudSave = now;
        
        // ☁️ ส่งข้อมูลขึ้น Cloud
        console.log(`☁️ [STATE] Syncing to Cloud... (Force: ${force})`);
        const { error } = await SupabaseSvc.savePetState(currentUserId, STATE);
        
        if (error) throw error;
        return true; 
    } catch (e) {
        console.error("❌ saveState Cloud Sync Error:", e);
        return false;
    } finally {
        _isSavingNow = false;
    }
}

function subscribeToPlayerState() {
    if (!SupabaseSvc.supabase || !currentUserId) return;

    _activeChannels.forEach(ch => { try { ch.unsubscribe(); } catch(e) {} });
    _activeChannels = [];

    const statsCh = SupabaseSvc.supabase.channel('sync_stats_' + currentUserId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pet_stats', filter: `player_id=eq.${currentUserId}` }, 
        payload => {
            if (_isSavingNow) return;
            const d = payload.new;
            if (d) {
                console.log("⚡ [SYNC] Stats Updated from Cloud:", d);
                STATE.hunger = d.hunger; STATE.clean = d.clean; STATE.love = d.love; STATE.stamina = d.stamina;
                if (window.updateUI) window.updateUI();
            }
        }).subscribe();

    const progCh = SupabaseSvc.supabase.channel('sync_prog_' + currentUserId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pet_progression', filter: `player_id=eq.${currentUserId}` }, 
        payload => {
            if (_isSavingNow) return;
            const d = payload.new;
            if (d) {
                console.log("⚡ [SYNC] Progression Updated from Cloud:", d);
                STATE.tokens = d.tokens; STATE.xp = d.xp; STATE.level = d.level; STATE.score = d.score;
                if (window.updateUI) window.updateUI();
            }
        }).subscribe();

    _activeChannels.push(statsCh, progCh);
}

export function sanitizeState() {
    if (!STATE.level || isNaN(STATE.level)) STATE.level = 1;
    if (STATE.hunger === undefined || isNaN(STATE.hunger)) STATE.hunger = 100;
    if (STATE.clean === undefined || isNaN(STATE.clean)) STATE.clean = 100;
    if (STATE.love === undefined || isNaN(STATE.love)) STATE.love = 100;
    if (STATE.stamina === undefined || isNaN(STATE.stamina)) STATE.stamina = 100;
    
    // 🛡️ [BUGFIX] คำนวณ max_exp ใหม่เสมออิงจากเลเวลปัจจุบัน (ครอบคลุมทั้งคนเก่าและใหม่)
    STATE.max_exp = Math.floor(200 + (Math.pow(STATE.level, 2) * 45));

    // 🛡️ [DEEP AUDIT] ป้องกันค่าติดลบหรือเกิน 100
    STATE.hunger = Math.min(100, Math.max(0, parseFloat(STATE.hunger)));
    STATE.clean = Math.min(100, Math.max(0, parseFloat(STATE.clean)));
    STATE.love = Math.min(100, Math.max(0, parseFloat(STATE.love)));
    
    const maxStam = STATE.max_stamina || 100;
    STATE.stamina = Math.min(maxStam, Math.max(0, parseFloat(STATE.stamina)));

    // 🛡️ [DEEP HEALING] ซ่อมแซมโครงสร้างที่อาจจะหายไปจากการโหลด Cloud
    if (!STATE.boss_skills || !STATE.boss_skills.damage) {
        STATE.boss_skills = { 
            lvl: STATE.boss_skills?.lvl || 1, 
            xp: STATE.boss_skills?.xp || 0, 
            next: STATE.boss_skills?.next || 5000, 
            points: STATE.boss_skills?.points || 0,
            damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
        };
    }
    if (!STATE.inventory) {
        STATE.inventory = { equipped_skins: { pet: null, car: null, plant: null }, skins: [], boosters: {} };
    }
    if (!STATE.quests || STATE.quests.feed_max === undefined) {
        STATE.quests = { feed: 0, feed_max: 5, clean: 0, clean_max: 3, play: 0, play_max: 3, claimed: false, special: { label: 'สะสม Stamina', type: 'spend', current: 0, target: 100 }, special_claimed: false };
    }
    if (!STATE.config) {
        STATE.config = { template: 'pet', difficulty_mode: 'normal', sky: 'day', ground: 'grass', custom_model: '', custom_rotation_y: 0, available_skins: [], matrix: {} };
    }
    if (!STATE.claimed_days) {
        STATE.claimed_days = [];
    }
}

export async function loadGameConfigCloud() {
    console.log("☁️ [CONFIG] Fetching cloud config...");
    try {
        const { data: cloudConfig, error } = await SupabaseSvc.loadGameConfig();
        if (error) {
            console.error("🚨 [CONFIG] Cloud config load failed:", error.message);
            return;
        }
        if (cloudConfig) {
            applyConfigToState(cloudConfig);
            window._isConfigLoaded = true;
            if (typeof window.updateUI === 'function') window.updateUI();
            if (typeof window.updateQuestUI === 'function') window.updateQuestUI();
            checkSeasonReset();
        } else {
            console.warn("⚠️ [CONFIG] No 'current' config found in game_configs table.");
        }
    } catch (e) {
        console.error("❌ loadGameConfigCloud Critical Error:", e);
    }
}

export function applyConfigToState(config) {
    if (!config) return;
    STATE.config = { ...STATE.config, ...config };
}

export function getActiveConfig() {
    const tpl = STATE.config?.template || 'pet';
    const diff = STATE.config?.difficulty_mode || 'normal';
    return STATE.config?.matrix?.[tpl]?.[diff] || createDefaultSettings(tpl, diff);
}

export function resetDailyQuests() {
    const today = new Date().toDateString();
    if (STATE.last_quest_date !== today) {
        console.log("🌅 [QUESTS] New day detected. Resetting daily quests...");
        STATE.quests.feed = 0;
        STATE.quests.clean = 0;
        STATE.quests.play = 0;
        STATE.quests.claimed = false;
        STATE.last_quest_date = today;
        
        // สุ่มเควสพิเศษใหม่
        const pool = SPECIAL_QUEST_POOL;
        const randomQuest = pool[Math.floor(Math.random() * pool.length)];
        STATE.quests.special = { ...randomQuest, current: 0 };
        STATE.quests.special_claimed = false;
        
        saveState(true);
    }
}

function checkSeasonReset() {
    if (!window._isStateLoaded || !window._isConfigLoaded) return;
    
    const cloudSeason = parseInt(STATE.config.season_number || 0);
    const userSeason = parseInt(STATE.current_season || 0);

    if (cloudSeason > 0 && cloudSeason > userSeason) {
        console.warn(`🚨 [SEASON] Resetting user from S${userSeason} to S${cloudSeason}`);
        STATE.current_season = cloudSeason;
        STATE.level = 1; STATE.xp = 0; STATE.score = 0; STATE.tokens = 500;
        
        // 📅 [SEASON RESET] ล้างข้อมูลรางวัลล็อกอินเมื่อขึ้นซีซั่นใหม่
        STATE.login_streak = 0;
        STATE.last_login_date = "";
        STATE.claimed_days = [];
        
        // 🔥 [FIX] ล้างบันทึกการรับรางวัลในเครื่องด้วย เพื่อให้เริ่มซีซั่นใหม่รับวันแรกได้ทันที (แม้จะเคยกดรับของซีซั่นเก่าไปแล้วในวันเดียวกัน)
        const userIdKey = currentUserId || localStorage.getItem('last_user_id') || 'GUEST';
        localStorage.removeItem('last_login_verified_' + userIdKey);
        localStorage.removeItem('login_streak_verified_' + userIdKey);

        // 🛡️ [FINAL AUDIT] รีเซ็ตสกิลบอสด้วยเพื่อให้ซีซั่นใหม่เริ่มจากศูนย์เท่ากันทุกคน
        STATE.boss_skills = {
            lvl: 1, xp: 0, next: 5000, points: 0,
            damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
        };
        
        saveState(true);
        if (window.updateUI) window.updateUI();
        if (window.spawn) window.spawn(`🚀 เริ่มซีซั่นใหม่ที่ ${cloudSeason}!`, "text-yellow-400 font-black");
    }
}
