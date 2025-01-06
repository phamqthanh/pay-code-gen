import { describe, expect, test } from "vitest";
import PayCodeGen, { BILL_NUMBER, TERMINAL_LABEL } from ".";

describe("QR content generator", () => {
  test("QR static to account", () => {
    expect(
      new PayCodeGen()
        .acquirer("970403")
        .cosumer("0011012345678")
        .cosumerType("A")
        .currency(704)
        .country("VN")
        .toString()
    ).equal(
      "00020101021138570010A00000072701270006970403011300110123456780208QRIBFTTA53037045802VN63049E6F"
    );
  });
  test("QR static to card", () => {
    expect(
      new PayCodeGen()
        .acquirer("970403")
        .cosumer("9704031101234567")
        .cosumerType("C")
        .currency(704)
        .country("VN")
        .toString()
    ).equal(
      "00020101021138600010A00000072701300006970403011697040311012345670208QRIBFTTC53037045802VN63044F52"
    );
  });
  test("QR dynamic to account", () => {
    expect(
      new PayCodeGen()
        .dynamic()
        .acquirer("970403")
        .cosumer("0011012345678")
        .cosumerType("A")
        .currency(704)
        .amount(180000)
        .additional(BILL_NUMBER, "NPS6869")
        .content("thanh toan don hang")
        .country("VN")
        .toString()
    ).equal(
      "00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454061800005802VN62340107NPS68690819thanh toan don hang63042E2E"
    );
  });
  test("QR dyanimc to card", () => {
    expect(
      new PayCodeGen()
        .dynamic()
        .acquirer("970403")
        .cosumer("9704031101234567")
        .cosumerType("C")
        .currency(704)
        .amount(180000)
        .additional(BILL_NUMBER, "NPS6869")
        .content("thanh toan don hang")
        .country("VN")
        .toString()
    ).equal(
      "00020101021238600010A00000072701300006970403011697040311012345670208QRIBFTTC530370454061800005802VN62340107NPS68690819thanh toan don hang6304A203"
    );
  });

  test("Should generate correct cateogry", () => {
    expect(new PayCodeGen().dynamic().category("5139").toString()).equal(
      `
      000201
      010212
      52045139
      5303704
      5802VN
      6304E5C7`.replace(/\n|\r|\s+/g, "")
    );
  });

  test("Do not generate content empty", () => {
    expect(
      new PayCodeGen()
        .dynamic()
        .acquirer("970403")
        .cosumer("9704031101234567")
        .cosumerType("C")
        .currency(704)
        .amount(180000)
        .additional(BILL_NUMBER, "NPS6869")
        .content("")
        .country("VN")
        .toString()
    ).equal(
      "00020101021238600010A00000072701300006970403011697040311012345670208QRIBFTTC530370454061800005802VN62110107NPS686963049CA7"
    );
  });
});
