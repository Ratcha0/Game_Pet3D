import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, petModel, particles, groundMesh, debugDropPoint;
let ambientLight, sunLight, purpleLight, pinkLight, mixer;
let currentTemplate = 'pet';
let currentDropOffset = { x: 0, y: 0.1, z: -0.2 };
let currentAction = null;
let envConfig = { sky: 'day', ground: 'grass' };

// --- 🏃 Walking & Animation state ---
let targetPos = new THREE.Vector3(0, -1.2, 0);
let isWalking = false;
let nextAutoWalkTime = 0;
let walkActions = [];
let idleActions = [];
let animState = 'idle';
let modelBaseScale = 1;
let targetPetScale = 1;

// --- ❄️ Cache & Seamless Swap ---
const modelCache = new Map();
let isCurrentlyLoading = false;
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

function updateDynamicParticles() {
    for (let i = dynamicParticles.length - 1; i >= 0; i--) {
        const p = dynamicParticles[i];
        p.lifetime--;
        p.mesh.position.add(p.velocity);
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

function disposeObject(obj) {
    if (!obj) return;
    const el = indicatorElements.get(obj);
    if (el) { el.remove(); indicatorElements.delete(obj); }
    obj.traverse(node => {
        if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach(mat => {
                    mat.dispose();
                    // Dispose associated textures
                    ['map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 'envMap', 'emissiveMap', 'metalnessMap', 'roughnessMap'].forEach(mapName => {
                        if (mat[mapName] && mat[mapName].dispose) mat[mapName].dispose();
                    });
                });
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
    
    // สร้างจุดเล็งสีแดงเพื่อช่วย Admin กะระยะ (Debug Hotspot)
    const debugGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true, opacity: 0.8 });
    debugDropPoint = new THREE.Mesh(debugGeo, debugMat);
    debugDropPoint.renderOrder = 999;
    scene.add(debugDropPoint);
    debugDropPoint.visible = window.location.search.includes('admin=true');

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
    sunLight.shadow.mapSize.set(128, 128); sunLight.shadow.bias = -0.01;
    scene.add(sunLight);

    purpleLight = new THREE.PointLight(0x8b5cf6, 8, 20); purpleLight.position.set(-3, 3, 0); scene.add(purpleLight);
    pinkLight = new THREE.PointLight(0xec4899, 6, 15); pinkLight.position.set(3, 2, -2); scene.add(pinkLight);

    createGround();
    createDecorations();
    createParticles();
    createPetObject(customModel, customRotationY);

    const actionChannel = new BroadcastChannel('like-gotchi-action-sync');
    actionChannel.onmessage = (e) => {
        const { type, x, z, syncId, itemType, value } = e.data;
        
        if (type === 'MOVE' && petModel) {
            targetPos.set(x, -1.2, z);
            isWalking = true;
            nextAutoWalkTime = (performance.now() / 1000) + 12;
        }
        else if (type === 'TOUCH' && petModel) {
            if (window.doTouch) window.doTouch();
            petModel.scale.setScalar(targetPetScale * 1.15);
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
            }
            const rIdx = rewardObjects.findIndex(r => r.mesh.userData.syncId === syncId);
            if (rIdx !== -1) {
                const r = rewardObjects[rIdx];
                scene.remove(r.mesh); disposeObject(r.mesh); rewardObjects.splice(rIdx, 1);
            }
        }
    };

    window._actionChannel = actionChannel; // เก็บไว้ใช้ในฟังก์ชันอื่น

    window.addEventListener('resize', () => {
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    const handleGlobalInput = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);

        // [Physical Update] ยกเลิกการคลิกแล้วเก็บทันที เพื่อให้ต้องเดินเข้าไปชนจริงๆ เท่านั้น
        // (Removing Direct Click Collection Loop)

            if (petModel) {
            const groundHit = ray.intersectObject(groundMesh);
            if (ray.intersectObject(petModel, true).length > 0 || (groundHit.length > 0 && groundHit[0].point.distanceTo(petModel.position) < 1.3)) {
                if (window.doTouch) window.doTouch();
                petModel.scale.setScalar(targetPetScale * 1.15);
                
                // กระจายท่าทาง "โดนจิ้ม" ให้จออื่นเด้งตาม
                if (window._actionChannel) window._actionChannel.postMessage({ type: 'TOUCH' });
                return;
            }
            if (groundHit.length > 0) {
                const hit = groundHit[0].point;
                targetPos.copy(hit); targetPos.y = -1.2; isWalking = true;
                nextAutoWalkTime = (performance.now() / 1000) + 12;
                targetItemToCollect = null;
                
                // กระจายคำสั่งเดินให้จออื่น
                actionChannel.postMessage({ type: 'MOVE', x: hit.x, z: hit.z });
            }
        }
    };

    renderer.domElement.addEventListener('click', (e) => handleGlobalInput(e.clientX, e.clientY));
    renderer.domElement.addEventListener('touchend', (e) => { 
        const t = e.changedTouches[0]; if (t) handleGlobalInput(t.clientX, t.clientY);
    });

    const handleResize = () => {
        const w = container.clientWidth, h = container.clientHeight, a = w/h;
        camera.aspect = a;
        if (a > 1.2) { camera.fov = 25; camera.position.set(0, 3, 14); camera.lookAt(0, 0.8, 0); }
        else { camera.fov = 45; camera.position.set(0, 5, 8); camera.lookAt(0, 0, 0); }
        camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    handleResize(); animate();
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
    
    // ถ้าเคยโหลดแล้ว ให้ดึงจาก Cache (เด้งขึ้นทันใจ)
    if (modelCache.has(path)) {
        const cached = modelCache.get(path);
        swapModel(cached.model, cached.mixer, cached.animations, rotationY, path);
        return;
    }

    if (isCurrentlyLoading) {
        // Queue the request if something is already downloading
        pendingModelLoad = { path, rotationY };
        return;
    }
    isCurrentlyLoading = true;

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
        
        // เก็บเข้า Cache
        modelCache.set(path, { model: m, mixer: null, animations: gltf.animations });
        isCurrentlyLoading = false;
        
        swapModel(m, null, gltf.animations, rotationY, path);
        
        // Process next in queue if any
        if (pendingModelLoad) {
            const nextLoad = pendingModelLoad;
            pendingModelLoad = null;
            createPetObject(nextLoad.path, nextLoad.rotationY);
        }
        
    }, null, (err) => {
        console.error("Load failed:", err);
        isCurrentlyLoading = false;
        
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
        // เราจะไม่ dispose ตัวเก่าทิ้ง เพื่อให้ถ้าสลับกลับมาจะเร็วขึ้น
    }
    
    petModel = newGroup;
    petModel.position.y = -1.2;
    scene.add(petModel);
    
    // รีเซ็ตสถานะการเดิน
    isWalking = false;
    animState = 'idle';
}

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() / 1000;
    const delta = Math.min(now - (window._lastTime || now), 0.1);
    window._lastTime = now;

    if (mixer) mixer.update(delta);
    updateDynamicParticles();
    
    if (petModel) {
        if (isWalking) {
            _dir.subVectors(targetPos, petModel.position); _dir.y = 0;
            if (_dir.length() > 0.1) {
                let baseSpeed = (currentTemplate === 'car') ? 0.085 : (currentTemplate === 'plant' ? 0.06 : 0.05);
                const stam = window.STATE?.stamina || 100;
                const stamFactor = stam < 20 ? 0.6 : (stam < 50 ? 0.85 : 1.0);
                const finalSpeed = baseSpeed * stamFactor;

                _dir.normalize().multiplyScalar(finalSpeed); petModel.position.add(_dir);
                const targetRot = Math.atan2(_dir.x, _dir.z);
                let diff = targetRot - petModel.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
                petModel.rotation.y += diff * 0.08;
                if (animState !== 'walk' && mixer) {
                    animState = 'walk'; 
                    // หยุดเฉพาะท่าที่ไม่เกี่ยวข้องกับท่าเดิน เพื่อกันกระตุกในกรณีใช้ท่าเดียวกัน
                    idleActions.forEach(a => { if (!walkActions.includes(a)) a.stop(); });
                    walkActions.forEach(a => a.play());
                }
            } else {
                isWalking = false;
                if (targetItemToCollect) { collectItemAtPet(); targetItemToCollect = null; }
            }
        } else {
            if (animState !== 'idle' && mixer) {
                animState = 'idle'; 
                // หยุดเฉพาะท่าที่ไม่ใช่ท่า Idle
                walkActions.forEach(a => { if (!idleActions.includes(a)) a.stop(); });
                idleActions.forEach(a => a.play());
            }
            if (now > nextAutoWalkTime) {
                targetPos.set((Math.random() - 0.5) * 10, -1.2, (Math.random() - 0.5) * 10);
                isWalking = true; nextAutoWalkTime = now + 8 + Math.random() * 10;
            }
        }
        const s = petModel.scale.x, goal = targetPetScale, n = s + (goal - s) * 0.03;
        petModel.scale.set(n, n, n);
        if (camera) {
            _camTarget.set(petModel.position.x, petModel.position.y + 4.7, petModel.position.z + 8);
            camera.position.lerp(_camTarget, 0.03); camera.lookAt(petModel.position.x, petModel.position.y + 0.7, petModel.position.z);
        }
        
        // --- 🛡️ [NEW] ระบบ Proximity Detection (เดินทับแล้วเก็บ) ---
        [poopObjects, rewardObjects].forEach(arr => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const item = arr[i];
                if (petModel.position.distanceTo(item.mesh.position) < 0.75) {
                    targetItemToCollect = item.mesh;
                    collectItemAtPet();
                    targetItemToCollect = null;
                }
            }
        });
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
                if(c.isMesh) { 
                    c.material.opacity = 1.0; 
                    c.material.transparent = false; 
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
                        c.material.transparent = true; 
                        c.material.opacity = 0.25; 
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
    for (let i = poopObjects.length - 1; i >= 0; i--) {
        const p = poopObjects[i]; p.elapsed += delta;
        if (p.elapsed >= engineConfig.poop_lifetime) { scene.remove(p.mesh); disposeObject(p.mesh); poopObjects.splice(i, 1); if(onPoopExpired) onPoopExpired(); }
    }
}

function updateRewards(t, delta) {
    for (let i = rewardObjects.length - 1; i >= 0; i--) {
        const r = rewardObjects[i];
        r.elapsed += delta; 
        
        // --- ✨ อนิเมชั่นเหรียญพรีเมียม (Spin & Float) ---
        if (r.mesh) {
            r.mesh.rotation.y += delta * 3.5; // หมุนเร็วขึ้นให้พรีเมียม
            r.mesh.position.y = r.startY + Math.sin(t * 5) * 0.15; // ขยับขึ้นลงชัดๆ
        }

        if (r.elapsed >= engineConfig.reward_lifetime) { 
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

    const edgeTasks = [];
    tasks.forEach(t => {
        const pObj = poopObjects.find(p => p.mesh === t.mesh);
        const rObj = rewardObjects.find(r => r.mesh === t.mesh);
        const obj = pObj || rObj;
        const elapsed = obj ? obj.elapsed : 0;
        const maxLife = pObj ? engineConfig.poop_lifetime : engineConfig.reward_lifetime;
        const lifeLeft = Math.max(0, maxLife - elapsed);
        _tempVec.copy(t.mesh.position); _tempVec.y += 0.8; _tempVec.project(camera);
        let x = _tempVec.x, y = -_tempVec.y; if (_tempVec.z > 1) { x = -x; y = -y; }
        edgeTasks.push({ ...t, angle: Math.atan2(y, x), lifeLeft });
    });

    if (edgeTasks.length > 1) {
        edgeTasks.sort((a, b) => a.angle - b.angle);
        for (let i = 0; i < edgeTasks.length * 2; i++) {
            const a = edgeTasks[i % edgeTasks.length], b = edgeTasks[(i + 1) % edgeTasks.length];
            let diff = b.angle - a.angle; if (diff < 0) diff += Math.PI * 2;
            if (diff < 0.52) { const overlap = 0.52 - diff; a.angle -= overlap / 2; b.angle += overlap / 2; }
        }
    }

    edgeTasks.forEach(t => {
        // บีบวงโคจรให้แคบลง (0.68) เพื่อไม่ให้ทับ HUD ด้านบนและล่าง
        const x = Math.cos(t.angle) * 0.68, y = Math.sin(t.angle) * 0.68;
        renderIndicator(t, container, x, y, t.angle);
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
                targetItemToCollect = mesh; nextAutoWalkTime = (performance.now() / 1000) + 20;
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
    } else {
        // Poops/Drops (Normal/Gold)
        if (tier === 'gold') navColor = '#fbbf24';
        else navColor = (tpl === 'car' ? '#8b5cf6' : (tpl === 'plant' ? '#10b981' : '#ec4899'));
    }

    const glow = (tier === 'gold' || tier === 'diamond' || tier === 'rare') ? `0 0 15px ${navColor}` : 'none';
    
    // ปรับปรุงขนาดและลูกศร
    el.innerHTML = `
        <div class="indicator-wrapper" style="position: relative; scale: 1.1;">
            <div class="indicator-inner" style="border: 2.5px solid ${navColor}; box-shadow: ${glow}; font-size: 1.4rem;">${displayIcon}</div>
            <div class="indicator-arrow" style="border-bottom-color: ${navColor}; transform: translateX(-50%) rotate(${angle + Math.PI/2}rad); transform-origin: 50% 36px;"></div>
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
        <div class="emotion-bubble animate-pop-in">
            <span class="text-2xl">${emoji}</span>
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
    scene.add(mesh);
    poopObjects.push({ mesh, elapsed: 0, x: px, z: pz, tier: type }); 

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
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24), 
        new THREE.MeshStandardMaterial({ 
            color: config.color, 
            metalness: 0.95, 
            roughness: 0.05, 
            emissive: config.emissive, 
            emissiveIntensity: 0.6 
        })
    );
    // จับเหรียญตั้งขึ้น (Rotate to stand on edge)
    mesh.rotation.x = Math.PI / 2;
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
    rewardObjects.push({ mesh: group, tier: type, value, startY: -0.9, elapsed: 0 }); 

    if (!fromSync && window._actionChannel) {
        window._actionChannel.postMessage({ type: 'SPAWN_REWARD', x: rx, z: rz, syncId: sid, itemType: type, value });
    }
    return true;
}
export function updatePetScale(level) { 
    if (!petModel) return;
    const tpl = window.STATE?.config?.template || 'pet';
    const diff = window.STATE?.config?.difficulty_mode || 'normal';
    const matrix = window.STATE?.config?.matrix?.[tpl]?.[diff];
    
    // ดึงค่าสเกล: สกินรายตัว > ค่าพื้นฐานใน Matrix > 1.0 (Fallback)
    const skins = window.STATE?.config?.available_skins || [];
    const activeSkin = skins.find(s => s.model === window.STATE?.config?.custom_model);
    const baseScale = activeSkin?.scale || matrix?.physics?.scale || 1.0;
    
    // ปรับให้โตช้าลง (0.5% ต่อเลเวล) และจำกัดขนาดสูงสุดไม่ให้เกิน 1.35 เท่าของขนาดฐาน
    const growth = (level - 1) * 0.005;
    const targetPetScale = Math.min(baseScale * 1.35, baseScale + (baseScale * growth));
    
    // 🔥 บัคฟิกซ์: ต้องสั่ง set scale ให้กับโมเดลจริงๆ ด้วย!
    if (petModel) {
        petModel.scale.set(targetPetScale, targetPetScale, targetPetScale);
    }
}
export function updateEnvironment(sky, ground) { 
    if(sky && SKY_COLORS[sky]) scene.background = new THREE.Color(SKY_COLORS[sky]);
    if(ground && groundMesh) groundMesh.material.color.set(GROUND_COLORS[ground]);
}
export function updateEngineConfig(c) { 
    if (!c) return;
    Object.assign(engineConfig, c);
    if (c.drop_offset) {
        currentDropOffset = c.drop_offset;
        window._currentSkinOffset = c.drop_offset;
    }
}
export function updateTemplate(type, path = '', rotationY = 0) { currentTemplate = type; createPetObject(path, rotationY); }
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
            // โคลน Material เพื่อไม่ให้กระทบตัวอื่น (ถ้ามี)
            if (!c.material._isCloned) {
                c.material = c.material.clone();
                c.material._isCloned = true;
            }
            
            // 🌟 ลำดับความสำคัญ: Fever > Level Aura
            if (isFever) {
                c.material.emissive = new THREE.Color(0xffaa00);
                c.material.emissiveIntensity = 0.8;
            } else if (level >= 50) {
                c.material.emissive = new THREE.Color(0xffd700);
                c.material.emissiveIntensity = 0.4;
            } else if (level >= 20) {
                c.material.emissive = new THREE.Color(0xa855f7);
                c.material.emissiveIntensity = 0.3;
            } else {
                c.material.emissive = new THREE.Color(0x000000);
                c.material.emissiveIntensity = 0;
            }
        }
    });
}
export function collectPoopByUI() { if (poopObjects.length === 0) return false; const p = poopObjects.shift(); scene.remove(p.mesh); disposeObject(p.mesh); return p.type || 'normal'; }
function collectItemAtPet() {
    if (!targetItemToCollect) return;
    const sid = targetItemToCollect.userData.syncId;
    
    [poopObjects, rewardObjects].forEach(arr => {
        const idx = arr.findIndex(i => i.mesh === targetItemToCollect);
        if (idx !== -1) { 
            const item = arr.splice(idx, 1)[0]; 
            scene.remove(item.mesh); 
            disposeObject(item.mesh); 
            
            // Broadcast การเก็บอัตโนมัติให้จออื่นลบตาม
            if (window._actionChannel) window._actionChannel.postMessage({ type: 'COLLECT', syncId: sid });
            
            if (arr === poopObjects) onPoopCollected(item.type); 
            else if (onRewardCollected) onRewardCollected(item.type, item.value, sid); 
        }
    });
}
function isMobile() { return /Android|iPhone|iPad/i.test(navigator.userAgent); }
