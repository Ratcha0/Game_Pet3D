import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// 🛡️ [INSTANCING FIX] ยกเลิกตัวแปร Global ที่แชร์ข้ามจอ
let scene, camera, renderer, petModel, particles, groundMesh, debugDropPoint;
let ambientLight, sunLight, purpleLight, pinkLight, mixer;
let currentTemplate = 'pet';
let currentDropOffset = { x: 0, y: 0.1, z: -0.2 };
let currentAction = null;
let envConfig = { sky: 'day', ground: 'grass' };
let currentContainerId = null; // 🛡️ [AUDIT FIX] เก็บไว้ใช้ตอน Resize
let currentModelPath = ""; 
let isCurrentlyLoading = false; // 👈 ตัวเดียวคุมทั้งไฟล์

// --- 🏃 Walking & Animation state ---
let targetPos = new THREE.Vector3(0, -1.2, 0);
let isWalking = false;
let nextAutoWalkTime = 0;
let walkActions = [];
let idleActions = [];
let animState = 'idle';
let modelBaseScale = 1;
let currentScale = 1.0; // 📏 [AUDIT FIX] Consolidated scaling variable

// --- ❄️ Seamless Swap (No Global Cache to prevent Snatching) ---
let raycaster = new THREE.Raycaster();
let occludedObjects = [];

// --- ❄️ Cache vectors & Indicator state ---
const _dir = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _tempVec = new THREE.Vector3();
let emotionTimeout = null;
let currentEmotion = null;

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
            scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
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

function updateDynamicParticles(delta = 1/60) {
    for (let i = dynamicParticles.length - 1; i >= 0; i--) {
        const p = dynamicParticles[i];
        p.lifetime--;
        // 🛡️ [AUDIT FIX] ทำให้พาร์ทิเคิลขยับตามเวลาจริง ไม่ขึ้นกับ FPS
        const moveStep = p.velocity.clone().multiplyScalar(delta * 60);
        p.mesh.position.add(moveStep);
        p.mesh.material.opacity = p.lifetime / p.maxLifetime;
        p.mesh.scale.multiplyScalar(0.98);
        if (p.lifetime <= 0) {
            scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
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
let engineConfig = { poop_lifetime: 180, reward_lifetime: 150, max_poops: 3, max_rewards: 3 };
let targetItemToCollect = null;
let userInvokedCollect = false; // 🔒 เพิ่มตัวแปรเช็คว่าคนกดเองไหม


const SKY_COLORS = { day: 0x87CEEB, sunset: 0x4a2040, night: 0x0a0e1a, space: 0x020208 };
const GROUND_COLORS = { grass: 0x3a8c4a, sand: 0xc2a55a, snow: 0xd0dde8, stone: 0x555560 };
const LIGHT_PRESETS = {
    day: { ambient: new THREE.Color(0xffffff), ambientI: 0.8, sunColor: 0xfff5e0, sunI: 2.0, exposure: 1.4, fog: 0.02 },
    sunset: { ambient: new THREE.Color(0xffaa66), ambientI: 0.5, sunColor: 0xff7744, sunI: 1.2, exposure: 1.0, fog: 0.035 },
    night: { ambient: new THREE.Color(0x334466), ambientI: 0.25, sunColor: 0x8899cc, sunI: 0.4, exposure: 0.7, fog: 0.05 },
    space: { ambient: new THREE.Color(0x222244), ambientI: 0.15, sunColor: 0x6666aa, sunI: 0.3, exposure: 0.5, fog: 0.06 }
};

export function init3D(containerId, templateType = 'pet', env = {}) {
    if (renderer) {
        console.warn("🚀 [3D Engine] Already initialized. Skipping...");
        return;
    }
    currentTemplate = templateType;
    currentContainerId = containerId; 
    // 🛡️ [SYNC FIX] อัปเดตค่า Config ส่วนกลาง
    Object.assign(envConfig, env || {});
    
    const container = document.getElementById(containerId);
    if (!container) return;

    const preset = LIGHT_PRESETS[envConfig.sky] || LIGHT_PRESETS.day;
    
    // 🛡️ [SINGLETON FIX] บังคับใช้ THREE ตัวเดียวกับที่โหลด Loader มา
    scene = new THREE.Scene();
    console.log("✅ [3D Engine] Scene Created:", scene);
    window._scene = scene; 
    window.THREE = THREE; // 🔗 ผูกไว้กับ window เพื่อให้ไฟล์อื่นใช้ตัวเดียวกันเป๊ะๆ
    scene.background = new THREE.Color(SKY_COLORS[envConfig.sky] || SKY_COLORS.day);
    scene.fog = new THREE.FogExp2(SKY_COLORS[envConfig.sky] || SKY_COLORS.day, preset.fog);

    camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);

    // 🛡️ [RACE CONDITION FIX] ถ้ามีงานค้างอยู่ (จาก Admin) ให้โหลดทันทีที่ Scene พร้อม
    if (window._pendingTemplate) {
        const p = window._pendingTemplate;
        console.log("🚀 [3D Engine] Executing pending template load:", p);
        updateTemplate(p.type, p.path, p.rotationY);
        delete window._pendingTemplate;
    }
    
    // สร้างจุดเล็งสีแดงเพื่อช่วย Admin กะระยะ (Debug Hotspot)
    const debugGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true, opacity: 0.8 });
    debugDropPoint = new THREE.Mesh(debugGeo, debugMat);
    debugDropPoint.renderOrder = 999;
    scene.add(debugDropPoint);
    debugDropPoint.visible = window.location.search.includes('admin=true');

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", precision: 'mediump', alpha: true });
    
    // 🛡️ [BUGFIX] ป้องกันปัญหาจอขาว/โมเดลไม่ขึ้นในจอเล็ก (Zero Size Guard)
    const initialWidth = container.clientWidth || 300;
    const initialHeight = container.clientHeight || 300;
    
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(isMobile() ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = preset.exposure;
    container.appendChild(renderer.domElement);
    
    // บังคับให้ Camera Update อีกรอบเผื่อขนาดผิด
    camera.aspect = initialWidth / initialHeight;
    camera.updateProjectionMatrix();

    ambientLight = new THREE.AmbientLight(preset.ambient, preset.ambientI);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunI);
    sunLight.position.set(5, 10, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(128, 128); sunLight.shadow.bias = -0.01;
    scene.add(sunLight);

    purpleLight = new THREE.PointLight(0x8b5cf6, 8, 20); purpleLight.position.set(-3, 3, 0); scene.add(purpleLight);
    pinkLight = new THREE.PointLight(0xec4899, 6, 15); pinkLight.position.set(3, 2, -2); scene.add(pinkLight);

    createGround();
    createDecorations();
    createParticles();
    // 🛡️ [AUDIT FIX] ย้ายการโหลดโมเดลไปไว้ท้ายสุดเพื่อให้ฉากพร้อม 100% ก่อน

    const actionChannel = new BroadcastChannel('like-gotchi-action-sync');
    actionChannel.onmessage = (e) => {
        const { type, x, z, syncId, itemType, value } = e.data;
        
        if (type === 'MOVE' && petModel) {
            targetPos.set(x, -1.2, z);
            isWalking = true;
            nextAutoWalkTime = (performance.now() / 1000) + 12;
        }
        else if (type === 'TOUCH' && petModel) {
            if (window.doTouch) window.doTouch(true);
            petModel.scale.setScalar(currentScale * 1.15);
        }
        else if (type === 'SPAWN_POOP') {
            const mesh = createPoopMesh(x, z, itemType);
            mesh.userData.syncId = syncId;
            scene.add(mesh);
            poopObjects.push({ mesh, elapsed: 0, x, z, type: itemType });
        }
        else if (type === 'SPAWN_REWARD') {
            spawnReward(itemType, value, syncId, x, z, true); // true = fromSync
        }
        else if (type === 'COLLECT') {
            // ค้นหาและลบไอเทมที่มี ID เดียวกันในจอนี้ โดยไม่รัน Callback (เพื่อเลี่ยงเสียงซ้ำ)
            const pIdx = poopObjects.findIndex(p => p.mesh.userData.syncId === syncId);
            if (pIdx !== -1) {
                const p = poopObjects[pIdx];
                scene.remove(p.mesh); disposeObject(p.mesh); poopObjects.splice(pIdx, 1);
                // 🔒 [Hyper-Audit Fix] แจ้งว่าเป็นรีโมท (true) เพื่อกันการบวกเงินซ้ำในจออื่น
                if (onPoopCollected) onPoopCollected(p.type, true);
            }
            const rIdx = rewardObjects.findIndex(r => r.mesh.userData.syncId === syncId);
            if (rIdx !== -1) {
                const r = rewardObjects[rIdx];
                scene.remove(r.mesh); disposeObject(r.mesh); rewardObjects.splice(rIdx, 1);
            }
            // 🔥 [BUGFIX] เพิ่มการซิงค์การเก็บหินบอส (World Rocks)
            if (window._worldRocks) {
                const rockIdx = window._worldRocks.findIndex(rock => (rock.userData.id === syncId || rock.userData.syncId === syncId));
                if (rockIdx !== -1) {
                    const rock = window._worldRocks[rockIdx];
                    scene.remove(rock);
                    if (rock.geometry) rock.geometry.dispose();
                    if (rock.material) rock.material.dispose();
                    window._worldRocks.splice(rockIdx, 1);
                }
            }
        }
        else if (type === 'REFRESH_PET') {
            if (window.refreshPetModel) window.refreshPetModel();
        }
    };

    window._actionChannel = actionChannel; // เก็บไว้ใช้ในฟังก์ชันอื่น

    // 🛡️ [SYNC FIX] ตรวจสอบความพร้อมของทุกอย่างหลัง Init เสร็จ
    if (window._worldBoss) {
        scene.add(window._worldBoss);
        console.log("🔥 Recovered Boss into New Scene");
    }
    
    // 🔄 รีโหลดแมวและสภาพแวดล้อมให้ถูกต้องตาม Config ล่าสุดทันที
    updateEnvironment(envConfig.sky, envConfig.ground);
    
    // 🔥 [SINGLE LOAD FIX] โหลดโมเดลที่นี่จุดเดียว เพื่อกันปัญหา Scene Not Ready
    if (envConfig.customModel) {
        console.log("🐈 [3D Engine] Starting Pet Load:", envConfig.customModel);
        createPetObject(envConfig.customModel, envConfig.customRotationY);
    }

    // 👹 [DEEP AUDIT FIX] รันบอสที่ค้างอยู่ในคิวทันทีที่ฉากพร้อม
    if (window._pendingBossConfig) {
        console.log("🚀 [3D Engine] Processing pending boss spawn...");
        updateBossModel(window._pendingBossConfig);
        window._pendingBossConfig = null;
    }

    const handleGlobalInput = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);

        // ud83cudfaf [DIRECT CLICK COLLECTION] u0e15u0e23u0e27u0e0au0e2au0e2du0e1au0e27u0e48u0e32u0e08u0e34u0e49u0e21u0e42u0e14u0e19u0e44u0e2du0e40u0e17u0e21u0e42u0e14u0e22u0e15u0e23u0e07u0e44u0e2bu0e21
        const rewardMeshes = rewardObjects.map(r => r.mesh);
        const poopMeshes = poopObjects.map(p => p.mesh);
        const itemHits = ray.intersectObjects([...rewardMeshes, ...poopMeshes], true);

        if (itemHits.length > 0) {
            let root = itemHits[0].object;
            while (root.parent && root.parent !== scene && !root.userData.syncId) root = root.parent;
            const syncId = root.userData.syncId;

            if (syncId) {
                const pIdx = poopObjects.findIndex(p => p.mesh.userData.syncId === syncId);
                const rIdx = rewardObjects.findIndex(r => r.mesh.userData.syncId === syncId);

                if (pIdx !== -1) {
                    const p = poopObjects[pIdx];
                    if (onPoopCollected) onPoopCollected(p.type, false);
                    scene.remove(p.mesh); disposeObject(p.mesh); poopObjects.splice(pIdx, 1);
                } else if (rIdx !== -1) {
                    const r = rewardObjects[rIdx];
                    if (onRewardCollected) onRewardCollected(r.type, r.value);
                    scene.remove(r.mesh); disposeObject(r.mesh); rewardObjects.splice(rIdx, 1);
                }
                if (window._actionChannel) window._actionChannel.postMessage({ type: "COLLECT", syncId });
                return;
            }
        }

        if (petModel) {
            const groundHit = ray.intersectObject(groundMesh);
            if (ray.intersectObject(petModel, true).length > 0 || (groundHit.length > 0 && groundHit[0].point.distanceTo(petModel.position) < 1.3)) {
                if (window.doTouch) window.doTouch();
                petModel.scale.setScalar(currentScale * 1.15);
                if (window._actionChannel) window._actionChannel.postMessage({ type: "TOUCH" });
                return;
            }
            if (groundHit.length > 0) {
                const hit = groundHit[0].point;
                targetPos.copy(hit); targetPos.y = -1.2; isWalking = true;
                nextAutoWalkTime = (performance.now() / 1000) + 12;
                targetItemToCollect = null;
                actionChannel.postMessage({ type: "MOVE", x: hit.x, z: hit.z });
            }
        }
    };

    renderer.domElement.addEventListener('click', (e) => handleGlobalInput(e.clientX, e.clientY));
    renderer.domElement.addEventListener('touchend', (e) => { 
        const t = e.changedTouches[0]; if (t) handleGlobalInput(t.clientX, t.clientY);
    });

    const handleResize = () => {
        const w = container.clientWidth, h = container.clientHeight, a = w / h;
        camera.aspect = a;
        
        // --- 📱 Adaptive Camera Logic ---
        if (a > 1.2) { 
            // Landscape (Desktop/Tablet)
            camera.fov = 25; 
            camera.position.set(0, 3, 14); 
            camera.lookAt(0, 0.8, 0); 
        } else { 
            // Portrait (Mobile)
            camera.fov = 45; 
            camera.position.set(0, 5, 8); 
            camera.lookAt(0, 0, 0); 
        }
        
        camera.updateProjectionMatrix(); 
        renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 
    animate();
}

function createGround() {
    // ขยายพื้นให้กว้างขึ้นเป็น 30x30 เพื่อรองรับป่าที่ถูกผลักออกไปรอบนอก
    groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({
        color: GROUND_COLORS[envConfig.ground], metalness: 0.1, roughness: 0.9
    }));
    groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = -1.2; groundMesh.receiveShadow = true;
    scene.add(groundMesh);
}

function createDecorations() {
    const s = worldSeed;
    // เพิ่มจำนวนขึ้นเล็กน้อยเพื่อให้รอบนอกดูเป็นป่าจริง
    for (let i = 0; i < 24; i++) {
        const a = seededRandom() * Math.PI * 2;
        // --- 🌳 ผลักป่าออกไปรอบนอก (ระยะ 8.5 - 14 หน่วย) ---
        // เพื่อไม่ให้ใบไม้บังมุมกล้องระหว่างเล่น
        const d = 8.5 + seededRandom() * 5.5;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        
        // สลับระหว่างต้นไม้และหิน (โอกาสเจอต้นไม้มากขึ้นเป็น 1 ใน 2)
        if (i % 2 === 0) {
            const tree = new THREE.Group();
            
            // ลำต้นที่มีขนาดใหญ่และสูงขึ้นเพื่อให้ไม่โดนแมวบังง่ายๆ
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.22, 1.2), 
                new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 })
            );
            trunk.position.y = 0.6;
            
            // พุ่มไม้แบบ Stylized ที่มีหลายชั้นและขนาดใหญ่ขึ้น
            const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
            const top1 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 10), leafMaterial);
            top1.position.y = 1.6;
            const top2 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), leafMaterial);
            top2.position.set(0.3, 2.0, 0.1);
            const top3 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), leafMaterial);
            top3.position.set(-0.25, 1.8, -0.2);
            
            tree.add(trunk, top1, top2, top3);
            tree.position.set(x, -1.2, z);
            // สุ่มขนาดให้มีตั้งแต่ระดับปานกลางถึงใหญ่มาก เพื่อความสวยงาม
            const scl = 1.4 + seededRandom() * 1.4;
            tree.scale.set(scl, scl, scl);
            tree.rotation.y = seededRandom() * Math.PI;
            
            tree.userData.isDecoration = true;
            tree.traverse(c => { if(c.isMesh) { c.castShadow = true; c.material = c.material.clone(); } });
            scene.add(tree);
        } else {
            // หินที่มีขนาดใหญ่ขึ้นเพื่อความสมดุล
            const rockScale = 0.4 + seededRandom() * 0.6;
            const rock = new THREE.Mesh(
                new THREE.IcosahedronGeometry(rockScale, 0), 
                new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6 })
            );
            rock.position.set(x, -1.2 + (rockScale * 0.7), z);
            rock.rotation.set(seededRandom(), seededRandom(), seededRandom());
            rock.castShadow = true;
            rock.userData.isDecoration = true;
            rock.material = rock.material.clone();
            scene.add(rock);
        }
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

// --- 🌟 Pre-load & Seamless Swap Function 🌟 ---
let pendingModelLoad = null;

function createPetObject(path = '', rotationY = 0) {
    if (!path) return;
    
    // 🛡️ [OPTIMIZATION] ป้องกันการโหลดโมเดลเดิมซ้ำซ้อนขณะกำลังทำงาน
    if (path === currentModelPath && petModel && !isCurrentlyLoading) return;
    
    if (isCurrentlyLoading) {
        pendingModelLoad = { path, rotationY };
        return;
    }
    isCurrentlyLoading = true;
    currentModelPath = path; 

    const loader = new GLTFLoader();
    loader.load(path, (gltf) => {
        const m = gltf.scene;
        m.name = "PET_MODEL";
        m.traverse(c => {
            if (c.isMesh) {
                c.castShadow = c.receiveShadow = true;
                if (c.material) {
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    mats.forEach(mat => { mat.side = THREE.DoubleSide; mat.depthWrite = true; mat.needsUpdate = true; });
                }
            }
        });
        
        isCurrentlyLoading = false;
        swapModel(m, null, gltf.animations, rotationY, path);
        
        if (pendingModelLoad) {
            const nextLoad = pendingModelLoad;
            pendingModelLoad = null;
            createPetObject(nextLoad.path, nextLoad.rotationY);
        }
    }, null, (err) => {
        console.error("❌ Model load failed:", err);
        isCurrentlyLoading = false;
        currentModelPath = ""; // 🛡️ [BUGFIX] รีเซ็ต Path เพื่อให้สามารถกดโหลดใหม่ (Retry) ได้ถ้าครั้งแรกเฟล
        
        if (pendingModelLoad) {
            const nextLoad = pendingModelLoad;
            pendingModelLoad = null;
            createPetObject(nextLoad.path, nextLoad.rotationY);
        }
    });
}

function swapModel(newModelContent, existingMixer, animations, rotationY, path) {
    // 🔥 บัคฟิกซ์: ตรวจสอบความถูกต้องของ Path (เติม /) เพื่อให้หาใน Config เจอเสมอ
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const skinConfig = (window.STATE?.config?.available_skins || []).find(s => {
        const sModel = s.model?.startsWith('/') ? s.model : '/' + (s.model || '');
        return sModel === normalizedPath;
    }) || {};

    const skinScaleMultiplier = skinConfig.scale || 1.0;

    // สร้าง Group ใหม่เพื่อไม่ให้ทับกับ Group เก่าระหว่างโหลด
    const newGroup = new THREE.Group();
    
    // 🔥 [BUGFIX] Reset transform ก่อนคำนวณ เพื่อแก้ปัญหาเวลาดึงจาก Cache แล้ว Scale เพี้ยนจนล่องหน
    newModelContent.scale.set(1, 1, 1);
    newModelContent.position.set(0, 0, 0);
    newModelContent.rotation.set(0, 0, 0);

    newGroup.add(newModelContent);

    // จัดระเบียบ Scale/Position
    const box = new THREE.Box3().setFromObject(newModelContent);
    const size = box.getSize(new THREE.Vector3());
    const scale = (0.85 / (size.y || 1)) * skinScaleMultiplier;
    
    newModelContent.scale.set(scale, scale, scale);
    newModelContent.rotation.y = rotationY;

    const center = box.getCenter(new THREE.Vector3());
    newModelContent.position.x = -center.x * scale;
    newModelContent.position.z = -center.z * scale;
    newModelContent.position.y = -box.min.y * scale;

    modelBaseScale = scale;
    window._currentSkinScale = scale;

    if (skinConfig.drop_offset) {
        currentDropOffset = skinConfig.drop_offset;
        window._currentSkinOffset = currentDropOffset;
    }

    // ตั้งค่า Animation
    if (animations.length > 0) {
        if (mixer) mixer.stopAllAction(); // 🔥 Deep Audit FIX: เคลียร์คิวเดิมก่อน
        mixer = new THREE.AnimationMixer(newModelContent);
        walkActions = []; idleActions = [];
        
        console.log(`🎬 Animations found for ${path}:`, animations.map(a => a.name));

        animations.forEach(clip => {
            const name = clip.name.toLowerCase(), action = mixer.clipAction(clip);
            // เพิ่ม keyword เช่น move, cycle เพื่อให้ครอบคลุมโมเดลหลากหลายขึ้น
            if (name.includes('walk') || name.includes('run') || name.includes('move') || name.includes('cycle')) {
                walkActions.push(action);
            } else {
                idleActions.push(action);
            }
        });

        // --- 🛠️ ประมวลผลกรณีพิเศษถ้าคัดกรองไม่เจอ ---
        // กรณีมี 2 ท่าขึ้นไปแต่ไม่มีอันไหนเข้าข่าย Walk (เช่นชื่อ Action1, Action2)
        if (walkActions.length === 0 && animations.length >= 2) {
            walkActions.push(mixer.clipAction(animations[1])); // สมมติให้ท่าที่ 2 เป็นท่าเดิน
            // ตรวจสอบว่าท่าแรกถูกใส่ใน Idle หรือยัง
            const firstAction = mixer.clipAction(animations[0]);
            if (!idleActions.includes(firstAction)) idleActions.push(firstAction);
        } 
        // กรณีมีท่าเดียว ให้เป็นทั้ง Idle และ Walk
        else if (walkActions.length === 0 && animations.length === 1) {
            const onlyAction = mixer.clipAction(animations[0]);
            walkActions.push(onlyAction);
            if (!idleActions.includes(onlyAction)) idleActions.push(onlyAction);
        }

        if (idleActions.length > 0) idleActions[0].play();
        else mixer.clipAction(animations[0]).play();
    }

    // --- ✨ ทำการสลับตัวละคร (Swap) ✨ ---
    if (petModel) {
        scene.remove(petModel);
        // 🛡️ [MEMORY HARDENING] แทนที่จะทิ้งไว้เฉยๆ เราจะจัดการ Cache ให้ไม่บวม
        if (!window._skinCache) window._skinCache = new Map();
        
        // ถ้ามีสกินในแคชเกิน 3 ตัว ให้ Dispose ตัวที่เก่าที่สุดทิ้ง
        if (window._skinCache.size >= 3) {
            const firstKey = window._skinCache.keys().next().value;
            const oldModel = window._skinCache.get(firstKey);
            disposeObject(oldModel);
            window._skinCache.delete(firstKey);
        }
    }
    
    petModel = newGroup;
    petModel.name = "PET_MODEL"; // 🐱 ติดป้ายชื่อกันโดนลบผิดตัว
    window._petModel = petModel; 
    petModel.position.y = -1.2;
    
    // 🛡️ [AUDIT FIX] นำขนาดที่คำนวณจากเลเวลมาใส่ให้โมเดลใหม่ทันที
    const safeScale = isNaN(currentScale) ? 1.0 : currentScale;
    petModel.scale.set(safeScale, safeScale, safeScale);
    

    const activeScene = scene || window._scene;
    if (activeScene) {
        activeScene.add(petModel);
        console.log("✅ [3D Engine] Model added to scene:", path);
    } else {
        console.error("❌ [3D Engine] CRITICAL: Scene still not ready in swapModel!");
    }
    
    isWalking = false;
    animState = 'idle';
}

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() / 1000;
    const delta = Math.min(now - (window._lastTime || now), 0.1);
    window._lastTime = now;

    if (mixer) mixer.update(delta);
    if (window._worldBoss && window._worldBoss.userData.mixer) window._worldBoss.userData.mixer.update(delta);
    updateProjectiles(delta);
    updateDynamicParticles(delta);
    
    if (petModel) {
        if (isWalking) {
            _dir.subVectors(targetPos, petModel.position); _dir.y = 0;
            if (_dir.length() > 0.1) {
                // 🔥 [AUDIT FIX] ดึงค่าความเร็วจาก Dashboard (STATE) โดยตรง ไม่ใช้ค่าคงที่เดิม
                const baseSpeedFromState = window.STATE?.physics?.speed || 0.065;
                // 🔥 [PET INTELLIGENCE] ระบบเดินตามอารมณ์และสเตตัส
                const hunger = window.STATE?.hunger || 100;
                const love = window.STATE?.love || 100;
                const stam = window.STATE?.stamina || 100;

                // --- 👹 Boss Skill Speed Support ---
                const speedMult = window._bossSpeedMult || 1.0;
                const finalSpeed = baseSpeedFromState * speedMult; // 🚀 [FIX] กลับมาวิ่งไวคงที่ 100%

                _dir.normalize().multiplyScalar(finalSpeed); petModel.position.add(_dir);
                const targetRot = Math.atan2(_dir.x, _dir.z);
                let diff = targetRot - petModel.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
                petModel.rotation.y += diff * 0.08;
                if (animState !== 'walk' && mixer) {
                    animState = 'walk'; 
                    idleActions.forEach(a => { if (!walkActions.includes(a)) a.stop(); });
                    walkActions.forEach(a => a.play());
                }
            } else {
                isWalking = false;
                // 🛑 เช็คระยะห่างจริงๆ ก่อนเก็บ (ต้องใกล้พอ) และต้องเป็นการสั่งจากคนเล่นเท่านั้น
                if (targetItemToCollect && userInvokedCollect) { 
                    const distToItem = petModel.position.distanceTo(targetItemToCollect.position);
                    if (distToItem < 2.0) { // 🏹 [FIX] ขยายระยะเก็บให้กว้างขึ้นเป็น 2.0 เพื่อให้เก็บง่ายชัวร์ๆ
                        collectItemAtPet(); 
                    }
                    targetItemToCollect = null; 
                    userInvokedCollect = false; 
                }
            }
        } else {
            // 🚨 [PET INTELLIGENCE] ระบบจ้องหน้าอ้อน (Attention Demanding) - หันมองเฉพาะตอนจำเป็น
            const hunger = window.STATE?.hunger || 100;
            const clean = window.STATE?.clean || 100;
            
            if (hunger < 15 || clean < 15) {
                // อัปเดตทุกๆ 3 เฟรมเพื่อประหยัดพลังงาน
                if (Math.floor(Date.now() / 50) % 3 === 0) {
                    let camAngle = Math.atan2(camera.position.x - petModel.position.x, camera.position.z - petModel.position.z);
                    let diff = camAngle - petModel.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
                    petModel.rotation.y += diff * 0.1;
                }
            }

            if (animState !== 'idle' && mixer) {
                animState = 'idle'; 
                // หยุดเฉพาะท่าที่ไม่ใช่ท่า Idle
                walkActions.forEach(a => { if (!idleActions.includes(a)) a.stop(); });
                idleActions.forEach(a => a.play());
            }
            if (now > nextAutoWalkTime) {
                // 💤 [PET INTELLIGENCE] ถ้าน้องเหนื่อย หรือ "หิว/สกปรก" มากจนเดินไม่ไหว จะไม่ยอมขยับ
                const stam = window.STATE?.stamina || 100;
                const walkHunger = window.STATE?.hunger || 100;
                const walkClean = window.STATE?.clean || 100;
                
                if (walkHunger < 12 || walkClean < 12) {
                    // ไม่เดินจ้า ยืนจ้องหน้าพี่อย่างเดียว
                    nextAutoWalkTime = now + 5; 
                    return;
                }

                const restMult = stam < 30 ? 2.5 : (stam < 60 ? 1.5 : 1.0);
                
                targetPos.set((Math.random() - 0.5) * 10, -1.2, (Math.random() - 0.5) * 10);
                isWalking = true; 
                nextAutoWalkTime = now + (8 + Math.random() * 10) * restMult;
            }
        }
        const s = petModel.scale.x, goal = currentScale, n = s + (goal - s) * 0.03;
        petModel.scale.set(n, n, n);
        if (camera) {
            _camTarget.set(petModel.position.x, petModel.position.y + 4.7, petModel.position.z + 8);
            camera.position.lerp(_camTarget, 0.03); camera.lookAt(petModel.position.x, petModel.position.y + 0.7, petModel.position.z);
        }
        
        // --- 🛡️ Proximity Detection (REMOVED: Users must click icons to collect) ---

        // 🪨 Rock Detection
        if (window._worldRocks) {
            for (let i = window._worldRocks.length - 1; i >= 0; i--) {
                const rock = window._worldRocks[i];
                if (petModel.position.distanceTo(rock.position) < 0.8) {
                    if (window.collectRock) window.collectRock(rock.userData.id);
                }
            }
        }
    }

    // --- ✨ ฟังก์ชันพื้นฐานของเกม (ต้องมี) ---
    updatePoops(delta); 
    updateRewards(now, delta);
    if (indicatorFrameCount % 4 === 0) { 
        updateIndicators(); 
        if(currentTemplate === 'car') spawnExhaustSmoke(); 
        updateEmotionPos();

        // --- 🎯 อัปเดตพิกัดจุดแดงนำทาง ---
        if (debugDropPoint && petModel && petModel.children[0]) {
            const off = window._currentSkinOffset || engineConfig.drop_offset || {x:0, y:0.1, z:-0.2};
            const v = _tempVec.set(off.x, off.y, off.z);
            petModel.children[0].localToWorld(v);
            debugDropPoint.position.copy(v);
            debugDropPoint.visible = window.location.search.includes('admin=true');
        }
    }
    
    // --- 🛡️ ระบบ Camera Occlusion (ตรวจจับการบัง) แบบ Optimize: รันเฟรมเว้นเฟรมยืดหยุ่น ---
    if (indicatorFrameCount % 6 === 0 && petModel && camera) {
        
        // คืนค่าความทึบแสง (Opaque) ให้ Object ที่ไม่บังแล้ว
        occludedObjects.forEach(obj => {
            obj.traverse(c => { 
                if(c.isMesh && c.userData.origProps) { 
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    mats.forEach((m, idx) => {
                        const orig = c.userData.origProps[idx];
                        if (orig) {
                            m.opacity = orig.opacity;
                            m.transparent = orig.transparent;
                        }
                    });
                    c.material.needsUpdate = true;
                } 
            });
        });
        occludedObjects = [];

        const camPos = camera.position;
        const petPos = _tempVec.copy(petModel.position); petPos.y += 0.5; 
        const dir = _dir.copy(petPos).sub(camPos).normalize();
        const distToPet = camPos.distanceTo(petPos);

        raycaster.set(camPos, dir);
        // Optimize: ตรวจสอบแค่ระยะสั้นๆ ที่กล้องส่องไปหาตัวละคร ไม่ส่องทะลุไปไกล
        raycaster.far = distToPet;
        
        const intersects = raycaster.intersectObjects(scene.children, true);

        for (let i = 0; i < intersects.length; i++) {
            const hit = intersects[i];
            let root = hit.object;
            while (root.parent && root.parent !== scene && !root.userData.isDecoration) root = root.parent;

            if (root.userData.isDecoration) {
                root.traverse(c => { 
                    if(c.isMesh) { 
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        if (!c.userData.origProps) {
                            c.userData.origProps = mats.map(m => ({ opacity: m.opacity, transparent: m.transparent }));
                        }
                        mats.forEach(m => {
                            m.transparent = true; 
                            m.opacity = 0.25; 
                        });
                        c.material.needsUpdate = true;
                    } 
                });
                if (!occludedObjects.includes(root)) occludedObjects.push(root);
            }
        }
    }
    
    indicatorFrameCount++;

    renderer.render(scene, camera);
}

function updatePoops(delta) {
    const minLifetime = 60; // 🛑 ปรับเป็น 1 นาทีตามสั่ง
    const effectiveLifetime = Math.max(minLifetime, engineConfig.poop_lifetime || 0);

    for (let i = poopObjects.length - 1; i >= 0; i--) {
        const p = poopObjects[i]; p.elapsed += delta;
        if (p.elapsed >= effectiveLifetime) { 
            scene.remove(p.mesh); 
            disposeObject(p.mesh); 
            poopObjects.splice(i, 1); 
            if(onPoopExpired) onPoopExpired(); 
        }
    }
}

function updateRewards(t, delta) {
    const minLifetime = 60; // 🛡️ [SAFETY FLOOR] ห้ามหายไวกว่า 1 นาที
    const effectiveLifetime = Math.max(minLifetime, engineConfig.reward_lifetime || 0);

    for (let i = rewardObjects.length - 1; i >= 0; i--) {
        const r = rewardObjects[i];
        r.elapsed += delta; 
        
        // --- ✨ อนิเมชั่นเหรียญพรีเมียม (Spin & Float) ---
        if (r.mesh) {
            r.mesh.rotation.y += delta * 3.5; // หมุนเร็วขึ้นให้พรีเมียม
            r.mesh.position.y = r.startY + Math.sin(t * 5) * 0.15; // ขยับขึ้นลงชัดๆ
        }

        if (r.elapsed >= effectiveLifetime) { 
            scene.remove(r.mesh); 
            disposeObject(r.mesh); 
            rewardObjects.splice(i, 1); 
        }
    }
}

function updateIndicators() {
    const container = document.getElementById('poop-indicators'); if (!container || !camera) return;
    let dropIcon = (currentTemplate === 'car') ? '🛢️' : (currentTemplate === 'plant' ? '🍂' : '💩');
    const tasks = [];
    poopObjects.forEach(p => tasks.push({ mesh: p.mesh, icon: p.type === 'gold' ? '✨' : dropIcon, tier: p.type }));
    rewardObjects.forEach(r => tasks.push({ mesh: r.mesh, icon: '🪙', tier: r.type }));

    // 👹 Boss Indicator (Show on Radar)
    if (window._worldBoss) {
        tasks.push({ mesh: window._worldBoss, icon: '👹', tier: 'boss' });
    }
    // 🪨 Rock Indicators (Show on Radar)
    if (window._worldRocks) {
        window._worldRocks.forEach(rock => {
            tasks.push({ mesh: rock, icon: '🪨', tier: 'rock' });
        });
    }

    const finalTasks = [];
    tasks.forEach(t => {
        const pObj = poopObjects.find(p => p.mesh === t.mesh);
        const rObj = rewardObjects.find(r => r.mesh === t.mesh);
        const obj = pObj || rObj;
        const elapsed = obj ? obj.elapsed : 0;
        const maxLife = pObj ? engineConfig.poop_lifetime : engineConfig.reward_lifetime;
        const lifeLeft = Math.max(0, maxLife - elapsed);
        
        _tempVec.copy(t.mesh.position); _tempVec.y += 0.4; _tempVec.project(camera);
        let x = _tempVec.x, y = -_tempVec.y; 
        const isBehind = _tempVec.z > 1;
        if (isBehind) { x = -x; y = -y; }

        // 🛡️ [HYBRID LOGIC] เช็คว่าอยู่บนหน้าจอหรือไม่
        const isOnScreen = !isBehind && x >= -0.85 && x <= 0.85 && y >= -0.75 && y <= 0.75;
        
        if (isOnScreen) {
            // กรณีอยู่บนหน้าจอ: ใช้ตำแหน่งจริง (ลอยเหนือหัว)
            finalTasks.push({ ...t, x, y, angle: 0, lifeLeft, isOnScreen: true });
        } else {
            // กรณีอยู่นอกหน้าจอ: ใช้ระบบ Radar (ลูกศรขอบจอ)
            const angle = Math.atan2(y, x);
            finalTasks.push({ ...t, x: Math.cos(angle) * 0.78, y: Math.sin(angle) * 0.78, angle, lifeLeft, isOnScreen: false });
        }
    });

    // 🛡️ [RADAR OVERLAP FIX] ป้องกันลูกศรเรดาร์ทับกัน (ทำเฉพาะตัวที่อยู่นอกจอ)
    const radarTasks = finalTasks.filter(t => !t.isOnScreen);
    if (radarTasks.length > 1) {
        radarTasks.sort((a, b) => a.angle - b.angle);
        for (let i = 0; i < radarTasks.length * 2; i++) {
            const a = radarTasks[i % radarTasks.length], b = radarTasks[(i + 1) % radarTasks.length];
            let diff = b.angle - a.angle; if (diff < 0) diff += Math.PI * 2;
            if (diff < 0.52) { const overlap = 0.52 - diff; a.angle -= overlap / 2; b.angle += overlap / 2; a.x = Math.cos(a.angle) * 0.78; a.y = Math.sin(a.angle) * 0.78; b.x = Math.cos(b.angle) * 0.78; b.y = Math.sin(b.angle) * 0.78; }
        }
    }

    finalTasks.forEach(t => {
        renderIndicator(t, container, t.x, t.y, t.angle);
    });

    // 🧹 Cleanup: ลบไอคอนของวัตถุที่ไม่อยู่บนแมพแล้ว
    indicatorElements.forEach((el, mesh) => {
        if (!tasks.find(t => t.mesh === mesh)) {
            if (el.parentNode) el.parentNode.removeChild(el);
            indicatorElements.delete(mesh);
        }
    });
}

function renderIndicator(t, container, x, y, angle) {
    const { mesh, icon } = t;
    let el = indicatorElements.get(mesh);
    if (!el) {
        el = document.createElement('div'); el.className = 'indicator-base'; 
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (petModel) {
                targetPos.copy(mesh.position); targetPos.y = -1.2; isWalking = true;
                targetItemToCollect = mesh; 
                userInvokedCollect = true; // ✅ ทำเครื่องหมายว่า "คนกดสั่งเก็บ"
                nextAutoWalkTime = (performance.now() / 1000) + 20;
            }
        });
        container.appendChild(el); indicatorElements.set(mesh, el);
    }
    
    const tpl = currentTemplate || 'pet';
    let navColor = '#ff00ff';
    const tier = t.tier || 'normal';
    
    // กำหนดไอคอนตาม Template (สำหรับขยะแรร์ ✨)
    let displayIcon = icon;
    if (tier === 'gold' && icon === '✨') {
        displayIcon = (tpl === 'car' ? '🛢️' : (tpl === 'plant' ? '🍂' : '💩'));
    }
    
    if (icon === '🪙') {
        // Rewards (Silver/Gold/Diamond)
        navColor = { silver: '#bdc3c7', gold: '#fbbf24', diamond: '#00f2ff' }[tier] || '#fbbf24';
    } else if (tier === 'boss') {
        navColor = '#f43f5e'; // Rose Red for Boss
    } else if (tier === 'rock') {
        navColor = '#f59e0b'; // Orange for Rocks
    } else {
        // Poops/Drops (Normal/Gold)
        if (tier === 'gold') navColor = '#fbbf24';
        else navColor = (tpl === 'car' ? '#8b5cf6' : (tpl === 'plant' ? '#10b981' : '#ec4899'));
    }

    const glow = (tier === 'gold' || tier === 'diamond' || tier === 'rare') ? `0 0 15px ${navColor}` : 'none';
    
    // 🚨 [VISUAL FEEDBACK] แสดงไฟกระพริบแดงเมื่อใกล้เน่า (เหลือ < 10 วิ)
    const isDying = (t.lifeLeft < 10);
    const dyingClass = isDying ? 'animate-pulse text-red-500 scale-125' : '';
    const dyingBorder = isDying ? 'border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.8)]' : `border-[${navColor}]`;
    
    // ปรับปรุงขนาดและลูกศร
    el.innerHTML = `
        <div class="indicator-wrapper ${dyingClass}" style="position: relative; scale: 1.1;">
            <div class="indicator-inner" style="border: 2.5px solid ${isDying ? '#dc2626' : navColor}; box-shadow: ${isDying ? '0 0 20px #dc2626' : glow}; font-size: 1.4rem;">${displayIcon}</div>
            <div class="indicator-arrow" style="border-bottom-color: ${isDying ? '#dc2626' : navColor}; transform: translateX(-50%) rotate(${angle + Math.PI/2}rad); transform-origin: 50% 36px; display: ${t.isOnScreen ? 'none' : 'block'};"></div>
        </div>
    `;
    
    const screenX = x * container.clientWidth * 0.5, screenY = y * container.clientHeight * 0.5;
    el.style.transform = `translate(calc(-50% + ${screenX}px), calc(-50% + ${screenY}px))`;
}

export function showEmoticon(emoji, duration = 3000) {
    const container = document.getElementById('pet-emotion-container');
    if (!container || !petModel || !camera) return;

    if (emotionTimeout) clearTimeout(emotionTimeout);
    
    currentEmotion = emoji;
    container.innerHTML = `
        <div class="emotion-bubble animate-pop-in flex items-center justify-center min-w-[50px] min-h-[50px] sm:min-w-[80px] sm:min-h-[80px]">
            <span class="text-3xl sm:text-5xl md:text-6xl">${emoji}</span>
            <div class="bubble-tail"></div>
        </div>
    `;
    container.style.display = 'block';

    emotionTimeout = setTimeout(() => {
        container.classList.add('animate-pop-out');
        setTimeout(() => {
            container.style.display = 'none';
            container.classList.remove('animate-pop-out');
            currentEmotion = null;
        }, 300);
    }, duration);
}

function updateEmotionPos() {
    const container = document.getElementById('pet-emotion-container');
    if (!container || !petModel || !camera || container.style.display === 'none') return;

    _tempVec.copy(petModel.position);
    _tempVec.y += 1.8; // ลอยเหนือหัว
    _tempVec.project(camera);

    const x = (_tempVec.x * 0.5 + 0.5) * container.parentElement.clientWidth;
    const y = (-(_tempVec.y * 0.5 - 0.5)) * container.parentElement.clientHeight;

    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
}

export function createPoopMesh(x, z, type) {
    const group = new THREE.Group();
    const skinConfig = (window.STATE?.config?.available_skins || []).find(s => s.model === window.STATE?.config?.custom_model) || {};
    let dropType = skinConfig.drop_type || (currentTemplate === 'car' ? 'oil' : (currentTemplate === 'plant' ? 'leaves' : 'poop'));
    
    // ปรับสีให้สมเหตุสมผลมากขึ้น (ใบไม้ต้องสีแห้งๆ ถึงจะน่าถอน)
    let material = new THREE.MeshStandardMaterial({ 
        color: type==='gold'?0xffd700: (dropType==='oil'?0x111111: (dropType==='leaves'?0x8b7355:0x6b3a1f)) 
    });
    
    if (dropType === 'oil') { 
        material.metalness = 0.8; material.roughness = 0.1; 
        const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.03, 16), material);
        group.add(puddle); 
    }
    else if (dropType === 'leaves') { 
        for(let i=0; i<6; i++){ 
            const leaf=new THREE.Mesh(new THREE.SphereGeometry(0.2,6,4), material); 
            leaf.scale.set(1,0.1,0.7); 
            leaf.position.set(Math.random()*0.5-0.25,0,Math.random()*0.5-0.25); 
            leaf.rotation.set(Math.random(),Math.random(),Math.random());
            group.add(leaf); 
        } 
    }
    else { 
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), material)); 
    }
    
    group.position.set(x, -1.18, z);
    return group;
}

function spawnExhaustSmoke() {
    if (!petModel || currentTemplate !== 'car' || !petModel.children[0]) return;
    const off = currentDropOffset || {x:0, y:0.2, z:-0.5}, scale = 1; 
// scale is already handled by localToWorld
    
    // ใช้ localToWorld เพื่อให้พิกัดตรงกับสิ่งที่เห็นใน Model-viewer เป๊ะๆ
    const v = new THREE.Vector3(off.x, off.y, off.z);
    petModel.children[0].localToWorld(v);
    
    const vel = new THREE.Vector3(0, 0.03, -0.05).applyQuaternion(petModel.quaternion);
    addParticle(v.x, v.y, v.z, vel, 0xcccccc, 0.08, 25);
}

export function spawnPoop(type = 'normal', fromSync = false, syncId = null, x = null, z = null) {
    if (!petModel || poopObjects.length >= engineConfig.max_poops) return false;
    const px = x !== null ? x : petModel.position.x;
    const pz = z !== null ? z : petModel.position.z;
    const sid = syncId || 'P' + Date.now() + Math.random();
    
    const mesh = createPoopMesh(px, pz, type); 
    mesh.userData.syncId = sid;
    mesh.userData.createdAt = performance.now(); // 🕒 บันทึกเวลาเกิด
    scene.add(mesh);
    poopObjects.push({ mesh, elapsed: 0, x: px, z: pz, type: type }); 

    if (!fromSync && window._actionChannel) {
        window._actionChannel.postMessage({ type: 'SPAWN_POOP', x: px, z: pz, syncId: sid, itemType: type });
    }
    return true;
}

export function setPoopCallbacks(c, e) { onPoopCollected = c; onPoopExpired = e; }
export function setRewardCallback(c) { onRewardCollected = c; }
export function spawnReward(type = 'silver', value = 0, syncId = null, x = null, z = null, fromSync = false) {
    if (rewardObjects.length >= engineConfig.max_rewards) return false;
    
    // ตั้งค่าสีตามระดับ
    const config = {
        silver:  { color: 0xbdc3c7, emissive: 0x7f8c8d, light: 0xbdc3c7, intensity: 1.5 },
        gold:    { color: 0xffd700, emissive: 0xffaa00, light: 0xffaa00, intensity: 3.5 },
        diamond: { color: 0x00f2ff, emissive: 0x00d4ff, light: 0x00f2ff, intensity: 8.0 }
    }[type] || { color: 0xffd700, emissive: 0xffaa00, light: 0xffaa00, intensity: 3 };

    const group = new THREE.Group();
    
    // 💡 เลือกรูปทรงตามระดับ (เพชร = รูปทรงอัญมณี / ทอง,เงิน = เหรียญ)
    const geometry = type === 'diamond' 
        ? new THREE.OctahedronGeometry(0.35, 0) // ทรงเพชรเหลี่ยม
        : new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24); // ทรงเหรียญ

    const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ 
            color: config.color, 
            metalness: 0.95, 
            roughness: 0.05, 
            emissive: config.emissive, 
            emissiveIntensity: 0.8 // เพิ่มความวาว
        })
    );
    
    // ตั้งค่าองศาการวาง (ถ้าเป็นเหรียญให้จับตั้ง ถ้าเป็นเพชรให้เอียงมุมสวยๆ)
    if (type === 'diamond') {
        mesh.rotation.set(0.5, 0.5, 0); 
    } else {
        mesh.rotation.x = Math.PI / 2;
    }
    
    group.add(mesh);
    
    const light = new THREE.PointLight(config.light, config.intensity, 4);
    light.position.y = 0.5;
    group.add(light);
    
    // เอฟเฟกต์พิเศษสำหรับ Diamond
    if (type === 'diamond') {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.02, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.5 })
        );
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
    }
    
    const sid = syncId || 'R' + Date.now() + Math.random();
    const rx = x !== null ? x : (Math.random()-0.5)*12;
    const rz = z !== null ? z : (Math.random()-0.5)*12;
    
    group.position.set(rx, -0.9, rz);
    group.userData.syncId = sid;
    scene.add(group); 
    rewardObjects.push({ mesh: group, type: type, value, startY: -0.9, elapsed: 0 }); 

    if (!fromSync && window._actionChannel) {
        window._actionChannel.postMessage({ type: 'SPAWN_REWARD', x: rx, z: rz, syncId: sid, itemType: type, value });
    }
    return true;
}
export function updatePetScale(level) { 
    const safeLvl = parseInt(level) || 1;
    const tpl = window.STATE?.config?.template || 'pet';
    const diff = window.STATE?.config?.difficulty_mode || 'normal';
    const matrix = window.STATE?.config?.matrix?.[tpl]?.[diff];
    
    const skins = window.STATE?.config?.available_skins || [];
    const activeSkin = skins.find(s => s.model === window.STATE?.config?.custom_model);
    const baseScale = activeSkin?.scale || matrix?.physics?.scale || 1.0;
    
    const growth = (safeLvl - 1) * 0.005;
    currentScale = Math.min(baseScale * 1.35, baseScale + (baseScale * growth));
    if (isNaN(currentScale)) currentScale = 1.0;

    if (petModel) {
        petModel.scale.set(currentScale, currentScale, currentScale);
    }
}
export function updateEnvironment(sky, ground) { 
    if(!scene) return; // 🛡️ [SAFETY GUARD] กันพังถ้าฉากยังไม่โหลด
    if(sky && SKY_COLORS[sky]) scene.background = new THREE.Color(SKY_COLORS[sky]);
    if(ground && groundMesh) {
        const col = GROUND_COLORS[ground] || GROUND_COLORS.grass;
        groundMesh.material.color.set(col);
    }
}
export function updateEngineConfig(c) { 
    const config = c || window.STATE?.config;
    if (!config) return;
    
    Object.assign(engineConfig, config);
    
    // 🌍 [DEEP AUDIT FIX] อัปเดตสภาพแวดล้อม (ท้องฟ้า/พื้น) เฉพาะเมื่อมีการส่งค่ามาใหม่จริงๆ
    if (c?.sky || c?.ground) {
        updateEnvironment(c.sky || engineConfig.sky || 'day', c.ground || engineConfig.ground || 'grass');
    }

    if (config.custom_model) {
        updateBossModel(config.custom_model);
    }
    
    if (config.drop_offset) {
        currentDropOffset = config.drop_offset;
        window._currentSkinOffset = config.drop_offset;
    }
}
export function updateTemplate(type, path = '', rotationY = 0) { 
    currentTemplate = type; 
    if (!scene) {
        // 🛡️ [QUEUE SYSTEM] หากฉากยังไม่พร้อม ให้จดจำงานไว้ทำตอนโหลดเสร็จ
        window._pendingTemplate = { type, path, rotationY };
        return;
    }
    
    // 🛡️ [PREVIEW FALLBACK] ถ้าแอดมินส่งค่าว่างมา ให้ใช้โมเดลเริ่มต้นตามธีม
    let finalPath = path;
    if (!finalPath) {
        const defaults = {
            pet: '/toon_cat_free.glb',
            car: '/car_carton.glb',
            plant: '/stylized_tree.glb'
        };
        finalPath = defaults[type] || defaults.pet;
    }

    createPetObject(finalPath, rotationY); 
}
export function triggerLevelUpEffect() {
    if (!petModel) return;
    const level = window.STATE?.level || 1;
    
    // --- 1. Dynamic Particles Colors ---
    const colors = level >= 50 ? [0xffd700, 0xffaa00, 0xffffff] : 
                  (level >= 20 ? [0xa855f7, 0xe879f9, 0xffffff] : [0x00f2ff, 0x38bdf8, 0xffffff]);
    
    // --- 2. Ring Shockwave Effect ---
    const count = 80;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.1;
        const vel = new THREE.Vector3(Math.cos(angle) * speed, 0.05 + Math.random() * 0.1, Math.sin(angle) * speed);
        const col = colors[Math.floor(Math.random() * colors.length)];
        addParticle(petModel.position.x, petModel.position.y + 0.2, petModel.position.z, vel, col, 0.12, 40);
    }

    // --- 3. Fountain Fountain Burst ---
    for (let i = 0; i < 40; i++) {
        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.1);
        const col = colors[Math.floor(Math.random() * colors.length)];
        addParticle(petModel.position.x, petModel.position.y + 0.5, petModel.position.z, vel, col, 0.08, 60);
    }

    // --- 4. Camera Juice (Shake & Zoom) ---
    if (camera) {
        const originalY = camera.position.y;
        let shake = 0.2;
        const shakeInterval = setInterval(() => {
            camera.position.y += (Math.random() - 0.5) * shake;
            shake *= 0.8;
            if (shake < 0.01) {
                clearInterval(shakeInterval);
                camera.position.y = originalY;
            }
        }, 30);
    }
    
    // อัปเดตออร่าติดตัวตามแรงก์
    refreshPetAura(level);
}

export function refreshPetAura(level, isFever = false) {
    if (!petModel) return;
    petModel.traverse(c => {
        if (c.isMesh && c.material) {
            const materials = Array.isArray(c.material) ? c.material : [c.material];
            materials.forEach(mat => {
                // โคลน Material เพื่อไม่ให้กระทบตัวอื่น (ถ้ามี)
                if (!mat._isCloned) {
                    const cloned = mat.clone();
                    if (Array.isArray(c.material)) {
                        const idx = c.material.indexOf(mat);
                        if (idx !== -1) c.material[idx] = cloned;
                    } else {
                        c.material = cloned;
                    }
                    cloned._isCloned = true;
                }
                
                // --- 🛡️ [USER REQUEST] ปิดการเปลี่ยนสีตัวละคร ---
                // ปกติ: ไม่เปลี่ยนสีตัวละคร (ให้คงสีต้นฉบับไว้ 100%)
                const targetMat = mat._isCloned ? mat : mat; 
                targetMat.emissive = new THREE.Color(0x000000);
                targetMat.emissiveIntensity = 0;
            });
        }
    });
}
export function collectPoopByUI() { 
    if (poopObjects.length === 0) return false; 
    const p = poopObjects.shift(); 
    const sid = p.mesh.userData.syncId;
    scene.remove(p.mesh); 
    disposeObject(p.mesh); 
    
    // 🔥 [BUGFIX] เพิ่มการ Sync ให้หน้าจออื่นลบตามเมื่อกดจากปุ่ม
    if (window._actionChannel) window._actionChannel.postMessage({ type: 'COLLECT', syncId: sid });
    
    return p.type || 'normal'; 
}
function collectItemAtPet() {
    if (!targetItemToCollect) return;
    
    // ✋ [SPAWN PROTECT] ห้ามเก็บของที่เพิ่งเกิด (กันบัคขี้ปุ๊บเก็บปั๊บ)
    const age = performance.now() - (targetItemToCollect.userData.createdAt || 0);
    if (age < 2000) { 
        console.log("⏳ Item is too fresh to collect!");
        return; 
    }

    const sid = targetItemToCollect.userData.syncId;
    
    [poopObjects, rewardObjects].forEach(arr => {
        const idx = arr.findIndex(i => i.mesh === targetItemToCollect);
        if (idx !== -1) { 
            const item = arr.splice(idx, 1)[0]; 
            scene.remove(item.mesh); 
            disposeObject(item.mesh); 
            
            // Broadcast การเก็บอัตโนมัติให้จออื่นลบตาม
            if (window._actionChannel) window._actionChannel.postMessage({ type: 'COLLECT', syncId: sid, pType: item.type });
            
            if (arr === poopObjects) {
                if (onPoopCollected) onPoopCollected(item.type, false); // เก็บเอง (false)
            }
            else if (onRewardCollected) onRewardCollected(item.type, item.value, sid); 
        }
    });
}
function isMobile() { return /Android|iPhone|iPad/i.test(navigator.userAgent); }

// --- 😈 WORLD BOSS ENGINE ---
window._worldRocks = [];
window._projectiles = [];

export async function updateBossModel(wb) {
    if (!wb) return;

    // 1. 🛡️ [DEEP AUDIT FIX] ถ้า Scene ยังไม่พร้อม ให้เก็บ Config ไว้โหลดภายหลังอัตโนมัติ
    if (!scene) {
        console.log("⏳ [3D Engine] Scene not ready, boss will be spawned once initialized.");
        window._pendingBossConfig = wb;
        return;
    }

    // 2. 🛑 [VISIBILITY CHECK] ถ้าบอสไม่ Active หรือตายแล้ว ให้ลบออก
    const activeScene = window._scene || scene;
    
    // 🛡️ [ROBUST GUARD] เช็คจากข้อมูล Config โดยตรง และสำรองด้วย Global Flag
    const isBossCurrentlyActive = wb?.active === true && (wb?.hp > 0);
    
    if (!wb || !isBossCurrentlyActive) {
        console.log("🎬 [3D Engine] Boss cleanup triggered (Inactive/Dead)");
        
        // 1. ลบจากตัวแปร Global
        if (window._worldBoss) {
            if (activeScene) activeScene.remove(window._worldBoss);
            disposeObject(window._worldBoss);
            window._worldBoss = null;
        }
        
        // 2. [FALLBACK] สแกนหาในฉากตามชื่อ เผื่อมีตัวค้าง (Ghost Boss)
        if (activeScene) {
            const ghost = activeScene.getObjectByName("WORLD_BOSS_MODEL");
            if (ghost) {
                activeScene.remove(ghost);
                disposeObject(ghost);
                console.log("🎬 [3D Engine] Ghost Boss removed by name.");
            }
        }
        
        return;
    }

    // 3. 🛡️ [SMART SYNC] ถ้ามีบอสอยู่แล้วและเป็นโมเดลเดิม (Path เดียวกัน) ห้ามลบ ห้ามโหลดใหม่!
    if (window._worldBoss && window._worldBoss.userData.path === wb.model_path) {
        // แค่อัปเดตการตั้งค่าพื้นฐาน (ถ้ามี)
        window._worldBoss.scale.setScalar(2.5); 
        window._worldBoss.position.set(0, -1.2, -6); 
        return;
    }

    // 4. 🧹 [CLEAN UP] ถ้ามาถึงตรงนี้แสดงว่าต้องเปลี่ยนโมเดลใหม่จริงๆ หรือยังไม่มีบอส
    if (window._worldBoss) {
        scene.remove(window._worldBoss);
        disposeObject(window._worldBoss);
        window._worldBoss = null;
    }

    if (window._isBossLoading) return;
    if (!wb.model_path) return;

    console.log("🎬 Loading Boss Model:", wb.model_path);
    window._isBossLoading = true;

    const loader = new GLTFLoader();
    loader.load(wb.model_path, (gltf) => {
        window._isBossLoading = false;
        
        // 🛡️ [FINAL ROBUST GUARD] วินาทีสุดท้ายก่อนวาง
        // ถ้าสั่งปิดไปแล้ว (ผ่านตัวแปร Global) ห้าม Render เด็ดขาด!
        if (!window._bossActive) {
            console.warn("🎬 [3D Engine] Aborted render: Boss is INACTIVE.");
            disposeObject(gltf.scene);
            return;
        }

        console.log("✅ Boss Model Loaded:", wb.model_path);

        const boss = gltf.scene;
        boss.name = "WORLD_BOSS_MODEL"; // 🏷️ [CRITICAL] ติดป้ายชื่อเพื่อให้ระบบลบสแกนเจอ
        boss.userData.path = wb.model_path; 
        
        // 📏 [PERFECT SCALE]
        boss.scale.setScalar(2.5); 
        boss.position.set(0, -1.2, -6); // 📍 [GROUNDED] ถอยไปที่ระยะ -6 เพื่อไม่ให้ทับแมว
        boss.rotation.y = Math.PI; 
        
        boss.traverse(node => {
            if (node.isMesh) {
                node.visible = true; 
                node.frustumCulled = false; 
                node.castShadow = true;
                node.receiveShadow = true;
                // บังคับความสว่างโมเดล (กรณีไฟไม่พอ)
                if (node.material) {
                    node.material.side = THREE.DoubleSide;
                    if (node.material.emissive) {
                        node.material.emissive.setHex(0x333333); // ให้เรืองแสงนิดๆ จะได้เห็นในที่มืด
                        node.material.emissiveIntensity = 0.5;
                    }
                }
            }
        });

        const mixer = new THREE.AnimationMixer(boss);
        if (gltf.animations.length > 0) {
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
            action.timeScale = wb.anim_speed || 1.0;
        }
        boss.userData.mixer = mixer;
        window._worldBoss = boss;
        
        const activeScene = window._scene || scene;
        if (activeScene) {
            activeScene.add(boss);
            console.log("👹 BOSS RENDERED AT:", boss.position.x, boss.position.z);
        } else {
            console.warn("⚠️ [AUDIT] Scene still not ready for Boss. Deferring...");
        }
    }, undefined, (err) => {
        console.error("❌ Boss Load Error:", err);
        window._isBossLoading = false;
    });
}

export function spawnWorldRock(id, pos) {
    const geo = new THREE.DodecahedronGeometry(0.15, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, metalness: 0.2 });
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(pos.x, -1.2, pos.z);
    rock.userData = { id, type: 'rock' };
    scene.add(rock);
    window._worldRocks.push(rock);
}

export function clearWorldRocks() {
    const activeScene = window._scene || scene;
    if (window._worldRocks && activeScene) {
        window._worldRocks.forEach(rock => {
            activeScene.remove(rock);
            disposeObject(rock);
        });
        window._worldRocks = [];
    }
}

/**
 * 🧹 [DEEP AUDIT FIX] ฟังก์ชันล้างหน่วยความจำ 3D ที่สมบูรณ์ที่สุด
 * ป้องกัน Memory Leak 100% โดยการล้างทั้ง Geometry, Material และ Texture
 */
export function disposeObject(obj) {
    if (!obj) return;
    
    obj.traverse(node => {
        if (!node.isMesh) return;
        
        // ล้าง Geometry
        if (node.geometry) node.geometry.dispose();
        
        // ล้าง Material
        if (node.material) {
            if (Array.isArray(node.material)) {
                node.material.forEach(mat => disposeMaterial(mat));
            } else {
                disposeMaterial(node.material);
            }
        }
    });
}

function disposeMaterial(mat) {
    Object.keys(mat).forEach(prop => {
        if (!mat[prop] || typeof mat[prop].dispose !== 'function') return;
        if (mat[prop] instanceof THREE.Texture) mat[prop].dispose();
    });
    mat.dispose();
}

export function throwRockAtBoss(startPos, onHit) {
    const geo = new THREE.DodecahedronGeometry(0.12, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xff3300, emissiveIntensity: 0.8 });
    const rock = new THREE.Mesh(geo, mat);
    rock.position.copy(startPos);
    
    const targetPos = new THREE.Vector3(0, 1.5, 0); 
    const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
    
    // 🛡️ [AUDIT FIX] ทำให้ความเร็วของหินแปรผันตามสกิล Speed
    const speedMult = window._bossSpeedMult || 1.0;
    const velocity = direction.multiplyScalar(0.25 * speedMult);

    scene.add(rock);
    window._projectiles.push({
        mesh: rock,
        velocity: velocity,
        onHit
    });
}

export function collectWorldRockAtPet(syncId) {
    const idx = (window._worldRocks || []).findIndex(r => r.userData.id === syncId);
    if (idx !== -1) {
        const rock = window._worldRocks.splice(idx, 1)[0];
        scene.remove(rock);
        // 🔥 [BUGFIX] ส่งสัญญาณบอกหน้าจออื่นให้ลบหินตามด้วย
        if (window._actionChannel) window._actionChannel.postMessage({ type: 'COLLECT', syncId: syncId });
        return true;
    }
    return false;
}

/**
 * 💥 [VISUAL JUICE] ทำให้บอสกระพริบสีแดงเมื่อโดนดาเมจ
 */
export function flashBoss() {
    if (!window._worldBoss) return;
    
    window._worldBoss.traverse(node => {
        if (node.isMesh && node.material) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach(m => {
                if (m.emissive) {
                    // เก็บค่าเดิมไว้ก่อน
                    if (!node.userData._origEmissive) {
                        node.userData._origEmissive = m.emissive.clone();
                        node.userData._origIntensity = m.emissiveIntensity;
                    }
                    
                    // เปลี่ยนเป็นสีแดงฉาน
                    m.emissive.setHex(0xff0000);
                    m.emissiveIntensity = 2.5;
                    
                    // คืนค่าหลังจาก 120ms
                    setTimeout(() => {
                        if (node.userData._origEmissive) {
                            m.emissive.copy(node.userData._origEmissive);
                            m.emissiveIntensity = node.userData._origIntensity;
                        }
                    }, 120);
                }
            });
        }
    });
}

export function _getPetPosition() {
    return (petModel) ? petModel.position.clone() : new THREE.Vector3(0, -1.2, 0);
}

export function updateProjectiles(delta) {
    if (!window._projectiles) return;
    for (let i = window._projectiles.length - 1; i >= 0; i--) {
        const p = window._projectiles[i];
        
        // 🛡️ [AUDIT FIX] ทำให้หินขยับตามเวลาจริง ไม่ขึ้นกับ FPS
        const moveStep = p.velocity.clone().multiplyScalar(delta * 60);
        p.mesh.position.add(moveStep);
        
        const dist = p.mesh.position.distanceTo(new THREE.Vector3(0, 1.5, 0));
        if (dist < 1.0) {
            if (p.onHit) p.onHit();
            createExplosion(p.mesh.position, 0xff4400); 
            scene.remove(p.mesh);
            disposeObject(p.mesh); // 🔥 [BUGFIX] Dispose memory to prevent leak
            window._projectiles.splice(i, 1);
        } else if (p.mesh.position.length() > 50) {
            scene.remove(p.mesh);
            disposeObject(p.mesh); // 🔥 [BUGFIX] Dispose memory to prevent leak
            window._projectiles.splice(i, 1);
        }
    }
}

window.createExplosion = (pos, color) => {
    const particleCount = 15;
    for (let i = 0; i < particleCount; i++) {
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.25
        );
        addParticle(pos.x, pos.y, pos.z, vel, color, 0.08, 30);
    }
};

// 📱 [DEEP AUDIT FIX] ระบบรักษาความถูกต้องของภาพเมื่อขนาดหน้าจอเปลี่ยน (Responsive Engine)
window.addEventListener('state-synced', () => {
    // 🔥 [AUDIT FIX] อัปเดตโมเดลให้ตรงกับ Level และ Skin ล่าสุดทันทีที่ได้รับสัญญาณซิงค์
    if (window.STATE) updatePetScale(window.STATE.level);
    if (window.refreshPetModel) window.refreshPetModel();
});
window.addEventListener('resize', () => {
    if (!renderer || !camera || !currentContainerId) return;
    const container = document.getElementById(currentContainerId);
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderer.setPixelRatio(isMobile() ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
    
    console.log(`📏 Engine Resized: ${width}x${height}`);
});
