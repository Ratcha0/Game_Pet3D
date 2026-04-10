import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, petModel, clock, particles, groundMesh;
let ambientLight, sunLight, purpleLight, pinkLight, mixer;
let currentTemplate = 'pet';
let currentAction = null;
let envConfig = { sky: 'day', ground: 'grass' };

// Walking & Animation state
let targetPos = new THREE.Vector3(0, 0, 0);
let isWalking = false;
let nextAutoWalkTime = 0;
let animState = 'idle'; // 'idle' | 'walk' → ป้องกันการเรียก play/stop ซ้ำทุกเฟรม
let walkActions = [];
let idleActions = [];
let modelBaseScale = 1; // เก็บ scale เดิมเอาไว้ไม่ให้ breathing pulse ทับ

// Cache vectors เพื่อลด GC pressure (สำคัญมากสำหรับมือถือ)
const _dir = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

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
        antialias: !isMobile(), 
        powerPreference: "high-performance",
        precision: isMobile() ? 'mediump' : 'highp' // ลดความละเอียดการคำนวณบนมือถือเพื่อลดความร้อน
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    // มือถือรุ่นเก่าจำกัดที่ 1.0 เพื่อความลื่นไหล, รุ่นใหม่จำกัดที่ 1.5
    renderer.setPixelRatio(isMobile() ? 1.0 : Math.min(window.devicePixelRatio, 1.5)); 
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
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
    sunLight.shadow.mapSize.set(isMobile() ? 256 : 512, isMobile() ? 256 : 512); // ลดขนาดเงาบนมือถือลงอีก
    sunLight.shadow.bias = -0.005;
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
    createPetObject(customModel);

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
                if (onPoopCollected) onPoopCollected();
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

        // 3. ถ้าไม่โดนอะไรเลย ให้สัตว์เลี้ยง "เดิน" ไปที่ตรงนั้น
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    const treePositions = [[-4, -3], [5, -4], [-3, 4], [6, 2], [-5, 0], [3, -6]];
    treePositions.forEach(([x, z]) => {
        // สุ่มขนาดให้ใหญ่ขึ้นตั้งแต่ 1.5 เท่า ถึง 3.5 เท่า แบบไม่ซ้ำกัน
        const scale = 1.5 + Math.random() * 2.0; 
        const trunkHeight = 0.6 * scale;

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, trunkHeight, 6), trunkMat);
        // พื้นฉากอยู่ที่ระดับ -1.2 คำนวณให้ฐานต้นไม้วางติดพื้นพอดีเป๊ะ
        trunk.position.set(x, -1.2 + (trunkHeight / 2), z);
        trunk.castShadow = true;

        const crownRadius = 0.4 * scale;
        const crown = new THREE.Mesh(new THREE.SphereGeometry(crownRadius, 8, 8), treeMat);
        // วางพุ่มไม้ไว้เกยกับยอดลำต้นเล็กน้อย (จมลง 10% ของสเกล) เพื่อความสมจริง
        crown.position.set(x, trunk.position.y + (trunkHeight / 2) - (0.1 * scale), z);
        crown.castShadow = true;

        scene.add(trunk, crown);
    });

    // Rocks
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9 });
    [[-2, -5], [4, 3], [-6, 2]].forEach(([x, z]) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), rockMat);
        rock.position.set(x, -1.05, z);
        rock.rotation.set(Math.random(), Math.random(), 0);
        rock.castShadow = true;
        scene.add(rock);
    });
}

function createParticles() {
    const isMob = isMobile();
    const count = isMob ? 40 : 80; // ลดจำนวนฝุ่นลงครึ่งนึงบนมือถือ
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

function createPetObject(inputPath = '') {
    const loadId = ++currentLoadId;
    
    // กำหนด Path เริ่มต้นหากไม่ได้ส่งมา หรือ Path เก่าที่อาจจะพัง
    let path = sanitizeModelPath(inputPath);
    if (!path && currentTemplate === 'pet') path = '/toon_cat_free.glb';


    
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
        // ถ้าโหลดตัวที่ระบุไม่สำเร็จ → ถอยไปใช้ตัวเริ่มต้น (ไม่ recursive loop)
        if (path && path !== '/toon_cat_free.glb' && currentTemplate === 'pet') {
            createPetObject('/toon_cat_free.glb');
        }
        // ถ้าแม้แต่ตัวเริ่มต้นก็โหลดไม่ได้ → สร้าง Procedural แทน (ไม่ถอยอีก)
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
        const potMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
        const greenMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x0a3a1a, emissiveIntensity: 0.2, roughness: 0.5 });
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.7, 16), potMat);
        pot.position.y = -0.5; pot.castShadow = true;
        const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x3b2507 }));
        soil.position.y = -0.12;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 8), greenMat);
        stalk.position.y = 0.5;
        for (let i = 0; i < 6; i++) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), greenMat);
            leaf.scale.set(1, 0.25, 0.7);
            leaf.position.set(Math.cos(i * 1.05) * 0.35, 1.0 + i * 0.1, Math.sin(i * 1.05) * 0.35);
            leaf.rotation.set(Math.random() * 0.5, i, Math.random() * 0.5);
            petModel.add(leaf);
        }
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff6b9d, emissive: 0x440022 }));
        flower.position.y = 1.5;
        petModel.add(pot, soil, stalk, flower);

    } else if (currentTemplate === 'car') {
        const carMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.7, roughness: 0.2, emissive: 0x330000, emissiveIntensity: 0.1 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.5 });
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.8 });
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.9), carMat);
        chassis.castShadow = true;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.85), glassMat);
        cabin.position.set(-0.1, 0.38, 0);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.88), carMat);
        hood.position.set(0.65, 0.12, 0);
        const wGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16);
        [[0.55, -0.18, 0.5], [-0.55, -0.18, 0.5], [0.55, -0.18, -0.5], [-0.55, -0.18, -0.5]].forEach(p => {
            const w = new THREE.Mesh(wGeo, wheelMat); w.position.set(...p); w.rotation.x = Math.PI / 2; petModel.add(w);
        });
        const lGeo = new THREE.SphereGeometry(0.06, 8, 8);
        const lMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        const h1 = new THREE.Mesh(lGeo, lMat); h1.position.set(0.9, 0.05, 0.3);
        const h2 = new THREE.Mesh(lGeo, lMat); h2.position.set(0.9, 0.05, -0.3);
        petModel.add(chassis, cabin, hood, h1, h2);
    }

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
    requestAnimationFrame(animate);
    if (document.hidden) return; // หยุดการ Render และ Logic เมื่อ Tab ถูกซ่อน หรือย่อหน้าต่าง เพื่อประหยัดทรัพยากร
    
    const delta = clock.getDelta();
    const t = clock.getElapsedTime();
    if (window.TWEEN) TWEEN.update();
    if (mixer) mixer.update(delta);

    if (petModel) {
        // Auto-walk AI
        autoWalk(t);

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
                    const walkCycle = t * 6;
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
            // หายใจเบาๆ ตอน idle บนพื้นฐาน -1.2
            petModel.position.y = -1.2 + Math.sin(t * 1.5) * 0.003;
            petModel.rotation.z *= 0.95;
            petModel.rotation.x *= 0.95;
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
                if (onPoopCollected) onPoopCollected();
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
        particles.rotation.y += 0.0001; // ลดความเร็วลง
        const pos = particles.geometry.attributes.position.array;
        // อัปเดตแบบข้ามตำแหน่งเพื่อประหยัด CPU (Throttled update)
        for (let i = 1; i < pos.length; i += 6) {
            pos[i] += Math.sin(t + i) * 0.0005;
        }
        particles.geometry.attributes.position.needsUpdate = true;
    }

    updateIndicators();
    updateRewards(t, delta); // ส่งค่า delta เข้าไปด้วย

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

// Indicator state
const indicatorElements = new Map(); // Mesh -> Div Element
let indicatorFrameCount = 0;

function updateIndicators() {
    indicatorFrameCount++;
    if (indicatorFrameCount % 2 !== 0) return; // Update DOM at 30fps to save CPU

    const container = document.getElementById('poop-indicators');
    if (!container || !camera) return;

    // Process poops
    for (let i = 0; i < poopObjects.length; i++) {
        renderIndicator(poopObjects[i].mesh, '💩', '#ec4899', container);
    }
    // Process rewards
    for (let i = 0; i < rewardObjects.length; i++) {
        renderIndicator(rewardObjects[i].mesh, '🪙', '#fbbf24', container);
    }
}

function renderIndicator(mesh, icon, color, container) {
    const radarRadius = container.clientWidth * 0.42;

    // Project ตำแหน่ง 3D → 2D screen
    const pos = mesh.position.clone();
    pos.y += 0.4;
    pos.project(camera);

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
        dx = pos.x;
        dy = -pos.y;
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
function createPoopMesh(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: 0x6b3a1f, roughness: 0.9, metalness: 0.0,
        emissive: 0x3a1500, emissiveIntensity: 0.1
    });

    // ชั้นล่าง (ใหญ่)
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat);
    b1.position.y = 0.0; b1.scale.set(1, 0.7, 1);

    // ชั้นกลาง
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat);
    b2.position.y = 0.16; b2.scale.set(1, 0.8, 1);

    // ชั้นบน (ยอด)
    const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
    b3.position.y = 0.28; b3.scale.set(1, 1.1, 1);

    // ดวงตาน่ารัก (ทำให้ฮา)
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
    group.position.set(x, -1.1, z);
    group.castShadow = true;
    return group;
}

// เรียกจาก game.js เพื่อสุ่มอึ
export function spawnPoop() {
    if (!scene || !petModel) return false;
    if (poopObjects.length >= (engineConfig.max_poops || 3)) return false; // ไม่ให้อึเกินขีดจำกัด
    // กระจายรอบตัวสัตว์เลี้ยงให้กว้างขึ้น เพื่อไม่ให้อึเกาะกลุ่มอยู่ที่เดียว
    const angle = Math.random() * Math.PI * 2;
    const dist = 0.5 + Math.random() * 0.6;
    const rx = Math.max(-9.5, Math.min(9.5, petModel.position.x + Math.cos(angle) * dist));
    const rz = Math.max(-9.5, Math.min(9.5, petModel.position.z + Math.sin(angle) * dist));
    const mesh = createPoopMesh(rx, rz);
    scene.add(mesh);

    const poopEntry = { mesh, elapsed: 0, x: rx, z: rz };
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
    scene.remove(p.mesh);
    disposeObject(p.mesh); // Cleanup
    poopObjects.shift();
    return true;
}

// --- REWARDS SYSTEM ---

function createCoinMesh() {
    const group = new THREE.Group();
    // เหรียญทอง
    const goldMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, metalness: 0.8, roughness: 0.1, 
        emissive: 0xffaa00, emissiveIntensity: 0.4 
    });
    const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24);
    const coin = new THREE.Mesh(geo, goldMat);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    group.add(coin);

    // สัญลักษณ์ $ (ใช้ PlaneTexture ง่ายๆ หรือ Cylinder ผอมๆ)
    const symbolGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8);
    const symbol = new THREE.Mesh(symbolGeo, new THREE.MeshBasicMaterial({ color: 0x442200 }));
    symbol.position.z = 0.03;
    group.add(symbol);

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

    const mesh = createCoinMesh();
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



export function updateTemplate(type, path = '') {
    currentTemplate = type;
    createPetObject(path);
}

export function updateEnvironment(sky, ground) {
    if (sky && SKY_COLORS[sky]) {
        const preset = LIGHT_PRESETS[sky] || LIGHT_PRESETS.day;

        // Update sky
        scene.background = new THREE.Color(SKY_COLORS[sky]);
        scene.fog = new THREE.FogExp2(SKY_COLORS[sky], preset.fog);

        // Update lighting
        if (ambientLight) {
            ambientLight.color.set(preset.ambient);
            ambientLight.intensity = preset.ambientI;
        }
        if (sunLight) {
            sunLight.color.set(preset.sunColor);
            sunLight.intensity = preset.sunI;
        }

        // Update tone mapping exposure
        if (renderer) {
            renderer.toneMappingExposure = preset.exposure;
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
let targetPetScale = 1;
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
