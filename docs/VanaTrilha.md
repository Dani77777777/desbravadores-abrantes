# VanaTrilha — A Rota da Promessa

**Especificação de construção para o Claude Code.**
Jogo #5 do Centro de Jogos dos Desbravadores de Abrantes.

> **Como usar este documento:** lê-o de ponta a ponta antes de escrever código. As
> secções 1 a 7 são a *bíblia do jogo* (regras + arquitetura). A secção 8 é a ordem
> de trabalho da página pública "Como Jogar". A secção 9 é o briefing da imagem de
> anúncio. A secção 10 é o plano faseado — **começa pela Fase 1 e entrega-a sozinha**.
> A secção 12 tem armadilhas reais deste repositório que te vão poupar horas.

---

> ### ✅ Estado da implementação (2026-09-14)
>
> Implementado **só o Modo Diário (singleplayer)**. O Modo Evento (secções 2.4, 3.7, 6.4,
> Fase 2) **foi descartado** por decisão do clube — não construir.
>
> Decisões que alteram o texto abaixo:
> - **Errar** tira 1 vida e troca a pergunta por outra da mesma dificuldade (`reserve_ids`),
>   para o peão conseguir chegar à casa 8. **Jornada Perfeita** = completa com `mistakes = 0`.
> - **Tábuas da Lei** no diário: acertar o V/F dá **+1 casa** (não +3); errar não custa nada.
> - **Milagre**: +2 Gold só pagos se a etapa ficar completa (coluna `bonus_gold`).
> - `questionIndex` = coluna `turn` (n.º de respostas dadas), usada como trinco otimista.
> - As opções são baralhadas no servidor por (data, pergunta).
> - `vanatrilha_daily_questions` só pode ser chamada pelo service role (devolve `correct_index`).
> - Não há rota `/diario`: o jogo vive em `/jogos/vana-trilha` (como o VANTUR).
> - Login usa `?next=` (o parâmetro que `app/login` respeita).

## 0. TL;DR

| | |
|---|---|
| **Nome** | VanaTrilha: A Rota da Promessa |
| **Género** | Tabuleiro + perguntas bíblicas + dado |
| **Prioridade** | **Modo Diário (1 jogador)** — o clube precisa de jogos singleplayer |
| **Fase 2** | Modo Evento (multijogador ao vivo, com PIN) |
| **Rota base** | `/jogos/vana-trilha` |
| **Prefixo BD** | `vanatrilha_` |
| **Branch** | `feature/VanaTrilha` (a partir de `master`) |
| **Referência de padrões** | `feature/VanaCamp-Infiltrados` (o jogo mais completo do repo) |

O jogador percorre a rota do Êxodo — do Egito à Terra Prometida — respondendo a
perguntas bíblicas para avançar casas. Casas especiais recriam episódios do Êxodo
(maná, coluna de nuvem, serpente ardente) com efeitos próprios.

**Fase 1 é entregável sozinha:** banco de perguntas + desafio diário solo + página
pública "Como Jogar" + cartão no hub. Sem tempo real, sem sessões, sem PIN.

---

## 1. Contexto do repositório

### 1.1 Stack

- Next.js (App Router, Server Components, Server Actions) + TypeScript
- Supabase (Postgres + Auth + Realtime + RLS)
- Tailwind CSS + componentes `@/components/ui/*` (shadcn-style) + ícones `lucide-react`
- Deploy: Vercel

### 1.2 Jogos já existentes (e o que copiar de cada um)

| Jogo | Onde | O que aproveitar |
|---|---|---|
| **VANTUR** | `app/jogos/vantur/`, `components/vantur/` | **O padrão do desafio diário solo**: sessão por utilizador com reset diário, `is_finished`, RPC idempotente de prémios (`award_vantur_rewards`). É o modelo mais próximo da Fase 1. |
| **VanaQuest** | `app/jogos/vana-quest/` | Entrada por PIN, ecrãs `control` / `present` / `play`, banco de perguntas com explicação. |
| **VanaWords** | `app/jogos/vana-words/` | Sessões com código, realtime, ecrã `as/[playerId]`. |
| **VanaCamp** | branch `feature/VanaCamp-Infiltrados` | **A melhor referência de arquitetura do repo.** Separação `types/` + `utils/` (regras puras) + `lib/actions/` (I/O), RLS estrita, vistas públicas para não vazar segredos, log de eventos, timers de fase, prémios via `points_log`. Lê `lib/actions/vana-camp.ts` e `utils/vana-camp.ts` antes de começar. |

### 1.3 Convenções de nomenclatura (respeitar à risca)

```
app/jogos/vana-trilha/...          rotas do jogo
components/vana-trilha/*.tsx       componentes (kebab-case na pasta)
lib/actions/vana-trilha.ts         server actions ('use server')
types/vana-trilha.ts               tipos partilhados
utils/vana-trilha.ts               regras puras, sem I/O (testáveis)
utils/vana-trilha-labels.ts        rótulos PT dos enums internos
supabase-setup-vana-trilha.sql     schema inicial (na raiz do repo)
supabase-migration-vana-trilha-vN-<assunto>.sql   migrações seguintes
public/images/VanaTrilha.png       logótipo (a criar — ver secção 9)
```

Tabelas em Postgres usam prefixo **sem hífen**: `vanatrilha_questions`,
`vanatrilha_daily_runs`, … (igual a `vanacamp_sessions`).

Valores de enums ficam **em inglês na base de dados** e são traduzidos para
português na UI através de um mapa de rótulos (ver `utils/vana-camp-labels.ts`).

### 1.4 Autenticação, papéis e pontos

- Helpers de sessão: `createClient()` de `@/utils/supabase/server` (respeita RLS) e
  `createServiceClient()` de `@/utils/supabase/service` (bypassa RLS — **só em server actions**).
- Padrão de guardas no topo do ficheiro de actions (copiar de `lib/actions/vana-camp.ts`):
  ```ts
  async function requireUser() { /* lança se não autenticado */ }
  async function requireHost() { /* exige profile.role in ('dirigente','coordenador') */ }
  ```
- `profiles.role` ∈ `desbravador` | `dirigente` | `coordenador`. Em SQL existe o helper
  `public.get_my_role()`.
- **XP e Gold nunca se escrevem em `profiles` diretamente.** Insere-se uma linha em
  `public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)`
  e um trigger (`on_points_log_change` → `update_profile_totals`) atualiza
  `profiles.total_xp` e `profiles.current_gold`.

---

## 2. O jogo

### 2.1 Conceito

Tabuleiro linear que segue a rota do Êxodo. Responder certo faz avançar. Casas
especiais dão bónus ou castigos temáticos. Chegar ao fim é "entrar na Terra Prometida".

### 2.2 As 7 estações

| # | Estação | Referência | Cor sugerida |
|---|---|---|---|
| 1 | Egito — Casa de Escravidão | Êxodo 1 | `stone` |
| 2 | Mar Vermelho | Êxodo 14 | `blue` |
| 3 | Deserto de Sin | Êxodo 16 | `amber` |
| 4 | Monte Sinai | Êxodo 19–20 | `violet` |
| 5 | Cades-Barneia | Números 13–14 | `orange` |
| 6 | Rio Jordão | Josué 3 | `teal` |
| 7 | Terra Prometida — Canaã | Josué 1 | `yellow` (dourado) |

### 2.3 Modo Diário (Fase 1 — o modo singleplayer)

O coração da Fase 1. Reinicia todos os dias à meia-noite (hora de Lisboa).

- **A estação do dia é global**: todos os jogadores apanham a mesma estação e as
  mesmas 8 perguntas nesse dia. Isto é intencional — permite conversa no grupo
  ("quantas acertaste hoje?"), tal como no Wordle.
- **8 perguntas** da estação do dia, ordem fixa.
- **3 vidas.**
- Resposta certa → avança 1 casa (de 8) + mostra a explicação/referência bíblica.
- Resposta errada → não avança, perde 1 vida, mostra a resposta correta.
- Vidas a zero → corrida termina como `failed` (pode voltar amanhã).
- Chegar à casa 8 → `completed`.
- **Sem limite de tempo rígido.** Mostra-se um cronómetro suave, apenas informativo,
  sem penalização — o objetivo é aprender, não stressar.
- Uma corrida por utilizador por dia. Recarregar a página **retoma** a corrida no
  ponto onde ia (é obrigatório: telemóveis perdem a ligação a toda a hora).

**Recompensas (Modo Diário)**

| Resultado | XP | Gold |
|---|---|---|
| Etapa completa | 2 | 2 |
| Bónus "Jornada Perfeita" (8/8 sem erros) | +1 | +1 |
| Etapa falhada (vidas esgotadas) | 0 | 0 |

Escala deliberadamente baixa, alinhada com o VANTUR (1–4 XP/dia), para não
desequilibrar a economia da loja.

**Insígnia:** completar as 7 estações diferentes (em dias não consecutivos conta)
desbloqueia "Peregrino da Promessa" no perfil. Sem XP/Gold associado.

### 2.4 Modo Evento (Fase 2 — ao vivo, em grupo)

Para reuniões e acampamentos. Segue o padrão VanaQuest/VanaCamp: o dirigente cria
a sessão, projeta o ecrã `present`, e as equipas entram por PIN no telemóvel.

- 2 a 8 equipas (ou até 30 jogadores individuais).
- Tabuleiro completo de **32 casas** (as 7 estações).
- Rondas: todas as equipas respondem **à mesma pergunta ao mesmo tempo** (20s) —
  ninguém fica parado à espera.
- Quem acerta lança o dado (1–6) e avança esse valor **mais o bónus de dificuldade**:
  Fácil +0, Média +1, Difícil +2.
- Quem erra não avança nessa ronda.
- Ao parar numa casa especial, o efeito resolve-se imediatamente.
- Vence quem chegar/passar a casa 32. Alternativa: limite de tempo (ex.: 20 min) →
  vence quem estiver mais à frente.
- Duração alvo: 15–25 minutos.

**Recompensas (Modo Evento)**

| Resultado | XP | Gold |
|---|---|---|
| 1.º lugar | 6 | 6 |
| 2.º lugar | 4 | 4 |
| 3.º lugar | 3 | 3 |
| Participação | 2 | 1 |
| Sequência de 5 respostas certas | +2 | +1 |

Atribuição manual pelo dirigente no fim (botão "Atribuir prémios"), idempotente —
copiar exatamente o padrão de `awardRewards` em `lib/actions/vana-camp.ts`.

### 2.5 Casas especiais

| Casa | Efeito | Modo |
|---|---|---|
| **Maná do Céu** | Lança o dado outra vez e soma os dois resultados | Evento |
| **Coluna de Nuvem** | Avança automaticamente até à casa da estação seguinte | Evento |
| **Serpente Ardente** | Perde a ronda seguinte (não responde nem avança) | Evento |
| **Murmuração** | Recua 2 casas | Evento |
| **Milagre** | +2 Gold, sem efeito no tabuleiro | Ambos |
| **Tábuas da Lei** | Pergunta bónus Verdadeiro/Falso: acertar avança +3 casas | Ambos |
| **Fonte de Elim** | Casa de descanso: a ronda seguinte não penaliza erro | Ambos |

No **Modo Diário** só existem casas especiais "suaves" (Milagre, Tábuas da Lei,
Fonte de Elim) e no máximo **uma por etapa** — numa corrida de 8 perguntas, recuar
ou perder turnos é frustrante em vez de divertido.

### 2.6 Perguntas

Cinco categorias: `personagens`, `lugares`, `numeros`, `milagres`, `versiculos`.
Três dificuldades: `facil`, `media`, `dificil`.

Cada pergunta tem 4 opções, uma correta, e — obrigatoriamente — uma **explicação
curta com referência bíblica**, mostrada depois de responder. O jogo é para
desbravadores de 10–15 anos: a explicação é metade do valor educativo.

**Composição da etapa diária:** 3 fáceis + 3 médias + 2 difíceis, nessa ordem
crescente de dificuldade.

**Mínimo para arrancar:** 15 perguntas por estação (105 no total). Gera um seed
inicial com pelo menos isso em `supabase-seed-vana-trilha-questions.sql` e
confirma que todas as respostas estão biblicamente corretas — quando houver
dúvida, cita o versículo na explicação.

---

## 3. Modelo de dados

Ficheiro: `supabase-setup-vana-trilha.sql` (na raiz, a correr depois de `supabase-setup.sql`).

### 3.1 Banco de perguntas

```sql
CREATE TABLE IF NOT EXISTS public.vanatrilha_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station smallint NOT NULL CHECK (station BETWEEN 1 AND 7),
  category text NOT NULL CHECK (category IN ('personagens','lugares','numeros','milagres','versiculos')),
  difficulty text NOT NULL CHECK (difficulty IN ('facil','media','dificil')),
  prompt text NOT NULL,
  options jsonb NOT NULL,                       -- ["opção A","opção B","opção C","opção D"]
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  reference text,                               -- "Êxodo 14:21"
  explanation text NOT NULL,                    -- mostrada depois de responder
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanatrilha_questions_options_len CHECK (jsonb_array_length(options) = 4)
);

CREATE INDEX IF NOT EXISTS vanatrilha_questions_station_idx
  ON public.vanatrilha_questions (station, difficulty) WHERE is_active;
```

> **Segurança:** `correct_index` nunca pode chegar ao cliente antes de a pergunta ser
> respondida. Ver 3.4 (RLS) e 6.2 (actions).

### 3.2 Corridas diárias (Modo Diário)

```sql
CREATE TABLE IF NOT EXISTS public.vanatrilha_daily_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  run_date date NOT NULL,                       -- data de Lisboa, ver 12.1
  station smallint NOT NULL,
  question_ids uuid[] NOT NULL,                 -- as 8 perguntas, ordem fixa
  current_index smallint NOT NULL DEFAULT 0,    -- 0..8 (8 = acabou)
  position smallint NOT NULL DEFAULT 0,         -- casa 0..8
  lives smallint NOT NULL DEFAULT 3,
  correct_count smallint NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{question_id, chosen_index, correct, at}]
  status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','completed','failed')),
  rewards_awarded boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (user_id, run_date)
);

CREATE INDEX IF NOT EXISTS vanatrilha_daily_runs_user_idx
  ON public.vanatrilha_daily_runs (user_id, run_date DESC);
```

`perfect` **não** é coluna: deriva-se de `status = 'completed' AND correct_count = 8`.

### 3.3 Estações completadas (insígnia)

```sql
CREATE TABLE IF NOT EXISTS public.vanatrilha_station_progress (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  station smallint NOT NULL CHECK (station BETWEEN 1 AND 7),
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, station)
);
```

Escrita pela função de conclusão da corrida (3.6). 7 linhas = insígnia completa.

### 3.4 RLS

```sql
ALTER TABLE public.vanatrilha_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanatrilha_daily_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanatrilha_station_progress ENABLE ROW LEVEL SECURITY;

-- Perguntas: só dirigentes/coordenadores leem a tabela (por causa de correct_index).
-- Os jogadores nunca leem esta tabela — recebem as perguntas pelas server actions,
-- já despidas da resposta certa.
CREATE POLICY "vanatrilha_questions_select_admin" ON public.vanatrilha_questions
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('dirigente','coordenador'));

CREATE POLICY "vanatrilha_questions_write_admin" ON public.vanatrilha_questions
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('dirigente','coordenador'))
  WITH CHECK (public.get_my_role() IN ('dirigente','coordenador'));

-- Corridas: cada um vê as suas. Escritas só via server actions (service role).
CREATE POLICY "vanatrilha_runs_select_own" ON public.vanatrilha_daily_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Progresso de estações: cada um vê o seu.
CREATE POLICY "vanatrilha_progress_select_own" ON public.vanatrilha_station_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());
```

**Não publicar nenhuma destas tabelas em realtime.** O Modo Diário é local ao
jogador; não há nada para sincronizar.

### 3.5 Escolha determinista da etapa do dia

```sql
-- Estação do dia: determinista e global (roda 1→7).
CREATE OR REPLACE FUNCTION public.vanatrilha_station_of_day(p_date date)
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$
  SELECT (((p_date - DATE '2026-01-01') % 7) + 1)::smallint;
$$;

-- As 8 perguntas do dia: 3 fáceis + 3 médias + 2 difíceis, deterministas por data.
-- Ordenação por hash → mesma data + mesma estação = mesmas perguntas para todos,
-- sem precisar de setseed().
CREATE OR REPLACE FUNCTION public.vanatrilha_daily_questions(p_date date)
RETURNS SETOF public.vanatrilha_questions
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH s AS (SELECT public.vanatrilha_station_of_day(p_date) AS station),
  picked AS (
    (SELECT q.*, 1 AS ord FROM public.vanatrilha_questions q, s
      WHERE q.station = s.station AND q.difficulty = 'facil' AND q.is_active
      ORDER BY md5(q.id::text || p_date::text) LIMIT 3)
    UNION ALL
    (SELECT q.*, 2 FROM public.vanatrilha_questions q, s
      WHERE q.station = s.station AND q.difficulty = 'media' AND q.is_active
      ORDER BY md5(q.id::text || p_date::text) LIMIT 3)
    UNION ALL
    (SELECT q.*, 3 FROM public.vanatrilha_questions q, s
      WHERE q.station = s.station AND q.difficulty = 'dificil' AND q.is_active
      ORDER BY md5(q.id::text || p_date::text) LIMIT 2)
  )
  SELECT (picked.*)::public.vanatrilha_questions FROM picked ORDER BY ord, md5(picked.id::text);
$$;
```

> Se uma estação não tiver perguntas suficientes numa dificuldade, a função devolve
> menos de 8. A server action tem de detetar isso e preencher com perguntas de outra
> dificuldade da mesma estação — nunca arrancar uma corrida com menos de 8.

### 3.6 Prémios (RPC idempotente)

Mesma ideia do `award_vantur_rewards` que o VANTUR já usa.

```sql
CREATE OR REPLACE FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_run public.vanatrilha_daily_runs%ROWTYPE;
  v_xp integer := 0;
  v_gold integer := 0;
  v_perfect boolean := false;
  v_desc text;
BEGIN
  SELECT * INTO v_run FROM public.vanatrilha_daily_runs WHERE id = p_run_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_run.user_id <> auth.uid() THEN RETURN jsonb_build_object('ok', false, 'reason', 'forbidden'); END IF;
  IF v_run.status <> 'completed' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_completed'); END IF;
  IF v_run.rewards_awarded THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded'); END IF;

  v_perfect := (v_run.correct_count = 8);
  v_xp   := 2 + CASE WHEN v_perfect THEN 1 ELSE 0 END;
  v_gold := 2 + CASE WHEN v_perfect THEN 1 ELSE 0 END;
  v_desc := 'VanaTrilha — Etapa ' || v_run.station ||
            CASE WHEN v_perfect THEN ' (Jornada Perfeita)' ELSE '' END;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_run.user_id, v_run.user_id, v_xp, v_gold, v_desc);

  UPDATE public.vanatrilha_daily_runs SET rewards_awarded = true WHERE id = p_run_id;

  INSERT INTO public.vanatrilha_station_progress (user_id, station)
  VALUES (v_run.user_id, v_run.station)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'xp', v_xp, 'gold', v_gold, 'perfect', v_perfect);
END;
$$;

REVOKE ALL ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) TO authenticated;
```

### 3.7 Tabelas do Modo Evento (Fase 2)

Só criar na Fase 2, em `supabase-migration-vana-trilha-v2-evento.sql`. Espelhar
`vanacamp_sessions` / `vanacamp_players` / `vanacamp_events`:

- `vanatrilha_sessions` — `id, host_id, code (6 chars únicos), status ('lobby'|'question'|'reveal'|'finished'|'cancelled'), current_question_id, question_index, phase_started_at, phase_ends_at, config_json, winner_player_id, rewards_awarded, created_at, ended_at`
- `vanatrilha_players` — `id, session_id, user_id (nullable p/ equipas), team_name, avatar, position, streak, is_active, joined_at`
- `vanatrilha_answers` — `id, session_id, question_index, player_id, chosen_index, is_correct, answered_at` + `UNIQUE (session_id, question_index, player_id)`
- `vanatrilha_events` — log para o ecrã de projeção (igual a `vanacamp_events`)

Realtime: publicar **apenas** `vanatrilha_sessions`, `vanatrilha_events` e
`vanatrilha_players`. **Nunca** publicar `vanatrilha_answers` antes do reveal nem
qualquer tabela com `correct_index`.

---

## 4. Tipos TypeScript

Ficheiro: `types/vana-trilha.ts`. Convenção: snake_case nos campos vindos do Supabase.

```ts
export type VanaTrilhaCategory = 'personagens' | 'lugares' | 'numeros' | 'milagres' | 'versiculos'
export type VanaTrilhaDifficulty = 'facil' | 'media' | 'dificil'
export type VanaTrilhaRunStatus = 'playing' | 'completed' | 'failed'
export type VanaTrilhaTile = 'normal' | 'milagre' | 'tabuas' | 'elim' | 'mana' | 'nuvem' | 'serpente' | 'murmuracao'

export interface VanaTrilhaStation {
  id: number            // 1..7
  name: string          // "Mar Vermelho"
  reference: string     // "Êxodo 14"
  color: string         // token Tailwind: "blue"
  verse: string         // citação curta mostrada ao entrar na estação
}

/** Pergunta tal como chega ao CLIENTE — sem correct_index. */
export interface VanaTrilhaQuestionPublic {
  id: string
  station: number
  category: VanaTrilhaCategory
  difficulty: VanaTrilhaDifficulty
  prompt: string
  options: string[]     // sempre 4
}

/** Resultado de uma resposta, devolvido pela server action. */
export interface VanaTrilhaAnswerResult {
  correct: boolean
  correct_index: number
  explanation: string
  reference: string | null
  position: number
  lives: number
  correct_count: number
  status: VanaTrilhaRunStatus
  tile: VanaTrilhaTile          // casa onde o peão ficou
  next_question: VanaTrilhaQuestionPublic | null
}

export interface VanaTrilhaDailyRun {
  id: string
  user_id: string
  run_date: string
  station: number
  current_index: number
  position: number
  lives: number
  correct_count: number
  status: VanaTrilhaRunStatus
  rewards_awarded: boolean
  started_at: string
  finished_at: string | null
}

export const VANATRILHA_DAILY_LENGTH = 8
export const VANATRILHA_DAILY_LIVES = 3
export const VANATRILHA_BOARD_LENGTH = 32   // Modo Evento
```

Também em `types/vana-trilha.ts`: a constante `VANATRILHA_STATIONS: VanaTrilhaStation[]`
com as 7 estações da secção 2.2, incluindo a citação de cada uma.

Rótulos PT dos enums ficam em `utils/vana-trilha-labels.ts` (padrão do
`utils/vana-camp-labels.ts`).

---

## 5. Regras puras (`utils/vana-trilha.ts`)

Sem I/O, sem Supabase, sem React — só funções puras, fáceis de testar.

```ts
/** Casa especial (se houver) na posição `pos` da etapa diária da estação dada. */
export function dailyTileAt(station: number, pos: number): VanaTrilhaTile

/** Layout completo das 32 casas do Modo Evento (posição → tipo de casa). */
export function eventBoard(): VanaTrilhaTile[]

/** Bónus de casas por dificuldade no Modo Evento. */
export function difficultyBonus(d: VanaTrilhaDifficulty): number   // facil 0, media 1, dificil 2

/** Aplica o efeito de uma casa e devolve a nova posição + efeitos laterais. */
export function applyTileEffect(tile: VanaTrilhaTile, pos: number, board: VanaTrilhaTile[]): {
  position: number
  skip_next_round: boolean
  extra_roll: boolean
  bonus_gold: number
  immune_next_error: boolean
}

/** Lançamento de dado 1–6 (aceita rng injetável para testes). */
export function rollDie(rng?: () => number): number

/** Estação do dia — tem de coincidir exatamente com vanatrilha_station_of_day em SQL. */
export function stationOfDay(date: Date): number

/** Código de 6 chars para sessões do Modo Evento (sem 0/O/1/I/L). */
export function generateSessionCode(): string
```

> A distribuição das casas especiais é **determinista** (não aleatória): o mesmo
> `station` dá sempre o mesmo layout. Assim a explicação na página "Como Jogar"
> corresponde sempre ao que o jogador vê.

---

## 6. Server actions (`lib/actions/vana-trilha.ts`)

Ficheiro `'use server'`. Todas as escritas passam por `createServiceClient()` depois
de validarem o utilizador — o cliente nunca escreve diretamente nestas tabelas.

### 6.1 Modo Diário

```ts
/**
 * Devolve o estado do desafio de hoje para o utilizador autenticado.
 * Se ainda não existir corrida, NÃO cria — devolve o convite para começar.
 */
export async function getDailyState(): Promise<{
  run: VanaTrilhaDailyRun | null
  station: VanaTrilhaStation
  current_question: VanaTrilhaQuestionPublic | null
  already_played_today: boolean
  error?: string
}>

/**
 * Cria a corrida de hoje (idempotente: se já existir, devolve a existente).
 * Sorteia as 8 perguntas via RPC vanatrilha_daily_questions.
 */
export async function startDailyRun(): Promise<{
  run?: VanaTrilhaDailyRun
  current_question?: VanaTrilhaQuestionPublic
  error?: string
}>

/**
 * Submete a resposta à pergunta atual.
 * Validações obrigatórias (todas server-side):
 *   - corrida pertence ao utilizador e está 'playing'
 *   - questionIndex === run.current_index  (impede saltar ou repetir)
 *   - chosenIndex ∈ 0..3
 * Efeitos: atualiza position/lives/correct_count/answers/current_index/status,
 * aplica a casa especial se aplicável, e devolve a próxima pergunta.
 */
export async function answerDailyQuestion(
  runId: string,
  questionIndex: number,
  chosenIndex: number,
): Promise<VanaTrilhaAnswerResult & { error?: string }>

/** Chama o RPC award_vanatrilha_daily_rewards. Idempotente. */
export async function claimDailyRewards(runId: string): Promise<{
  ok?: boolean; xp?: number; gold?: number; perfect?: boolean; error?: string
}>

/** Estações já completadas + se a insígnia está desbloqueada. */
export async function getStationProgress(): Promise<{
  stations: number[]
  badge_unlocked: boolean
}>
```

### 6.2 Regra de ouro anti-batota

`correct_index` e `explanation` **só** saem do servidor dentro do
`VanaTrilhaAnswerResult`, isto é, depois de a resposta ter sido submetida. A
`VanaTrilhaQuestionPublic` que vai para o cliente não os contém. É o mesmo princípio
que o VanaCamp usa para a coluna `role` (ver a vista `vanacamp_players_public`).

Não guardar as perguntas completas em `localStorage`, nem passá-las como props do
Server Component para o Client Component com a resposta incluída.

### 6.3 Admin do banco de perguntas

```ts
export async function listQuestions(filter?: { station?: number; category?: string; difficulty?: string })
export async function createQuestion(input: {...})
export async function updateQuestion(id: string, patch: {...})
export async function toggleQuestionActive(id: string, active: boolean)
```
Todas com `requireHost()` (dirigente/coordenador).

### 6.4 Modo Evento (Fase 2)

`createSession`, `joinSessionByCode`, `startSession`, `nextQuestion`, `submitAnswer`,
`revealAndMove`, `finishSession`, `previewRewards`, `awardRewards`. Assinaturas e
padrões: copiar de `lib/actions/vana-camp.ts` (mesma estrutura de guardas, timers de
fase e log de eventos).

---

## 7. Rotas e componentes

```
app/jogos/vana-trilha/page.tsx                  Hub do jogo: escolher Diário ou Evento
app/jogos/vana-trilha/diario/page.tsx           Modo Diário (Server Component + client game)
app/jogos/vana-trilha/como-jogar/page.tsx       Página pública de explicação (secção 8)
app/admin/vana-trilha/page.tsx                  CRUD do banco de perguntas

— Fase 2 —
app/jogos/vana-trilha/[sessionId]/page.tsx          jogador
app/jogos/vana-trilha/[sessionId]/control/page.tsx  dirigente
app/jogos/vana-trilha/[sessionId]/present/page.tsx  projeção

components/vana-trilha/
  DailyGame.tsx           orquestra a corrida diária (client)
  TrailBoard.tsx          tabuleiro visual (8 casas no diário, 32 no evento)
  Pawn.tsx                peão animado entre casas
  QuestionCard.tsx        enunciado + 4 opções
  AnswerFeedback.tsx      certo/errado + explicação + referência
  LivesIndicator.tsx      3 corações
  StationHeader.tsx       nome da estação, cor, citação
  SpecialTileModal.tsx    efeito da casa especial
  RunSummary.tsx          resumo final + XP/Gold + partilha
  StationProgress.tsx     as 7 estações e quais já foram feitas
  VanaTrilhaHowToPlay.tsx modal reutilizável (mesmo conteúdo da página, secção 8.4)
```

### 7.1 Cartão no hub de jogos

Em `app/jogos/page.tsx`, acrescentar ao array `games` (antes do item `em-breve`):

```tsx
{
  id: 'vana-trilha',
  title: 'VanaTrilha',
  description: 'A Rota da Promessa. Desafio bíblico diário: do Egito à Terra Prometida.',
  icon: <img src="/images/VanaTrilha.png" alt="VanaTrilha" className="w-12 h-12 object-contain" />,
  href: '/jogos/vana-trilha',
  loginHref: '/login?redirect=/jogos/vana-trilha',
  color: 'from-amber-500 via-orange-600 to-yellow-500',
  status: 'Disponível',
  requiresAuth: true,
},
```

### 7.2 Notas de UI

- **Mobile-first, sempre.** Os desbravadores jogam no telemóvel. Botões de resposta
  com pelo menos 48px de altura, tabuleiro que cabe no ecrã sem scroll horizontal.
- O tabuleiro do Modo Diário é uma trilha de 8 casas: em telemóvel, disposição
  vertical ou em serpentina; em ecrã largo, horizontal.
- Animação do peão entre casas: curta (300–400ms). Nada que atrase o ritmo.
- Feedback de resposta: verde/vermelho imediatos, explicação a seguir, botão
  "Continuar" — nunca avançar automaticamente antes de a pessoa ler a explicação.
- Reaproveitar `components/ui/*` que já existem em vez de criar botões novos.

---

## 8. Ordem de trabalho: página pública "Como Jogar"

**Esta página é tão importante como o jogo.** Vai ser partilhada no grupo do clube
ao lado da imagem de anúncio, e é o que explica o jogo a quem não viu a imagem, a
quem não estava na reunião, e aos pais que perguntam o que é isto.

**Rota:** `/jogos/vana-trilha/como-jogar`

### 8.1 Requisitos não-negociáveis

1. **Funciona sem login.** Alguém que receba o link no WhatsApp tem de conseguir
   abrir e ler tudo, sem conta e sem redirecionamento.
   ⚠️ **Isto exige uma alteração no middleware** — ver 12.1. Sem isso, a página
   redireciona para `/login` e o anúncio não serve para nada.
2. **Mobile-first.** 90% vai abrir no telemóvel, muitos em ecrãs pequenos.
   Testar a 360px de largura.
3. **Linguagem para 10–15 anos.** Frases curtas. Zero jargão. Nada de "mecânica",
   "sessão", "XP acumulado por ronda". Se uma frase precisa de ser lida duas vezes,
   está mal escrita.
4. **Percebe-se sem ler tudo.** Alguém que só veja os títulos e as imagens tem de
   ficar a saber o essencial.
5. **Pré-visualização bonita quando o link é partilhado** (WhatsApp/Instagram):
   metadados Open Graph com título, descrição e a imagem de anúncio.

### 8.2 Estrutura da página (por ordem)

**a) Cabeçalho**
Logótipo VanaTrilha, o nome "VanaTrilha — A Rota da Promessa" e uma frase única:
*"Responde a perguntas da Bíblia e leva o teu peão do Egito até à Terra Prometida."*

**b) "O que é?" — 3 cartões lado a lado (empilhados no telemóvel)**
- 🎯 **O objetivo:** chegar ao fim da trilha.
- ❓ **Como avanças:** acertando nas perguntas.
- 🏆 **O que ganhas:** XP e Gold para gastares na loja.

**c) "Como se joga" — 4 passos numerados, cada um com um desenho/ícone**
1. Abre o VanaTrilha e carrega em **Começar Etapa**.
2. Aparece uma pergunta com 4 opções. Escolhe uma.
3. Se acertares, o teu peão **avança uma casa**. Se errares, **perdes uma vida**
   (tens 3) — e ficas a saber a resposta certa.
4. Chega ao fim das 8 casas e **completaste a etapa do dia**.

**d) Demonstração interativa** *(o ponto alto da página)*
Uma mini-trilha de 8 casas com um peão, e um botão "Ver como funciona" que anima:
peão avança 2 casas → erra uma → perde um coração → avança até ao fim → confetes.
Tudo local, sem base de dados, sem login. **Ver acontecer vale mais do que ler.**
Se o tempo apertar, começa por um GIF/sequência de 3 imagens estáticas — mas a
versão animada é a que faz a diferença.

**e) "Uma etapa nova todos os dias"**
Explicar em 2 frases: cada dia é uma parte diferente da viagem (as 7 estações,
mostradas como uma linha com os nomes), e **todos os desbravadores apanham a mesma
etapa no mesmo dia** — dá para comparar no grupo quem acertou mais.

**f) "As casas especiais"**
Cartões pequenos, com ícone, nome e uma linha cada: Milagre, Tábuas da Lei,
Fonte de Elim. (Só as do Modo Diário na Fase 1. Acrescentar as outras quando o
Modo Evento existir.)

**g) "O que ganhas"**
Tabela simples e honesta: etapa completa = 2 XP + 2 Gold; sem nenhum erro = 3 XP +
3 Gold. Uma linha a dizer que o Gold se gasta na loja do clube. E a insígnia
"Peregrino da Promessa" para quem completar as 7 estações.

**h) "Também dá para jogar em grupo"** *(só quando a Fase 2 existir)*
Dois parágrafos sobre o Modo Evento nas reuniões.

**i) Perguntas frequentes** (acordeão)
- *Posso jogar mais do que uma vez por dia?* Não — uma etapa por dia. Amanhã há outra.
- *E se errar tudo?* Perdes as vidas e a etapa do dia fica por completar, mas
  amanhã podes tentar outra vez. E ficas a saber as respostas certas.
- *Preciso de saber a Bíblia toda?* Não. As perguntas são de coisas que aprendes no
  clube, e no fim de cada uma aparece a explicação com o versículo.
- *Onde vejo o meu XP?* No teu perfil, no site do clube.

**j) Fecho**
Botão grande **"Jogar agora"** → `/jogos/vana-trilha`. Por baixo, em texto pequeno:
"Precisas de ter conta no site do clube. Fala com um dirigente se ainda não tens."

### 8.3 Metadados para partilha

```ts
export const metadata: Metadata = {
  title: 'Como jogar o VanaTrilha — Desbravadores de Abrantes',
  description: 'Responde a perguntas da Bíblia e leva o teu peão do Egito até à Terra Prometida. Uma etapa nova todos os dias.',
  openGraph: {
    title: 'VanaTrilha — A Rota da Promessa',
    description: 'O novo desafio bíblico diário do clube. Vê aqui como se joga.',
    images: ['/images/vanatrilha-anuncio.png'],
    type: 'website',
  },
}
```

### 8.4 Reutilização dentro do jogo

O conteúdo dos passos (8.2c), casas especiais (8.2f) e recompensas (8.2g) vive num
**único módulo** — `components/vana-trilha/how-to-play-content.tsx` — usado nos dois
sítios:
- a página pública `/jogos/vana-trilha/como-jogar`;
- o modal `VanaTrilhaHowToPlay.tsx` dentro do jogo (botão "Como Jogar", igual ao que
  o VANTUR já tem em `components/vantur/VanturHowToPlay.tsx`).

Escrever o texto duas vezes garante que um dia ficam diferentes. Não o faças.

---

## 9. Briefing da imagem de anúncio

Ficheiro final: `public/images/vanatrilha-anuncio.png` (e é também a imagem de
Open Graph da página Como Jogar).

**Formatos**
- Principal: **1080×1350** (feed/WhatsApp — o retrato lê-se melhor no telemóvel).
- Variante: **1080×1920** para stories, com o texto mais acima (o rodapé fica tapado
  pela interface do Instagram).

**Conteúdo visual**
- Fundo: um mapa/trilha antiga em tons de areia e dourado, com um caminho serpenteante
  do canto inferior esquerdo ao canto superior direito.
- Ao longo do caminho, 3 ou 4 marcos reconhecíveis: pirâmides (Egito), águas abertas
  (Mar Vermelho), uma montanha com nuvem (Sinai), palmeiras/uvas (Canaã).
- Um peão/marcador simpático a meio do caminho.
- Céu com estrelas ou coluna de fogo ao longe — dá a sensação de jornada.

**Texto (pouco e grande)**
- Topo: `NOVO JOGO NO SITE` (pequeno, maiúsculas, espaçado).
- Centro: **`VanaTrilha`** (muito grande) e por baixo `A Rota da Promessa`.
- Abaixo do caminho: `Um desafio bíblico novo todos os dias.`
- Rodapé: `Como se joga: desbravadoresabrantes.pt/jogos/vana-trilha/como-jogar`
  *(confirmar o domínio real antes de gerar)* + logótipo do clube.

**Cores**
Alinhar com o cartão do hub: âmbar/laranja/dourado (`amber-500` → `orange-600` →
`yellow-500`), texto em azul-escuro (`#1E3A5F`) ou creme sobre fundo escuro.

**Regras**
- Legível em miniatura: o nome do jogo tem de ler-se num thumbnail de 200px.
- Nada de parágrafos — quem quer detalhe vai à página Como Jogar. **A imagem serve
  para dar vontade; a página serve para explicar.**
- Sem marcas, sem logótipos de terceiros, sem fotografias de pessoas reais.

---

## 10. Plano de implementação

### Fase 1 — Modo Diário (singleplayer) · ENTREGÁVEL SOZINHA

Ordem sugerida. Cada passo deve compilar e correr antes do seguinte.

1. `types/vana-trilha.ts` + `utils/vana-trilha.ts` (regras puras) + `utils/vana-trilha-labels.ts`.
2. `supabase-setup-vana-trilha.sql` — tabelas, RLS, funções 3.5 e 3.6. Correr no
   Supabase e confirmar que `select public.vanatrilha_station_of_day(current_date);`
   devolve o esperado.
3. `supabase-seed-vana-trilha-questions.sql` — 105 perguntas (15 × 7 estações),
   com explicação e referência em todas.
4. `lib/actions/vana-trilha.ts` — as actions de 6.1 (sem o Modo Evento).
5. `app/admin/vana-trilha/page.tsx` — CRUD do banco de perguntas (para os dirigentes
   poderem corrigir e acrescentar sem mexer em SQL).
6. Componentes: `TrailBoard`, `Pawn`, `QuestionCard`, `AnswerFeedback`,
   `LivesIndicator`, `StationHeader`, `RunSummary`, `DailyGame`.
7. `app/jogos/vana-trilha/page.tsx` + `app/jogos/vana-trilha/diario/page.tsx`.
8. `app/jogos/vana-trilha/como-jogar/page.tsx` (secção 8) **+ a alteração no
   middleware (12.1)**.
9. Cartão no hub (`app/jogos/page.tsx`, ver 7.1) e logótipo `public/images/VanaTrilha.png`.
10. `StationProgress` + insígnia "Peregrino da Promessa".

### Fase 2 — Modo Evento (ao vivo)

11. `supabase-migration-vana-trilha-v2-evento.sql` (3.7).
12. Actions do Modo Evento (6.4), a partir do padrão do VanaCamp.
13. Ecrãs `[sessionId]` / `control` / `present`.
14. Prémios do Modo Evento + atribuição manual pelo dirigente.
15. Acrescentar a secção "jogar em grupo" à página Como Jogar (8.2h).

### Fase 3 — Polimento

16. Partilha do resultado diário (cartão de imagem, como o `VanaCampVictoryCard`).
17. Estatísticas pessoais: dias seguidos, total de etapas, média de acertos.
18. Sons discretos (acerto/erro/chegada), sempre com opção de desligar.

---

## 11. Critérios de aceitação (Fase 1)

Não dar a Fase 1 por concluída sem passar tudo isto:

- [ ] Sem login, `/jogos/vana-trilha/como-jogar` abre e lê-se toda, em ecrã de 360px.
- [ ] O link partilhado no WhatsApp mostra pré-visualização com imagem e descrição.
- [ ] Com login, começar a etapa do dia cria exatamente **uma** corrida; recarregar a
      página retoma no ponto certo (mesma pergunta, mesmas vidas, mesma posição).
- [ ] Abrir a mesma conta em dois dispositivos não permite jogar a etapa duas vezes.
- [ ] Em nenhum momento antes de responder o `correct_index` chega ao cliente
      (verificar no separador Network e no HTML do Server Component).
- [ ] Responder ao mesmo `questionIndex` duas vezes não altera nada (idempotente).
- [ ] Manipular o `chosenIndex` ou o `questionIndex` no cliente não dá pontos a mais.
- [ ] Etapa completa → `points_log` ganha **uma** linha; `profiles.total_xp` e
      `current_gold` sobem em conformidade.
- [ ] Chamar `claimDailyRewards` duas vezes não dá pontos a dobrar.
- [ ] 8/8 sem erros dá 3 XP + 3 Gold e mostra "Jornada Perfeita".
- [ ] Esgotar as 3 vidas fecha a corrida como `failed`, sem pontos, e o jogo diz
      claramente que amanhã há outra etapa.
- [ ] À meia-noite de Lisboa a etapa muda (testar com `run_date` forçada).
- [ ] Dois utilizadores diferentes no mesmo dia recebem a **mesma** estação e as
      **mesmas** 8 perguntas.
- [ ] Um `desbravador` não consegue ler `vanatrilha_questions` diretamente pelo
      cliente Supabase (a RLS bloqueia).
- [ ] Um `dirigente` consegue criar/editar perguntas no painel de admin.

---

## 12. Armadilhas deste repositório

### 12.1 O middleware bloqueia rotas públicas ⚠️

`utils/supabase/middleware.ts` redireciona **tudo** para `/login` quando não há
utilizador, exceto uma allowlist explícita (`/`, `/login`, `/auth`, `/leaderboard`,
`/shop`, `/contacts`, `/codes`, `/jogos/vana-quest`, `/embed`, qualquer `/present`,
e `/jogos` exato).

Para a página Como Jogar funcionar sem login, acrescentar à condição:

```ts
!request.nextUrl.pathname.startsWith('/jogos/vana-trilha/como-jogar') &&
```

Sem isto, o anúncio no grupo leva as pessoas a um ecrã de login — exatamente o
contrário do objetivo.

### 12.2 Fuso horário

O servidor (Vercel) corre em **UTC**; o clube vive em **Europe/Lisbon**. Calcular o
"dia de hoje" com `new Date().setHours(0,0,0,0)` no servidor dá o dia errado durante
a noite portuguesa. Calcular sempre a data assim:

```ts
const runDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())  // "2026-09-14"
```

Em SQL, usar `(now() AT TIME ZONE 'Europe/Lisbon')::date`. O VANTUR tem este problema
latente — não o repitas.

### 12.3 XP/Gold só via `points_log`

Nunca fazer `update profiles set total_xp = ...`. O trigger `on_points_log_change`
trata dos totais. Escrever em `profiles` diretamente dessincroniza tudo e o histórico
de pontos do desbravador fica com um buraco.

### 12.4 Não há runner de migrações

As migrações são ficheiros `.sql` soltos na raiz, corridos à mão no painel do
Supabase. Portanto: **tudo idempotente** (`CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`), e
cada ficheiro tem de poder correr duas vezes sem estragar nada.

### 12.5 Realtime vaza colunas

`ALTER PUBLICATION supabase_realtime ADD TABLE ...` publica a **linha inteira**,
incluindo colunas secretas. Foi por isso que o VanaCamp criou a vista
`vanacamp_players_public` e deixou `vanacamp_players` fora da publicação. Na Fase 2,
aplicar o mesmo raciocínio a tudo o que tenha `correct_index` ou respostas ainda não
reveladas.

### 12.6 `?redirect=` vs `?next=`

O repo usa os dois (`/login?redirect=...` no VANTUR e VanaWords, `/login?next=...` no
VanaCamp). Confirmar em `app/login/` qual é o parâmetro realmente respeitado e usar
esse — caso contrário o utilizador faz login e cai na página errada.

### 12.7 `.single()` rebenta

`.single()` lança exceção quando não há linha. Em tudo o que possa não existir
(corrida de hoje, perfil incompleto), usar `.maybeSingle()`.

### 12.8 Não existe `CLAUDE.md` no repo

As convenções estão só no código. As mais fiáveis são as da branch
`feature/VanaCamp-Infiltrados` — quando houver dúvida sobre como estruturar algo,
essa é a referência a copiar.

---

## 13. Fontes

Este documento foi escrito a partir da leitura direta do repositório:

- `app/jogos/page.tsx`, `app/jogos/vantur/page.tsx`, `components/vantur/VanturGame.tsx`,
  `components/vantur/VanturHowToPlay.tsx`
- `app/jogos/vana-quest/page.tsx`, `app/jogos/vana-words/page.tsx`
- Branch `feature/VanaCamp-Infiltrados`: `types/vana-camp.ts`, `utils/vana-camp.ts`,
  `utils/vana-camp-labels.ts`, `lib/actions/vana-camp.ts`,
  `supabase-setup-vana-camp.sql`, `supabase-migration-vana-camp-v2-test-mode.sql`
- `supabase-setup.sql` (tabela `points_log` e trigger `update_profile_totals`)
- `middleware.ts` e `utils/supabase/middleware.ts`
