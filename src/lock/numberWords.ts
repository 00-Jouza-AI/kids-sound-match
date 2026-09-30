import type { Lang } from '../content/types';

/**
 * "Forgot PIN?" asks for a number written in words, which a pre-reader can't solve.
 * Numbers are 100-999 with tens 20-90 and a non-zero unit, which keeps the wording regular.
 */
export function challengeNumber(random: () => number = Math.random): number {
  const hundreds = 1 + Math.floor(random() * 9);
  const tens = 2 + Math.floor(random() * 8);
  const units = 1 + Math.floor(random() * 9);
  return hundreds * 100 + tens * 10 + units;
}

const EN_UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const AR_HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
const AR_UNITS = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

export function numberToWords(n: number, lang: Lang): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;
  if (n < 100 || n > 999 || tens < 2 || units === 0) throw new Error(`Unsupported challenge number ${n}`);
  if (lang === 'ar') {
    // Arabic says the unit before the tens: 742 = seven hundred and two and forty.
    return `${AR_HUNDREDS[hundreds]} و${AR_UNITS[units]} و${AR_TENS[tens]}`;
  }
  return `${EN_UNITS[hundreds]} hundred ${EN_TENS[tens]}-${EN_UNITS[units]}`;
}
