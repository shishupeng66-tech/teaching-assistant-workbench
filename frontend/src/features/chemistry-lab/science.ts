/** 从上游utils/physics提取化学气体场景实际使用的三式，不引入其他学科模块。 */
export function calculateGasPressure(
  n: number,
  R: number,
  T: number,
  V: number,
) {
  return (n * R * T) / V;
}
export function calculateGasAverageKE(T: number, kB = 1.380649e-23) {
  return 1.5 * kB * T;
}
export function calculateGasRMS(T: number, molarMass: number, R = 8.314) {
  return Math.sqrt((3 * R * T) / molarMass);
}
/** 25℃理想稀强酸/强碱，水自解离提供接近当量点的连续过渡。 */
export function strongMixturePH(
  acidMoles: number,
  baseMoles: number,
  volumeL: number,
) {
  const c = (acidMoles - baseMoles) / volumeL;
  const h =
    c >= 0
      ? (c + Math.sqrt(c * c + 4e-14)) / 2
      : 2e-14 / (-c + Math.sqrt(c * c + 4e-14));
  return -Math.log10(h);
}
/** 一元酸滴定：乙酸采用质量守恒+电荷平衡求根，避免分段近当量点不连续。 */
export function titrationPH(
  addedML: number,
  acidML: number,
  acidConc: number,
  baseConc: number,
  acidType: string,
) {
  const volumeL = (acidML + addedML) / 1000,
    acidMoles = (acidML * acidConc) / 1000,
    baseMoles = (addedML * baseConc) / 1000;
  if (acidType === "HCl") return strongMixturePH(acidMoles, baseMoles, volumeL);
  const totalAcid = acidMoles / volumeL,
    sodium = baseMoles / volumeL,
    Ka = 1.8e-5;
  const charge = (pH: number) => {
    const h = 10 ** -pH;
    return h + sodium - 1e-14 / h - (totalAcid * Ka) / (Ka + h);
  };
  let lo = -2,
    hi = 16;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (charge(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** 仅教学能量剖面：反应物80，过渡态80+Ea，产物80+ΔH，曲线连续。 */
export function reactionEnergy(
  progress: number,
  activationEnergy: number,
  deltaH: number,
) {
  const x = Math.max(0, Math.min(1, progress));
  return x <= 0.5
    ? 80 + activationEnergy * Math.sin(x * Math.PI)
    : 80 + deltaH + (activationEnergy - deltaH) * Math.cos((x - 0.5) * Math.PI);
}
