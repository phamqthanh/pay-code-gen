import { field } from "../core/tlv/field";
import { charLength, normalizeId } from "../core/tlv/length";
import { template } from "../core/tlv/template";
import type { TLVField, TLVNode, TLVTemplate } from "../core/tlv/types";
import { throwIfIssues, VietQRError } from "./errors";
import { checkValue, NAPAS_GUID } from "./rules";

export { NAPAS_GUID, PROMPT } from "./rules";
export { removeAccents } from "./text";
export { VietQRError, type VietQRIssue, type VietQRIssueCode } from "./errors";

/** Builds a primitive field after checking the VietQR rule for its path. */
function ruled(path: readonly string[], value: string): TLVField {
  throwIfIssues(checkValue(path, value));
  return field(path[path.length - 1]!, value);
}

function invalid(path: readonly string[], message: string): never {
  throw new VietQRError([{ code: "INVALID_VALUE", path, message }]);
}

/** Converts a numeric input to its decimal string, rejecting NaN, Infinity and negatives. */
function decimalText(path: readonly string[], value: number | string): string {
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(path, `Expected a non-negative finite number or a string, got ${String(value)}`);
  }
  return String(value);
}

/** Pads a non-negative integer to `width` digits (ISO numeric codes keep their leading zeros). */
function codeText(path: readonly string[], value: number | string, width: number): string {
  if (typeof value === "string") return value;
  if (!Number.isInteger(value) || value < 0 || value >= 10 ** width) {
    invalid(path, `Expected an integer between 0 and ${10 ** width - 1}, got ${String(value)}`);
  }
  return String(value).padStart(width, "0");
}

/** ID 00. Always `"01"` (§5.2.1). `encodeVietQR` adds it when absent. */
export function payloadFormatIndicator(): TLVField {
  return ruled(["00"], "01");
}

export type InitiationMethod = "static" | "dynamic";

/** ID 01. `"static"` → `"11"` (reusable), `"dynamic"` → `"12"` (single use) (§5.2.2). */
export function pointOfInitiation(method: InitiationMethod): TLVField {
  if (method !== "static" && method !== "dynamic") invalid(["01"], `Unknown initiation method ${String(method)}`);
  return ruled(["01"], method === "static" ? "11" : "12");
}

export type ServiceType = "account" | "card";

/** NAPAS247 service codes for Merchant Account Information ID 02 (§5.2.3.2.3). */
export const SERVICE_CODES: Readonly<Record<ServiceType, string>> = { account: "QRIBFTTA", card: "QRIBFTTC" };

export interface MerchantAccountInput {
  /** Acquirer / beneficiary bank id (BIN), exactly 6 characters, e.g. `"970403"`. */
  readonly acquirerId: string;
  /** Account number, card number or merchant id, at most 19 characters. */
  readonly consumerId: string;
  /** Adds service code `QRIBFTTA` (account) or `QRIBFTTC` (card). Omitted when undefined. */
  readonly service?: ServiceType;
}

/**
 * ID 38: NAPAS247 Merchant Account Information (Table 4).
 * Produces `00` = `A000000727`, `01` = {`00` acquirer, `01` consumer}, and optionally `02` = service code.
 * For other account structures, use {@link merchantAccountInformation}.
 */
export function merchantAccount(input: MerchantAccountInput): TLVTemplate {
  const nodes: TLVNode[] = [
    ruled(["38", "00"], NAPAS_GUID),
    template("01", [ruled(["38", "01", "00"], input.acquirerId), ruled(["38", "01", "01"], input.consumerId)]),
  ];
  if (input.service !== undefined) {
    const code = SERVICE_CODES[input.service];
    if (!code) invalid(["38", "02"], `Unknown service ${String(input.service)}; expected "account" or "card"`);
    nodes.push(ruled(["38", "02"], code));
  }
  return template("38", nodes);
}

/**
 * Generic Merchant Account Information template (IDs 02–51): a GUID (`00`, at most 32
 * characters) followed by provider-specific data objects, encoded in the given order.
 * Use it for networks other than NAPAS; ID 38 itself must carry the NAPAS GUID.
 */
export function merchantAccountInformation(
  id: string | number,
  guid: string,
  fields: readonly TLVNode[] = [],
): TLVTemplate {
  const normalized = normalizeId(id);
  if (normalized < "02" || normalized > "51") invalid([normalized], "Merchant Account Information id must be 02-51");
  if (typeof guid !== "string" || guid === "" || charLength(guid) > 32) {
    throw new VietQRError([{ code: "INVALID_LENGTH", path: [normalized, "00"], message: "GUID must be 1-32 characters" }]);
  }
  return template(normalized, [field("00", guid), ...fields]);
}

/** ID 52: ISO 18245 merchant category code, 4 digits (numbers are zero-padded). */
export function merchantCategoryCode(code: number | string): TLVField {
  return ruled(["52"], codeText(["52"], code, 4));
}

/** ID 53: ISO 4217 numeric currency code, 3 digits (numbers are zero-padded). Default 704 (VND). */
export function transactionCurrency(code: number | string = 704): TLVField {
  return ruled(["53"], codeText(["53"], code, 3));
}

/**
 * ID 54: transaction amount, e.g. `180000` or `"50000."`. Non-zero, digits and at most one
 * ".", at most 13 characters (§5.2.6). Decimal places are checked against the currency by
 * `encodeVietQR`/`validateVietQR`. Numbers use `String(value)`; pass a string for exact control.
 */
export function transactionAmount(value: number | string): TLVField {
  return ruled(["54"], decimalText(["54"], value));
}

export type TipOrConvenienceFee =
  /** `55 = 01`: the consumer is prompted to enter a tip. */
  | { readonly type: "tip" }
  /** `55 = 02` and `56 = value`: fixed convenience fee. */
  | { readonly type: "fixed"; readonly value: number | string }
  /** `55 = 03` and `57 = value`: percentage fee, 0.01–99.99. */
  | { readonly type: "percentage"; readonly value: number | string };

/**
 * IDs 55–57 (§5.2.7–5.2.9). Returns the indicator and, for fees, the matching value field.
 * Pass the returned array directly to `encodeVietQR` (arrays are flattened).
 */
export function tipOrConvenienceFee(option: TipOrConvenienceFee): readonly TLVField[] {
  switch (option?.type) {
    case "tip":
      return [ruled(["55"], "01")];
    case "fixed":
      return [ruled(["55"], "02"), ruled(["56"], decimalText(["56"], option.value))];
    case "percentage":
      return [ruled(["55"], "03"), ruled(["57"], decimalText(["57"], option.value))];
    default:
      return invalid(["55"], `Unknown tip/fee type ${JSON.stringify((option as { type?: unknown })?.type)}`);
  }
}

/** ID 58: ISO 3166-1 alpha-2 country code. Default `"VN"`. */
export function countryCode(code = "VN"): TLVField {
  return ruled(["58"], code);
}

/** ID 59: merchant name, ANS, at most 25 characters. */
export function merchantName(name: string): TLVField {
  return ruled(["59"], name);
}

/** ID 60: merchant city, ANS, at most 15 characters. */
export function merchantCity(city: string): TLVField {
  return ruled(["60"], city);
}

/** ID 61: postal code, ANS, at most 10 characters. */
export function postalCode(code: string): TLVField {
  return ruled(["61"], code);
}

export interface AdditionalDataInput {
  /** 01: invoice/receipt number. */
  readonly billNumber?: string;
  /** 02 */
  readonly mobileNumber?: string;
  /** 03 */
  readonly storeLabel?: string;
  /** 04 */
  readonly loyaltyNumber?: string;
  /** 05 */
  readonly referenceLabel?: string;
  /** 06 */
  readonly customerLabel?: string;
  /** 07 */
  readonly terminalLabel?: string;
  /** 08: purpose of transaction — the transfer message shown to the payer. */
  readonly purposeOfTransaction?: string;
  /** 09: any of "A" (address), "M" (mobile), "E" (email), each at most once. */
  readonly additionalConsumerDataRequest?: string;
}

/** Sub-object ids of Additional Data (ID 62, Table 8). */
export const ADDITIONAL_DATA_IDS: Readonly<Record<keyof AdditionalDataInput, string>> = {
  billNumber: "01",
  mobileNumber: "02",
  storeLabel: "03",
  loyaltyNumber: "04",
  referenceLabel: "05",
  customerLabel: "06",
  terminalLabel: "07",
  purposeOfTransaction: "08",
  additionalConsumerDataRequest: "09",
};

/**
 * ID 62: Additional Data Field Template. Each value in 01–08 is ANS, at most 25 characters,
 * or `PROMPT` (`"***"`) to let the payer enter it. `extra` adds sub-objects 10–99 as-is.
 * Undefined values are skipped; empty strings are rejected. Sub-objects are ordered by id.
 * Text is not transliterated: call `removeAccents()` on Vietnamese input first.
 */
export function additionalData(input: AdditionalDataInput, extra: readonly TLVNode[] = []): TLVTemplate {
  const nodes: TLVNode[] = [];
  for (const key of Object.keys(ADDITIONAL_DATA_IDS) as (keyof AdditionalDataInput)[]) {
    const value = input[key];
    if (value !== undefined) nodes.push(ruled(["62", ADDITIONAL_DATA_IDS[key]], value));
  }
  for (const node of extra) {
    if (node.id < "10") invalid(["62", node.id], "Use the named properties for Additional Data ids 01-09");
    nodes.push(node);
  }
  if (!nodes.length) {
    throw new VietQRError([{ code: "MISSING_FIELD", path: ["62"], message: "Additional Data needs at least one value" }]);
  }
  return template("62", nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
