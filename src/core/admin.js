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
    rxp_feed: 15,
    rst_clean: 20,
    rxp_clean: 10,
    rst_play: 20,
    rxp_play: 25,
    rst_repair: 10,
    rxp_repair: 12,
    fever_threshold: 80,
    rare_rate: 10,
    q_special_mult: 1.5,
    qt_scoop: 10,
    qt_fever: 2,
    qt_love: 10,
    qt_spend: 100,
    q_play: 1,
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
    custom_model: ''
};

let miniEngines = []; // Track active mini 3D scenes

const VARIANTS = {
    pet: [
        { id: 'cat-orange', name: 'Tabby Cat', path: '', icon: '🐱', type: 'obj', modelPath:'/models/cat/' },
        { id: 'bicolor-cat', name: 'Bicolor Cat', path: '/models/pet/bicolor_cat.glb', icon: '🐈', type: 'glb' },
        { id: 'shiba', name: 'Shiba Inu', path: '/models/shiba.glb', icon: '🐕', type: 'glb' }
    ],
    car: [
        { id: 'car-sport', name: 'Sport Car', path: '', icon: '🏎️', type: 'procedural' },
        { id: 'car-cyber', name: 'Cyber Truck', path: '/models/cyber.glb', icon: '📐', type: 'glb' },
        { id: 'car-van', name: 'Micro Bus', path: '/models/van.glb', icon: '🚐', type: 'glb' }
    ],
    plant: [
        { id: 'plant-pot', name: 'Small Pot', path: '', icon: '🪴', type: 'procedural' },
        { id: 'plant-cactus', name: 'Cactus', path: '/models/cactus.glb', icon: '🌵', type: 'glb' },
        { id: 'plant-tree', name: 'Oak Tree', path: '/models/tree.glb', icon: '🌳', type: 'glb' }
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
    if (c) Object.assign(STATE, JSON.parse(c));
    
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
    const obj = { ...STATE };
    Object.keys(STATE).forEach(key => {
        const el = $(`cfg-${key.replace(/_/g, '-')}`);
        if(el) {
            const val = el.value;
            if (el.type === 'number') obj[key] = parseFloat(val);
            else if (el.tagName === 'SELECT' && !isNaN(val)) obj[key] = parseFloat(val);
            else obj[key] = val;
        }
    });
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

window.saveAll = () => {
    const config = getConfigObject();
    localStorage.setItem('pw3d_config', JSON.stringify(config));
    
    const btn = document.querySelector('.btn-save');
    const oldText = btn.innerText;
    btn.innerText = '✅ บันทึกสำเร็จ!';
    setTimeout(() => btn.innerText = oldText, 2500);
    sendPreview();
};

window.setTemplate = (type) => { 
    STATE.template = type; 
    // Reset custom model if we switch template manually via top icons
    STATE.custom_model = ''; 
    const customInp = $('cfg-custom-model');
    if(customInp) customInp.value = '';

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
    if (!parent) return;

    const engine = { stop: false };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 1.2, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(parent.clientWidth, parent.clientHeight);
    parent.appendChild(renderer.domElement);
    engine.renderer = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambient);
    const point = new THREE.PointLight(0xffffff, 2);
    point.position.set(2, 2, 2);
    scene.add(point);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Loader Logic
    if (v.type === 'glb' && v.path) {
        new GLTFLoader().load(v.path, g => {
            const m = g.scene;
            const b = new THREE.Box3().setFromObject(m);
            const s = b.getSize(new THREE.Vector3());
            const sc = 1.2 / s.y;
            m.scale.set(sc, sc, sc);
            m.position.y = -1;
            
            if (g.animations && g.animations.length > 0) {
                engine.mixer = new THREE.AnimationMixer(m);
                g.animations.forEach(clip => {
                    const action = engine.mixer.clipAction(clip);
                    action.reset().play();
                    action.timeScale = 1.3;
                });
            }
            modelGroup.add(m);
        });
    } else if (v.type === 'obj') {
        new MTLLoader().setPath(v.modelPath).load('12221_Cat_v1_l3.mtl', m => {
            m.preload();
            new OBJLoader().setMaterials(m).setPath(v.modelPath).load('12221_Cat_v1_l3.obj', o => {
                o.scale.set(0.012, 0.012, 0.012);
                o.rotation.x = -Math.PI / 2;
                o.position.y = -1;
                modelGroup.add(o);
            });
        });
    } else {
        // Simple Placeholder Shapes for Procedural
        const geo = (STATE.template === 'car') ? new THREE.BoxGeometry(2, 0.5, 1) : new THREE.CylinderGeometry(0.5, 0.8, 1.5, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6 });
        const mesh = new THREE.Mesh(geo, mat);
        modelGroup.add(mesh);
    }

    const clock = new THREE.Clock();
    const anim = () => {
        if (engine.stop) return;
        requestAnimationFrame(anim);
        const delta = clock.getDelta();
        if (engine.mixer) engine.mixer.update(delta);
        modelGroup.rotation.y += 0.015;
        renderer.render(scene, camera);
    };
    anim();
    miniEngines.push(engine);
}

window.loadPreset = (mode) => {
    const presets = {
        easy: {
            difficulty_mode: 'easy',
            dec_hunger: 0.04, dec_clean: 0.02, dec_happy: 0.02,
            reg_stamina: 1.0, max_stamina: 150, 
            cost_feed: 5, cost_clean: 5, cost_repair: 2, cost_play: 8,
            rst_feed: 25, rst_clean: 30, rst_play: 30, rst_repair: 20,
            poop_min: 60, poop_max: 180, reward_min: 45, reward_max: 120,
            rare_rate: 10, rare_xp_mult: 2, fever_threshold: 70, fever_mult: 1.2,
            rscore_scoop: 10, q_special_mult: 1.2
        },
        normal: {
            difficulty_mode: 'normal',
            dec_hunger: 0.12, dec_clean: 0.06, dec_happy: 0.08,
            reg_stamina: 0.5, max_stamina: 100,
            cost_feed: 10, cost_clean: 8, cost_repair: 5, cost_play: 12,
            rst_feed: 15, rst_clean: 20, rst_play: 20, rst_repair: 10,
            poop_min: 20, poop_max: 50, reward_min: 30, reward_max: 90,
            rare_rate: 15, rare_xp_mult: 3, fever_threshold: 80, fever_mult: 1.5,
            rscore_scoop: 20, q_special_mult: 1.5
        },
        hard: {
            difficulty_mode: 'hard',
            dec_hunger: 0.25, dec_clean: 0.15, dec_happy: 0.20,
            reg_stamina: 0.2, max_stamina: 60,
            cost_feed: 20, cost_clean: 15, cost_repair: 10, cost_play: 25,
            rst_feed: 10, rst_clean: 15, rst_play: 15, rst_repair: 8,
            poop_min: 10, poop_max: 20, reward_min: 15, reward_max: 45,
            rare_rate: 40, rare_xp_mult: 5, fever_threshold: 90, fever_mult: 2.0,
            rare_token_min: 80, rare_token_max: 150,
            rscore_scoop: 50, q_special_mult: 3.0
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
loadConfig();
renderGallery();
