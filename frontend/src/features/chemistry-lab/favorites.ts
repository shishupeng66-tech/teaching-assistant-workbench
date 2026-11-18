import { experiments } from "./catalog";
const key = "taw-chemistry-lab-favorites-v1";
export function validateFavorites(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    value.some(
      (v) => typeof v !== "string" || !experiments.some((e) => e.id === v),
    ) ||
    new Set(value).size !== value.length
  )
    throw new Error("importError");
  return value as string[];
}
export function loadFavorites(): string[] {
  try {
    return validateFavorites(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}
export function saveFavorites(ids: string[]) {
  localStorage.setItem(key, JSON.stringify(validateFavorites(ids)));
}
