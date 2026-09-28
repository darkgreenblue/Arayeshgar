"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/** A real WebGL installation made from Reza's own photographs, not a synthetic portrait. */
export function OrbitStage({ images }: { images: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const step = useRef<(direction: number) => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element || images.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      return; // The real photograph below remains visible without WebGL.
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 8.1);
    const orbit = new THREE.Group();
    scene.add(orbit);

    const positions = [
      { x: 0, y: 0, z: 1.2, turn: 0 },
      { x: -2.7, y: 0.25, z: -0.3, turn: 0.43 },
      { x: 2.7, y: -0.15, z: -0.3, turn: -0.43 },
      { x: -4.4, y: -0.45, z: -2.3, turn: 0.8 },
      { x: 4.4, y: 0.38, z: -2.3, turn: -0.8 },
    ];
    const loader = new THREE.TextureLoader();
    const cards: THREE.Group[] = [];
    const textures: THREE.Texture[] = [];
    const frameGeometry = new THREE.PlaneGeometry(2.52, 3.36);
    const imageGeometry = new THREE.PlaneGeometry(2.38, 3.18);
    images.slice(0, 5).forEach((src, index) => {
      const position = positions[index]!;
      const card = new THREE.Group();
      card.position.set(position.x, position.y, position.z);
      card.rotation.y = position.turn;
      const frame = new THREE.Mesh(
        frameGeometry,
        new THREE.MeshBasicMaterial({
          color: index === 0 ? 0x929cff : 0x4d507a,
          side: THREE.DoubleSide,
        }),
      );
      card.add(frame);
      const texture = loader.load(src, index === 0 ? () => setReady(true) : undefined);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const photograph = new THREE.Mesh(
        imageGeometry,
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
      );
      photograph.position.z = 0.012;
      card.add(photograph);
      orbit.add(card);
      cards.push(card);
    });

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.008, 3, 128),
      new THREE.MeshBasicMaterial({ color: 0x777ee9, transparent: true, opacity: 0.65 }),
    );
    halo.rotation.x = -0.2;
    halo.position.z = -2.8;
    orbit.add(halo);
    const haloTwo = new THREE.Mesh(
      new THREE.TorusGeometry(4.7, 0.005, 3, 128),
      new THREE.MeshBasicMaterial({ color: 0x9a6fce, transparent: true, opacity: 0.3 }),
    );
    haloTwo.rotation.x = 0.35;
    haloTwo.position.z = -3.5;
    orbit.add(haloTwo);

    let pointerX = 0;
    let pointerY = 0;
    let dragStartX: number | null = null;
    let dragOffset = 0;
    let targetDrag = 0;
    step.current = (direction) => {
      targetDrag += direction * 0.48;
      dragOffset = targetDrag;
    };
    const updatePointer = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      if (dragStartX !== null) {
        targetDrag = dragOffset + ((event.clientX - dragStartX) / Math.max(rect.width, 1)) * 2.6;
      }
    };
    const onDown = (event: PointerEvent) => {
      dragStartX = event.clientX;
      element.setPointerCapture(event.pointerId);
    };
    const onUp = () => {
      dragOffset = targetDrag;
      dragStartX = null;
    };
    const reset = () => {
      pointerX = 0;
      pointerY = 0;
    };
    element.addEventListener("pointermove", updatePointer);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    element.addEventListener("pointerleave", reset);

    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.position.z = width < 600 ? 8.1 : width < 950 ? 8.4 : 8.1;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    let frameId = 0;
    const startedAt = performance.now();
    const render = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const targetY = pointerX * 0.28 + targetDrag;
      orbit.rotation.y += (targetY - orbit.rotation.y) * 0.065;
      orbit.rotation.x += (-pointerY * 0.13 - orbit.rotation.x) * 0.065;
      cards.forEach((card, index) => {
        card.position.y = positions[index]!.y + Math.sin(elapsed * 0.65 + index * 1.3) * 0.1;
      });
      halo.rotation.z = elapsed * 0.035;
      haloTwo.rotation.z = -elapsed * 0.025;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      element.removeEventListener("pointermove", updatePointer);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      element.removeEventListener("pointerleave", reset);
      frameGeometry.dispose();
      imageGeometry.dispose();
      textures.forEach((texture) => texture.dispose());
      cards.forEach((card) =>
        card.children.forEach((child) => {
          if (child instanceof THREE.Mesh) child.material.dispose();
        }),
      );
      halo.geometry.dispose();
      (halo.material as THREE.Material).dispose();
      haloTwo.geometry.dispose();
      (haloTwo.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      step.current = () => {};
    };
  }, [images]);

  const rotate = (direction: number) => {
    step.current(direction);
  };

  return (
    <div
      className="relative h-full min-h-[330px] w-full overflow-hidden"
      aria-label="نمای سه‌بعدی تعاملی از نمونه‌کارهای رضا حسینی"
    >
      <img
        src={images[2] ?? images[0]}
        alt="نمونه‌کار اصلاح مو توسط رضا حسینی"
        className={`pointer-events-none absolute top-1/2 left-1/2 h-[72%] w-auto max-w-[65%] -translate-x-1/2 -translate-y-1/2 object-cover grayscale transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
        fetchPriority="high"
      />
      <div
        ref={host}
        className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing [&>canvas]:block"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute top-8 right-3 z-10 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[10px] text-white/90 backdrop-blur-sm sm:inset-x-0 sm:top-auto sm:right-auto sm:bottom-5 sm:justify-center sm:gap-3 sm:bg-transparent sm:text-xs sm:backdrop-blur-none">
        <span className="hidden sm:inline">موس را حرکت دهید؛ برای چرخش بکشید</span>
        <span className="sm:hidden">عکس‌ها را بکشید</span>
        <span className="hidden h-px w-9 bg-[#a5a9ff] sm:inline-block" />
      </div>
      <div className="absolute bottom-3 left-3 z-20 flex gap-2 sm:bottom-5 sm:left-5 lg:left-[calc(7vw+1.25rem)]">
        <button
          type="button"
          onClick={() => rotate(-1)}
          aria-label="چرخاندن نمونه‌کارها به راست"
          className="grid size-10 place-items-center rounded-full border border-white/40 bg-black/45 text-white backdrop-blur-sm hover:bg-[#7B85E0] focus-visible:outline-2 focus-visible:outline-white"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => rotate(1)}
          aria-label="چرخاندن نمونه‌کارها به چپ"
          className="grid size-10 place-items-center rounded-full border border-white/40 bg-black/45 text-white backdrop-blur-sm hover:bg-[#7B85E0] focus-visible:outline-2 focus-visible:outline-white"
        >
          →
        </button>
      </div>
    </div>
  );
}
