import { charLength } from "../core/tlv/length";
import type { TLVNode, TLVTemplate } from "../core/tlv/types";
import type { VietQRIssue } from "./errors";
import { checkValue, CURRENCY_EXPONENTS, RULES } from "./rules";

export interface ValidateNodesOptions {
  /** Report absent mandatory data objects. The legacy builder turns this off. */
  readonly requireMandatory: boolean;
  /** `"forbidden"` while encoding (the encoder adds it); `"required"` for scanned payloads. */
  readonly crc: "forbidden" | "required";
}

/** Template paths defined by the spec. Everything in RULES is a primitive. */
const TEMPLATE_PATHS = /* @__PURE__ */ new Set(["38", "38.01", "62", "64"]);

const isGuidTemplatePath = (path: readonly string[]): boolean =>
  (path.length === 1 && path[0]! >= "80") || (path.length === 2 && path[0] === "62" && path[1]! >= "50");

function get(nodes: readonly TLVNode[], id: string): TLVNode | undefined {
  return nodes.find((node) => node.id === id);
}

function valueOf(nodes: readonly TLVNode[], id: string): string | undefined {
  const node = get(nodes, id);
  return node && "value" in node ? node.value : undefined;
}

function walk(nodes: readonly TLVNode[], parent: readonly string[], issues: VietQRIssue[]): void {
  const seen = new Set<string>();
  for (const node of nodes) {
    const path = [...parent, node.id];
    const key = path.join(".");
    if (seen.has(node.id)) {
      issues.push({ code: "DUPLICATE_FIELD", path, message: `Data object ${key} appears more than once` });
    }
    seen.add(node.id);

    if ("fields" in node) {
      if (RULES[key]) issues.push({ code: "INVALID_FORMAT", path, message: `${RULES[key]!.name} must be a primitive value` });
      walk(node.fields, path, issues);
    } else {
      if (TEMPLATE_PATHS.has(key) || isGuidTemplatePath(path)) {
        issues.push({ code: "INVALID_FORMAT", path, message: `Data object ${key} must be a template` });
      }
      issues.push(...checkValue(path, node.value));
    }
  }
}

/**
 * Semantic validation of root-level nodes (without CRC unless `crc: "required"`).
 * Field-level rules come from RULES; this adds presence, cross-field and structural checks.
 */
export function validateNodes(nodes: readonly TLVNode[], options: ValidateNodesOptions): VietQRIssue[] {
  const issues: VietQRIssue[] = [];
  const missing = (path: string[], name: string) =>
    issues.push({ code: "MISSING_FIELD", path, message: `${name} (${path.join(".")}) is required` });

  walk(nodes, [], issues);

  if (options.requireMandatory) {
    for (const id of ["00", "01", "53", "58"]) if (!get(nodes, id)) missing([id], RULES[id]!.name);
    if (!get(nodes, "38")) missing(["38"], "Merchant Account Information");
  }
  if (options.crc === "forbidden" && get(nodes, "63")) {
    issues.push({ code: "UNEXPECTED_FIELD", path: ["63"], message: "CRC (63) is added by the encoder; do not supply it" });
  }

  // 38: Merchant Account Information (Table 4).
  const account = get(nodes, "38");
  if (account && "fields" in account && options.requireMandatory) {
    if (!get(account.fields, "00")) missing(["38", "00"], "GUID");
    const beneficiary = get(account.fields, "01");
    if (!beneficiary) missing(["38", "01"], "Beneficiary organisation");
    else if ("fields" in beneficiary) {
      if (!get(beneficiary.fields, "00")) missing(["38", "01", "00"], "Acquirer ID / BNB ID");
      if (!get(beneficiary.fields, "01")) missing(["38", "01", "01"], "Merchant ID / Consumer ID");
    }
  }

  // 54: decimal places must match the ISO 4217 exponent of 53 (§5.2.6).
  const amount = valueOf(nodes, "54");
  const exponent = CURRENCY_EXPONENTS[valueOf(nodes, "53") ?? ""];
  if (amount !== undefined && exponent !== undefined) {
    const decimals = amount.split(".")[1] ?? "";
    if (decimals.length !== 0 && decimals.length !== exponent) {
      issues.push({
        code: "INVALID_VALUE",
        path: ["54"],
        message: `Transaction Amount has ${decimals.length} decimal places; currency ${valueOf(nodes, "53")} uses ${exponent}`,
      });
    }
  }

  // 55–57: fee values only with the matching indicator (§5.2.7–5.2.9).
  const indicator = valueOf(nodes, "55");
  for (const [id, expected] of [["56", "02"], ["57", "03"]] as const) {
    const present = get(nodes, id) !== undefined;
    if (present && indicator !== expected) {
      issues.push({ code: "CONFLICT", path: [id], message: `ID ${id} requires Tip or Convenience Indicator (55) = "${expected}"` });
    }
    if (!present && indicator === expected) {
      issues.push({ code: "MISSING_FIELD", path: [id], message: `Tip or Convenience Indicator "${expected}" requires ID ${id}` });
    }
  }

  // 62.50–99 and 80–99: templates that must carry a GUID (§5.2.14, Table 10).
  const guidTemplates: [string[], TLVTemplate][] = [];
  for (const node of nodes) {
    if (node.id >= "80" && "fields" in node) guidTemplates.push([[node.id], node]);
    if (node.id === "62" && "fields" in node) {
      for (const sub of node.fields) if (sub.id >= "50" && "fields" in sub) guidTemplates.push([["62", sub.id], sub]);
    }
  }
  for (const [path, node] of guidTemplates) {
    const guid = valueOf(node.fields, "00");
    if (guid === undefined) missing([...path, "00"], "GUID");
    else if (charLength(guid) > 32) {
      issues.push({ code: "INVALID_LENGTH", path: [...path, "00"], message: "GUID must be at most 32 characters" });
    }
  }

  // 64: Language Preference and alternate Merchant Name are mandatory inside the template (Table 9).
  const language = get(nodes, "64");
  if (language && "fields" in language && options.requireMandatory) {
    if (!get(language.fields, "00")) missing(["64", "00"], "Language Preference");
    if (!get(language.fields, "01")) missing(["64", "01"], "Merchant Name - Alternate Language");
  }

  return issues;
}
