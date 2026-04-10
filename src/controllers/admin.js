import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const STATE = { 
    template: 'pet', 
    sky: 'day', 
    ground: 'grass',
    difficulty_mode: 'normal',
    // Default values
    max_stamina: 100,
    reg_stamina: 0.5,
    poop_min: 20,
    poop_max: 50,
    reward_min: 30,
    reward_max: 90,
    cost_feed: 10,
    cost_clean: 8,
    cost_repair: 5,
    cost_play: 12,
    rst_feed: 15,
    rxp_feed: 5,    // ลดจาก 15
    rst_clean: 20,
    rxp_clean: 5,   // ลดจาก 10
    rst_play: 10,
    rxp_play: 10,   // ลดจาก 25
    rst_repair: 10,
    rxp_repair: 6,  // ลดจาก 12
    fever_threshold: 80,
    rare_rate: 10,
    q_special_mult: 1.5,
    qt_scoop: 10,
    qt_fever: 2,
    qt_love: 10,
    qt_spend: 100,
    q_feed: 5,
    q_clean: 5,
    q_play: 5,
    dec_hunger: 0.12,
    dec_clean: 0.06,
    dec_happy: 0.08,
    // Newly added for full control
    season_name: 'Season 1',
    season_weeks: 1,
    shop_s_cost: 500,
    shop_s_amt: 50,
    shop_m_cost: 900,
    shop_m_amt: 100,
    shop_l_cost: 2000,
    shop_l_amt: 250,
    rare_xp_mult: 3,
    fever_mult: 1.5,
    rscore_scoop: 20,
    rare_token_min: 20,
    rare_token_max: 50,
    custom_model: '',
    // World Limits
    poop_lifetime: 30,
    reward_lifetime: 20,
    max_poops: 3,
    max_rewards: 3,
    // Reward Rarity (NEW)
    rew_rare_rate: 20,
    rew_legend_rate: 5,
    rew_common_tokens: 10,
    rew_rare_tokens: 50,
    rew_legend_tokens: 250
};

let miniEngines = []; // Track active mini 3D scenes

const VARIANTS = {
    pet: [
        { id: 'cat-toon', name: 'Toon Cat', path: '/toon_cat_free.glb', icon: '🐱', type: 'glb' },
        { id: 'cat-bicolor', name: 'Bicolor Cat', path: '/bicolor_cat.glb', icon: '🐈', type: 'glb' },
        { id: 'cat-pet', name: 'Pet Cat', path: '/pet_cat.glb', icon: '🧶', type: 'glb' }
    ],
    car: [
        { id: 'car-sport', name: 'Sport Car', path: '', icon: '🏎️', type: 'procedural' }
    ],
    plant: [
        { id: 'plant-pot', name: 'Small Pot', path: '', icon: '🪴', type: 'procedural' }
    ]
};

function highlightDiff() {
    ['easy', 'normal', 'hard'].forEach(k => {
        const el = $(`diff-${k}`);
        if (el) el.classList.toggle('active', k === STATE.difficulty_mode);
    });
}

function highlightTpl() {
    ['pet', 'car', 'plant'].forEach(k => {
        const el = $(`btn-tpl-${k}`);
        if (el) el.classList.toggle('active', k === STATE.template);
    });
}

function loadConfig() {
    const c = localStorage.getItem('pw3d_config');
    if (c) {
        const parsed = JSON.parse(c);
        // ล้าง Path เก่าที่ชี้ไปที่โฟลเดอร์เก่า (ซึ่งไม่มีอยู่แล้ว)
        if (parsed.custom_model && (parsed.custom_model.includes('/models/pet/') || parsed.custom_model.includes('/models/car/') || parsed.custom_model.includes('/models/plant/'))) {
            const filename = parsed.custom_model.split('/').pop();
            parsed.custom_model = '/' + filename;
        }
        Object.assign(STATE, parsed);
    }
    
    // Map STATE to DOM
    Object.keys(STATE).forEach(key => {
        const el = $(`cfg-${key.replace(/_/g, '-')}`);
        if(el) el.value = STATE[key];
    });

    highlightTpl();
    highlightDiff();
    
    // Attach live preview events
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', sendPreview);
    });
}

function getConfigObject() {
    // Start with a clean copy of STATE
    const obj = JSON.parse(JSON.stringify(STATE));
    
    // Override with any form values that exist
    Object.keys(STATE).forEach(key => {
        const el = $(`cfg-${key.replace(/_/g, '-')}`);
        if(el) {
            const val = el.value;
            if (el.type === 'number') obj[key] = parseFloat(val);
            else if (el.tagName === 'SELECT' && !isNaN(val)) obj[key] = parseFloat(val);
            else obj[key] = val;
        }
    });
    
    // Explicitly ensure custom_model is included from STATE (since UI is gone)
    obj.custom_model = STATE.custom_model;
    
    return obj;
}

function sendPreview() {
    const config = getConfigObject();
    document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'PW3D_PREVIEW', config }, '*');
        }
    });
}

import { supabase } from '../services/supabase.js';

window.saveAll = async () => {
    const config = getConfigObject();
    
    // 1. เก็บลงเครื่อง (LocalStorage) 
    localStorage.setItem('pw3d_config', JSON.stringify(config));
    
    const btn = document.querySelector('.btn-save');
    if (!btn) return;
    const oldText = btn.innerText;
    btn.innerText = '⏳ กำลังซิงค์ข้อมูล...';

    // 2. ทำความสะอาดข้อมูล (Data Cleaning)
    // ส่งเฉพาะฟิลด์ที่มีคอลัมน์รองรับในฐานข้อมูลเท่านั้น เพื่อป้องกัน Error 400
    const DB_COLUMNS = [
        'id', 'template', 'sky', 'ground', 'difficulty_mode', 'max_stamina', 'reg_stamina', 
        'poop_min', 'poop_max', 'reward_min', 'reward_max', 'cost_feed', 'cost_clean', 
        'cost_repair', 'cost_play', 'rst_feed', 'rxp_feed', 'rst_clean', 'rxp_clean', 
        'rst_play', 'rxp_play', 'rst_repair', 'rxp_repair', 'fever_threshold', 'rare_rate', 
        'q_special_mult', 'qt_scoop', 'qt_fever', 'qt_love', 'qt_spend', 'q_feed', 
        'q_clean', 'q_play', 'dec_hunger', 'dec_clean', 'dec_happy', 'season_name', 
        'season_weeks', 'shop_s_cost', 'shop_s_amt', 'shop_m_cost', 'shop_m_amt', 
        'shop_l_cost', 'shop_l_amt', 'rare_xp_mult', 'fever_mult', 'rscore_scoop', 
        'rare_token_min', 'rare_token_max', 'custom_model', 'poop_lifetime', 
        'reward_lifetime', 'max_poops', 'max_rewards',
        'rew_rare_rate', 'rew_legend_rate', 'rew_common_tokens', 'rew_rare_tokens', 'rew_legend_tokens'
    ];

    const payload = {};
    DB_COLUMNS.forEach(col => {
        if (config[col] !== undefined) payload[col] = config[col];
    });
    payload.id = 'production_config';
    payload.updated_at = new Date().toISOString();

    // 3. ส่งขึ้น Cloud (Supabase)
    const { error } = await supabase
        .from('game_configs')
        .upsert(payload);

    if (error) {
        console.error("Supabase Sync Error:", error);
        btn.innerText = '❌ ผิดพลาด (ดูหน้าต่าง Console)';
        btn.style.background = '#ef4444';
    } else {
        btn.innerText = '✅ บันทึกขึ้น Cloud สำเร็จ!';
        btn.style.background = '#10b981';
        if (window.twemoji) twemoji.parse(btn);
    }

    setTimeout(() => {
        btn.innerText = oldText;
        btn.style.background = ''; 
    }, 2500);

    sendPreview();
};

window.setTemplate = (type) => { 
    STATE.template = type; 
    // Reset custom model if we switch template manually via top icons
    STATE.custom_model = ''; 
    highlightTpl(); 
    renderGallery();
    sendPreview(); 
    saveAll();
};

function renderGallery() {
    const container = $('variant-gallery');
    if(!container) return;
    
    // Stop & Cleanup old engines
    miniEngines.forEach(e => { e.stop = true; if(e.renderer) e.renderer.dispose(); });
    miniEngines = [];

    const list = VARIANTS[STATE.template] || [];
    container.innerHTML = list.map(v => `
        <div onclick="selectVariant('${v.path}')" class="group cursor-pointer">
            <div id="card-${v.id}" class="aspect-square rounded-2xl bg-white/5 border ${STATE.custom_model === v.path ? 'border-neon-purple shadow-[0_0_15px_rgba(139,92,246,0.3)] bg-neon-purple/10' : 'border-white/5'} flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all p-0 relative overflow-hidden">
                <!-- 3D Preview Canvas Layer -->
                <div id="preview-${v.id}" class="absolute inset-0 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity"></div>
                
                <div class="z-10 mt-auto mb-3 px-3 py-1 bg-black/40 rounded-full border border-white/5 backdrop-blur-md">
                     <div class="text-[9px] font-black uppercase text-white/80 tracking-widest text-center">${v.name}</div>
                </div>
                ${v.path === '' ? '<div class="absolute -top-1 -right-4 bg-neon-purple/30 text-neon-purple text-[7px] font-black px-5 py-2 rotate-45 z-20">DEF</div>' : ''}
            </div>
        </div>
    `).join('');

    if (window.twemoji) twemoji.parse(container);

    // Init 3D for each card
    setTimeout(() => {
        list.forEach(v => initMiniPreview(v));
    }, 100);
}

window.selectVariant = (path) => {
    STATE.custom_model = path;
    
    renderGallery();
    sendPreview();
    saveAll();
};

function initMiniPreview(v) {
    const parent = $(`preview-${v.id}`);
    if (!parent || !v.path) {
         if (parent) parent.innerHTML = `<div class="flex items-center justify-center h-full text-4xl opacity-20">${v.icon}</div>`;
         return;
    }

    const engine = { stop: false };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 1.2, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(parent.clientWidth, parent.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    parent.appendChild(renderer.domElement);
    engine.renderer = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);
    const point = new THREE.PointLight(0xffffff, 1.5);
    point.position.set(2, 2, 2);
    scene.add(point);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Force relative path to avoid 404 in some proxy environments
    const modelPath = v.path.startsWith('/') ? v.path.substring(1) : v.path;

    new GLTFLoader().load(modelPath, g => {
        const m = g.scene;
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.6 / (maxDim || 1);
        m.scale.set(scale, scale, scale);
        m.position.sub(center.multiplyScalar(scale));
        m.position.y -= 0.5;
        
        if (g.animations && g.animations.length > 0) {
            engine.mixer = new THREE.AnimationMixer(m);
            const idle = g.animations.find(a => a.name.toLowerCase().includes('idle') || a.name.toLowerCase().includes('wait'));
            if (idle) engine.mixer.clipAction(idle).play();
            else engine.mixer.clipAction(g.animations[0]).play();
        }
        modelGroup.add(m);
    }, undefined, (err) => {
        console.error("Loader Error for", modelPath, err);
        parent.innerHTML = `<div class="flex items-center justify-center h-full text-4xl opacity-20">${v.icon}</div>`;
    });

    const clock = new THREE.Clock();
    const anim = () => {
        if (engine.stop) return;
        requestAnimationFrame(anim);
        const delta = clock.getDelta();
        if (engine.mixer) engine.mixer.update(delta);
        modelGroup.rotation.y += 0.01;
        renderer.render(scene, camera);
    };
    anim();
    miniEngines.push(engine);
}

window.loadPreset = (mode) => {
    const presets = {
        // ═══════════════════════════════════════════════
        // 🟢 EASY MODE — สบายๆ ดูแลง่าย เหมาะกับเด็กหรือเล่นผ่อนคลาย
        // พลังงาน/ชม: 720 | ต้องใช้/ชม: ~80 (11% utilization)
        // "รอ 25 วิ ก็กดได้อีกรอบ"
        // ═══════════════════════════════════════════════
        easy: {
            difficulty_mode: 'easy',
            dec_hunger: 0.05, dec_clean: 0.03, dec_happy: 0.03,
            reg_stamina: 1.0, max_stamina: 150, 
            cost_feed: 5, cost_clean: 5, cost_repair: 2, cost_play: 8,
            rst_feed: 25, rst_clean: 30, rst_play: 15, rst_repair: 20,
            rxp_feed: 8, rxp_clean: 6, rxp_play: 15, rxp_repair: 8,
            poop_min: 120, poop_max: 300, reward_min: 90, reward_max: 200,
            rare_rate: 10, rare_xp_mult: 1.5, fever_threshold: 70, fever_mult: 1.2,
            rscore_scoop: 10, q_special_mult: 1.2,
            poop_lifetime: 60, reward_lifetime: 45, max_poops: 2, max_rewards: 5,
            // Balanced Reward Rarity for EASY
            rew_rare_rate: 15, rew_legend_rate: 3,
            rew_common_tokens: 20, rew_rare_tokens: 100, rew_legend_tokens: 300
        },
        // ═══════════════════════════════════════════════
        // 🟡 NORMAL MODE — สมดุลที่สุด เข้ามาดูทุก 5-10 นาที
        // พลังงาน/ชม: 360 | ต้องใช้/ชม: ~156 (43% utilization)
        // "รอ ~2 นาที ก็กดได้อีกรอบ"
        // ═══════════════════════════════════════════════
        normal: {
            difficulty_mode: 'normal',
            dec_hunger: 0.12, dec_clean: 0.06, dec_happy: 0.08,
            reg_stamina: 0.5, max_stamina: 100,
            cost_feed: 10, cost_clean: 8, cost_repair: 5, cost_play: 12,
            rst_feed: 15, rst_clean: 20, rst_play: 10, rst_repair: 10,
            rxp_feed: 5, rxp_clean: 5, rxp_play: 10, rxp_repair: 6,
            poop_min: 45, poop_max: 120, reward_min: 60, reward_max: 150,
            rare_rate: 15, rare_xp_mult: 1.2, fever_threshold: 80, fever_mult: 1.5,
            rscore_scoop: 20, q_special_mult: 1.5,
            poop_lifetime: 30, reward_lifetime: 20, max_poops: 3, max_rewards: 3,
            // Balanced Reward Rarity for NORMAL
            rew_rare_rate: 20, rew_legend_rate: 5,
            rew_common_tokens: 10, rew_rare_tokens: 50, rew_legend_tokens: 250
        },
        // ═══════════════════════════════════════════════
        // 🔴 HARD MODE — ท้าทาย ต้องบริหารทรัพยากรอย่างระมัดระวัง
        // พลังงาน/ชม: 252 | ต้องใช้ขั้นต่ำ/ชม: ~190 (75% utilization)
        // "รอ ~3-4 นาที ต่อ 1 แอคชั่น" + ปริมาณถูกจำกัด
        // ชดเชย: รางวัลแรร์มากกว่า 2 เท่า + เหรียญเยอะกว่า
        // ═══════════════════════════════════════════════
        hard: {
            difficulty_mode: 'hard',
            dec_hunger: 0.18, dec_clean: 0.09, dec_happy: 0.12,
            reg_stamina: 0.35, max_stamina: 80,
            cost_feed: 15, cost_clean: 12, cost_repair: 8, cost_play: 18,
            rst_feed: 12, rst_clean: 18, rst_play: 8, rst_repair: 10,
            rxp_feed: 3, rxp_clean: 3, rxp_play: 5, rxp_repair: 4,
            poop_min: 30, poop_max: 60, reward_min: 30, reward_max: 90,
            rare_rate: 30, rare_xp_mult: 1.0, fever_threshold: 90, fever_mult: 2.0,
            rare_token_min: 80, rare_token_max: 150,
            rscore_scoop: 50, q_special_mult: 3.0,
            poop_lifetime: 20, reward_lifetime: 15, max_poops: 5, max_rewards: 2,
            // Balanced Reward Rarity for HARD (High Risk, High Reward Jackpot)
            rew_rare_rate: 25, rew_legend_rate: 10,
            rew_common_tokens: 5, rew_rare_tokens: 150, rew_legend_tokens: 1000
        }
    };

    const p = presets[mode];
    if(!p) return;

    Object.assign(STATE, p);
    
    // Sync all STATE to DOM
    Object.keys(STATE).forEach(key => {
        const el = $(`cfg-${key.replace(/_/g, '-')}`);
        if(el) el.value = STATE[key];
    });

    highlightDiff();
    sendPreview();
};

window.toggleSection = (id) => {
    const sec = $(id);
    if(sec) sec.classList.toggle('section-collapsed');
};
const renderAll = () => {
    loadConfig();
    renderGallery();
    if(window.twemoji) twemoji.parse(document.body);
};
renderAll();
