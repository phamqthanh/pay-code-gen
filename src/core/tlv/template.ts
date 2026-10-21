import { TLVError } from "../errors";
import { normalizeId } from "./length";
import type { TLVNode, TLVTemplate } from "./types";

/**
 * Creates an immutable template (nested data objects). The `fields` array is copied,
 * so later changes to the caller's array do not affect the template. Children are
 * encoded in the given order. The encoded length (≤ 99) is checked by `encodeTLV`.
 *
 * @throws {TLVError} `INVALID_ID`, `INVALID_NODE`, `EMPTY_VALUE`
 */
export function template(id: string | number, fields: readonly TLVNode[]): TLVTemplate {
  const normalized = normalizeId(id);
  if (!Array.isArray(fields)) throw new TLVError("INVALID_NODE", "Template fields must be an array", [normalized]);
  if (fields.length === 0) throw new TLVError("EMPTY_VALUE", "Template must contain at least one field", [normalized]);
  return Object.freeze({ id: normalized, fields: Object.freeze([...fields]) });
}
