import { loadPetState, savePetState, loadGameConfig, logSeasonHistory } from '../services/supabase.js';

const urlParams = new URLSearchParams(window.location.search);
export const isAdminPreview = urlParams.get('admin') === 'true' || window.name === 'admin-preview' || (window.self !== window.top);

// --- ⚙️ Hyper-Granular Settings Factory (Sync with admin.js) ---
const createDefaultSettings = (template, diff) => {
    const isHard = diff === 'hard';
    const isEasy = diff === 'easy';
    
    // ตั้งค่าพื้นฐานตามชนิดตัวละคร (Physics Base)
    const baseSpeed = template === 'car' ? 0.085 : (template === 'plant' ? 0.055 : 0.065);
    const baseScale = template === 'car' ? 0.4 : (template === 'plant' ? 1.2 : 1.0);

    return {
        // 1. กิจกรรม (Activities) - [+ฟื้นฟู, -ใช้ไฟ, XP]
        activities: {
            feed:   { r: isEasy ? 50 : (isHard ? 25 : 34), s: isEasy ? 2 : (isHard ? 12 : 6), xp: isEasy ? 50 : (isHard ? 150 : 80) },
            clean:  { r: isEasy ? 60 : (isHard ? 28 : 35), s: isEasy ? 2 : (isHard ? 10 : 5), xp: isEasy ? 40 : (isHard ? 120 : 65) },
            repair: { r: isEasy ? 40 : (isHard ? 20 : 25), s: isEasy ? 2 : (isHard ? 10 : 10), xp: isEasy ? 30 : (isHard ? 100 : 55) },
            play:   { r: isEasy ? 65 : (isHard ? 30 : 40), s: isEasy ? 5 : (isHard ? 25 : 15), xp: isEasy ? 100 : (isHard ? 350 : 150) }
        },
        // 2. รางวัลไอเทมบนแมพ (Economy)
        rewards: {
            silver_min: isHard ? 10 : (isEasy ? 50 : 20),
            silver_max: isHard ? 50 : (isEasy ? 150 : 100),
            silver_xp: isHard ? 20 : (isEasy ? 60 : 40),
            gold_min: isHard ? 100 : (isEasy ? 300 : 200),
            gold_max: isHard ? 300 : (isEasy ? 600 : 400),
            gold_rate: isEasy ? 25 : (isHard ? 8 : 15),
            gold_xp: isHard ? 100 : (isEasy ? 300 : 200),
            diamond_min: isHard ? 500 : (isEasy ? 1000 : 800),
            diamond_max: isHard ? 1000 : (isEasy ? 2500 : 1500),
            diamond_rate: isEasy ? 5 : (isHard ? 1 : 2),
            diamond_xp: isHard ? 500 : (isEasy ? 1500 : 1000)
        },
        // 3. ภารกิจรายวัน (Quests)
        quests: {
            target_feed: isEasy ? 2 : (isHard ? 5 : 3),
            target_clean: isEasy ? 1 : (isHard ? 4 : 2),
            target_play: isEasy ? 1 : (isHard ? 3 : 1),
            target_scoop: isHard ? 10 : 5,
            target_fever: isHard ? 2 : 1,
            target_pure_love: isHard ? 15 : 10,
            target_spend: isHard ? 2000 : 1000,
            reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.4),
            base_tokens: isEasy ? 300 : (isHard ? 400 : 430),
            base_score: isEasy ? 4000 : (isHard ? 6000 : 7150),
            base_xp: isEasy ? 1000 : (isHard ? 3000 : 2000)
        },
        // 4. ร้านค้า (Shop Economy)
        shop: {
            small_tokens: isHard ? 600 : 450, small_amount: 50,
            medium_tokens: isHard ? 1400 : 1000, medium_amount: 120,
            large_tokens: isHard ? 3200 : 2500, large_amount: 300
        },
        world_boss: {
            active: false, hp: 1000000, max_hp: 1000000,
            rock_spawn_delay: 2, rock_spawn_limit: 4, rock_carry_limit: 3,
            base_damage: 5000, damage_scale: 5000,
            reward_tokens: 5000, reward_score: 250000, reward_xp: 5000
        },
        // 5. กลไกหลัก (Mechanics)
        mechanics: {
            dec_hunger: isHard ? 0.025 : (isEasy ? 0.008 : 0.015), 
            dec_clean:  isHard ? 0.020 : (isEasy ? 0.006 : 0.012),
            dec_happy:  isHard ? 0.030 : (isEasy ? 0.010 : 0.018),
            max_stamina: isEasy ? 150 : (isHard ? 80 : 100),
            reg_stamina: isEasy ? 1.2 : (isHard ? 0.45 : 0.75),
            sp_min: isHard ? 15 : (isEasy ? 30 : 20),
            sp_max: isHard ? 45 : (isEasy ? 90 : 60),
            rare_rate: isHard ? 12 : (isEasy ? 5 : 8),
            poop_lifetime: isEasy ? 300 : (isHard ? 90 : 180), 
            reward_lifetime: isEasy ? 240 : (isHard ? 80 : 150),
            max_poops: 3, max_rewards: 3,
            dec_happy_poop: isHard ? 30 : (isEasy ? 5 : 15),
            fever_threshold: isEasy ? 70 : (isHard ? 90 : 80),
            fever_mult: isEasy ? 2.0 : (isHard ? 1.5 : 1.8)
        },
        // 6. บัฟและไอเทมเสริม (Boosters)
        boosters: {
            score: { cost: 300, mult: 1.10, duration: 15 },
            decay: { cost: 450, mult: 0.80, duration: 20 },
            luck:  { cost: 500, mult: 1.50, duration: 10 }
        },
        // 7. ฟิสิกส์ (Physics)
        physics: {
            speed: isHard ? baseSpeed * 1.15 : baseSpeed,
            scale: baseScale
        },
        // 8. รางวันเช็คอินรายวัน (Login Rewards)
        login_rewards: [
            { day: 1, reward_type: 'gold', reward_value: isHard ? 100 : (isEasy ? 300 : 200) },
            { day: 2, reward_type: 'gold', reward_value: isHard ? 150 : (isEasy ? 450 : 300) },
            { day: 3, reward_type: 'gold', reward_value: isHard ? 200 : (isEasy ? 600 : 400) },
            { day: 4, reward_type: 'gold', reward_value: isHard ? 250 : (isEasy ? 750 : 500) },
            { day: 5, reward_type: 'decay', reward_value: 20 },
            { day: 6, reward_type: 'gold', reward_value: isHard ? 400 : (isEasy ? 1200 : 800) },
            { day: 7, reward_type: 'luck', reward_value: 30 }
        ]
    };
};

export const STATE = {
    username: "ผู้เล่นทั่วไป",
    pin_code: "",
    tokens: 500,  
    score: 0,     
    hunger: 80, clean: 80, stamina: 100, love: 50,
    maxStamina: 100, xp: 0, level: 1, maxExp: 200,
    current_season: 1,
    login_streak: 0,
    last_login_date: "",
    config: {
        template: 'pet', 
        difficulty_mode: 'normal',
        sky: 'day', ground: 'grass',
        custom_model: '', custom_rotation_y: 0,
        available_skins: [],
        // Matrix เก็บค่าแยกตาม Template และ Difficulty
        matrix: {
            pet: { easy: createDefaultSettings('pet', 'easy'), normal: createDefaultSettings('pet', 'normal'), hard: createDefaultSettings('pet', 'hard') },
            car: { easy: createDefaultSettings('car', 'easy'), normal: createDefaultSettings('car', 'normal'), hard: createDefaultSettings('car', 'hard') },
            plant: { easy: createDefaultSettings('plant', 'easy'), normal: createDefaultSettings('plant', 'normal'), hard: createDefaultSettings('plant', 'hard') }
        }
    },
    quests: { feed: 0, feed_max: 4, clean: 0, clean_max: 3, play: 0, play_max: 2, special: { type: 'scoop', target: 8, current: 0, label: 'นักช้อนอึมือทอง', icon: '💩' }, claimed: false, special_claimed: false },
    buffs: { 
        score_mult: 1.0, score_expiry: 0,
        decay_mult: 1.0, decay_expiry: 0,
        luck_mult: 1.0, luck_expiry: 0,
        regen: 1.0, regen_expiry: 0 
    },
    inventory: { skins: [], equipped_skins: {} },
    carrying_rock: 0,
    boss_skills: {
        points: 0, xp: 0, lvl: 1, next: 5000,
        damage: { lvl: 1 },
        crit: { lvl: 1 },
        speed: { lvl: 1 },
        bag: { lvl: 1 }
    }
};

export const SPECIAL_QUEST_POOL = [
    { type: 'scoop', label: 'นักช้อนมือทอง', icon: '💩', targetIcon: '🏆' },
    { type: 'fever', label: 'สายลุยฟีเวอร์', icon: '🔥', targetIcon: '🌟' },
    { type: 'pure_love', label: 'หัวใจเต็มร้อย', icon: '💖', targetIcon: '👑' },
    { type: 'spend', label: 'ก้าวข้ามขีดจำกัด', icon: '⚡', targetIcon: '🏃' }
];

export let currentUserId = "GUEST_USER"; 
export let isLoaded = false; // 🔒 Flag to prevent premature saving
export function setUserId(id) { currentUserId = id; }

export function resetStateToDefaults() {
    STATE.tokens = 500; 
    STATE.score = 0; 
    STATE.hunger = 80; 
    STATE.clean = 80; 
    STATE.stamina = 100; 
    STATE.love = 50;
    STATE.xp = 0; 
    STATE.level = 1; 
    STATE.maxExp = 200;
    STATE.inventory = { skins: [], equipped_skins: {} };
    STATE.quests = { feed: 0, feed_max: 3, clean: 0, clean_max: 2, play: 0, play_max: 1, special: { type: 'scoop', target: 5, current: 0, label: 'ช้อนอึทองคำ', icon: '💩' }, claimed: false, special_claimed: false };
    STATE.buffs = { 
        score_mult: 1.0, score_expiry: 0,
        decay_mult: 1.0, decay_expiry: 0,
        luck_mult: 1.0, luck_expiry: 0,
        regen: 1.0, regen_expiry: 0 
    };
    STATE.carrying_rock = 0;
    STATE.boss_skills = {
        points: 0, xp: 0, lvl: 1, next: 5000,
        damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
    };
}

export async function loadState() {
    isLoaded = false;
    resetStateToDefaults();
    await loadGameConfigCloud();
    if (currentUserId !== "GUEST_USER") {
        const { data, error } = await loadPetState(currentUserId);
        if (data) {
            mergeSaveData(data);
            // --- 📅 Season Reset Logic (Lazy Reset) ---
            const globalSeason = STATE.config.season_number || 1;
            const playerSeason = STATE.current_season || 1;
            
            if (playerSeason < globalSeason) {
                console.warn(`🚨 NEW SEASON DETECTED! S${playerSeason} -> S${globalSeason}. Resetting progress...`);
                STATE._isResettingSeason = true;
                
                // 1. บันทึกผลงานเก่าลง History ก่อนสลายหายไป
                await logSeasonHistory(currentUserId, playerSeason, STATE.score);
                
                // 2. รีเซ็ตค่าสำคัญทั้งหมด (เริ่มใหม่ 100% ยกเว้นสกิน)
                STATE.score = 0;
                STATE.level = 1;
                STATE.xp = 0;
                STATE.maxExp = 100;
                STATE.tokens = 500; // รีเซ็ตเงินเริ่มต้นใหม่
                STATE.hunger = 80;
                STATE.clean = 80;
                STATE.stamina = 100;
                STATE.love = 50;
                STATE.current_season = globalSeason;
                STATE.login_streak = 0; // Fresh start for login rewards
                STATE.last_login_date = ""; 
                STATE.carrying_rock = 0;
                
                // รีเซ็ตสกิลบอส (ทุกคนต้องเริ่มฝึกใหม่)
                STATE.boss_skills = {
                    points: 0, xp: 0, lvl: 1, next: 5000,
                    damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
                };
                
                // รีเซ็ตภารกิจ
                STATE.quests = { 
                    feed: 0, feed_max: 3, clean: 0, clean_max: 2, play: 0, play_max: 1, 
                    special: STATE.quests.special, 
                    claimed: false,
                    special_claimed: false
                };
                
                // บันทึกทับทันทีเพื่อให้ข้อมูลบน Cloud เป็นซีซั่นใหม่
                await savePetState(currentUserId, STATE);
                STATE._isResettingSeason = false;

                if (window.spawn) {
                    window.spawn(`🎉 เริ่มต้นซีซั่นใหม่ ${STATE.config.season_name}! (เริ่มเก็บสะสมใหม่กัน!)`, "text-neon-pink font-black");
                }
            }
        }
    }
    isLoaded = true; // ✅ Mark loading as complete
}

function mergeSaveData(d) {
    if (!d) return;
    
    // 🛡️ Defensive Check: Don't allow resetting to Level 1 if we already have level 2+ 
    // unless it's a confirmed season reset.
    if (STATE.level > 1 && d.level === 1 && !STATE._isResettingSeason) {
        console.warn("🛡️ Blocking suspicious state merge that would reset Level to 1.");
        return;
    }

    if (d.username || d.pet_name) STATE.username = d.username || d.pet_name;
    if (d.pin_code) STATE.pin_code = d.pin_code;
    
    // อนุญาตให้อุกเดตถ้าค่าที่มาใหม่ "ไม่เป็นค่าว่าง/ค่าเริ่มต้นพังๆ"
    if (d.tokens !== undefined && !isNaN(d.tokens)) STATE.tokens = d.tokens;
    if (d.score !== undefined && !isNaN(d.score)) STATE.score = d.score;
    if (d.hunger !== undefined && !isNaN(d.hunger)) STATE.hunger = d.hunger;
    if (d.clean !== undefined && !isNaN(d.clean)) STATE.clean = d.clean;
    if (d.stamina !== undefined && !isNaN(d.stamina)) STATE.stamina = d.stamina;
    if (d.love !== undefined && !isNaN(d.love)) STATE.love = d.love;
    if (d.xp !== undefined && !isNaN(d.xp)) STATE.xp = d.xp;
    if (d.level !== undefined && d.level > 0 && !isNaN(d.level)) STATE.level = d.level;
    if (d.maxExp && !isNaN(d.maxExp)) STATE.maxExp = d.maxExp;
    
    STATE.current_season = d.current_season ?? d.season_number ?? STATE.current_season;
    STATE.carrying_rock = d.carrying_rock ?? STATE.carrying_rock;
    
    if (d.boss_skills) STATE.boss_skills = d.boss_skills;
    if (d.inventory) STATE.inventory = d.inventory;
    if (d.quests) STATE.quests = d.quests;
    if (d.buffs) STATE.buffs = d.buffs;
    if (d.login_streak !== undefined) STATE.login_streak = d.login_streak;
    if (d.last_login_date) STATE.last_login_date = d.last_login_date;
    
    // 🔥 [BUGFIX] ป้องกันการรีเซ็ตค่า Config (สกิน/เทมเพลต)
    if (d.config) {
        STATE.config = { ...STATE.config, ...d.config };
    }
}

const SYNC_CHANNEL = new BroadcastChannel('like-gotchi-state-sync');

SYNC_CHANNEL.onmessage = (event) => {
    if (event.data && event.data.type === 'STATE_UPDATED') {
        const { userId, state } = event.data;
        // 🔒 ป้องกันการ Sync ข้อมูลข้ามบัญชีในบราวเซอร์เดียวกัน
        if (userId !== currentUserId) return;

        // Merge incoming state without re-triggering save
        mergeSaveData(state);
        // Dispatch custom event for UI updates
        window.dispatchEvent(new CustomEvent('state-synced'));
    }
};

let saveTimeout = null;

export function saveState(isSync = false, immediateCloud = false) {
    if (!isLoaded && !isSync) {
        console.warn("⚠️ Save blocked: State not yet loaded.");
        return;
    }
    if (isAdminPreview) return; // 🛑 Block Admin Preview from saving/syncing
    const data = {
        username: STATE.username, pin_code: STATE.pin_code,
        tokens: Math.floor(STATE.tokens), score: Math.floor(STATE.score), 
        hunger: STATE.hunger, clean: STATE.clean, stamina: STATE.stamina,
        love: STATE.love, xp: STATE.xp, level: STATE.level, maxExp: STATE.maxExp,
        current_season: STATE.current_season,
        carrying_rock: STATE.carrying_rock || 0,
        boss_skills: STATE.boss_skills,
        quests: STATE.quests, buffs: STATE.buffs, inventory: STATE.inventory
    };
    
    // 1. Local Save (Immediate)
    localStorage.setItem('PW3D_SAVE_' + currentUserId, JSON.stringify(data));
    
    // 2. Cloud Save (Debounced to protect database)
    if (currentUserId !== "GUEST_USER") {
        if (immediateCloud) {
            if (saveTimeout) clearTimeout(saveTimeout);
            savePetState(currentUserId, STATE).catch(e => console.error("Cloud Save Fail: ", e));
        } else {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                savePetState(currentUserId, STATE).catch(e => console.error("Cloud Save Fail: ", e));
            }, 3000); // 3 seconds debounce
        }
    }

    // 3. Peer Sync (Immediate)
    // 🛑 Block Sync if this is an Admin Preview to prevent resetting other tabs
    if (!isSync && !isAdminPreview) {
        SYNC_CHANNEL.postMessage({ type: 'STATE_UPDATED', userId: currentUserId, state: data });
    }
}

// ฟังก์ชันดึง Config ปัจจุบันจาก Matrix
export function getActiveConfig() {
    const t = STATE.config.template || 'pet';
    const d = STATE.config.difficulty_mode || 'normal';
    const defaults = createDefaultSettings(t, d);
    
    // หากไม่มี Matrix ให้ใช้ค่าเริ่มต้น
    if (!STATE.config.matrix[t] || !STATE.config.matrix[t][d]) {
        return defaults;
    }
    
    const active = STATE.config.matrix[t][d];
    
    // Deep Merge เพื่อป้องกันกรณี Config เก่าไม่มีระบบใหม่ (เช่น boosters, login_rewards)
    return {
        ...defaults,
        ...active,
        // เจาะจงส่วนที่มักจะเพิ่มใหม่
        activities: { ...defaults.activities, ...(active.activities || {}) },
        rewards: { ...defaults.rewards, ...(active.rewards || {}) },
        mechanics: { ...defaults.mechanics, ...(active.mechanics || {}) },
        quests: { ...defaults.quests, ...(active.quests || {}) },
        shop: { ...defaults.shop, ...(active.shop || {}) },
        boosters: { ...defaults.boosters, ...(active.boosters || {}) },
        physics: { ...defaults.physics, ...(active.physics || {}) },
        login_rewards: (active.login_rewards && active.login_rewards.length > 0) ? active.login_rewards : defaults.login_rewards
    };
}

// ฟังก์ชันล้างข้อมูล URL พังๆ (เช่น ติดพอร์ต 3000 มาจาก DB)
function sanitizeConfig(config) {
    if (!config) return config;
    const json = JSON.stringify(config);
    // เปลี่ยน http://localhost:3000 หรือพอร์ตอื่นๆ ให้กลายเป็น Relative Path
    const sanitized = json.replace(/http:\/\/localhost:\d+\//g, '/');
    return JSON.parse(sanitized);
}

export function applyConfigToState(p) {
    if (!p) return;
    const cleanP = sanitizeConfig(p);
    
    STATE.config.template = cleanP.template || 'pet';
    STATE.config.difficulty_mode = cleanP.difficulty_mode || 'normal';
    STATE.config.sky = cleanP.sky || 'day';
    STATE.config.ground = cleanP.ground || 'grass';
    STATE.config.custom_model = cleanP.custom_model || '';
    STATE.config.season_number = cleanP.season_number || 1;
    STATE.config.season_name = cleanP.season_name || 'Beta Season';
    STATE.config.season_duration = cleanP.season_duration || 15;
    if (cleanP.world_boss) STATE.config.world_boss = cleanP.world_boss;
    if (cleanP.matrix) STATE.config.matrix = cleanP.matrix;
    if (cleanP.available_skins) STATE.config.available_skins = cleanP.available_skins;
}

export async function loadGameConfigCloud() {
    const { data } = await loadGameConfig('production_config');
    if (data && data.config) applyConfigToState(data.config);
}

export function loadAdminConfigLocal() {
    const c = localStorage.getItem('pw3d_config');
    if (c) applyConfigToState(JSON.parse(c));
}
