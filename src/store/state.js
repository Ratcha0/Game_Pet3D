import { loadPetState, savePetState, loadGameConfig } from '../services/supabase.js';

export const STATE = {
    username: "ผู้เล่นทั่วไป", // สำหรับแสดงที่ HUD
    pin_code: "", // ว่างไว้เพื่อให้ผู้ใช้ตั้งค่าเองครั้งแรก
    tokens: 500,  
    score: 0,     
    hunger: 80, clean: 80, stamina: 100, love: 50,
    maxStamina: 100, xp: 0, level: 1, maxExp: 100,
    config: {
        template: 'pet', sky: 'day', ground: 'grass',
        season_name: 'Season 1', season_weeks: 1,
        costs: { feed: 10, clean: 8, repair: 5, play: 12 },
        shop: {
            small: { cost: 500, amt: 50 },
            medium: { cost: 900, amt: 100 },
            large: { cost: 2000, amt: 250 }
        },
        available_skins: [
            { id: 'cat-toon', template: 'pet', name: 'Classic Cat', desc: 'แมวหน้าบูดคู่บุญ', icon: '🐱', cost: 0, model: '/toon_cat_free.glb', colorCls: 'neon-gold', scale: 1.0, drop_type: 'poop', drop_offset: {x: 0, y: 0, z: -0.2} },
            { id: 'plant-stylized', template: 'plant', name: 'Classic Tree', desc: 'ต้นไม้แห้งๆ', icon: '🌳', cost: 0, model: '/stylized_tree.glb', colorCls: 'emerald', scale: 1.0, drop_type: 'leaves', drop_offset: {x: 0, y: 0, z: 0} },
            { id: 'car-carton', template: 'car', name: 'Classic Car', desc: 'รถบังคับสุดจ๊าบ', icon: '🚗', cost: 0, model: '/car_carton.glb', colorCls: 'emerald', rotationY: 3.14159, scale: 1.0, drop_type: 'oil', drop_offset: {x: 0, y: 0.1, z: -0.5} },
            { id: 'cyberpunk_car', template: 'car', name: 'Cyberpunk 2077', desc: 'รถโลกอนาคตสุดเท่', icon: '🚀💨', cost: 5000, model: '/cyberpunk_car.glb', colorCls: 'neon-cyan', scale: 0.75, drop_type: 'smoke', drop_offset: {x: 0, y: 0.2, z: -0.8} }
        ],
        mechanics: {}
    },
    quests: {
        feed: 0, feed_max: 3,
        clean: 0, clean_max: 2,
        play: 0, play_max: 1,
        special: { type: 'scoop', target: 5, current: 0, label: 'ช้อนอึทองคำ', icon: '💩' },
        claimed: false
    },
    buffs: {
        regen: 1.0,
        regen_expiry: 0
    },
    inventory: { skins: [], equipped_skins: {} }
};

export const SPECIAL_QUEST_POOL = [
    { type: 'scoop', label: 'นักช้อนมือทอง', icon: '💩', targetIcon: '🏆' },
    { type: 'fever', label: 'สายลุยฟีเวอร์', icon: '🔥', targetIcon: '🌟' },
    { type: 'pure_love', label: 'หัวใจเต็มร้อย', icon: '💖', targetIcon: '👑' },
    { type: 'spend', label: 'ก้าวข้ามขีดจำกัด', icon: '⚡', targetIcon: '🏃' }
];

// 💡 USER ID (จะรับเข้ามาจากโปรเจกต์หลัก)
export let currentUserId = "GUEST_USER"; 

export function setUserId(id) {
    currentUserId = id;
}

export function resetStateToDefaults() {
    STATE.username = "ผู้เล่นทั่วไป";
    STATE.pin_code = "";
    STATE.tokens = 500;
    STATE.score = 0;
    STATE.hunger = 80;
    STATE.clean = 80;
    STATE.stamina = 100;
    STATE.love = 50;
    STATE.xp = 0;
    STATE.level = 1;
    STATE.maxExp = 100;
    STATE.quests = {
        feed: 0, feed_max: 3,
        clean: 0, clean_max: 2,
        play: 0, play_max: 1,
        special: { type: 'scoop', target: 5, current: 0, label: 'ช้อนอึทองคำ', icon: '💩' },
        claimed: false
    };
    STATE.buffs = { regen: 1.0, regen_expiry: 0 };
    STATE.inventory = { skins: [], equipped_skins: {} };
}

export async function loadState() {
    // 0. Reset ค่าปัจจุบันทิ้งก่อน เพื่อป้องกันข้อมูลคนเก่าค้าง
    resetStateToDefaults();

    // 1. ดึงจาก LocalStorage ก่อน (เผื่อไม่มีเน็ต)
    const storageKey = 'PW3D_SAVE_' + currentUserId;
    const s = localStorage.getItem(storageKey);
    if (s) {
        mergeSaveData(JSON.parse(s));
    }

    // 2. โหลด Config จาก Cloud (ค่าที่ Admin ตั้งไว้)
    await loadGameConfigCloud();

    // 3. ดึงจาก Supabase (ถ้ามีข้อมูลใน Cloud ให้ทับ LocalStorage ทันที)
    if (currentUserId !== "GUEST_USER") {
        const { data, error } = await loadPetState(currentUserId);
        if (data) {
            mergeSaveData(data);
        }
    }
}

function mergeSaveData(d) {
    if (d.username) STATE.username = d.username;
    if (d.pet_name) STATE.username = d.pet_name; // รองรับกรณีโหลดจาก Supabase
    if (d.pin_code) STATE.pin_code = d.pin_code;
    STATE.tokens = d.tokens ?? 500;
    STATE.score = d.score ?? 0;
    STATE.hunger = d.hunger ?? 80;
    STATE.clean = d.clean ?? 80;
    STATE.stamina = d.stamina ?? 100;
    STATE.love = d.love ?? 50;
    STATE.xp = d.xp ?? 0;
    STATE.level = d.level ?? 1;
    STATE.maxExp = d.maxExp ?? d.max_exp ?? 100;
    
    if (d.inventory) STATE.inventory = d.inventory;

    if (d.quests_data) STATE.quests = d.quests_data;
    else if (d.quests) STATE.quests = d.quests;

    if (d.buffs_data) STATE.buffs = d.buffs_data;
    else if (d.buffs) STATE.buffs = d.buffs;
}

export function saveState() {
    // 1. เซฟลง LocalStorage กันเหนียว
    const today = new Date().toDateString();
    const data = {
        username: STATE.username,
        pin_code: STATE.pin_code,
        tokens: Math.floor(STATE.tokens), score: Math.floor(STATE.score), 
        hunger: STATE.hunger, clean: STATE.clean, stamina: STATE.stamina,
        love: STATE.love, xp: STATE.xp, level: STATE.level, maxExp: STATE.maxExp,
        quests: STATE.quests, quest_date: today, buffs: STATE.buffs,
        inventory: STATE.inventory
    };
    const storageKey = 'PW3D_SAVE_' + currentUserId;
    localStorage.setItem(storageKey, JSON.stringify(data));

    // 2. โยนขึ้น Supabase (แบบไม่ Block UI)
    if (currentUserId !== "GUEST_USER") {
        savePetState(currentUserId, STATE).catch(e => console.error("Supabase Save Fail: ", e));
    }
}

export function applyConfigToState(p) {
    if (!p) return;
    STATE.config.template = p.template || 'pet';
    STATE.config.sky = p.sky || 'day';
    STATE.config.ground = p.ground || 'grass';
    STATE.config.season_name = p.season_name || 'Season 1';
    STATE.config.season_weeks = p.season_weeks || 1;
    STATE.config.difficulty_mode = p.difficulty_mode || 'normal';
    
    // ล้าง Path เก่า
    let cm = p.custom_model || '';
    if (cm.includes('/models/')) cm = '/' + cm.split('/').pop();
    STATE.config.custom_model = cm;
    
    STATE.maxStamina = Math.floor(p.max_stamina || 100);
    STATE.config.q_special_mult = p.q_special_mult || 1.5;

    STATE.config.costs = {
        feed: p.cost_feed ?? 10, clean: p.cost_clean ?? 8,
        repair: p.cost_repair ?? 5, play: p.cost_play ?? 12
    };
    STATE.config.shop = {
        small: { cost: p.shop_s_cost || 500, amt: p.shop_s_amt || 50 },
        medium: { cost: p.shop_m_cost || 900, amt: p.shop_m_amt || 100 },
        large: { cost: p.shop_l_cost || 2000, amt: p.shop_l_amt || 250 }
    };
    STATE.config.mechanics = {
        dec_hunger: p.dec_hunger ?? 0.12, dec_clean: p.dec_clean ?? 0.06, dec_happy: p.dec_happy ?? 0.08,
        reg_stamina: p.reg_stamina ?? 0.5, sp_min: p.poop_min ?? 20, sp_max: p.poop_max ?? 50,
        r_min: p.reward_min ?? 30, r_max: p.reward_max ?? 90, rare_rate: p.rare_rate ?? 10,
        rare_xp_mult: p.rare_xp_mult ?? 3, rare_token_min: p.rare_token_min ?? 20, rare_token_max: p.rare_token_max ?? 50,
        fever_threshold: p.fever_threshold ?? 80, fever_mult: p.fever_mult ?? 1.5,
        rst_feed: p.rst_feed ?? 15, rxp_feed: p.rxp_feed ?? 15, rst_play: p.rst_play ?? 10, rxp_play: p.rxp_play ?? 25,
        rst_clean: p.rst_clean ?? 20, rxp_clean: p.rxp_clean ?? 10, rst_repair: p.rst_repair ?? 10, rxp_repair: p.rxp_repair ?? 12,
        rscore_scoop: p.rscore_scoop ?? 20, poop_lifetime: p.poop_lifetime ?? 30, reward_lifetime: p.reward_lifetime ?? 20,
        max_poops: p.max_poops ?? 3, max_rewards: p.max_rewards ?? 3
    };
    STATE.config.q_feed = p.q_feed || 3;
    STATE.config.q_clean = p.q_clean || 2;
    STATE.config.q_play = p.q_play || 1;
    STATE.config.qt_scoop = p.qt_scoop || 10;
    STATE.config.qt_fever = p.qt_fever || 2;
    STATE.config.qt_love = p.qt_love || 10;
    STATE.config.qt_spend = p.qt_spend || 100;

    // Reward Rarity Settings (จาก Admin Dashboard)
    STATE.config.rew_rare_rate = p.rew_rare_rate ?? 20;
    STATE.config.rew_legend_rate = p.rew_legend_rate ?? 5;
    STATE.config.rew_common_tokens = p.rew_common_tokens ?? 10;
    STATE.config.rew_rare_tokens = p.rew_rare_tokens ?? 50;
    STATE.config.rew_legend_tokens = p.rew_legend_tokens ?? 250;
    
    // สำคัญ: ซิงค์คลังโมเดล (available_skins)
    if (p.available_skins) STATE.config.available_skins = p.available_skins;
}

export async function loadGameConfigCloud() {
    const { data, error } = await loadGameConfig('production_config');
    if (data) {
        applyConfigToState(data);
    }
}

export function loadAdminConfigLocal() {
    const c = localStorage.getItem('pw3d_config');
    if (c) applyConfigToState(JSON.parse(c));
}
