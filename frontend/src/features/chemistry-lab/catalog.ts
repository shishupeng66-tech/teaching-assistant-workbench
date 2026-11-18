import resources from "./locales/experiments.zh-CN.json";
export type Control = {
  key: string;
  label: string;
  default: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit: string;
  options?: string[][];
  kind: string;
};
export type Experiment = {
  id: string;
  title: string;
  category: string;
  level: string;
  description: string;
  objectives: string[];
  theory: string;
  limits: string;
  topic: string;
  controls: Control[];
  camera: number[];
};
export const experiments: Experiment[] = resources;
export function defaults(experiment: Experiment) {
  return Object.fromEntries(experiment.controls.map((c) => [c.key, c.default]));
}
