/**
 * Helper funciton to pad a number or string with leading zeros (to two digits).
 * @param input - The input number or string to format
 */
export function format(input: number | string) {
  return String(input).padStart(2, "0");
}
