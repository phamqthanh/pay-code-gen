import { TLVError } from "../errors";
import type { TLVNode } from "./types";

export interface DecodeTLVOptions {
  /**
   * Returns true when the data object at `path` (ids from the root, including its own)
   * should be decoded as a template. Return `"try"` to decode as a template when possible
   * and fall back to a primitive field if the value is not well-formed TLV.
   * Defaults to treating every object as a primitive field.
   */
  readonly isTemplate?: (path: readonly string[]) => boolean | "try";
}

const DIGITS = /^\d{2}$/;

function decodeChars(chars: readonly string[], parent: readonly string[], options: DecodeTLVOptions): TLVNode[] {
  const nodes: TLVNode[] = [];
  let i = 0;
  while (i < chars.length) {
    if (i + 4 > chars.length) throw new TLVError("TRUNCATED", `Incomplete header at offset ${i}`, parent);
    const id = chars.slice(i, i + 2).join("");
    const path = [...parent, id];
    if (!DIGITS.test(id)) throw new TLVError("INVALID_ID", `Invalid identifier ${JSON.stringify(id)} at offset ${i}`, parent);
    const lengthText = chars.slice(i + 2, i + 4).join("");
    if (!DIGITS.test(lengthText) || lengthText === "00") {
      throw new TLVError("INVALID_LENGTH", `Invalid length ${JSON.stringify(lengthText)}`, path);
    }
    const length = Number(lengthText);
    const start = i + 4;
    if (start + length > chars.length) {
      throw new TLVError("TRUNCATED", `Declared length ${length} exceeds remaining ${chars.length - start} characters`, path);
    }
    const valueChars = chars.slice(start, start + length);
    const mode = options.isTemplate?.(path) ?? false;
    if (mode === true) {
      nodes.push(Object.freeze({ id, fields: Object.freeze(decodeChars(valueChars, path, options)) }));
    } else if (mode === "try") {
      let fields: TLVNode[] | undefined;
      try {
        fields = decodeChars(valueChars, path, options);
      } catch (error) {
        if (!(error instanceof TLVError)) throw error;
      }
      nodes.push(Object.freeze(fields ? { id, fields: Object.freeze(fields) } : { id, value: valueChars.join("") }));
    } else {
      nodes.push(Object.freeze({ id, value: valueChars.join("") }));
    }
    i = start + length;
  }
  return nodes;
}

/**
 * Parses `ID(2) LENGTH(2) VALUE` objects. Lengths count Unicode code points.
 * Duplicate and unknown identifiers are preserved in order; no semantic checks are made.
 *
 * @throws {TLVError} `INVALID_ID`, `INVALID_LENGTH`, `TRUNCATED`
 */
export function decodeTLV(payload: string, options: DecodeTLVOptions = {}): TLVNode[] {
  if (typeof payload !== "string") throw new TLVError("INVALID_NODE", "Payload must be a string");
  return decodeChars(Array.from(payload), [], options);
}
