import { verifyCRC } from "../core/crc/verify";
import { TLVError } from "../core/errors";
import { decodeTLV } from "../core/tlv/decode";
import { findNode } from "../core/tlv/find";
import type { TLVNode } from "../core/tlv/types";
import { VietQRError, type VietQRIssue } from "./errors";
import { ADDITIONAL_DATA_IDS, type AdditionalDataInput, type InitiationMethod } from "./fields";

/**
 * Which data objects are templates. 38/38.01/62/64 always are. Merchant Account
 * Information 26–51, unreserved templates 80–99 and Additional Data 50–99 are decoded
 * as templates when their value is well-formed TLV and kept as raw values otherwise.
 */
function isTemplate(path: readonly string[]): boolean | "try" {
  const key = path.join(".");
  if (key === "38" || key === "38.01" || key === "62" || key === "64") return true;
  if (path.length === 1) {
    const id = path[0]!;
    return (id >= "26" && id <= "51") || id >= "80" ? "try" : false;
  }
  return path.length === 2 && path[0] === "62" && path[1]! >= "50" ? "try" : false;
}

export interface ParsedMerchantAccount {
  readonly guid?: string;
  readonly acquirerId?: string;
  readonly consumerId?: string;
  readonly serviceCode?: string;
}

/** Syntactic view of a VietQR payload. Values are raw strings exactly as encoded. */
export interface ParsedVietQR {
  /** Every root data object in payload order, including unknown ones and the CRC. */
  readonly nodes: readonly TLVNode[];
  readonly payloadFormatIndicator?: string;
  /** Raw ID 01 value. */
  readonly pointOfInitiation?: string;
  /** `"static"` for `11`, `"dynamic"` for `12`, otherwise undefined. */
  readonly initiation?: InitiationMethod;
  /** ID 38. Other Merchant Account Information ids are available in `nodes`. */
  readonly merchantAccount?: ParsedMerchantAccount;
  readonly merchantCategoryCode?: string;
  readonly currency?: string;
  readonly amount?: string;
  readonly tipOrConvenienceIndicator?: string;
  readonly convenienceFeeFixed?: string;
  readonly convenienceFeePercentage?: string;
  readonly countryCode?: string;
  readonly merchantName?: string;
  readonly merchantCity?: string;
  readonly postalCode?: string;
  /** Sub-objects 01–09 of ID 62; others are available in `nodes`. */
  readonly additionalData?: AdditionalDataInput;
  readonly crc: string;
}

export interface ParseVietQROptions {
  /** Throw when the CRC does not match. Default true. */
  readonly verifyCRC?: boolean;
}

/** @internal Decodes and checks CRC placement; returns nodes or issues. Never throws. */
export function decodeVietQR(
  payload: string,
  checkCRC: boolean,
): { nodes: readonly TLVNode[]; issues: VietQRIssue[] } {
  if (typeof payload !== "string") {
    return { nodes: [], issues: [{ code: "MALFORMED_PAYLOAD", path: [], message: "Payload must be a string" }] };
  }
  let nodes: TLVNode[];
  try {
    nodes = decodeTLV(payload, { isTemplate });
  } catch (error) {
    if (!(error instanceof TLVError)) throw error;
    return { nodes: [], issues: [{ code: "MALFORMED_PAYLOAD", path: error.path, message: error.message }] };
  }
  const issues: VietQRIssue[] = [];
  const last = nodes[nodes.length - 1];
  if (!nodes.some((node) => node.id === "63")) {
    issues.push({ code: "INVALID_CRC", path: ["63"], message: "CRC (63) is missing" });
  } else if (last?.id !== "63") {
    issues.push({ code: "INVALID_CRC", path: ["63"], message: "CRC (63) must be the last data object" });
  } else if (checkCRC && !verifyCRC(payload)) {
    issues.push({ code: "INVALID_CRC", path: ["63"], message: "CRC does not match the payload" });
  }
  if (nodes.length && nodes[0]!.id !== "00") {
    issues.push({ code: "UNEXPECTED_FIELD", path: ["00"], message: "Payload Format Indicator (00) must be first" });
  }
  return { nodes, issues };
}

function text(nodes: readonly TLVNode[], ...path: string[]): string | undefined {
  const node = findNode(nodes, ...path);
  return node && "value" in node ? node.value : undefined;
}

/**
 * Parses a scanned VietQR string. Checks TLV syntax, that 00 is first and 63 is last,
 * and (by default) the CRC. Does not apply field rules — use `validateVietQR` for that.
 *
 * @throws {VietQRError} with `MALFORMED_PAYLOAD`, `INVALID_CRC` or `UNEXPECTED_FIELD` issues.
 */
export function parseVietQR(payload: string, options: ParseVietQROptions = {}): ParsedVietQR {
  const { nodes, issues } = decodeVietQR(payload, options.verifyCRC ?? true);
  if (issues.length) throw new VietQRError(issues);

  const account = findNode(nodes, "38");
  const merchantAccount: ParsedMerchantAccount | undefined =
    account && "fields" in account
      ? stripUndefined({
          guid: text(account.fields, "00"),
          acquirerId: text(account.fields, "01", "00"),
          consumerId: text(account.fields, "01", "01"),
          serviceCode: text(account.fields, "02"),
        })
      : undefined;

  const extra = findNode(nodes, "62");
  let additionalData: AdditionalDataInput | undefined;
  if (extra && "fields" in extra) {
    const entries = Object.entries(ADDITIONAL_DATA_IDS).map(([key, id]) => [key, text(extra.fields, id)]);
    additionalData = stripUndefined(Object.fromEntries(entries) as AdditionalDataInput);
  }

  const pointOfInitiation = text(nodes, "01");
  return stripUndefined({
    nodes,
    payloadFormatIndicator: text(nodes, "00"),
    pointOfInitiation,
    initiation: pointOfInitiation === "11" ? "static" : pointOfInitiation === "12" ? "dynamic" : undefined,
    merchantAccount,
    merchantCategoryCode: text(nodes, "52"),
    currency: text(nodes, "53"),
    amount: text(nodes, "54"),
    tipOrConvenienceIndicator: text(nodes, "55"),
    convenienceFeeFixed: text(nodes, "56"),
    convenienceFeePercentage: text(nodes, "57"),
    countryCode: text(nodes, "58"),
    merchantName: text(nodes, "59"),
    merchantCity: text(nodes, "60"),
    postalCode: text(nodes, "61"),
    additionalData,
    crc: text(nodes, "63")!,
  });
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
