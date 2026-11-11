/**
 * Coluna flutuante do painel do Narrador (canto inferior esquerdo), montada em
 * app/jogos/vana-camp/[sessionId]/control/page.tsx. O HostAlertPanel é
 * renderizado dentro dos monitores de cada fase e entra nesta coluna por
 * portal, para empurrar e ser empurrado pelo chat e pelo debug.
 *
 * Fica num ficheiro sem 'use client' para a página (servidor) poder importar o id.
 */
export const HOST_DOCK_ALERTS_ID = 'vc-host-dock-alerts'
