import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, petModel, clock, particles, groundMesh;
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
    console.log("🎲 World Seed Set:", worldSeed);
}

// --- 💨 Dynamic Particle System (ควันรถ/เอฟเฟกต์) ---
const dynamicParticles = [];
const maxDynamicParticles = 80;

function addParticle(x, y, z, velocity, color, size, lifetime) {
    if (dynamicParticles.length >= maxDynamicParticles) {
        const p = dynamicParticles.shift();
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
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

// Poop system
const poopObjects = [];       // { mesh, timer, warningMesh }
let onPoopCollected = null;   // callback to game.js
let onPoopExpired = null;     // callback to game.js
let onRewardCollected = null;
const rewardObjects = []; // { mesh, type, value, startY, elapsed }
// Configurable Limits (Updated via updateEngineConfig)
let engineConfig = {
    poop_lifetime: 30,
    reward_lifetime: 20,
    max_poops: 3,
    max_rewards: 3
};
let targetItemToCollect = null; // เก็บเป้าหมายที่ผู้เล่นคลิกให้เดินไปเก็บ

// Helper สำหรับคืนหน่วยความจำ
function disposeObject(obj) {
    if (!obj) return;
    
    // Cleanup Indicator DOM if exists
    const el = indicatorElements.get(obj);
    if (el) {
        el.remove();
        indicatorElements.delete(obj);
    }

    obj.traverse(node => {
        if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(m => m.dispose());
                } else {
                    node.material.dispose();
                }
            }
        }
    });
}

// --- REALISTIC COLORS ---
const SKY_COLORS = {
    day:    0x87CEEB,  // Bright sky blue
    sunset: 0x4a2040,  // Warm purple-orange dusk
    night:  0x0a0e1a,  // Dark navy
    space:  0x020208   // Deep void
};

const GROUND_COLORS = {
    grass: 0x3a8c4a,   // Vivid green
    sand:  0xc2a55a,   // Sandy yellow
    snow:  0xd0dde8,   // Icy white-blue
    stone: 0x555560    // Gray slate
};

// Lighting presets per sky
const LIGHT_PRESETS = {
    day:    { ambient: 0xffffff, ambientI: 0.8, sunColor: 0xfff5e0, sunI: 2.0, exposure: 1.4, fog: 0.02 },
    sunset: { ambient: 0xffaa66, ambientI: 0.5, sunColor: 0xff7744, sunI: 1.2, exposure: 1.0, fog: 0.035 },
    night:  { ambient: 0x334466, ambientI: 0.25, sunColor: 0x8899cc, sunI: 0.4, exposure: 0.7, fog: 0.05 },
    space:  { ambient: 0x222244, ambientI: 0.15, sunColor: 0x6666aa, sunI: 0.3, exposure: 0.5, fog: 0.06 }
};

export function init3D(containerId, templateType = 'pet', env = {}) {
    currentTemplate = templateType;
    const customModel = env.customModel || '';
    const customRotationY = env.customRotationY || 0;
    currentTemplate = templateType;
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

    renderer = new THREE.WebGLRenderer({ 
        antialias: false, 
        powerPreference: "high-performance",
        precision: 'mediump'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(isMobile() ? 1.0 : Math.min(window.devicePixelRatio, 1.5)); // ลด Cap จาก 2.0 เหลือ 1.5 เพื่อความลื่นไหล
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = preset.exposure;
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // --- LIGHTING (stored for dynamic updates) ---
    ambientLight = new THREE.AmbientLight(preset.ambient, preset.ambientI);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunI);
    sunLight.position.set(5, 10, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(128, 128); // ลดขนาดเงาลงเหลือ 128 (ประหยัดมาก)
    sunLight.shadow.bias = -0.01;
    scene.add(sunLight);

    purpleLight = new THREE.PointLight(0x8b5cf6, 8, 20);
    purpleLight.position.set(-3, 3, 0);
    scene.add(purpleLight);

    pinkLight = new THREE.PointLight(0xec4899, 6, 15);
    pinkLight.position.set(3, 2, -2);
    scene.add(pinkLight);

    // --- GROUND MAP ---
    createGround();

    // --- DECORATIONS ---
    createDecorations();

    // --- PARTICLES ---
    createParticles();

    // --- PET ---
    createPetObject(customModel, customRotationY);

    // --- CLICK / TAP TO WALK ---
    const handleGlobalInput = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);

        // 1. ตรวจสอบ "อึ" (ลำดับความสำคัญสูงสุด)
        for (let i = 0; i < poopObjects.length; i++) {
            const p = poopObjects[i];
            const hits = ray.intersectObject(p.mesh, true);
            if (hits.length > 0) {
                scene.remove(p.mesh);
                disposeObject(p.mesh); // Cleanup
                poopObjects.splice(i, 1);
                if (onPoopCollected) onPoopCollected(p.type || 'normal');
                return; 
            }
        }

        // 2. ตรวจสอบ "เหรียญ/รางวัล"
        for (let i = 0; i < rewardObjects.length; i++) {
            const r = rewardObjects[i];
            const hits = ray.intersectObject(r.mesh, true);
            if (hits.length > 0) {
                scene.remove(r.mesh);
                disposeObject(r.mesh); // Cleanup
                const val = r.value;
                rewardObjects.splice(i, 1);
                if (onRewardCollected) onRewardCollected(r.type, val);
                return; 
            }
        }

        // 3. ตรวจสอบ "ตัวละคร (Pet/Car/Plant)" (ปรับให้จิ้มง่ายขึ้นมากด้วย Hitbox ขยาย)
        if (petModel) {
            const hits = ray.intersectObject(petModel, true);
            const groundHitForDist = ray.intersectObject(groundMesh);
            
            let isHit = hits.length > 0;
            
            // ถ้าจิ้มพื้นใกล้ๆ ตัวละคร (รัศมี 1.2 เมตร) ก็ให้ถือว่าจิ้มโดนตัวละครด้วย (ช่วยให้จิ้มง่ายบนมือถือ)
            if (!isHit && groundHitForDist.length > 0) {
                const dist = groundHitForDist[0].point.distanceTo(petModel.position);
                if (dist < 1.3) isHit = true;
            }

            if (isHit) {
                if (window.doTouch) window.doTouch(); 
                petModel.scale.setScalar(targetPetScale * 1.15);
                petModel.traverse(c => {
                    if (c.material && c.material.emissive) {
                        c.material.emissiveIntensity = 0.8;
                        setTimeout(() => { if(c.material) c.material.emissiveIntensity = 0.1; }, 250);
                    }
                });
                return;
            }
        }

        // 4. ถ้าไม่โดนอะไรเลย ให้สัตว์เลี้ยง "เดิน" ไปที่ตรงนั้น
        const groundHits = ray.intersectObject(groundMesh);
        if (groundHits.length > 0) {
            targetPos.copy(groundHits[0].point);
            targetPos.y = 0;
            isWalking = true;
        }
    };

    renderer.domElement.addEventListener('click', (e) => handleGlobalInput(e.clientX, e.clientY));
    renderer.domElement.addEventListener('touchend', (e) => {
        if (e.cancelable) e.preventDefault();
        const t = e.changedTouches[0];
        if (t) handleGlobalInput(t.clientX, t.clientY);
    }, { passive: false });


    // ฟังก์ชันคำนวณขนาด (รวมศูนย์ไว้ที่เดียว)
    const handleResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;
        
        camera.aspect = aspect;
        
        // กฎการมองเห็นสำหรับ แนวนอน (Landscape)
        if (aspect > 1.2) {
            camera.fov = 25; 
            camera.position.set(0, 3, 14);
            camera.lookAt(0, 0.8, 0);
        } else {
            camera.fov = 45;
            camera.position.set(0, 5, 8);
            camera.lookAt(0, 0, 0);
        }
        
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, true);
        renderer.setPixelRatio(isMobile() ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(handleResize, 150); // รอให้เครื่องหมุน UI เสร็จก่อนค่อยคำนวณ
    });
    
    handleResize(); 
    animate();
}

function createGround() {
    const geo = new THREE.PlaneGeometry(20, 20, 20, 20);
    const mat = new THREE.MeshStandardMaterial({
        color: GROUND_COLORS[envConfig.ground] || GROUND_COLORS.grass,
        metalness: 0.1,
        roughness: 0.9
    });
    groundMesh = new THREE.Mesh(geo, mat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -1.2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);



    // Glow ring
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.5, 2.8, 64),
        new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.18;
    scene.add(ring);
}

function createDecorations() {
    // Small trees/rocks around the map
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d6b3f, roughness: 0.8 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });

    const currentSeed = worldSeed;
    const treeCount = 6 + Math.floor(seededRandom() * 3);
    for (let i = 0; i < treeCount; i++) {
        const angle = seededRandom() * Math.PI * 2;
        const dist = 3.5 + seededRandom() * 5.5;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const scale = 1.8 + seededRandom() * 1.5;
        const trunkHeight = 0.6 * scale;

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, trunkHeight, 6), trunkMat);
        trunk.position.set(x, -1.2 + (trunkHeight / 2), z);
        trunk.castShadow = true;

        const crownRadius = 0.4 * scale;
        const crown = new THREE.Mesh(new THREE.SphereGeometry(crownRadius, 8, 8), treeMat);
        crown.position.set(x, trunk.position.y + (trunkHeight / 2) - (0.1 * scale), z);
        crown.castShadow = true;
        scene.add(trunk, crown);
    }

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9 });
    const rockCount = 4 + Math.floor(seededRandom() * 2);
    for (let i = 0; i < rockCount; i++) {
        const angle = seededRandom() * Math.PI * 2;
        const dist = 3.5 + seededRandom() * 6;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), rockMat);
        const rockScale = 0.8 + seededRandom() * 0.8;
        rock.scale.set(rockScale, rockScale * 0.7, rockScale);
        rock.position.set(x, -1.1, z);
        rock.rotation.set(seededRandom(), seededRandom(), seededRandom());
        rock.castShadow = true;
        scene.add(rock);
    }
    worldSeed = currentSeed;
}

function createParticles() {
    const isMob = isMobile();
    const count = isMob ? 20 : 50; // ลดจำนวนฝุ่นลงอีกเหลือ 20 จุดบนมือถือ
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 16;
        pos[i + 1] = Math.random() * 6;
        pos[i + 2] = (Math.random() - 0.5) * 16;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0x8b5cf6, size: 0.05, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending
    }));
    scene.add(particles);
}

let currentLoadId = 0; // ป้องกันตัวละครซ้อนกันเวลาโหลดไวๆ

// ตรวจสอบว่า path ถูกต้อง (อยู่ที่ root level เท่านั้น)
function sanitizeModelPath(p) {
    if (!p) return '';
    // ถ้า path ยังชี้ไปที่โฟลเดอร์เก่า (/models/pet/ etc.) → ล้างออก
    if (p.includes('/models/pet/') || p.includes('/models/car/') || p.includes('/models/plant/')) {
        // ดึงเอาแค่ชื่อไฟล์ แล้วเติม / ข้างหน้า
        const filename = p.split('/').pop();
        return '/' + filename;
    }
    return p;
}

function createPetObject(inputPath = '', rotationY = 0) {
    const loadId = ++currentLoadId;
    
    // กำหนด Path เริ่มต้นหากไม่ได้ส่งมา หรือ Path เก่าที่อาจจะพัง
    let path = sanitizeModelPath(inputPath);
    if (!path && currentTemplate === 'pet') path = '/toon_cat_free.glb';
    if (!path && currentTemplate === 'plant') path = '/stylized_tree.glb';
    if (!path && currentTemplate === 'car') path = '/car_carton.glb';


    
    // ล้างตัวเก่าออกให้หมดจด
    if (petModel) {
        scene.remove(petModel);
        disposeObject(petModel);
        petModel = null;
    }
    if (mixer) { mixer.stopAllAction(); mixer = null; }
    
    const modelGroup = new THREE.Group();
    const isCurrent = () => loadId === currentLoadId;

    const fallback = (err) => {
        console.error("FAIL to load:", path, err);
        // ถ้าโหลดตัวที่ระบุไม่สำเร็จ → ถอยไปใช้ตัวเริ่มต้นของ template นั้นๆ
        const defaults = { pet: '/toon_cat_free.glb', plant: '/stylized_tree.glb' };
        const defaultPath = defaults[currentTemplate];
        if (defaultPath && path !== defaultPath) {
            createPetObject(defaultPath);
        }
        // ถ้าแม้แต่ตัวเริ่มต้นก็โหลดไม่ได้ → จะ fall through ไปใช้ Procedural แทน
    };

    if (path) {
        const isGLB = path.toLowerCase().endsWith('.glb') || path.toLowerCase().endsWith('.gltf');
        if (isGLB) {
            new GLTFLoader().load(path, (gltf) => {
                if (!isCurrent()) { 
                    disposeObject(gltf.scene); 
                    return; 
                }
                const model = gltf.scene;
                model.traverse(c => { if(c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const scale = 0.85 / size.y;
                model.scale.set(scale, scale, scale);
                // ทำให้แกน Y ท้องแมวมาแตะ 0 ใน Local
                const boxScaled = new THREE.Box3().setFromObject(model);
                model.position.y = -boxScaled.min.y; 
                modelBaseScale = scale; // เก็บ scale เดิมไว้
                
                // สั่งหันหน้าตามที่กำหนด (แก้ปัญหาโมเดลหันหลังวิ่ง)
                if (path.includes('car_carton')) {
                    model.rotation.y = Math.PI; // หันหลัง 180 องศา
                } else {
                    model.rotation.y = rotationY;
                }
                
                if (gltf.animations && gltf.animations.length > 0) {
                    mixer = new THREE.AnimationMixer(model);
                    walkActions = [];
                    idleActions = [];

                    gltf.animations.forEach(clip => {
                        const action = mixer.clipAction(clip);
                        const name = clip.name.toLowerCase();
                        if (name.includes('walk') || name.includes('run') || name.includes('move') || name.includes('crawl')) {
                            walkActions.push(action);
                        } else if (name.includes('idle') || name.includes('wait') || name.includes('head')) {
                            idleActions.push(action);
                        }
                    });

                    // เริ่มต้นด้วย idle ไม่ใช่ walk
                    if (idleActions.length > 0) {
                        idleActions[0].play();
                    } else if (gltf.animations.length > 0) {
                        mixer.clipAction(gltf.animations[0]).play();
                    }
                    animState = 'idle';
                    isWalking = false;
                }

                modelGroup.add(model);
                petModel = modelGroup;
                scene.add(petModel);

            }, undefined, (err) => {
                console.error(`Model load failed: ${path}`, err);
                // ถ้าโหลดตัวหลักไม่ผ่าน และไม่ใช่ตัว Default อย่าเรียกซ้ำวนลูป
                if (path !== '/toon_cat_free.glb') {
                    createPetObject('/toon_cat_free.glb');
                }
            });
            return;
        } else if (path.toLowerCase().endsWith('.obj')) {
             new OBJLoader().load(path, (object) => {
                if (!isCurrent()) { disposeObject(object); return; }
                object.traverse(c => { if(c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                object.scale.set(1.5, 1.5, 1.5);
                object.position.y = -1.2;
                modelGroup.add(object);
                petModel = modelGroup;
                scene.add(petModel);
             });
             return;
        }
    }

    // Default Templates (Procedural)
    if (currentTemplate === 'plant') {
        // Procedural plant removed as per user request. Using GLB instead.
    } else if (currentTemplate === 'car') {
        // Procedural car removed. Using /car_carton.glb as default.
    }

    petModel = modelGroup;
    scene.add(petModel);

    // เอาจุดกำเนิด (พื้น) ไปแตะ ground -1.2 
    petModel.position.y = -1.2;
}

function autoWalk(t) {
    if (!petModel) return;
    if (t < nextAutoWalkTime) return;
    
    // ถ้ารับคำสั่งให้ไปเก็บของอยู่ ห้ามสุ่มเลิกเดินกลางทางเด็ดขาด!
    if (targetItemToCollect && isWalking) return;

    if (isWalking) {
        // ถ้ากำลังเดินเล่นสุ่มๆ อยู่ → ให้หยุดพัก (idle) 2-5 วินาที
        isWalking = false;
        nextAutoWalkTime = t + 2 + Math.random() * 3;
    } else {
        // ถ้ากำลังพักอยู่ → เริ่มสุ่มสถานที่พักผ่อนแนวใหม่
        const rx = (Math.random() - 0.5) * 14;
        const rz = (Math.random() - 0.5) * 14;
        targetPos.set(rx, 0, rz);
        isWalking = true;
        
        // เวลาเดินเล่น 4-10 วินาที
        nextAutoWalkTime = t + 4 + Math.random() * 6;
        
        // สำคัญมาก: ล้างเป้าหมายที่ค้างอยู่ทิ้งให้หมด เพื่อไม่ให้เดินทับแล้วเผลอเก็บ
        targetItemToCollect = null; 
    }
}

function animate() {
    if (document.hidden) {
        requestAnimationFrame(animate);
        return;
    }
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    if (window.TWEEN) window.TWEEN.update();
    
    // อัปเดตควันและตัวชี้เป้าเฉพาะเฟรมคู่เพื่อประหยัดแรง
    if (indicatorFrameCount % 2 === 0) {
        updateDynamicParticles();
        updateIndicators();
    }
    
    if (mixer) mixer.update(delta);

    if (petModel) {
        autoWalk(elapsed);
        
        if (isWalking) {
            _dir.subVectors(targetPos, petModel.position);
            _dir.y = 0;
            const dist = _dir.length();
            if (dist > 0.1) {
                const speed = 0.05;
                _dir.normalize().multiplyScalar(speed);
                petModel.position.add(_dir);

                const targetRot = Math.atan2(_dir.x, _dir.z);
                let diff = targetRot - petModel.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                petModel.rotation.y += diff * 0.08;

                // สลับเป็น Walk animation (เฉพาะตอนเปลี่ยนสถานะเท่านั้น ไม่เรียกทุกเฟรม)
                if (animState !== 'walk' && mixer) {
                    animState = 'walk';
                    idleActions.forEach(a => a.stop());
                    if (walkActions.length > 0) {
                        walkActions.forEach(a => { a.play(); a.timeScale = 1.2; });
                    }
                }
                if (!mixer) {
                    const walkCycle = elapsed * 6;
                    petModel.rotation.z = Math.sin(walkCycle) * 0.03;
                    petModel.position.y = -1.2 + Math.abs(Math.cos(walkCycle)) * 0.02;
                }
            } else {
                isWalking = false;
            }
        } else {
            // สลับเป็น Idle animation (เฉพาะตอนเปลี่ยนสถานะเท่านั้น)
            if (animState !== 'idle' && mixer) {
                animState = 'idle';
                walkActions.forEach(a => a.stop());
                if (idleActions.length > 0) {
                    idleActions.forEach(a => { a.play(); a.timeScale = 0.8; });
                } else if (walkActions.length > 0) {
                    // ถ้าไม่มี idle ให้ใช้ walk แบบช้าๆ แทน
                    walkActions.forEach(a => { a.play(); a.timeScale = 0.15; });
                }
            }
            // คำนวณการเคลื่อนไหวพิเศษตาม Template (Sway / Idle Vibration)
            if (currentTemplate === 'plant') {
                // ต้นไม้ไหวตามลม
                petModel.rotation.z = Math.sin(elapsed * 0.8) * 0.02;
                petModel.rotation.x = Math.cos(elapsed * 0.5) * 0.01;
            } else if (currentTemplate === 'car') {
                // รถสั่นตอนเดินเครื่อง
                petModel.position.y = -1.2 + Math.sin(elapsed * 20) * 0.005;
            } else {
                // สัตว์เลี้ยงหายใจเบาๆ
                petModel.position.y = -1.2 + Math.sin(elapsed * 1.5) * 0.003;
            }
            
            // Rotation damping (เฉพาะสัตว์เลี้ยง ไม่ทับค่าของต้นไม้/รถ)
            if (currentTemplate === 'pet') {
                petModel.rotation.z *= 0.95;
                petModel.rotation.x *= 0.95;
            }
        }

        // ปรับขนาดตัวตาม Level (ค่อยๆ โตขึ้นแบบ smooth)
        // modelBaseScale ถูกใส่ไว้ที่ model ข้างในแล้ว → Group ใช้แค่ targetPetScale
        const s = petModel.scale.x;
        const goal = targetPetScale;
        const newScale = s + (goal - s) * 0.03;
        petModel.scale.set(newScale, newScale, newScale);

        // Camera Follow (ชดเชยระดับความสูงเนื่องจากจุดกำเนิดลงไปอยู่พื้น -1.2)
        if (camera) {
            _camTarget.set(
                petModel.position.x,
                petModel.position.y + 4.7, // 3.5 + 1.2
                petModel.position.z + 8.0
            );
            camera.position.lerp(_camTarget, 0.03);
            camera.lookAt(petModel.position.x, petModel.position.y + 0.7, petModel.position.z); // -0.5 + 1.2
        }
    }

    // อัปเดต poop timer
    for (let i = poopObjects.length - 1; i >= 0; i--) {
        const p = poopObjects[i];
        p.elapsed += delta; // ใช้ค่า delta จริงเพื่อให้เวลาเดินตามจริง แม้เครื่องจะแลค
        const ratio = p.elapsed / (engineConfig.poop_lifetime || 30);

        // หมุน + เต้นเล็กน้อยให้สังเกตเห็น
        p.mesh.rotation.y += 0.02;
        p.mesh.position.y = -1.1 + Math.sin(p.elapsed * 4) * 0.04;

        // เปลี่ยนสีเตือนเมื่อใกล้หมดเวลา (เกิน 60%)
        if (ratio > 0.6) {
            const flash = Math.sin(p.elapsed * 8) > 0;
            p.mesh.children.forEach(c => {
                if (c.material) c.material.emissiveIntensity = flash ? 0.8 : 0.1;
            });
        }

        // เช็คระยะห่างจากสัตว์เลี้ยง (เดินทับเก็บโดยตั้งใจ)
        if (petModel && targetItemToCollect === p.mesh) {
            // คำนวณระยะห่างแนวราบ 2D (ไม่เอาแกน Y มาคิดเพราะอึอยู่ติดพื้น/มุดดินนิดหน่อย)
            const dx = p.mesh.position.x - petModel.position.x;
            const dz = p.mesh.position.z - petModel.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 1.5) { // รัศมีเก็บกว้างขึ้นนิดนึงเพื่อให้เดินทับง่ายๆ
                scene.remove(p.mesh);
                disposeObject(p.mesh); // Cleanup
                poopObjects.splice(i, 1);
                targetItemToCollect = null; // เคลียร์เป้าหมาย
                if (onPoopCollected) onPoopCollected(p.type || 'normal');
                continue;
            }
        }

        // หมดเวลา — แจ้ง game.js และลบออก
        if (p.elapsed >= (engineConfig.poop_lifetime || 30)) {
            scene.remove(p.mesh);
            disposeObject(p.mesh); // Cleanup
            poopObjects.splice(i, 1);
            if (onPoopExpired) onPoopExpired();
        }
    }

    if (particles) {
        particles.rotation.y += 0.0002; // หมุนธรรมดาประหยัดกว่า
        // อัปเดตตำแหน่งฝุ่นเฉพาะเฟรมที่เป็นเลขคู่เพื่อลดภาระ CPU
        if (indicatorFrameCount % 4 === 0) {
            const pos = particles.geometry.attributes.position.array;
            for (let i = 1; i < pos.length; i += 9) { // ข้ามเยอะขึ้น
                pos[i] += Math.sin(elapsed + i) * 0.0005;
            }
            particles.geometry.attributes.position.needsUpdate = true;
        }
    }

    updateIndicators();
    updateRewards(elapsed, delta); // ส่งค่า delta เข้าไปด้วย

    if (indicatorFrameCount % 4 === 0) {
        if (currentTemplate === 'car') spawnExhaustSmoke();
    }
    TWEEN.update();

    renderer.render(scene, camera);
}

// Fade between animations smoothly
function fadeTo(newAction, duration = 0.3) {
    if (activeAction && activeAction !== newAction) {
        activeAction.fadeOut(duration);
        newAction.reset().fadeIn(duration).play();
        activeAction = newAction;
    } else if (!activeAction) {
        newAction.play();
        activeAction = newAction;
    }
}


function updateIndicators() {
    indicatorFrameCount++;
    if (indicatorFrameCount % 2 !== 0) return; // Update DOM at 30fps to save CPU

    const container = document.getElementById('poop-indicators');
    if (!container || !camera) return;

    // Process poops (with template specific icons)
    const icons = {
        pet:   '💩',
        car:   '🔧',
        plant: '🍂'
    };
    const poopIcon = icons[currentTemplate] || '💩';

    for (let i = 0; i < poopObjects.length; i++) {
        const isGold = poopObjects[i].type === 'gold';
        renderIndicator(poopObjects[i].mesh, isGold ? '✨' : poopIcon, isGold ? '#fbbf24' : '#ec4899', container);
    }
    // Process rewards
    for (let i = 0; i < rewardObjects.length; i++) {
        renderIndicator(rewardObjects[i].mesh, '🪙', '#fbbf24', container);
    }
}

function renderIndicator(mesh, icon, color, container) {
    const radarRadius = container.clientWidth * 0.42;

    // Project ตำแหน่ง 3D → 2D screen
    _tempVec.copy(mesh.position);
    _tempVec.y += 0.4;
    _tempVec.project(camera);

    let el = indicatorElements.get(mesh);
    if (!el) {
        el = document.createElement('div');
        el.className = 'absolute top-1/2 left-1/2 -mt-6 -ml-6 w-12 h-12 flex items-center justify-center transition-all duration-200 pointer-events-auto cursor-pointer hover:scale-125 active:scale-90';
        el.innerHTML = `
            <div class="relative w-12 h-12 flex items-center justify-center">
                <div class="absolute inset-0 rounded-full scale-150 animate-ping" style="background-color: ${color}15"></div>
                <div class="absolute inset-0 rounded-full blur-[8px] scale-125" style="background-color: ${color}40"></div>
                <div class="text-[20px] z-10 filter drop-shadow-[0_0_10px_${color}]">${icon}</div>
                <div class="indicator-arrow absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div class="w-2 h-4 rounded-full -translate-y-6" style="background-color: ${color}; box-shadow: 0 0 12px ${color}"></div>
                </div>
            </div>
        `;
        
        // --- ระบบกดที่สัญลักษณ์เพื่อสั่งให้เดินไปเก็บ ---
        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (petModel) {
                targetPos.copy(mesh.position);
                targetPos.y = -1.2;
                isWalking = true;
                nextAutoWalkTime = clock.getElapsedTime() + 15; // เผื่อเวลากอบโกยให้ 15 วินาทีเลย
                targetItemToCollect = mesh; // ล็อคเป้าไว้ กันการเดินสุ่มไปทับ
                
                el.style.transform += ' scale(0.8)';
            }
        });

        container.appendChild(el);
        if (window.twemoji) twemoji.parse(el);
        indicatorElements.set(mesh, el);
    }

    // คำนวณทิศทางจาก "แมว" ไปยัง "อึ/เหรียญ" บนแผนที่จริง
    // กล้องอยู่ด้านหลัง (Z+8) มองลงมา ดังนั้น:
    //   World X → Screen ซ้าย/ขวา (ตรง)
    //   World Z → Screen ขึ้น/ลง (Z ลบ = ด้านบนจอ, Z บวก = ด้านล่างจอ)
    let dx = 0, dy = 0;
    if (petModel) {
        dx = mesh.position.x - petModel.position.x;   // ซ้าย-ขวา ตรงๆ
        dy = mesh.position.z - petModel.position.z;    // Z บวก = ใกล้กล้อง = ล่างจอ
    } else {
        dx = _tempVec.x;
        dy = -_tempVec.y;
    }

    const mag = Math.sqrt(dx * dx + dy * dy);
    const normX = dx / (mag || 1);
    const normY = dy / (mag || 1);

    const x = normX * radarRadius;
    const y = normY * radarRadius;

    // หมุนลูกศรชี้ไปทิศที่ถูกต้อง
    const arrowEl = el.querySelector('.indicator-arrow');
    if (arrowEl) {
        const angle = Math.atan2(dx, -dy); // ลูกศรชี้จากแมวไปอึ
        arrowEl.style.transform = `rotate(${angle}rad)`;
    }

    el.style.transform = `translate(${x}px, ${y}px)`;
    
    // แสดงชัดตลอดเวลา
    el.style.opacity = '1';
    el.style.scale = '1';
}



function updateRewards(t, delta) {
    for (let i = rewardObjects.length - 1; i >= 0; i--) {
        const r = rewardObjects[i];
        if (!r.mesh) continue;
        
        r.elapsed = (r.elapsed || 0) + delta;

        // หมุนเหรียญ
        r.mesh.rotation.y += 0.05;
        // ลอยขึ้นลงเบาๆ
        r.mesh.position.y = r.startY + Math.sin(t * 4) * 0.05;
        
        // เช็คระยะห่างจากสัตว์เลี้ยง (เดินทับเก็บเหรียญตามที่กด)
        if (petModel && targetItemToCollect === r.mesh) {
            // คำนวณระยะห่างแนวราบ 2D (ไม่เอาแกน Y เพราะเหรียญลอยอยู่)
            const dx = r.mesh.position.x - petModel.position.x;
            const dz = r.mesh.position.z - petModel.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 1.2) { // รัศมีเก็บเหรียญกว้างๆ
                scene.remove(r.mesh);
                disposeObject(r.mesh); // Cleanup
                rewardObjects.splice(i, 1);
                targetItemToCollect = null;
                if (onRewardCollected) onRewardCollected(r.type, r.value);
                continue;
            }
        }

        // Expiry check
        if (r.elapsed >= (engineConfig.reward_lifetime || 20)) {
            scene.remove(r.mesh);
            disposeObject(r.mesh); // Cleanup
            rewardObjects.splice(i, 1);
            continue;
        }

        // Visual feedback when close to expiry
        if (r.elapsed > (engineConfig.reward_lifetime || 20) * 0.7) {
            const flash = Math.sin(r.elapsed * 10) > 0;
            r.mesh.visible = flash;
        } else {
            r.mesh.visible = true;
        }
    }
}

// สร้างก้อนอึ 3D บนพื้น
function createPoopMesh(x, z, type) {
    const group = new THREE.Group();
    const isGold = type === 'gold';
    if (currentTemplate === 'car') {
        // --- กรณีเป็นรถ: เปลี่ยนจากอึเป็น "กองน้ำมันดำ" (Oil Spill) ---
        const oilMat = new THREE.MeshStandardMaterial({ 
            color: isGold ? 0xffd700 : 0x111111, 
            roughness: 0.1, metalness: 0.8,
            emissive: isGold ? 0xffaa00 : 0x000000,
            emissiveIntensity: isGold ? 0.5 : 0
        });
        const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.02, 16), oilMat);
        puddle.position.y = 0.01;
        const splash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), oilMat);
        splash.scale.set(1.5, 0.4, 1.2);
        splash.position.y = 0.02;
        group.add(puddle, splash);

    } else if (currentTemplate === 'plant') {
        // --- กรณีเป็นต้นไม้: เปลี่ยนเป็น "ใบไม้แห้ง/วัชพืช" (Dry Leaves) ---
        const leafMat = new THREE.MeshStandardMaterial({ 
            color: isGold ? 0xffd700 : 0x7c2d12, // น้ำตาลแดง
            roughness: 0.9,
            emissive: isGold ? 0xffaa00 : 0x000000,
            emissiveIntensity: isGold ? 0.3 : 0
        });
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), leafMat);
        leaf.scale.set(1.2, 0.1, 0.6);
        leaf.rotation.set(0.2, Math.random() * Math.PI, 0.1);
        group.add(leaf);

    } else {
        // --- กรณีเป็นสัตว์เลี้ยง: ก้อนอึ (แบบเดิม) ---
        const mat = new THREE.MeshStandardMaterial({
            color: isGold ? 0xffd700 : 0x6b3a1f, 
            roughness: isGold ? 0.2 : 0.9, 
            metalness: isGold ? 1.0 : 0.0,
            emissive: isGold ? 0xffaa00 : 0x3a1500, 
            emissiveIntensity: isGold ? 0.5 : 0.1
        });
        // ชั้นล่าง (ใหญ่)
        const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat);
        b1.position.y = 0.0; b1.scale.set(1, 0.7, 1);
        const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat);
        b2.position.y = 0.16; b2.scale.set(1, 0.8, 1);
        const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
        b3.position.y = 0.28; b3.scale.set(1, 1.1, 1);
        
        // ดวงตา
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const eL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
        eL.position.set(-0.06, 0.26, 0.1);
        const eR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
        eR.position.set(0.06, 0.26, 0.1);
        const pL = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), pupilMat);
        pL.position.set(-0.06, 0.26, 0.115);
        const pR = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), pupilMat);
        pR.position.set(0.06, 0.26, 0.115);
        
        group.add(b1, b2, b3, eL, eR, pL, pR);
    }

    // เพิ่ม Aura แสงสว่างสำหรับอึทองคำ
    if (isGold) {
        const light = new THREE.PointLight(0xffaa00, 1.5, 2);
        light.position.y = 0.5;
        group.add(light);
        
        // เพิ่ม Sprite Aura (Halo)
        const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32,32,0,32,32,32);
        grad.addColorStop(0, 'rgba(255,200,0,0.4)'); grad.addColorStop(1, 'rgba(255,200,0,0)');
        ctx.fillStyle=grad; ctx.fillRect(0,0,64,64);
        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, blending:THREE.AdditiveBlending }));
        sprite.scale.set(1.2, 1.2, 1);
        sprite.position.y = 0.1;
        group.add(sprite);
    }

    group.position.set(x, -1.1, z);
    group.castShadow = true;
    return group;
}

// เรียกจาก game.js เพื่อสุ่มอึ
export function spawnPoop(type = 'normal') {
    if (!scene || !petModel) return false;
    if (poopObjects.length >= (engineConfig.max_poops || 3)) return false; 
    const angle = Math.random() * Math.PI * 2;
    const dist = 0.5 + Math.random() * 0.6;
    const rx = Math.max(-9.5, Math.min(9.5, petModel.position.x + Math.cos(angle) * dist));
    const rz = Math.max(-9.5, Math.min(9.5, petModel.position.z + Math.sin(angle) * dist));
    const mesh = createPoopMesh(rx, rz, type);
    scene.add(mesh);

    const poopEntry = { mesh, elapsed: 0, x: rx, z: rz, type };
    poopObjects.push(poopEntry);
    return true;
}

// ตั้ง callback จาก game.js
export function setPoopCallbacks(onCollect, onExpire) {
    onPoopCollected = onCollect;
    onPoopExpired = onExpire;
}

// ฟังก์ชันใหม่: ลบอึออก 1 ก้อน (เมื่อกดปุ่ม UI)
export function collectPoopByUI() {
    if (poopObjects.length === 0) return false;
    const p = poopObjects[0];
    const type = p.type || 'normal';
    scene.remove(p.mesh);
    disposeObject(p.mesh); // Cleanup
    poopObjects.shift();
    return type;
}

// --- REWARDS SYSTEM ---

function createRewardMesh(type = 'common') {
    const group = new THREE.Group();
    let mesh;

    if (type === 'legend') {
        // ทรงเพชร (Legendary Diamond)
        const geo = new THREE.OctahedronGeometry(0.25);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff, emissive: 0x0099ff, emissiveIntensity: 1.5,
            metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.9
        });
        mesh = new THREE.Mesh(geo, mat);
        
        // Aura Light
        const light = new THREE.PointLight(0x00ccff, 2, 3);
        group.add(light);

        // Halo
        const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32,32,0,32,32,32);
        grad.addColorStop(0, 'rgba(0,255,255,0.4)'); grad.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.fillStyle=grad; ctx.fillRect(0,0,64,64);
        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, blending:THREE.AdditiveBlending }));
        sprite.scale.set(1.5, 1.5, 1);
        group.add(sprite);

    } else {
        // เหรียญ (Common/Rare)
        const isRare = type === 'rare';
        const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16);
        const mat = new THREE.MeshStandardMaterial({ 
            color: isRare ? 0xffd700 : 0xcccccc, 
            metalness: 0.8, roughness: 0.2,
            emissive: isRare ? 0xffaa00 : 0x444444,
            emissiveIntensity: isRare ? 0.8 : 0.1
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;

        if (isRare) {
            const light = new THREE.PointLight(0xffaa00, 1, 2);
            group.add(light);
        }
    }

    group.add(mesh);
    return group;
}

export function spawnReward(type = 'coin', value = 1) {
    if (!scene || !petModel) return false;
    if (rewardObjects.length >= (engineConfig.max_rewards || 3)) return false;

    // สุ่มกระจายแบบเหวี่ยงออกไปกว้างๆ ทั่วแมพ (จากเดิม 0.8 -> เพิ่มเป็น 1-5 หน่วย)
    const angle = Math.random() * Math.PI * 2;
    const dist = 1.0 + Math.random() * 5.0; 
    const rx = petModel.position.x + Math.cos(angle) * dist;
    const rz = petModel.position.z + Math.sin(angle) * dist;

    // จำกัดไม่ให้ของกระเด็นตกขอบหญ้า (ขอบที่ -9 ถึง 9)
    const finalX = Math.max(-9, Math.min(9, rx));
    const finalZ = Math.max(-9, Math.min(9, rz));

    const mesh = createRewardMesh(type);
    mesh.position.set(finalX, -1.0, finalZ);
    mesh.scale.set(0.1, 0.1, 0.1);
    scene.add(mesh);

    // Animation เกิด: เด้งออกมา
    if (window.TWEEN) {
        new TWEEN.Tween(mesh.scale).to({ x: 1, y: 1, z: 1 }, 500).easing(TWEEN.Easing.Back.Out).start();
        new TWEEN.Tween(mesh.position).to({ y: -0.9 }, 300).yoyo(true).repeat(1).start();
    } else {
        mesh.scale.set(1, 1, 1);
        mesh.position.y = -0.9;
    }

    rewardObjects.push({ mesh, type, value, startY: -0.9, elapsed: 0 });
    return true;
}

export function setRewardCallback(callback) {
    onRewardCollected = callback;
}



export function updateTemplate(type, path = '', rotationY = 0) {
    currentTemplate = type;
    createPetObject(path, rotationY);
}

// เอฟเฟกต์พลุฉลองเลเวลอัป
export function triggerLevelUpEffect() {
    if (!petModel) return;
    const pos = petModel.position;
    for (let i = 0; i < 30; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.2, 0.1+Math.random()*0.1, (Math.random()-0.5)*0.2);
        const color = new THREE.Color().setHSL(Math.random(), 1, 0.5);
        addParticle(pos.x, pos.y + 0.5, pos.z, vel, color, 0.15, 40);
    }
}

// ควันท่อไอเสียจางๆ สำหรับรถ
function spawnExhaustSmoke() {
    if (!petModel || currentTemplate !== 'car') return;
    const pos = petModel.position;
    // ท่อไอเสียแฝงอยู่ทางด้านซ้ายของรถ (เปลี่ยนจาก -0.3 เป็น 0.35)
    const offset = new THREE.Vector3(0.35, 0.15, -1.1);
    offset.applyQuaternion(petModel.quaternion);
    
    // ความเร็วพุ่งไปด้านหลัง (แกน -Z)
    const vel = new THREE.Vector3((Math.random()-0.5)*0.01, 0.03, -0.05).applyQuaternion(petModel.quaternion);
    const color = new THREE.Color(0xcccccc);
    addParticle(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z, vel, color, 0.08, 25);
}

export function updateEnvironment(sky, ground) {
    if (sky && SKY_COLORS[sky]) {
        const preset = LIGHT_PRESETS[sky] || LIGHT_PRESETS.day;
        const targetColor = new THREE.Color(SKY_COLORS[sky]);

        // Smooth Sky Transition using TWEEN
        if (scene.background) {
            new TWEEN.Tween(scene.background)
                .to({ r: targetColor.r, g: targetColor.g, b: targetColor.b }, 1500)
                .easing(TWEEN.Easing.Quadratic.Out)
                .start();
        } else {
            scene.background = targetColor.clone();
        }

        // Fog Transition
        if (scene.fog) {
            new TWEEN.Tween(scene.fog.color)
                .to({ r: targetColor.r, g: targetColor.g, b: targetColor.b }, 1500)
                .start();
            new TWEEN.Tween(scene.fog)
                .to({ density: preset.fog }, 1500)
                .start();
        }

        // Lighting Transition
        if (ambientLight) {
            new TWEEN.Tween(ambientLight.color)
                .to({ r: preset.ambient.r, g: preset.ambient.g, b: preset.ambient.b }, 1500)
                .start();
            new TWEEN.Tween(ambientLight)
                .to({ intensity: preset.ambientI }, 1500)
                .start();
        }
        
        if (sunLight) {
            new TWEEN.Tween(sunLight.color)
                .to({ r: preset.sunColor.r, g: preset.sunColor.g, b: preset.sunColor.b }, 1500)
                .start();
            new TWEEN.Tween(sunLight)
                .to({ intensity: preset.sunI }, 1500)
                .start();
        }

        if (renderer) {
            new TWEEN.Tween(renderer)
                .to({ toneMappingExposure: preset.exposure }, 1500)
                .start();
        }

        // Adjust neon lights for dark vs light themes
        if (purpleLight) purpleLight.intensity = (sky === 'day') ? 3 : 8;
        if (pinkLight) pinkLight.intensity = (sky === 'day') ? 2 : 6;
    }
    if (ground && GROUND_COLORS[ground] && groundMesh) {
        groundMesh.material.color.set(GROUND_COLORS[ground]);
    }
}

export function updateEngineConfig(config) {
    if (!config) return;
    if (config.poop_lifetime) engineConfig.poop_lifetime = config.poop_lifetime;
    if (config.reward_lifetime) engineConfig.reward_lifetime = config.reward_lifetime;
    if (config.max_poops) engineConfig.max_poops = config.max_poops;
    if (config.max_rewards) engineConfig.max_rewards = config.max_rewards;
}

// ปรับขนาดสัตว์เลี้ยงตาม Level 

export function updatePetScale(level) {
    // ให้โตแบบช้าๆ เพื่อไปโตเต็มที่ระดับตำนานตอน Level 100 (Max 2.2 ก็ถือว่ามหึมาแล้วครับ)
    const minScale = 0.6;
    const maxScale = 2.2; 
    // โตขึ้นทีละ 1.6% เพื่อให้ Level 30 กลายเป็นไซส์ 1.0 (แมวโตเต็มวัยปกติ)
    const growthRate = 0.016; 
    targetPetScale = Math.min(maxScale, minScale + (level - 1) * growthRate);
}
// Helper ตรวจสอบว่าเป็นอุปกรณ์พกพาหรือไม่
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
