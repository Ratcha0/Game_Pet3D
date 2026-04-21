import '../styles.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { saveGameConfig, loadGameConfig } from '../services/supabase.js';

const $ = id => document.getElementById(id);

// --- ⚙️ Hyper-Granular Settings Factory ---
const createDefaultSettings = (template, diff) => {
    const isHard = diff === 'hard';
    const isEasy = diff === 'easy';
    
    // ตั้งค่าพื้นฐานตามชนิดตัวละคร (Physics Base)
    const baseSpeed = template === 'car' ? 0.085 : (template === 'plant' ? 0 : 0.055);
    const baseScale = template === 'plant' ? 1.2 : 1.0;

    return {
        // 1. กิจกรรม (Activities) - [+ฟื้นฟู, -ใช้ไฟ, XP]
        activities: {
            feed:   { r: isEasy ? 18 : (isHard ? 6 : 12), s: isEasy ? 5 : (isHard ? 15 : 8), xp: isEasy ? 15 : (isHard ? 25 : 20) },
            clean:  { r: isEasy ? 20 : (isHard ? 7 : 14), s: isEasy ? 4 : (isHard ? 12 : 6), xp: isEasy ? 12 : (isHard ? 20 : 15) },
            repair: { r: isEasy ? 15 : (isHard ? 5 : 10), s: isEasy ? 3 : (isHard ? 10 : 5), xp: isEasy ? 10 : (isHard ? 15 : 12) },
            play:   { r: isEasy ? 18 : (isHard ? 6 : 10), s: isEasy ? 8 : (isHard ? 25 : 15), xp: isEasy ? 25 : (isHard ? 45 : 35) }
        },
        // 2. รางวัล (Rewards) - [เหรียญ, เวลาแสดงผล]
        rewards: {
            legendary_tokens: isEasy ? 600 : (isHard ? 200 : 350),
            legendary_time: isEasy ? 45 : (isHard ? 20 : 30),
            rare_tokens: isEasy ? 200 : (isHard ? 80 : 120),
            rare_time: isEasy ? 20 : (isHard ? 10 : 15)
        },
        // 3. ภารกิจ (Quests)
        quests: {
            target_feed: isEasy ? 3 : (isHard ? 12 : 6),
            target_clean: isEasy ? 2 : (isHard ? 10 : 5),
            target_play: isEasy ? 1 : (isHard ? 6 : 3),
            reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.8),
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
            dec_hunger: isHard ? 0.22 : (isEasy ? 0.05 : 0.11),
            dec_clean:  isHard ? 0.12 : (isEasy ? 0.03 : 0.07),
            dec_happy:  isHard ? 0.18 : (isEasy ? 0.03 : 0.09),
            reg_stamina: isEasy ? 0.8 : (isHard ? 0.25 : 0.50),
            sp_min: isHard ? 20 : (isEasy ? 120 : 60),
            sp_max: isHard ? 60 : (isEasy ? 300 : 150),
            rare_rate: isHard ? 4 : (isEasy ? 20 : 10),
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

let ADMIN_STATE = {
    template: 'pet',
    difficulty_mode: 'normal',
    sky: 'day',
    ground: 'grass',
    custom_model: '',
    custom_rotation_y: 0,
    available_skins: [
        { id: 'cat-toon', template: 'pet', name: 'Classic Cat', desc: 'แมวหน้าบูดคู่บุญ', icon: '🐱', cost: 0, model: '/toon_cat_free.glb', colorCls: 'neon-gold', scale: 1.0, drop_type: 'poop', drop_offset: {x: 0, y: 0, z: -0.2} },
        { id: 'plant-stylized', template: 'plant', name: 'Classic Tree', desc: 'ต้นไม้แห้งๆ', icon: '🌳', cost: 0, model: '/stylized_tree.glb', colorCls: 'emerald', scale: 1.0, drop_type: 'leaves', drop_offset: {x: 0, y: 0, z: 0} },
        { id: 'car-carton', template: 'car', name: 'Classic Car', desc: 'รถบังคับสุดจ๊าบ', icon: '🚗', cost: 0, model: '/car_carton.glb', colorCls: 'emerald', rotationY: Math.PI, scale: 1.0, drop_type: 'oil', drop_offset: {x: 0, y: 0.1, z: -0.5} },
        { id: 'cyberpunk_car', template: 'car', name: 'Cyberpunk 2077', desc: 'รถโลกอนาคตสุดเท่', icon: '🚀💨', cost: 5000, model: '/cyberpunk_car.glb', colorCls: 'neon-cyan', scale: 0.75, drop_type: 'smoke', drop_offset: {x: 0, y: 0.2, z: -0.8} }
    ],
    matrix: {
        pet:   { easy: createDefaultSettings('pet', 'easy'),   normal: createDefaultSettings('pet', 'normal'),   hard: createDefaultSettings('pet', 'hard') },
        car:   { easy: createDefaultSettings('car', 'easy'),   normal: createDefaultSettings('car', 'normal'),   hard: createDefaultSettings('car', 'hard') },
        plant: { easy: createDefaultSettings('plant', 'easy'), normal: createDefaultSettings('plant', 'normal'), hard: createDefaultSettings('plant', 'hard') }
    }
};

let miniEngines = [];

// Helper สำหรับหาค่าใน Object แบบลึก (e.g. "mechanics.dec_hunger")
function getDeepValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

function setDeepValue(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const deepObj = parts.reduce((acc, part) => acc[part], obj);
    if (deepObj) deepObj[last] = value;
}

function highlightUI() {
    ['easy', 'normal', 'hard'].forEach(k => {
        const el = $(`diff-${k}`);
        if (el) el.classList.toggle('active', k === ADMIN_STATE.difficulty_mode);
    });
    ['pet', 'car', 'plant'].forEach(k => {
        const el = $(`btn-tpl-${k}`);
        if (el) el.classList.toggle('active', k === ADMIN_STATE.template);
    });
    $('cfg-sky').value = ADMIN_STATE.sky;
    $('cfg-ground').value = ADMIN_STATE.ground;
}

function syncInputsWithMatrix() {
    const config = ADMIN_STATE.matrix[ADMIN_STATE.template][ADMIN_STATE.difficulty_mode];
    
    // หา Input ทุกตัวที่มี data-path
    document.querySelectorAll('.matrix-input').forEach(el => {
        const path = el.dataset.path;
        if (path) {
            const val = getDeepValue(config, path);
            if (val !== undefined) el.value = val;

            // ผูก Event ให้บันทึกลง Matrix
            if (!el.dataset.bound) {
                el.addEventListener('input', (e) => {
                    const newVal = parseFloat(e.target.value);
                    setDeepValue(config, path, isNaN(newVal) ? e.target.value : newVal);
                    sendPreview();
                    saveLocal();
                });
                el.dataset.bound = "true";
            }
        }
    });

    // Support สำหรับค่าเก่าที่เป็น cfg- (สำหรับ Backward Compatibility)
    Object.keys(config).forEach(key => {
        if (typeof config[key] !== 'object') {
            const oldEl = $(`cfg-${key.replace(/_/g, '-')}`);
            if (oldEl) {
                oldEl.value = config[key];
                if (!oldEl.dataset.bound) {
                    oldEl.addEventListener('input', (e) => {
                        config[key] = parseFloat(e.target.value) || e.target.value;
                        sendPreview(); saveLocal();
                    });
                    oldEl.dataset.bound = "true";
                }
            }
        }
    });
}

function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] instanceof Object && key in target) {
            deepMerge(target[key], source[key]);
        } else {
            // Overwrite or add the key
            target[key] = source[key];
        }
    }
    return target;
}

function loadLocal() {
    const c = localStorage.getItem('pw3d_config');
    if (c) {
        try {
            const parsed = JSON.parse(c);
            deepMerge(parsed.matrix, ADMIN_STATE.matrix);
            Object.assign(ADMIN_STATE, parsed);
        } catch(e) { console.error("Config corrupt", e); }
    }
}

window.resetCurrentMatrix = () => {
    if(confirm(`ยืนยันการคืนค่าเริ่มต้นสำหรับ ${ADMIN_STATE.template} [${ADMIN_STATE.difficulty_mode}]?`)) {
        ADMIN_STATE.matrix[ADMIN_STATE.template][ADMIN_STATE.difficulty_mode] = createDefaultSettings(ADMIN_STATE.template, ADMIN_STATE.difficulty_mode);
        syncInputsWithMatrix();
        sendPreview();
        saveLocal();
        if(window.spawn) window.spawn("🔄 คืนค่าเริ่มต้นเรียบร้อย", "text-cyan-400");
    }
};

function saveLocal() { localStorage.setItem('pw3d_config', JSON.stringify(ADMIN_STATE)); }

function sendPreview() {
    document.querySelectorAll('iframe').forEach(f => {
        if (f.contentWindow) f.contentWindow.postMessage({ type: 'PW3D_PREVIEW', config: ADMIN_STATE }, '*');
    });
}

window.setTemplate = (t) => {
    ADMIN_STATE.template = t;
    const firstSkin = (ADMIN_STATE.available_skins || []).find(s => s.template === t);
    if (firstSkin) {
        ADMIN_STATE.custom_model = firstSkin.model;
        ADMIN_STATE.custom_rotation_y = firstSkin.rotationY || 0;
    } else {
        ADMIN_STATE.custom_model = '';
    }
    highlightUI(); syncInputsWithMatrix(); renderGallery(); sendPreview(); saveLocal();
};

window.loadPreset = (m) => {
    ADMIN_STATE.difficulty_mode = m;
    highlightUI(); syncInputsWithMatrix(); sendPreview(); saveLocal();
};

window.saveAll = async () => {
    saveLocal();
    if(window.spawn) window.spawn("💾 กำลังบันทึกข้อมูลขึ้น Cloud...", "text-cyan-400 animate-pulse");
    
    // ส่งข้อมูลขึ้น Supabase
    const { error } = await saveGameConfig(ADMIN_STATE);
    
    if (error) {
        if(window.spawn) window.spawn("❌ บันทึกขึ้น Cloud ไม่สำเร็จ!", "text-rose-500 font-bold");
    } else {
        if(window.spawn) window.spawn("✅ บันทึกเมทริกซ์และคลาวด์สำเร็จ!", "text-emerald-400 font-black");
    }
};

window.updateSkinProp = (id, prop, val) => {
    const skin = ADMIN_STATE.available_skins.find(s => s.id === id);
    if (skin) {
        skin[prop] = (prop === 'cost' || prop === 'scale') ? parseFloat(val) : val;
        if(prop === 'model' || prop === 'scale') renderGallery(); 
        sendPreview(); saveLocal();
    }
};

window.updateSkinOffset = (id, axis, val) => {
    const skin = ADMIN_STATE.available_skins.find(s => s.id === id);
    if (skin) {
        if(!skin.drop_offset) skin.drop_offset = {x:0, y:0, z:0};
        skin.drop_offset[axis] = parseFloat(val);
        sendPreview(); saveLocal();
    }
};

window.selectVariant = (modelPath, rotationY = 0) => {
    ADMIN_STATE.custom_model = modelPath;
    ADMIN_STATE.custom_rotation_y = rotationY;
    renderGallery(); 
    sendPreview(); 
    saveLocal();
    if (window.spawn) window.spawn("✨ เลือกสกินสำเร็จ", "text-neon-purple font-bold");
};

window.addNewSkin = () => {
    const id = 'skin-' + Date.now();
    ADMIN_STATE.available_skins.push({
        id, template: ADMIN_STATE.template, name: 'New Skin', desc: '', icon: '🎁', cost: 0, model: '', scale: 1.0,
        drop_type: (ADMIN_STATE.template === 'car' ? 'oil' : (ADMIN_STATE.template === 'plant' ? 'leaves' : 'poop')), 
        drop_offset: {x:0, y:0.1, z: (ADMIN_STATE.template === 'car' ? -0.5 : -0.2)}
    });
    renderGallery(); saveLocal();
};

window.deleteSkin = (id) => {
    if(confirm('Delete skin?')) {
        ADMIN_STATE.available_skins = ADMIN_STATE.available_skins.filter(s => s.id !== id);
        renderGallery(); saveLocal();
    }
};

function renderGallery() {
    const container = $('variant-gallery');
    if(!container) return;
    
    // ล้าง Engine เก่าทิ้งเพื่อคืนความจำ (ถ้าหลงเหลือ)
    if (window.miniEngines) {
        window.miniEngines.forEach(e => { e.stop = true; if(e.renderer) e.renderer.dispose(); });
        window.miniEngines = [];
    }

    const list = (ADMIN_STATE.available_skins || []).filter(s => s.template === ADMIN_STATE.template);
    container.innerHTML = list.map(v => `
        <div class="group relative flex flex-col glass p-6 rounded-[2.5rem] border ${ADMIN_STATE.custom_model === v.model ? 'border-neon-purple shadow-[0_0_30px_rgba(139,92,246,0.3)]' : 'border-white/5'} transition-all duration-500">
            <div class="absolute top-4 right-4 z-10 flex gap-2">
                <button onclick="deleteSkin('${v.id}')" class="w-8 h-8 rounded-full bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">🗑️</button>
            </div>
            
            <!-- Optimized Model-Viewer (High Performance) -->
            <div id="card-${v.id}" onclick="selectVariant('${v.model}', ${v.rotationY || 0})" class="w-full h-56 rounded-[2rem] bg-black/40 border border-white/5 relative overflow-hidden cursor-pointer mb-6 ring-1 ring-white/10 group-hover:ring-neon-purple/30 transition-all">
                <model-viewer 
                    src="${v.model.startsWith('/') ? v.model : '/' + v.model}" 
                    camera-controls 
                    auto-rotate 
                    interaction-prompt="none"
                    shadow-intensity="1" 
                    exposure="1.2"
                    loading="lazy"
                    style="width:100%; height:100%; background: radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%);">
                </model-viewer>
                <div class="absolute bottom-3 left-0 w-full flex justify-center pointer-events-none">
                    <div class="px-4 py-1.5 rounded-full bg-neon-purple/90 backdrop-blur-md text-[8px] font-black uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg">⚡ เลือกสกินนี้</div>
                </div>
            </div>

            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="text-[9px] opacity-40 uppercase font-black tracking-widest">ชื่อสกินศิลปิน (Skin Name)</label>
                        <input type="text" value="${v.name}" onchange="updateSkinProp('${v.id}', 'name', this.value)" class="!bg-white/5 !border-white/5 !py-4 font-bold">
                    </div>
                    <div>
                        <label class="text-[9px] opacity-40 uppercase font-black tracking-widest">ราคาขาย (Price)</label>
                        <input type="number" value="${v.cost}" onchange="updateSkinProp('${v.id}', 'cost', this.value)" class="!bg-white/5 !border-white/5 !py-4 text-neon-gold">
                    </div>
                    <div>
                        <label class="text-[9px] opacity-40 uppercase font-black tracking-widest">ขนาดตัว (Scale)</label>
                        <input type="number" step="0.1" value="${v.scale || 1.0}" onchange="updateSkinProp('${v.id}', 'scale', this.value)" class="!bg-white/5 !border-white/5 !py-4">
                    </div>
                </div>

                <div class="pt-4 border-t border-white/5">
                    <div class="flex items-center justify-center gap-2 mb-3">
                        <div class="h-px bg-white/5 flex-1"></div>
                        <label class="text-[8px] opacity-30 uppercase font-black tracking-[0.2em] whitespace-nowrap">พิกัดการดรอป (Offsets)</label>
                        <div class="h-px bg-white/5 flex-1"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <input type="number" step="0.05" value="${v.drop_offset?.x || 0}" oninput="updateSkinOffset('${v.id}', 'x', this.value)" class="!bg-black/60 !py-3 text-center text-[10px]" placeholder="X">
                        <input type="number" step="0.05" value="${v.drop_offset?.y || 0}" oninput="updateSkinOffset('${v.id}', 'y', this.value)" class="!bg-black/60 !py-3 text-center text-[10px]" placeholder="Y">
                        <input type="number" step="0.05" value="${v.drop_offset?.z || 0}" oninput="updateSkinOffset('${v.id}', 'z', this.value)" class="!bg-black/60 !py-3 text-center text-[10px]" placeholder="Z">
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

window.toggleSection = id => $(id)?.classList.toggle('section-collapsed');
window.forceSave = () => { saveLocal(); sendPreview(); window.spawn?.("🚀 บังคับเซฟโหมดพรีวิวสำเร็จ", "text-cyan-400 font-black"); };

(async () => {
    loadLocal();
    const { data, error } = await loadGameConfig();
    if (data && data.config) {
        deepMerge(ADMIN_STATE, data.config);
    }
    highlightUI();
    syncInputsWithMatrix();
    renderGallery();
    if(window.twemoji) twemoji.parse(document.body);
})();
