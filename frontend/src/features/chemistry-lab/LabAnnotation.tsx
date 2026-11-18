import { isValidElement } from "react";
import type { ReactNode } from "react";
import type { ThreeElements } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { LabText } from "./LabText";
function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).filter(Boolean).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const value = text(node.props.children);
    return typeof node.type === "string" &&
      ["div", "p", "li"].includes(node.type) &&
      value.trim()
      ? value.trim() + "\n"
      : value;
  }
  return "";
}
/** 场景注释仍锚定三维坐标；使用本地SDF文字，避免切换实验时Html独立DOM根同步卸载警告。 */
export function LabAnnotation({
  children,
  position,
  center,
}: {
  children: ReactNode;
  position?: ThreeElements["group"]["position"];
  center?: boolean;
  distanceFactor?: number;
  style?: object;
}) {
  return (
    <Billboard position={position}>
      <LabText
        fontSize={0.16}
        color="#e3efff"
        anchorX={center ? "center" : "left"}
        anchorY="middle"
        maxWidth={5.5}
        textAlign={center ? "center" : "left"}
        outlineWidth={0.004}
        outlineColor="#070d20"
        raycast={() => {}}
      >
        {text(children)}
      </LabText>
    </Billboard>
  );
}
