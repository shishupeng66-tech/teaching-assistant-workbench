import { t } from "./i18n";
import type { Params } from "./Scene";
const fields: Record<string, [string, string, number?][]> = {
  "atomic-structure": [
    ["elementName", "", 0],
    ["symbol", "", 0],
    ["atomicNumber", "", 0],
    ["massNumber", "", 0],
    ["electronConfig", "", 0],
  ],
  electrolysis: [
    ["h2Volume", "mL", 2],
    ["o2Volume", "mL", 2],
  ],
  "gas-laws": [
    ["pressure", "kPa", 2],
    ["moles", "mol", 3],
    ["temperature", "K", 0],
    ["volume", "L", 1],
  ],
  titration: [
    ["currentPH", "", 2],
    ["volumeAdded", "mL", 2],
    ["equivalencePointVolume", "mL", 2],
  ],
  "acid-base-reactions": [
    ["currentPH", "", 2],
    ["reactionProgress", "%", 1],
    ["productsFormed", "", 0],
  ],
  "crystal-lattice": [
    ["coordinationNumber", "", 0],
    ["packingEfficiency", "%", 1],
    ["atomsPerUnitCell", "", 0],
  ],
  diffusion: [
    ["leftConcentration", "", 0],
    ["rightConcentration", "", 0],
    ["gradientIndex", "", 1],
  ],
  thermochemistry: [
    ["progress", "%", 1],
    ["exoTemperature", "K", 1],
    ["endoTemperature", "K", 1],
  ],
  "chemical-bonding": [["currentStep", "", 0]],
};
export default function Results({
  id,
  data,
  p,
}: {
  id: string;
  data: Record<string, unknown>;
  p: Params;
}) {
  let values = { ...data };
  if (id === "gas-laws")
    values = {
      ...values,
      pressure: Number(data.pressure) / 1000,
      moles: Number(p.numParticles) / 1000,
      temperature: p.temperature,
      volume: p.volume,
    };
  if (id === "acid-base-reactions")
    values = {
      ...values,
      currentPH: data.pH,
      reactionProgress: Number(data.reactionProgress) * 100,
    };
  if (id === "thermochemistry")
    values = {
      ...values,
      progress: Number(data.progress) * 100,
      exoTemperature: data.exothermicTemp,
      endoTemperature: data.endothermicTemp,
    };
  if (id === "crystal-lattice")
    values = {
      ...values,
      packingEfficiency: Number(data.packingEfficiency) * 100,
      atomsPerUnitCell: data.atomsPerCell,
    };
  if (id === "chemical-bonding") values.currentStep = p.step;
  const e = data.selectedElement as Record<string, unknown> | undefined;
  if (id === "periodic-trends")
    return e ? (
      <div className="lab-readings">
        <strong>
          {String(e.name)} · {String(e.symbol)}
        </strong>
        {["atomicRadius", "electronegativity", "ionizationEnergy"].map((k) => (
          <p key={k}>
            {t(k)}：
            {e[k] === null || !Number.isFinite(e[k]) || Number(e[k]) <= 0
              ? t("valueUnavailable")
              : String(e[k])}{" "}
            {k === "atomicRadius"
              ? "pm"
              : k === "ionizationEnergy"
                ? "kJ/mol"
                : ""}
          </p>
        ))}
        <small>{t("noUnknown")}</small>
      </div>
    ) : (
      <p>{t("selectElement")}</p>
    );
  return (
    <dl className="lab-readings">
      {(fields[id] || []).map(([key, unit, decimals]) => {
        const value = values[key];
        return (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>
              {typeof value === "number"
                ? Number.isFinite(value)
                  ? value.toFixed(decimals ?? 1)
                  : "—"
                : typeof value === "string"
                  ? t(value)
                  : "—"}{" "}
              <small>{unit}</small>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
