import { TLVError } from "../errors";
import { assertValueLength, charLength, normalizeId } from "./length";
import type { TLVNode } from "./types";

function encodeNodes(nodes: readonly TLVNode[], parent: readonly string[]): string {
  let out = "";
  for (const node of nodes) out += encodeNode(node, parent);
  return out;
}

function encodeNode(node: TLVNode, parent: readonly string[]): string {
  if (node === null || typeof node !== "object") {
    throw new TLVError("INVALID_NODE", "Expected a field or template", parent);
  }
  const id = normalizeId(node.id, parent);
  const path = [...parent, id];
  let value: string;
  if ("fields" in node) {
    if (!Array.isArray(node.fields)) throw new TLVError("INVALID_NODE", "Template fields must be an array", path);
    value = encodeNodes(node.fields, path);
  } else if (typeof node.value === "string") {
    value = node.value;
  } else {
    throw new TLVError("INVALID_NODE", "Field value must be a string", path);
  }
  const length = charLength(value);
  assertValueLength(length, path);
  return id + String(length).padStart(2, "0") + value;
}

/**
 * Serialises nodes as `ID(2) LENGTH(2) VALUE`, recursing into templates.
 * Order is preserved exactly as given; nothing is sorted, deduplicated or truncated.
 *
 * @throws {TLVError} if any id is invalid or any value/template is empty or longer than 99 characters.
 */
export function encodeTLV(nodes: readonly TLVNode[]): string {
  if (!Array.isArray(nodes)) throw new TLVError("INVALID_NODE", "Expected an array of nodes");
  return encodeNodes(nodes, []);
}
