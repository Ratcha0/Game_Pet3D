import '../styles.css';
import { saveGameConfig, loadGameConfig, fetchSeasonRankings, fetchLiveRankings, fetchAllUsers, setUserBanStatus } from '../services/supabase.js';

const $ = id => document.getElementById(id);

// --- 📢 Global Notification System (Toast) ---
window.spawn = (msg, cls = "text-white") => {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl bg-[#0a0f1d] border border-white/10 shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300`;
    toast.innerHTML = `
        <div class="w-2 h-2 rounded-full bg-neon-purple animate-pulse shadow-[0_0_8px_#b026ff]"></div>
        <div class="text-[11px] font-black uppercase tracking-widest ${cls}">${msg}</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-4');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// --- ⚙️ Hyper-Granular Settings Factory ---
const createDefaultSettings = (template, diff) => {
    const isHard = diff === 'hard';
    const isEasy = diff === 'easy';
    
    // ตั้งค่าพื้นฐานตามชนิดตัวละคร (Physics Base)
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
        quests: {
            target_feed: isEasy ? 2 : (isHard ? 8 : 4),
            target_clean: isEasy ? 1 : (isHard ? 6 : 3),
            target_play: isEasy ? 1 : (isHard ? 3 : 2),
            reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.4),
            base_tokens: isEasy ? 300 : (isHard ? 400 : 430),
            base_score: isEasy ? 4000 : (isHard ? 6000 : 7150),
            // Special Quest Targets
            target_scoop: isEasy ? 3 : (isHard ? 15 : 8),
            target_fever: isEasy ? 1 : (isHard ? 4 : 2),
            target_spend: isEasy ? 500 : (isHard ? 2000 : 1000)
        },
        // 4. ร้านค้า (Shop Economy)
        shop: {
            small_tokens: isHard ? 600 : 450, small_amount: 50,
            medium_tokens: isHard ? 1400 : 1000, medium_amount: 120,
            large_tokens: isHard ? 3200 : 2500, large_amount: 300
        },
        // 5. กลไกหลัก (Mechanics)
        mechanics: {
            dec_hunger: isHard ? 0.18 : (isEasy ? 0.04 : 0.08),
            dec_clean:  isHard ? 0.10 : (isEasy ? 0.02 : 0.05),
            dec_happy:  isHard ? 0.12 : (isEasy ? 0.03 : 0.06),
            reg_stamina: isEasy ? 1.2 : (isHard ? 0.45 : 0.75),
            sp_min: isHard ? 15 : (isEasy ? 30 : 20),
            sp_max: isHard ? 45 : (isEasy ? 90 : 60),
            rare_rate: isHard ? 12 : (isEasy ? 5 : 8),
            poop_lifetime: isEasy ? 300 : (isHard ? 90 : 180),
            reward_lifetime: isEasy ? 240 : (isHard ? 80 : 150),
            max_poops: 3,
            max_rewards: 3,
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

let ADMIN_STATE = {
    template: 'pet',
    difficulty_mode: 'normal',
    sky: 'day',
    ground: 'grass',
    custom_model: '',
    custom_rotation_y: 0,
    season_duration: 15,
    world_boss: {
        active: false,
        hp: 1000000,
        max_hp: 1000000,
        reward_tokens: 5000,
        reward_xp: 2500,
        model_path: '/models/phoenix_bird.glb',
        anim_speed: 1.0,
        rock_spawn_limit: 3,
        rock_carry_limit: 2,
        rock_spawn_delay: 1.0,
        schedules: [] // เก็บรายการ: { day: 1, time: "20:00", duration: 30 }
    },
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
    
    document.querySelectorAll('[data-global]').forEach(el => {
        const key = el.dataset.global;
        if (ADMIN_STATE[key] !== undefined) {
            el.value = ADMIN_STATE[key];
        }
        if (!el.dataset.boundGlobal) {
            el.addEventListener('input', (e) => {
                let val = e.target.value;
                if (e.target.type === 'number') val = parseFloat(val) || val;
                ADMIN_STATE[key] = val;
                sendPreview(); saveLocal();
            });
            el.dataset.boundGlobal = "true";
        }
    });
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
    
    const btn = document.querySelector('.btn-save');
    const originalText = btn ? btn.innerHTML : '';
    if(btn) {
        btn.innerHTML = '⏳ กำลังบันทึก...';
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    window.spawn("💾 กำลังส่งข้อมูลขึ้น Cloud...", "text-neon-cyan animate-pulse");
    
    const { error } = await saveGameConfig(ADMIN_STATE);
    
    if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    if (error) {
        window.spawn("❌ บันทึกขึ้น Cloud ไม่สำเร็จ!", "text-rose-500 font-bold");
        console.error(error);
    } else {
        window.spawn("✅ บันทึกข้อมูลสำเร็จเรียบร้อย!", "text-emerald-400 font-black");
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
        
        // 🔥 บังคับให้หน้าพรีวิวหันมาสนใจสกินที่กำลังแก้อยู่ทันที
        ADMIN_STATE.custom_model = skin.model;
        ADMIN_STATE.custom_rotation_y = skin.rotationY || 0;
        
        // อัปเดต Hotspot ในโมเดลทันที (หน้า Dashboard)
        const modelViewer = document.querySelector(`#card-${id} model-viewer`);
        if (modelViewer) {
            modelViewer.updateHotspot({
                name: 'hotspot-drop-point',
                position: `${skin.drop_offset.x}m ${skin.drop_offset.y}m ${skin.drop_offset.z}m`
            });
        }
        
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
            <div id="card-${v.id}" class="w-full h-56 rounded-[2rem] bg-black/40 border border-white/5 relative overflow-hidden mb-6 ring-1 ring-white/10 group-hover:ring-neon-purple/30 transition-all">
                <model-viewer 
                    src="${v.model.startsWith('/') ? v.model : '/' + v.model}" 
                    camera-controls 
                    interaction-prompt="none"
                    shadow-intensity="1" 
                    exposure="1.2"
                    loading="lazy"
                    style="width:100%; height:100%; background: radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%);">
                    
                    <!-- 🔴 จุดนำสายตาสำหรับตำแหน่งการดรอป -->
                    <button slot="hotspot-drop-point" 
                            data-position="${v.drop_offset?.x || 0}m ${v.drop_offset?.y || 0}m ${v.drop_offset?.z || 0}m" 
                            style="width:12px; height:12px; background:#ff2e2e; border: 2px solid white; border-radius:100%; box-shadow: 0 0 15px #ff2e2e; pointer-events:none; border: none;"></button>
                </model-viewer>
                <div class="absolute bottom-3 left-0 w-full flex justify-center z-20">
                    <button onclick="selectVariant('${v.model}', ${v.rotationY || 0})" 
                            class="px-4 py-1.5 rounded-full bg-neon-purple/90 hover:bg-neon-purple backdrop-blur-md text-[8px] font-black uppercase tracking-widest text-white transition-all transform hover:scale-105 shadow-lg">
                        ⚡ เลือกสกินนี้
                    </button>
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
                    <div class="grid grid-cols-3 gap-2 text-center text-[7px] font-black uppercase tracking-widest mb-1">
                        <div class="text-rose-400">X (ซ้าย-ขวา)</div>
                        <div class="text-emerald-400">Y (บน-ล่าง)</div>
                        <div class="text-cyan-400">Z (หน้า-หลัง)</div>
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

// --- 🏁 Season Management Actions ---
window.finishSeason = async () => {
    const currentS = parseInt(ADMIN_STATE.season_number || 1);
    const nextS = currentS + 1;
    
    const confirmMsg = `⚠️ คำเตือน: คุณกำลังจะจบซีซั่นที่ ${currentS} และเริ่มซีซั่นที่ ${nextS}?\n\nการกระทำนี้จะทำให้ผู้เล่นทุกคนถูกรีเซ็ตคะแนนและเลเวลเมื่อเขาเข้าเกมครั้งหน้า คุณบันทึกข้อมูลชื่อซีซั่นใหม่เรียบร้อยแล้วใช่หรือไม่?`;
    
    if (confirm(confirmMsg)) {
        // 1. อัปเดตเลขซีซั่นใน State
        ADMIN_STATE.season_number = nextS;
        
        // 2. อัปเดต UI
        const input = $('input-season-num');
        if (input) input.value = nextS;
        
        // 3. บันทึกขึ้น Cloud ทันที (เพื่อประกาศจบซีซั่น)
        window.spawn?.(`🚀 กำลังประกาศเริ่มซีซั่น ${nextS}...`, "text-yellow-400");
        
        const { error } = await saveGameConfig(ADMIN_STATE);
        if (!error) {
            window.spawn?.(`✅ ซีซั่น ${nextS} เริ่มต้นขึ้นแล้ว!`, "text-green-400 font-bold");
            saveLocal(); // บันทักลง Local ด้วย
            if (window.initSeasonDropdown) window.initSeasonDropdown(); // รีเฟรช Dropdown ในหน้า Log
        } else {
             window.spawn?.(`❌ เกิดข้อผิดพลาดในการจบซีซั่น`, "text-red-400");
        }
    }
};

// --- 🧭 View Switching Logic ---
window.switchView = (view) => {
    const vs = $('view-settings');
    const vh = $('view-history');
    const vu = $('view-users');
    const vb = $('view-boss');
    const ns = $('nav-settings');
    const nh = $('nav-history');
    const nu = $('nav-users');
    const nb = $('nav-boss');
    const preview = document.querySelector('aside.w-\\[850px\\]');

    // Reset all
    [vs, vh, vu, vb].forEach(v => v?.classList.add('hidden'));
    [ns, nh, nu, nb].forEach(n => {
        n?.classList.remove('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        n?.classList.add('text-white/40', 'bg-white/5', 'border-white/5');
    });

    if (view === 'settings') {
        vs.classList.remove('hidden');
        ns.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        ns.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.remove('hidden');
    } else if (view === 'history') {
        vh.classList.remove('hidden');
        nh.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        nh.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.remove('hidden');
        window.initSeasonDropdown();
        window.renderHistoryRankings();
    } else if (view === 'users') {
        vu.classList.remove('hidden');
        nu.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        nu.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.add('hidden'); // ซ่อนพรีวิวมือถือเพื่อใช้พื้นที่ฝั่งขวาแทน
        window.refreshUserLists();
    } else if (view === 'boss') {
        vb.classList.remove('hidden');
        nb.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        nb.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.add('hidden');
        window.renderBossConfig();
    }
};

let CACHED_USERS = [];

window.refreshUserLists = async () => {
    const { data, error } = await fetchAllUsers();
    if (!error && data) {
        CACHED_USERS = data;
        window.renderUserLists();
    }
};

window.toggleBanUser = async (userId, newStatus) => {
    if (confirm(`คุณต้องการ ${newStatus ? 'แบน' : 'ปลดแบน'} ผู้เล่น [${userId}] ใช่หรือไม่?`)) {
        await setUserBanStatus(userId, newStatus);
        window.spawn?.(`✅ ${newStatus ? 'แบน' : 'ปลดแบน'} [${userId}] เรียบร้อย`, newStatus ? "text-red-400" : "text-green-400");
        window.refreshUserLists();
    }
};

window.renderUserLists = () => {
    const search = $('user-search').value.toLowerCase();
    const allContainer = $('user-list-all');
    const bannedContainer = $('user-list-banned');
    
    // Stats calculation
    const now = new Date();
    const activeThreshold = 24 * 60 * 60 * 1000; // 24 hours in ms
    
    const stats = {
        total: CACHED_USERS.length,
        active: CACHED_USERS.filter(u => u.last_interaction_at && (now - new Date(u.last_interaction_at)) < activeThreshold).length,
        banned: CACHED_USERS.filter(u => u.is_banned).length
    };

    // Update Stats UI
    if($('stat-total')) $('stat-total').innerText = stats.total.toLocaleString();
    if($('stat-active')) $('stat-active').innerText = stats.active.toLocaleString();
    if($('stat-banned')) $('stat-banned').innerText = stats.banned.toLocaleString();
    
    const activePlayers = CACHED_USERS.filter(u => !u.is_banned && u.player_id.toLowerCase().includes(search));
    const bannedPlayers = CACHED_USERS.filter(u => u.is_banned);

    allContainer.innerHTML = activePlayers.map(u => `
        <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all">
            <div class="flex items-center gap-4">
                <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs text-cyan-400">#</div>
                <div>
                    <div class="font-bold text-slate-200 text-sm">${u.player_id}</div>
                    <div class="text-[8px] text-white/20 uppercase tracking-widest">LV.${u.level} | $${u.tokens}</div>
                </div>
            </div>
            <button onclick="toggleBanUser('${u.player_id}', true)" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-500 rounded-lg text-[10px] font-black border border-red-500/20">แบน (BAN)</button>
        </div>
    `).join('') || '<div class="text-center py-10 text-white/10 text-xs">ไม่พบรายชื่อผู้เล่น</div>';

    bannedContainer.innerHTML = bannedPlayers.map(u => `
        <div class="flex items-center justify-between p-4 bg-red-500/5 rounded-2xl border border-red-500/20">
            <div class="flex items-center gap-4">
                <div class="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-xs text-red-500">🚫</div>
                <div>
                    <div class="font-bold text-red-200 text-sm">${u.player_id}</div>
                    <div class="text-[8px] text-red-500/40 uppercase tracking-widest font-black">บัญชีถูกระงับ (BANNED)</div>
                </div>
            </div>
            <button onclick="toggleBanUser('${u.player_id}', false)" class="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/30 text-green-500 rounded-lg text-[10px] font-black border border-green-500/20">ปลดแบน (UNBAN)</button>
        </div>
    `).join('') || '<div class="text-center py-10 text-red-500/20 text-xs italic">ไม่มีบัญชีที่ถูกแบน</div>';
};

window.initSeasonDropdown = () => {
    const seasonSelect = $('history-season-select');
    if (!seasonSelect) return;
    
    const currentS = parseInt(ADMIN_STATE.season_number || 1);
    let options = '';
    
    // สร้างตัวเลือกย้อนหลังถึงซีซั่นปัจจุบัน
    for (let i = currentS; i >= 1; i--) {
        const isLive = i === currentS;
        options += `<option value="${i}">${isLive ? `🌟 ซีซั่น ${i} (ปัจจุบัน)` : `ซีซั่น ${i}`}</option>`;
    }
    seasonSelect.innerHTML = options;
};

window.renderHistoryRankings = async () => {
    const seasonSelect = $('history-season-select');
    const listContainer = $('history-list');
    if (!seasonSelect || !listContainer) return;

    const seasonNum = parseInt(seasonSelect.value);
    const currentS = parseInt(ADMIN_STATE.season_number || 1);
    const isLive = seasonNum === currentS;

    listContainer.innerHTML = `<div class="text-center py-20 text-white/40 animate-pulse">กำลังโหลดข้อมูล${isLive ? 'สด' : ''}...</div>`;

    // เลือกว่าจะดึงจาก "ตารางสด" หรือ "ตารางประวัติ"
    const { data, error } = isLive ? await fetchLiveRankings(seasonNum) : await fetchSeasonRankings(seasonNum);
    
    if (error || !data || data.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-20 text-white/20">❌ ไม่พบข้อมูลอันดับในซีซั่นที่ ${seasonNum}</div>`;
        return;
    }

    listContainer.innerHTML = `
        <div class="flex flex-col gap-3">
            ${data.map((player, index) => {
                const isTop3 = index < 3;
                const score = player.score ?? player.final_score ?? 0;
                const timestamp = player.last_interaction_at ?? player.created_at;
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
                const glowClass = (index === 0 && isTop3) ? 'border-neon-gold shadow-[0_0_20px_rgba(255,215,0,0.1)]' : 
                                  (index === 1 && isTop3) ? 'border-white/20' : 
                                  (index === 2 && isTop3) ? 'border-white/10' : 'border-white/5';

                return `
                    <div class="flex items-center justify-between p-5 bg-white/[0.02] hover:bg-white/[0.05] rounded-3xl border ${glowClass} transition-all group">
                        <div class="flex items-center gap-6">
                            <div class="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center font-black ${isTop3 ? 'text-xl' : 'text-[10px] text-white/20'}">${medal}</div>
                            <div>
                                <div class="font-bold text-lg text-slate-200 group-hover:text-white transition-colors tracking-tight">${player.player_id}</div>
                                <div class="text-[8px] text-white/20 uppercase tracking-[0.2em] mt-1">${new Date(timestamp).toLocaleDateString('th-TH', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} น.</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="${isLive ? 'text-cyan-400' : 'text-neon-gold'} font-black text-2xl tracking-tighter">${score.toLocaleString()}</div>
                            <div class="text-[7px] text-white/30 uppercase font-black tracking-widest mt-0.5">${isLive ? 'คะแนนปัจจุบัน (LIVE)' : 'คะแนนสรุป (FINAL)'}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

// --- WORLD BOSS LOGIC ---
window.renderBossConfig = () => {
    const wb = ADMIN_STATE.world_boss;
    if (!wb) return;

    const bst = $('boss-status-text');
    const bsi = $('boss-status-indicator');
    const bsp = $('btn-boss-spawn');
    
    if (bst) bst.innerText = wb.active ? 'ACTIVE' : 'OFFLINE';
    if (bsi) bsi.className = `w-4 h-4 rounded-full ${wb.active ? 'bg-rose-500 shadow-[0_0_15px_#f43f5e]' : 'bg-slate-500'} animate-pulse`;
    if (bsp) {
        bsp.innerText = wb.active ? 'ซ่อนบอส (DESPAWN)' : 'อัญเชิญบอส (SPAWN)';
        bsp.className = `px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all glow ${wb.active ? 'bg-slate-700 text-white' : 'bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.3)]'}`;
    }

    if ($('boss-cur-hp-disp')) $('boss-cur-hp-disp').innerText = (wb.hp || 0).toLocaleString();
    if ($('boss-max-hp-input')) $('boss-max-hp-input').value = wb.max_hp || 1000000;
    if ($('boss-reward-tokens')) $('boss-reward-tokens').value = wb.reward_tokens || 5000;
    if ($('boss-reward-xp')) $('boss-reward-xp').value = wb.reward_xp || 2500;
    if ($('boss-model-path')) $('boss-model-path').value = wb.model_path || '/models/phoenix_bird.glb';
    if ($('boss-anim-speed')) $('boss-anim-speed').value = wb.anim_speed || 1.0;
    
    // New Rock Mechanics
    if ($('boss-rock-spawn-limit')) $('boss-rock-spawn-limit').value = wb.rock_spawn_limit ?? 3;
    if ($('boss-rock-carry-limit')) $('boss-rock-carry-limit').value = wb.rock_carry_limit ?? 2;
    if ($('boss-rock-spawn-delay')) $('boss-rock-spawn-delay').value = wb.rock_spawn_delay ?? 1.0;

    window.renderScheduleList();

    // อัปเดตตัวพรีวิว 3D
    const viewer = $('boss-preview-viewer');
    if (viewer) {
        const path = wb.model_path || '/models/phoenix_bird.glb';
        viewer.src = path.startsWith('/') ? path : '/' + path;
    }
};

window.updateBossPreview = () => {
    const path = $('boss-model-path')?.value;
    const viewer = $('boss-preview-viewer');
    if (viewer && path) {
        viewer.src = path.startsWith('/') ? path : '/' + path;
    }
};

window.toggleBossSpawn = async () => {
    if(!ADMIN_STATE.world_boss) ADMIN_STATE.world_boss = { active: false, hp: 1000000, max_hp: 1000000 };
    ADMIN_STATE.world_boss.active = !ADMIN_STATE.world_boss.active;
    if (ADMIN_STATE.world_boss.active) {
        ADMIN_STATE.world_boss.hp = ADMIN_STATE.world_boss.max_hp;
    }
    await window.saveBossConfig();
};

window.resetBossHP = async () => {
    if(!ADMIN_STATE.world_boss) return;
    ADMIN_STATE.world_boss.hp = ADMIN_STATE.world_boss.max_hp;
    await window.saveBossConfig();
};

window.saveBossConfig = async () => {
    if(!ADMIN_STATE.world_boss) return;
    ADMIN_STATE.world_boss.max_hp = parseInt($('boss-max-hp-input')?.value || 1000000);
    ADMIN_STATE.world_boss.reward_tokens = parseInt($('boss-reward-tokens')?.value || 5000);
    ADMIN_STATE.world_boss.reward_xp = parseInt($('boss-reward-xp')?.value || 2500);
    ADMIN_STATE.world_boss.model_path = $('boss-model-path')?.value || '/models/phoenix_bird.glb';
    ADMIN_STATE.world_boss.anim_speed = parseFloat($('boss-anim-speed')?.value || 1.0);
    
    // New Rock Mechanics
    ADMIN_STATE.world_boss.rock_spawn_limit = parseInt($('boss-rock-spawn-limit')?.value ?? 3);
    ADMIN_STATE.world_boss.rock_carry_limit = parseInt($('boss-rock-carry-limit')?.value ?? 2);
    ADMIN_STATE.world_boss.rock_spawn_delay = parseFloat($('boss-rock-spawn-delay')?.value ?? 1.0);

    const { error } = await saveGameConfig(ADMIN_STATE);
    if (!error) {
        window.renderBossConfig();
        window.spawn?.('บันทึกการตั้งค่าบอสเรียบร้อย!', 'text-emerald-400 font-bold');
    }
};

window.renderScheduleList = () => {
    const list = $('boss-schedule-list');
    if (!list) return;

    const schedules = ADMIN_STATE.world_boss.schedules || [];
    const dayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

    list.innerHTML = schedules.map((slot, index) => `
        <div class="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/5">
            <select onchange="updateScheduleSlot(${index}, 'day', this.value)" class="!w-24 !py-1 !text-[10px]">
                ${dayNames.map((n, i) => `<option value="${i}" ${slot.day == i ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <input type="time" value="${slot.time}" onchange="updateScheduleSlot(${index}, 'time', this.value)" class="!w-24 !py-1 !text-[10px]">
            <div class="flex-1 flex items-center gap-2">
                <input type="number" value="${slot.duration}" onchange="updateScheduleSlot(${index}, 'duration', this.value)" class="!py-1 !text-[10px] w-16 text-center">
                <span class="text-[8px] text-white/30 uppercase font-black">นาที</span>
            </div>
            <button onclick="deleteScheduleSlot(${index})" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 transition-all">🗑️</button>
        </div>
    `).join('') || '<div class="text-center py-4 text-white/10 text-[10px] uppercase font-black tracking-widest italic">ยังไม่มีตารางเวลา</div>';
};

window.addScheduleSlot = () => {
    if (!ADMIN_STATE.world_boss.schedules) ADMIN_STATE.world_boss.schedules = [];
    ADMIN_STATE.world_boss.schedules.push({ day: 1, time: "20:00", duration: 30 });
    window.renderScheduleList();
    window.saveBossConfig();
};

window.updateScheduleSlot = (index, field, value) => {
    const slot = ADMIN_STATE.world_boss.schedules[index];
    if (slot) {
        slot[field] = (field === 'day' || field === 'duration') ? parseInt(value) : value;
        window.saveBossConfig();
    }
};

window.deleteScheduleSlot = (index) => {
    ADMIN_STATE.world_boss.schedules.splice(index, 1);
    window.renderScheduleList();
    window.saveBossConfig();
};

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
