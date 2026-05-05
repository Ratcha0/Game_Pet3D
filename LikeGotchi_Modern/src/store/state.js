/**
 * 📊 state.js
 * จัดการข้อมูลหลักของเกม (Centralized Game State)
 * [REVERT] กลับสู่สถานะเดิมที่เสถียร 100%
 */

export function createDefaultSettings(template, mode) {
    const isHard = mode === 'hard';
    const isEasy = mode === 'easy';

    const base = {
        pet: {
            activities: {
                feed:   { r: 12, s: 6, xp: 100 },
                clean:  { r: 14, s: 5, xp: 80 },
                play:   { r: 18, s: 15, xp: 150 },
                repair: { r: 10, s: 4, xp: 70 }
            },
            mechanics: {
                dec_hunger: 0.08, dec_clean: 0.05, dec_happy: 0.06,
                reg_stamina: 0.75, max_stamina: 100, rare_rate: 8
            },
            rewards: { silver_min: 20, silver_max: 100, rare_token_min: 200, rare_token_max: 500 }
        },
        car: {
            activities: {
                feed:   { r: 30, s: 15, xp: 12 },
                clean:  { r: 15, s: 10, xp: 8 },
                play:   { r: 20, s: 20, xp: 15 },
                repair: { r: 30, s: 12, xp: 20 }
            },
            mechanics: {
                dec_hunger: 0.12, dec_clean: 0.03, dec_happy: 0.06,
                reg_stamina: 0.35, max_stamina: 120, rare_rate: 8
            },
            rewards: { silver_min: 20, silver_max: 45, rare_token_min: 150, rare_token_max: 400 }
        },
        plant: {
            activities: {
                feed:   { r: 20, s: 10, xp: 6 },
                clean:  { r: 25, s: 12, xp: 10 },
                play:   { r: 10, s: 8,  xp: 8 },
                repair: { r: 20, s: 15, xp: 12 }
            },
            mechanics: {
                dec_hunger: 0.05, dec_clean: 0.06, dec_happy: 0.03,
                reg_stamina: 0.55, max_stamina: 80, rare_rate: 12
            },
            rewards: { silver_min: 10, silver_max: 25, rare_token_min: 80, rare_token_max: 200 }
        }
    };

    const config = JSON.parse(JSON.stringify(base[template] || base.pet)); // Deep copy basic
    
    // 🔥 [AUDIT] เติมโครงสร้างที่จำเป็นให้ครบถ้วนเพื่อป้องกัน UI Error
    config.shop = {
        small_tokens: isHard ? 600 : 450, small_amount: 50,
        medium_tokens: isHard ? 1400 : 1000, medium_amount: 120,
        large_tokens: isHard ? 3200 : 2500, large_amount: 300
    };
    
    config.boosters = {
        score: { cost: 300, mult: 1.10, duration: 15 },
        decay: { cost: 450, mult: 0.80, duration: 20 },
        luck:  { cost: 500, mult: 1.50, duration: 10 }
    };
    
    config.quests = {
        reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.4),
        base_tokens: 400, base_score: 5000, base_xp: 2000
    };

    const mult = (mode === 'easy') ? 0.7 : (mode === 'hard' ? 1.5 : 1.0);
    config.mechanics.dec_hunger *= mult;
    config.mechanics.dec_clean *= mult;
    config.mechanics.dec_happy *= mult;
    
    return config;
}

export let currentUserId = localStorage.getItem('last_user_id') || null;

export function setUserId(id) {
    currentUserId = id;
    localStorage.setItem('last_user_id', id);
    window.currentUserId = id;
}

export const SPECIAL_QUEST_POOL = [
    { label: 'สะสม Stamina', type: 'spend', target: 100 },
    { label: 'เก็บอึผู้โชคดี', type: 'rare_poop', target: 2 },
    { label: 'เล่นกับสัตว์เลี้ยง', type: 'play', target: 10 },
    { label: 'ป้อนอาหารแสนอร่อย', type: 'feed', target: 10 }
];

export const STATE = {
    username: "ผู้เล่นทั่วไป",
    pin_code: "",
    tokens: 500,  
    score: 0,     
    hunger: 80, clean: 80, stamina: 100, love: 50,
    max_stamina: 100, xp: 0, level: 1, max_exp: 200,
    current_season: 1,
    login_streak: 0,
    last_login_date: "",
    carrying_rock: 0,
    boss_skills: {
        lvl: 1, xp: 0, next: 5000, points: 0,
        damage: { lvl: 1 },
        crit: { lvl: 1 },
        speed: { lvl: 1 },
        bag: { lvl: 1 }
    },
    inventory: {
        equipped_skins: { pet: null, car: null, plant: null },
        skins: [],
        boosters: {}
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
        template: 'pet', 
        difficulty_mode: 'normal',
        sky: 'day', ground: 'grass',
        custom_model: '', custom_rotation_y: 0,
        available_skins: [],
        matrix: {
            pet: { easy: createDefaultSettings('pet', 'easy'), normal: createDefaultSettings('pet', 'normal'), hard: createDefaultSettings('pet', 'hard') },
            car: { easy: createDefaultSettings('car', 'easy'), normal: createDefaultSettings('car', 'normal'), hard: createDefaultSettings('car', 'hard') },
            plant: { easy: createDefaultSettings('plant', 'easy'), normal: createDefaultSettings('plant', 'normal'), hard: createDefaultSettings('plant', 'hard') }
        },
        world_boss: { active: false, hp: 0, max_hp: 1000000, schedules: [] }
    }
};

export function sanitizeState() {
    // 🛡️ [STATE HEALER] กู้คืนค่าที่เป็น NaN ให้กลับมาเป็นค่าเริ่มต้นที่ปลอดภัย
    STATE.stamina = isNaN(STATE.stamina) ? 100 : parseFloat(STATE.stamina);
    STATE.hunger = isNaN(STATE.hunger) ? 80 : parseFloat(STATE.hunger);
    STATE.clean = isNaN(STATE.clean) ? 80 : parseFloat(STATE.clean);
    STATE.love = isNaN(STATE.love) ? 50 : parseFloat(STATE.love);
    STATE.xp = isNaN(STATE.xp) ? 0 : parseFloat(STATE.xp);
    STATE.tokens = isNaN(STATE.tokens) ? 0 : Math.floor(parseFloat(STATE.tokens));
    STATE.level = isNaN(STATE.level) ? 1 : Math.max(1, parseInt(STATE.level));
    STATE.score = isNaN(STATE.score) ? 0 : Math.floor(parseFloat(STATE.score));
    STATE.carrying_rock = isNaN(STATE.carrying_rock) ? 0 : Math.max(0, parseInt(STATE.carrying_rock));
    STATE.max_exp = isNaN(STATE.max_exp) ? 200 : Math.max(200, parseInt(STATE.max_exp));
    
    // ป้องกันค่าติดลบในส่วนที่สำคัญ
    STATE.stamina = Math.max(0, Math.round(STATE.stamina * 100) / 100);
    STATE.hunger = Math.max(0, STATE.hunger);
    STATE.clean = Math.max(0, STATE.clean);
    STATE.love = Math.max(0, STATE.love);
}
window.sanitizeState = sanitizeState;

let _lastCloudSave = 0;
let _lastSignificantData = ""; // เก็บ Stringified ของค่าสำคัญเพื่อเช็คการเปลี่ยนแปลง

export async function saveState(isLocalOnly = false, forceCloud = false) {
    // 🛡️ [CRITICAL GUARD] ห้ามเซฟถ้าข้อมูลยังโหลดไม่เสร็จ หรือไม่มี UserID
    if (!currentUserId || (!window._isStateLoaded && !forceCloud)) {
        console.warn("⚠️ [STATE] Save blocked: Data not loaded or no UserID.");
        return;
    }

    sanitizeState(); // 🛡️ [STATE HEALER] กรองข้อมูลเสียก่อนบันทึก

    const data = { ...STATE };
    if (currentUserId) localStorage.setItem('likegotchi_state_' + currentUserId, JSON.stringify(data));
    
    if (isLocalOnly || !window.SupabaseSvc) return;

    // 🛡️ [SMART CLOUD SAVE] เซฟลง Cloud เฉพาะเมื่อข้อมูลสำคัญเปลี่ยน หรือถูกบังคับ
    const significantFields = {
        tokens: STATE.tokens,
        xp: STATE.xp,
        level: STATE.level,
        score: STATE.score,
        inventory: STATE.inventory,
        quests_claimed: STATE.quests.claimed
    };
    const currentSig = JSON.stringify(significantFields);
    
    const now = Date.now();
    const isCooldownOver = (now - _lastCloudSave > 5000); // 5 วินาที Cooldown
    const hasDataChanged = currentSig !== _lastSignificantData;

    if (forceCloud || (isCooldownOver && hasDataChanged)) {
        _lastCloudSave = now;
        _lastSignificantData = currentSig;
        _isSavingNow = true;
        try { 
            await window.SupabaseSvc.savePetState(currentUserId, data); 
        } catch (e) {}
        _isSavingNow = false;
    }
}

export async function loadState() {
    window._isStateLoaded = false; // เริ่มต้นโหลดใหม่
    if (!currentUserId) return;
    const local = localStorage.getItem('likegotchi_state_' + currentUserId);
    if (local) {
        try { Object.assign(STATE, JSON.parse(local)); } catch(e) {}
    }
    if (window.SupabaseSvc && currentUserId) {
        try {
            const { data: cloudData, error: cloudError } = await window.SupabaseSvc.loadPetState(currentUserId);
            
            if (cloudError && cloudError.code !== 'PGRST116') {
                console.error("❌ loadState Cloud Error:", cloudError);
                // 🛡️ [CRITICAL] ห้ามตั้ง _isStateLoaded = true หากเกิด Error จริง 
                // เพื่อป้องกันการ Auto-save ทับข้อมูล Cloud ด้วยค่าเริ่มต้น (Level 1)
                return; 
            }

            if (cloudData) {
                const mappedData = { ...cloudData };
                if (mappedData.pet_name) mappedData.username = mappedData.pet_name;
                if (mappedData.quests_data) mappedData.quests = mappedData.quests_data;
                
                delete mappedData.id; delete mappedData.player_id; delete mappedData.created_at;
                delete mappedData.pet_name; delete mappedData.quests_data; 
                Object.keys(mappedData).forEach(k => { if (mappedData[k] === null) delete mappedData[k]; });
                delete STATE.quests_data;

                // 🛡️ [AUDIT FIX] Sync Conflict Resolution
                const localProgress = (parseInt(STATE.level) || 1) * 10000000 + (parseInt(STATE.score) || 0);
                const cloudProgress = (parseInt(mappedData.level) || 1) * 10000000 + (parseInt(mappedData.score) || 0);
                
                if (localProgress > cloudProgress) {
                    console.warn("⚠️ [STATE] Local data is newer than Cloud! Keeping local and forcing sync...");
                    if (window.SupabaseSvc) window.SupabaseSvc.savePetState(currentUserId, STATE);
                } else {
                    // 🛡️ [DEEP MERGE]
                    if (!STATE.inventory) STATE.inventory = { equipped_skins: {}, skins: [], boosters: {} };
                    if (!STATE.inventory.boosters || Array.isArray(STATE.inventory.boosters)) STATE.inventory.boosters = {};
                    if (!STATE.inventory.equipped_skins || Array.isArray(STATE.inventory.equipped_skins)) STATE.inventory.equipped_skins = {};
                    
                    const invBackup = { ...STATE.inventory };
                    if (mappedData.inventory) {
                        STATE.inventory = { 
                            ...invBackup, 
                            ...mappedData.inventory,
                            boosters: { ...(invBackup.boosters || {}), ...(mappedData.inventory.boosters || {}) },
                            equipped_skins: { ...(invBackup.equipped_skins || {}), ...(mappedData.inventory.equipped_skins || {}) }
                        };
                        delete mappedData.inventory;
                    }
                    if (mappedData.quests) {
                        STATE.quests = { ...(STATE.quests || {}), ...mappedData.quests };
                        delete mappedData.quests;
                    }
                    
                    Object.assign(STATE, mappedData);
                    
                    // 🛡️ [FINAL AUDIT] ล้างข้อมูลเสียทันทีที่โหลดเสร็จ
                    sanitizeState();

                    // 🚀 [SEASON AUDIT FIX] เช็คซีซั่นหลังจากโหลดข้อมูลผู้เล่นเสร็จแล้วเท่านั้น
                    checkSeasonReset();

                    if (window.updateUI) window.updateUI();
                }
                subscribeToPlayerState();
            }
            window._isStateLoaded = true; 
            console.log("✅ [STATE] Data loaded successfully.");
        } catch(e) {
            console.error("❌ loadState Critical Exception:", e);
        }
    } else {
        window._isStateLoaded = true;
    }
    return STATE;
}

/**
 * 📡 [DEEP AUDIT] ระบบซิงค์ข้อมูลผู้เล่น Real-time
 * ช่วยให้เล่นหลายจอ/หลายเครื่องพร้อมกันได้ โดยข้อมูลจะตรงกันเสมอ
 */
let _isSavingNow = false; // 🛡️ [SYNC GUARD] ป้องกันการซิงค์ทับขณะกำลังเซฟเอง
function subscribeToPlayerState() {
    if (!window.SupabaseSvc || !window.SupabaseSvc.supabase || !currentUserId) return;
    
    window.SupabaseSvc.supabase
        .channel('player_state_sync_' + currentUserId)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'pet_states',
            filter: `player_id=eq.${currentUserId}` 
        }, payload => {
            if (_isSavingNow) return; // ถ้าเราเป็นคนเซฟเอง ไม่ต้องซิงค์ซ้ำจาก Cloud

            const newData = payload.new;
            if (!newData) return;

            // 🛡️ [SYNC PROTECTION] ป้องกันข้อมูลจากเครื่องอื่นที่เก่ากว่ามาทับ (เช่น กรณีเปิดหลายจอแล้วจอนึงเน็ตช้า)
            const currentProgress = (parseInt(STATE.level) || 1) * 10000000 + (parseInt(STATE.score) || 0);
            const incomingProgress = (parseInt(newData.level) || 1) * 10000000 + (parseInt(newData.score) || 0);

            if (incomingProgress < currentProgress) {
                console.warn("🔄 [MULTI-DEVICE] Ignored older state sync from Cloud.");
                return;
            }

            console.group("🔄 [MULTI-DEVICE] Syncing State from Cloud...");
            
            if (newData.tokens !== undefined) STATE.tokens = newData.tokens;
            if (newData.xp !== undefined) STATE.xp = newData.xp;
            if (newData.level !== undefined) STATE.level = newData.level;
            if (newData.score !== undefined) STATE.score = newData.score;
            if (newData.stamina !== undefined) STATE.stamina = newData.stamina;
            if (newData.hunger !== undefined) STATE.hunger = newData.hunger;
            if (newData.clean !== undefined) STATE.clean = newData.clean;
            if (newData.love !== undefined) STATE.love = newData.love;
            
            if (newData.pet_name) STATE.username = newData.pet_name;
            if (newData.quests_data) STATE.quests = newData.quests_data;
            if (newData.inventory) STATE.inventory = newData.inventory;
            if (newData.boss_skills) STATE.boss_skills = newData.boss_skills;
            if (newData.buffs) STATE.buffs = newData.buffs;
            if (newData.login_streak !== undefined) STATE.login_streak = newData.login_streak;
            if (newData.last_login_date) STATE.last_login_date = newData.last_login_date;
            if (newData.carrying_rock !== undefined) STATE.carrying_rock = newData.carrying_rock;
            
            // 🛡️ [DEEP AUDIT] กรองข้อมูล "หลังจาก" นำเข้าเสร็จสิ้น เพื่อป้องกันข้อมูลเน่าจาก Cloud
            sanitizeState();

            if (window.updateUI) window.updateUI();
            if (window.updateQuestUI) window.updateQuestUI();
            window.dispatchEvent(new CustomEvent('state-synced'));
            console.groupEnd();
        })
        .subscribe();
}

export function applyConfigToState(newConfig) {
    if (!newConfig) return;
    
    // 🛡️ [DEEP MERGE FIX] แยก matrix ออกมาเพื่อไม่ให้โดนทับทิ้งทั้งก้อน
    const { matrix, ...rest } = newConfig;
    
    if (matrix) {
        // รวมเฉพาะเทมเพลตที่ส่งมาใหม่ (เช่น pet) แต่ยังรักษาเทมเพลตเดิมไว้ (เช่น car, plant)
        STATE.config.matrix = { 
            ...STATE.config.matrix, 
            ...matrix 
        };
    }
    
    // รวมค่าอื่นๆ (เช่น template, sky, ground) เข้าไปใน config
    STATE.config = { 
        ...STATE.config, 
        ...rest 
    };

    // 🚀 [SEASON RESET LOGIC] เช็คซีซั่นผ่านฟังก์ชันกลาง
    checkSeasonReset();
}

/**
 * 🚀 [SEASON AUDIT FIX] ฟังก์ชันกลางสำหรับเช็คการเปลี่ยนซีซั่น
 * ย้ายมาเป็นฟังก์ชันแยกเพื่อให้เรียกใช้ได้ทั้งตอนโหลดเกมและตอน Config อัปเดต Real-time
 */
export function checkSeasonReset() {
    if (!window._isStateLoaded) return; // 🛡️ ห้ามเช็คถ้าข้อมูลผู้เล่นยังโหลดไม่เสร็จ

    const newSeasonNum = parseInt(STATE.config.season_number) || 1;
    const playerSeasonNum = parseInt(STATE.current_season) || 1;

    if (newSeasonNum > playerSeasonNum) {
        console.warn(`🚀 [SEASON RESET] Transitioning from ${playerSeasonNum} to ${newSeasonNum}`);
        
        // 1. บันทึกประวัติซีซั่นเดิม (ถ้ามีคะแนน)
        if (STATE.score > 0 && window.SupabaseSvc && currentUserId) {
            window.SupabaseSvc.logSeasonHistory(currentUserId, playerSeasonNum, STATE.score);
        }
        
        // 2. รีเซ็ตข้อมูลผู้เล่น (Full Season Reset)
        STATE.level = 1;
        STATE.xp = 0;
        STATE.score = 0;
        STATE.tokens = 500; // ให้ทุกคนเริ่มซีซั่นใหม่ด้วยเงิน 500 เท่ากัน
        STATE.max_exp = 200;
        STATE.current_season = newSeasonNum;
        
        // 🛡️ [FINAL AUDIT] รีเซ็ตสกิลบอสด้วยเพื่อให้ซีซั่นใหม่เริ่มจากศูนย์เท่ากันทุกคน
        STATE.boss_skills = {
            lvl: 1, xp: 0, next: 5000, points: 0,
            damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
        };
        
        // 3. ล้างเควสรายวัน
        if (window.resetDailyQuests) window.resetDailyQuests();
        
        // 4. แจ้งเตือนผู้เล่นผ่าน UI
        if (window.spawn) window.spawn(`🌟 ซีซั่น ${newSeasonNum} เริ่มต้นแล้ว! ข้อมูลของคุณถูกรีเซ็ตเพื่อการแข่งขันใหม่`, "text-yellow-400 font-black");
        
        // 🛡️ [FINAL AUDIT] สั่งรีเฟรชตารางอันดับให้เป็นซีซั่นใหม่ทันที
        if (window.refreshRankingList) window.refreshRankingList();

        // 5. บันทึกลง Cloud ทันทีเพื่อป้องกันการรีเฟรชหน้าจอแล้วเวลกลับมา
        saveState(false, true);
    }
}

export async function loadAdminConfigLocal() {
    try {
        const res = await fetch('/config.json');
        if (res.ok) {
            const data = await res.json();
            applyConfigToState(data);
        }
    } catch(e) {}
}

export async function loadGameConfigCloud() {
    if (window.SupabaseSvc) {
        try {
            const { data: cloudConfig } = await window.SupabaseSvc.loadGameConfig();
            if (cloudConfig && cloudConfig.config) applyConfigToState(cloudConfig.config);
            else if (cloudConfig) applyConfigToState(cloudConfig);
            
            // 🔥 [LIVE SYNC] Subscribe to configuration changes
            subscribeToGameConfig();
        } catch(e) {}
    }
}

/**
 * 📡 [DEEP AUDIT] ระบบ Real-time Config Sync
 * รับค่าจากหน้า Admin และอัปเดตเกมทันทีโดยไม่ต้อง Refresh
 */
function subscribeToGameConfig() {
    if (!window.SupabaseSvc || !window.SupabaseSvc.supabase) return;
    
    window.SupabaseSvc.supabase
        .channel('game_config_sync')
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'game_configs',
            filter: `id=eq.production_config` 
        }, payload => {
            console.log("☁️ [LIVE CONFIG] Received Update:", payload.new);
            if (payload.new && payload.new.config) {
                applyConfigToState(payload.new.config);
                // แจ้งเตือน 3D Engine และ UI ให้รีเฟรชค่าใหม่
                window._forceRerender = true; // 🛍️ [SHOP SYNC] บังคับให้ร้านค้าวาดใหม่
                if (window.updateEngineConfig) window.updateEngineConfig();
                if (window.updateUI) window.updateUI();
            }
        })
        .subscribe();
}

export function getActiveConfig() {
    const tpl = STATE.config?.template || 'pet';
    const mode = STATE.config?.difficulty_mode || 'normal';
    
    // 🛡️ [CRITICAL SAFETY] ป้องกันการอ่าน Property ของ undefined
    if (!STATE.config || !STATE.config.matrix || !STATE.config.matrix[tpl]) {
        console.warn("⚠️ getActiveConfig: Matrix structure missing for", tpl);
        // คืนค่า Default ชั่วคราวเพื่อไม่ให้ UI พัง
        return createDefaultSettings(tpl, mode);
    }
    
    return STATE.config.matrix[tpl][mode] || createDefaultSettings(tpl, mode);
}
