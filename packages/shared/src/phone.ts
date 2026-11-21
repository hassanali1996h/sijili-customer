const easternDigits = '٠١٢٣٤٥٦٧٨٩';
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(easternDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)));
}

export function normalizeIraqiPhone(raw: string): string {
  const input = toAsciiDigits(raw.trim());
  const hasInternationalPrefix = input.startsWith('+') || input.startsWith('00');
  let digits = input.replace(/\D/g, '');

  if (input.startsWith('00')) digits = digits.slice(2);
  if (!hasInternationalPrefix) {
    if (digits.startsWith('964')) return `+${digits}`;
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = `964${digits}`;
  }

  const normalized = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : '';
}

