import { useLabFrame } from "../runtime";
import type { Group } from "three";
import { t } from "../i18n";
("use client");

import {
  useRef,
  useMemo,
  useState,
  useCallback,
  Suspense,
  useEffect,
} from "react";
import { LabAnnotation as Html } from "../LabAnnotation";
import { LabText as Text } from "../LabText";

// Element data interface
export interface ElementData {
  number: number;
  symbol: string;
  name: string;
  mass: number;
  category: ElementCategory;
  group: number;
  period: number;
  electronegativity: number | null;
  atomicRadius: number;
  ionizationEnergy: number;
  electronConfig: string;
}

export type ElementCategory =
  | "alkali-metal"
  | "alkaline-earth"
  | "transition-metal"
  | "post-transition"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble-gas"
  | "lanthanide"
  | "actinide";

// Complete 118 element data with accurate positions
const ELEMENTS: ElementData[] = [
  // Period 1
  {
    number: 1,
    symbol: "H",
    name: t("Hydrogen"),
    mass: 1.008,
    category: "nonmetal",
    group: 1,
    period: 1,
    electronegativity: 2.2,
    atomicRadius: 53,
    ionizationEnergy: 1312,
    electronConfig: "1s¹",
  },
  {
    number: 2,
    symbol: "He",
    name: t("Helium"),
    mass: 4.003,
    category: "noble-gas",
    group: 18,
    period: 1,
    electronegativity: null,
    atomicRadius: 31,
    ionizationEnergy: 2372,
    electronConfig: "1s²",
  },

  // Period 2
  {
    number: 3,
    symbol: "Li",
    name: t("Lithium"),
    mass: 6.941,
    category: "alkali-metal",
    group: 1,
    period: 2,
    electronegativity: 0.98,
    atomicRadius: 167,
    ionizationEnergy: 520,
    electronConfig: "[He] 2s¹",
  },
  {
    number: 4,
    symbol: "Be",
    name: t("Beryllium"),
    mass: 9.012,
    category: "alkaline-earth",
    group: 2,
    period: 2,
    electronegativity: 1.57,
    atomicRadius: 112,
    ionizationEnergy: 899,
    electronConfig: "[He] 2s²",
  },
  {
    number: 5,
    symbol: "B",
    name: t("Boron"),
    mass: 10.81,
    category: "metalloid",
    group: 13,
    period: 2,
    electronegativity: 2.04,
    atomicRadius: 87,
    ionizationEnergy: 801,
    electronConfig: "[He] 2s² 2p¹",
  },
  {
    number: 6,
    symbol: "C",
    name: t("Carbon"),
    mass: 12.01,
    category: "nonmetal",
    group: 14,
    period: 2,
    electronegativity: 2.55,
    atomicRadius: 67,
    ionizationEnergy: 1086,
    electronConfig: "[He] 2s² 2p²",
  },
  {
    number: 7,
    symbol: "N",
    name: t("Nitrogen"),
    mass: 14.01,
    category: "nonmetal",
    group: 15,
    period: 2,
    electronegativity: 3.04,
    atomicRadius: 56,
    ionizationEnergy: 1402,
    electronConfig: "[He] 2s² 2p³",
  },
  {
    number: 8,
    symbol: "O",
    name: t("Oxygen"),
    mass: 16.0,
    category: "nonmetal",
    group: 16,
    period: 2,
    electronegativity: 3.44,
    atomicRadius: 48,
    ionizationEnergy: 1314,
    electronConfig: "[He] 2s² 2p⁴",
  },
  {
    number: 9,
    symbol: "F",
    name: t("Fluorine"),
    mass: 19.0,
    category: "halogen",
    group: 17,
    period: 2,
    electronegativity: 3.98,
    atomicRadius: 42,
    ionizationEnergy: 1681,
    electronConfig: "[He] 2s² 2p⁵",
  },
  {
    number: 10,
    symbol: "Ne",
    name: t("Neon"),
    mass: 20.18,
    category: "noble-gas",
    group: 18,
    period: 2,
    electronegativity: null,
    atomicRadius: 38,
    ionizationEnergy: 2081,
    electronConfig: "[He] 2s² 2p⁶",
  },

  // Period 3
  {
    number: 11,
    symbol: "Na",
    name: t("Sodium"),
    mass: 22.99,
    category: "alkali-metal",
    group: 1,
    period: 3,
    electronegativity: 0.93,
    atomicRadius: 190,
    ionizationEnergy: 496,
    electronConfig: "[Ne] 3s¹",
  },
  {
    number: 12,
    symbol: "Mg",
    name: t("Magnesium"),
    mass: 24.31,
    category: "alkaline-earth",
    group: 2,
    period: 3,
    electronegativity: 1.31,
    atomicRadius: 145,
    ionizationEnergy: 738,
    electronConfig: "[Ne] 3s²",
  },
  {
    number: 13,
    symbol: "Al",
    name: t("Aluminum"),
    mass: 26.98,
    category: "post-transition",
    group: 13,
    period: 3,
    electronegativity: 1.61,
    atomicRadius: 118,
    ionizationEnergy: 578,
    electronConfig: "[Ne] 3s² 3p¹",
  },
  {
    number: 14,
    symbol: "Si",
    name: t("Silicon"),
    mass: 28.09,
    category: "metalloid",
    group: 14,
    period: 3,
    electronegativity: 1.9,
    atomicRadius: 111,
    ionizationEnergy: 787,
    electronConfig: "[Ne] 3s² 3p²",
  },
  {
    number: 15,
    symbol: "P",
    name: t("Phosphorus"),
    mass: 30.97,
    category: "nonmetal",
    group: 15,
    period: 3,
    electronegativity: 2.19,
    atomicRadius: 98,
    ionizationEnergy: 1012,
    electronConfig: "[Ne] 3s² 3p³",
  },
  {
    number: 16,
    symbol: "S",
    name: t("Sulfur"),
    mass: 32.07,
    category: "nonmetal",
    group: 16,
    period: 3,
    electronegativity: 2.58,
    atomicRadius: 88,
    ionizationEnergy: 1000,
    electronConfig: "[Ne] 3s² 3p⁴",
  },
  {
    number: 17,
    symbol: "Cl",
    name: t("Chlorine"),
    mass: 35.45,
    category: "halogen",
    group: 17,
    period: 3,
    electronegativity: 3.16,
    atomicRadius: 79,
    ionizationEnergy: 1251,
    electronConfig: "[Ne] 3s² 3p⁵",
  },
  {
    number: 18,
    symbol: "Ar",
    name: t("Argon"),
    mass: 39.95,
    category: "noble-gas",
    group: 18,
    period: 3,
    electronegativity: null,
    atomicRadius: 71,
    ionizationEnergy: 1521,
    electronConfig: "[Ne] 3s² 3p⁶",
  },

  // Period 4
  {
    number: 19,
    symbol: "K",
    name: t("Potassium"),
    mass: 39.1,
    category: "alkali-metal",
    group: 1,
    period: 4,
    electronegativity: 0.82,
    atomicRadius: 243,
    ionizationEnergy: 419,
    electronConfig: "[Ar] 4s¹",
  },
  {
    number: 20,
    symbol: "Ca",
    name: t("Calcium"),
    mass: 40.08,
    category: "alkaline-earth",
    group: 2,
    period: 4,
    electronegativity: 1.0,
    atomicRadius: 194,
    ionizationEnergy: 590,
    electronConfig: "[Ar] 4s²",
  },
  {
    number: 21,
    symbol: "Sc",
    name: t("Scandium"),
    mass: 44.96,
    category: "transition-metal",
    group: 3,
    period: 4,
    electronegativity: 1.36,
    atomicRadius: 184,
    ionizationEnergy: 631,
    electronConfig: "[Ar] 3d¹ 4s²",
  },
  {
    number: 22,
    symbol: "Ti",
    name: t("Titanium"),
    mass: 47.87,
    category: "transition-metal",
    group: 4,
    period: 4,
    electronegativity: 1.54,
    atomicRadius: 176,
    ionizationEnergy: 658,
    electronConfig: "[Ar] 3d² 4s²",
  },
  {
    number: 23,
    symbol: "V",
    name: t("Vanadium"),
    mass: 50.94,
    category: "transition-metal",
    group: 5,
    period: 4,
    electronegativity: 1.63,
    atomicRadius: 171,
    ionizationEnergy: 650,
    electronConfig: "[Ar] 3d³ 4s²",
  },
  {
    number: 24,
    symbol: "Cr",
    name: t("Chromium"),
    mass: 52.0,
    category: "transition-metal",
    group: 6,
    period: 4,
    electronegativity: 1.66,
    atomicRadius: 166,
    ionizationEnergy: 653,
    electronConfig: "[Ar] 3d⁵ 4s¹",
  },
  {
    number: 25,
    symbol: "Mn",
    name: t("Manganese"),
    mass: 54.94,
    category: "transition-metal",
    group: 7,
    period: 4,
    electronegativity: 1.55,
    atomicRadius: 161,
    ionizationEnergy: 717,
    electronConfig: "[Ar] 3d⁵ 4s²",
  },
  {
    number: 26,
    symbol: "Fe",
    name: t("Iron"),
    mass: 55.85,
    category: "transition-metal",
    group: 8,
    period: 4,
    electronegativity: 1.83,
    atomicRadius: 156,
    ionizationEnergy: 762,
    electronConfig: "[Ar] 3d⁶ 4s²",
  },
  {
    number: 27,
    symbol: "Co",
    name: t("Cobalt"),
    mass: 58.93,
    category: "transition-metal",
    group: 9,
    period: 4,
    electronegativity: 1.88,
    atomicRadius: 152,
    ionizationEnergy: 760,
    electronConfig: "[Ar] 3d⁷ 4s²",
  },
  {
    number: 28,
    symbol: "Ni",
    name: t("Nickel"),
    mass: 58.69,
    category: "transition-metal",
    group: 10,
    period: 4,
    electronegativity: 1.91,
    atomicRadius: 149,
    ionizationEnergy: 737,
    electronConfig: "[Ar] 3d⁸ 4s²",
  },
  {
    number: 29,
    symbol: "Cu",
    name: t("Copper"),
    mass: 63.55,
    category: "transition-metal",
    group: 11,
    period: 4,
    electronegativity: 1.9,
    atomicRadius: 145,
    ionizationEnergy: 745,
    electronConfig: "[Ar] 3d¹⁰ 4s¹",
  },
  {
    number: 30,
    symbol: "Zn",
    name: t("Zinc"),
    mass: 65.38,
    category: "transition-metal",
    group: 12,
    period: 4,
    electronegativity: 1.65,
    atomicRadius: 142,
    ionizationEnergy: 906,
    electronConfig: "[Ar] 3d¹⁰ 4s²",
  },
  {
    number: 31,
    symbol: "Ga",
    name: t("Gallium"),
    mass: 69.72,
    category: "post-transition",
    group: 13,
    period: 4,
    electronegativity: 1.81,
    atomicRadius: 136,
    ionizationEnergy: 579,
    electronConfig: "[Ar] 3d¹⁰ 4s² 4p¹",
  },
  {
    number: 32,
    symbol: "Ge",
    name: t("Germanium"),
    mass: 72.63,
    category: "metalloid",
    group: 14,
    period: 4,
    electronegativity: 2.01,
    atomicRadius: 125,
    ionizationEnergy: 762,
    electronConfig: "[Ar] 3d¹⁰ 4s² 4p²",
  },
  {
    number: 33,
    symbol: "As",
    name: t("Arsenic"),
    mass: 74.92,
    category: "metalloid",
    group: 15,
    period: 4,
    electronegativity: 2.18,
    atomicRadius: 114,
    ionizationEnergy: 947,
    electronConfig: "[Ar] 3d¹⁰ 4s² 4p³",
  },
  {
    number: 34,
    symbol: "Se",
    name: t("Selenium"),
    mass: 78.96,
    category: "nonmetal",
    group: 16,
    period: 4,
    electronegativity: 2.55,
    atomicRadius: 103,
    ionizationEnergy: 941,
    electronConfig: "[Ar] 3d¹⁰ 4s² 4p⁴",
  },
  {
    number: 35,
    symbol: "Br",
    name: t("Bromine"),
    mass: 79.9,
    category: "halogen",
    group: 17,
    period: 4,
    electronegativity: 2.96,
    atomicRadius: 94,
    ionizationEnergy: 1140,
    electronConfig: "[Ar] 3d¹⁰ 4s² 4p⁵",
  },
  {
    number: 36,
    symbol: "Kr",
    name: t("Krypton"),
    mass: 83.8,
    category: "noble-gas",
    group: 18,
    period: 4,
    electronegativity: 3.0,
    atomicRadius: 88,
    ionizationEnergy: 1351,
    electronConfig: "[Ar] 3d¹⁰ 4s² 4p⁶",
  },

  // Period 5
  {
    number: 37,
    symbol: "Rb",
    name: t("Rubidium"),
    mass: 85.47,
    category: "alkali-metal",
    group: 1,
    period: 5,
    electronegativity: 0.82,
    atomicRadius: 265,
    ionizationEnergy: 403,
    electronConfig: "[Kr] 5s¹",
  },
  {
    number: 38,
    symbol: "Sr",
    name: t("Strontium"),
    mass: 87.62,
    category: "alkaline-earth",
    group: 2,
    period: 5,
    electronegativity: 0.95,
    atomicRadius: 219,
    ionizationEnergy: 549,
    electronConfig: "[Kr] 5s²",
  },
  {
    number: 39,
    symbol: "Y",
    name: t("Yttrium"),
    mass: 88.91,
    category: "transition-metal",
    group: 3,
    period: 5,
    electronegativity: 1.22,
    atomicRadius: 212,
    ionizationEnergy: 600,
    electronConfig: "[Kr] 4d¹ 5s²",
  },
  {
    number: 40,
    symbol: "Zr",
    name: t("Zirconium"),
    mass: 91.22,
    category: "transition-metal",
    group: 4,
    period: 5,
    electronegativity: 1.33,
    atomicRadius: 206,
    ionizationEnergy: 640,
    electronConfig: "[Kr] 4d² 5s²",
  },
  {
    number: 41,
    symbol: "Nb",
    name: t("Niobium"),
    mass: 92.91,
    category: "transition-metal",
    group: 5,
    period: 5,
    electronegativity: 1.6,
    atomicRadius: 198,
    ionizationEnergy: 652,
    electronConfig: "[Kr] 4d⁴ 5s¹",
  },
  {
    number: 42,
    symbol: "Mo",
    name: t("Molybdenum"),
    mass: 95.94,
    category: "transition-metal",
    group: 6,
    period: 5,
    electronegativity: 2.16,
    atomicRadius: 190,
    ionizationEnergy: 684,
    electronConfig: "[Kr] 4d⁵ 5s¹",
  },
  {
    number: 43,
    symbol: "Tc",
    name: t("Technetium"),
    mass: 98,
    category: "transition-metal",
    group: 7,
    period: 5,
    electronegativity: 1.9,
    atomicRadius: 183,
    ionizationEnergy: 702,
    electronConfig: "[Kr] 4d⁵ 5s²",
  },
  {
    number: 44,
    symbol: "Ru",
    name: t("Ruthenium"),
    mass: 101.1,
    category: "transition-metal",
    group: 8,
    period: 5,
    electronegativity: 2.2,
    atomicRadius: 178,
    ionizationEnergy: 710,
    electronConfig: "[Kr] 4d⁷ 5s¹",
  },
  {
    number: 45,
    symbol: "Rh",
    name: t("Rhodium"),
    mass: 102.9,
    category: "transition-metal",
    group: 9,
    period: 5,
    electronegativity: 2.28,
    atomicRadius: 173,
    ionizationEnergy: 719,
    electronConfig: "[Kr] 4d⁸ 5s¹",
  },
  {
    number: 46,
    symbol: "Pd",
    name: t("Palladium"),
    mass: 106.4,
    category: "transition-metal",
    group: 10,
    period: 5,
    electronegativity: 2.2,
    atomicRadius: 169,
    ionizationEnergy: 804,
    electronConfig: "[Kr] 4d¹⁰",
  },
  {
    number: 47,
    symbol: "Ag",
    name: t("Silver"),
    mass: 107.9,
    category: "transition-metal",
    group: 11,
    period: 5,
    electronegativity: 1.93,
    atomicRadius: 165,
    ionizationEnergy: 731,
    electronConfig: "[Kr] 4d¹⁰ 5s¹",
  },
  {
    number: 48,
    symbol: "Cd",
    name: t("Cadmium"),
    mass: 112.4,
    category: "transition-metal",
    group: 12,
    period: 5,
    electronegativity: 1.69,
    atomicRadius: 161,
    ionizationEnergy: 867,
    electronConfig: "[Kr] 4d¹⁰ 5s²",
  },
  {
    number: 49,
    symbol: "In",
    name: t("Indium"),
    mass: 114.8,
    category: "post-transition",
    group: 13,
    period: 5,
    electronegativity: 1.78,
    atomicRadius: 156,
    ionizationEnergy: 558,
    electronConfig: "[Kr] 4d¹⁰ 5s² 5p¹",
  },
  {
    number: 50,
    symbol: "Sn",
    name: t("Tin"),
    mass: 118.7,
    category: "post-transition",
    group: 14,
    period: 5,
    electronegativity: 1.96,
    atomicRadius: 145,
    ionizationEnergy: 709,
    electronConfig: "[Kr] 4d¹⁰ 5s² 5p²",
  },
  {
    number: 51,
    symbol: "Sb",
    name: t("Antimony"),
    mass: 121.8,
    category: "metalloid",
    group: 15,
    period: 5,
    electronegativity: 2.05,
    atomicRadius: 133,
    ionizationEnergy: 834,
    electronConfig: "[Kr] 4d¹⁰ 5s² 5p³",
  },
  {
    number: 52,
    symbol: "Te",
    name: t("Tellurium"),
    mass: 127.6,
    category: "metalloid",
    group: 16,
    period: 5,
    electronegativity: 2.1,
    atomicRadius: 123,
    ionizationEnergy: 869,
    electronConfig: "[Kr] 4d¹⁰ 5s² 5p⁴",
  },
  {
    number: 53,
    symbol: "I",
    name: t("Iodine"),
    mass: 126.9,
    category: "halogen",
    group: 17,
    period: 5,
    electronegativity: 2.66,
    atomicRadius: 115,
    ionizationEnergy: 1008,
    electronConfig: "[Kr] 4d¹⁰ 5s² 5p⁵",
  },
  {
    number: 54,
    symbol: "Xe",
    name: t("Xenon"),
    mass: 131.3,
    category: "noble-gas",
    group: 18,
    period: 5,
    electronegativity: 2.6,
    atomicRadius: 108,
    ionizationEnergy: 1170,
    electronConfig: "[Kr] 4d¹⁰ 5s² 5p⁶",
  },

  // Period 6
  {
    number: 55,
    symbol: "Cs",
    name: t("Cesium"),
    mass: 132.9,
    category: "alkali-metal",
    group: 1,
    period: 6,
    electronegativity: 0.79,
    atomicRadius: 298,
    ionizationEnergy: 376,
    electronConfig: "[Xe] 6s¹",
  },
  {
    number: 56,
    symbol: "Ba",
    name: t("Barium"),
    mass: 137.3,
    category: "alkaline-earth",
    group: 2,
    period: 6,
    electronegativity: 0.89,
    atomicRadius: 253,
    ionizationEnergy: 503,
    electronConfig: "[Xe] 6s²",
  },

  // Lanthanides (57-71)
  {
    number: 57,
    symbol: "La",
    name: t("Lanthanum"),
    mass: 138.9,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.1,
    atomicRadius: 195,
    ionizationEnergy: 538,
    electronConfig: "[Xe] 5d¹ 6s²",
  },
  {
    number: 58,
    symbol: "Ce",
    name: t("Cerium"),
    mass: 140.1,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.12,
    atomicRadius: 185,
    ionizationEnergy: 534,
    electronConfig: "[Xe] 4f¹ 5d¹ 6s²",
  },
  {
    number: 59,
    symbol: "Pr",
    name: t("Praseodymium"),
    mass: 140.9,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.13,
    atomicRadius: 185,
    ionizationEnergy: 527,
    electronConfig: "[Xe] 4f³ 6s²",
  },
  {
    number: 60,
    symbol: "Nd",
    name: t("Neodymium"),
    mass: 144.2,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.14,
    atomicRadius: 185,
    ionizationEnergy: 533,
    electronConfig: "[Xe] 4f⁴ 6s²",
  },
  {
    number: 61,
    symbol: "Pm",
    name: t("Promethium"),
    mass: 145,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.13,
    atomicRadius: 185,
    ionizationEnergy: 540,
    electronConfig: "[Xe] 4f⁵ 6s²",
  },
  {
    number: 62,
    symbol: "Sm",
    name: t("Samarium"),
    mass: 150.4,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.17,
    atomicRadius: 185,
    ionizationEnergy: 544,
    electronConfig: "[Xe] 4f⁶ 6s²",
  },
  {
    number: 63,
    symbol: "Eu",
    name: t("Europium"),
    mass: 152.0,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.2,
    atomicRadius: 185,
    ionizationEnergy: 547,
    electronConfig: "[Xe] 4f⁷ 6s²",
  },
  {
    number: 64,
    symbol: "Gd",
    name: t("Gadolinium"),
    mass: 157.3,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.2,
    atomicRadius: 185,
    ionizationEnergy: 593,
    electronConfig: "[Xe] 4f⁷ 5d¹ 6s²",
  },
  {
    number: 65,
    symbol: "Tb",
    name: t("Terbium"),
    mass: 158.9,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.2,
    atomicRadius: 185,
    ionizationEnergy: 565,
    electronConfig: "[Xe] 4f⁹ 6s²",
  },
  {
    number: 66,
    symbol: "Dy",
    name: t("Dysprosium"),
    mass: 162.5,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.22,
    atomicRadius: 185,
    ionizationEnergy: 572,
    electronConfig: "[Xe] 4f¹⁰ 6s²",
  },
  {
    number: 67,
    symbol: "Ho",
    name: t("Holmium"),
    mass: 164.9,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.23,
    atomicRadius: 185,
    ionizationEnergy: 581,
    electronConfig: "[Xe] 4f¹¹ 6s²",
  },
  {
    number: 68,
    symbol: "Er",
    name: t("Erbium"),
    mass: 167.3,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.24,
    atomicRadius: 185,
    ionizationEnergy: 589,
    electronConfig: "[Xe] 4f¹² 6s²",
  },
  {
    number: 69,
    symbol: "Tm",
    name: t("Thulium"),
    mass: 168.9,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.25,
    atomicRadius: 185,
    ionizationEnergy: 597,
    electronConfig: "[Xe] 4f¹³ 6s²",
  },
  {
    number: 70,
    symbol: "Yb",
    name: t("Ytterbium"),
    mass: 173.0,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.1,
    atomicRadius: 185,
    ionizationEnergy: 603,
    electronConfig: "[Xe] 4f¹⁴ 6s²",
  },
  {
    number: 71,
    symbol: "Lu",
    name: t("Lutetium"),
    mass: 175.0,
    category: "lanthanide",
    group: 3,
    period: 6,
    electronegativity: 1.27,
    atomicRadius: 185,
    ionizationEnergy: 524,
    electronConfig: "[Xe] 4f¹⁴ 5d¹ 6s²",
  },

  // Continue Period 6 (after lanthanides)
  {
    number: 72,
    symbol: "Hf",
    name: t("Hafnium"),
    mass: 178.5,
    category: "transition-metal",
    group: 4,
    period: 6,
    electronegativity: 1.3,
    atomicRadius: 208,
    ionizationEnergy: 658,
    electronConfig: "[Xe] 4f¹⁴ 5d² 6s²",
  },
  {
    number: 73,
    symbol: "Ta",
    name: t("Tantalum"),
    mass: 180.9,
    category: "transition-metal",
    group: 5,
    period: 6,
    electronegativity: 1.5,
    atomicRadius: 200,
    ionizationEnergy: 761,
    electronConfig: "[Xe] 4f¹⁴ 5d³ 6s²",
  },
  {
    number: 74,
    symbol: "W",
    name: t("Tungsten"),
    mass: 183.8,
    category: "transition-metal",
    group: 6,
    period: 6,
    electronegativity: 2.36,
    atomicRadius: 193,
    ionizationEnergy: 770,
    electronConfig: "[Xe] 4f¹⁴ 5d⁴ 6s²",
  },
  {
    number: 75,
    symbol: "Re",
    name: t("Rhenium"),
    mass: 186.2,
    category: "transition-metal",
    group: 7,
    period: 6,
    electronegativity: 1.9,
    atomicRadius: 188,
    ionizationEnergy: 760,
    electronConfig: "[Xe] 4f¹⁴ 5d⁵ 6s²",
  },
  {
    number: 76,
    symbol: "Os",
    name: t("Osmium"),
    mass: 190.2,
    category: "transition-metal",
    group: 8,
    period: 6,
    electronegativity: 2.2,
    atomicRadius: 185,
    ionizationEnergy: 840,
    electronConfig: "[Xe] 4f¹⁴ 5d⁶ 6s²",
  },
  {
    number: 77,
    symbol: "Ir",
    name: t("Iridium"),
    mass: 192.2,
    category: "transition-metal",
    group: 9,
    period: 6,
    electronegativity: 2.2,
    atomicRadius: 180,
    ionizationEnergy: 880,
    electronConfig: "[Xe] 4f¹⁴ 5d⁷ 6s²",
  },
  {
    number: 78,
    symbol: "Pt",
    name: t("Platinum"),
    mass: 195.1,
    category: "transition-metal",
    group: 10,
    period: 6,
    electronegativity: 2.28,
    atomicRadius: 177,
    ionizationEnergy: 870,
    electronConfig: "[Xe] 4f¹⁴ 5d⁹ 6s¹",
  },
  {
    number: 79,
    symbol: "Au",
    name: t("Gold"),
    mass: 197.0,
    category: "transition-metal",
    group: 11,
    period: 6,
    electronegativity: 2.54,
    atomicRadius: 174,
    ionizationEnergy: 890,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s¹",
  },
  {
    number: 80,
    symbol: "Hg",
    name: t("Mercury"),
    mass: 200.6,
    category: "transition-metal",
    group: 12,
    period: 6,
    electronegativity: 2.0,
    atomicRadius: 171,
    ionizationEnergy: 1007,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s²",
  },
  {
    number: 81,
    symbol: "Tl",
    name: t("Thallium"),
    mass: 204.4,
    category: "post-transition",
    group: 13,
    period: 6,
    electronegativity: 1.62,
    atomicRadius: 170,
    ionizationEnergy: 589,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹",
  },
  {
    number: 82,
    symbol: "Pb",
    name: t("Lead"),
    mass: 207.2,
    category: "post-transition",
    group: 14,
    period: 6,
    electronegativity: 2.33,
    atomicRadius: 175,
    ionizationEnergy: 716,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²",
  },
  {
    number: 83,
    symbol: "Bi",
    name: t("Bismuth"),
    mass: 209.0,
    category: "post-transition",
    group: 15,
    period: 6,
    electronegativity: 2.02,
    atomicRadius: 160,
    ionizationEnergy: 703,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³",
  },
  {
    number: 84,
    symbol: "Po",
    name: t("Polonium"),
    mass: 209,
    category: "metalloid",
    group: 16,
    period: 6,
    electronegativity: 2.0,
    atomicRadius: 153,
    ionizationEnergy: 812,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴",
  },
  {
    number: 85,
    symbol: "At",
    name: t("Astatine"),
    mass: 210,
    category: "halogen",
    group: 17,
    period: 6,
    electronegativity: 2.2,
    atomicRadius: 150,
    ionizationEnergy: 890,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵",
  },
  {
    number: 86,
    symbol: "Rn",
    name: t("Radon"),
    mass: 222,
    category: "noble-gas",
    group: 18,
    period: 6,
    electronegativity: 2.2,
    atomicRadius: 145,
    ionizationEnergy: 1041,
    electronConfig: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶",
  },

  // Period 7
  {
    number: 87,
    symbol: "Fr",
    name: t("Francium"),
    mass: 223,
    category: "alkali-metal",
    group: 1,
    period: 7,
    electronegativity: 0.7,
    atomicRadius: 300,
    ionizationEnergy: 380,
    electronConfig: "[Rn] 7s¹",
  },
  {
    number: 88,
    symbol: "Ra",
    name: t("Radium"),
    mass: 226,
    category: "alkaline-earth",
    group: 2,
    period: 7,
    electronegativity: 0.9,
    atomicRadius: 248,
    ionizationEnergy: 509,
    electronConfig: "[Rn] 7s²",
  },

  // Actinides (89-103)
  {
    number: 89,
    symbol: "Ac",
    name: t("Actinium"),
    mass: 227,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.1,
    atomicRadius: 215,
    ionizationEnergy: 490,
    electronConfig: "[Rn] 6d¹ 7s²",
  },
  {
    number: 90,
    symbol: "Th",
    name: t("Thorium"),
    mass: 232.0,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 206,
    ionizationEnergy: 590,
    electronConfig: "[Rn] 6d² 7s²",
  },
  {
    number: 91,
    symbol: "Pa",
    name: t("Protactinium"),
    mass: 231.0,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.5,
    atomicRadius: 200,
    ionizationEnergy: 570,
    electronConfig: "[Rn] 5f² 6d¹ 7s²",
  },
  {
    number: 92,
    symbol: "U",
    name: t("Uranium"),
    mass: 238.0,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.38,
    atomicRadius: 196,
    ionizationEnergy: 598,
    electronConfig: "[Rn] 5f³ 6d¹ 7s²",
  },
  {
    number: 93,
    symbol: "Np",
    name: t("Neptunium"),
    mass: 237,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.36,
    atomicRadius: 190,
    ionizationEnergy: 600,
    electronConfig: "[Rn] 5f⁴ 6d¹ 7s²",
  },
  {
    number: 94,
    symbol: "Pu",
    name: t("Plutonium"),
    mass: 244,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.28,
    atomicRadius: 187,
    ionizationEnergy: 585,
    electronConfig: "[Rn] 5f⁶ 7s²",
  },
  {
    number: 95,
    symbol: "Am",
    name: t("Americium"),
    mass: 243,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.13,
    atomicRadius: 180,
    ionizationEnergy: 578,
    electronConfig: "[Rn] 5f⁷ 7s²",
  },
  {
    number: 96,
    symbol: "Cm",
    name: t("Curium"),
    mass: 247,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.28,
    atomicRadius: 175,
    ionizationEnergy: 581,
    electronConfig: "[Rn] 5f⁷ 6d¹ 7s²",
  },
  {
    number: 97,
    symbol: "Bk",
    name: t("Berkelium"),
    mass: 247,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 170,
    ionizationEnergy: 601,
    electronConfig: "[Rn] 5f⁹ 7s²",
  },
  {
    number: 98,
    symbol: "Cf",
    name: t("Californium"),
    mass: 251,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 165,
    ionizationEnergy: 608,
    electronConfig: "[Rn] 5f¹⁰ 7s²",
  },
  {
    number: 99,
    symbol: "Es",
    name: t("Einsteinium"),
    mass: 252,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 165,
    ionizationEnergy: 619,
    electronConfig: "[Rn] 5f¹¹ 7s²",
  },
  {
    number: 100,
    symbol: "Fm",
    name: t("Fermium"),
    mass: 257,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 165,
    ionizationEnergy: 627,
    electronConfig: "[Rn] 5f¹² 7s²",
  },
  {
    number: 101,
    symbol: "Md",
    name: t("Mendelevium"),
    mass: 258,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 165,
    ionizationEnergy: 635,
    electronConfig: "[Rn] 5f¹³ 7s²",
  },
  {
    number: 102,
    symbol: "No",
    name: t("Nobelium"),
    mass: 259,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 165,
    ionizationEnergy: 642,
    electronConfig: "[Rn] 5f¹⁴ 7s²",
  },
  {
    number: 103,
    symbol: "Lr",
    name: t("Lawrencium"),
    mass: 266,
    category: "actinide",
    group: 3,
    period: 7,
    electronegativity: 1.3,
    atomicRadius: 165,
    ionizationEnergy: 650,
    electronConfig: "[Rn] 5f¹⁴ 7s² 7p¹",
  },

  // Continue Period 7 (after actinides)
  {
    number: 104,
    symbol: "Rf",
    name: t("Rutherfordium"),
    mass: 267,
    category: "transition-metal",
    group: 4,
    period: 7,
    electronegativity: null,
    atomicRadius: 160,
    ionizationEnergy: 580,
    electronConfig: "[Rn] 5f¹⁴ 6d² 7s²",
  },
  {
    number: 105,
    symbol: "Db",
    name: t("Dubnium"),
    mass: 268,
    category: "transition-metal",
    group: 5,
    period: 7,
    electronegativity: null,
    atomicRadius: 155,
    ionizationEnergy: 620,
    electronConfig: "[Rn] 5f¹⁴ 6d³ 7s²",
  },
  {
    number: 106,
    symbol: "Sg",
    name: t("Seaborgium"),
    mass: 269,
    category: "transition-metal",
    group: 6,
    period: 7,
    electronegativity: null,
    atomicRadius: 150,
    ionizationEnergy: 660,
    electronConfig: "[Rn] 5f¹⁴ 6d⁴ 7s²",
  },
  {
    number: 107,
    symbol: "Bh",
    name: t("Bohrium"),
    mass: 270,
    category: "transition-metal",
    group: 7,
    period: 7,
    electronegativity: null,
    atomicRadius: 145,
    ionizationEnergy: 700,
    electronConfig: "[Rn] 5f¹⁴ 6d⁵ 7s²",
  },
  {
    number: 108,
    symbol: "Hs",
    name: t("Hassium"),
    mass: 277,
    category: "transition-metal",
    group: 8,
    period: 7,
    electronegativity: null,
    atomicRadius: 140,
    ionizationEnergy: 740,
    electronConfig: "[Rn] 5f¹⁴ 6d⁶ 7s²",
  },
  {
    number: 109,
    symbol: "Mt",
    name: t("Meitnerium"),
    mass: 278,
    category: "transition-metal",
    group: 9,
    period: 7,
    electronegativity: null,
    atomicRadius: 138,
    ionizationEnergy: 780,
    electronConfig: "[Rn] 5f¹⁴ 6d⁷ 7s²",
  },
  {
    number: 110,
    symbol: "Ds",
    name: t("Darmstadtium"),
    mass: 281,
    category: "transition-metal",
    group: 10,
    period: 7,
    electronegativity: null,
    atomicRadius: 136,
    ionizationEnergy: 820,
    electronConfig: "[Rn] 5f¹⁴ 6d⁸ 7s²",
  },
  {
    number: 111,
    symbol: "Rg",
    name: t("Roentgenium"),
    mass: 282,
    category: "transition-metal",
    group: 11,
    period: 7,
    electronegativity: null,
    atomicRadius: 134,
    ionizationEnergy: 860,
    electronConfig: "[Rn] 5f¹⁴ 6d⁹ 7s²",
  },
  {
    number: 112,
    symbol: "Cn",
    name: t("Copernicium"),
    mass: 285,
    category: "transition-metal",
    group: 12,
    period: 7,
    electronegativity: null,
    atomicRadius: 132,
    ionizationEnergy: 900,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s²",
  },
  {
    number: 113,
    symbol: "Nh",
    name: t("Nihonium"),
    mass: 286,
    category: "post-transition",
    group: 13,
    period: 7,
    electronegativity: null,
    atomicRadius: 165,
    ionizationEnergy: 703,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹",
  },
  {
    number: 114,
    symbol: "Fl",
    name: t("Flerovium"),
    mass: 289,
    category: "post-transition",
    group: 14,
    period: 7,
    electronegativity: null,
    atomicRadius: 162,
    ionizationEnergy: 758,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²",
  },
  {
    number: 115,
    symbol: "Mc",
    name: t("Moscovium"),
    mass: 290,
    category: "post-transition",
    group: 15,
    period: 7,
    electronegativity: null,
    atomicRadius: 160,
    ionizationEnergy: 734,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³",
  },
  {
    number: 116,
    symbol: "Lv",
    name: t("Livermorium"),
    mass: 293,
    category: "post-transition",
    group: 16,
    period: 7,
    electronegativity: null,
    atomicRadius: 158,
    ionizationEnergy: 739,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴",
  },
  {
    number: 117,
    symbol: "Ts",
    name: t("Tennessine"),
    mass: 294,
    category: "halogen",
    group: 17,
    period: 7,
    electronegativity: null,
    atomicRadius: 155,
    ionizationEnergy: 742,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵",
  },
  {
    number: 118,
    symbol: "Og",
    name: t("Oganesson"),
    mass: 294,
    category: "noble-gas",
    group: 18,
    period: 7,
    electronegativity: null,
    atomicRadius: 152,
    ionizationEnergy: 840,
    electronConfig: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶",
  },
];

// Category colors (simple solid colors)
const CATEGORY_COLORS: Record<ElementCategory, string> = {
  "alkali-metal": "#ff6b6b",
  "alkaline-earth": "#ffa94d",
  "transition-metal": "#ffd43b",
  "post-transition": "#69db7c",
  metalloid: "#4ecdc4",
  nonmetal: "#4dabf7",
  halogen: "#b197fc",
  "noble-gas": "#f783ac",
  lanthanide: "#a5d8ff",
  actinide: "#fcc2d7",
};

export interface PeriodicTrendsSceneProps {
  onDataChange?: (data: {
    selectedElement: ElementData;
    hoveredElement: ElementData | null;
  }) => void;
  trend?: "atomicRadius" | "electronegativity" | "ionizationEnergy";
  heightScale?: number;
  selectedAtomicNumber?: number;
  onElementClick?: (element: ElementData) => void;
}

// Simple element box component
interface ElementBoxProps {
  element: ElementData;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
  onHover: (element: ElementData | null) => void;
}

function ElementBox({
  element,
  position,
  isSelected,
  onClick,
  onHover,
}: ElementBoxProps) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<Group>(null);
  useLabFrame((_, delta) => {
    if (ref.current)
      ref.current.position.z +=
        (position[2] - ref.current.position.z) * (1 - Math.exp(-delta * 8));
  });

  const color = CATEGORY_COLORS[element.category];
  const boxSize = 0.95;
  const boxDepth = 0.1;

  return (
    <group ref={ref} position={[position[0], position[1], 0]}>
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(element);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHover(null);
        }}
      >
        <boxGeometry args={[boxSize, boxSize, boxDepth]} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Selected outline */}
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry
            args={[boxSize * 1.05, boxSize * 1.05, boxDepth * 1.05]}
          />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.5}
            wireframe
          />
        </mesh>
      )}

      {/* Element labels using Text (3D geometry) - positioned on front face */}
      <Text
        position={[0, 0.2, boxDepth / 2 + 0.01]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#000000"
      >
        {element.symbol}
      </Text>

      <Text
        position={[0, 0.35, boxDepth / 2 + 0.01]}
        fontSize={0.1}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.004}
        outlineColor="#000000"
      >
        {element.number}
      </Text>

      <Text
        position={[0, -0.2, boxDepth / 2 + 0.01]}
        fontSize={0.16}
        color="#cccccc"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.003}
        outlineColor="#000000"
        maxWidth={0.8}
      >
        {element.name}
      </Text>

      {/* Tooltip on hover - positioned to the side */}
      {hovered && (
        <Html
          position={[boxSize / 2 + 0.8, 0, 0]}
          distanceFactor={8}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(17, 24, 39, 0.95)",
              color: "white",
              padding: "12px",
              borderRadius: "8px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
              border: "1px solid #374151",
              minWidth: "180px",
              pointerEvents: "none",
            }}
          >
            <div
              style={{ fontSize: "18px", fontWeight: "bold", color: "#22d3ee" }}
            >
              {element.name}
            </div>
            <div style={{ fontSize: "14px", color: "#d1d5db" }}>
              {t("Atomic #:")}
              {element.number}
            </div>
            <div style={{ fontSize: "14px", color: "#d1d5db" }}>
              {t("Mass:")}
              {element.mass}
              {t("amu")}
            </div>
            {element.electronegativity !== null && (
              <div style={{ fontSize: "14px", color: "#d1d5db" }}>
                {t("electronegativity")}: {element.electronegativity}
              </div>
            )}
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "4px",
                textTransform: "capitalize",
              }}
            >
              {t(element.category)}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// Main scene component
export function PeriodicTrendsScene({
  onDataChange,
  onElementClick,
  trend = "atomicRadius",
  heightScale = 1,
  selectedAtomicNumber = 6,
}: PeriodicTrendsSceneProps) {
  const [selectedElement, setSelectedElement] = useState<ElementData>(
    ELEMENTS[5],
  ); // Carbon

  // Calculate position for element in periodic table (vertical wall on XY plane)
  const getElementPosition = useCallback(
    (element: ElementData): [number, number, number] => {
      const spacing = 1.0;
      let x: number, y: number;

      if (element.category === "lanthanide") {
        // Lanthanides: row below main table
        const lanthanideIndex = element.number - 57;
        x = (lanthanideIndex - 7.5) * spacing;
        y = -4.5;
      } else if (element.category === "actinide") {
        // Actinides: row below lanthanides
        const actinideIndex = element.number - 89;
        x = (actinideIndex - 7.5) * spacing;
        y = -5.5;
      } else {
        // Main table: standard 18-column layout on XY plane
        x = (element.group - 9.5) * spacing;
        y = (4.5 - element.period) * spacing;
      }

      const value = element[trend];
      const max =
        trend === "atomicRadius"
          ? 350
          : trend === "electronegativity"
            ? 4
            : 2500;
      return [x, y, (Math.max(0, value || 0) / max) * heightScale * 3];
    },
    [trend, heightScale],
  );

  // Handle element click
  const handleElementClick = useCallback(
    (element: ElementData) => {
      setSelectedElement(element);
      onElementClick?.(element);
      onDataChange?.({
        selectedElement: element,
        hoveredElement: null,
      });
    },
    [onElementClick, onDataChange],
  );

  useEffect(() => {
    const element = ELEMENTS.find((e) => e.number === selectedAtomicNumber);
    if (element) handleElementClick(element);
  }, [selectedAtomicNumber, handleElementClick]);
  // Handle element hover - only for tooltip display, don't update parent data
  const handleElementHover = useCallback((_element: ElementData | null) => {
    // No-op: tooltips are handled inside ElementBox via local state
  }, []);

  // Generate element boxes
  const elementBoxes = useMemo(() => {
    return ELEMENTS.map((element) => {
      const position = getElementPosition(element);
      const isSelected = selectedElement.number === element.number;

      return (
        <ElementBox
          key={element.number}
          element={element}
          position={position}
          isSelected={isSelected}
          onClick={() => handleElementClick(element)}
          onHover={handleElementHover}
        />
      );
    });
  }, [
    selectedElement,
    getElementPosition,
    handleElementClick,
    handleElementHover,
  ]);

  return (
    <Suspense fallback={null}>
      <group>
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 10]} intensity={0.8} />

        {elementBoxes}
      </group>
    </Suspense>
  );
}

export default PeriodicTrendsScene;
