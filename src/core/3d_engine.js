import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

let scene, camera, renderer, petModel, clock, particles, groundMesh;
let ambientLight, sunLight, purpleLight, pinkLight;
let currentTemplate = 'pet';
let envConfig = { sky: 'day', ground: 'grass' };

// Walking state
let targetPos = new THREE.Vector3(0, 0, 0);
let isWalking = false;
let nextAutoWalkTime = 0;

// Poop system
const poopObjects = [];       // { mesh, timer, warningMesh }
let onPoopCollected = null;   // callback to game.js
let onPoopExpired = null;     // callback to game.js
const POOP_LIFETIME = 30;     // วินาที ก่อนจะส่งผลเสีย
const MAX_POOPS = 5;          // จำนวนอึสูงสุดบนพื้น

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    createPetObject();

    // --- CLICK / TAP TO WALK ---
    function handleWalkInput(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(groundMesh);
        if (hits.length > 0) {
            targetPos.copy(hits[0].point);
            targetPos.y = 0;
            isWalking = true;
        }
    }
    renderer.domElement.addEventListener('click', (e) => handleWalkInput(e.clientX, e.clientY));
    renderer.domElement.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (touch) handleWalkInput(touch.clientX, touch.clientY);
    }, { passive: false });

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

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

    // Grid overlay
    const grid = new THREE.GridHelper(20, 30, 0x8b5cf6, 0x1e293b);
    grid.position.y = -1.19;
    grid.material.opacity = 0.15;
    grid.material.transparent = true;
    scene.add(grid);

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
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), trunkMat);
        trunk.position.set(x, -0.9, z);
        trunk.castShadow = true;

        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), treeMat);
        crown.position.set(x, -0.3, z);
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

function createPetObject() {
    if (petModel) scene.remove(petModel);
    petModel = new THREE.Group();

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
                
                // ปรับขนาดและตำแหน่งให้พอดี
                object.scale.set(0.015, 0.015, 0.015); 
                object.rotation.x = Math.PI / 2; // ปรับให้ขนานพื้น
                object.rotation.y = 0;
                object.position.y = -1.1; // ให้ยืนบนพื้นพอดี
                
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
    scene.add(petModel);
}

function autoWalk(t) {
    if (!petModel) return;
    if (t < nextAutoWalkTime) return;

    // สุ่มตำแหน่งใหม่ในแผนที่ (ขอบ -6 ถึง 6)
    const rx = (Math.random() - 0.5) * 10;
    const rz = (Math.random() - 0.5) * 10;
    targetPos.set(rx, 0, rz);
    isWalking = true;

    // เดินอีกรอบใน 5-12 วินาที
    nextAutoWalkTime = t + 5 + Math.random() * 7;
}

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (petModel) {
        // Auto-walk AI
        autoWalk(t);

        if (isWalking) {
            const dir = new THREE.Vector3().subVectors(targetPos, petModel.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist > 0.1) {
                dir.normalize().multiplyScalar(0.035);
                petModel.position.add(dir);
                petModel.rotation.y = Math.atan2(dir.x, dir.z);
                petModel.position.y = Math.abs(Math.sin(t * 8)) * 0.08;
            } else {
                isWalking = false;
                petModel.position.y = 0;
            }
        } else {
            // Idle breathing
            petModel.position.y = Math.sin(t * 1.5) * 0.1;
        }
        const s = 1 + Math.sin(t * 3) * 0.02;
        petModel.scale.set(s, s, s);

        // Camera Follow (Smooth)
        if (camera) {
            const targetCamPos = new THREE.Vector3(
                petModel.position.x, 
                petModel.position.y + 4.5, 
                petModel.position.z + 8.5
            );
            camera.position.lerp(targetCamPos, 0.05);
            camera.lookAt(petModel.position.x, petModel.position.y + 0.5, petModel.position.z);
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

    renderer.render(scene, camera);
}

// Indicator state
const indicatorElements = new Map(); // Poop Mesh -> Div Element

function updateIndicators() {
    const container = document.getElementById('poop-indicators');
    if (!container || !camera) return;

    // Remove indicators for deleted poops
    for (const [mesh, el] of indicatorElements.entries()) {
        const stillExists = poopObjects.some(p => p.mesh === mesh);
        if (!stillExists) {
            el.remove();
            indicatorElements.delete(mesh);
        }
    }

    const radarRadius = container.clientWidth / 2; // Circular boundary

    poopObjects.forEach((p) => {
        // Project to NDC [-1, 1]
        const pos = p.mesh.position.clone();
        pos.y += 0.4;
        pos.project(camera);

        let el = indicatorElements.get(p.mesh);
        if (!el) {
            el = document.createElement('div');
            el.className = 'absolute top-1/2 left-1/2 -mt-6 -ml-6 w-12 h-12 flex items-center justify-center transition-all duration-300';
            el.innerHTML = `
                <div class="relative w-full h-full flex items-center justify-center">
                    <div class="absolute inset-0 bg-neon-pink/10 rounded-full blur-[8px]"></div>
                    <div class="text-[14px] z-10 filter brightness-110 drop-shadow-[0_0_5px_rgba(236,72,153,0.8)]">💩</div>
                    <div class="indicator-arrow absolute -top-4 w-1.5 h-3 bg-neon-pink rounded-t-full rounded-b-sm shadow-[0_0_10px_#ec4899]"></div>
                </div>
            `;
            container.appendChild(el);
            indicatorElements.set(p.mesh, el);
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

        // Indicator rotation (pointing outward on the ring)
        const angle = Math.atan2(dx, dy);
        const arrowEl = el.querySelector('.indicator-arrow');
        if (arrowEl) {
            arrowEl.style.transform = `rotate(${angle}rad)`;
        }

        el.style.transform = `translate(${x}px, ${y}px)`;
        
        // Intensity based on proximity/on-screen status
        const isOnScreen = pos.x > -0.95 && pos.x < 0.95 && pos.y > -0.95 && pos.y < 0.95 && pos.z < 1;
        el.style.opacity = isOnScreen ? '0.4' : '1';
        el.style.scale = isOnScreen ? '0.8' : '1.1';
    });
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
    const px = petModel.position.x + (Math.random() - 0.5) * 0.5;
    const pz = petModel.position.z + (Math.random() - 0.5) * 0.5;
    const mesh = createPoopMesh(px, pz);
    scene.add(mesh);

    const poopEntry = { mesh, elapsed: 0, x: px, z: pz };
    poopObjects.push(poopEntry);

    // ตรวจจับการแตะ/คลิกที่ก้อนอึ
    function handlePoopClick(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObject(mesh, true);
        if (hits.length > 0) {
            scene.remove(mesh);
            const idx = poopObjects.indexOf(poopEntry);
            if (idx !== -1) poopObjects.splice(idx, 1);
            renderer.domElement.removeEventListener('click', clickHandler);
            renderer.domElement.removeEventListener('touchend', touchHandler);
            if (onPoopCollected) onPoopCollected();
        }
    }
    const clickHandler = (e) => handlePoopClick(e.clientX, e.clientY);
    const touchHandler = (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (t) handlePoopClick(t.clientX, t.clientY);
    };
    renderer.domElement.addEventListener('click', clickHandler);
    renderer.domElement.addEventListener('touchend', touchHandler, { passive: false });
}

// ตั้ง callback จาก game.js
export function setPoopCallbacks(onCollect, onExpire) {
    onPoopCollected = onCollect;
    onPoopExpired = onExpire;
}

// ฟังก์ชันใหม่: ลบอึออก 1 ก้อน (เมื่อกดปุ่ม UI)
export function collectPoopByUI() {
    if (poopObjects.length > 0) {
        const p = poopObjects.shift(); // ลบก้อนที่เก่าที่สุด
        if (p && p.mesh) {
            scene.remove(p.mesh);
            return true;
        }
    }
    return false;
}


export function updateTemplate(type) {
    currentTemplate = type;
    createPetObject();
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
