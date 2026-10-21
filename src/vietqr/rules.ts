import { charLength } from "../core/tlv/length";
import type { VietQRIssue } from "./errors";

/**
 * Value formats from VietQR §5.1:
 * - `N`: digits "0"–"9".
 * - `ANS`: EMV common character set; implemented as printable ASCII U+0020–U+007E.
 * - `S`: any Unicode string.
 */
export type ValueFormat = "N" | "ANS" | "S";

export interface FieldRule {
  readonly name: string;
  readonly format: ValueFormat;
  /** Exact length when a number; otherwise the maximum. Counted in characters. */
  readonly length: number | { readonly max: number };
  /** Allowed values, when the spec enumerates them. */
  readonly values?: readonly string[];
  /** Extra value check returning an error message. */
  readonly check?: (value: string) => string | undefined;
}

/** NAPAS application identifier used as the GUID of Merchant Account Information (Table 4). */
export const NAPAS_GUID = "A000000727";

/** Value asking the mobile app to prompt the consumer for an Additional Data value (§5.2.14). */
export const PROMPT = "***";

const DECIMAL = /^\d+(\.\d*)?$/;

/** §5.2.6 / §5.2.8: digits with an optional single ".", value not zero. */
export function checkDecimalAmount(value: string): string | undefined {
  if (!DECIMAL.test(value)) return 'must contain only digits and at most one "."';
  if (Number(value) === 0) return "must not be zero";
  return undefined;
}

/** §5.2.9: "00.01"–"99.99", digits and an optional ".", no "%". */
function checkPercentage(value: string): string | undefined {
  if (!DECIMAL.test(value)) return 'must contain only digits and at most one "."';
  const decimals = value.split(".")[1] ?? "";
  if (decimals.length > 2) return "must have at most 2 decimal places";
  const number = Number(value);
  if (number < 0.01 || number > 99.99) return "must be between 00.01 and 99.99";
  return undefined;
}

/** Table 8, ID 09: any combination of "A", "M", "E", each at most once. */
function checkConsumerDataRequest(value: string): string | undefined {
  if (!/^[AME]+$/.test(value)) return 'may only contain "A", "M" and "E"';
  if (new Set(value).size !== value.length) return "must not repeat a character";
  return undefined;
}

const ADDITIONAL_TEXT = (name: string): FieldRule => ({ name, format: "ANS", length: { max: 25 } });

/**
 * Field rules keyed by dotted path (`"38.01.00"`). One source for the field factories,
 * the encoder and the validator. Paths absent here have only the generic TLV limits.
 */
export const RULES: Readonly<Record<string, FieldRule>> = {
  "00": { name: "Payload Format Indicator", format: "N", length: 2, values: ["01"] },
  "01": { name: "Point of Initiation Method", format: "N", length: 2, values: ["11", "12"] },
  // Table 4: the GUID of ID 38 is always the NAPAS AID. Other providers use IDs 26–51.
  "38.00": { name: "GUID", format: "S", length: { max: 32 }, values: [NAPAS_GUID] },
  // §5.2.3.2.2 describes both ids as ANS; Table 4 gives the acquirer id a fixed length of 6.
  "38.01.00": { name: "Acquirer ID / BNB ID", format: "ANS", length: 6 },
  "38.01.01": { name: "Merchant ID / Consumer ID", format: "ANS", length: { max: 19 } },
  "38.02": { name: "Service Code", format: "ANS", length: { max: 10 } },
  "52": { name: "Merchant Category Code", format: "N", length: 4 },
  "53": { name: "Transaction Currency", format: "N", length: 3 },
  "54": { name: "Transaction Amount", format: "S", length: { max: 13 }, check: checkDecimalAmount },
  "55": { name: "Tip or Convenience Indicator", format: "N", length: 2, values: ["01", "02", "03"] },
  "56": { name: "Value of Convenience Fee Fixed", format: "S", length: { max: 13 }, check: checkDecimalAmount },
  "57": { name: "Value of Convenience Fee Percentage", format: "S", length: { max: 5 }, check: checkPercentage },
  // ISO 3166-1 alpha-2. Table 7's "RC"/"RI"/"RP" are not ISO codes, so the list is not enforced.
  "58": {
    name: "Country Code",
    format: "S",
    length: 2,
    check: (v) => (/^[A-Z]{2}$/.test(v) ? undefined : "must be two upper-case letters (ISO 3166-1 alpha-2)"),
  },
  "59": { name: "Merchant Name", format: "ANS", length: { max: 25 } },
  "60": { name: "Merchant City", format: "ANS", length: { max: 15 } },
  "61": { name: "Postal Code", format: "ANS", length: { max: 10 } },
  "62.01": /* @__PURE__ */ ADDITIONAL_TEXT("Bill Number"),
  "62.02": /* @__PURE__ */ ADDITIONAL_TEXT("Mobile Number"),
  "62.03": /* @__PURE__ */ ADDITIONAL_TEXT("Store Label"),
  "62.04": /* @__PURE__ */ ADDITIONAL_TEXT("Loyalty Number"),
  "62.05": /* @__PURE__ */ ADDITIONAL_TEXT("Reference Label"),
  "62.06": /* @__PURE__ */ ADDITIONAL_TEXT("Customer Label"),
  "62.07": /* @__PURE__ */ ADDITIONAL_TEXT("Terminal Label"),
  "62.08": /* @__PURE__ */ ADDITIONAL_TEXT("Purpose of Transaction"),
  "62.09": {
    name: "Additional Consumer Data Request",
    format: "ANS",
    length: { max: 3 },
    check: checkConsumerDataRequest,
  },
  "63": {
    name: "CRC",
    format: "ANS",
    length: 4,
    check: (v) => (/^[0-9A-Fa-f]{4}$/.test(v) ? undefined : "must be four hex digits"),
  },
  "64.00": { name: "Language Preference", format: "ANS", length: 2 },
  "64.01": { name: "Merchant Name - Alternate Language", format: "S", length: { max: 25 } },
  "64.02": { name: "Merchant City - Alternate Language", format: "S", length: { max: 15 } },
};

/** ISO 4217 minor units for the currencies listed in Table 6; others are not checked. */
export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  "156": 2, // CNY
  "360": 2, // IDR
  "392": 0, // JPY
  "410": 0, // KRW
  "458": 2, // MYR
  "608": 2, // PHP
  "702": 2, // SGD
  "704": 0, // VND
  "764": 2, // THB
};

const ANS = /^[\x20-\x7E]*$/;
const NUMERIC = /^\d*$/;

/** Checks `value` against the rule registered for `path`; returns an empty list if none applies. */
export function checkValue(path: readonly string[], value: string): VietQRIssue[] {
  const rule = RULES[path.join(".")];
  if (!rule) return [];
  const issues: VietQRIssue[] = [];
  const add = (code: VietQRIssue["code"], message: string) =>
    issues.push({ code, path, message: `${rule.name} ${message}` });

  if (value === "") {
    add("INVALID_LENGTH", "must not be empty");
    return issues;
  }
  if (rule.format === "N" && !NUMERIC.test(value)) add("INVALID_FORMAT", "must contain only digits");
  if (rule.format === "ANS" && !ANS.test(value)) {
    add("INVALID_FORMAT", "must contain only printable ASCII characters (use removeAccents() for Vietnamese text)");
  }
  const actual = charLength(value);
  if (typeof rule.length === "number") {
    if (actual !== rule.length) add("INVALID_LENGTH", `must be exactly ${rule.length} characters, got ${actual}`);
  } else if (actual > rule.length.max) {
    add("INVALID_LENGTH", `must be at most ${rule.length.max} characters, got ${actual}`);
  }
  if (rule.values && !rule.values.includes(value)) {
    add("INVALID_VALUE", `must be one of ${rule.values.map((v) => `"${v}"`).join(", ")}, got "${value}"`);
  }
  const message = rule.check?.(value);
  if (message) add("INVALID_VALUE", message);
  return issues;
}
