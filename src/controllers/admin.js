import '@google/model-viewer';
import '../styles.css';
import { supabase, saveGameConfig, loadGameConfig, fetchSeasonRankings, fetchLiveRankings, fetchAllUsers, setUserBanStatus } from '../services/supabase.js';
import { BossService } from '../services/boss_sync.js';
import { STATE, setUserId } from '../store/state.js';
import { createDefaultSettings } from '../store/defaults.js';

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

// --- ⚙️ Hyper-Granular Settings Factory (MOVED TO src/store/defaults.js) ---
        // 7. ฟิสิกส์ (Physics)


export const ADMIN_STATE = {
    template: 'pet',
    difficulty_mode: 'normal',
    sky: 'day',
    ground: 'grass',
    custom_model: '', // 👈 ปล่อยว่างเพื่อให้ระบบ Fallback ตามธีมทำงาน
    custom_rotation_y: 0,
    season_number: 1,
    season_name: '',
    season_duration: 15,
    world_boss: {
        active: false,
        hp: 0,
        max_hp: 1000000,
        reward_tokens: 5000,
        reward_xp: 5000,
        model_path: '/models/truffle_man.glb',
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
window.ADMIN_STATE = ADMIN_STATE; // 🛡️ Expose to window for inline HTML access


let IS_CLOUDSYNC_READY = false; // 🔥 Safety Guard

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
        if (document.activeElement === el) return; // 🛡️ กันการเขียนทับขณะพิมพ์
        const currentVal = getDeepValue(ADMIN_STATE, key);
        
        if (currentVal !== undefined) {
            el.value = currentVal;
        }

        if (!el.dataset.boundGlobal) {
            el.addEventListener('input', (e) => {
                let val = e.target.value;
                if (e.target.type === 'number') val = parseFloat(val) || val;
                
                setDeepValue(ADMIN_STATE, key, val);
                
                sendPreview(); 
                // 🔥 [AUTO-PERSIST] เซฟทุกค่าที่มีการเปลี่ยนแปลงขึ้น Cloud ทันที
                if (window.saveAll) window.saveAll();
                
                if (key === 'season_duration') {
                    console.log("📅 [ADMIN] Season duration changed to:", val);
                    window.renderLoginRewards(val);
                    window.syncInputsWithMatrix();
                }
                if (key.startsWith('world_boss.')) window.renderBossConfig(); // Update preview if boss path changed
            });
            el.dataset.boundGlobal = "true";
        }
    });
}

window.renderLoginRewards = (newDuration = null) => {
    const grid = $('login-rewards-grid');
    if (!grid) return;

    if (newDuration !== null) {
        ADMIN_STATE.season_duration = parseInt(newDuration) || 0;
    }

    const config = ADMIN_STATE.matrix[ADMIN_STATE.template][ADMIN_STATE.difficulty_mode];
    const duration = Math.max(0, parseInt(ADMIN_STATE.season_duration) || 0);
    
    // ถ้าไม่มีวันเลย ให้เคลียร์หน้าจอแล้วจบงาน
    if (duration <= 0) {
        grid.innerHTML = '<div class="col-span-full py-10 text-center text-white/20 uppercase font-black italic">กรุณาระบุจำนวนวันซีซั่นด้านบน</div>';
        return;
    }
    
    // Ensure login_rewards array matches duration
    if (!config.login_rewards) config.login_rewards = [];
    
    // จัดการขนาดของ Array ให้ตรงกับจำนวนวันที่เลือก
    if (config.login_rewards.length < duration) {
        while (config.login_rewards.length < duration) {
            const d = config.login_rewards.length + 1;
            config.login_rewards.push({ 
                day: d, 
                reward_type: 'gold', 
                reward_value: 100 + (d * 50) 
            });
        }
    } else if (config.login_rewards.length > duration) {
        config.login_rewards = config.login_rewards.slice(0, duration);
    }

    grid.innerHTML = config.login_rewards.map((r, i) => {
        const isJackpot = (i + 1) % 7 === 0;
        const colorClass = isJackpot ? 'border-neon-gold ring-1 ring-neon-gold/50 bg-neon-gold/10' : 'border-white/5 bg-black/40';
        const labelClass = isJackpot ? 'text-neon-gold font-black' : 'text-white/30 font-black';

        // กำหนดหน่วยตามประเภทรางวัล
        const units = {
            gold: '<span class="text-[9px] text-amber-400 ml-1">🪙</span>',
            score: '<span class="text-[9px] text-cyan-400 ml-1">🏆</span>',
            decay: '<span class="text-[9px] text-emerald-400 ml-1">⏳ นาที</span>',
            luck: '<span class="text-[9px] text-pink-400 ml-1">⏳ นาที</span>'
        };
        const unit = units[r.reward_type] || '';

        return `
            <div class="${colorClass} p-4 rounded-3xl border flex flex-col gap-3 relative overflow-hidden transition-all hover:scale-105 duration-300 min-w-[110px]">
                ${isJackpot ? '<div class="absolute -top-1 -right-1 bg-neon-gold text-black text-[7px] font-black px-2 py-1 rounded-bl uppercase shadow-lg shadow-neon-gold/20">JACKPOT</div>' : ''}
                <div class="text-[9px] uppercase border-b border-white/5 pb-2 mb-1 ${labelClass} tracking-widest">วันที่ ${i+1}</div>
                
                <div class="space-y-1">
                    <label class="text-[7px] opacity-30 uppercase block">ประเภทรางวัล</label>
                    <select onchange="updateMatrixField('login_rewards.${i}.reward_type', this.value); renderLoginRewards()" class="matrix-input !py-2 !text-[10px] !px-2 !bg-white/5 text-white rounded-xl border-none focus:ring-1 focus:ring-neon-cyan w-full">
                        <option value="gold" ${r.reward_type==='gold'?'selected':''}>💰 ทอง</option>
                        <option value="decay" ${r.reward_type==='decay'?'selected':''}>🛡️ กันหิว (บัพ)</option>
                        <option value="luck" ${r.reward_type==='luck'?'selected':''}>🍀 ดวงดี (บัพ)</option>
                    </select>
                </div>

                <div class="space-y-1">
                    <label class="text-[7px] opacity-30 uppercase block">จำนวนรางวัล</label>
                    <div class="flex items-center bg-black/40 rounded-xl px-3 border border-white/5 focus-within:border-neon-pink/50 transition-colors">
                        <input type="number" value="${r.reward_value}" onchange="updateMatrixField('login_rewards.${i}.reward_value', this.value)" class="w-full !p-0 !py-2 !text-[12px] bg-transparent text-white font-black border-none focus:ring-0" placeholder="0">
                        ${unit}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Helper สำหรับอัปเดตข้อมูลใน Matrix แบบเจาะจง
window.updateMatrixField = (path, value) => {
    const config = ADMIN_STATE.matrix[ADMIN_STATE.template][ADMIN_STATE.difficulty_mode];
    
    // แปลงให้เป็นตัวเลขถ้าเป็นค่าความแรง/จำนวนรางวัล
    let finalVal = value;
    if (!isNaN(value) && value !== '') finalVal = parseFloat(value);

    setDeepValue(config, path, finalVal);
    if (window.saveAll) window.saveAll();
}

function syncInputsWithMatrix() {
    window.renderLoginRewards(); // Generate dynamic inputs first
    const config = ADMIN_STATE.matrix[ADMIN_STATE.template][ADMIN_STATE.difficulty_mode];
    
    // 📊 [MATRIX SYNC] หา Input และ Select ทุกตัวที่มี data-path
    document.querySelectorAll('.matrix-input').forEach(el => {
        const path = el.dataset.path;
        if (path) {
            const val = getDeepValue(config, path);
            if (val !== undefined && document.activeElement !== el) el.value = val;

            if (!el.dataset.bound) {
                const updateFn = (e) => {
                    let newVal = e.target.value;
                    const num = parseFloat(newVal);
                    setDeepValue(config, path, isNaN(num) ? newVal : num);
                    sendPreview();
                    if (window.saveAll) window.saveAll();
                };
                el.addEventListener('input', updateFn);
                el.addEventListener('change', updateFn);
                el.dataset.bound = "true";
            }
        }
    });

    // 🛡️ [GLOBAL SYNC] เติมค่าให้ช่องที่มี data-global (บอส, สกิน)
    document.querySelectorAll('[data-global]').forEach(el => {
        const path = el.dataset.global;
        if (path) {
            const val = getDeepValue(ADMIN_STATE, path);
            if (val !== undefined && document.activeElement !== el) {
                el.value = val;
            }

            if (!el.dataset.bound) {
                const updateFn = (e) => {
                    let newVal = e.target.value;
                    if (el.type === 'number') newVal = parseFloat(newVal || 0);
                    setDeepValue(ADMIN_STATE, path, newVal);
                    sendPreview(); // 🔥 อัปเดตตัวพรีวิวฝั่งขวาทันที
                };
                el.addEventListener('input', updateFn);
                el.addEventListener('change', updateFn);
                el.dataset.bound = "true";
            }
        }
    });
}

function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    
    for (const key in source) {
        if (Array.isArray(source[key])) {
            target[key] = [...source[key]];
        } else if (source[key] instanceof Object && key in target && !Array.isArray(target[key])) {
            // 🔥 [CRITICAL FIX] บังคับให้ขุดลงไปลึกๆ แม้จะเป็น Matrix ที่ซับซ้อน
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

function loadLocal() {
    // 🛡️ [AUDIT FIX] ปล่อยให้ Cloud รับหน้าที่แทน 100% ป้องกันค่าเก่าในเครื่องปนเปื้อน
    console.log("ℹ️ Persistence: Local Load SKIPPED (Cloud Mode Only)");
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

function saveLocal() { /* 🛡️ [AUDIT FIX] ปิดระบบเซฟในเบราเซอร์ถาวร */ }

function sendPreview() {
    document.querySelectorAll('iframe').forEach(f => {
        if (f.contentWindow) f.contentWindow.postMessage({ type: 'PW3D_PREVIEW', config: ADMIN_STATE }, '*');
    });
}

window.setTemplate = async (t) => {
    ADMIN_STATE.template = t;
    const firstSkin = (ADMIN_STATE.available_skins || []).find(s => s.template === t);
    if (firstSkin) {
        ADMIN_STATE.custom_model = firstSkin.model;
        ADMIN_STATE.custom_rotation_y = firstSkin.rotationY || 0;
    } else {
        ADMIN_STATE.custom_model = '';
    }
    highlightUI(); 
    syncInputsWithMatrix(); 
    renderGallery(); 
    sendPreview(); 
    
    // 🔥 [AUTO-PERSIST] บันทึกขึ้น Cloud ทันทีเมื่อเปลี่ยน Template เพื่อป้องกันการรีเฟรชแล้วหาย
    if (window.saveAll) await window.saveAll();
};

window.loadPreset = (m) => {
    ADMIN_STATE.difficulty_mode = m;
    highlightUI(); syncInputsWithMatrix(); sendPreview(); saveLocal();
};

window.saveAll = async () => {
    // 🛡️ [SECURITY AUDIT] ตรวจสอบสิทธิ์สูงสุดก่อนบันทึก
    if (typeof isAuthoritativeAdmin === 'function' && !isAuthoritativeAdmin()) {
        window.spawn("🚫 คุณไม่มีสิทธิ์บันทึกข้อมูล (Invalid Authority)", "text-rose-500 font-black");
        return;
    }

    if (!IS_CLOUDSYNC_READY) {
        window.spawn("⚠️ กรุณารอให้ระบบโหลดข้อมูลปัจจุบันเสร็จก่อนบันทึก", "text-rose-400");
        return;
    }

    const btn = document.querySelector('.btn-save');
    const originalText = btn ? btn.innerHTML : '';
    if(btn) {
        btn.innerHTML = '⏳ กำลังบันทึก...';
        btn.disabled = true;
    }

    window.spawn("💾 กำลังส่งข้อมูลขึ้น Cloud...", "text-neon-cyan animate-pulse");
    
    // 🛡️ [DATA AGGREGATION] กวาดข้อมูลจากหน้าจอทั้งหมดลงตัวแปร ADMIN_STATE ก่อนส่ง
    document.querySelectorAll('[data-global]').forEach(el => {
        const path = el.dataset.global;
        if (path) {
            let val = el.value;
            if (el.type === 'number') val = parseFloat(val || 0);
            setDeepValue(ADMIN_STATE, path, val);
        }
    });

    // 👕 [SKIN SYNC] มั่นใจว่ารายการสกินถูกบันทึกด้วย
    if (!ADMIN_STATE.available_skins || ADMIN_STATE.available_skins.length === 0) {
        ADMIN_STATE.available_skins = window.getDefaultSkins();
    }

    const { error } = await saveGameConfig(ADMIN_STATE);
    
    if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }

    if (error) {
        window.spawn("❌ บันทึกขึ้น Cloud ไม่สำเร็จ!", "text-rose-500 font-bold");
        console.error(error);
    } else {
        window.spawn("✅ บันทึกข้อมูลสำเร็จ (Cloud Master Synced)", "text-emerald-400 font-black");
    }
};



window.updateSkinProp = (id, prop, val) => {
    const skin = ADMIN_STATE.available_skins.find(s => s.id === id);
    if (skin) {
        skin[prop] = (prop === 'cost' || prop === 'scale') ? parseFloat(val) : val;
        if(prop === 'model' || prop === 'scale') renderGallery(); 
        sendPreview(); saveLocal();
        if (window.saveAll) window.saveAll();
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
    if (window.saveAll) window.saveAll();
    if (window.spawn) window.spawn("✨ เลือกสกินสำเร็จ", "text-neon-purple font-bold");
}

window.addNewSkin = () => {
    const id = 'skin-' + Date.now();
    ADMIN_STATE.available_skins.push({
        id, template: ADMIN_STATE.template, name: 'New Skin', desc: '', icon: '🎁', cost: 0, model: '', scale: 1.0,
        drop_type: (ADMIN_STATE.template === 'car' ? 'oil' : (ADMIN_STATE.template === 'plant' ? 'leaves' : 'poop')), 
        drop_offset: {x:0, y:0.1, z: (ADMIN_STATE.template === 'car' ? -0.5 : -0.2)}
    });
    renderGallery(); 
    if (window.saveAll) window.saveAll();
};

window.deleteSkin = (id) => {
    if(confirm('Delete skin?')) {
        ADMIN_STATE.available_skins = ADMIN_STATE.available_skins.filter(s => s.id !== id);
        renderGallery();
        if (window.saveAll) window.saveAll();
    }
}

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
                    loading="eager"
                    reveal="auto"
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
    
    const confirmMsg = `🔥 [คำเตือนขั้นเด็ดขาด]\n\nคุณกำลังจะเริ่ม "ซีซั่น ${nextS}"\n- ผู้เล่นทุกคนจะถูกรีเซ็ตเลเวลเป็น 1\n- เงินจะถูกปรับเป็น 500\n- คะแนนสะสมจะกลายเป็น 0\n- ข้อมูลซีซั่น ${currentS} จะถูกบันทึกเป็นประวัติก่อนรีเซ็ต\n\nต้องการดำเนินการต่อหรือไม่?`;
    
    if (confirm(confirmMsg)) {
        window.spawn("⏳ กำลังบันทึกประวัติซีซั่นเก่า...", "text-yellow-400 animate-pulse");
        
        try {
            // ==========================================
            // 📜 STEP 1: บันทึกประวัติซีซั่นเก่าก่อนรีเซ็ต (Archive)
            // ==========================================
            const { data: allPlayers, error: fetchErr } = await supabase
                .from('pet_progression')
                .select('player_id, score, level')
                .neq('player_id', '');
            
            if (!fetchErr && allPlayers && allPlayers.length > 0) {
                const historyRows = allPlayers.map(p => ({
                    player_id: p.player_id,
                    season_number: currentS,
                    final_score: p.score || 0,
                    final_level: p.level || 1
                }));
                
                const { error: histErr } = await supabase
                    .from('season_history')
                    .insert(historyRows);
                
                if (histErr) {
                    console.error("⚠️ [ARCHIVE] บันทึกประวัติไม่สำเร็จ:", histErr);
                    window.spawn("⚠️ บันทึกประวัติไม่สำเร็จ แต่จะรีเซ็ตต่อ...", "text-amber-400");
                } else {
                    console.log(`📜 [ARCHIVE] บันทึกประวัติซีซั่น ${currentS} สำเร็จ (${allPlayers.length} คน)`);
                }
            }

            // ==========================================
            // 🔥 STEP 2: รีเซ็ตข้อมูลผู้เล่นทุกคน
            // ==========================================
            window.spawn("⏳ กำลังรีเซ็ตผู้เล่นทั้งเซิร์ฟเวอร์...", "text-yellow-400 animate-pulse");
            
            const results = await Promise.all([
                // 1. รีเซ็ต Progression
                supabase.from('pet_progression').update({
                    level: 1, xp: 0, score: 0, tokens: 500,
                    current_season: nextS, boss_damage: 0
                }).neq('player_id', ''),

                // 2. รีเซ็ตกิจกรรม
                supabase.from('pet_activities').update({
                    login_streak: 0, last_login_date: '',
                    last_quest_date: '',
                    claimed_days: [], quests: {}, achievements: []
                }).neq('player_id', ''),

                // 3. รีเซ็ตสเตตัสสัตว์เลี้ยง
                supabase.from('pet_stats').update({
                    hunger: 100, clean: 100, love: 100,
                    stamina: 100, carrying_rock: 0
                }).neq('player_id', ''),

                // 4. รีเซ็ตสกิลบอส (ให้ทุกคนเริ่มจากศูนย์เท่ากัน)
                supabase.from('pet_assets').update({
                    boss_skills: {
                        lvl: 1, xp: 0, next: 5000, points: 0,
                        damage: { lvl: 1 }, crit: { lvl: 1 }, speed: { lvl: 1 }, bag: { lvl: 1 }
                    }
                }).neq('player_id', ''),

                // 5. รีเซ็ต Buff ทั้งหมด (ไม่ให้ข้ามซีซั่น)
                supabase.from('pet_buffs').update({
                    buffs: {
                        score_mult: 1, score_expiry: 0,
                        decay_mult: 1, decay_expiry: 0,
                        luck_mult: 1, luck_expiry: 0,
                        regen_mult: 1, regen_expiry: 0
                    }
                }).neq('player_id', '')
            ]);

            // เช็คว่ามี Error ไหม
            const errors = results.filter(r => r.error);
            if (errors.length > 0) {
                console.error("❌ [SEASON RESET] Errors:", errors.map(e => e.error));
                window.spawn("❌ เกิดข้อผิดพลาดบางส่วน ลองตรวจสอบ Console", "text-rose-500");
                return;
            }

            // ==========================================
            // ⏰ STEP 3: อัปเดตเลขซีซั่น + รีเซ็ตเวลาเริ่มซีซั่นใหม่
            // ==========================================
            ADMIN_STATE.season_number = nextS;
            ADMIN_STATE.season_start_at = new Date().toISOString();
            
            const input = $('input-season-num');
            if (input) {
                input.value = nextS;
                input.classList.add('animate-bounce', 'text-yellow-400');
            }
            
            // บันทึกเลขซีซั่นใหม่ + เวลาเริ่มต้นซีซั่นขึ้น Config
            if (window.saveAll) await window.saveAll();
            
            window.spawn?.(`🚀 เริ่มซีซั่น ${nextS} สำเร็จ! ทุกคนกลับไปเริ่มใหม่แล้ว`, "text-emerald-400 font-black");
            
            // รีโหลดหน้าเพื่อให้ State ล่าสุดทำงาน
            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            console.error("❌ [SEASON RESET] Critical Error:", err);
            window.spawn("❌ เกิดข้อผิดพลาดร้ายแรง", "text-rose-500");
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

    // Reset all with safety
    [vs, vh, vu, vb].forEach(v => v?.classList.add('hidden'));
    [ns, nh, nu, nb].forEach(n => {
        n?.classList.remove('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        n?.classList.add('text-white/40', 'bg-white/5', 'border-white/5');
    });

    if (view === 'settings') {
        vs?.classList.remove('hidden');
        ns?.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        ns?.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.remove('hidden');
    } else if (view === 'history') {
        vh?.classList.remove('hidden');
        nh?.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        nh?.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.remove('hidden');
        window.initSeasonDropdown?.();
        window.renderHistoryRankings?.();
        window.renderBossHistoryRankings?.();
    } else if (view === 'users') {
        vu?.classList.remove('hidden');
        nu?.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        nu?.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.add('hidden');
        window.refreshUserLists?.();
    } else if (view === 'boss') {
        vb?.classList.remove('hidden');
        nb?.classList.add('active', 'bg-neon-purple/10', 'border-neon-purple/20');
        nb?.classList.remove('text-white/40', 'bg-white/5', 'border-white/5');
        if(preview) preview.classList.add('hidden');
        window.renderBossConfig?.();
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
    
    const activePlayers = CACHED_USERS.filter(u => !u.is_banned && (u.player_id.toLowerCase().includes(search) || (u.pet_name || '').toLowerCase().includes(search)));
    const bannedPlayers = CACHED_USERS.filter(u => u.is_banned);

    allContainer.innerHTML = activePlayers.map(u => `
        <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all">
            <div class="flex items-center gap-4">
                <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs text-cyan-400">#</div>
                <div>
                    <div class="font-bold text-slate-200 text-sm">${u.pet_name || u.player_id}</div>
                    <div class="text-[8px] text-white/20 uppercase tracking-widest">ID: ${u.player_id} | LV.${u.level} | $${u.tokens}</div>
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
                    <div class="font-bold text-red-200 text-sm">${u.pet_name || u.player_id}</div>
                    <div class="text-[8px] text-red-500/40 uppercase tracking-widest font-black">ID: ${u.player_id} | บัญชีถูกระงับ (BANNED)</div>
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
                const rankNum = index + 1;
                const glowClass = (index === 0 && isTop3) ? 'border-neon-gold shadow-[0_0_20px_rgba(255,215,0,0.1)]' : 
                                  (index === 1 && isTop3) ? 'border-white/20' : 
                                  (index === 2 && isTop3) ? 'border-white/10' : 'border-white/5';

                const displayName = player.pet_name || player.player_id || "Unknown";
                const subId = player.pet_name ? `ID: ${player.player_id}` : "Unknown Player";

                return `
                    <div class="flex items-center justify-between p-5 bg-white/[0.02] hover:bg-white/[0.05] rounded-3xl border ${glowClass} transition-all group">
                        <div class="flex items-center gap-6">
                            <div class="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center font-black ${isTop3 ? 'text-xl' : 'text-[10px] text-white/20'}">${rankNum}</div>
                            <div>
                                <div class="font-bold text-lg text-slate-200 group-hover:text-white transition-colors tracking-tight">${displayName}</div>
                                <div class="text-[8px] text-white/20 uppercase tracking-[0.2em] mt-1">${subId} | ${new Date(timestamp).toLocaleDateString('th-TH', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} น.</div>
                            </div>
                        </div>
                        <div class="text-right pr-4">
                            <div class="${isLive ? 'text-cyan-400' : 'text-neon-gold'} font-black text-2xl tracking-tighter">${score.toLocaleString()}${isLive ? '<span class="text-[10px] ml-1 opacity-50">คะแนน</span>' : ''}</div>
                            <div class="text-[7px] text-white/30 uppercase font-black tracking-widest mt-0.5">${isLive ? `LV. ${player.level || 1}` : `LV. ${player.final_level || 1} (SEASON FINAL)`}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

window.renderBossHistoryRankings = async () => {
    const listContainer = $('boss-history-list');
    if (!listContainer) return;

    listContainer.innerHTML = `<div class="text-center py-20 text-rose-400/40 animate-pulse">กำลังโหลดข้อมูลนักล่าบอส...</div>`;

    const { data, error } = await supabase.rpc('get_boss_leaderboard');
    
    if (error || !data || data.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-20 text-white/10">❌ ยังไม่มีข้อมูลความเสียหายบอส</div>`;
        return;
    }

    listContainer.innerHTML = `
        <div class="flex flex-col gap-3">
            ${data.map((player, index) => {
                const isTop3 = index < 3;
                const damage = player.damage || 0;
                const rankNum = index + 1;
                const glowClass = (index === 0 && isTop3) ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : 
                                  (index === 1 && isTop3) ? 'border-orange-500/30' : 
                                  (index === 2 && isTop3) ? 'border-white/10' : 'border-white/5';

                return `
                    <div class="flex items-center justify-between p-5 bg-rose-500/[0.02] hover:bg-rose-500/[0.05] rounded-3xl border ${glowClass} transition-all group">
                        <div class="flex items-center gap-6">
                            <div class="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center font-black ${isTop3 ? 'text-xl text-rose-400' : 'text-[10px] text-white/20'}">${rankNum}</div>
                            <div>
                                <div class="font-bold text-lg text-slate-200 group-hover:text-white transition-colors tracking-tight">${player.display_name || player.player_id}</div>
                                <div class="text-[8px] text-rose-400/40 uppercase tracking-[0.2em] mt-1">ID: ${player.player_id} | BOSS HUNTER</div>
                            </div>
                        </div>
                        <div class="text-right pr-4">
                            <div class="text-rose-500 font-black text-2xl tracking-tighter">${damage.toLocaleString()}</div>
                            <div class="text-[7px] text-white/30 uppercase font-black tracking-widest mt-0.5">ความเสียหาย (DAMAGE)</div>
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

    // 🔥 [ADD] Render Skin Manager too
    window.renderSkinManager();

    const bst = $('boss-status-text');
    const bsi = $('boss-status-indicator');
    const bsp = $('btn-boss-spawn');
    
    if (bst) bst.innerText = wb.active ? 'ACTIVE' : 'OFFLINE';
    if (bsi) bsi.className = `w-4 h-4 rounded-full ${wb.active ? 'bg-rose-500 shadow-[0_0_15px_#f43f5e]' : 'bg-slate-500'} animate-pulse`;
    if (bsp) {
        bsp.innerText = wb.active ? 'ซ่อนบอส (DESPAWN)' : 'อัญเชิญบอส (SPAWN)';
        bsp.className = `px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all glow ${wb.active ? 'bg-slate-700 text-white' : 'bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.3)]'}`;
    }

    // 🛡️ [OVERRIDE UI]
    const badge = $('boss-override-badge');
    const autoBtn = $('btn-boss-auto');
    if (badge) {
        if (wb.manual_override) {
            badge.innerText = 'MANUAL MODE';
            badge.className = 'px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest';
            if (autoBtn) autoBtn.classList.remove('hidden');
        } else {
            badge.innerText = 'AUTO SCHEDULE';
            badge.className = 'px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase tracking-widest';
            if (autoBtn) autoBtn.classList.add('hidden');
        }
    }

    // 🛡️ [SYNC FIX] อัปเดต UI โดยเน้นที่ Attribute Selector (รักษาโครงสร้างเดิมของคุณลูกค้า)
    const setVal = (selector, val, isText = false) => {
        const el = document.querySelector(selector) || (selector.includes('world_boss.hp') ? $('boss-cur-hp-disp') : null);
        if (el) {
            if (isText) el.innerText = val;
            else el.value = val;
        }
    };

    setVal('[data-global="world_boss.hp"]', (wb.hp || 0).toLocaleString(), true);
    setVal('[data-global="world_boss.max_hp"]', wb.max_hp || 1000000);
    setVal('[data-global="world_boss.reward_tokens"]', wb.reward_tokens || 5000);
    setVal('[data-global="world_boss.reward_xp"]', wb.reward_xp || 2500);

    let currentPath = wb.model_path || '/models/truffle_man.glb';
    if (currentPath.includes('phoenix_bird')) currentPath = '/models/truffle_man.glb';
    
    setVal('[data-global="world_boss.model_path"]', currentPath);
    setVal('[data-global="world_boss.anim_speed"]', wb.anim_speed || 1.0);
    
    // Rock Mechanics
    setVal('[data-global="world_boss.rock_spawn_limit"]', wb.rock_spawn_limit ?? 3);
    setVal('[data-global="world_boss.rock_carry_limit"]', wb.rock_carry_limit ?? 2);
    setVal('[data-global="world_boss.rock_spawn_delay"]', wb.rock_spawn_delay ?? 1.0);

    window.renderScheduleList();

    // อัปเดตตัวพรีวิว 3D
    const viewer = $('boss-preview-viewer');
    if (viewer) {
        let path = wb.model_path || '/models/truffle_man.glb';
        if (path.includes('phoenix_bird')) path = '/models/truffle_man.glb';
        const finalPath = path.startsWith('/') ? path : '/' + path;

        // 🛡️ [DASHBOARD FIX] ตรวจสอบว่าเป็น model-viewer หรือยัง ถ้าไม่ใช่ให้สร้างใหม่
        let mv = viewer.querySelector('model-viewer');
        if (!mv) {
            viewer.innerHTML = `
                <model-viewer 
                    src="${finalPath}" 
                    camera-controls 
                    auto-rotate
                    interaction-prompt="none"
                    shadow-intensity="1" 
                    exposure="1.2"
                    loading="eager"
                    reveal="auto"
                    style="width:100%; height:100%; background: transparent;">
                </model-viewer>
            `;
        } else if (mv.getAttribute('src') !== finalPath) {
            mv.setAttribute('src', finalPath);
        }
    }
};

window.updateBossPreview = () => {
    const path = $('boss-model-path')?.value;
    const viewer = $('boss-preview-viewer');
    if (viewer && path) {
        const finalPath = path.startsWith('/') ? path : '/' + path;
        let mv = viewer.querySelector('model-viewer');
        if (mv) {
            mv.setAttribute('src', finalPath);
        } else {
            window.renderBossConfig(); // Re-render if model-viewer is missing
        }
    }
};

window.toggleBossSpawn = async () => {
    if(!ADMIN_STATE.world_boss) ADMIN_STATE.world_boss = { active: false, hp: 1000000, max_hp: 1000000 };
    
    const newState = !ADMIN_STATE.world_boss.active;
    ADMIN_STATE.world_boss.active = newState;
    
    // 🛡️ [MANUAL OVERRIDE] เมื่อมีการสั่งการด้วยมือ ให้ล็อคโหมด Manual ไว้เสมอ
    // เพื่อไม่ให้ระบบ Schedule มาสั่งเปิด/ปิดทับซ้อนจนบอสรวน
    ADMIN_STATE.world_boss.manual_override = true;
    
    console.log(`⚙️ [ADMIN] Toggling boss spawn: ${newState ? 'ON' : 'OFF'} (Manual Override LOCKED: true)`);

    if (newState) {
        ADMIN_STATE.world_boss.hp = ADMIN_STATE.world_boss.max_hp;
        
        // 🛡️ [SAFETY WRAP] ป้องกัน RPC พังแล้วทำให้บอสไม่ยอมโผล่
        try {
            await supabase.rpc('reset_all_boss_damage');
        } catch (e) {
            console.warn("⚠️ [ADMIN] Could not reset damage leaderboard, but proceeding with spawn.");
        }

        window.spawn?.("👹 เริ่มศึกบอสใหม่! เลือดเต็มหลอดแล้ว", "text-yellow-400 font-bold");
    } else {
        ADMIN_STATE.world_boss.hp = 0;
        window.spawn?.("🌬️ บอสถูกถอนตัวออกไปแล้ว (Manual Despawn)", "text-slate-400 font-bold");
    }
    
    await window.saveBossConfig();
};

window.resetToSchedule = async () => {
    if(!ADMIN_STATE.world_boss) return;
    
    if (confirm("คุณต้องการคืนการควบคุมบอสให้กับระบบตารางเวลาอัตโนมัติใช่หรือไม่?")) {
        ADMIN_STATE.world_boss.manual_override = false;
        console.log("⚙️ [ADMIN] Manual Override DISABLED. Returning to schedule.");
        
        window.spawn?.("📅 คืนการควบคุมให้ระบบตารางเวลาแล้ว", "text-indigo-400 font-bold");
        await window.saveBossConfig();
    }
};

window.resetBossHP = async () => {
    if(!ADMIN_STATE.world_boss) return;
    
    // 🛡️ [DIRECT FIX] ดึงค่าเลือดจากช่องกรอกข้อมูล
    const currentMaxInput = parseInt(document.querySelector('[data-global="world_boss.max_hp"]')?.value || 1000000);
    console.log(`🧪 [ADMIN-DEBUG] Setting Boss HP directly to: ${currentMaxInput}`);
    
    // บังคับเปลี่ยนค่าในตัวแปรหลัก
    ADMIN_STATE.world_boss.max_hp = currentMaxInput;
    ADMIN_STATE.world_boss.hp = currentMaxInput;

    window.spawn?.(`🔄 กำลังรีเซ็ตเลือดบอสเป็น ${currentMaxInput.toLocaleString()}...`, "text-cyan-400 font-bold");
    
    // 🔥 บังคับเซฟลง Cloud ทันที (ข้าม RPC ที่มีปัญหา)
    await window.saveBossConfig();
};

window.saveBossConfig = async () => {
    if(!IS_CLOUDSYNC_READY) {
        console.warn("⚠️ [ADMIN] Cannot save: Cloud sync not ready.");
        return;
    }
    if(!ADMIN_STATE.world_boss) return;
    if(!ADMIN_STATE.world_boss) return;
    
    // 🛡️ [ACCURACY FIX] ดึงค่าจาก Attribute data-global ให้หมดทุกตัว (ไม่ง้อ ID)
    ADMIN_STATE.world_boss.max_hp = parseInt(document.querySelector('[data-global="world_boss.max_hp"]')?.value || 1000000);
    ADMIN_STATE.world_boss.reward_tokens = parseInt(document.querySelector('[data-global="world_boss.reward_tokens"]')?.value || 2500);
    ADMIN_STATE.world_boss.reward_xp = parseInt(document.querySelector('[data-global="world_boss.reward_xp"]')?.value || 1000);
    ADMIN_STATE.world_boss.model_path = document.querySelector('[data-global="world_boss.model_path"]')?.value || '/models/truffle_man.glb';
    ADMIN_STATE.world_boss.anim_speed = parseFloat(document.querySelector('[data-global="world_boss.anim_speed"]')?.value || 1.0);
    
    // Rock Mechanics
    ADMIN_STATE.world_boss.rock_spawn_limit = parseInt(document.querySelector('[data-global="world_boss.rock_spawn_limit"]')?.value || 3);
    ADMIN_STATE.world_boss.rock_carry_limit = parseInt(document.querySelector('[data-global="world_boss.rock_carry_limit"]')?.value || 2);
    ADMIN_STATE.world_boss.rock_spawn_delay = parseFloat(document.querySelector('[data-global="world_boss.rock_spawn_delay"]')?.value || 1.0);

    // 👕 [SKIN SYNC] เก็บรายการสกินที่ถูกแก้ไขราคาแล้วลง Config
    if (!ADMIN_STATE.available_skins || ADMIN_STATE.available_skins.length === 0) {
        ADMIN_STATE.available_skins = window.getDefaultSkins();
    }

    const { error } = await saveGameConfig(ADMIN_STATE);
    if (!error) {
        window.renderBossConfig();
        window.renderSkinManager(); // อัปเดตตารางสกินด้วย
        if (typeof sendPreview === 'function') sendPreview();
        window.spawn?.('บันทึกการตั้งค่าทั้งหมดเรียบร้อย!', 'text-emerald-400 font-bold');
    }
};

// --- 👕 SKIN MANAGEMENT LOGIC ---
window.getDefaultSkins = () => [
    { id: 'cat-toon', template: 'pet', name: 'Classic Cat', desc: 'แมวหน้าบูดคู่บุญ', icon: '🐱', cost: 0, model: '/toon_cat_free.glb', colorCls: 'neon-gold' },
    { id: 'plant-stylized', template: 'plant', name: 'Classic Tree', desc: 'ต้นไม้แห้งๆ', icon: '🌳', cost: 0, model: '/stylized_tree.glb', colorCls: 'emerald' },
    { id: 'car-carton', template: 'car', name: 'Classic Car', desc: 'รถบังคับสุดจ๊าบ', icon: '🚗', cost: 0, model: '/car_carton.glb', colorCls: 'emerald', rotationY: 3.14159 },
    { id: 'cyberpunk_car', template: 'car', name: 'Cyberpunk 2077', desc: 'รถโลกอนาคตสุดเท่', icon: '🚀💨', cost: 50000, model: '/cyberpunk_car.glb', colorCls: 'neon-cyan' }
];

window.renderSkinManager = () => {
    const list = document.getElementById('admin-skin-list');
    if (!list) return;

    if (!ADMIN_STATE.available_skins || ADMIN_STATE.available_skins.length === 0) {
        ADMIN_STATE.available_skins = window.getDefaultSkins();
    }

    list.innerHTML = ADMIN_STATE.available_skins.map((s, idx) => `
        <div class="flex items-center gap-4 bg-black/20 p-3 rounded-xl border border-white/5 hover:border-pink-500/20 transition-all">
            <div class="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center text-xl shadow-inner">${s.icon}</div>
            <div class="flex-1">
                <div class="text-[10px] font-black text-white uppercase">${s.name}</div>
                <div class="text-[7px] text-white/30 uppercase tracking-widest">${s.template} | ${s.id}</div>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-[8px] text-white/40 font-bold uppercase">ราคา</span>
                <input type="number" 
                    value="${s.cost}" 
                    onchange="window.updateSkinCost(${idx}, this.value)"
                    class="bg-black/60 border-none rounded-lg p-2 text-xs font-black text-neon-gold w-24 text-center outline-none focus:ring-1 ring-pink-500/50"
                >
                <span class="text-[8px] text-neon-gold font-black">🪙</span>
            </div>
        </div>
    `).join('');
};

window.updateSkinCost = (index, value) => {
    if (ADMIN_STATE.available_skins[index]) {
        ADMIN_STATE.available_skins[index].cost = parseInt(value || 0);
        console.log(`👕 [ADMIN] Updated skin cost: ${ADMIN_STATE.available_skins[index].name} -> ${value}`);
        // ไม่สั่ง Save ทันทีเพื่อให้ User ปรับหลายตัวแล้วกด Save ทีเดียว
    }
};

window.resetSkinsToDefault = () => {
    if (confirm("คุณต้องการรีเซ็ตราคาสกินทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่?")) {
        ADMIN_STATE.available_skins = window.getDefaultSkins();
        window.renderSkinManager();
        window.saveBossConfig();
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

// --- 🔐 Security & Authentication Logic (BYPASS MODE) ---
window.handleAdminLogin = () => {
    // ซ่อนหน้าจอทันทีถ้ามีการกดปุ่ม
    const overlay = $('admin-login-overlay');
    if (overlay) overlay.remove();
    window.spawn?.("🔓 ระบบ Admin Bypass: เข้าใช้งานได้ทันที", "text-cyan-400 font-black");
};

window.isAuthoritativeAdmin = () => true; // ✅ ให้สิทธิ์สูงสุดเสมอสำหรับการทดสอบ

(async () => {
    // 🛡️ [ADMIN ISOLATION] บังคับให้หน้า Dashboard เป็น Admin เสมอ แยกจากหน้าเล่นเกม
    setUserId('ADMIN_DASHBOARD');
    STATE.username = 'ADMIN_DASHBOARD';
    console.log("🛠️ [ADMIN] Dashboard Session Initialized: ADMIN_DASHBOARD");

    // 🎨 [UI UPDATE] แสดงสถานะ Admin บนหน้าจอ
    const headerTitle = document.querySelector('header h1');
    if (headerTitle) {
        const adminBadge = document.createElement('span');
        adminBadge.className = "ml-3 text-[9px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter align-middle shadow-[0_0_10px_rgba(225,29,72,0.5)] animate-pulse";
        adminBadge.innerText = "ADMIN MODE";
        headerTitle.appendChild(adminBadge);
    }

    // 🛡️ [RACE CONDITION FIX] เริ่มฟังคำสั่งจาก Preview ทันทีตั้งแต่เริ่มโหลด
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'PW3D_READY') {
            console.log("📺 [PREVIEW] Ready signal received, sending initial config...");
            sendPreview();
        }
    });

    // 🛡️ ซ่อนหน้าจอ Login อัตโนมัติ (Bypass)
    const overlay = $('admin-login-overlay');
    if (overlay) overlay.classList.add('hidden');

    if ($('nav-settings')) {
        highlightUI();
        syncInputsWithMatrix();
        switchView('settings');
    }

    const { data: cloudConfig, error: cloudError } = await loadGameConfig();
    if (cloudConfig) {
        console.log("☁️ [ADMIN] Cloud config loaded successfully:", cloudConfig);
        deepMerge(ADMIN_STATE, cloudConfig);
        
        if (!ADMIN_STATE.custom_model) {
            const firstSkin = (ADMIN_STATE.available_skins || []).find(s => s.template === ADMIN_STATE.template);
            if (firstSkin) {
                ADMIN_STATE.custom_model = firstSkin.model;
                ADMIN_STATE.custom_rotation_y = firstSkin.rotationY || 0;
            }
        }

        syncInputsWithMatrix();
        highlightUI();
        renderGallery();
        
        // 🚀 ส่งข้อมูลครั้งแรกทันทีที่โหลด Config เสร็จ (เผื่อ Iframe พร้อมรออยู่แล้ว)
        setTimeout(sendPreview, 500); 

        BossService.subscribe((wb) => {
            ADMIN_STATE.world_boss = wb;
            window.renderBossConfig(); 
            if (typeof sendPreview === 'function') sendPreview();
        });
    } else if (cloudError) {
        console.error("🚨 [ADMIN] Failed to load cloud config:", cloudError);
    }
    
    IS_CLOUDSYNC_READY = true; 
    if(window.twemoji) twemoji.parse(document.body);
})();
