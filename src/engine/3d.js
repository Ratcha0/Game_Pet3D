import * as THREE from 'three';

let scene, camera, renderer, petBody;
const container = document.getElementById('threejs-container');

export function init3D() {
    if (!container) return;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Arc8 Dark Blue

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 4);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x7c3aed, 1.2); // Purple Accent
    dirLight.position.set(5, 5, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. The "Procedural Cat" Model (Spherical/Cute Style like the photo)
    const petGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.SphereGeometry(1, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 }); // Orange
    petBody = new THREE.Mesh(bodyGeo, bodyMat);
    petBody.castShadow = true;
    petGroup.add(petBody);

    // Head
    const headGeo = new THREE.SphereGeometry(0.7, 32, 32);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 1, 0.3);
    head.castShadow = true;
    petBody.add(head);

    // Ears
    const earGeo = new THREE.ConeGeometry(0.2, 0.4, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(-0.35, 1.5, 0.3);
    earL.rotation.z = 0.2;
    petBody.add(earL);

    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(0.35, 1.5, 0.3);
    earR.rotation.z = -0.2;
    petBody.add(earR);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.25, 1.1, 0.9);
    petBody.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.25, 1.1, 0.9);
    petBody.add(eyeR);

    scene.add(petGroup);

    // 6. Ground Mat
    const groundGeo = new THREE.CircleGeometry(2, 64);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.2 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Animation Loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    
    if (petBody) {
        // Breathing
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.03;
        petBody.scale.set(scale, scale, scale);
        
        // Idle Float/Wobble
        petBody.position.y = Math.sin(Date.now() * 0.002) * 0.05;
        petBody.rotation.y += 0.005;
    }

    renderer.render(scene, camera);
}

// Handle Window Resize
window.addEventListener('resize', () => {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});
