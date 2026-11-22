const easternDigits = '٠١٢٣٤٥٦٧٨٩';
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(easternDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)));
}

/**
 * Accept Iraqi mobile numbers only, in local (07...), country-code (9647...)
 * or E.164 (+9647...) form. Never silently transform a foreign number into
 * an Iraqi one; OTP delivery must use the verified E.164 destination.
 */
/**
 * Normalize SMS verification codes entered with Arabic, Kurdish or Latin digits.
 * This is input validation only; Supabase Auth remains authoritative.
 */
export function normalizePhoneOtp(raw: string): string {
  const code = toAsciiDigits(raw).replace(/\s/g, '');
  return /^\d{4,9}$/.test(code) ? code : '';
}

export function normalizeIraqiPhone(raw: string): string {
  const input = toAsciiDigits(raw.trim());
  if (!input || /[^\d+\s().-]/.test(input)) return '';
  if ((input.match(/\+/g) ?? []).length > 1 || (input.includes('+') && !input.startsWith('+'))) return '';

  let digits = input.replace(/\D/g, '');
  if (input.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!input.startsWith('+') && digits.startsWith('0')) {
    digits = digits.slice(1);
    digits = `964${digits}`;
  } else if (!input.startsWith('+') && !digits.startsWith('964')) {
    // Bare local mobile numbers may be entered without the leading zero.
    digits = `964${digits}`;
  }

  return /^9647\d{9}$/.test(digits) ? `+${digits}` : '';
}
