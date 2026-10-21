import { TLVError } from "../errors";
import { assertValueLength, charLength, normalizeId } from "./length";
import type { TLVField } from "./types";

/**
 * Creates an immutable primitive data object.
 *
 * @param id two-digit identifier (`"05"`) or integer (`5`)
 * @param value 1–99 characters; never truncated or normalised
 * @throws {TLVError} `INVALID_ID`, `INVALID_NODE`, `EMPTY_VALUE`, `VALUE_TOO_LONG`
 */
export function field(id: string | number, value: string): TLVField {
  const normalized = normalizeId(id);
  const path = [normalized];
  if (typeof value !== "string") throw new TLVError("INVALID_NODE", "Field value must be a string", path);
  assertValueLength(charLength(value), path);
  return Object.freeze({ id: normalized, value });
}
