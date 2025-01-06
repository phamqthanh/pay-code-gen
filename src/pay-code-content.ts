import { format } from "./helpers/format";

export type BuildContentMap = Map<number, string | number | BuildContentMap>;
export class PayCodeContent {
  payload: BuildContentMap = new Map();

  protected validate() {}
  protected value() {
    this.validate();
    return this.build(this.payload);
  }

  protected set(keys: number, value: string | number): this;
  protected set(keys: number[], value: string | number): this;
  protected set(keys: number | number[], value: string | number): this {
    keys = Array.isArray(keys) ? keys : [keys];
    let current = this.payload;
    // Iterate through the keys array except the last one
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      // If the key does not exist, create a new Map for this key
      if (!current.has(key)) current.set(key, new Map());

      // Move to the next level
      let item = current.get(key);
      if (item instanceof Map) {
        current = item;
      } else {
        item = new Map();
        current.set(key, item);
        current = item;
      }
    }

    // Set the value at the last key
    current.set(keys[keys.length - 1], value);
    return this;
  }
  protected remove(...ids: number[]) {
    ids.forEach(this.payload.delete, this.payload);
  }
  protected build(value: BuildContentMap | string | number): string {
    if (Array.isArray(value) || value instanceof Map) {
      return Array.from(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // ordering by provided id
        .reduce((acc, [id, value]) => {
          const content = this.build(value);
          return content
            ? acc + format(id) + format(content.length) + content
            : acc;
        }, "");
    }
    return value.toString();
  }
}
