import { lazy, Suspense, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { OrbitControls, Environment, Lightformer } from "@react-three/drei";
import { LabClock } from "./runtime";
import type { ElementData } from "./scenes/periodic-trends-scene";
const Atomic = lazy(() =>
  import("./scenes/atomic-structure-scene").then((m) => ({
    default: m.AtomicStructureSceneComponent,
  })),
);
const Bonding = lazy(() =>
  import("./scenes/chemical-bonding-scene").then((m) => ({
    default: m.ChemicalBondingSceneComponent,
  })),
);
const Electrolysis = lazy(() =>
  import("./scenes/electrolysis-scene").then((m) => ({
    default: m.ElectrolysisSceneComponent,
  })),
);
const Titration = lazy(() =>
  import("./scenes/titration-scene").then((m) => ({
    default: m.TitrationSceneComponent,
  })),
);
const Gas = lazy(() =>
  import("./scenes/gas-laws-scene").then((m) => ({
    default: m.GasLawsSceneComponent,
  })),
);
const AcidBase = lazy(() =>
  import("./scenes/acid-base-reactions-scene").then((m) => ({
    default: m.AcidBaseReactionsSceneComponent,
  })),
);
const Crystal = lazy(() =>
  import("./scenes/crystal-lattice-scene").then((m) => ({
    default: m.CrystalLatticeSceneComponent,
  })),
);
const Diffusion = lazy(() =>
  import("./scenes/diffusion-scene").then((m) => ({ default: m.default })),
);
const Thermo = lazy(() =>
  import("./scenes/thermochemistry-scene").then((m) => ({
    default: m.ThermochemistrySceneComponent,
  })),
);
const Periodic = lazy(() =>
  import("./scenes/periodic-trends-scene").then((m) => ({
    default: m.PeriodicTrendsScene,
  })),
);
function AtomicCamera({ atomicNumber }: { atomicNumber: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const d =
      atomicNumber <= 2
        ? 4
        : atomicNumber <= 10
          ? 7
          : atomicNumber <= 18
            ? 13
            : 22;
    camera.position.set(d * 0.65, d * 0.45, d * 0.65);
    camera.lookAt(0, 0, 0);
  }, [camera, atomicNumber]);
  return null;
}
export type Params = Record<string, string | number | boolean>;
export default function Scene({
  id,
  params: p,
  playing,
  speed,
  camera,
  onData,
  onSelect,
  manualDrop,
  onReady,
}: {
  id: string;
  params: Params;
  playing: boolean;
  speed: number;
  camera: number[];
  onData: (data: object) => void;
  onSelect: (e: ElementData) => void;
  manualDrop: number;
  onReady: () => void;
}) {
  const data = useCallback((value: object) => onData(value), [onData]);
  const num = (key: string) => Number(p[key]);
  const bool = (key: string) => Boolean(p[key]);
  return (
    <Canvas
      camera={{
        position: camera as [number, number, number],
        fov: 50,
        near: 0.1,
        far: 500,
      }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor("#070d20");
        onReady();
      }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 20, 10]} intensity={1.4} />
      <pointLight position={[-12, 8, 10]} color="#8ab7ff" intensity={1.1} />
      <Suspense fallback={null}>
        <Environment resolution={64} frames={1}>
          <Lightformer
            intensity={2}
            color="#9ac8ff"
            position={[0, 8, 0]}
            scale={[15, 15, 1]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        </Environment>
        <LabClock playing={playing} speed={speed}>
          {id === "atomic-structure" && (
            <AtomicCamera atomicNumber={num("atomicNumber")} />
          )}
          {id === "atomic-structure" && (
            <Atomic
              atomicNumber={num("atomicNumber")}
              showElectronShells={bool("showElectronShells")}
              animationSpeed={1}
              isPlaying={playing}
              onDataChange={data}
            />
          )}
          {id === "chemical-bonding" && (
            <Bonding
              bondType={p.bondType as "ionic" | "covalent" | "metallic"}
              isPlaying={playing}
              animationSpeed={1}
              stepMode="manual"
              manualStep={num("step") - 1}
              onDataChange={data}
            />
          )}
          {id === "electrolysis" && (
            <Electrolysis
              voltage={num("voltage")}
              electrolyte="water"
              isRunning={playing}
              step={num("step")}
              onDataChange={data}
            />
          )}
          {id === "titration" && (
            <Titration
              acidConcentration={num("acidConcentration")}
              baseConcentration={num("baseConcentration")}
              acidType={p.acidType as "HCl" | "CH3COOH"}
              baseType="NaOH"
              indicatorType={
                p.indicator as
                  | "universal"
                  | "phenolphthalein"
                  | "methyl-orange"
                  | "bromothymol"
              }
              dripSpeed={num("dripSpeed")}
              isDripping={playing && bool("dripping")}
              manualDripTrigger={manualDrop}
              onDataChange={data}
            />
          )}
          {id === "gas-laws" && (
            <Gas
              temperature={num("temperature")}
              volume={num("volume")}
              numParticles={num("numParticles")}
              onDataChange={data}
            />
          )}
          {id === "acid-base-reactions" && (
            <AcidBase
              acidConcentration={num("acidConcentration")}
              baseConcentration={num("baseConcentration")}
              acidType="HCl"
              isPlaying={playing}
              stepMode={false}
              currentStep={1}
              onDataChange={data}
            />
          )}
          {id === "crystal-lattice" && (
            <Crystal
              latticeType={p.latticeType as "FCC" | "BCC" | "HCP" | "diamond"}
              showUnitCell={bool("showUnitCell")}
              showBonds={bool("showBonds")}
              isPlaying={playing}
              onDataChange={data}
            />
          )}
          {id === "diffusion" && (
            <Diffusion
              isPlaying={playing}
              simulationSpeed={1}
              temperature={num("temperature")}
              poreSize={num("poreSize")}
              particleCount={num("particleCount")}
              onDataChange={data}
            />
          )}
          {id === "thermochemistry" && (
            <Thermo
              activationEnergy={num("activationEnergy")}
              energyReleased={num("energyReleased")}
              isPlaying={playing}
              stepMode={false}
              currentStep={1}
              onDataChange={data}
            />
          )}
          {id === "periodic-trends" && (
            <Periodic
              trend={
                p.trend as
                  "atomicRadius" | "electronegativity" | "ionizationEnergy"
              }
              heightScale={num("periodicScale")}
              selectedAtomicNumber={num("selectedAtomicNumber")}
              onDataChange={data}
              onElementClick={onSelect}
            />
          )}
        </LabClock>
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={70}
      />
    </Canvas>
  );
}
