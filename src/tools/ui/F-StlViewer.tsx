"use client";

import { useEffect, useRef, useState } from "react";

type Three = typeof import("three");
type Ctx = {
  THREE: Three;
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  controls: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls;
  loader: import("three/examples/jsm/loaders/STLLoader.js").STLLoader;
  mesh: import("three").Mesh | null;
  edges: import("three").LineSegments | null;
  grid: import("three").GridHelper;
  axes: import("three").AxesHelper;
  render: () => void;
  fit: () => void;
};

/**
 * A small three.js STL viewer: Z-up like OpenSCAD, orbit controls, grid and
 * axes, wireframe, auto-fit camera. `resetKey` changes re-fit the view.
 */
export default function StlViewer({ stl, wireframe, grid, resetKey, color = "#f2c230", height = 440 }: { stl: string; wireframe: boolean; grid: boolean; resetKey: number; color?: string; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Ctx | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        if (disposed || !host.current) return;
        const el = host.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "none";
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 100000);
        camera.up.set(0, 0, 1);
        camera.position.set(80, -100, 80);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.8);
        key.position.set(1, -1.5, 2);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 0.6);
        rim.position.set(-1.5, 1, 0.5);
        scene.add(rim);
        const gridH = new THREE.GridHelper(200, 20, 0x8a96a3, 0xd5dbe1);
        gridH.rotation.x = Math.PI / 2;
        scene.add(gridH);
        const axes = new THREE.AxesHelper(30);
        scene.add(axes);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.12;
        let raf = 0;
        const render = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            controls.update();
            renderer.render(scene, camera);
          });
        };
        controls.addEventListener("change", render);
        const c: Ctx = {
          THREE, renderer, scene, camera, controls, loader: new STLLoader(), mesh: null, edges: null, grid: gridH, axes, render,
          fit: () => {
            const target = c.mesh;
            const box = new THREE.Box3();
            if (target) box.setFromObject(target);
            else box.set(new THREE.Vector3(-20, -20, 0), new THREE.Vector3(20, 20, 20));
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 1);
            const dist = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.7;
            const dir = new THREE.Vector3(1, -1.25, 0.95).normalize();
            camera.position.copy(center).addScaledVector(dir, dist);
            camera.near = dist / 100;
            camera.far = dist * 100;
            camera.updateProjectionMatrix();
            controls.target.copy(center);
            // Grid sized to the model, on its base.
            const span = Math.pow(10, Math.ceil(Math.log10(maxDim * 2)));
            scene.remove(c.grid);
            c.grid.geometry.dispose();
            c.grid = new THREE.GridHelper(span, 20, 0x8a96a3, 0xd5dbe1);
            c.grid.rotation.x = Math.PI / 2;
            c.grid.position.set(center.x, center.y, Math.min(0, box.min.z));
            c.grid.visible = gridRef.current;
            scene.add(c.grid);
            c.axes.scale.setScalar(Math.max(0.2, maxDim / 30));
            controls.update();
            render();
          },
        };
        ctx.current = c;
        ro = new ResizeObserver(() => {
          const w = el.clientWidth, h = el.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / Math.max(1, h);
          camera.updateProjectionMatrix();
          render();
        });
        ro.observe(el);
        setReady(true);
        render();
      } catch (e) {
        setErr(`3D preview unavailable: ${(e as Error).message}`);
      }
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      const c = ctx.current;
      if (c) {
        c.controls.dispose();
        c.mesh?.geometry.dispose();
        c.renderer.dispose();
        c.renderer.domElement.remove();
      }
      ctx.current = null;
    };
  }, []);

  // New geometry.
  useEffect(() => {
    const c = ctx.current;
    if (!ready || !c) return;
    const { THREE } = c;
    if (c.mesh) {
      c.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
    if (c.edges) {
      c.scene.remove(c.edges);
      c.edges.geometry.dispose();
      c.edges = null;
    }
    if (!stl) return c.render();
    try {
      const geo = c.loader.parse(stl);
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: true, side: THREE.DoubleSide, wireframe });
      c.mesh = new THREE.Mesh(geo, mat);
      c.scene.add(c.mesh);
      c.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x5b4a12, transparent: true, opacity: 0.35 }));
      c.edges.visible = !wireframe;
      c.scene.add(c.edges);
      setErr("");
      c.fit();
    } catch (e) {
      setErr(`Could not read the STL: ${(e as Error).message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stl, ready]);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (c.mesh) (c.mesh.material as import("three").MeshStandardMaterial).wireframe = wireframe;
    if (c.edges) c.edges.visible = !wireframe;
    c.grid.visible = grid;
    c.axes.visible = grid;
    c.render();
  }, [wireframe, grid, ready]);

  useEffect(() => {
    if (resetKey) ctx.current?.fit();
  }, [resetKey]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={host} style={{ height, width: "100%", background: "radial-gradient(circle at 50% 35%, #ffffff, #e9edf1)", borderRadius: 6, overflow: "hidden" }} data-testid="stl-viewer" />
      {!ready && !err && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {err && <p style={{ position: "absolute", left: 12, bottom: 8, margin: 0, fontSize: 13, color: "var(--color-accent-2-700)" }}>{err}</p>}
    </div>
  );
}
