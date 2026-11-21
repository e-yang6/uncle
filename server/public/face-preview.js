// A static, on-demand view of the actual saved GLB; no camera/mic or animation loop.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function release(object) {
  object?.traverse(item => {
    item.geometry?.dispose();
    for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

export class FacePreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xf3eee4, 0x8a8378, 2.5));
    const key = new THREE.DirectionalLight(0xf3eee4, 3);
    key.position.set(-1, 2, 3); this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
    this.camera.position.set(0, 0.01, 0.85);
    this.camera.lookAt(0, 0, 0);
    this.version = 0;
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(canvas);
  }
  render() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
  async load(id) {
    this.clear();
    const version = this.version;
    const { scene: model } = await new GLTFLoader().loadAsync(`/head/builds/${encodeURIComponent(id)}/head.glb`);
    if (version !== this.version) { release(model); return false; }
    const bounds = new THREE.Box3().setFromObject(model);
    const height = bounds.getSize(new THREE.Vector3()).y;
    if (!Number.isFinite(height) || height <= 0) { release(model); throw new Error("Empty head mesh"); }
    model.scale.multiplyScalar(0.38 / height);
    const centre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(centre);
    this.model = model; this.scene.add(model); this.render();
    return true;
  }
  clear() {
    this.version++;
    if (this.model) { this.scene.remove(this.model); release(this.model); this.model = null; }
    this.render();
  }
  dispose() { this.clear(); this.observer.disconnect(); this.renderer.dispose(); }
}
