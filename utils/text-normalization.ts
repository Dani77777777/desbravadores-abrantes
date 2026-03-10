/**
 * Normalizes text by:
 * 1. Converting to lowercase
 * 2. Removing accents/diacritics
 * 3. Trimming whitespace
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
