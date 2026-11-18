import { createContext, useContext, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
type Runtime = { playing: boolean; speed: number; time: { current: number } };
const Clock = createContext<Runtime | null>(null);
export function LabClock({
  playing,
  speed,
  children,
}: {
  playing: boolean;
  speed: number;
  children: ReactNode;
}) {
  const time = useRef(0);
  useFrame((state, delta) => {
    if (playing) time.current += Math.min(delta, 0.05) * speed;
    state.gl.domElement.dataset.simTime = time.current.toFixed(3);
    state.gl.domElement.dataset.geometries = String(
      state.gl.info.memory.geometries,
    );
    state.gl.domElement.dataset.drawCalls = String(state.gl.info.render.calls);
  }, -1000);
  return (
    <Clock.Provider value={{ playing, speed, time }}>{children}</Clock.Provider>
  );
}
// 上游所有动画统一使用可暂停的虚拟时钟；渲染与相机仍可继续响应鼠标。
export function useLabFrame(
  callback: (state: RootState, delta: number) => void,
) {
  const runtime = useContext(Clock);
  useFrame((state, delta) => {
    if (!runtime || !runtime.playing) return;
    const clock = Object.create(state.clock) as RootState["clock"];
    clock.elapsedTime = runtime.time.current;
    clock.getElapsedTime = () => runtime.time.current;
    callback({ ...state, clock }, Math.min(delta, 0.05) * runtime.speed);
  });
}
