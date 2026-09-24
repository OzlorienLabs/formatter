import { B, sceneJson, type El } from "./lib/F-board";
import { ToolError, bool, str, type SpecModule, type View } from "./types";

/* ── OpenSCAD examples ───────────────────────────────────────────────── */

const SCAD_CSG = `// The classic CSG demo: intersect a cube and a sphere,
// then drill three cylinders through the result.
size = 20;      // [10:40]
drill = 6;      // [2:0.5:9]
$fn = 64;

difference() {
  intersection() {
    cube(size, center = true);
    sphere(r = size * 0.65);
  }
  for (r = [[0, 0, 0], [90, 0, 0], [0, 90, 0]])
    rotate(r) cylinder(h = size * 2, r = drill, center = true);
}
echo(str("Bounding cube: ", size, " mm, drill Ø ", drill * 2, " mm"));`;

const SCAD_GEAR = `/* [Gear] */
// Number of teeth
teeth = 18;          // [6:60]
// Module (tooth size, mm)
gear_module = 2;     // [1:0.5:5]
thickness = 6;       // [2:20]
// Bore diameter
bore = 6;            // [0:20]
/* [Hub] */
hub = true;
spokes = 5;          // [0:8]

pitch_r = teeth * gear_module / 2;
tip_r = pitch_r + gear_module;
root_r = pitch_r - 1.25 * gear_module;

module tooth() {
  w = PI * gear_module / 4;            // half tooth width at the pitch circle
  polygon([[root_r - 0.5, -w * 1.25], [tip_r, -w * 0.5], [tip_r, w * 0.5], [root_r - 0.5, w * 1.25]]);
}

module gear2d() {
  union() {
    circle(r = root_r, $fn = teeth * 4);
    for (i = [0 : teeth - 1]) rotate(i * 360 / teeth) tooth();
  }
}

difference() {
  linear_extrude(thickness) gear2d();
  translate([0, 0, -1]) cylinder(d = bore, h = thickness + 2, $fn = 32);
  // Lightening holes between hub and rim
  if (spokes > 0 && root_r > bore / 2 + 8)
    for (i = [0 : spokes - 1]) rotate(i * 360 / spokes + 180 / spokes)
      translate([(root_r + bore / 2) / 2 + 1, 0, -1]) cylinder(r = (root_r - bore / 2) / 4, h = thickness + 2, $fn = 32);
}
if (hub) translate([0, 0, thickness]) difference() {
  cylinder(d = bore + 8, h = 4, $fn = 48);
  translate([0, 0, -1]) cylinder(d = bore, h = 6, $fn = 32);
}
echo(str("Pitch diameter: ", 2 * pitch_r, " mm, outside diameter: ", 2 * tip_r, " mm"));`;

const SCAD_VASE = `// A vase: a 2D profile spun around the Z axis with rotate_extrude.
height = 90;     // [40:4:160]
wall = 2;        // [1:0.5:5]
bulge = 9;       // [0:20]
waves = 3;       // [1:6]
$fn = 120;

function radius(z) = 18 + bulge * sin(z * 180 * waves / height) + z * 0.12;

outer = [for (z = [0 : 3 : height]) [radius(z), z]];
inner = [for (z = [height : -3 : wall]) [radius(z) - wall, z]];

rotate_extrude() polygon(concat([[0, 0]], outer, inner, [[0, wall]]));
echo(str("Rim diameter: ", 2 * radius(height), " mm"));`;

const SCAD_STAR = `// linear_extrude of polygons built with list comprehensions.
points = 6;       // [3:12]
outer = 30;       // [10:60]
inner = 13;       // [5:40]
height = 8;       // [2:30]
taper = 0.5;      // [0.1:0.1:1]

module star(n, r1, r2) {
  polygon([for (i = [0 : 2 * n - 1])
    let(r = i % 2 == 0 ? r1 : r2, a = i * 180 / n)
      [r * sin(a), r * cos(a)]]);
}

// A tapered, twisted star…
linear_extrude(height = height, scale = taper, twist = 30, slices = 20) star(points, outer, inner);
// …and a flat outline next to it, made with offset()
translate([outer * 2.4, 0, 0]) linear_extrude(2)
  difference() {
    offset(r = 2) star(points, outer * 0.7, inner * 0.7);
    star(points, outer * 0.7, inner * 0.7);
  }`;

const SCAD_BOX = `// Rounded box with hull(), and a lid rounded with minkowski().
width = 60;     // [30:120]
depth = 40;     // [20:100]
height = 24;    // [10:60]
radius = 5;     // [1:10]
wall = 2;       // [1:0.5:4]
$fn = 40;

module rounded_block(w, d, h, r) {
  hull() for (x = [r, w - r], y = [r, d - r]) translate([x, y, 0]) cylinder(r = r, h = h);
}

// Box: an outer block minus an inner block
difference() {
  rounded_block(width, depth, height, radius);
  translate([wall, wall, wall]) rounded_block(width - 2 * wall, depth - 2 * wall, height, radius - wall / 2);
}

// Lid: a thin plate grown by a cylinder (minkowski sum)
translate([radius, depth + 12 + radius, 0]) {
  minkowski() {
    cube([width - 2 * radius, depth - 2 * radius, 1]);
    cylinder(r = radius, h = 1);
  }
  // Inner lip that fits the box
  translate([wall - radius + 0.3, wall - radius + 0.3, 2])
    difference() {
      cube([width - 2 * wall - 0.6, depth - 2 * wall - 0.6, 3]);
      translate([1.2, 1.2, -1]) cube([width - 2 * wall - 3, depth - 2 * wall - 3, 5]);
    }
}`;

const SCAD_STAND = `/* [Phone] */
// Phone thickness including case
phone_thickness = 11;   // [6:0.5:20]
// Lean angle from the desk
lean_angle = 65;        // [50:85]
/* [Stand] */
width = 70;             // [40:120]
wall = 4;               // [2:0.5:8]
back_length = 85;       // [50:140]
lip_height = 14;        // [6:30]
cable_slot = true;

slot_x = 12;
rest_x = slot_x + wall + phone_thickness;
base_length = rest_x + back_length * cos(lean_angle) + 10;

module profile() {
  square([base_length, wall]);                                  // base plate
  translate([slot_x, 0]) square([wall, lip_height]);            // front lip
  translate([rest_x, 0]) rotate(lean_angle) square([back_length, wall]);  // back rest
  hull() {                                                      // brace
    translate([rest_x + back_length * 0.5 * cos(lean_angle), back_length * 0.5 * sin(lean_angle)]) circle(d = wall, $fn = 24);
    translate([base_length - wall, 0]) square([wall, wall]);
  }
}

difference() {
  rotate([90, 0, 0]) linear_extrude(width, center = true) profile();
  if (cable_slot) translate([slot_x - 1, -6, -1]) cube([wall + phone_thickness + 2, 12, wall + 2]);
}
echo(str("Footprint: ", round(base_length), " × ", width, " mm"));`;

const SCAD_2D = `// A purely 2D design: OpenSCAD exports it as SVG instead of STL.
$fn = 48;
difference() {
  offset(r = 4) square([80, 36]);
  for (i = [0 : 4]) translate([8 + i * 16, 18]) circle(d = 9);
}
translate([0, -30]) text_free_label();
module text_free_label() {
  // text() needs fonts, so this label is drawn with shapes
  for (i = [0 : 7]) translate([i * 11, 0]) square([7, 3 + (i % 3) * 3]);
}`;

const SCAD_ERROR = `// A syntax error: the parser reports the line
cube(10);
translate([0, 0, 10]
  sphere(5);`;

/* ── Three.js examples ───────────────────────────────────────────────── */

const THREE_HEAD = `import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
`;
const THREE_RESIZE = `
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});`;

const THREE_CUBE = `${THREE_HEAD}
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f4f6f8");
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 1.6, 3);
camera.lookAt(0, 0, 0);

// MeshNormalMaterial colours faces by their direction: no lights needed.
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshNormalMaterial());
scene.add(cube);
console.log("Triangles:", cube.geometry.index.count / 3);

renderer.setAnimationLoop((ms) => {
  cube.rotation.x = ms / 1400;
  cube.rotation.y = ms / 1000;
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_MATERIALS = `import { OrbitControls } from "three/addons/controls/OrbitControls.js";
${THREE_HEAD}
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1d2028");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.5, 9);
new OrbitControls(camera, renderer.domElement);

// Lights: soft sky/ground fill, a warm key light and a cool point light.
scene.add(new THREE.HemisphereLight("#bcd7ff", "#3a2e28", 0.8));
const key = new THREE.DirectionalLight("#fff3e0", 2.2);
key.position.set(4, 6, 5);
scene.add(key);
const blue = new THREE.PointLight("#4da3ff", 30, 12);
blue.position.set(-4, 2, 2);
scene.add(blue);

// A grid of spheres: roughness left→right, metalness front→back.
const geo = new THREE.SphereGeometry(0.42, 48, 24);
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 3; j++) {
    const mat = new THREE.MeshStandardMaterial({ color: "#d6006c", roughness: i / 4, metalness: j / 2 });
    const s = new THREE.Mesh(geo, mat);
    s.position.set((i - 2) * 1.1, 0.5, (j - 1) * 1.1);
    scene.add(s);
  }
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: "#2a2f3a", roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
console.info("Drag to orbit, scroll to zoom. Left→right: roughness 0→1; back→front: metalness 0→1.");

renderer.setAnimationLoop((ms) => {
  blue.position.x = Math.sin(ms / 900) * 4;
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_POINTS = `${THREE_HEAD}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 7);
camera.lookAt(0, 0, 0);

// A spiral galaxy of 20 000 points with per-vertex colours.
const COUNT = 20000, ARMS = 3;
const pos = new Float32Array(COUNT * 3);
const col = new Float32Array(COUNT * 3);
const inner = new THREE.Color("#ffb86b"), outer = new THREE.Color("#5b8cff");
for (let i = 0; i < COUNT; i++) {
  const r = Math.pow(Math.random(), 1.6) * 5;
  const arm = (i % ARMS) / ARMS * Math.PI * 2;
  const spin = r * 1.2;
  const spread = () => (Math.random() - 0.5) * 0.5 * (r * 0.3 + 0.2);
  pos.set([Math.cos(arm + spin) * r + spread(), spread() * 0.6, Math.sin(arm + spin) * r + spread()], i * 3);
  const c = inner.clone().lerp(outer, r / 5);
  col.set([c.r, c.g, c.b], i * 3);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
const galaxy = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.025, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false }));
scene.add(galaxy);
console.log("Points:", COUNT);

renderer.setAnimationLoop((ms) => {
  galaxy.rotation.y = ms / 8000;
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_ORBIT = `import { OrbitControls } from "three/addons/controls/OrbitControls.js";
${THREE_HEAD}
const scene = new THREE.Scene();
scene.background = new THREE.Color("#fafafa");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(6, 5, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;
controls.addEventListener("end", () => console.log("camera at", camera.position.toArray().map((v) => +v.toFixed(2))));

scene.add(new THREE.GridHelper(10, 10, "#888", "#ddd"));
scene.add(new THREE.AxesHelper(3));
scene.add(new THREE.AmbientLight("#ffffff", 0.6));
const sun = new THREE.DirectionalLight("#ffffff", 2);
sun.position.set(3, 8, 5);
scene.add(sun);

const shapes = [
  [new THREE.TorusGeometry(0.8, 0.3, 24, 64), "#0088b0", [-2.5, 1.1, 0]],
  [new THREE.ConeGeometry(0.9, 1.8, 32), "#d6006c", [0, 0.9, 0]],
  [new THREE.IcosahedronGeometry(0.9, 0), "#b98d00", [2.5, 0.9, 0]],
  [new THREE.CylinderGeometry(0.6, 0.6, 1.4, 32), "#16a34a", [0, 0.7, -2.5]],
];
for (const [geo, color, p] of shapes) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true }));
  m.position.set(...p);
  scene.add(m);
}
console.info("Drag to orbit · right-drag to pan · scroll to zoom");

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_INSTANCED = `${THREE_HEAD}
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f1320");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(22, 20, 22);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#9ecbff", "#1a1a2e", 1.2));
const light = new THREE.DirectionalLight("#ffffff", 2);
light.position.set(10, 20, 5);
scene.add(light);

// 40 × 40 = 1 600 boxes in ONE draw call with InstancedMesh.
const N = 40;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1, 0.9), new THREE.MeshStandardMaterial({ roughness: 0.4 }), N * N);
scene.add(mesh);
const m = new THREE.Matrix4(), color = new THREE.Color();
for (let i = 0; i < N * N; i++) mesh.setColorAt(i, color.setHSL(0.55 + (i % N) / N * 0.35, 0.7, 0.55));
console.log("Instances:", mesh.count, "— draw calls: 1");

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  for (let x = 0; x < N; x++) {
    for (let z = 0; z < N; z++) {
      const d = Math.hypot(x - N / 2, z - N / 2);
      const h = 1 + 2.5 * (Math.sin(d * 0.45 - t * 2.2) + 1);
      m.makeScale(1, h, 1).setPosition(x - N / 2, h / 2, z - N / 2);
      mesh.setMatrixAt(x * N + z, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_SHADOWS = `${THREE_HEAD}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#e8ecf1");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 9);
camera.lookAt(0, 1.2, 0);

scene.add(new THREE.AmbientLight("#ffffff", 0.35));
const spot = new THREE.SpotLight("#ffffff", 120, 30, Math.PI / 6, 0.4);
spot.position.set(4, 9, 4);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
scene.add(spot);

const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.9, 0.3, 200, 24, 2, 3),
  new THREE.MeshStandardMaterial({ color: "#0088b0", roughness: 0.25, metalness: 0.4 })
);
knot.position.y = 1.8;
knot.castShadow = true;
scene.add(knot);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  knot.rotation.set(t * 0.6, t * 0.9, 0);
  knot.position.y = 1.8 + Math.sin(t * 1.5) * 0.3;
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_SOLAR = `import { OrbitControls } from "three/addons/controls/OrbitControls.js";
${THREE_HEAD}
const scene = new THREE.Scene();
scene.background = new THREE.Color("#05060a");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 26, 34);
new OrbitControls(camera, renderer.domElement);

// Stars
const starPos = new Float32Array(3000).map(() => (Math.random() - 0.5) * 300);
const stars = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: "#ffffff", size: 0.4 })));

// The sun is the light source.
const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 24), new THREE.MeshBasicMaterial({ color: "#ffcc55" }));
scene.add(sun);
scene.add(new THREE.PointLight("#fff2cc", 900, 0, 1.6));
scene.add(new THREE.AmbientLight("#ffffff", 0.08));

// Each planet hangs off a pivot; rotating the pivot moves it round its orbit.
function planet(name, radius, distance, color, speed) {
  const pivot = new THREE.Object3D();
  scene.add(pivot);
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  body.position.x = distance;
  pivot.add(body);
  const ring = new THREE.Mesh(new THREE.RingGeometry(distance - 0.03, distance + 0.03, 128), new THREE.MeshBasicMaterial({ color: "#445", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  console.log(name.padEnd(8), "orbit", distance, "speed", speed);
  return { pivot, body, speed };
}
const planets = [
  planet("Mercury", 0.4, 6, "#a8a29e", 4.1),
  planet("Venus", 0.8, 9, "#e7c07b", 1.6),
  planet("Earth", 0.85, 12.5, "#3b82f6", 1),
  planet("Mars", 0.6, 16, "#dc6b3a", 0.53),
  planet("Jupiter", 1.9, 22, "#d6b48a", 0.084),
];
// The Moon orbits the Earth: a pivot inside the Earth's body.
const moonPivot = new THREE.Object3D();
planets[2].body.add(moonPivot);
const moon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8), new THREE.MeshStandardMaterial({ color: "#cfcfcf" }));
moon.position.x = 1.6;
moonPivot.add(moon);

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  for (const p of planets) {
    p.pivot.rotation.y = t * p.speed * 0.5;
    p.body.rotation.y = t;
  }
  moonPivot.rotation.y = t * 3;
  renderer.render(scene, camera);
});
${THREE_RESIZE}`;

const THREE_ERROR = `import * as THREE from "three";

const scene = new THREE.Scene();
// Typo: the class is PerspectiveCamera — the error is reported with its line.
const camera = new THREE.PerspectiveCamra(50, innerWidth / innerHeight, 0.1, 100);
console.log("never reached");`;

/* ── Canvas examples ─────────────────────────────────────────────────── */

const CANVAS_SHAPES = `// Rectangles, arcs, paths and line styles.
clear("#fdfcfb");

ctx.fillStyle = "#0088b0";
ctx.fillRect(30, 30, 120, 80);
ctx.strokeStyle = "#d6006c";
ctx.lineWidth = 6;
ctx.strokeRect(170, 30, 120, 80);

// Circles and a pie slice
ctx.beginPath();
ctx.arc(90, 190, 50, 0, Math.PI * 2);
ctx.fillStyle = "#ffcc55";
ctx.fill();
ctx.beginPath();
ctx.moveTo(230, 190);
ctx.arc(230, 190, 50, -Math.PI / 2, Math.PI);
ctx.closePath();
ctx.fillStyle = "#16a34a";
ctx.fill();

// A five-pointed star with round joins
function star(cx, cy, r1, r2, n = 5) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i * Math.PI) / n - Math.PI / 2;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}
star(400, 90, 60, 26);
ctx.lineJoin = "round";
ctx.lineWidth = 8;
ctx.strokeStyle = "#201e1d";
ctx.stroke();

// Bézier curve with dashes
ctx.beginPath();
ctx.moveTo(320, 260);
ctx.bezierCurveTo(360, 150, 460, 330, 520, 200);
ctx.setLineDash([12, 8]);
ctx.lineWidth = 4;
ctx.strokeStyle = "#9c36b5";
ctx.stroke();
ctx.setLineDash([]);
console.log("Canvas is", width, "×", height, "CSS pixels");`;

const CANVAS_GRADIENTS = `// Gradients, shadows and text metrics.
const bg = ctx.createLinearGradient(0, 0, width, height);
bg.addColorStop(0, "#0f2027");
bg.addColorStop(0.5, "#203a43");
bg.addColorStop(1, "#2c5364");
ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);

const glow = ctx.createRadialGradient(width * 0.7, height * 0.35, 10, width * 0.7, height * 0.35, 180);
glow.addColorStop(0, "rgba(255, 204, 85, .95)");
glow.addColorStop(1, "rgba(255, 204, 85, 0)");
ctx.fillStyle = glow;
ctx.fillRect(0, 0, width, height);

ctx.shadowColor = "rgba(0, 0, 0, .45)";
ctx.shadowBlur = 18;
ctx.shadowOffsetY = 6;
const text = "Hello, canvas";
ctx.font = "bold 56px Georgia, serif";
const fill = ctx.createLinearGradient(40, 0, 460, 0);
fill.addColorStop(0, "#ffffff");
fill.addColorStop(1, "#7dd3fc");
ctx.fillStyle = fill;
ctx.fillText(text, 40, height / 2);
ctx.shadowColor = "transparent";

const m = ctx.measureText(text);
ctx.strokeStyle = "rgba(255,255,255,.5)";
ctx.strokeRect(40, height / 2 - m.actualBoundingBoxAscent, m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
ctx.font = "15px ui-monospace, monospace";
ctx.fillStyle = "#cbd5e1";
ctx.fillText(\`measureText: \${m.width.toFixed(1)}px wide\`, 40, height / 2 + 40);
console.log("Text width:", m.width.toFixed(1));`;

const CANVAS_ANIM = `// An animation loop: loop(fn) calls fn(seconds, frame) every frame.
const balls = Array.from({ length: 24 }, (_, i) => ({
  x: random(20, width - 20), y: random(20, height / 2),
  vx: random(-160, 160), vy: random(-50, 50),
  r: random(8, 22), hue: (i * 360) / 24,
}));
let last = 0;
loop((t) => {
  const dt = Math.min(0.05, t - last);
  last = t;
  clear("rgba(250, 250, 252, 1)");
  for (const b of balls) {
    b.vy += 900 * dt;                      // gravity
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > height - b.r) { b.y = height - b.r; b.vy *= -0.86; }
    if (b.x < b.r || b.x > width - b.r) { b.vx *= -1; b.x = Math.max(b.r, Math.min(width - b.r, b.x)); }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = \`hsl(\${b.hue} 80% 55%)\`;
    ctx.fill();
  }
  ctx.fillStyle = "#555";
  ctx.font = "13px ui-monospace, monospace";
  ctx.fillText(\`t = \${t.toFixed(1)} s\`, 12, 20);
});`;

const CANVAS_MANDEL = `// The Mandelbrot set, pixel by pixel with ImageData.
// Works in device pixels, so it stays sharp on high-DPI screens.
const W = canvas.width, H = canvas.height;
const img = ctx.createImageData(W, H);
const maxIter = 160;
const cx = -0.65, cy = 0, scale = 3.2 / W;
const t0 = performance.now();
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const x0 = cx + (px - W / 2) * scale, y0 = cy + (py - H / 2) * scale;
    let x = 0, y = 0, i = 0;
    while (x * x + y * y <= 4 && i < maxIter) {
      const xt = x * x - y * y + x0;
      y = 2 * x * y + y0;
      x = xt;
      i++;
    }
    const k = (py * W + px) * 4;
    if (i === maxIter) { img.data[k + 3] = 255; continue; }
    const s = i + 1 - Math.log2(Math.log2(x * x + y * y) / 2);  // smooth colouring
    img.data[k] = 9 * (1 - s / maxIter) * (s / maxIter) ** 3 * 255 * 4;
    img.data[k + 1] = 15 * (1 - s / maxIter) ** 2 * (s / maxIter) ** 2 * 255 * 2;
    img.data[k + 2] = 8.5 * (1 - s / maxIter) ** 3 * (s / maxIter) * 255 * 1.2 + 40;
    img.data[k + 3] = 255;
  }
}
ctx.putImageData(img, 0, 0);
console.log(\`\${W}×\${H} pixels in \${Math.round(performance.now() - t0)} ms\`);`;

const CANVAS_PARTICLES = `// A particle fountain with fading trails.
const parts = [];
loop((t, frame) => {
  // Translucent clear leaves trails behind moving particles.
  clear("rgba(12, 14, 24, 0.22)");
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + random(-0.35, 0.35);
    const v = random(160, 320);
    parts.push({ x: width / 2, y: height - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: (t * 60 + random(0, 40)) % 360 });
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += 280 / 60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;
    p.life -= 0.011;
    if (p.life <= 0 || p.y > height) { parts.splice(i, 1); continue; }
    ctx.fillStyle = \`hsla(\${p.hue} 90% 60% / \${p.life})\`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 + 3 * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  if (frame % 120 === 0) console.log("particles alive:", parts.length);
});`;

const CANVAS_FLOW = `// Generative art: particles following a flow field of smooth noise.
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
clear("#faf7f2");
const palette = ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"];
ctx.lineWidth = 1.1;
ctx.globalAlpha = 0.55;
for (let i = 0; i < 900; i++) {
  let x = random(width), y = random(height);
  ctx.strokeStyle = palette[i % palette.length];
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let s = 0; s < 70; s++) {
    const angle = noise(x * 0.006, y * 0.006) * Math.PI * 4;
    x += Math.cos(angle) * 2.2;
    y += Math.sin(angle) * 2.2;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}
ctx.globalAlpha = 1;
console.log("Re-run for a different composition.");`;

const CANVAS_CLOCK = `// An analog clock, redrawn every frame.
function hand(angle, length, widthPx, color) {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, length * 0.15);
  ctx.lineTo(0, -length);
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}
loop(() => {
  const r = Math.min(width, height) / 2 - 16;
  clear("#f7f5f2");
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#201e1d";
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 30);
    ctx.beginPath();
    ctx.moveTo(0, -r + 8);
    ctx.lineTo(0, -r + (i % 5 ? 14 : 26));
    ctx.lineWidth = i % 5 ? 1.5 : 4;
    ctx.stroke();
    ctx.restore();
  }
  const now = new Date();
  const s = now.getSeconds() + now.getMilliseconds() / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  hand((h * Math.PI) / 6, r * 0.5, 8, "#201e1d");
  hand((m * Math.PI) / 30, r * 0.75, 5, "#201e1d");
  hand((s * Math.PI) / 30, r * 0.85, 2, "#d6006c");
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#d6006c";
  ctx.fill();
  ctx.restore();
});`;

/* ── Whiteboard example scenes ───────────────────────────────────────── */

function flowchart(): string {
  B.reset();
  const E: El[] = [];
  const blue = { fill: "hatch" as const, fillColor: "#a5d8ff" };
  E.push(B.ellipse(120, 20, 160, 64, { fill: "solid", fillColor: "#b2f2bb" }), B.label(120, 20, 160, 64, "Start"));
  E.push(B.arrow([200, 86], [200, 126]));
  E.push(B.rect(100, 130, 200, 70, blue), B.label(100, 130, 200, 70, "Read order"));
  E.push(B.arrow([200, 202], [200, 242]));
  E.push(B.diamond(90, 246, 220, 120, { fill: "solid", fillColor: "#ffec99" }), B.label(90, 246, 220, 120, "In stock?"));
  E.push(B.arrow([312, 306], [420, 306]), B.text(340, 276, "yes", { size: 16, stroke: "#2f9e44" }));
  E.push(B.rect(424, 272, 190, 70, blue), B.label(424, 272, 190, 70, "Ship it"));
  E.push(B.arrow([200, 368], [200, 420]), B.text(210, 380, "no", { size: 16, stroke: "#e03131" }));
  E.push(B.rect(100, 424, 200, 70, { fill: "hatch", fillColor: "#ffc9c9", stroke: "#e03131" }), B.label(100, 424, 200, 70, "Back-order\n& notify", { size: 18 }));
  E.push(B.ellipse(439, 430, 160, 64, { fill: "solid", fillColor: "#e9ecef" }), B.label(439, 430, 160, 64, "End"));
  E.push(B.arrow([519, 344], [519, 426]));
  E.push(B.arrow([302, 459], [436, 461], { dash: true }));
  return sceneJson(E);
}

function architecture(): string {
  B.reset();
  const E: El[] = [];
  E.push(B.rect(20, 150, 150, 80, { fill: "solid", fillColor: "#e9ecef" }), B.label(20, 150, 150, 80, "Browser"));
  E.push(B.ellipse(220, 40, 150, 80, { fill: "hatch", fillColor: "#99e9f2" }), B.label(220, 40, 150, 80, "CDN"));
  E.push(B.rect(230, 150, 150, 80, { fill: "hatch", fillColor: "#a5d8ff", stroke: "#1971c2" }), B.label(230, 150, 150, 80, "API\ngateway", { size: 18 }));
  E.push(B.rect(440, 90, 150, 70, { fill: "solid", fillColor: "#b2f2bb" }), B.label(440, 90, 150, 70, "Orders"));
  E.push(B.rect(440, 220, 150, 70, { fill: "solid", fillColor: "#eebefa" }), B.label(440, 220, 150, 70, "Payments"));
  E.push(B.ellipse(660, 80, 120, 90, { fill: "hatch", fillColor: "#ffec99" }), B.label(660, 80, 120, 90, "Postgres", { size: 18 }));
  E.push(B.rect(650, 230, 140, 50, { dash: true }), B.label(650, 230, 140, 50, "queue", { size: 18 }));
  E.push(B.rect(650, 330, 140, 60, { fill: "solid", fillColor: "#ffc9c9" }), B.label(650, 330, 140, 60, "Workers", { size: 18 }));
  E.push(B.arrow([172, 172], [224, 100]), B.text(150, 110, "static", { size: 15, stroke: "#868e96" }));
  E.push(B.arrow([172, 192], [226, 192]));
  E.push(B.arrow([382, 175], [436, 130]));
  E.push(B.arrow([382, 205], [436, 250]));
  E.push(B.arrow([592, 125], [656, 125]));
  E.push(B.arrow([592, 255], [646, 255], { dash: true }), B.text(596, 262, "events", { size: 14, stroke: "#868e96" }));
  E.push(B.arrow([720, 282], [720, 326]));
  E.push(B.rect(420, 60, 390, 350, { stroke: "#868e96", dash: true, sw: 1 }), B.text(430, 380, "private network", { size: 15, stroke: "#868e96" }));
  E.push(B.pen([[40, 260], [60, 275], [90, 280], [120, 272], [140, 258]], { stroke: "#e03131", sw: 2 }), B.text(28, 286, "users!", { size: 16, stroke: "#e03131" }));
  return sceneJson(E);
}

function wireframe(): string {
  B.reset();
  const E: El[] = [];
  E.push(B.rect(40, 20, 260, 520, { sw: 3 }));
  E.push(B.ellipse(155, 30, 30, 10, { fill: "solid", fillColor: "#1e1e1e" }));
  E.push(B.rect(40, 50, 260, 50, { fill: "solid", fillColor: "#e9ecef" }), B.text(58, 62, "≡", { size: 24 }), B.label(40, 50, 260, 50, "Trail Finder", { size: 18 }));
  E.push(B.rect(60, 116, 220, 130, { fill: "hatch", fillColor: "#ced4da" }), B.line([60, 116], [280, 246], { sw: 1 }), B.line([280, 116], [60, 246], { sw: 1 }));
  E.push(B.text(60, 256, "Coastal loop, 12 km", { size: 18 }));
  E.push(B.line([60, 290], [270, 290], { stroke: "#adb5bd", sw: 5 }), B.line([60, 306], [240, 306], { stroke: "#adb5bd", sw: 5 }), B.line([60, 322], [200, 322], { stroke: "#adb5bd", sw: 5 }));
  E.push(B.rect(60, 346, 100, 34, { fill: "solid", fillColor: "#a5d8ff", stroke: "#1971c2" }), B.label(60, 346, 100, 34, "Start", { size: 16 }));
  E.push(B.rect(172, 346, 108, 34), B.label(172, 346, 108, 34, "Save", { size: 16 }));
  E.push(B.rect(60, 396, 220, 70, { fill: "hatch", fillColor: "#b2f2bb" }), B.text(72, 404, "Map preview", { size: 16, stroke: "#2f9e44" }));
  E.push(B.line([40, 480], [300, 480]));
  for (let i = 0; i < 4; i++) E.push(B.ellipse(68 + i * 62, 494, 26, 26, i === 0 ? { fill: "solid", fillColor: "#1971c2", stroke: "#1971c2" } : {}));
  E.push(B.arrow([330, 150], [290, 170], { stroke: "#e03131" }), B.text(336, 126, "hero image\n16:9", { size: 16, stroke: "#e03131" }));
  E.push(B.arrow([340, 370], [290, 364], { stroke: "#e03131" }), B.text(346, 356, "primary CTA", { size: 16, stroke: "#e03131" }));
  return sceneJson(E);
}

function mindmap(): string {
  B.reset();
  const E: El[] = [];
  const cx = 360, cy = 230;
  E.push(B.ellipse(cx - 95, cy - 45, 190, 90, { fill: "solid", fillColor: "#ffec99", sw: 3 }), B.label(cx - 95, cy - 45, 190, 90, "Launch\nplan", { size: 22 }));
  const branches: [string, number, number, string, string[]][] = [
    ["Product", 110, 70, "#a5d8ff", ["Beta feedback", "Feature freeze"]],
    ["Marketing", 620, 70, "#eebefa", ["Landing page", "Launch post"]],
    ["Support", 110, 390, "#b2f2bb", ["Docs", "FAQ"]],
    ["Sales", 620, 390, "#ffc9c9", ["Pricing", "Demo script"]],
  ];
  for (const [name, x, y, color, leaves] of branches) {
    E.push(B.pen([[cx + (x < cx ? -80 : 80), cy + (y < cy ? -20 : 20)], [(cx + x) / 2, (cy + y) / 2 + (y < cy ? 10 : -10)], [x + (x < cx ? 60 : -60), y + (y < cy ? 18 : -18)]], { sw: 3, stroke: "#495057" }));
    E.push(B.rect(x - 70, y - 22, 140, 44, { fill: "solid", fillColor: color }), B.label(x - 70, y - 22, 140, 44, name, { size: 18 }));
    leaves.forEach((leaf, i) => {
      const lx = x + (x < cx ? -150 : 150), ly = y + (i ? 36 : -36) + (y < cy ? -14 : 14);
      E.push(B.line([x + (x < cx ? -70 : 70), y], [lx + (x < cx ? 58 : -58), ly], { sw: 1.5, stroke: "#868e96" }));
      E.push(B.text(lx - 60, ly - 11, leaf, { size: 16, w: 120, align: "center" }));
    });
  }
  return sceneJson(E);
}

/* ── specs ───────────────────────────────────────────────────────────── */

const liveOpt = { id: "live", label: "Live reload", type: "toggle" as const, default: true, hint: "Re-run shortly after you stop typing" };

const specs: SpecModule = {
  "openscad-playground": {
    inputs: [
      { id: "code", label: "OpenSCAD", lang: "scad", placeholder: "cube(10);" },
      { id: "params", label: "Customizer values (JSON)", kind: "text" },
    ],
    autorun: false,
    skipNodeTest: true,
    action: "Render",
    custom: () => import("./ui/F-OpenScad"),
    async run({ inputs }) {
      const code = str(inputs.code);
      if (!code.trim()) throw new ToolError("Write some OpenSCAD — for example: cube(10);");
      const { renderScad, parseParams, definesFor, stlStats } = await import("./lib/F-openscad");
      let overrides: Record<string, unknown> = {};
      try {
        overrides = JSON.parse(str(inputs.params) || "{}");
      } catch {
        /* ignore bad overrides */
      }
      const r = await renderScad(code, definesFor(parseParams(code), overrides));
      const consoleText = r.logs.map((l) => l.text).join("\n");
      if (!r.ok || !r.data) {
        const errs = r.logs.filter((l) => l.level === "error" || /empty|not a 3D object/i.test(l.text)).map((l) => l.text);
        throw new ToolError(`${errs.length ? errs.join("\n") : "OpenSCAD produced no geometry."}${consoleText && !errs.length ? `\n\n${consoleText}` : ""}`);
      }
      const warnings = r.logs.filter((l) => l.level === "warning").length;
      const echoes = r.logs.filter((l) => l.level === "echo").length;
      const consoleView: View = { label: `Console${warnings ? ` (${warnings} warning${warnings > 1 ? "s" : ""})` : ""}`, out: { kind: "text", text: consoleText || "(no output)" } };
      if (r.format === "svg") {
        return {
          text: r.data,
          blob: new Blob([r.data], { type: "image/svg+xml" }),
          filename: "model.svg",
          notes: ["The top-level object is 2D, so it was exported as SVG."],
          views: [{ label: "2D (SVG)", out: { kind: "svg", svg: r.data, name: "model" } }, consoleView],
        };
      }
      const s = stlStats(r.data);
      const size = s.max.map((v, i) => v - s.min[i]).map((v) => Math.round(v * 100) / 100);
      return {
        text: r.data,
        blob: new Blob([r.data], { type: "model/stl" }),
        filename: "model.stl",
        views: [
          consoleView,
          {
            label: "Model",
            out: {
              kind: "stats",
              items: [
                { label: "triangles", value: s.triangles.toLocaleString() },
                { label: "mm (X×Y×Z)", value: size.join(" × ") },
                { label: "volume", value: `${(s.volume / 1000).toFixed(2)} cm³` },
                { label: "surface", value: `${(s.area / 100).toFixed(1)} cm²` },
                { label: "render", value: `${r.ms} ms` },
                ...(echoes ? [{ label: "echo lines", value: String(echoes) }] : []),
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "CSG: cube ∩ sphere", inputs: { code: SCAD_CSG }, note: "difference(), intersection() and a for loop over rotations — the OpenSCAD logo shape." },
      { label: "Parametric gear", inputs: { code: SCAD_GEAR }, note: "Modules, for loops and customizer sliders: change the teeth and module values on the left." },
      { label: "Vase (rotate_extrude)", inputs: { code: SCAD_VASE }, note: "A profile built with a function and list comprehensions, spun into a solid." },
      { label: "Star (linear_extrude)", inputs: { code: SCAD_STAR }, note: "Polygons from list comprehensions; extrusion with scale and twist; offset() outlines." },
      { label: "Rounded box + lid", inputs: { code: SCAD_BOX }, note: "hull() of four cylinders for rounded corners; minkowski() for a rounded lid." },
      { label: "Phone stand", inputs: { code: SCAD_STAND }, note: "A practical parametric print: set your phone's thickness and lean angle." },
      { label: "2D → SVG", inputs: { code: SCAD_2D }, note: "A 2D-only design is exported as SVG instead of STL." },
      { label: "Syntax error", inputs: { code: SCAD_ERROR }, error: true, note: "The parser error names the line." },
    ],
    steps: ["Write OpenSCAD on the left (or pick an example) — it renders on load.", "Press Render, F5 or Ctrl/⌘+Enter after edits.", "Drag to orbit, scroll to zoom; toggle wireframe and grid.", "Adjust customizer sliders; download the STL for your slicer."],
    tips: ["Everything runs in a Web Worker with OpenSCAD compiled to WebAssembly (Manifold backend).", "text() needs fonts, which are not bundled — draw lettering with shapes instead.", "Add // [min:max] after a top-level variable to get a slider."],
  },

  "threejs-playground": {
    inputs: [{ id: "code", label: "Module code", lang: "js" }],
    options: [liveOpt],
    skipNodeTest: true,
    pipe: false,
    custom: () => import("./ui/F-ThreePlayground"),
    examples: [
      { label: "Spinning cube", inputs: { code: THREE_CUBE }, note: "The minimum scene: renderer, camera, one mesh and an animation loop." },
      { label: "Lights & materials", inputs: { code: THREE_MATERIALS }, note: "MeshStandardMaterial across roughness and metalness, lit by hemisphere, directional and point lights." },
      { label: "Particle galaxy", inputs: { code: THREE_POINTS }, note: "20 000 Points with per-vertex colours and additive blending." },
      { label: "OrbitControls", inputs: { code: THREE_ORBIT }, note: "Import an addon: \"three/addons/controls/OrbitControls.js\" — damping and auto-rotate." },
      { label: "Instanced grid", inputs: { code: THREE_INSTANCED }, note: "1 600 animated boxes in a single draw call with InstancedMesh." },
      { label: "Torus knot + shadows", inputs: { code: THREE_SHADOWS }, note: "Shadow maps from a spot light onto a ground plane." },
      { label: "Solar system", inputs: { code: THREE_SOLAR }, note: "A scene graph: planets on rotating pivots, a moon parented to the Earth." },
      { label: "Runtime error", inputs: { code: THREE_ERROR }, error: true, note: "Errors appear over the preview and in the console with their line." },
    ],
    steps: ["Edit the module — `import * as THREE from \"three\"` works offline.", "It re-runs as you type (Live reload) or with Run / Ctrl+Enter.", "console.log output appears under the preview.", "Save a PNG of the current frame."],
    tips: ["Code runs in a sandboxed iframe with no access to this page.", "Use innerWidth/innerHeight and a resize listener to fill the preview."],
  },

  "canvas-playground": {
    inputs: [{ id: "code", label: "Canvas code", lang: "js" }],
    options: [
      { id: "size", label: "Canvas", type: "select", choices: [["fit", "Fit preview"], ["400x400", "400 × 400"], ["600x400", "600 × 400"], ["800x600", "800 × 600"], ["512x512", "512 × 512"], ["1080x1080", "1080 × 1080"], ["1200x630", "1200 × 630 (OG image)"]], default: "600x400" },
      { id: "bg", label: "Background", type: "color", default: "#ffffff" },
      liveOpt,
    ],
    skipNodeTest: true,
    pipe: false,
    custom: () => import("./ui/F-CanvasPlayground"),
    examples: [
      { label: "Shapes & paths", inputs: { code: CANVAS_SHAPES }, note: "fillRect, arcs, a star path with round joins and a dashed Bézier." },
      { label: "Gradients & text", inputs: { code: CANVAS_GRADIENTS }, note: "Linear and radial gradients, shadows and measureText." },
      { label: "Bouncing balls", inputs: { code: CANVAS_ANIM }, note: "loop((t) => …) runs every frame; simple gravity physics." },
      { label: "Mandelbrot", inputs: { code: CANVAS_MANDEL }, opts: { size: "800x600" }, note: "Per-pixel rendering with ImageData and smooth colouring." },
      { label: "Particles", inputs: { code: CANVAS_PARTICLES }, opts: { bg: "#0c0e18" }, note: "A fountain with fading trails from a translucent clear()." },
      { label: "Flow field", inputs: { code: CANVAS_FLOW }, opts: { size: "1080x1080" }, note: "Generative art: lines following value noise. Export it as PNG." },
      { label: "Analog clock", inputs: { code: CANVAS_CLOCK }, opts: { size: "400x400" }, note: "Transforms (translate/rotate/save/restore) redrawn every frame." },
    ],
    steps: ["Write drawing code — canvas, ctx, width and height are ready.", "Use loop((t, frame) => …) for animation, clear(color) and random(a, b) helpers.", "Pick a canvas size; export the result as PNG.", "Stop halts the animation; Run restarts it."],
    tips: ["The canvas is scaled for high-DPI screens; draw in CSS pixels.", "Code runs in a sandboxed iframe with no access to this page."],
  },

  "excalidraw-embed": {
    inputs: [{ id: "scene", label: "Scene JSON", lang: "json" }],
    options: [
      { id: "export", label: "Export", type: "segment", choices: [["svg", "SVG"], ["json", "Scene JSON"]], default: "svg" },
      { id: "transparent", label: "Transparent background", type: "toggle", default: false },
    ],
    custom: () => import("./ui/F-Whiteboard"),
    async run({ inputs, opts }) {
      const { parseScene, sceneToSvg } = await import("./lib/F-board");
      let scene;
      try {
        scene = parseScene(str(inputs.scene));
      } catch (e) {
        throw new ToolError(`The scene is not valid JSON: ${(e as Error).message}`);
      }
      if (str(opts.export) === "json") {
        const text = JSON.stringify(scene, null, 2);
        return { text, lang: "json", filename: "whiteboard.json", views: [{ label: "Scene", out: { kind: "text", text, lang: "json" } }, { label: "Tree", out: { kind: "tree", value: scene } }] };
      }
      const svg = sceneToSvg(scene, { background: !bool(opts.transparent) });
      const counts = scene.elements.reduce<Record<string, number>>((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
      return {
        text: svg,
        filename: "whiteboard.svg",
        views: [
          { label: "SVG", out: { kind: "svg", svg, name: "whiteboard" } },
          { label: "SVG source", out: { kind: "text", text: svg, lang: "xml" } },
          { label: "Elements", out: { kind: "stats", items: [{ label: "elements", value: scene.elements.length }, ...Object.entries(counts).map(([k, v]) => ({ label: k, value: v }))] } },
        ],
      };
    },
    examples: [
      { label: "My board", inputs: { scene: "" }, note: "Your own drawing — autosaved in this browser as you work." },
      { label: "Flowchart", inputs: { scene: flowchart() }, note: "Shapes, labels and arrows with hatch and solid fills." },
      { label: "Architecture sketch", inputs: { scene: architecture() }, note: "A hand-drawn system diagram: dashed boundary, queue and annotations." },
      { label: "Mobile wireframe", inputs: { scene: wireframe() }, note: "A low-fidelity phone screen with red review notes." },
      { label: "Mind map", inputs: { scene: mindmap() }, note: "Freehand connectors radiating from a central idea." },
    ],
    steps: ["Pick a tool (keys: V select, P pen, R rectangle, O ellipse, D diamond, A arrow, L line, T text, E eraser).", "Drag to draw; hold Space and drag, or scroll, to pan; Ctrl+scroll or pinch to zoom.", "Select to move, resize, restyle, duplicate (Ctrl+D) or delete.", "Export PNG or SVG; the drawing autosaves and rides along in history and workspaces."],
    tips: ["Undo/redo: Ctrl+Z / Ctrl+Shift+Z.", "Toggle hand-drawn style off for crisp geometric shapes."],
  },
};

export default specs;
