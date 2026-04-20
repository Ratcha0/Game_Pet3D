import * as THREE from 'three';
const timer = new THREE.Timer();
timer.update();
console.log(timer.getDelta(), timer.getElapsed());
