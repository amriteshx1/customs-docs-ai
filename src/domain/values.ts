import Decimal from "decimal.js";
import type { FieldValue } from "@/domain/types";

const WEIGHT_ALIASES: Record<string, string> = {
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  mt: "mt",
  tonne: "mt",
  tonnes: "mt",
  "metric ton": "mt",
  "metric tons": "mt",
};

const NAME_SUFFIXES = new Set([
  "LTD",
  "LIMITED",
  "PVT",
  "PRIVATE",
  "INC",
  "LLC",
  "GMBH",
  "CO",
  "COMPANY",
]);

export function normalizeWeightUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const key = unit.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return WEIGHT_ALIASES[key] ?? null;
}

export function normalizeCompanyName(value: string) {
  const cleaned = value
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1] ?? "")) {
    parts.pop();
  }
  return parts.join(" ");
}

export function normalizeContainer(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function decimalOrNull(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) return null;
    return decimal;
  } catch {
    return null;
  }
}

export function canonicalValue(value: FieldValue | null | undefined): string {
  if (!value) return "";
  if (value.kind === "string") return `s:${(value.text ?? "").trim()}`;
  if (value.kind === "number") {
    const decimal = decimalOrNull(value.number);
    const number = decimal ? decimal.toFixed() : (value.number ?? "");
    const unit = normalizeWeightUnit(value.unit) ?? (value.unit ?? "").trim().toLowerCase();
    const currency = (value.currency ?? "").trim().toUpperCase();
    return `n:${number}|${unit}|${currency}`;
  }
  const list = (value.list ?? []).map(normalizeContainer).filter(Boolean).sort();
  return `l:${list.join(",")}`;
}

export function displayValue(value: FieldValue | null | undefined): string {
  if (!value) return "";
  if (value.kind === "string") return value.text ?? "";
  if (value.kind === "number") {
    const number = value.number ?? "";
    const suffix = value.unit || value.currency;
    return suffix ? `${number} ${suffix}` : number;
  }
  return (value.list ?? []).filter(Boolean).join(", ");
}

export function valuesEqual(left: FieldValue | null | undefined, right: FieldValue | null | undefined) {
  return canonicalValue(left) === canonicalValue(right);
}
