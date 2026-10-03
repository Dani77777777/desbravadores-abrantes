import { normalizeText } from '@/utils/text-normalization';

export type KeyStatus = 'correct' | 'present' | 'absent' | '';

/**
 * Estado de cada tecla por grelha, a partir das tentativas já reveladas.
 * Numa grelha já resolvida só contam as tentativas até à que a resolveu.
 */
export function computeKeyStatusesPerGrid(
  secretWords: string[],
  attempts: string[]
): Array<Record<string, KeyStatus>> {
  return secretWords.map(secret => {
    const statuses: Record<string, KeyStatus> = {};
    const secretClean = normalizeText(secret);

    const winIdx = attempts.findIndex(a => normalizeText(a) === secretClean);
    const attemptsToCheck = winIdx >= 0 ? attempts.slice(0, winIdx + 1) : attempts;

    attemptsToCheck.forEach(attempt => {
      const attemptClean = normalizeText(attempt);
      for (let i = 0; i < attemptClean.length; i++) {
        const char = attemptClean[i];
        if (char === secretClean[i]) {
          statuses[char] = 'correct';
        } else if (secretClean.includes(char) && statuses[char] !== 'correct') {
          statuses[char] = 'present';
        } else if (!statuses[char]) {
          statuses[char] = 'absent';
        }
      }
    });
    return statuses;
  });
}

/** Remove pontuação/espaços da palavra secreta, mantendo acentos. */
export function cleanSecretWord(word: string): string {
  return word.replace(/[^a-zA-ZáàâãéèêíïóôõöúçÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ]/g, '').toUpperCase();
}

export function maxAttemptsForMode(mode: 'solo' | 'mix' | 'plex'): number {
  return mode === 'solo' ? 6 : mode === 'mix' ? 7 : 9;
}
