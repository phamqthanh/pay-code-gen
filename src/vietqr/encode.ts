import { appendCRC } from "../core/crc/calculate";
import { encodeTLV } from "../core/tlv/encode";
import type { TLVNode } from "../core/tlv/types";
import { throwIfIssues } from "./errors";
import { payloadFormatIndicator } from "./fields";
import { validateNodes } from "./validate-nodes";

/** A node, or the array some factories return (e.g. `tipOrConvenienceFee`). */
export type VietQRPart = TLVNode | readonly TLVNode[];

/** @internal Shared by `encodeVietQR` and the legacy builder. */
export function assembleVietQR(parts: readonly VietQRPart[], requireMandatory: boolean): string {
  const nodes = parts.flat() as TLVNode[];
  if (!nodes.some((node) => node.id === "00")) nodes.unshift(payloadFormatIndicator());
  throwIfIssues(validateNodes(nodes, { requireMandatory, crc: "forbidden" }));
  // §5.1: 00 first, 63 last, the rest in any order. Ascending ids satisfy this and are deterministic.
  // Array.prototype.sort is stable, so nested templates keep their own order.
  const ordered = nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return appendCRC(encodeTLV(ordered));
}

/**
 * Encodes root-level VietQR nodes into a complete payload string:
 * flattens arrays, adds Payload Format Indicator (00) when absent, validates every
 * field and cross-field rule, orders root ids ascending, then appends the CRC (63).
 *
 * Requires 01, 38, 53 and 58. Input nodes are never mutated.
 *
 * @throws {VietQRError} listing every issue found.
 */
export function encodeVietQR(parts: readonly VietQRPart[]): string {
  return assembleVietQR(parts, true);
}
