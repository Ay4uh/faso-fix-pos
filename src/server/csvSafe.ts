/**
 * Escape a CSV field value safely and neutralize Excel/Google Sheets/LibreOffice formula injection (CWE-1236).
 * Legitimate numeric strings (including negative decimals like "-12.50") are preserved untouched.
 */
export function csvCell(value: unknown): string {
  const s = String(value ?? '').replace(/\0/g, '');
  const strippedLeft = s.replace(/^ +/, '');
  const isStrictNumber = /^[+-]?\d+(\.\d+)?$/.test(s.trim());
  const dangerousStart = /^[=+\-@\t\r]/.test(strippedLeft) || /^[=+\-@]/.test(s.trimStart());
  const neutralized = dangerousStart && !isStrictNumber ? `'${s}` : s;
  return `"${neutralized.replace(/"/g, '""')}"`;
}
