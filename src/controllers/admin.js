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
    rxp_feed: 5,
    rst_clean: 20,
    rxp_clean: 5,
    rst_play: 10,
    rxp_play: 10,
    rst_repair: 10,
    rxp_repair: 6,
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
    poop_lifetime: 30,
    reward_lifetime: 20,
    max_poops: 3,
    max_rewards: 3,
    rew_rare_rate: 20,
    rew_legend_rate: 5,
    rew_common_tokens: 10,
    rew_rare_tokens: 50,
    rew_legend_tokens: 250,
    available_skins: [
        { id: 'cat-toon', template: 'pet', name: 'Classic Cat', desc: 'แมวหน้าบูดคู่บุญ', icon: '🐱', cost: 0, model: '/toon_cat_free.glb', colorCls: 'neon-gold', scale: 1.0, drop_type: 'poop', drop_offset: {x: 0, y: 0, z: -0.2} },
        { id: 'plant-stylized', template: 'plant', name: 'Classic Tree', desc: 'ต้นไม้แห้งๆ', icon: '🌳', cost: 0, model: '/stylized_tree.glb', colorCls: 'emerald', scale: 1.0, drop_type: 'leaves', drop_offset: {x: 0, y: 0, z: 0} },
        { id: 'car-carton', template: 'car', name: 'Classic Car', desc: 'รถบังคับสุดจ๊าบ', icon: '🚗', cost: 0, model: '/car_carton.glb', colorCls: 'emerald', rotationY: Math.PI, scale: 1.0, drop_type: 'oil', drop_offset: {x: 0, y: 0.1, z: -0.5} },
        { id: 'cyberpunk_car', template: 'car', name: 'Cyberpunk 2077', desc: 'รถโลกอนาคตสุดเท่', icon: '🚀💨', cost: 5000, model: '/cyberpunk_car.glb', colorCls: 'neon-cyan', scale: 0.75, drop_type: 'smoke', drop_offset: {x: 0, y: 0.2, z: -0.8} }
    ]
};

let miniEngines = [];

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
        if (parsed.custom_model && (parsed.custom_model.includes('/models/pet/') || parsed.custom_model.includes('/models/car/') || parsed.custom_model.includes('/models/plant/'))) {
            parsed.custom_model = '/' + parsed.custom_model.split('/').pop();
        }
        Object.assign(STATE, parsed);
        Object.keys(STATE).forEach(key => {
            const el = $(`cfg-${key.replace(/_/g, '-')}`);
            if (el) el.value = STATE[key];
        });
        highlightDiff();
        highlightTpl();
    }
}

function saveAll() {
    localStorage.setItem('pw3d_config', JSON.stringify(STATE));
    // Notification for admin
    if(window.spawn) window.spawn("✅ บันทึกการตั้งค่าสำเร็จ", "text-emerald-400");
}

function sendPreview() {
    const frame = $('preview-frame');
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'PW3D_PREVIEW', config: STATE }, '*');
    }
}

window.setSky = v => { STATE.sky = v; sendPreview(); saveAll(); };
window.setGround = v => { STATE.ground = v; sendPreview(); saveAll(); };
window.updateVal = (id, val) => {
    const key = id.replace('cfg-', '').replace(/-/g, '_');
    STATE[key] = parseFloat(val) || val;
    sendPreview();
    saveAll();
};

window.setTemplate = (type) => { 
    STATE.template = type; 
    STATE.custom_model = ''; 
    highlightTpl(); 
    renderGallery();
    sendPreview(); 
    saveAll();
};

window.addNewSkin = () => {
    const id = 'skin-' + Date.now();
    const newSkin = {
        id, 
        template: STATE.template, 
        name: 'สกินใหม่', 
        desc: 'คำอธิบายสกิน', 
        icon: '🎁', 
        cost: 1000, 
        model: '', 
        colorCls: 'neon-purple',
        scale: 1.0,
        drop_type: (STATE.template === 'car' ? 'smoke' : (STATE.template === 'plant' ? 'leaves' : 'poop')),
        drop_offset: {x: 0, y: 0.1, z: -0.2}
    };
    STATE.available_skins.push(newSkin);
    renderGallery();
    saveAll();
};

window.deleteSkin = (id) => {
    if(!confirm('ยืนยันการลบสกินนี้หรือไม่?')) return;
    STATE.available_skins = STATE.available_skins.filter(s => s.id !== id);
    renderGallery();
    saveAll();
};

function renderGallery() {
    const container = $('variant-gallery');
    if(!container) return;
    
    miniEngines.forEach(e => { e.stop = true; if(e.renderer) e.renderer.dispose(); });
    miniEngines = [];

    const list = (STATE.available_skins || []).filter(s => s.template === STATE.template);
    container.innerHTML = list.map(v => `
        <div class="group relative flex flex-col glass p-4 rounded-3xl border ${STATE.custom_model === v.model ? 'border-neon-purple shadow-[0_0_20px_rgba(139,92,246,0.2)]' : 'border-white/5'}">
            <div class="flex gap-4">
                <div id="card-${v.id}" onclick="selectVariant('${v.model}', ${v.rotationY || 0})" class="w-24 h-32 sm:w-24 sm:h-32 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden cursor-pointer shrink-0">
                    <div id="preview-${v.id}" class="absolute inset-0 pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity"></div>
                    ${v.model === '' ? '<div class="absolute inset-0 flex items-center justify-center text-[8px] text-white/20 font-black uppercase text-center p-2">กรอกลิงก์โมเดล</div>' : ''}
                </div>
                <div class="flex-1 space-y-2">
                    <div class="flex justify-between items-start gap-1">
                        <input type="text" value="${v.name}" onchange="updateSkinProp('${v.id}', 'name', this.value)" 
                            class="!text-[10px] !bg-white/5 border border-white/10 !font-black !p-1.5 !rounded-lg" placeholder="ชื่อสกิน">
                        <button onclick="deleteSkin('${v.id}')" class="text-rose-500 hover:text-rose-400 text-sm transition-all p-1">🗑️</button>
                    </div>
                    <div class="space-y-0.5">
                        <label class="!text-[7px] opacity-40 uppercase">Model Path</label>
                        <input type="text" value="${v.model}" onchange="updateSkinProp('${v.id}', 'model', this.value)" 
                            class="!text-[8px] !bg-black/40 border-white/10 !p-1 !rounded-lg font-mono focus:border-neon-purple" placeholder="/model.glb">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="!text-[7px] opacity-40 uppercase">Price</label>
                            <input type="number" value="${v.cost}" onchange="updateSkinProp('${v.id}', 'cost', this.value)" 
                                class="!text-[10px] !bg-white/5 border-white/10 !p-1.5 !rounded-lg font-black text-neon-gold">
                        </div>
                        <div>
                            <label class="!text-[7px] opacity-40 uppercase">Scale</label>
                            <input type="number" step="0.1" value="${v.scale || 1.0}" onchange="updateSkinProp('${v.id}', 'scale', this.value)" 
                                class="!text-[10px] !bg-white/5 border-white/10 !p-1.5 !rounded-lg font-black text-neon-cyan">
                        </div>
                    </div>
                </div>
            </div>
            <div class="mt-4 pt-4 border-t border-white/5">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-[8px] font-black text-white/40 uppercase tracking-widest">Exhaust Pipe Position (สำหรับเล็งจุดปล่อยควัน)</div>
                </div>
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <div><label class="!text-[6px] opacity-50 uppercase">Model Rotation (Y)</label>
                        <div class="flex gap-1">
                            <input type="number" step="0.1" value="${v.rotationY || 0}" oninput="updateSkinProp('${v.id}', 'rotationY', this.value)" class="!text-[9px] !p-1 h-7 text-center flex-1 !bg-white/5 border-white/10">
                            <button onclick="updateSkinProp('${v.id}', 'rotationY', ${(v.rotationY || 0) > 1.5 ? 0 : 3.14})" class="bg-white/5 hover:bg-white/10 px-1.5 rounded text-[8px] border border-white/10 font-black">FLIP</button>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div><label class="!text-[6px] opacity-50">X (ซ้าย/ขวา)</label><input type="number" step="0.05" value="${v.drop_offset?.x || 0}" oninput="updateSkinOffset('${v.id}', 'x', this.value)" class="!text-[9px] !p-1 h-7 text-center"></div>
                    <div><label class="!text-[6px] opacity-50">Y (สูง/ต่ำ)</label><input type="number" step="0.05" value="${v.drop_offset?.y || 0}" oninput="updateSkinOffset('${v.id}', 'y', this.value)" class="!text-[9px] !p-1 h-7 text-center"></div>
                    <div><label class="!text-[6px] opacity-50">Z (หน้า/หลัง)</label><input type="number" step="0.05" value="${v.drop_offset?.z || 0}" oninput="updateSkinOffset('${v.id}', 'z', this.value)" class="!text-[9px] !p-1 h-7 text-center"></div>
                </div>
            </div>
        </div>
    `).join('');
    if (window.twemoji) twemoji.parse(container);
    setTimeout(() => { list.forEach(v => initMiniPreview(v)); }, 100);
}

function initMiniPreview(v) {
    const parent = $(`preview-${v.id}`);
    if (!parent || !v.model) return;
    const engine = { id: v.id, stop: false, lastScale: 1 };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.6, 3.8);
    camera.lookAt(0, 0.2, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(parent.clientWidth, parent.clientHeight);
    parent.appendChild(renderer.domElement);
    engine.renderer = renderer;
    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambient);
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    const modelPath = v.model.startsWith('/') ? v.model.substring(1) : v.model;
    new GLTFLoader().load(modelPath, g => {
        const m = g.scene;
        m.traverse(node => {
            if (node.isMesh && node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(mat => { mat.side = THREE.DoubleSide; mat.depthWrite = true; mat.needsUpdate = true; });
            }
        });
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const baseScale = 2.0 / (maxDim || 1);
        const finalScale = baseScale * (v.scale || 1.0);
        engine.lastScale = finalScale;
        m.scale.set(finalScale, finalScale, finalScale);
        m.position.sub(center.multiplyScalar(finalScale));
        m.position.y -= 0.1;
        modelGroup.add(m);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        const off = v.drop_offset || {x:0, y:0, z:0};
        dot.position.set(off.x * finalScale, off.y * finalScale, off.z * finalScale);
        modelGroup.add(dot);
        engine.dot = dot;
        if (g.animations && g.animations.length > 0) {
            engine.mixer = new THREE.AnimationMixer(m);
            engine.mixer.clipAction(g.animations[0]).play();
        }
    });
    const clock = new THREE.Clock();
    const anim = () => {
        if (engine.stop) return;
        requestAnimationFrame(anim);
        if (engine.mixer) engine.mixer.update(clock.getDelta());
        modelGroup.rotation.y += 0.01;
        renderer.render(scene, camera);
    };
    anim();
    miniEngines.push(engine);
}

window.updateSkinProp = (id, prop, val) => {
    const skin = STATE.available_skins.find(s => s.id === id);
    if (!skin) return;
    skin[prop] = (prop === 'cost' || prop === 'scale') ? parseFloat(val) : val;
    if(prop === 'model' || prop === 'scale') renderGallery(); 
    sendPreview(); 
};

window.updateSkinOffset = (id, axis, val) => {
    const skin = STATE.available_skins.find(s => s.id === id);
    if (!skin) return;
    if (!skin.drop_offset) skin.drop_offset = {x:0, y:0, z:0};
    skin.drop_offset[axis] = parseFloat(val);
    const engine = miniEngines.find(e => e.id === id);
    if(engine && engine.dot) {
        engine.dot.position.set(skin.drop_offset.x * engine.lastScale, skin.drop_offset.y * engine.lastScale, skin.drop_offset.z * engine.lastScale);
    }
    sendPreview();
};

window.selectVariant = (modelPath, rotationY = 0) => {
    STATE.custom_model = modelPath;
    STATE.custom_rotation_y = rotationY;
    renderGallery();
    sendPreview();
};

window.loadPreset = (mode) => {
    const presets = {
        easy: { difficulty_mode:'easy', dec_hunger:0.05, dec_clean:0.03, dec_happy:0.03, reg_stamina:1.0, max_stamina:150 },
        normal: { difficulty_mode:'normal', dec_hunger:0.12, dec_clean:0.06, dec_happy:0.08, reg_stamina:0.5, max_stamina:100 },
        hard: { difficulty_mode:'hard', dec_hunger:0.18, dec_clean:0.09, dec_happy:0.12, reg_stamina:0.35, max_stamina:80 }
    };
    if(presets[mode]) { Object.assign(STATE, presets[mode]); renderAll(); sendPreview(); saveAll(); }
};

window.toggleSection = (id) => { const sec = $(id); if(sec) sec.classList.toggle('section-collapsed'); };
const renderAll = () => { loadConfig(); renderGallery(); if(window.twemoji) twemoji.parse(document.body); };
renderAll();
