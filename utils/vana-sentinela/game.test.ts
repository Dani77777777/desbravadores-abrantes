import { describe, expect, test } from 'bun:test'
import {
  CARTAS_POR_RONDA,
  ESTADO_INICIAL,
  TEMPO_CARTA_MS,
  bonusRapidez,
  classificacao,
  linkMinuto,
  minutoParaSegundos,
  motivoPontuacaoImpossivel,
  multiplicadorCombo,
  pontosAcerto,
  pontosMaximosPara,
  pontuacaoMaxima,
  responder,
  sortearRonda,
  type EstadoRonda,
} from './game'
import { PACKS, getPackDisponivel } from './packs'
import { PackSchema } from './schema'
import type { Carta } from './types'

/** Gerador determinístico (mulberry32) para os testes serem reproduzíveis. */
function rngFrom(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const abrantes = getPackDisponivel('abrantes')!

const carta = (id: string, verdade: boolean, dificuldade: 1 | 2 | 3 = 1): Carta => ({
  id,
  afirmacao: `Afirmação ${id}`,
  verdade,
  explicacao: 'Explicação.',
  dificuldade,
})

describe('packs', () => {
  test('todos os packs passam na validação zod', () => {
    for (const pack of PACKS) {
      const res = PackSchema.safeParse(pack)
      if (!res.success) throw new Error(`${pack.slug}: ${res.error.message}`)
    }
  })

  test('ids únicos e com o prefixo da cidade', () => {
    const ids = PACKS.flatMap((p) => p.cartas.map((c) => c.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const pack of PACKS) {
      const prefixos = new Set(pack.cartas.map((c) => c.id.split('-')[0]))
      expect(prefixos.size).toBeLessThanOrEqual(1)
    }
  })

  test('packs disponíveis têm cartas suficientes para uma ronda equilibrada', () => {
    for (const pack of PACKS.filter((p) => p.disponivel)) {
      expect(pack.cartas.filter((c) => c.verdade).length).toBeGreaterThanOrEqual(8)
      expect(pack.cartas.filter((c) => !c.verdade).length).toBeGreaterThanOrEqual(8)
    }
  })

  test('Abrantes: 52 cartas, 27 verdades, 21/25/6 por dificuldade', () => {
    expect(abrantes.cartas.length).toBe(52)
    expect(abrantes.cartas.filter((c) => c.verdade).length).toBe(27)
    expect([1, 2, 3].map((d) => abrantes.cartas.filter((c) => c.dificuldade === d).length)).toEqual([21, 25, 6])
  })

  test('packs sem cartas não estão disponíveis', () => {
    expect(getPackDisponivel('tomar')).toBeUndefined()
    expect(getPackDisponivel('nao-existe')).toBeUndefined()
  })
})

describe('sortearRonda', () => {
  test('15 cartas sem repetições, 7 ou 8 verdades', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ronda = sortearRonda(abrantes.cartas, { rng: rngFrom(seed) })
      expect(ronda.length).toBe(CARTAS_POR_RONDA)
      expect(new Set(ronda.map((c) => c.id)).size).toBe(CARTAS_POR_RONDA)
      const verdades = ronda.filter((c) => c.verdade).length
      expect(verdades === 7 || verdades === 8).toBe(true)
    }
  })

  test('as duas quantidades de verdades acontecem', () => {
    const vistas = new Set<number>()
    for (let seed = 1; seed <= 100; seed++) {
      vistas.add(sortearRonda(abrantes.cartas, { rng: rngFrom(seed) }).filter((c) => c.verdade).length)
    }
    expect([...vistas].sort()).toEqual([7, 8])
  })

  test('curva de dificuldade: primeiras 5 fáceis/médias, difíceis só nas últimas 5', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ronda = sortearRonda(abrantes.cartas, { rng: rngFrom(seed) })
      expect(ronda.slice(0, 5).every((c) => c.dificuldade <= 2)).toBe(true)
      const dificeis = ronda.map((c, i) => (c.dificuldade === 3 ? i : -1)).filter((i) => i >= 0)
      expect(dificeis.length).toBeGreaterThanOrEqual(1)
      expect(dificeis.length).toBeLessThanOrEqual(3)
      expect(dificeis.every((i) => i >= CARTAS_POR_RONDA - 5)).toBe(true)
    }
  })

  test('as primeiras cartas tendem a ser as mais fáceis', () => {
    let fáceisNoInicio = 0
    let fáceisNoMeio = 0
    for (let seed = 1; seed <= 200; seed++) {
      const ronda = sortearRonda(abrantes.cartas, { rng: rngFrom(seed) })
      fáceisNoInicio += ronda.slice(0, 5).filter((c) => c.dificuldade === 1).length
      fáceisNoMeio += ronda.slice(5, 10).filter((c) => c.dificuldade === 1).length
    }
    expect(fáceisNoInicio).toBeGreaterThan(fáceisNoMeio)
  })

  test('recebe uma lista de cartas (de qualquer pack) e ignora repetidas', () => {
    const lista = [carta('x-01', true), carta('x-01', true), carta('x-02', false), carta('x-03', true)]
    const ronda = sortearRonda(lista, { rng: rngFrom(7) })
    expect(ronda.map((c) => c.id).sort()).toEqual(['x-01', 'x-02', 'x-03'])
  })

  test('aceita outros tamanhos de ronda (futura Maratona)', () => {
    const ronda = sortearRonda(abrantes.cartas, { n: 20, rng: rngFrom(3) })
    expect(ronda.length).toBe(20)
    expect(ronda.filter((c) => c.verdade).length).toBe(10)
  })
})

describe('pontuação', () => {
  test('multiplicador de combo', () => {
    expect([0, 2, 3, 5, 6, 9, 10, 14].map(multiplicadorCombo)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })

  test('bónus de rapidez linear até +50', () => {
    expect(bonusRapidez(TEMPO_CARTA_MS)).toBe(50)
    expect(bonusRapidez(TEMPO_CARTA_MS / 2)).toBe(25)
    expect(bonusRapidez(0)).toBe(0)
    expect(bonusRapidez(-500)).toBe(0)
  })

  test('acerto = (100 + bónus) × multiplicador', () => {
    expect(pontosAcerto(TEMPO_CARTA_MS, 0)).toBe(150)
    expect(pontosAcerto(0, 3)).toBe(200)
    expect(pontosAcerto(TEMPO_CARTA_MS / 2, 10)).toBe(500)
  })

  test('pontuação máxima de 15 cartas', () => {
    // 3×150 + 3×300 + 4×450 + 5×600
    expect(pontuacaoMaxima(15)).toBe(450 + 900 + 1800 + 3000)
    expect(pontuacaoMaxima(0)).toBe(0)
  })

  test('máximo para acertos e combo', () => {
    expect(pontosMaximosPara(15, 15, 15)).toBe(pontuacaoMaxima(15))
    expect(pontosMaximosPara(0, 0, 15)).toBe(0)
    expect(pontosMaximosPara(14, 7, 15)).toBe(2 * pontuacaoMaxima(7))
    expect(pontosMaximosPara(10, 3, 15)).toBe(3 * pontuacaoMaxima(3) + pontuacaoMaxima(1))
    // Impossíveis
    expect(pontosMaximosPara(5, 6, 15)).toBeNull() // combo > acertos
    expect(pontosMaximosPara(3, 0, 15)).toBeNull() // acertos sem combo
    expect(pontosMaximosPara(14, 1, 15)).toBeNull() // 14 sequências de 1 precisam de 13 erros
    expect(pontosMaximosPara(16, 16, 15)).toBeNull()
  })

  test('erro e tempo esgotado: 0 pontos e combo volta a 0', () => {
    const c = carta('t-01', true)
    let s: EstadoRonda = ESTADO_INICIAL
    s = responder(s, c, 'verdade', 1000)
    s = responder(s, c, 'verdade', 1000)
    expect(s.combo).toBe(2)
    const antes = s.pontos
    s = responder(s, c, 'tempo', 0)
    expect(s.combo).toBe(0)
    expect(s.pontos).toBe(antes)
    expect(s.jogadas.at(-1)).toMatchObject({ certa: false, pontos: 0, tempoMs: TEMPO_CARTA_MS })
    s = responder(s, carta('t-02', false), 'verdade', 500)
    expect(s.jogadas.at(-1)?.certa).toBe(false)
    expect(s.comboMax).toBe(2)
    expect(s.acertos).toBe(2)
  })

  test('uma ronda perfeita e instantânea dá a pontuação máxima e passa na validação', () => {
    let s: EstadoRonda = ESTADO_INICIAL
    for (const c of sortearRonda(abrantes.cartas, { rng: rngFrom(11) })) {
      s = responder(s, c, c.verdade ? 'verdade' : 'distorcao', 0)
    }
    expect(s.pontos).toBe(pontuacaoMaxima(15))
    expect(s.comboMax).toBe(15)
    // Instantâneo é rápido demais para o servidor
    expect(motivoPontuacaoImpossivel({ pack: 'abrantes', pontos: s.pontos, acertos: s.acertos, total: 15, comboMax: s.comboMax, duracaoMs: s.duracaoMs })).not.toBeNull()
  })

  test('rondas jogadas a sério passam sempre na validação do servidor', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = rngFrom(seed)
      let s: EstadoRonda = ESTADO_INICIAL
      for (const c of sortearRonda(abrantes.cartas, { rng })) {
        const r = rng()
        const resposta = r < 0.1 ? 'tempo' : r < 0.3 ? (c.verdade ? 'distorcao' : 'verdade') : c.verdade ? 'verdade' : 'distorcao'
        s = responder(s, c, resposta, 700 + rng() * 7000)
      }
      const motivo = motivoPontuacaoImpossivel({ pack: 'abrantes', pontos: s.pontos, acertos: s.acertos, total: 15, comboMax: s.comboMax, duracaoMs: s.duracaoMs })
      expect(motivo).toBeNull()
    }
  })

  test('pontuações impossíveis são recusadas', () => {
    const base = { pack: 'abrantes', pontos: 1500, acertos: 10, total: 15, comboMax: 5, duracaoMs: 40000 }
    expect(motivoPontuacaoImpossivel(base)).toBeNull()
    expect(motivoPontuacaoImpossivel({ ...base, pontos: 99999 })).not.toBeNull()
    expect(motivoPontuacaoImpossivel({ ...base, pontos: 3000, comboMax: 3 })).not.toBeNull()
    expect(motivoPontuacaoImpossivel({ ...base, duracaoMs: 5000 })).not.toBeNull()
    expect(motivoPontuacaoImpossivel({ ...base, total: 20 })).not.toBeNull()
    expect(motivoPontuacaoImpossivel({ ...base, pontos: 50 })).not.toBeNull()
  })
})

describe('ecrã final', () => {
  test('classificação por percentagem', () => {
    expect(classificacao(6, 15).titulo).toBe('Ouvinte distraído') // 40 %
    expect(classificacao(7, 15).titulo).toBe('Ouvinte atento')
    expect(classificacao(10, 15).titulo).toBe('Ouvinte atento') // 66,7 %
    expect(classificacao(11, 15).titulo).toBe('Guardião da Mensagem')
    expect(classificacao(13, 15).titulo).toBe('Guardião da Mensagem') // 86,7 %
    expect(classificacao(14, 15).titulo).toBe('Sentinela do Santuário')
  })

  test('minuto → segundos e link para o vídeo', () => {
    expect(minutoParaSegundos('0:23:15')).toBe(1395)
    expect(minutoParaSegundos('12:00')).toBe(720)
    expect(minutoParaSegundos('abc')).toBeNull()
    expect(linkMinuto(undefined, '0:12:00')).toBeNull()
    expect(linkMinuto('https://youtu.be/abc', '0:12:00')).toBe('https://youtu.be/abc?t=720')
    expect(linkMinuto('https://www.youtube.com/watch?v=abc', '1:00:01')).toBe('https://www.youtube.com/watch?v=abc&t=3601')
  })
})
