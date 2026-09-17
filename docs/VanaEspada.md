# VanaEspada — A Espada do Espírito

**Especificação de construção para o Claude Code.**
Jogo #6 do Centro de Jogos dos Desbravadores de Abrantes.

> *"Tomai também o capacete da salvação e a espada do Espírito, que é a palavra de Deus."* — Efésios 6:17
> (citar na UI com `BibleReference`, não copiar o texto de outra tradução)

> **Como usar este documento:** lê-o de ponta a ponta antes de escrever código. As
> secções 1 a 7 são a *bíblia do jogo* (regras + arquitetura). A secção 9 é o plano
> faseado. **Começa pela Fase 1 e entrega-a sozinha.** A secção 11 tem armadilhas
> reais deste repositório (muitas herdadas do `docs/VanaTrilha.md`: lê essa secção 12
> também).

---

> ## Estado da implementação
> **Entregue: Fase 1 — Modo A "Onde Está?".** Base de dados, regras de pontuação com
> testes, ecrãs de jogador/anfitrião/projetor, banco de versículos no admin e registo
> no Centro de Jogos.
>
> **As Fases 2, 3 e 4 não vão ser feitas** (decisão do clube): nada de Modo B
> "Saca a Espada!", nada de baralhos, nada de desafio diário. As tabelas do Modo B
> (`vanaespada_drill_prompts`, `vanaespada_decks`, `vanaespada_deck_rounds`, e as
> colunas `found_at`/`chosen_index` das respostas) ficaram criadas no schema para
> não ser preciso migrar se algum dia se mudar de ideias, mas não têm código por
> trás. As secções 2.4, 2.5 e 8.2 deste documento ficam como registo da ideia.
>
> Uma diferença face ao que está escrito em 6.1: o painel do anfitrião mostra **as
> respostas de cada jogador** (não só quem respondeu), a pedido do clube. São
> servidas pela RPC `get_vanaespada_host_answers`, que a base de dados só devolve a
> quem é dono da sessão.

---

## 0. TL;DR

| | |
|---|---|
| **Nome** | VanaEspada: A Espada do Espírito |
| **Género** | Party game bíblico ao vivo (projetor + telemóveis), 2–60 jogadores |
| **Ideia original** | Do pastor: "ir buscar um versículo", ou seja, o clássico *sword drill* |
| **Modo A: "Onde Está?"** | Aparece um excerto de um versículo; cada um adivinha **livro → capítulo → versículo**. Pontos por **proximidade** (tipo GeoGuessr da Bíblia). **Fase 1.** |
| **Modo B: "Saca a Espada!"** | Aparece uma **referência**; todos procuram na **Bíblia física**; quem encontra carrega "Encontrei!" e responde a uma pergunta de verificação **independente da tradução**. **Fase 2.** |
| **Modo C: Diário** | "Onde Está?" com 1 versículo por dia, singleplayer. **Fase 3** (opcional). |
| **Rota base** | `/jogos/vana-espada` |
| **Prefixo BD** | `vanaespada_` |
| **Branch** | `feature/VanaEspada` (a partir de `master`) |
| **Convidados** | Sim, como no VanaQuest (JA com visitas). Convidados podem doar os pontos a uma conta. |

---

## 1. Contexto do repositório

### 1.1 Stack

- Next.js 16 (App Router, Server Components, Server Actions) + React 19 + TypeScript
- Supabase (Postgres + Auth + Realtime + RLS)
- Tailwind 4 + `@/components/ui/*` (shadcn-style) + `lucide-react` + `sonner` (toasts)
- Já instalados e úteis aqui: `canvas-confetti`, `qrcode.react`, `html-to-image` (cartões de partilha)
- Deploy: Vercel

### 1.2 O que copiar de cada jogo existente

| Jogo | Onde | O que aproveitar |
|---|---|---|
| **VanaQuest** | `app/jogos/vana-quest/`, `components/vana-quest/`, `lib/actions/vana-quest.ts`, `utils/vana-quest.ts` | **O esqueleto inteiro**: PIN (`generatePin`), `startSession`, `joinSession` com convidados, ecrãs `control` / `present` / `play`, `useLiveSession` (realtime + polling + refetch), pódio, `awardSessionPoints` + `calcSessionRewards`, doação de pontos de convidados (`rewards_recipient_id`). |
| **VanaCamp** | `lib/actions/vana-camp.ts`, `utils/vana-camp.ts`, `components/vana-camp/*` | **A melhor referência de arquitetura**: `types/` + `utils/` (regras puras) + `lib/actions/` (I/O), vistas/RPC públicas para não vazar segredos, timers de fase (`usePhaseCountdown`), `useWakeLock`, `usePresentationAudio`. |
| **VanaTrilha** | `components/vana-trilha/BibleReference.tsx`, `utils/bible-link.ts` | Links para a Bíblia Online, lista de livros com abreviaturas e normalização (`normalizeText`). |
| **Gestão de jogos** | `utils/games.ts`, `lib/actions/games.ts` | Registo do jogo no hub + disponibilidade por cargo (`game_settings`). |

### 1.3 Convenções de nomenclatura (respeitar à risca)

```
app/jogos/vana-espada/...                    rotas do jogo
app/admin/vana-espada/...                    banco de versículos e baralhos
components/vana-espada/*.tsx                 componentes
lib/actions/vana-espada.ts                   server actions ('use server')
types/vana-espada.ts                         tipos partilhados
utils/vana-espada.ts                         regras puras (pontuação), sem I/O
utils/vana-espada-labels.ts                  rótulos PT dos enums
utils/bible-books.ts                         estrutura da Bíblia (66 livros, capítulos, secções)
supabase-setup-vana-espada.sql               schema inicial (raiz do repo)
supabase-seed-vana-espada.sql                seed de referências + perguntas do Modo B
supabase-migration-vana-espada-vN-<assunto>.sql
public/images/VanaEspada.png                 logótipo
docs/VanaEspada.md                           este documento
```

Tabelas com prefixo **sem hífen** (`vanaespada_sessions`). Enums **em inglês na BD**,
traduzidos na UI por `utils/vana-espada-labels.ts`.

### 1.4 Autenticação, papéis e pontos

- `createClient()` (`@/utils/supabase/server`) respeita RLS; `createServiceClient()`
  (`@/utils/supabase/service`) bypassa RLS, **só em server actions**.
- Guardas `requireUser()` / `requireHost()` no topo das actions (copiar do VanaCamp).
  Anfitrião = `effectiveRole(profile)` ∈ `dirigente` | `coordenador`.
- **XP/Gold só via `points_log`**, nunca escrever em `profiles`.

---

## 2. O jogo

### 2.1 Conceito

O anfitrião abre uma sessão no computador ligado ao projetor e toda a gente entra
pelo telemóvel com um PIN (ou lendo o QR code do ecrã). Uma sessão tem **N rondas**
(default 10), e cada ronda é de um dos modos. Pode haver sessões só de "Onde Está?",
só de "Saca a Espada!" ou **mistas**.

No fim: pódio, confettis e prémios de XP/Gold atribuídos pelo anfitrião.

### 2.2 Estrutura da Bíblia usada no jogo

`utils/bible-books.ts` exporta os 66 livros por ordem canónica:

```ts
export type Testament = 'old' | 'new'
export type BibleSection =
  | 'law' | 'history' | 'poetry' | 'major_prophets' | 'minor_prophets'   // AT
  | 'gospels' | 'acts' | 'pauline' | 'general' | 'apocalyptic'           // NT

export interface BibleBook {
  id: number            // 1..66 (ordem canónica). É ISTO que se guarda na BD.
  name: string          // "Génesis" (PT-PT)
  abbr: string          // "Gn" (para a grelha do telemóvel)
  slug: string          // abreviatura da Bíblia Online, igual à de utils/bible-link.ts
  testament: Testament
  section: BibleSection
  chapters: number
}
```

Número de capítulos (versificação da Almeida):

| AT | | | | | |
|---|---|---|---|---|---|
| Gn 50 | Êx 40 | Lv 27 | Nm 36 | Dt 34 | Js 24 |
| Jz 21 | Rt 4 | 1Sm 31 | 2Sm 24 | 1Rs 22 | 2Rs 25 |
| 1Cr 29 | 2Cr 36 | Ed 10 | Ne 13 | Et 10 | Jó 42 |
| Sl 150 | Pv 31 | Ec 12 | Ct 8 | Is 66 | Jr 52 |
| Lm 5 | Ez 48 | Dn 12 | Os 14 | Jl 3 | Am 9 |
| Ob 1 | Jn 4 | Mq 7 | Na 3 | Hc 3 | Sf 3 |
| Ag 2 | Zc 14 | Ml 4 | | | |

| NT | | | | | |
|---|---|---|---|---|---|
| Mt 28 | Mc 16 | Lc 24 | Jo 21 | At 28 | Rm 16 |
| 1Co 16 | 2Co 13 | Gl 6 | Ef 6 | Fp 4 | Cl 4 |
| 1Ts 5 | 2Ts 3 | 1Tm 6 | 2Tm 4 | Tt 3 | Fm 1 |
| Hb 13 | Tg 5 | 1Pe 5 | 2Pe 3 | 1Jo 5 | 2Jo 1 |
| 3Jo 1 | Jd 1 | Ap 22 | | | |

Secções: `law` = Gn–Dt · `history` = Js–Et · `poetry` = Jó–Ct ·
`major_prophets` = Is–Dn · `minor_prophets` = Os–Ml · `gospels` = Mt–Jo ·
`acts` = At · `pauline` = Rm–Fm · `general` = Hb–Jd · `apocalyptic` = Ap.

**Número de versículos:** não há tabela de versículos por capítulo na Fase 1. O teclado
aceita 1–176 (o máximo da Bíblia, Sl 119). Se mais tarde se quiser limitar por
capítulo, gerar `utils/bible-verse-counts.ts` a partir de um dataset de versificação
Almeida (Fase 4).

Refatorar `utils/bible-link.ts` para reutilizar `slug` daqui é **opcional**. Não partir
o VanaTrilha por causa disso.

### 2.3 Modo A: "Onde Está?" (Fase 1)

**Fluxo de uma ronda**

1. **Projetor:** mostra o excerto em letra grande, com a tradução por baixo (ex.:
   "— Almeida"), e uma contagem decrescente (default **30 s**).
2. **Telemóvel:** o seletor de referência tem 3 passos:
   1. **Livro:** separadores AT / NT, com uma grelha de botões (`abbr`) coloridos por secção.
   2. **Capítulo:** grelha `1..chapters` com scroll (Salmos tem 150, não faz mal).
      Livros com 1 capítulo saltam este passo.
   3. **Versículo:** teclado numérico 0–9 com um visor, limitado a 1–176.
   - Botão **"Só sei o livro"**, disponível a partir do passo 2, que submete só o livro.
     É importante para os mais novos: jogam, pontuam e não bloqueiam.
   - Botão **"Confirmar"**. Depois de submeter, a resposta **não se altera**.
3. A ronda fecha quando **todos responderam** ou quando **acaba o tempo**.
4. **Revelação no projetor** (o momento alto do jogo):
   1. Uma **barra horizontal da Bíblia inteira**, com os 66 livros de largura
      proporcional ao nº de capítulos, AT e NT separados e cores por secção.
   2. Os avatares dos jogadores caem como "pins" no sítio onde apostaram (livro +
      capítulo), e uma estrela dourada marca a resposta certa.
   3. Zoom no livro certo, com os pins de quem acertou no livro distribuídos por capítulo.
   4. A referência certa em grande, com um QR code (`qrcode.react`) para
      `bibleOnlineUrl(ref)` para quem quiser ler o contexto.
5. **Telemóvel na revelação:** "+740 pts · Livro certo! Capítulo a 2 de distância" e a
   posição atual.
6. **Classificação:** top 5 com setas de subida/descida, e depois a ronda seguinte.

**Pontuação** (função pura em `utils/vana-espada.ts`, máx. **1000** por ronda)

```ts
export function scoreLocate(
  guess: { bookId: number; chapter: number | null; verse: number | null },
  answer: { bookId: number; chapter: number; verseStart: number; verseEnd: number },
  elapsedMs: number,
  timeLimitMs: number,
): { points: number; breakdown: LocateBreakdown }
```

| Componente | Regra | Máx. |
|---|---|---|
| **Livro** | Livro certo → 600 · mesma secção → 200 · mesmo testamento → 50 · senão 0 | 600 |
| **Capítulo** | Só se o livro estiver certo: `250 × max(0, 1 − |Δcap| / 10)` | 250 |
| **Versículo** | Só se o capítulo estiver certo: 100 se estiver dentro de `[verseStart, verseEnd]`, senão `100 × max(0, 1 − Δv / 10)`, com `Δv` = distância ao intervalo | 100 |
| **Rapidez** | Só se `livro > 0`: `50 × (1 − elapsed/limit)` | 50 |

- Arredondar ao inteiro. O `breakdown` guarda cada componente (é o que o telemóvel mostra).
- "Só sei o livro" → `chapter = verse = null` → apenas livro + rapidez.
- **Testes obrigatórios** (ficheiro `utils/vana-espada.test.ts`, correr com `bun test`):
  acerto perfeito = 1000 menos a rapidez em falta; livro errado da mesma secção = 200 +
  rapidez; Δcap ≥ 10 = 0 no capítulo; versículo dentro do intervalo (ex.: 1 Sm 17:45-47);
  livro de 1 capítulo (Judas); `null`s.

### 2.4 Modo B: "Saca a Espada!" (Fase 2)

A ideia do pastor na forma clássica, com as **Bíblias físicas** de cada um.

**O problema das traduções.** No JA cada um traz a sua Bíblia (ARC, ACF, NVI, ARA,
NTLH…). Uma pergunta como *"qual é a 4.ª palavra?"* tem respostas diferentes em cada
uma. **Todas as perguntas de verificação têm de ter a mesma resposta em qualquer
tradução**: quem fala, que animal/objeto/pessoa aparece, qual é o tema.

- ✅ Is 40:31 → "Os que esperam no Senhor são comparados a que ave?" → **Águia**
- ❌ Gn 6:14 → "De que madeira era a arca?" → "gofer" na ARC, "cipreste" noutrás. **Não usar.**

A UI de admin deve mostrar este aviso ao criar perguntas.

**Fluxo de uma ronda** (inspirado nos comandos tradicionais do *sword drill*)

1. **"Atenção!"** (estado `round_ready`, 3 s): o projetor pede as Bíblias **fechadas e
   levantadas**, e o telemóvel mostra "Prepara a tua espada…".
2. **Referência revelada** (continua em `round_ready`, 4 s): "**ISAÍAS 40:31**" em
   letra enorme, com o anfitrião a ler em voz alta. Ninguém abre ainda.
3. **"Avançar!"** (estado `round_active`): o som toca (`usePresentationAudio`), o
   cronómetro arranca (default **60 s**) e todos procuram.
4. **Telemóvel:** um botão gigante **"ENCONTREI!"**. Ao carregar, o servidor regista
   `found_at` e o telemóvel mostra a pergunta de verificação com 4 opções. A partir daí
   há **20 s** para responder (ou até a ronda acabar, o que vier primeiro).
5. **Projetor durante a ronda:** a contagem de quem já encontrou ("12/30 ⚔️") e os
   **3 primeiros** a encontrar, só com o nome (ainda sem saber se acertaram).
6. **Revelação:** a resposta certa, quem acertou por ordem de rapidez e o link/QR para o
   versículo. Opcional: o anfitrião pede ao 1.º para o **ler em voz alta**.

**Pontuação** (`scoreDrill` em `utils/vana-espada.ts`)

| Situação | Pontos |
|---|---|
| Carregou "Encontrei!" e acertou | `500 + 400 × (1 − foundElapsed/limit)` + bónus de pódio |
| Bónus de pódio (1.º / 2.º / 3.º a **acertar**, por `found_at`) | +100 / +60 / +30 |
| Carregou "Encontrei!" e **errou** | **−150** (desencoraja o "carrego já e adivinho") |
| Não respondeu a tempo depois do "Encontrei!" | −150 |
| Nunca carregou "Encontrei!" | 0 |

- O total da sessão nunca desce abaixo de 0 (`GREATEST(0, …)`), mas uma ronda pode
  ser negativa.
- O bónus de pódio é calculado **ao fechar a ronda**, não na submissão.
- Opção da sessão **"Só Bíblia física"** (`settings.physical_bible_only`, default `true`):
  é apenas um aviso no projetor e nos telemóveis ("Telemóveis só para responder!").
  Não há como impor isto tecnicamente, fica à honra de cada um. Com a opção desligada,
  vale usar uma app da Bíblia (útil em sessões online).

### 2.5 Sessões mistas e baralhos

- O anfitrião cria a sessão escolhendo:
  - **Baralho** (lista ordenada de rondas preparada no admin, como os quizzes do VanaQuest), **ou**
  - **Sessão rápida**: `N` rondas (5/10/15), modo (`locate` | `drill` | `mixed`) e
    dificuldade (`easy` | `medium` | `hard` | `any`). O servidor sorteia versículos
    ativos sem repetir e, se possível, evita os usados nas últimas 3 sessões do anfitrião.
- Ao **iniciar** a sessão, as rondas são copiadas para `vanaespada_session_rounds`
  (um snapshot). Editar o banco a meio não afeta sessões em curso.
- No modo `mixed`, alternar `locate` e `drill`, sem nunca repetir o mesmo versículo.

### 2.6 Máquina de estados da sessão

```
lobby ──start──▶ round_ready ──(auto 7s | só drill)──▶ round_active
   ▲                 ▲                                      │
   │                 │                          todos responderam / tempo
   │                 │                                      ▼
   │           next ─┴──────── leaderboard ◀──next──── round_reveal
   │                                │
   │                          (última ronda)
   │                                ▼
   └──(nova sessão)            finished ──▶ awardSessionPoints (anfitrião)
```

- No modo `locate`, `round_ready` dura só **2 s** ("Ronda 3/10") e passa para `round_active`.
- Todas as transições são **condicionais e idempotentes**:
  `UPDATE … SET status='round_reveal' WHERE id=$1 AND status='round_active' AND current_round=$2`.
  Tanto o projetor (quando o timer chega a 0) como o painel do anfitrião como o
  "todos responderam" podem pedir a transição. Ganha o primeiro e os outros não fazem nada.
- O anfitrião pode sempre forçar: **Revelar já**, **Saltar ronda**, **Terminar sessão**.

---

## 3. Modelo de dados (`supabase-setup-vana-espada.sql`)

Tudo idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).

### 3.1 Banco de versículos

```sql
CREATE TABLE IF NOT EXISTS public.vanaespada_verses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id smallint NOT NULL CHECK (book_id BETWEEN 1 AND 66),
  chapter smallint NOT NULL CHECK (chapter >= 1),
  verse_start smallint NOT NULL CHECK (verse_start >= 1),
  verse_end smallint NOT NULL,
  excerpt text,                     -- necessário para o Modo A; NULL = só serve para o Modo B
  translation text,                 -- ex.: 'Almeida' (mostrado no projetor)
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  tags text[] NOT NULL DEFAULT '{}',-- ex.: {'memorização','desbravadores','profecia'}
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanaespada_verse_range CHECK (verse_end >= verse_start)
);

-- Perguntas de verificação do Modo B (0..n por versículo)
CREATE TABLE IF NOT EXISTS public.vanaespada_drill_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verse_id uuid NOT NULL REFERENCES public.vanaespada_verses(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  options text[] NOT NULL CHECK (cardinality(options) = 4),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

A validação `chapter <= chapters(book_id)` faz-se na server action, com `utils/bible-books.ts`.

### 3.2 Baralhos

```sql
CREATE TABLE IF NOT EXISTS public.vanaespada_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vanaespada_deck_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.vanaespada_decks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('locate','drill')),
  verse_id uuid NOT NULL REFERENCES public.vanaespada_verses(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.vanaespada_drill_prompts(id) ON DELETE CASCADE,
  time_seconds integer,             -- NULL = default do modo (30 / 60)
  CONSTRAINT vanaespada_drill_needs_prompt CHECK (kind <> 'drill' OR prompt_id IS NOT NULL)
);
```

### 3.3 Sessões, rondas, jogadores e respostas

```sql
CREATE TABLE IF NOT EXISTS public.vanaespada_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id uuid REFERENCES public.vanaespada_decks(id) ON DELETE SET NULL,
  pin text NOT NULL,
  status text NOT NULL DEFAULT 'lobby'
    CHECK (status IN ('lobby','round_ready','round_active','round_reveal','leaderboard','finished')),
  current_round integer NOT NULL DEFAULT -1,
  total_rounds integer NOT NULL DEFAULT 0,
  current_kind text CHECK (current_kind IN ('locate','drill')),  -- público: a UI sabe que ecrã mostrar
  phase_started_at timestamptz,
  phase_ends_at timestamptz,        -- fonte de verdade dos timers (clientes só fazem countdown)
  answered_count integer NOT NULL DEFAULT 0,  -- atualizado pelo servidor; o projetor mostra "12/30"
  found_count integer NOT NULL DEFAULT 0,     -- Modo B
  settings jsonb NOT NULL DEFAULT '{"physical_bible_only": true}',
  points_awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
-- PIN único só entre sessões não terminadas
CREATE UNIQUE INDEX IF NOT EXISTS vanaespada_sessions_pin_live
  ON public.vanaespada_sessions (pin) WHERE status <> 'finished';

-- SNAPSHOT das rondas. CONTÉM A RESPOSTA → nunca publicar em realtime, nunca SELECT direto.
CREATE TABLE IF NOT EXISTS public.vanaespada_session_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE,
  round_index integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('locate','drill')),
  book_id smallint NOT NULL,
  chapter smallint NOT NULL,
  verse_start smallint NOT NULL,
  verse_end smallint NOT NULL,
  excerpt text,
  translation text,
  prompt text,
  options text[],
  correct_index smallint,
  time_seconds integer NOT NULL,
  started_at timestamptz,
  closed_at timestamptz,
  UNIQUE (session_id, round_index)
);

CREATE TABLE IF NOT EXISTS public.vanaespada_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_guest boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  avatar_url text,
  total_points integer NOT NULL DEFAULT 0,
  last_round_points integer,        -- para as setas da classificação
  rewards_recipient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now()
);

-- NÃO publicar em realtime (palpites dos outros não devem vazar durante a ronda)
CREATE TABLE IF NOT EXISTS public.vanaespada_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.vanaespada_session_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.vanaespada_players(id) ON DELETE CASCADE,
  -- Modo A
  guess_book smallint,
  guess_chapter smallint,
  guess_verse smallint,
  -- Modo B
  found_at timestamptz,
  chosen_index smallint,
  -- Comum
  elapsed_ms integer,               -- CALCULADO NO SERVIDOR (ver 6.2)
  is_correct boolean,
  points integer NOT NULL DEFAULT 0,
  breakdown jsonb,
  answered_at timestamptz,
  UNIQUE (round_id, player_id)
);
```

### 3.4 RLS e vistas públicas

- `vanaespada_verses`, `vanaespada_drill_prompts`, `vanaespada_decks`, `vanaespada_deck_rounds`:
  SELECT/escrita só para `get_my_role() IN ('dirigente','coordenador')`.
- `vanaespada_sessions`, `vanaespada_players`: SELECT público (o projetor e os
  convidados precisam deles). Escrita **só via service role** nas actions.
- `vanaespada_session_rounds`, `vanaespada_answers`: **sem SELECT para `anon`/`authenticated`.**
  Acesso só por service role ou por RPC `SECURITY DEFINER`:

```sql
-- Devolve a ronda atual SEM a resposta enquanto não for revelada.
CREATE OR REPLACE FUNCTION public.get_vanaespada_round_public(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'round_index', r.round_index,
    'kind', r.kind,
    'time_seconds', r.time_seconds,
    'excerpt', CASE WHEN r.kind = 'locate' THEN r.excerpt END,
    'translation', r.translation,
    -- No Modo B a referência é pública desde o round_ready
    'reference', CASE WHEN r.kind = 'drill' OR s.status IN ('round_reveal','leaderboard','finished')
                      THEN jsonb_build_object('book_id', r.book_id, 'chapter', r.chapter,
                                              'verse_start', r.verse_start, 'verse_end', r.verse_end) END,
    'prompt', CASE WHEN r.kind = 'drill' THEN r.prompt END,
    'options', CASE WHEN r.kind = 'drill' THEN r.options END,
    'correct_index', CASE WHEN s.status IN ('round_reveal','leaderboard','finished') THEN r.correct_index END
  )
  FROM vanaespada_sessions s
  JOIN vanaespada_session_rounds r ON r.session_id = s.id AND r.round_index = s.current_round
  WHERE s.id = p_session_id;
$$;
```

> Nota: no Modo B as `options` são públicas durante a ronda, o que não faz mal (sem
> `correct_index` não servem de nada). Se se quiser esconder as opções até ao
> "Encontrei!", servi-las pela action `markFound` em vez desta RPC.

Uma RPC semelhante, `get_vanaespada_reveal(p_session_id)`, devolve os palpites de todos
(nome, avatar, livro, capítulo, pontos) **só quando `status = 'round_reveal'`**, para
os pins do projetor.

### 3.5 Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanaespada_sessions;  -- sem segredos
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanaespada_players;   -- sem segredos
-- NUNCA: vanaespada_session_rounds, vanaespada_answers
```

Envolver em `DO $$ … EXCEPTION WHEN duplicate_object …` para ser idempotente.

---

## 4. Tipos (`types/vana-espada.ts`)

```ts
export type EspadaKind = 'locate' | 'drill'
export type EspadaStatus = 'lobby' | 'round_ready' | 'round_active' | 'round_reveal' | 'leaderboard' | 'finished'
export type EspadaDifficulty = 'easy' | 'medium' | 'hard'

export interface EspadaReference { bookId: number; chapter: number; verseStart: number; verseEnd: number }

export interface EspadaSession {
  id: string; pin: string; status: EspadaStatus
  currentRound: number; totalRounds: number; currentKind: EspadaKind | null
  phaseStartedAt: string | null; phaseEndsAt: string | null
  answeredCount: number; foundCount: number
  settings: { physical_bible_only: boolean }
}

export interface EspadaPublicRound {
  roundIndex: number; kind: EspadaKind; timeSeconds: number
  excerpt?: string; translation?: string
  reference?: EspadaReference
  prompt?: string; options?: string[]; correctIndex?: number
}

export interface LocateBreakdown { book: number; chapter: number; verse: number; speed: number; bookMatch: 'exact' | 'section' | 'testament' | 'none'; chapterDelta: number | null }
export interface DrillBreakdown { base: number; speed: number; podium: number; penalty: number }
```

Mapear `snake_case` ↔ `camelCase` num só sítio (`toEspadaSession(row)`).

---

## 5. Regras puras (`utils/vana-espada.ts`)

Sem I/O, 100% testáveis:

- `scoreLocate(...)`: secção 2.3
- `scoreDrill({ correct, foundElapsedMs, limitMs, podiumPlace })`: secção 2.4
- `podiumBonus(place: 1 | 2 | 3 | null)`
- `formatReference(ref)` → `"1 Samuel 17:45-47"` (usa `utils/bible-books.ts`)
- `pickRounds(pool, { count, kind, difficulty, excludeVerseIds })` com um RNG injetável
  (para testes deterministas)
- `calcEspadaRewards(totalPoints, topPoints)`: **reutiliza `calcSessionRewards` do
  VanaQuest com os pontos a dividir por 100**. Uma ronda vale até ~1000 pontos, enquanto
  no VanaQuest vale ~10; sem esta escala toda a gente batia no limite de 500 Gold.

---

## 6. Server actions (`lib/actions/vana-espada.ts`)

### 6.1 Lista

| Action | Quem | O que faz |
|---|---|---|
| `createSession({ deckId? , quick? })` | anfitrião | Gera o PIN (copiar `generatePin` do VanaQuest para `utils/pin.ts` e reutilizar nos dois), cria a sessão e o snapshot das rondas, e devolve o `id`. Falha se não houver versículos suficientes (Modo A exige `excerpt`, Modo B exige prompt ativo). |
| `joinSession(pin, guestName, avatar?)` | todos | Como no VanaQuest: com conta usa o `user_id`, sem conta é convidado. Só entra se `status <> 'finished'`. Guarda o `playerId` em `localStorage` por sessão (com try/catch). |
| `startGame(sessionId)` | anfitrião | `lobby → round_ready` da ronda 0. |
| `beginRound(sessionId, roundIndex)` | sistema | `round_ready → round_active`. Define `started_at`, `phase_ends_at = now() + time_seconds` e zera os contadores. |
| `submitLocate(sessionId, playerId, roundIndex, { bookId, chapter, verse })` | jogador | Ver 6.2. |
| `markFound(sessionId, playerId, roundIndex)` | jogador | Modo B: grava `found_at = now()` (só uma vez) e incrementa `found_count`. |
| `submitDrill(sessionId, playerId, roundIndex, chosenIndex)` | jogador | Modo B: exige `found_at` e resposta até `found_at + 20 s` (com 1,5 s de tolerância). |
| `closeRound(sessionId, roundIndex)` | anfitrião / projetor | Transição condicional para `round_reveal`, calcula os bónus de pódio e as penalizações por falta de resposta, e atualiza `total_points` e `last_round_points`. **Tudo numa função SQL** (`vanaespada_close_round`) para ser atómico. |
| `showLeaderboard` / `nextRound` / `finishSession` | anfitrião | Transições condicionais. |
| `getRoundProgress(sessionId)` | anfitrião | Para o painel: quem respondeu e quem não (sem as respostas). |
| `awardSessionPoints(sessionId)` | anfitrião | Ver 6.3. |
| `setRewardsRecipient` / `skipRewards` / `kickPlayer` / `deleteSession` | como no VanaQuest | |
| Admin: `upsertVerse`, `deleteVerse`, `upsertDrillPrompt`, `upsertDeck`, `reorderDeckRounds` | dirigentes | Validação com `zod` e `utils/bible-books.ts`. |

### 6.2 Regra de ouro anti-batota

- **O tempo é medido no servidor.** `elapsed_ms = now() − round.started_at`.
  ⚠️ O VanaQuest **confia no `elapsedMs` do cliente**: **não copiar isso.**
- Rejeitar se `status <> 'round_active'`, se `roundIndex <> current_round` ou se
  `now() > phase_ends_at + 1.5s`.
- A pontuação é calculada no servidor. O cliente nunca envia pontos.
- A resposta certa nunca sai do servidor antes de `round_reveal` (RPC da 3.4).
- A idempotência é garantida pelo `UNIQUE (round_id, player_id)`, com o mesmo
  tratamento de duplicados que o `submitAnswer` do VanaQuest.
- Depois de gravar a resposta, `answered_count = answered_count + 1` num UPDATE atómico.
  Se `answered_count >= nº de jogadores`, chamar `closeRound` (a transição condicional
  trata as corridas).

### 6.3 Prémios

Igual ao `awardSessionPoints` do VanaQuest, com uma melhoria: **trancar primeiro**,

```ts
const { data: locked } = await service
  .from('vanaespada_sessions')
  .update({ points_awarded_at: new Date().toISOString() })
  .eq('id', sessionId).is('points_awarded_at', null)
  .select('id').maybeSingle()
if (!locked) return { ok: true, alreadyAwarded: true }
```

e só depois inserir no `points_log`. Assim dois cliques ao mesmo tempo não pagam duas
vezes. Descrição: `VanaEspada — 7 340 pts` (ou `(doado por <nome>)`).

---

## 7. Rotas e componentes

```
app/jogos/vana-espada/page.tsx                    entrar com PIN · botão "Criar sessão" (anfitriões)
app/jogos/vana-espada/nova/page.tsx               escolher baralho ou sessão rápida (anfitriões)
app/jogos/vana-espada/[sessionId]/play/page.tsx   telemóvel do jogador
app/jogos/vana-espada/[sessionId]/control/page.tsx painel do anfitrião
app/jogos/vana-espada/[sessionId]/present/page.tsx projetor (16:9, sem navbar)
app/jogos/vana-espada/como-jogar/page.tsx         página pública (Fase 2)
app/admin/vana-espada/page.tsx                    banco de versículos + perguntas
app/admin/vana-espada/baralhos/[deckId]/page.tsx  editor de baralho (dnd-kit, como SortableQuestionList)
```

Componentes (`components/vana-espada/`):

- `useEspadaSession.ts`: cópia adaptada do `useLiveSession` do VanaQuest (realtime +
  polling de 2,5 s + refetch em foco/online). Ao mudar `current_round` ou `status`,
  volta a chamar `get_vanaespada_round_public`.
- `useCountdown(phaseEndsAt)`: calcula a partir do relógio do servidor. Fazer um *offset*
  simples com a hora devolvida por `joinSession` para compensar telemóveis com a hora errada.
- `ReferencePicker.tsx`: os 3 passos da secção 2.3. Botões com ≥ 44 px e cores por
  secção (definir em `theme.ts`, com contráste AA).
- `BibleBar.tsx`: a barra de 66 livros em SVG com pins (projetor). Larguras
  proporcionais a `chapters`. Animação dos pins a cair com um *stagger* de 40 ms, até
  60 pins.
- `BookZoom.tsx`: capítulos do livro certo com pins.
- `DrillScreen.tsx`: botão "ENCONTREI!" e depois as 4 opções (cores/formas como no VanaQuest).
- `DrillStage.tsx`: projetor com "Atenção!" → referência → "Avançar!".
- `Leaderboard.tsx`, `Podium.tsx` (confettis) e `WinnersShareCard.tsx` (`html-to-image`,
  como no VanaWords).
- `JoinQr.tsx`: QR com `/jogos/vana-espada?pin=XXXXXX` no lobby do projetor.
- Usar `useWakeLock` do VanaCamp no telemóvel e no projetor.

### 7.1 Cartão no hub (`utils/games.ts`)

```ts
{
  id: 'vana-espada',
  title: 'VanaEspada',
  description: 'Onde está este versículo? Saca a tua Bíblia e sê o mais rápido do JA!',
  image: '/images/VanaEspada.png',
  href: '/jogos/vana-espada',
  loginHref: '/jogos/vana-espada',
  adminHref: '/admin/vana-espada',
  color: 'from-slate-800 via-sky-800 to-amber-400',
  requiresAuth: false,
  adminCoordOnly: false,
},
```

### 7.2 Notas de UI

- Português de Portugal ("telemóvel", "ecrã", "carregar").
- O projetor tem de ser legível ao fundo de um salão: excerto ≥ 48 px e referência ≥ 96 px.
- O telemóvel não pode depender de scroll para o botão principal.
- Som: tique nos últimos 5 s, "espadas" no "Avançar!" e fanfarra na revelação, com um
  botão de mute no controlo.
- Nunca mostrar no projetor os pontos negativos individuais do Modo B: fica
  "Tenta outra vez! 💪". O detalhe aparece só no telemóvel.

---

## 8. Conteúdo inicial (`supabase-seed-vana-espada.sql`)

### 8.1 Direitos de autor ⚠️

Os excertos do Modo A são texto de uma tradução concreta. Antes de os pôr na base de
dados:

- confirmar com a editora da tradução usada pelo clube que usos são permitidos (a ACF,
  que a Bíblia Online usa, e as ARC/ARA/NVI têm direitos de autor);
- manter os excertos **curtos** (uma frase, não capítulos inteiros);
- mostrar sempre a tradução no projetor (`translation`).

Por isso **o seed não traz excertos**. A liderança escreve-os no admin, a partir da
tradução escolhida. O seed traz as referências e as perguntas do Modo B, que não
reproduzem texto bíblico.

### 8.2 Perguntas do Modo B (independentes da tradução)

Seed inicial. A 1.ª opção é a correta; o seed deve baralhá-las e gravar o `correct_index`.

| Referência | Dif. | Pergunta | Opções (✔ primeiro) |
|---|---|---|---|
| Génesis 1:1 | easy | O que criou Deus no princípio? | Os céus e a terra · Os animais · O homem · O jardim do Éden |
| Êxodo 14:14 | medium | O que fará o Senhor por vós? | Pelejará · Dará comida · Abrirá o mar · Enviará chuva |
| Êxodo 20:8 | easy | Que dia devemos lembrar? | O sábado · O primeiro dia · O dia da Páscoa · O dia do nosso nascimento |
| Números 22:28 | medium | Que animal falou? | Uma jumenta · Uma serpente · Um cavalo · Um camelo |
| Josué 1:9 | easy | Como Deus manda Josué ser? | Forte e corajoso · Rico e famoso · Calado e paciente · Alto e forte |
| 1 Samuel 17:45 | medium | Quem está a falar? | David · Golias · Saul · Samuel |
| Salmos 23:1 | easy | Com quem é comparado o Senhor? | Um pastor · Um rei · Um pai · Uma rocha |
| Salmos 119:105 | medium | A Palavra de Deus é lâmpada para quê? | Para os pés · Para as mãos · Para os olhos · Para a casa |
| Provérbios 3:5 | medium | Em que NÃO nos devemos apoiar? | No nosso próprio entendimento · Nos amigos · No dinheiro · Nos pais |
| Isaías 40:31 | easy | Os que esperam no Senhor são comparados a que ave? | Águia · Pomba · Pardal · Corvo |
| Jeremias 29:11 | medium | Que pensamentos tem Deus a nosso respeito? | De paz · De castigo · De tristeza · De dúvida |
| Daniel 6:22 | medium | Quem fechou a boca dos leões? | Um anjo · O rei Dario · O próprio Daniel · Os guardas |
| Miqueias 6:8 | hard | Qual destas coisas o Senhor pede? | Andar humildemente com Deus · Oferecer muitos sacrifícios · Jejuar todos os dias · Construir um templo |
| Mateus 5:13 | easy | A que são comparados os discípulos? | Sal · Pão · Água · Pedras |
| Mateus 6:33 | easy | O que devemos buscar primeiro? | O Reino de Deus · Riqueza · Sabedoria · Amigos |
| Lucas 2:7 | easy | Onde foi deitado o menino Jesus? | Numa manjedoura · Num berço · Num barco · Numa cama |
| João 3:16 | easy | O que recebe quem crê no Filho? | A vida eterna · Riquezas · Um reino na terra · Saúde perfeita |
| João 11:35 | easy | O que fez Jesus? | Chorou · Riu · Orou · Dormiu |
| Atos 2:4 | medium | Cheios do Espírito Santo, começaram a falar em quê? | Outrás línguas · Parábolas · Hebraico antigo · Silêncio |
| Efésios 6:17 | medium | Qual é a espada do Espírito? | A Palavra de Deus · A fé · A oração · A verdade |
| Filipenses 4:13 | easy | Por meio de quem tudo posso? | Cristo · Os anjos · Os apóstolos · Moisés |
| 1 João 1:9 | medium | Se confessarmos os nossos pecados, o que faz Deus? | Perdoa-nos · Esquece-se de nós · Castiga-nos · Nada |
| Apocalipse 14:6 | hard | O que tem o anjo que voa pelo meio do céu? | O evangelho eterno · Uma trombeta · Uma espada · Um livro selado |

**Antes de publicar**, um dirigente deve confirmar cada linha numa Bíblia física (é
rápido e evita surpresas).

### 8.3 Sugestões para o Modo A

Começar com ~30 versículos conhecidos (Sl 23:1, Jo 3:16, Fp 4:13, Pv 3:5-6, Is 40:31,
Js 1:9, Mt 28:19-20, Rm 8:28, Ap 14:6-7, Êx 20:8-11, Gn 1:1, 1 Co 13:4…), com
dificuldade `easy`. Depois ir juntando os versos de memória das classes dos
Desbravadores (tag `desbravadores`), que torna o jogo um treino real das classes.

---

## 9. Plano de implementação

### Fase 1: "Onde Está?" ao vivo · ENTREGÁVEL SOZINHA

1. `utils/bible-books.ts` + testes.
2. `utils/vana-espada.ts` (`scoreLocate`, `pickRounds`, `formatReference`,
   `calcEspadaRewards`) + testes.
3. `supabase-setup-vana-espada.sql` (todas as tabelas, incluindo as do Modo B, para não
   precisar de migração depois) + RPCs + RLS + realtime.
4. Admin: CRUD de versículos (só os campos do Modo A) e sessão rápida (ainda sem baralhos).
5. Actions: `createSession`, `joinSession`, `startGame`, `beginRound`, `submitLocate`,
   `closeRound`, `nextRound`, `finishSession`, `awardSessionPoints`, `kickPlayer`, `deleteSession`.
6. Ecrãs `play` / `control` / `present` com o `ReferencePicker`, a `BibleBar`, o
   `BookZoom`, a classificação e o pódio.
7. Entrada em `utils/games.ts`, middleware (11.1) e logótipo.
8. **Teste de campo:** um JA real com 15 ou mais telemóveis, antes de avançar.

### Fase 2: "Saca a Espada!" + baralhos

1. Admin de perguntas do Modo B (com o aviso das traduções) + seed da secção 8.2.
2. `markFound`, `submitDrill` e a parte do Modo B em `vanaespada_close_round`.
3. `DrillStage` / `DrillScreen` + sons.
4. Baralhos (editor com dnd-kit) e sessões mistas.
5. Página pública "Como Jogar" (seguir a estrutura do `docs/VanaTrilha.md` §8).

### Fase 3: Desafio diário (singleplayer, opcional)

- "Onde Está?" com 1 versículo por dia, igual para todos (escolha determinista pela data
  em `Europe/Lisbon`, como no VanaTrilha §3.5).
- Tabela `vanaespada_daily_runs (user_id, run_date, guess…, points)` com
  `UNIQUE(user_id, run_date)`, e prémio pequeno e idempotente via RPC.
- Cartão de partilha ("📖 Livro ✅ Capítulo ✅ Versículo ❌ · 950 pts").

### Fase 4: Polimento

- Contagem de versículos por capítulo (limitar o teclado).
- Modo equipas (a pontuação da equipa é a média dos seus membros).
- Estatísticas no admin: os versículos que mais falham, para ajudar a escolher os
  versos de memória.

---

## 10. Critérios de aceitação (Fase 1)

- [ ] Um dirigente cria uma sessão rápida de 10 rondas em menos de 3 cliques depois de entrar.
- [ ] Um convidado sem conta entra pelo QR do projetor e joga até ao fim.
- [ ] Durante a ronda, **nenhuma resposta** aparece nas respostas de rede do telemóvel nem do projetor (verificar no DevTools → Network/WS).
- [ ] Mudar a hora do telemóvel não dá mais pontos.
- [ ] Carregar "Confirmar" duas vezes (ou reenviar o pedido) não duplica pontos.
- [ ] Com o projetor e o controlo abertos, o timer a chegar a 0 revela a ronda **uma só vez**.
- [ ] Um telemóvel que perde a rede 20 s volta ao ecrã certo sozinho.
- [ ] A revelação mostra os pins de todos e a estrela na resposta certa.
- [ ] "Só sei o livro" funciona e pontua só o livro (+ rapidez).
- [ ] Os prémios só são atribuídos uma vez, mesmo com duplo clique, e os convidados podem doar.
- [ ] Desativar o jogo em Gestão → Jogos bloqueia `/jogos/vana-espada/*` (exceto `/present`, como os outros).
- [ ] `bun test` passa.

---

## 11. Armadilhas deste repositório

### 11.1 Middleware

`utils/supabase/middleware.ts` manda para `/login` tudo o que não está na allowlist.
Como o jogo aceita convidados, acrescentar:

```ts
!request.nextUrl.pathname.startsWith('/jogos/vana-espada') &&
```

As páginas de anfitrião (`/nova`, `/control`) têm de verificar o login **na própria
página** (redirecionar para `/login?next=…`), porque o middleware já não o faz por elas.
Confirmar em `app/login/` que o parâmetro respeitado é `next`.

### 11.2 Tempo

- Usar `phase_ends_at` do servidor e nunca `setTimeout` como fonte de verdade.
- Datas "de hoje" (Fase 3) sempre em `Europe/Lisbon` (ver VanaTrilha §12.2).

### 11.3 Realtime

- Nunca publicar tabelas com respostas (VanaTrilha §12.5).
- O realtime perde eventos sob carga, por isso usar **sempre** o padrão
  realtime + polling do `useLiveSession`.
- Um canal por sessão, estável; não o recriar quando muda a ronda.

### 11.4 Pontos

- Só via `points_log` (VanaTrilha §12.3).
- Escalar os pontos antes de converter em Gold (secção 5).

### 11.5 Migrações

Ficheiros `.sql` soltos, corridos à mão no Supabase: **tudo idempotente**.

### 11.6 `.single()` vs `.maybeSingle()`

Usar `.maybeSingle()` em tudo o que pode não existir (jogador expulso, sessão apagada).

### 11.7 Jó vs João

`bible-link.ts` distingue "Jó" de "Jo(ão)" só pelo acento. Na BD usa-se sempre
`book_id` (1–66), nunca texto.

---

## 12. Fontes

Escrito a partir da leitura direta do repositório: `utils/games.ts`,
`app/jogos/page.tsx`, `lib/actions/vana-quest.ts`, `utils/vana-quest.ts`,
`components/vana-quest/useLiveSession.ts`, `supabase-setup-vana-quest.sql`,
`supabase-setup-vana-words.sql`, `utils/bible-link.ts`,
`components/vana-trilha/BibleReference.tsx`, `utils/supabase/middleware.ts`,
`supabase-migration-game-settings.sql`, `docs/VanaTrilha.md`, e a lista de ficheiros
das branches `feature/VanaCodigo` e `feature/VanaSketch`.
