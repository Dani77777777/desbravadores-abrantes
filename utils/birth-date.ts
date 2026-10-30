import { ageFrom } from '@/utils/teams'

/** Uma data que dá menos de 1 ano (0 anos ou negativa) é quase de certeza um ano mal escrito. */
export function hasImplausibleBirthDate(birthDate: string | null | undefined, now = new Date()): boolean {
  const age = ageFrom(birthDate ?? null, now)
  return age !== null && age < 1
}

export const IMPLAUSIBLE_BIRTH_DATE_MESSAGE = 'Confirma o ano de nascimento: com esta data teria menos de 1 ano.'
