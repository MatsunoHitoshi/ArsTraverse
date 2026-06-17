"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SkeletonMotionData } from "@/app/const/skeleton-motion";
import {
  getSkeletonJointRadius,
  getSkeletonJointRole,
  interpolateFrame,
  interpolateFrame3d,
  interpolateLoopFrame,
  interpolateLoopFrame3d,
  type JointPose3d,
} from "@/app/const/skeleton-motion";

const SCENE_SCALE = 1 / 30;
/** Shift skeleton upward in preview (pelvis-centered data sits at origin). */
const BODY_VIEW_OFFSET_Y = 1;

type SkeletonMotion3DPreviewProps = {
  motionData: SkeletonMotionData | null;
  playbackProgress?: number;
  loopCrossfade?: boolean;
  width?: number;
  height?: number;
};

function resolvePose3d(
  motionData: SkeletonMotionData,
  progress: number,
  loopCrossfade: boolean,
): JointPose3d[] {
  const frames3d = motionData.frames3d;
  if (frames3d && frames3d.length > 0) {
    return loopCrossfade
      ? interpolateLoopFrame3d(frames3d, progress)
      : interpolateFrame3d(
        frames3d,
        progress * Math.max(frames3d.length - 1, 0),
      );
  }

  const frames = motionData.frames;
  const pose2d = loopCrossfade
    ? interpolateLoopFrame(frames, progress)
    : interpolateFrame(frames, progress * Math.max(frames.length - 1, 0));

  return pose2d.map(([x, y]) => [x, y, 0] as JointPose3d);
}

function jointColorHex(role: ReturnType<typeof getSkeletonJointRole>): number {
  if (role === "head") return 0x38bdf8;
  if (role === "hand") return 0xa5f3fc;
  return 0xf8fafc;
}

export function SkeletonMotion3DPreview({
  motionData,
  playbackProgress = 0,
  loopCrossfade = true,
  width = 280,
  height = 220,
}: SkeletonMotion3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef(playbackProgress);
  const loopRef = useRef(loopCrossfade);

  playbackRef.current = playbackProgress;
  loopRef.current = loopCrossfade;

  const has3d = !!motionData?.frames3d?.length;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !motionData || motionData.frames.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);
    camera.position.set(1.8, 1.4 + BODY_VIEW_OFFSET_Y, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.7 + BODY_VIEW_OFFSET_Y, 0);
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 6;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-2, 2, -3);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(4, 8, 0x334155, 0x1e293b);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(0.6));

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);

    const { boneConnections, jointNames } = motionData;
    const bonePositions = new Float32Array(boneConnections.length * 2 * 3);
    const boneGeometry = new THREE.BufferGeometry();
    boneGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(bonePositions, 3),
    );
    const boneLines = new THREE.LineSegments(
      boneGeometry,
      new THREE.LineBasicMaterial({ color: 0xe2e8f0, linewidth: 2 }),
    );
    scene.add(boneLines);

    const jointMeshes = jointNames.map((name, i) => {
      const role = getSkeletonJointRole(name);
      const radius = getSkeletonJointRadius(role) * SCENE_SCALE * 0.85;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 12),
        new THREE.MeshStandardMaterial({ color: jointColorHex(role) }),
      );
      mesh.userData.jointIndex = i;
      scene.add(mesh);
      return mesh;
    });

    const applyPose = (pose: JointPose3d[]) => {
      boneConnections.forEach(([a, b], i) => {
        const ja = pose[a];
        const jb = pose[b];
        if (!ja || !jb) return;
        const base = i * 6;
        bonePositions[base] = ja[0] * SCENE_SCALE;
        bonePositions[base + 1] = ja[1] * SCENE_SCALE + BODY_VIEW_OFFSET_Y;
        bonePositions[base + 2] = ja[2] * SCENE_SCALE;
        bonePositions[base + 3] = jb[0] * SCENE_SCALE;
        bonePositions[base + 4] = jb[1] * SCENE_SCALE + BODY_VIEW_OFFSET_Y;
        bonePositions[base + 5] = jb[2] * SCENE_SCALE;
      });
      boneGeometry.attributes.position!.needsUpdate = true;

      pose.forEach(([x, y, z], i) => {
        const mesh = jointMeshes[i];
        if (!mesh) return;
        mesh.position.set(
          x * SCENE_SCALE,
          y * SCENE_SCALE + BODY_VIEW_OFFSET_Y,
          z * SCENE_SCALE,
        );
      });
    };

    let rafId = 0;
    const renderLoop = () => {
      const pose = resolvePose3d(
        motionData,
        playbackRef.current,
        loopRef.current,
      );
      applyPose(pose);
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(rafId);
      controls.dispose();
      boneGeometry.dispose();
      (boneLines.material as THREE.Material).dispose();
      jointMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        scene.remove(mesh);
      });
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [motionData, width, height]);

  if (!motionData || motionData.frames.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-gray-700 bg-slate-950 text-xs text-gray-500"
        style={{ width, height }}
      >
        モーション未生成
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-violet-800/50 bg-slate-950"
      style={{ width }}
    >
      <div ref={mountRef} style={{ width, height }} />
      <p className="border-t border-gray-800 px-2 py-1 text-[10px] text-gray-500">
        {has3d ? "3D joints" : "2D fallback (Z=0)"} · ドラッグで回転
      </p>
    </div>
  );
}
