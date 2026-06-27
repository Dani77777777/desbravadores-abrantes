// Helpers de permissões para os "Ajudantes" (helpers de cargos).
//
// Um ajudante mantém o cargo real `role = 'desbravador'` (para continuar na
// leaderboard) mas tem colunas `helper_role` / `helper_section` que lhe dão o
// acesso de gestão de um dirigente/coordenador. Estas funções calculam o cargo
// EFETIVO a usar no gating de UI no cliente/servidor (as RLS já tratam disto na BD).

export const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

type ProfileLike = {
  role?: string | null
  leadership_section?: string | null
  section?: string | null
  helper_role?: string | null
  helper_section?: string | null
} | null | undefined

/** Cargo efetivo: o do ajudante, se existir; senão o real. */
export function effectiveRole(profile: ProfileLike): string | undefined {
  return profile?.helper_role || profile?.role || undefined
}

/** Secção de liderança efetiva: a do ajudante, se existir; senão a real. */
export function effectiveLeadershipSection(profile: ProfileLike): string | null {
  return profile?.helper_section || profile?.leadership_section || null
}

/** Tem acesso à área de gestão (cargo real ou de ajudante). */
export function isAdminRole(profile: ProfileLike): boolean {
  const r = effectiveRole(profile)
  return r === 'coordenador' || r === 'dirigente'
}

/** É um ajudante (tem helper_role definido). */
export function isHelper(profile: ProfileLike): boolean {
  return !!profile?.helper_role
}

/** Etiqueta legível do ajudante, ex.: "Ajudante · Rebentos" / "Ajudante · Coordenação". */
export function helperLabel(profile: ProfileLike): string | null {
  if (!profile?.helper_role) return null
  if (profile.helper_role === 'coordenador') return 'Ajudante · Coordenação'
  const sec = profile.helper_section
  return `Ajudante · ${sec ? SECTION_LABELS[sec] || sec : 'Liderança'}`
}
