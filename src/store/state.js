import { loadPetState, savePetState, loadGameConfig, logSeasonHistory } from '../services/supabase.js';

// --- ⚙️ Hyper-Granular Settings Factory (Sync with admin.js) ---
const createDefaultSettings = (template, diff) => {
    const isHard = diff === 'hard';
    const isEasy = diff === 'easy';
    
    // ตั้งค่าพื้นฐานตามชนิดตัวละคร (Physics Base)
    const baseSpeed = template === 'car' ? 0.085 : (template === 'plant' ? 0 : 0.055);
    const baseScale = template === 'car' ? 0.4 : (template === 'plant' ? 1.2 : 1.0);

    return {
        // 1. กิจกรรม (Activities) - [+ฟื้นฟู, -ใช้ไฟ, XP]
        activities: {
            feed:   { r: isEasy ? 18 : (isHard ? 6 : 12), s: isEasy ? 5 : (isHard ? 15 : 8), xp: isEasy ? 15 : (isHard ? 25 : 20) },
            clean:  { r: isEasy ? 20 : (isHard ? 7 : 14), s: isEasy ? 4 : (isHard ? 12 : 6), xp: isEasy ? 12 : (isHard ? 20 : 15) },
            repair: { r: isEasy ? 15 : (isHard ? 5 : 10), s: isEasy ? 3 : (isHard ? 10 : 5), xp: isEasy ? 10 : (isHard ? 15 : 12) },
            play:   { r: isEasy ? 18 : (isHard ? 6 : 10), s: isEasy ? 8 : (isHard ? 25 : 15), xp: isEasy ? 25 : (isHard ? 45 : 35) }
        },
        // 2. รางวัล (Rewards) - [เหรียญ, เวลาแสดงผล, โอกาสเกิด]
        rewards: {
            legendary_tokens: isEasy ? 600 : (isHard ? 200 : 350),
            legendary_time: isEasy ? 45 : (isHard ? 20 : 30),
            legendary_rate: isEasy ? 8 : (isHard ? 2 : 4), // % โอกาสเกิด Legendary จากกล่องสุ่ม
            rare_tokens: isEasy ? 200 : (isHard ? 80 : 120),
            rare_time: isEasy ? 20 : (isHard ? 10 : 15),
            rare_rate: isEasy ? 30 : (isHard ? 10 : 18) // % โอกาสเกิด Rare จากกล่องสุ่ม
        },
        // 3. ภารกิจ (Quests)
        quests: {
            target_feed: isEasy ? 3 : (isHard ? 12 : 6),
            target_clean: isEasy ? 2 : (isHard ? 10 : 5),
            target_play: isEasy ? 1 : (isHard ? 6 : 3),
            reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.8), // รางวัลโหมด Hard จะมีมูลค่าสูงกว่า
            base_tokens: 200,
            base_score: 2000
        },
        // 4. ร้านค้า (Shop)
        shop: {
            small_tokens: isHard ? 650 : 500, small_amount: isHard ? 40 : 50,
            medium_tokens: isHard ? 1200 : 1000, medium_amount: isHard ? 85 : 110,
            large_tokens: isHard ? 2800 : 2200, large_amount: isHard ? 180 : 250
        },
        // 5. กลไกหลัก (Mechanics)
        mechanics: {
            dec_hunger: isHard ? 0.22 : (isEasy ? 0.05 : 0.11), // เพิ่มความเร็วในการลด
            dec_clean:  isHard ? 0.12 : (isEasy ? 0.03 : 0.07),
            dec_happy:  isHard ? 0.18 : (isEasy ? 0.03 : 0.09),
            reg_stamina: isEasy ? 0.8 : (isHard ? 0.25 : 0.50), // โหมด Hard ฟื้นตัวช้าลงมาก
            sp_min: isHard ? 20 : (isEasy ? 10 : 20),
            sp_max: isHard ? 60 : (isEasy ? 30 : 50),
            rare_rate: isHard ? 3 : (isEasy ? 18 : 10), 
            dec_happy_poop: isHard ? 35 : (isEasy ? 5 : 15),
            fever_threshold: isEasy ? 70 : (isHard ? 95 : 85),
            fever_mult: isEasy ? 2.0 : (isHard ? 1.2 : 1.5),
            poop_lifetime: isHard ? 10 : (isEasy ? 60 : 25),
            reward_lifetime: isHard ? 8 : (isEasy ? 40 : 15),
            max_poops: isHard ? 15 : (isEasy ? 5 : 10),
            max_rewards: isHard ? 8 : (isEasy ? 3 : 5)
        },
        // 6. ฟิสิกส์ (Physics)
        physics: {
            speed: isHard ? baseSpeed * 0.95 : baseSpeed,
            scale: isHard ? baseScale * 0.85 : baseScale
        }
    };
};

export const STATE = {
    username: "ผู้เล่นทั่วไป",
    pin_code: "",
    tokens: 500,  
    score: 0,     
    hunger: 80, clean: 80, stamina: 100, love: 50,
    maxStamina: 100, xp: 0, level: 1, maxExp: 100,
    current_season: 1, // ซีซั่นล่าสุดที่ผู้เล่นคนนี้เล่นล่าสุด
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
    buffs: { regen: 1.0, regen_expiry: 0 },
    inventory: { skins: [], equipped_skins: {} }
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
    STATE.tokens = 500; STATE.score = 0; STATE.hunger = 80; STATE.clean = 80; STATE.stamina = 100; STATE.love = 50;
    STATE.xp = 0; STATE.level = 1; STATE.maxExp = 100;
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
    if (d.inventory) STATE.inventory = d.inventory;
    if (d.quests || d.quests_data) STATE.quests = d.quests || d.quests_data;
    if (d.buffs || d.buffs_data) STATE.buffs = d.buffs || d.buffs_data;
}

const SYNC_CHANNEL = new BroadcastChannel('like-gotchi-state-sync');

SYNC_CHANNEL.onmessage = (event) => {
    if (event.data && event.data.type === 'STATE_UPDATED') {
        const d = event.data.state;
        // Merge incoming state without re-triggering save
        mergeSaveData(d);
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
        quests: STATE.quests, buffs: STATE.buffs, inventory: STATE.inventory
    };
    
    localStorage.setItem('PW3D_SAVE_' + currentUserId, JSON.stringify(data));
    
    if (currentUserId !== "GUEST_USER") {
        savePetState(currentUserId, STATE).catch(e => console.error("Cloud Save Fail: ", e));
    }

    // กระจายข้อมูลให้หน้าจออื่นทราบ (ถ้าไม่ได้เกิดจากการ Sync รับมา)
    if (!isSync) {
        SYNC_CHANNEL.postMessage({ type: 'STATE_UPDATED', state: data });
    }
}

// ฟังก์ชันดึง Config ปัจจุบันจาก Matrix
export function getActiveConfig() {
    const t = STATE.config.template || 'pet';
    const d = STATE.config.difficulty_mode || 'normal';
    
    if (!STATE.config.matrix[t]) return createDefaultSettings(t, d);
    if (!STATE.config.matrix[t][d]) return createDefaultSettings(t, d);
    
    return STATE.config.matrix[t][d];
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
