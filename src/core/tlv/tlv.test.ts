import { describe, expect, test } from "vitest";
import { decodeTLV, encodeTLV, field, findNode, template, TLVError, type TLVNode } from "./index";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof TLVError) return error.code;
    throw error;
  }
  throw new Error("expected TLVError");
};

describe("field / template", () => {
  test("normalises numeric ids with a leading zero", () => {
    expect(field(5, "x")).toEqual({ id: "05", value: "x" });
    expect(field("00", "01").id).toBe("00");
  });

  test("rejects invalid ids", () => {
    for (const id of ["5", "100", "a1", "", -1, 100, 1.5]) expect(codeOf(() => field(id, "x"))).toBe("INVALID_ID");
  });

  test("rejects empty and over-long values without truncating", () => {
    expect(codeOf(() => field("01", ""))).toBe("EMPTY_VALUE");
    expect(field("01", "a".repeat(99)).value).toHaveLength(99);
    expect(codeOf(() => field("01", "a".repeat(100)))).toBe("VALUE_TOO_LONG");
  });

  test("returns frozen nodes and copies template input", () => {
    const children = [field("00", "a")];
    const t = template("62", children);
    children.push(field("01", "b"));
    expect(t.fields).toHaveLength(1);
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.fields)).toBe(true);
    expect(codeOf(() => template("62", []))).toBe("EMPTY_VALUE");
  });
});

describe("encodeTLV", () => {
  test("encodes primitives and nested templates in the given order", () => {
    const nodes: TLVNode[] = [
      field("01", "12"),
      template("38", [field("00", "A000000727"), template("01", [field("00", "970403")])]),
      field("00", "01"),
    ];
    expect(encodeTLV(nodes)).toBe("010212" + "3828" + "0010A000000727" + "0110" + "0006970403" + "000201");
  });

  test("counts Unicode code points, not UTF-16 units or bytes", () => {
    expect(encodeTLV([field("01", "é")])).toBe("0101é");
    expect(encodeTLV([field("01", "a😀")])).toBe("0102a😀");
  });

  test("rejects a template whose encoded value exceeds 99 characters", () => {
    const big = template("62", [field("01", "a".repeat(60)), field("02", "b".repeat(40))]);
    expect(codeOf(() => encodeTLV([big]))).toBe("VALUE_TOO_LONG");
  });

  test("validates hand-written node objects", () => {
    expect(codeOf(() => encodeTLV([{ id: "1", value: "x" }]))).toBe("INVALID_ID");
    expect(codeOf(() => encodeTLV([{ id: "01", value: 5 as unknown as string }]))).toBe("INVALID_NODE");
    expect(codeOf(() => encodeTLV([{ id: "01", value: "" }]))).toBe("EMPTY_VALUE");
  });

  test("does not mutate input", () => {
    const nodes = [field("02", "b"), field("01", "a")];
    const copy = JSON.stringify(nodes);
    encodeTLV(nodes);
    expect(JSON.stringify(nodes)).toBe(copy);
  });
});

describe("decodeTLV", () => {
  test("decodes flat payloads", () => {
    expect(decodeTLV("000201010212")).toEqual([
      { id: "00", value: "01" },
      { id: "01", value: "12" },
    ]);
  });

  test("decodes templates selected by path", () => {
    const nodes = decodeTLV("38280010A0000007270110000697040352040000", {
      isTemplate: (path) => path.join(".") === "38" || path.join(".") === "38.01",
    });
    expect(findNode(nodes, "38", "01", "00")).toEqual({ id: "00", value: "970403" });
    expect(findNode(nodes, "52")).toEqual({ id: "52", value: "0000" });
    expect(findNode(nodes, "38", "99")).toBeUndefined();
    expect(findNode(nodes, "52", "00")).toBeUndefined();
  });

  test('"try" falls back to a primitive when the value is not TLV', () => {
    const [ok] = decodeTLV("80060002ab", { isTemplate: () => "try" });
    expect(ok).toEqual({ id: "80", fields: [{ id: "00", value: "ab" }] });
    const [raw] = decodeTLV("8003abc", { isTemplate: () => "try" });
    expect(raw).toEqual({ id: "80", value: "abc" });
  });

  test("preserves duplicate and unknown ids in order", () => {
    expect(decodeTLV("9901a9901b").map((n) => ("value" in n ? n.value : ""))).toEqual(["a", "b"]);
  });

  test("decodes non-ASCII values by code point", () => {
    expect(decodeTLV("0102a😀0001x")).toEqual([
      { id: "01", value: "a😀" },
      { id: "00", value: "x" },
    ]);
  });

  test("reports malformed input", () => {
    expect(codeOf(() => decodeTLV("000"))).toBe("TRUNCATED");
    expect(codeOf(() => decodeTLV("0005abc"))).toBe("TRUNCATED");
    expect(codeOf(() => decodeTLV("0a02xx"))).toBe("INVALID_ID");
    expect(codeOf(() => decodeTLV("00x1a"))).toBe("INVALID_LENGTH");
    expect(codeOf(() => decodeTLV("0000"))).toBe("INVALID_LENGTH");
    expect(decodeTLV("")).toEqual([]);
  });

  test("reports the path of errors inside templates", () => {
    try {
      decodeTLV("38050003x", { isTemplate: (path) => path.length === 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(TLVError);
      expect((error as TLVError).path).toEqual(["38", "00"]);
      return;
    }
    throw new Error("expected TLVError");
  });

  test("round-trips through encodeTLV", () => {
    const payload = "00020101021262340107NPS68690819thanh toan don hang";
    expect(encodeTLV(decodeTLV(payload, { isTemplate: (p) => p.join(".") === "62" }))).toBe(payload);
  });
});
