// =============================================
// VanaCódigo — o "dia" é o dia do clube (Europe/Lisbon)
//
// O servidor corre em UTC. Sem isto, no horário de verão o desafio do dia só
// mudava à 01:00 e as sessões da última hora da noite contavam para o dia
// seguinte. Mesma ideia dos helpers do VanaTrilha, mas local ao jogo para não
// arrastar o módulo desse jogo para aqui.
// =============================================

const TZ = 'Europe/Lisbon';

/** "Hoje" no fuso do clube, em YYYY-MM-DD. */
export function lisbonDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Dia da semana em Lisboa (0 = domingo), para a rotação semanal dos códigos. */
export function lisbonWeekday(now: Date = new Date()): number {
  return new Date(`${lisbonDateString(now)}T00:00:00Z`).getUTCDay();
}

/** Ano/mês/dia em Lisboa — semente do desafio diário. */
export function lisbonDateParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const [year, month, day] = lisbonDateString(now).split('-').map(Number);
  return { year, month, day };
}

/** Desvio de Lisboa em relação a UTC, em minutos, naquele instante (0 ou 60). */
function lisbonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000;
}

/** Instante em que começou o dia de hoje em Lisboa (para filtrar "sessões de hoje"). */
export function lisbonDayStart(now: Date = new Date()): Date {
  const utcMidnight = new Date(`${lisbonDateString(now)}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - lisbonOffsetMinutes(utcMidnight) * 60000);
}
