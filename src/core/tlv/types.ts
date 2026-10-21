/** A primitive data object: two-digit identifier and a string value. */
export interface TLVField {
  readonly id: string;
  readonly value: string;
}

/** A data object whose value is itself a sequence of data objects. */
export interface TLVTemplate {
  readonly id: string;
  readonly fields: readonly TLVNode[];
}

export type TLVNode = TLVField | TLVTemplate;

export function isTemplate(node: TLVNode): node is TLVTemplate {
  return "fields" in node;
}
