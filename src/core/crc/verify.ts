import { CRC_HEADER, calculateCRC16 } from "./calculate";

const HEX4 = /^[0-9A-Fa-f]{4}$/;

/**
 * True when `payload` ends with a `6304XXXX` CRC data object whose value matches the
 * CRC-16/CCITT-FALSE of everything before it (including `6304`). Hex digits are
 * compared case-insensitively. Does not check the rest of the TLV structure.
 */
export function verifyCRC(payload: string): boolean {
  if (typeof payload !== "string" || payload.length < 8) return false;
  const checksum = payload.slice(-4);
  const covered = payload.slice(0, -4);
  if (!covered.endsWith(CRC_HEADER) || !HEX4.test(checksum)) return false;
  return calculateCRC16(covered) === checksum.toUpperCase();
}
