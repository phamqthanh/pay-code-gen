/**
 * Removes Vietnamese diacritics so text fits the ANS character set:
 * NFD-decomposes, drops combining marks U+0300–U+036F, and maps `đ`/`Đ` to `d`/`D`
 * (they have no decomposition). Other non-ASCII characters are left unchanged.
 */
export function removeAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}
