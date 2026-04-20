import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, petModel, particles, groundMesh;
let ambientLight, sunLight, purpleLight, pinkLight, mixer;
let currentTemplate = 'pet';
let currentAction = null;
let envConfig = { sky: 'day', ground: 'grass' };

// --- 🏃 Walking & Animation state ---
let targetPos = new THREE.Vector3(0, 0, 0);
let isWalking = false;
let nextAutoWalkTime = 0;
let walkActions = [];
let idleActions = [];
let animState = 'idle';
let modelBaseScale = 1;
let targetPetScale = 1;

// --- ❄️ Cache vectors & Indicator state ---
const _dir = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _tempVec = new THREE.Vector3();

let indicatorElements = new Map();
let indicatorOverlay = null;
let indicatorFrameCount = 0;

// --- 🎲 Seeded Random System ---
let worldSeed = 1;
function seededRandom() {
    worldSeed = (worldSeed * 16807) % 2147483647;
    return (worldSeed - 1) / 2147483646;
}

export function setWorldSeed(userId) {
    if (!userId) return;
    let seed = 0;
    const str = String(userId);
    for (let i = 0; i < str.length; i++) {
        seed = ((seed << 5) - seed) + str.charCodeAt(i);
        seed |= 0;
    }
    worldSeed = Math.abs(seed) || 1;
}

// --- 💨 Dynamic Particle System ---
const dynamicParticles = [];
const maxDynamicParticles = 80;

function addParticle(x, y, z, velocity, color, size, lifetime) {
    if (dynamicParticles.length >= maxDynamicParticles) {
        const p = dynamicParticles.shift();
        if(p && p.mesh) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
    }
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 4, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
    dynamicParticles.push({ mesh, velocity, lifetime, maxLifetime: lifetime });
}

function updateDynamicParticles() {
    for (let i = dynamicParticles.length - 1; i >= 0; i--) {
        const p = dynamicParticles[i];
        p.lifetime--;
        p.mesh.position.add(p.velocity);
        p.mesh.material.opacity = p.lifetime / p.maxLifetime;
        p.mesh.scale.multiplyScalar(0.98);
        if (p.lifetime <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            dynamicParticles.splice(i, 1);
        }
    }
}

// --- Poo & Reward system ---
const poopObjects = [];
let onPoopCollected = null;
let onPoopExpired = null;
let onRewardCollected = null;
const rewardObjects = [];
let engineConfig = { poop_lifetime: 30, reward_lifetime: 20, max_poops: 3, max_rewards: 3 };
let targetItemToCollect = null;

function disposeObject(obj) {
    if (!obj) return;
    const el = indicatorElements.get(obj);
    if (el) { el.remove(); indicatorElements.delete(obj); }
    obj.traverse(node => {
        if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
                if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
                else node.material.dispose();
            }
        }
    });
}

const SKY_COLORS = { day: 0x87CEEB, sunset: 0x4a2040, night: 0x0a0e1a, space: 0x020208 };
const GROUND_COLORS = { grass: 0x3a8c4a, sand: 0xc2a55a, snow: 0xd0dde8, stone: 0x555560 };
const LIGHT_PRESETS = {
    day: { ambient: new THREE.Color(0xffffff), ambientI: 0.8, sunColor: 0xfff5e0, sunI: 2.0, exposure: 1.4, fog: 0.02 },
    sunset: { ambient: new THREE.Color(0xffaa66), ambientI: 0.5, sunColor: 0xff7744, sunI: 1.2, exposure: 1.0, fog: 0.035 },
    night: { ambient: new THREE.Color(0x334466), ambientI: 0.25, sunColor: 0x8899cc, sunI: 0.4, exposure: 0.7, fog: 0.05 },
    space: { ambient: new THREE.Color(0x222244), ambientI: 0.15, sunColor: 0x6666aa, sunI: 0.3, exposure: 0.5, fog: 0.06 }
};

export function init3D(containerId, templateType = 'pet', env = {}) {
    currentTemplate = templateType;
    const customModel = env.customModel || '';
    const customRotationY = env.customRotationY || 0;
    if (env.sky) envConfig.sky = env.sky;
    if (env.ground) envConfig.ground = env.ground;

    const container = document.getElementById(containerId);
    if (!container) return;

    const preset = LIGHT_PRESETS[envConfig.sky] || LIGHT_PRESETS.day;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_COLORS[envConfig.sky] || SKY_COLORS.day);
    scene.fog = new THREE.FogExp2(SKY_COLORS[envConfig.sky] || SKY_COLORS.day, preset.fog);

    camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", precision: 'mediump' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(isMobile() ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = preset.exposure;
    container.appendChild(renderer.domElement);

    ambientLight = new THREE.AmbientLight(preset.ambient, preset.ambientI);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunI);
    sunLight.position.set(5, 10, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(128, 128);
    sunLight.shadow.bias = -0.01;
    scene.add(sunLight);

    purpleLight = new THREE.PointLight(0x8b5cf6, 8, 20);
    purpleLight.position.set(-3, 3, 0);
    scene.add(purpleLight);

    pinkLight = new THREE.PointLight(0xec4899, 6, 15);
    pinkLight.position.set(3, 2, -2);
    scene.add(pinkLight);

    createGround();
    createDecorations();
    createParticles();
    createPetObject(customModel, customRotationY);

    const handleGlobalInput = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);

        for (let i = 0; i < poopObjects.length; i++) {
            const p = poopObjects[i];
            if (ray.intersectObject(p.mesh, true).length > 0) {
                scene.remove(p.mesh); disposeObject(p.mesh); poopObjects.splice(i, 1);
                if (onPoopCollected) onPoopCollected(p.type || 'normal'); return;
            }
        }
        for (let i = 0; i < rewardObjects.length; i++) {
            const r = rewardObjects[i];
            if (ray.intersectObject(r.mesh, true).length > 0) {
                scene.remove(r.mesh); disposeObject(r.mesh); rewardObjects.splice(i, 1);
                if (onRewardCollected) onRewardCollected(r.type, r.value); return;
            }
        }
        if (petModel) {
            const groundHit = ray.intersectObject(groundMesh);
            if (ray.intersectObject(petModel, true).length > 0 || (groundHit.length > 0 && groundHit[0].point.distanceTo(petModel.position) < 1.3)) {
                if (window.doTouch) window.doTouch();
                petModel.scale.setScalar(targetPetScale * 1.15);
                return;
            }
            if (groundHit.length > 0) {
                targetPos.copy(groundHit[0].point); targetPos.y = 0; isWalking = true;
            }
        }
    };

    renderer.domElement.addEventListener('click', (e) => handleGlobalInput(e.clientX, e.clientY));
    renderer.domElement.addEventListener('touchend', (e) => { 
        const t = e.changedTouches[0]; if (t) handleGlobalInput(t.clientX, t.clientY);
    });

    const handleResize = () => {
        const w = window.innerWidth, h = window.innerHeight, a = w/h;
        camera.aspect = a;
        if (a > 1.2) { camera.fov = 25; camera.position.set(0, 3, 14); camera.lookAt(0, 0.8, 0); }
        else { camera.fov = 45; camera.position.set(0, 5, 8); camera.lookAt(0, 0, 0); }
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    handleResize(); animate();
}

function createGround() {
    groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({
        color: GROUND_COLORS[envConfig.ground], metalness: 0.1, roughness: 0.9
    }));
    groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = -1.2; groundMesh.receiveShadow = true;
    scene.add(groundMesh);
}

function createDecorations() {
    const s = worldSeed;
    for (let i = 0; i < 8; i++) {
        const a = seededRandom() * Math.PI * 2, d = 4 + seededRandom() * 5;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x666666 }));
        rock.position.set(x, -1.1, z); rock.castShadow = true; scene.add(rock);
    }
    worldSeed = s;
}

function createParticles() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(100 * 3);
    for (let i = 0; i < 300; i++) pos[i] = (Math.random() - 0.5) * 16;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8b5cf6, size: 0.05, transparent: true, opacity: 0.5 }));
    scene.add(particles);
}

function createPetObject(path = '', rotationY = 0) {
    const skinConfig = (window.STATE?.config?.available_skins || []).find(s => s.model === path) || {};
    const skinScaleMultiplier = skinConfig.scale || 1.0;
    
    if (petModel) { scene.remove(petModel); disposeObject(petModel); petModel = null; }
    if (mixer) { mixer.stopAllAction(); mixer = null; }

    const modelGroup = new THREE.Group();
    if (path) {
        new GLTFLoader().load(path, (gltf) => {
            const m = gltf.scene;
            m.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = c.receiveShadow = true;
                    if (c.material) {
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        mats.forEach(mat => { mat.side = THREE.DoubleSide; mat.depthWrite = true; mat.needsUpdate = true; });
                    }
                }
            });
            const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
            const scale = (0.85 / (size.y || 1)) * skinScaleMultiplier;
            m.scale.set(scale, scale, scale);
            m.position.y = -(new THREE.Box3().setFromObject(m)).min.y;
            m.rotation.y = rotationY;
            
            modelBaseScale = scale;
            window._currentSkinScale = scale;
            window._currentSkinOffset = skinConfig.drop_offset || {x:0, y:0.1, z:-0.2};

            if (gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(m);
                walkActions = []; idleActions = [];
                gltf.animations.forEach(clip => {
                    const name = clip.name.toLowerCase(), action = mixer.clipAction(clip);
                    if (name.includes('walk') || name.includes('run')) walkActions.push(action);
                    else idleActions.push(action);
                });
                if (idleActions.length > 0) idleActions[0].play();
                else mixer.clipAction(gltf.animations[0]).play();
            }
            modelGroup.add(m);
            petModel = modelGroup; scene.add(petModel);
        });
    }
    petModel = modelGroup; scene.add(petModel);
    petModel.position.y = -1.2;
}

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() / 1000;
    const delta = Math.min(now - (window._lastTime || now), 0.1);
    window._lastTime = now;
    const elapsed = now;

    if (mixer) mixer.update(delta);
    if (indicatorFrameCount % 2 === 0) { updateDynamicParticles(); }
    
    if (petModel) {
        if (isWalking) {
            _dir.subVectors(targetPos, petModel.position); _dir.y = 0;
            if (_dir.length() > 0.1) {
                _dir.normalize().multiplyScalar(0.05); petModel.position.add(_dir);
                const targetRot = Math.atan2(_dir.x, _dir.z);
                let diff = targetRot - petModel.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
                petModel.rotation.y += diff * 0.08;
                if (animState !== 'walk' && mixer) {
                    animState = 'walk'; idleActions.forEach(a => a.stop()); walkActions.forEach(a => a.play());
                }
            } else isWalking = false;
        } else {
            if (animState !== 'idle' && mixer) {
                animState = 'idle'; walkActions.forEach(a => a.stop()); idleActions.forEach(a => a.play());
            }
        }
        const s = petModel.scale.x, goal = targetPetScale, n = s + (goal - s) * 0.03;
        petModel.scale.set(n, n, n);
        if (camera) {
            _camTarget.set(petModel.position.x, petModel.position.y + 4.7, petModel.position.z + 8);
            camera.position.lerp(_camTarget, 0.03); camera.lookAt(petModel.position.x, petModel.position.y + 0.7, petModel.position.z);
        }
    }
    updatePoops(delta); updateRewards(elapsed, delta);
    if (indicatorFrameCount % 4 === 0) { updateIndicators(); if(currentTemplate === 'car') spawnExhaustSmoke(); }
    indicatorFrameCount++;
    renderer.render(scene, camera);
}

function updatePoops(delta) {
    for (let i = poopObjects.length - 1; i >= 0; i--) {
        const p = poopObjects[i]; p.elapsed += delta;
        if (p.elapsed >= engineConfig.poop_lifetime) { scene.remove(p.mesh); disposeObject(p.mesh); poopObjects.splice(i, 1); if(onPoopExpired) onPoopExpired(); }
    }
}

function updateRewards(t, delta) {
    rewardObjects.forEach((r, i) => {
        r.elapsed += delta; r.mesh.rotation.y += 0.05; r.mesh.position.y = r.startY + Math.sin(t*4)*0.05;
        if (r.elapsed >= engineConfig.reward_lifetime) { scene.remove(r.mesh); disposeObject(r.mesh); rewardObjects.splice(i, 1); }
    });
}

function updateIndicators() {
    const container = document.getElementById('poop-indicators');
    if (!container || !camera) return;
    
    // กำหนดไอคอนตาม Template
    let dropIcon = '💩';
    if (currentTemplate === 'car') dropIcon = '🛢️';
    else if (currentTemplate === 'plant') dropIcon = '🍃';

    poopObjects.forEach(p => renderIndicator(p.mesh, dropIcon, '#ec4899', container));
    rewardObjects.forEach(r => renderIndicator(r.mesh, '🪙', '#fbbf24', container));
}

function renderIndicator(mesh, icon, color, container) {
    _tempVec.copy(mesh.position);
    _tempVec.y += 0.8; 
    _tempVec.project(camera);

    let el = indicatorElements.get(mesh);
    if (!el) {
        el = document.createElement('div'); 
        el.className = 'absolute top-1/2 left-1/2 w-10 h-10 flex items-center justify-center pointer-events-none transition-all duration-300';
        container.appendChild(el); 
        indicatorElements.set(mesh, el);
    }

    // กำหนดทิศทางและระยะทางจากกลางจอ (-1 ถึง 1)
    let x = _tempVec.x;
    let y = -_tempVec.y;
    const dist = Math.sqrt(x*x + y*y);
    const isOffScreen = dist > 0.85 || _tempVec.z > 1;
    
    // ไอคอนที่จะใช้ (เน้นอึเป็นสัญลักษณ์การนำทางหลักตามคำสั่ง)
    const navIcon = (icon === '🪙') ? '🪙' : '💩'; 
    const navColor = (icon === '🪙') ? '#fbbf24' : '#ec4899';

    if (isOffScreen) {
        // ผลักไปติดขอบวงกลม (Radar Style)
        const angle = Math.atan2(y, x);
        x = Math.cos(angle) * 0.85;
        y = Math.sin(angle) * 0.85;
        
        const arrowRot = angle + Math.PI/2; 
        el.innerHTML = `
            <div style="position: relative; display: flex; items-center; justify-center;">
                <div style="position: absolute; top: -15px; color: ${navColor}; transform: rotate(${arrowRot}rad); font-size: 10px; filter: drop-shadow(0 0 5px ${navColor});">▲</div>
                <div style="font-size: 1.2rem; filter: drop-shadow(0 0 10px rgba(0,0,0,0.5)); opacity: 0.8;">${navIcon}</div>
            </div>
        `;
        el.style.scale = '0.85';
    } else {
        // ลอยสั่นเบาๆ เมื่ออยู่ในจอ
        const bounce = Math.sin(Date.now() * 0.005) * 5;
        el.innerHTML = `<div style="font-size: 1.5rem; filter: drop-shadow(0 0 15px ${navColor}66); transform: translateY(${bounce}px)">${navIcon}</div>`;
        el.style.scale = '1';
    }

    const screenX = x * container.clientWidth * 0.48;
    const screenY = y * container.clientHeight * 0.48;
    el.style.transform = `translate(${screenX}px, ${screenY}px)`;
}

export function createPoopMesh(x, z, type) {
    const group = new THREE.Group();
    const isGold = type === 'gold';
    
    // กำหนดประเภทของที่ตกตาม Template อัตโนมัติ: รถ=น้ำมัน, ต้นไม้=ใบไม้, อื่นๆ=อึ
    let dropType = 'poop';
    if (currentTemplate === 'car') dropType = 'oil';
    else if (currentTemplate === 'plant') dropType = 'leaves';
    
    let material;
    if (isGold) {
        material = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1, emissive: 0xffaa00, emissiveIntensity: 0.5 });
    } else {
        const colors = { poop: 0x6b3a1f, smoke: 0xcccccc, oil: 0x111111, leaves: 0x2d5a27 };
        material = new THREE.MeshStandardMaterial({ color: colors[dropType] || 0x6b3a1f });
        if (dropType === 'oil') { material.metalness = 0.8; material.roughness = 0.1; }
        if (dropType === 'smoke') { material.transparent = true; material.opacity = 0.6; }
    }

    if (dropType === 'smoke') {
        for(let i=0; i<3; i++) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random()*0.1, 8, 8), material);
            m.position.set(Math.random()*0.15-0.07, Math.random()*0.1, Math.random()*0.15-0.07);
            group.add(m);
        }
    } else if (dropType === 'oil') {
        const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.02, 16), material);
        group.add(puddle);
    } else if (dropType === 'leaves') {
        for(let i=0; i<4; i++) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), material);
            leaf.scale.set(1, 0.1, 0.6);
            leaf.position.set(Math.random()*0.3-0.15, 0, Math.random()*0.3-0.15);
            leaf.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(leaf);
        }
    } else {
        const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), material);
        const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), material);
        p2.position.set(0.1, 0.05, 0.05);
        group.add(p1, p2);
    }

    if (isGold) {
        const light = new THREE.PointLight(0xffaa00, 2, 2);
        light.position.y = 0.5;
        group.add(light);
    }

    group.position.set(x, -1.18, z);
    group.traverse(c => { if(c.isMesh) c.castShadow = true; });
    return group;
}


function spawnExhaustSmoke() {
    if (!petModel || currentTemplate !== 'car') return;
    
    // ใช้ตำแหน่งท่อไอเสียจากการเล็งใน Dashboard (สำหรับควันเท่านั้น)
    const off = window._currentSkinOffset || {x:0, y:0.2, z:-0.5};
    const scale = window._currentSkinScale || 1;
    
    const v = new THREE.Vector3(off.x * scale, off.y * scale, off.z * scale);
    v.applyQuaternion(petModel.quaternion);
    
    // ควันพุ่งไปด้านหลัง
    const vel = new THREE.Vector3(0, 0.03, -0.05).applyQuaternion(petModel.quaternion);
    
    addParticle(
        petModel.position.x + v.x, 
        petModel.position.y + v.y, 
        petModel.position.z + v.z, 
        vel, 0xcccccc, 0.08, 25
    );
}

export function spawnPoop(type = 'normal') {
    if (!petModel || poopObjects.length >= engineConfig.max_poops) return false;
    
    // ของที่ดรอป (น้ำมัน/อึ) ใช้ตำแหน่งมาตรฐาน (หลังรถนิดหน่อย) ไม่ตามจุดท่อไอเสีย
    const scale = window._currentSkinScale || 1;
    const v = new THREE.Vector3(0, 0.1, -0.4 * scale); // ตำแหน่งมาตรฐาน
    v.applyQuaternion(petModel.quaternion);
    
    const px = petModel.position.x + v.x, pz = petModel.position.z + v.z;
    const mesh = createPoopMesh(px, pz, type); scene.add(mesh);
    poopObjects.push({ mesh, elapsed: 0, x: px, z: pz, type }); return true;
}

export function setPoopCallbacks(c, e) { onPoopCollected = c; onPoopExpired = e; }
export function setRewardCallback(c) { onRewardCollected = c; }
export function spawnReward(type, value) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffd700 }));
    mesh.position.set((Math.random()-0.5)*10, -0.9, (Math.random()-0.5)*10);
    scene.add(mesh); rewardObjects.push({ mesh, type, value, startY: -0.9, elapsed: 0 }); return true;
}
export function updatePetScale(level) {
    targetPetScale = 0.6 + (level - 1) * 0.016;
}

export function updateEnvironment(sky, ground) { 
    if(sky && SKY_COLORS[sky]) {
        scene.background = new THREE.Color(SKY_COLORS[sky]);
        if(scene.fog) scene.fog.color.set(SKY_COLORS[sky]);
    }
    if(ground && GROUND_COLORS[ground] && groundMesh) {
        groundMesh.material.color.set(GROUND_COLORS[ground]);
    }
}

export function updateEngineConfig(c) { 
    Object.assign(engineConfig, c); 
}

export function updateTemplate(type, path = '', rotationY = 0) {
    currentTemplate = type;
    createPetObject(path, rotationY);
}

export function triggerLevelUpEffect() {
    if (!petModel) return;
    const pos = petModel.position;
    for (let i = 0; i < 30; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.2, 0.1+Math.random()*0.1, (Math.random()-0.5)*0.2);
        addParticle(pos.x, pos.y + 0.5, pos.z, vel, 0x8b5cf6, 0.15, 40);
    }
}

export function collectPoopByUI() {
    if (poopObjects.length === 0) return false;
    const p = poopObjects[0];
    const type = p.type || 'normal';
    scene.remove(p.mesh);
    disposeObject(p.mesh);
    poopObjects.shift();
    return type;
}

function isMobile() { 
    return /Android|iPhone|iPad/i.test(navigator.userAgent); 
}
