import { loadPetState, savePetState, loadGameConfig, logSeasonHistory } from '../services/supabase.js';

// --- ⚙️ Hyper-Granular Settings Factory (Sync with admin.js) ---
const createDefaultSettings = (template, diff) => {
    const isHard = diff === 'hard';
    const isEasy = diff === 'easy';
    
    // ตั้งค่าพื้นฐานตามชนิดตัวละคร (Physics Base)
    const baseSpeed = template === 'car' ? 0.085 : (template === 'plant' ? 0.055 : 0.065);
    const baseScale = template === 'car' ? 0.4 : (template === 'plant' ? 1.2 : 1.0);

    return {
        // 1. กิจกรรม (Activities) - [+ฟื้นฟู, -ใช้ไฟ, SCORE/XP]
        // ปรับให้โหมดยากได้แต้มเยอะกว่าชัดเจนเพื่อจูงใจการไต่อันดับ
        activities: {
            feed:   { r: isEasy ? 15 : (isHard ? 8 : 12), s: isEasy ? 3 : (isHard ? 12 : 6), xp: isEasy ? 50 : (isHard ? 150 : 80) },
            clean:  { r: isEasy ? 18 : (isHard ? 7 : 14), s: isEasy ? 3 : (isHard ? 10 : 5), xp: isEasy ? 40 : (isHard ? 120 : 65) },
            repair: { r: isEasy ? 12 : (isHard ? 6 : 10), s: isEasy ? 2 : (isHard ? 8 : 4), xp: isEasy ? 30 : (isHard ? 100 : 55) },
            play:   { r: isEasy ? 20 : (isHard ? 10 : 18), s: isEasy ? 8 : (isHard ? 25 : 15), xp: isEasy ? 100 : (isHard ? 350 : 150) }
        },
        // 2. รางวัลไอเทมบนแมพ (Rewards) - [เหรียญ, เวลาแสดงผล]
        rewards: {
            legendary_tokens: isHard ? 2000 : (isEasy ? 500 : 1000),
            legendary_time: isEasy ? 45 : (isHard ? 20 : 30),
            legendary_rate: isEasy ? 4 : (isHard ? 1 : 2), 
            rare_tokens: isHard ? 500 : (isEasy ? 150 : 300),
            rare_time: isEasy ? 20 : (isHard ? 10 : 15),
            rare_rate: isEasy ? 25 : (isHard ? 8 : 15) 
        },
        // 3. ภารกิจรายวัน (Quests)
        // ตั้งเป้า 1M(H) / 700k(N) / 500k(E)
        quests: {
            target_feed: isEasy ? 2 : (isHard ? 8 : 4),
            target_clean: isEasy ? 1 : (isHard ? 6 : 3),
            target_play: isEasy ? 1 : (isHard ? 3 : 2),
            reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.4), // Gap 1.0 -> 1.4 -> 2.5
            base_tokens: isEasy ? 300 : (isHard ? 400 : 430), // Multiply result -> H:1000, N:600, E:300
            base_score: isEasy ? 4000 : (isHard ? 6000 : 7150), // Multiply result -> H:15000, N:10000, E:4000
            // Special Quest Targets
            target_scoop: isEasy ? 3 : (isHard ? 15 : 8),
            target_fever: isEasy ? 1 : (isHard ? 4 : 2),
            target_spend: isEasy ? 500 : (isHard ? 2000 : 1000)
        },
        // 4. ร้านค้า (Shop Economy)
        // ปรับให้สอดคล้องกับพฤติกรรม: "รวยขึ้นแต่ต้องจ่ายเพื่อปั๊มแต้ม"
        shop: {
            small_tokens: isHard ? 600 : 450, small_amount: 50,
            medium_tokens: isHard ? 1400 : 1000, medium_amount: 120,
            large_tokens: isHard ? 3200 : 2500, large_amount: 300
        },
        // 5. กลไกหลัก (Mechanics)
        // กฎ 1-2-10: รอ 1 นาที สนุก 10 นาที (ในโหมดปกติ)
        mechanics: {
            dec_hunger: isHard ? 0.18 : (isEasy ? 0.04 : 0.08), 
            dec_clean:  isHard ? 0.10 : (isEasy ? 0.02 : 0.05),
            dec_happy:  isHard ? 0.12 : (isEasy ? 0.03 : 0.06),
            reg_stamina: isEasy ? 1.2 : (isHard ? 0.45 : 0.75), 
            sp_min: isHard ? 15 : (isEasy ? 30 : 20),
            sp_max: isHard ? 45 : (isEasy ? 90 : 60),
            rare_rate: isHard ? 12 : (isEasy ? 5 : 8),
            // สเปคการดรอป: จำกัดรวม 6 ชิ้น และอยู่นานขึ้นเพื่อให้เก็บทัน (AFK Friendly)
            poop_lifetime: isEasy ? 300 : (isHard ? 90 : 180), 
            reward_lifetime: isEasy ? 240 : (isHard ? 80 : 150),
            max_poops: 3, max_rewards: 3,
            dec_happy_poop: isHard ? 30 : (isEasy ? 5 : 15),
            fever_threshold: isEasy ? 70 : (isHard ? 90 : 80),
            fever_mult: isEasy ? 2.0 : (isHard ? 1.5 : 1.8)
        },
        // 6. บัฟและไอเทมเสริม (Boosters) - [ราคา, ตัวคูณ, ระยะเวลา(นาที)]
        boosters: {
            score: { cost: 300, mult: 1.10, duration: 15 }, // +10% Score / 15m
            decay: { cost: 450, mult: 0.80, duration: 20 }, // -20% Hunger Decay / 20m
            luck:  { cost: 500, mult: 1.50, duration: 10 }  // x1.5 Rare Rate / 10m
        },
        // 7. ฟิสิกส์ (Physics)
        physics: {
            speed: isHard ? baseSpeed * 1.15 : baseSpeed,
            scale: baseScale
        },
        // 8. รางวันเช็คอินรายวัน (Login Rewards)
        login_rewards: [
            { day: 1, tokens: 100 },
            { day: 2, tokens: 150 },
            { day: 3, tokens: 200 },
            { day: 4, tokens: 250 },
            { day: 5, tokens: 300 },
            { day: 6, tokens: 400 },
            { day: 7, tokens: 1000 }
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
    quests: { feed: 0, feed_max: 3, clean: 0, clean_max: 2, play: 0, play_max: 1, special: { type: 'scoop', target: 5, current: 0, label: 'ช้อนอึทองคำ', icon: '💩' }, claimed: false },
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
    STATE.quests = { feed: 0, feed_max: 3, clean: 0, clean_max: 2, play: 0, play_max: 1, special: { type: 'scoop', target: 5, current: 0, label: 'ช้อนอึทองคำ', icon: '💩' }, claimed: false };
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
                console.log(`NEW SEASON DETECTED! Resetting from S${playerSeason} to S${globalSeason}`);
                
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
                
                // รีเซ็ตภารกิจ
                STATE.quests = { 
                    feed: 0, feed_max: 3, clean: 0, clean_max: 2, play: 0, play_max: 1, 
                    special: STATE.quests.special, // รักษาชนิด Quest พิเศษไว้
                    claimed: false 
                };
                
                // บันทึกทับทันทีเพื่อให้ข้อมูลบน Cloud เป็นซีซั่นใหม่
                savePetState(currentUserId, STATE);
                
                if (window.spawn) {
                    window.spawn(`🎉 เริ่มต้นซีซั่นใหม่ ${STATE.config.season_name}! (เริ่มเก็บสะสมใหม่กัน!)`, "text-neon-pink font-black");
                }
            }
        }
    }
}

function mergeSaveData(d) {
    if (d.username || d.pet_name) STATE.username = d.username || d.pet_name;
    if (d.pin_code) STATE.pin_code = d.pin_code;
    STATE.tokens = d.tokens ?? 500;
    STATE.score = d.score ?? 0;
    STATE.hunger = d.hunger ?? 80;
    STATE.clean = d.clean ?? 80;
    STATE.stamina = d.stamina ?? 100;
    STATE.love = d.love ?? 50;
    STATE.xp = d.xp ?? 0;
    STATE.level = d.level ?? 1;
    STATE.maxExp = d.maxExp ?? 100;
    STATE.current_season = d.current_season ?? d.season_number ?? 1;
    STATE.carrying_rock = d.carrying_rock ?? 0;
    if (d.boss_skills) STATE.boss_skills = d.boss_skills;
    if (d.inventory) STATE.inventory = d.inventory;
    if (d.quests || d.quests_data) STATE.quests = d.quests || d.quests_data;
    if (d.buffs || d.buffs_data) STATE.buffs = d.buffs || d.buffs_data;
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

export function saveState(isSync = false) {
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
    
    localStorage.setItem('PW3D_SAVE_' + currentUserId, JSON.stringify(data));
    
    if (currentUserId !== "GUEST_USER") {
        savePetState(currentUserId, STATE).catch(e => console.error("Cloud Save Fail: ", e));
    }

    // กระจายข้อมูลให้หน้าจออื่นทราบ โดยระบุสิทธิ์ความเป็นเจ้าของ
    if (!isSync) {
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
