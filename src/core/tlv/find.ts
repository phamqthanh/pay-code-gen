import type { TLVNode } from "./types";

/**
 * Returns the first node at `path` (e.g. `findNode(nodes, "38", "01", "00")`), or undefined.
 * Searches only inside templates on the way down.
 */
export function findNode(nodes: readonly TLVNode[], ...path: string[]): TLVNode | undefined {
  let level: readonly TLVNode[] = nodes;
  let found: TLVNode | undefined;
  for (let i = 0; i < path.length; i++) {
    found = level.find((node) => node.id === path[i]);
    if (!found) return undefined;
    if (i < path.length - 1) {
      if (!("fields" in found)) return undefined;
      level = found.fields;
    }
  }
  return found;
}
