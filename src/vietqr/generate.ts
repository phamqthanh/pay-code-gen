import type { TLVNode } from "../core/tlv/types";
import { encodeVietQR, type VietQRPart } from "./encode";
import { VietQRError } from "./errors";
import {
  additionalData as additionalDataField,
  countryCode,
  merchantAccount,
  pointOfInitiation,
  transactionAmount,
  transactionCurrency,
  type AdditionalDataInput,
  type InitiationMethod,
  type ServiceType,
} from "./fields";

/** A NAPAS247 transfer to a bank account or card. */
export interface VietQRTransferInput {
  /** Beneficiary bank BIN, e.g. `"970403"`. */
  readonly acquirerId: string;
  /** Account or card number, at most 19 characters. */
  readonly consumerId: string;
  /** Default `"account"` (`QRIBFTTA`); `"card"` gives `QRIBFTTC`. */
  readonly service?: ServiceType;
  /** Default `"static"`. Use `"dynamic"` for single-use codes. */
  readonly initiation?: InitiationMethod;
  /** Omit to let the payer enter the amount. */
  readonly amount?: number | string;
  /** ISO 4217 numeric code. Default 704 (VND). */
  readonly currency?: number | string;
  /** ISO 3166-1 alpha-2. Default `"VN"`. */
  readonly country?: string;
  /** Shorthand for `additionalData.purposeOfTransaction` (62.08), ANS, at most 25 characters. */
  readonly purpose?: string;
  /** Additional Data (62) sub-objects 01–09. */
  readonly additionalData?: AdditionalDataInput;
  /** Any other data objects, e.g. `merchantName(...)` or `tipOrConvenienceFee(...)`. */
  readonly fields?: readonly VietQRPart[];
}

/**
 * Generates a VietQR payload for a NAPAS247 transfer. Composes the field factories and
 * calls `encodeVietQR`; anything beyond the common fields goes in `fields`.
 *
 * @throws {VietQRError} on invalid input or conflicting fields.
 */
export function generateVietQR(input: VietQRTransferInput): string {
  if (input.purpose !== undefined && input.additionalData?.purposeOfTransaction !== undefined) {
    throw new VietQRError([
      { code: "CONFLICT", path: ["62", "08"], message: "Set either purpose or additionalData.purposeOfTransaction, not both" },
    ]);
  }
  const extra: AdditionalDataInput = { ...input.additionalData };
  if (input.purpose !== undefined) Object.assign(extra, { purposeOfTransaction: input.purpose });

  const parts: VietQRPart[] = [
    pointOfInitiation(input.initiation ?? "static"),
    merchantAccount({ acquirerId: input.acquirerId, consumerId: input.consumerId, service: input.service ?? "account" }),
    transactionCurrency(input.currency ?? 704),
    countryCode(input.country ?? "VN"),
  ];
  if (input.amount !== undefined) parts.push(transactionAmount(input.amount));
  if (Object.values(extra).some((value) => value !== undefined)) parts.push(additionalDataField(extra));
  return encodeVietQR([...parts, ...(input.fields ?? ([] as TLVNode[]))]);
}
