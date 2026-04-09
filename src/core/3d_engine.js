import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, petModel, clock, particles, groundMesh;
let ambientLight, sunLight, purpleLight, pinkLight, mixer;
let currentTemplate = 'pet';
let envConfig = { sky: 'day', ground: 'grass' };

// Walking state
let targetPos = new THREE.Vector3(0, 0, 0);
let isWalking = false;
let nextAutoWalkTime = 0;
let walkActions = []; // Actions that look like walking
let idleActions = []; // Actions that look like idling

// Poop system
const poopObjects = [];       // { mesh, timer, warningMesh }
let onPoopCollected = null;   // callback to game.js
let onPoopExpired = null;     // callback to game.js
let onRewardCollected = null;
const rewardObjects = []; // { mesh, type, value, startY, elapsed }
const POOP_LIFETIME = 45;     // วินาที ก่อนจะส่งผลเสีย
const REWARD_LIFETIME = 25;   // วินาที ก่อนจะส่งผลเสีย
const MAX_POOPS = 5;          // จำนวนอึสูงสุดบนพื้น
const MAX_REWARDS = 10;

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

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    sunLight.shadow.mapSize.set(1024, 1024);
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
                poopObjects.splice(i, 1);
                if (onPoopCollected) onPoopCollected();
                return; // จบการทำงาน ไม่ต้องเดิน
            }
        }

        // 2. ตรวจสอบ "เหรียญ/รางวัล"
        for (let i = 0; i < rewardObjects.length; i++) {
            const r = rewardObjects[i];
            const hits = ray.intersectObject(r.mesh, true);
            if (hits.length > 0) {
                scene.remove(r.mesh);
                const val = r.value;
                rewardObjects.splice(i, 1);
                if (onRewardCollected) onRewardCollected(r.type, val);
                return; // จบ
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
    const count = 80;
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

function createPetObject(customPath = '') {
    if (petModel) scene.remove(petModel);
    if (mixer) { mixer.stopAllAction(); mixer = null; }
    
    petModel = new THREE.Group();
    scene.add(petModel);

    // Fallback if loading fails
    const fallback = () => {
        if (customPath) {
            console.warn("Failed to load custom model, falling back to default:", currentTemplate);
            createPetObject(''); // Call again without custom path
        }
    };

    if (customPath) {
        const isGLB = customPath.toLowerCase().endsWith('.glb') || customPath.toLowerCase().endsWith('.gltf');
        if (isGLB) {
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(customPath, (gltf) => {
                const model = gltf.scene;
                model.traverse(c => { if(c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                
                // standard centering
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const scale = 0.85 / size.y; // ย่อลงอีกนิดให้เป็นแมวบ้าน (จากเดิม 1.0 -> 0.85)
                model.scale.set(scale, scale, scale);
                model.position.y = -1.2; 
                
                if (gltf.animations && gltf.animations.length > 0) {
                    mixer = new THREE.AnimationMixer(model);
                    walkActions = []; idleActions = [];

                    // ตรวจสอบจำนวนท่า
                    if (gltf.animations.length === 1) {
                        // กรณีมีท่าเดียว (เช่นตัว Bicolor Cat) 
                        const action = mixer.clipAction(gltf.animations[0]);
                        action.play();
                        walkActions = [action];
                        idleActions = [action]; // ใช้ท่าเดียวกันแต่จะคุมด้วย speed
                    } else {
                        // กรณีมีหลายท่า (แยกตาม Keyword)
                        gltf.animations.forEach((clip, index) => {
                            const name = clip.name.toLowerCase();
                            const action = mixer.clipAction(clip);
                            if (name.includes('walk') || name.includes('run') || name.includes('move') || name.includes('crawl')) {
                                walkActions.push(action);
                            } else if (name.includes('idle') || name.includes('wait') || name.includes('head')) {
                                idleActions.push(action);
                            }
                        });
                        
                        if (walkActions.length === 0 && gltf.animations.length > 1) walkActions.push(mixer.clipAction(gltf.animations[1]));
                        if (idleActions.length === 0) idleActions.push(mixer.clipAction(gltf.animations[0]));
                    }
                    
                    // เริ่มต้นสถานะนิ่ง (สโลว์)
                    const isSingle = gltf.animations.length === 1;
                    idleActions.forEach(a => { 
                        a.play(); 
                        a.timeScale = isSingle ? 0.15 : 1.0; 
                    });
                    walkActions.forEach(a => { a.timeScale = 1.6; });
                }
                petModel.add(model);
            }, undefined, fallback);
            return;
        } else if (customPath.toLowerCase().endsWith('.obj')) {
             const objLoader = new OBJLoader();
             objLoader.load(customPath, (object) => {
                object.traverse(c => { if(c.isMesh) { c.castShadow=true; c.receiveShadow=true; } });
                object.scale.set(1.5, 1.5, 1.5);
                object.position.y = -1.2;
                petModel.add(object);
             }, undefined, fallback);
             return;
        }
    }

    // Default Templates

    // 🐱 Realistic Orange Tabby Cat Colors
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8822a, metalness: 0.0, roughness: 0.7, emissive: 0x3a1800, emissiveIntensity: 0.05 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.6 }); // Lighter belly/inner ear
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfdf6e3 }); // Warm white eyes
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a0a00 }); // Dark pupils
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xd9687a }); // Pink nose
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0x3a2800, emissiveIntensity: 0.3 }); // Amber iris
    const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xf4a0b0 }); // Pink inner ear

    if (currentTemplate === 'pet') {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('/models/cat/');
        mtlLoader.load('12221_Cat_v1_l3.mtl', (materials) => {
            materials.preload();
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath('/models/cat/');
            objLoader.load('12221_Cat_v1_l3.obj', (object) => {
                object.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // คืนค่าตำแหน่งและสเกลเดิม (ให้เท้าติดดิน -1.15)
                object.scale.set(0.015, 0.015, 0.015); 
                object.rotation.x = -Math.PI / 2;
                object.position.y = -1.15; 
                
                petModel.add(object);
            });
        });

    } else if (currentTemplate === 'plant') {
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

    petModel.position.y = 0;
}

function autoWalk(t) {
    if (!petModel) return;
    if (t < nextAutoWalkTime) return;

    // ขยายระยะการสุ่มให้ทั่วแผนที่มากขึ้น (เดิม -5 ถึง 5 -> ใหม่ -8.5 ถึง 8.5)
    const rx = (Math.random() - 0.5) * 17;
    const rz = (Math.random() - 0.5) * 17;
    targetPos.set(rx, 0, rz);
    isWalking = true;

    // เดินอีกรอบใน 3-8 วินาที
    nextAutoWalkTime = t + 3 + Math.random() * 5;
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const t = clock.getElapsedTime();
    if (window.TWEEN) TWEEN.update();
    if (mixer) mixer.update(delta);

    if (petModel) {
        // Auto-walk AI
        autoWalk(t);

        if (isWalking) {
            const dir = new THREE.Vector3().subVectors(targetPos, petModel.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist > 0.05) {
                const speed = 0.07; // ปรับความเร็วเดินจาก 0.04 -> 0.07 ให้ดูรวดเร็วขึ้น
                dir.normalize().multiplyScalar(speed);
                petModel.position.add(dir);

                const targetRot = Math.atan2(dir.x, dir.z);
                let diff = targetRot - petModel.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                petModel.rotation.y += diff * 0.05;

                // --- ANIMATION SWITCH: WALKING ---
                if (mixer) {
                    const isSingle = walkActions.length === 1 && walkActions[0] === idleActions[0];
                    if (isSingle) {
                        walkActions[0].timeScale = 1.6;
                    } else {
                        idleActions.forEach(a => { a.stop(); });
                        walkActions.forEach(a => { a.play(); a.timeScale = 1.6; });
                    }
                } else {
                    // --- PROCEDURAL WALK (Only for OBJ/Simple models) ---
                    const walkCycle = t * 9;
                    petModel.rotation.z = Math.sin(walkCycle) * 0.045;
                    petModel.rotation.x = Math.cos(walkCycle * 2) * 0.03; 
                    petModel.position.y = Math.abs(Math.cos(walkCycle * 2)) * 0.035; 
                }
            } else {
                isWalking = false;
                // --- ANIMATION SWITCH: IDLE ---
                if (mixer) {
                    const isSingle = walkActions.length === 1 && walkActions[0] === idleActions[0];
                    if (isSingle) {
                        walkActions[0].timeScale = 0.15; // หรี่ความเร็วลงให้เหมือนแค่หายใจเบาๆ
                    } else {
                        walkActions.forEach(a => { a.stop(); });
                        idleActions.forEach(a => { a.play(); a.timeScale = 1.0; });
                    }
                }
            }
        } else {
            // --- RESTORE IDLE STATE (Organic) ---
            petModel.position.y = Math.sin(t * 1.5) * 0.005;
            petModel.rotation.z = Math.sin(t * 0.8) * 0.01;
            petModel.rotation.x = Math.sin(t * 1.2) * 0.005;
            petModel.rotation.y += Math.sin(t * 0.5) * 0.001; 
            
            petModel.rotation.x *= 0.98;
            petModel.rotation.z *= 0.98;
        }

        // Natural soft breathing pulse
        const pulse = 1 + Math.sin(t * 1.8) * 0.01;
        petModel.scale.set(pulse, pulse, pulse);

        // Camera Follow (Smooth)
        if (camera) {
            const targetCamPos = new THREE.Vector3(
                petModel.position.x, 
                petModel.position.y + 3.5, 
                petModel.position.z + 8.0
            );
            camera.position.lerp(targetCamPos, 0.05);
            camera.lookAt(petModel.position.x, petModel.position.y - 0.5, petModel.position.z);
        }
    }

    // อัปเดต poop timer
    for (let i = poopObjects.length - 1; i >= 0; i--) {
        const p = poopObjects[i];
        p.elapsed += 1 / 60;
        const ratio = p.elapsed / POOP_LIFETIME;

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

        // หมดเวลา — แจ้ง game.js และลบออก
        if (p.elapsed >= POOP_LIFETIME) {
            scene.remove(p.mesh);
            poopObjects.splice(i, 1);
            if (onPoopExpired) onPoopExpired();
        }
    }

    if (particles) {
        particles.rotation.y += 0.0003;
        const pos = particles.geometry.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) pos[i] += Math.sin(t + i) * 0.0008;
        particles.geometry.attributes.position.needsUpdate = true;
    }

    updateIndicators();
    updateRewards(t);

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
const indicatorElements = new Map(); // Poop Mesh -> Div Element

function updateIndicators() {
    const container = document.getElementById('poop-indicators');
    if (!container || !camera) return;

    // Remove indicators for deleted objects (poop & rewards)
    for (const [mesh, el] of indicatorElements.entries()) {
        const poopExists = poopObjects.some(p => p.mesh === mesh);
        const rewardExists = rewardObjects.some(r => r.mesh === mesh);
        if (!poopExists && !rewardExists) {
            el.remove();
            indicatorElements.delete(mesh);
        }
    }

    const radarRadius = container.clientWidth * 0.45; // slightly inside boundary

    const allTrackables = [
        ...poopObjects.map(p => ({ mesh: p.mesh, icon: '💩', color: '#ec4899', type: 'poop' })),
        ...rewardObjects.map(r => ({ mesh: r.mesh, icon: '🪙', color: '#fbbf24', type: 'reward' }))
    ];

    allTrackables.forEach((obj) => {
        // Project to NDC [-1, 1]
        const pos = obj.mesh.position.clone();
        pos.y += 0.4;
        pos.project(camera);

        let el = indicatorElements.get(obj.mesh);
        if (!el) {
            el = document.createElement('div');
            el.className = 'absolute top-1/2 left-1/2 -mt-6 -ml-6 w-12 h-12 flex items-center justify-center transition-all duration-300';
            el.innerHTML = `
                <div class="relative w-12 h-12 flex items-center justify-center">
                    <div class="absolute inset-0 rounded-full blur-[10px] scale-125" style="background-color: ${obj.color}30"></div>
                    <div class="text-[18px] z-10 filter drop-shadow-[0_0_8px_${obj.color}]">${obj.icon}</div>
                    <!-- ลูกศรที่จะหมุนโคจรรอบไอคอน (Orbiting Arrow) -->
                    <div class="indicator-arrow absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div class="w-1.5 h-3.5 rounded-full -translate-y-5" style="background-color: ${obj.color}; box-shadow: 0 0 15px ${obj.color}"></div>
                    </div>
                </div>
            `;
            container.appendChild(el);
            indicatorElements.set(obj.mesh, el);
        }

        // Calculate direction on a circle
        let dx = pos.x;
        let dy = pos.y;
        
        if (pos.z > 1) { // Behind camera
            dx = -dx;
            dy = -dy;
            if (Math.abs(dx) < 0.1) dx = 1;
        }

        const mag = Math.sqrt(dx * dx + dy * dy);
        const normX = dx / mag;
        const normY = dy / mag;

        // Position on the radar ring
        const x = normX * radarRadius;
        const y = -normY * radarRadius; // Flip Y for screen space

        // คำนวณมุมหมุนสำหรับตัวลูกศร (ให้หมุนรอบไอคอน 360 องศา)
        const arrowEl = el.querySelector('.indicator-arrow');
        if (arrowEl) {
            const arrowAngle = Math.atan2(dx, dy); // ให้ทิศทางสอดคล้องกับพิกัดแมพ
            arrowEl.style.transform = `rotate(${arrowAngle}rad)`;
        }

        el.style.transform = `translate(${x}px, ${y}px)`;
        
        // Intensity based on proximity/on-screen status
        const isOnScreen = pos.x > -0.95 && pos.x < 0.95 && pos.y > -0.95 && pos.y < 0.95 && pos.z < 1;
        el.style.opacity = isOnScreen ? '0.4' : '1';
        el.style.scale = isOnScreen ? '0.8' : '1.1';
    });
}

function updateRewards(t) {
    const delta = 1 / 60; // Approximate for 60fps
    for (let i = rewardObjects.length - 1; i >= 0; i--) {
        const r = rewardObjects[i];
        if (!r.mesh) continue;
        
        r.elapsed = (r.elapsed || 0) + delta;

        // หมุนเหรียญ
        r.mesh.rotation.y += 0.05;
        // ลอยขึ้นลงเบาๆ
        r.mesh.position.y = r.startY + Math.sin(t * 4) * 0.05;
        
        // เช็คระยะห่างจากสัตว์เลี้ยง (เดินทับเก็บเหรียญ)
        if (petModel) {
            const dist = r.mesh.position.distanceTo(petModel.position);
            if (dist < 0.6) {
                scene.remove(r.mesh);
                rewardObjects.splice(i, 1);
                if (onRewardCollected) onRewardCollected(r.type, r.value);
                continue;
            }
        }

        // Expiry check
        if (r.elapsed >= REWARD_LIFETIME) {
            scene.remove(r.mesh);
            rewardObjects.splice(i, 1);
            continue;
        }

        // Visual feedback when close to expiry
        if (r.elapsed > REWARD_LIFETIME * 0.7) {
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
    if (!scene || !petModel) return;
    if (poopObjects.length >= MAX_POOPS) return; // ไม่ให้อึเกินขีดจำกัด
    // กระจายรอบตัวสัตว์เลี้ยงให้กว้างขึ้น เพื่อไม่ให้อึเกาะกลุ่มอยู่ที่เดียว
    const angle = Math.random() * Math.PI * 2;
    const dist = 0.5 + Math.random() * 0.6;
    const rx = Math.max(-9.5, Math.min(9.5, petModel.position.x + Math.cos(angle) * dist));
    const rz = Math.max(-9.5, Math.min(9.5, petModel.position.z + Math.sin(angle) * dist));
    const mesh = createPoopMesh(rx, rz);
    scene.add(mesh);

    const poopEntry = { mesh, elapsed: 0, x: rx, z: rz };
    poopObjects.push(poopEntry);
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
    if (!scene || !petModel) return;
    if (rewardObjects.length >= MAX_REWARDS) return;

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
