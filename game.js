import * as THREE from 'three';
import * as CANNON from 'cannon';

const socket = io('https://ТВОЙ-АДРЕС-НА-РЕНДЕРЕ.onrender.com'); // ЗАМЕНИТЬ ПОСЛЕ ДЕПЛОЯ
const room = "lobby1";
let currentLevelIdx = 0;
let isGameStarted = false;

// 1. Инициализация Three.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);

// 2. Красивый шейдер для "Таблетки"
const sphereShader = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0x00ffff) } },
    vertexShader: `varying vec3 vNorm; void main() { vNorm = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vNorm; uniform float time; uniform vec3 color; void main() { 
        float glow = pow(0.7 - dot(vNorm, vec3(0,0,1.0)), 3.0);
        gl_FragColor = vec4(color + glow, 1.0) * (0.8 + 0.2 * sin(time * 5.0)); 
    }`
});

// 3. Физический мир
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15, 0) });

function createPlayer(color) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), sphereShader.clone());
    mesh.material.uniforms.color.value = new THREE.Color(color);
    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.6) });
    scene.add(mesh);
    world.addBody(body);
    return { mesh, body };
}

const p1 = createPlayer(0x00ffcc);
const p2 = createPlayer(0xff00ff);

// 4. Генератор уровней (Пример для расширения до 45)
const levels = [
    { name: "Начало", platforms: [{x:0, y:-1, z:0, w:10, d:10}], goal: {x:4, z:4} },
    { name: "Прыжок", platforms: [{x:0, y:-1, z:0, w:5, d:5}, {x:7, y:-1, z:0, w:5, d:5}], goal: {x:7, z:0} },
    { name: "Лабиринт", platforms: [{x:0, y:-1, z:0, w:2, d:20}, {x:5, y:-1, z:0, w:10, d:2}], goal: {x:8, z:0} }
    // Просто добавляй объекты сюда до 45 штук!
];

let levelMeshes = [];
let levelBodies = [];

function buildLevel(idx) {
    levelMeshes.forEach(m => scene.remove(m));
    levelBodies.forEach(b => world.removeBody(b));
    levelMeshes = []; levelBodies = [];

    const data = levels[idx];
    data.platforms.forEach(p => {
        const geo = new THREE.BoxGeometry(p.w, 1, p.d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.x, p.y, p.z);
        scene.add(mesh);
        levelMeshes.push(mesh);

        const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(p.w/2, 0.5, p.d/2)) });
        body.position.set(p.x, p.y, p.z);
        world.addBody(body);
        levelBodies.push(body);
    });
    
    p1.body.position.set(0, 2, 0); p1.body.velocity.set(0,0,0);
    p2.body.position.set(0, 2, 0); p2.body.velocity.set(0,0,0);
    document.getElementById('lvl-display').innerText = `УРОВЕНЬ: ${idx + 1}/45 - ${data.name}`;
}

// 5. Управление и Сеть
window.addEventListener('keydown', () => {
    if(!isGameStarted) {
        document.getElementById('overlay').style.display = 'none';
        socket.emit('join-game', room);
        isGameStarted = true;
    }
});

const keys = {};
window.onkeydown = (e) => keys[e.code] = true;
window.onkeyup = (e) => keys[e.code] = false;

socket.on('start-game', () => {
    document.getElementById('status').innerText = "Игроки найдены! Начинаем...";
    buildLevel(currentLevelIdx);
});

socket.on('p2-move', (data) => {
    p2.body.position.set(data.x, data.y, data.z);
});

socket.on('load-level', (idx) => {
    currentLevelIdx = idx;
    buildLevel(currentLevelIdx);
});

// 6. Основной цикл
function animate(t) {
    requestAnimationFrame(animate);
    world.fixedStep();

    [p1, p2].forEach(p => {
        p.mesh.position.copy(p.body.position);
        p.mesh.quaternion.copy(p.body.quaternion);
        p.mesh.material.uniforms.time.value = t * 0.001;
    });

    if (isGameStarted) {
        const force = 10;
        if(keys['KeyW']) p1.body.applyForce(new CANNON.Vec3(0,0,-force), p1.body.position);
        if(keys['KeyS']) p1.body.applyForce(new CANNON.Vec3(0,0,force), p1.body.position);
        if(keys['KeyA']) p1.body.applyForce(new CANNON.Vec3(-force,0,0), p1.body.position);
        if(keys['KeyD']) p1.body.applyForce(new CANNON.Vec3(force,0,0), p1.body.position);

        socket.emit('move', { room, x: p1.body.position.x, y: p1.body.position.y, z: p1.body.position.z });

        // Проверка финиша
        const distToGoal = p1.body.position.distanceTo(new CANNON.Vec3(levels[currentLevelIdx].goal.x, 0, levels[currentLevelIdx].goal.z));
        if (distToGoal < 1.5 && currentLevelIdx < 44) {
            socket.emit('next-level', { room, level: currentLevelIdx + 1 });
        }
    }

    camera.position.lerp(new THREE.Vector3(p1.body.position.x, p1.body.position.y + 8, p1.body.position.z + 12), 0.1);
    camera.lookAt(p1.body.position);
    renderer.render(scene, camera);
}
animate();