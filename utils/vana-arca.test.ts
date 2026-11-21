import { describe, expect, test } from 'bun:test'
import {
  ARCA_COLS,
  ARCA_LIVES,
  ARCA_ROWS,
  ARCA_SPECIES,
  CAPSIZE_CENTIDEG,
  MAX_RUN_TICKS,
  POS_SCALE,
  applyMultiplier,
  createArcaGame,
  dropColumn,
  familyPositionNote,
  familyStandings,
  familyWinner,
  isPaidRun,
  lisbonLocalToDate,
  loadTilt,
  nextPrizeAt,
  openPeriod,
  inPeriod,
  paidRunsLeft,
  personalRecords,
  pieceSpeed,
  replayArca,
  runReward,
  runRewardDescription,
  stepArca,
  tableSin,
  ticksWithinClock,
  tierReward,
  waveTilt,
  weeklyRanking,
  type ArcaGame,
  type RankingRun,
} from './vana-arca'
import { DEFAULT_VANAARCA_SETTINGS } from '@/types/vana-arca'

const S = DEFAULT_VANAARCA_SETTINGS

/** Toques a cada `every` ticks até ao fim da partida (a partir de `from`). */
function playEvery(seed: number, every: number, from = 30) {
  const game = createArcaGame(seed)
  const taps: number[] = []
  while (!game.over && game.tick < MAX_RUN_TICKS) {
    const tap = game.tick >= from && (game.tick - from) % every === 0
    if (tap) taps.push(game.tick)
    stepArca(game, tap)
  }
  return { game, taps }
}

/** Põe a peça atual numa espécie e coluna escolhidas e larga-a neste tick. */
function dropAt(game: ArcaGame, speciesId: string, col: number) {
  const species = ARCA_SPECIES.findIndex((s) => s.id === speciesId)
  const { width, weight } = ARCA_SPECIES[species]
  game.piece = { species, width, weight, x: col * POS_SCALE, dir: 1 }
  stepArca(game, true)
}

describe('motor — determinismo', () => {
  test('mesma semente e mesmos toques dão sempre o mesmo resultado', () => {
    for (const seed of [1, 42, 123456789, 4294967295]) {
      const { game, taps } = playEvery(seed, 37)
      const a = replayArca(seed, taps, game.tick)
      const b = replayArca(seed, taps, game.tick)
      expect(a).toEqual(b)
      expect(a.ok).toBe(true)
      if (a.ok) {
        expect(a.score).toBe(game.score)
        expect(a.pares).toBe(game.pares)
        expect(a.filas).toBe(game.filas)
        expect(a.endReason).toBe(game.endReason!)
        expect(a.endTicks).toBe(game.tick)
      }
    }
  })

  test('valores fixos (se mudarem, o motor mudou e as partidas antigas deixam de bater certo)', () => {
    const { game, taps } = playEvery(20261121, 45)
    expect(taps.length).toBeGreaterThan(0)
    const r = replayArca(20261121, taps, game.tick)
    expect(r).toMatchSnapshot()
  })

  test('a mesma semente gera sempre a mesma sequência de peças e sentidos', () => {
    const seq = (seed: number) => {
      const g = createArcaGame(seed)
      const out: string[] = []
      for (let i = 0; i < 20; i++) {
        out.push(`${g.piece.species}${g.piece.dir}`)
        g.piece = { ...g.piece, x: 0 }
        g.heights = new Array(ARCA_COLS).fill(0)
        g.moment = 0
        g.weight = 0
        stepArca(g, true)
        g.over = false
        g.lives = ARCA_LIVES
      }
      return out.join(',')
    }
    expect(seq(99)).toBe(seq(99))
    expect(seq(99)).not.toBe(seq(100))
  })

  test('o tick 0 é o arranque: a peça começa encostada a um lado', () => {
    for (let seed = 0; seed < 30; seed++) {
      const g = createArcaGame(seed)
      const max = (ARCA_COLS - g.piece.width) * POS_SCALE
      expect(g.piece.x === 0 ? g.piece.dir : g.piece.x === max ? -g.piece.dir : 0).toBe(1)
    }
  })

  test('tabela de senos: simetria e extremos', () => {
    expect(tableSin(0)).toBe(0)
    expect(tableSin(256)).toBe(10000)
    expect(tableSin(512)).toBe(0)
    expect(tableSin(768)).toBe(-10000)
    for (let i = 1; i < 256; i++) {
      expect(tableSin(512 - i)).toBe(tableSin(i))
      expect(tableSin(1024 - i)).toBe(-tableSin(i))
    }
  })

  test('ondas: amplitude 1° no início e no máximo 6°', () => {
    let max = 0
    // Um período inteiro (≈ 236 ticks) nos primeiros 4 s: amplitude entre 1° e 1,2°.
    for (let t = 0; t < 240; t++) max = Math.max(max, Math.abs(waveTilt(t)))
    expect(max).toBeLessThanOrEqual(120)
    expect(max).toBeGreaterThan(100)
    let later = 0
    for (let t = 60 * 200; t < 60 * 210; t++) later = Math.max(later, Math.abs(waveTilt(t)))
    expect(later).toBeLessThanOrEqual(600)
    expect(later).toBeGreaterThan(590)
  })

  test('velocidade: 3 casas/s no início, mais 0,15 por par, até 9', () => {
    expect(pieceSpeed(0)).toBe(3000)
    expect(pieceSpeed(10)).toBe(4500)
    expect(pieceSpeed(40)).toBe(9000)
    expect(pieceSpeed(100)).toBe(9000)
  })

  test('coluna de largada: posição arredondada e limitada', () => {
    expect(dropColumn({ x: 0, width: 2 })).toBe(0)
    expect(dropColumn({ x: POS_SCALE * 2.49, width: 2 })).toBe(2)
    expect(dropColumn({ x: POS_SCALE * 2.5, width: 2 })).toBe(3)
    expect(dropColumn({ x: POS_SCALE * 9, width: 3 })).toBe(7)
  })
})

describe('motor — regras', () => {
  test('inclinação de carga segue a fórmula da secção 2.4', () => {
    // Um elefante (peso 6, largura 3) encostado à direita: centro 8,5 → 10·6·3,5/21 = 10°.
    expect(loadTilt(6 * (2 * 7 + 3 - 10), 6)).toBe(1000)
    expect(loadTilt(0, 0)).toBe(0)
    expect(loadTilt(-42, 6)).toBe(-1000)
  })

  test('vira só ACIMA de 14°', () => {
    const exact = createArcaGame(7)
    exact.moment = 98 // 500·98/35 = 1400 (Σpeso 20)
    exact.weight = 20
    stepArca(exact, false) // tick 0: ondas = 0
    expect(exact.tilt).toBe(CAPSIZE_CENTIDEG)
    expect(exact.over).toBe(false)

    const over = createArcaGame(7)
    over.moment = 99
    over.weight = 20
    stepArca(over, false)
    expect(over.tilt).toBeGreaterThan(CAPSIZE_CENTIDEG)
    expect(over.over).toBe(true)
    expect(over.endReason).toBe('capsized')
  })

  test('dois elefantes no mesmo lado viram a arca', () => {
    const g = createArcaGame(3)
    dropAt(g, 'elefantes', 7)
    expect(g.over).toBe(false)
    dropAt(g, 'elefantes', 7)
    expect(g.over).toBe(true)
    expect(g.endReason).toBe('capsized')
    expect(g.pares).toBe(2)
  })

  test('o par pousa em cima do que já lá está (pode ficar um buraco)', () => {
    const g = createArcaGame(5)
    dropAt(g, 'coelhos', 4)
    dropAt(g, 'ovelhas', 4) // ocupa 4 e 5: pousa na fila 1, buraco em (0,5)
    expect(g.placed[1].row).toBe(1)
    expect(g.heights[5]).toBe(2)
    expect(g.grid[0 * ARCA_COLS + 5]).toBe(-1)
  })

  test('perde uma vida quando não cabe, e acaba sem vidas ("full")', () => {
    const g = createArcaGame(11)
    g.heights = new Array(ARCA_COLS).fill(ARCA_ROWS)
    dropAt(g, 'coelhos', 0)
    expect(g.lives).toBe(2)
    expect(g.pares).toBe(0)
    expect(g.lastDrop?.kind).toBe('lost')
    dropAt(g, 'coelhos', 0)
    expect(g.over).toBe(false)
    dropAt(g, 'coelhos', 0)
    expect(g.lives).toBe(0)
    expect(g.over).toBe(true)
    expect(g.endReason).toBe('full')
  })

  test('fila completa vale +3 e pontuação = pares + 3·filas', () => {
    const g = createArcaGame(13)
    for (const col of [0, 9, 1, 8, 2, 7, 3, 6, 4, 5]) dropAt(g, 'coelhos', col)
    expect(g.over).toBe(false)
    expect(g.pares).toBe(10)
    expect(g.filas).toBe(1)
    expect(g.score).toBe(13)
    // Uma fila só com 9 casas não conta.
    for (const col of [0, 9, 1, 8, 2, 7, 3, 6, 4]) dropAt(g, 'coelhos', col)
    expect(g.filas).toBe(1)
    expect(g.score).toBe(19 + 3)
  })

  test('conta as espécies embarcadas', () => {
    const g = createArcaGame(17)
    dropAt(g, 'coelhos', 0)
    dropAt(g, 'coelhos', 9)
    dropAt(g, 'pombas', 5)
    expect(g.species).toEqual({ coelhos: 2, pombas: 1 })
  })
})

describe('repetição no servidor', () => {
  const { game, taps } = playEvery(31337, 40)

  test('aceita a partida verdadeira', () => {
    expect(replayArca(31337, taps, game.tick).ok).toBe(true)
    // Mandar mais ticks do que os precisos também serve (o motor acaba antes).
    expect(replayArca(31337, taps, game.tick + 100).ok).toBe(true)
  })

  test('toques têm de ser crescentes e dentro do total', () => {
    expect(replayArca(1, [10, 10], 100)).toEqual({ ok: false, reason: 'taps_not_increasing' })
    expect(replayArca(1, [20, 10], 100)).toEqual({ ok: false, reason: 'taps_not_increasing' })
    expect(replayArca(1, [100], 100)).toEqual({ ok: false, reason: 'tap_out_of_range' })
    expect(replayArca(1, [-1], 100)).toEqual({ ok: false, reason: 'tap_out_of_range' })
    expect(replayArca(1, [1.5], 100)).toEqual({ ok: false, reason: 'bad_input' })
  })

  test('o motor tem de acabar a partida até ao último tick', () => {
    const cut = taps.slice(0, -1)
    expect(replayArca(31337, cut, cut[cut.length - 1] + 1)).toEqual({ ok: false, reason: 'not_finished' })
    expect(replayArca(1, [], 600)).toEqual({ ok: false, reason: 'not_finished' })
  })

  test('toques depois do fim invalidam', () => {
    const extra = [...taps, game.tick + 5]
    expect(replayArca(31337, extra, game.tick + 10)).toEqual({ ok: false, reason: 'taps_after_end' })
  })

  test('mais de 45 minutos é recusado', () => {
    expect(replayArca(1, [], MAX_RUN_TICKS + 1)).toEqual({ ok: false, reason: 'too_long' })
  })

  test('não se joga mais depressa do que o relógio (tolerância de 5 s)', () => {
    const start = Date.UTC(2026, 10, 21, 10, 0, 0)
    expect(ticksWithinClock(60 * 60, start, start + 60_000)).toBe(true)
    expect(ticksWithinClock(65 * 60, start, start + 60_000)).toBe(true)
    expect(ticksWithinClock(65 * 60 + 1, start, start + 60_000)).toBe(false)
    // Mais lento do que o relógio (separador em segundo plano) é aceite.
    expect(ticksWithinClock(10 * 60, start, start + 600_000)).toBe(true)
    expect(ticksWithinClock(MAX_RUN_TICKS + 1, start, start + 10 * 3600_000)).toBe(false)
  })
})

describe('prémio por partida', () => {
  test('escalões pelos pares a bordo', () => {
    expect(tierReward(0, S)).toBe(5)
    expect(tierReward(9, S)).toBe(5)
    expect(tierReward(10, S)).toBe(10)
    expect(tierReward(19, S)).toBe(10)
    expect(tierReward(20, S)).toBe(15)
    expect(tierReward(60, S)).toBe(15)
  })

  test('só as 3 primeiras partidas do dia têm prémio (máx. 45 por dia)', () => {
    expect([1, 2, 3, 4, 5].map((i) => isPaidRun(i, S))).toEqual([true, true, true, false, false])
    expect([1, 2, 3, 4].reduce((sum, i) => sum + runReward(25, i, S), 0)).toBe(45)
    expect(runReward(25, 4, S)).toBe(0)
    expect(paidRunsLeft(0, S)).toBe(3)
    expect(paidRunsLeft(2, S)).toBe(1)
    expect(paidRunsLeft(5, S)).toBe(0)
  })

  test('as vagas mudam com as definições do admin', () => {
    const two = { ...S, paid_runs_per_day: 2 }
    expect(isPaidRun(3, two)).toBe(false)
    expect(paidRunsLeft(1, two)).toBe(1)
  })

  test('multiplicador de campanha arredonda para cima (como apply_points_multiplier)', () => {
    expect(runReward(5, 1, S, 2)).toBe(10)
    expect(runReward(5, 1, S, 1.5)).toBe(8)
    expect(runReward(5, 4, S, 5)).toBe(0)
    expect(applyMultiplier(15, 1)).toBe(15)
  })

  test('descrição fixa do points_log', () => {
    expect(runRewardDescription(12, null)).toBe('VanaArca — Partida (12 pares)')
    expect(runRewardDescription(1, null)).toBe('VanaArca — Partida (1 par)')
    expect(runRewardDescription(0, '×2')).toBe('VanaArca — Partida (0 pares) ×2')
  })
})

describe('período semanal', () => {
  const sun2100 = { weekday: 0, time: '21:00' }

  test('próximo domingo às 21:00 de Lisboa', () => {
    // Sábado 21/11/2026 15:00 (inverno, Lisboa = UTC).
    const end = nextPrizeAt(new Date('2026-11-21T15:00:00Z'), sun2100.weekday, sun2100.time)
    expect(end.toISOString()).toBe('2026-11-22T21:00:00.000Z')
    // No próprio domingo, antes e depois da hora.
    expect(nextPrizeAt(new Date('2026-11-22T20:59:00Z'), 0, '21:00').toISOString()).toBe('2026-11-22T21:00:00.000Z')
    expect(nextPrizeAt(new Date('2026-11-22T21:00:00Z'), 0, '21:00').toISOString()).toBe('2026-11-29T21:00:00.000Z')
  })

  test('primeira semana começa em launched_at; depois no último pagamento', () => {
    const launched = new Date('2026-11-24T10:00:00Z')
    const first = openPeriod({ lastPeriodEnd: null, launchedAt: launched, scheduleChangedAt: null, ...sun2100 })
    expect(first.start).toEqual(launched)
    expect(first.end.toISOString()).toBe('2026-11-29T21:00:00.000Z')
    const second = openPeriod({ lastPeriodEnd: first.end, launchedAt: launched, scheduleChangedAt: null, ...sun2100 })
    expect(second.start).toEqual(first.end)
    expect(second.end.toISOString()).toBe('2026-12-06T21:00:00.000Z')
  })

  test('mudança de dia/hora no admin vale a partir da mudança (nunca paga logo)', () => {
    const last = new Date('2026-11-22T21:00:00Z') // pago no domingo
    // Quarta-feira muda para terça às 20:00 (já passou nesta semana) → próxima terça.
    const changed = new Date('2026-11-25T10:00:00Z')
    const p = openPeriod({ lastPeriodEnd: last, launchedAt: last, scheduleChangedAt: changed, weekday: 2, time: '20:00' })
    expect(p.start).toEqual(last)
    expect(p.end.toISOString()).toBe('2026-12-01T20:00:00.000Z')
    // Quarta-feira muda para quinta às 20:00 → esta quinta (período mais curto).
    const q = openPeriod({ lastPeriodEnd: last, launchedAt: last, scheduleChangedAt: changed, weekday: 4, time: '20:00' })
    expect(q.end.toISOString()).toBe('2026-11-26T20:00:00.000Z')
    // Uma mudança antiga (antes do início do período) não mexe em nada.
    const old = openPeriod({ lastPeriodEnd: last, launchedAt: last, scheduleChangedAt: new Date('2026-11-01T00:00:00Z'), ...sun2100 })
    expect(old.end.toISOString()).toBe('2026-11-29T21:00:00.000Z')
  })

  test('hora de verão: fim de março (21:00 de Lisboa = 20:00 UTC)', () => {
    // 2027-03-28 é o último domingo de março: os relógios avançam à 01:00 UTC.
    const before = new Date('2027-03-21T21:00:00Z') // domingo anterior, ainda inverno
    const end = nextPrizeAt(before, 0, '21:00')
    expect(end.toISOString()).toBe('2027-03-28T20:00:00.000Z')
    expect((end.getTime() - before.getTime()) / 3600_000).toBe(167)
    expect(nextPrizeAt(end, 0, '21:00').toISOString()).toBe('2027-04-04T20:00:00.000Z')
  })

  test('hora de verão: fim de outubro (volta a 21:00 UTC)', () => {
    // 2026-10-25 é o último domingo de outubro: os relógios recuam à 01:00 UTC.
    const before = new Date('2026-10-18T20:00:00Z') // 21:00 de verão
    const end = nextPrizeAt(before, 0, '21:00')
    expect(end.toISOString()).toBe('2026-10-25T21:00:00.000Z')
    expect((end.getTime() - before.getTime()) / 3600_000).toBe(169)
  })

  test('horas que não existem / se repetem seguem o Postgres', () => {
    // 01:30 de 28/03/2027 não existe em Lisboa → 02:30 WEST = 01:30 UTC.
    expect(lisbonLocalToDate('2027-03-28', '01:30').toISOString()).toBe('2027-03-28T01:30:00.000Z')
    // 01:30 de 25/10/2026 acontece duas vezes → fica a de inverno (01:30 UTC).
    expect(lisbonLocalToDate('2026-10-25', '01:30').toISOString()).toBe('2026-10-25T01:30:00.000Z')
  })

  test('uma partida pertence ao período em que terminou', () => {
    const p = { start: new Date('2026-11-22T21:00:00Z'), end: new Date('2026-11-29T21:00:00Z') }
    expect(inPeriod(new Date('2026-11-22T21:00:00Z'), p)).toBe(true)
    expect(inPeriod(new Date('2026-11-29T20:59:59Z'), p)).toBe(true)
    expect(inPeriod(new Date('2026-11-29T21:00:00Z'), p)).toBe(false)
  })
})

describe('rankings semanais', () => {
  const runs: RankingRun[] = [
    { userId: 'ana', score: 30, finishedAt: '2026-11-23T10:00:00Z' },
    { userId: 'ana', score: 40, finishedAt: '2026-11-24T10:00:00Z' },
    { userId: 'bia', score: 40, finishedAt: '2026-11-23T09:00:00Z' },
    { userId: 'bia', score: 40, finishedAt: '2026-11-25T09:00:00Z' },
    { userId: 'rui', score: 50, finishedAt: '2026-11-26T09:00:00Z' },
    { userId: 'coord', score: 99, finishedAt: '2026-11-23T08:00:00Z' },
  ]
  const records = personalRecords(runs)

  test('conta o recorde (a melhor partida), não a soma', () => {
    expect(records.get('ana')!.score).toBe(40)
    expect(records.get('bia')!.finishedAt).toBe('2026-11-23T09:00:00Z')
  })

  test('desempate: ganha quem fez a pontuação primeiro; coordenadores e testes ficam de fora', () => {
    const eligible = new Set(['ana', 'bia', 'rui'])
    const top = weeklyRanking(records, eligible)
    expect(top.map((r) => r.userId)).toEqual(['rui', 'bia', 'ana'])
  })

  const families = [
    { familyId: 'f1', name: 'Família Silva', memberIds: ['ana', 'bia', 'kid'] },
    { familyId: 'f2', name: 'Família Costa', memberIds: ['rui', 'zé'] },
    { familyId: 'f3', name: 'Família Sozinha', memberIds: ['solo', 'parado'] },
  ]

  test('média com quem não jogou a contar 0; família com 1 membro ativo fica de fora', () => {
    const recs = personalRecords([...runs, { userId: 'solo', score: 80, finishedAt: '2026-11-23T08:00:00Z' }])
    const active = new Set(['ana', 'bia', 'kid', 'rui', 'zé', 'solo']) // 'parado' sem movimentos há 90 dias
    const st = familyStandings(families, recs, active, 2)
    expect(st.map((f) => f.familyId)).toEqual(['f1', 'f2'])
    const silva = st.find((f) => f.familyId === 'f1')!
    expect(silva.total).toBe(80)
    expect(silva.active).toBe(3)
    expect(silva.played).toBe(2)
    expect(silva.playedIds.sort()).toEqual(['ana', 'bia'])
    const costa = st.find((f) => f.familyId === 'f2')!
    expect(costa.total).toBe(50)
    expect(costa.active).toBe(2)
    // 80/3 = 26,7 > 50/2 = 25
    expect(familyWinner(st)!.familyId).toBe('f1')
  })

  test('desempate das famílias: mais membros que jogaram, depois quem chegou primeiro', () => {
    const active = new Set(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'])
    const fam = [
      { familyId: 'A', name: 'A', memberIds: ['a1', 'a2'] },
      { familyId: 'B', name: 'B', memberIds: ['b1', 'b2'] },
      { familyId: 'C', name: 'C', memberIds: ['c1', 'c2'] },
    ]
    const recs = personalRecords([
      { userId: 'a1', score: 20, finishedAt: '2026-11-23T10:00:00Z' }, // A: 20/2 = 10, 1 jogou
      { userId: 'b1', score: 10, finishedAt: '2026-11-23T10:00:00Z' }, // B: 20/2 = 10, 2 jogaram, último às 12:00
      { userId: 'b2', score: 10, finishedAt: '2026-11-23T12:00:00Z' },
      { userId: 'c1', score: 15, finishedAt: '2026-11-23T09:00:00Z' }, // C: 20/2 = 10, 2 jogaram, último às 11:00
      { userId: 'c2', score: 5, finishedAt: '2026-11-23T11:00:00Z' },
    ])
    const st = familyStandings(fam, recs, active, 2)
    expect(st.map((f) => f.familyId)).toEqual(['C', 'B', 'A'])
  })

  test('sem ninguém a jogar não há família vencedora', () => {
    const st = familyStandings(families, new Map(), new Set(['ana', 'bia', 'rui', 'zé']), 2)
    expect(st.length).toBe(2)
    expect(familyWinner(st)).toBeNull()
  })

  test('mínimo de membros ativos configurável', () => {
    const active = new Set(['ana', 'bia', 'kid', 'rui', 'zé'])
    expect(familyStandings(families, records, active, 3).map((f) => f.familyId)).toEqual(['f1'])
  })

  test('frase da posição da família', () => {
    const active = new Set(['ana', 'bia', 'kid', 'rui', 'zé'])
    const st = familyStandings(families, records, active, 2) // Costa 25, Silva 26,7
    expect(familyPositionNote(st, 'f2')).toBe('A tua família está em 2.º, a 1,7 pontos da 1.ª.')
    expect(familyPositionNote(st, 'f1')).toBe('A tua família vai em 1.º lugar na Disputa de Famílias!')
    expect(familyPositionNote(st, null)).toBeNull()
    expect(familyPositionNote(st, 'f3')).toBeNull()
  })
})
