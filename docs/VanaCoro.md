# VanaCoro: O que é que o JA disse?

**Especificação de construção para o Claude Code.**
Jogo #10 do Centro de Jogos dos Desbravadores de Abrantes. É o 6.º jogo ao vivo.

> **Como usar este documento:** lê-o todo antes de escrever código.
> - As secções 1 a 4 são a *bíblia do jogo*: o conceito, as regras e o que fica escondido.
> - As secções 5 a 9 são a arquitetura: a base de dados, o agrupamento, a IA, as actions e as rotas.
> - A secção 10 é o plano faseado. **Começa pela Fase 1 e entrega-a sozinha**: é a que permite
>   começar já a recolher respostas, e o banco de perguntas demora semanas a encher.
> - A secção 12 lista armadilhas reais deste repositório.

---

## 0. TL;DR

| | |
|---|---|
| **Nome** | VanaCoro (subtítulo no jogo: *"O que é que o JA disse?"*) |
| **Género** | Family Feud / "100 Portugueses Disseram", com respostas recolhidas no próprio clube |
| **Para quando** | Programas JA no salão da igreja: palco, projetor e duas equipas. ~1× por mês, ou menos |
| **Rota do jogo** | `/jogos/vana-coro` |
| **Rota da recolha** | `/perguntas`, **sem nenhuma referência ao VanaCoro** (ver §2) |
| **Prefixo BD** | `vanacoro_` |
| **Branch** | `feature/VanaCoro` (a partir de `master`) |
| **Referências de padrões** | VanaQuest (sessões com PIN, convidados, `awardSessionPoints`), VanaSketch (`CinematicPodium`, packs, áudio), VanaCamp (`types/` + `utils/` + `lib/actions/`, RLS estrita), VanaSentinela (convidados com id anónimo no browser e rota de API com *service role*) |

**A ideia:** durante a semana, os membros e os convidados respondem a uma pergunta aberta na
"Pergunta da Semana" ("O que nunca falta num acampamento?"). As respostas iguais são agrupadas
(código + IA + revisão humana). Semanas depois, no JA, duas equipas sobem ao palco e tentam
adivinhar **as respostas mais populares**, reveladas uma a uma no projetor.

---

## 1. Contexto do repositório

### 1.1 Stack
- Next.js 16 (App Router, Server Components, Server Actions) + TypeScript + React 19
- Supabase (Postgres + Auth + Realtime + RLS + Storage); alojamento no plano gratuito da Vercel
- Tailwind + `@/components/ui/*` + `lucide-react`; `zod` já está instalado (v4)

### 1.2 Convenções (respeitar à risca)
```
app/jogos/vana-coro/...               rotas do jogo ao vivo
app/perguntas/...                     rotas da recolha (sem "coro" no nome!)
app/api/perguntas/resposta/route.ts   envio de respostas (sem "coro" no nome!)
app/admin/vana-coro/...               gestão (só coordenação)
components/vana-coro/*.tsx            componentes do jogo e do admin
components/perguntas/*.tsx            componentes da recolha (sem "coro" no nome!)
lib/actions/vana-coro.ts              server actions do jogo e do admin
lib/vana-coro/ai.ts                   cliente de IA (fetch compatível com OpenAI)
lib/vana-coro/cluster.ts              agrupamento com IA + validação zod
types/vana-coro.ts                    tipos partilhados
utils/vana-coro/normalize.ts          normalização e agrupamento sem IA (puro, com testes)
utils/vana-coro/scoring.ts            pontos, rondas e regras do Feud (puro, com testes)
utils/vana-coro-labels.ts             rótulos PT dos enums
supabase-setup-vana-coro.sql          schema inicial (na raiz)
supabase-migration-vana-coro-<assunto>.sql   migrações seguintes
public/images/VanaCoro.png            logótipo (o Daniel trata disto)
public/sounds/VanaCoro/               sons (ding, erro, revelação, música do lobby)
```
- Tabelas com prefixo sem hífen (`vanacoro_questions`). Os enums ficam em inglês na BD e passam para PT na UI.
- `createClient()` (`@/utils/supabase/server`) respeita a RLS. `createServiceClient()` (`@/utils/supabase/service`) ignora-a e **só se usa no servidor**.
- Guardas `requireUser()` e `requireHost()`: copiar de `lib/actions/vana-camp.ts`. O admin do VanaCoro exige `coordenador`; o anfitrião do jogo pode ser `dirigente` ou `coordenador`.
- Para normalizar texto já existe `normalizeText()` em `utils/text-normalization.ts`. Usar e estender, não duplicar.

---

## 2. A recolha disfarçada ("Pergunta da Semana")

> [!important] Requisito de produto
> Quem responde **não pode saber** que as respostas são para um jogo. A recolha é uma
> funcionalidade geral do site, a **"Pergunta da Semana"**, e o VanaCoro fica **escondido**
> no Centro de Jogos até ao dia do JA. Assim as respostas saem espontâneas e a revelação é surpresa.

Consequências técnicas:
- Nenhum texto, rota, nome de componente, de pasta ou de endpoint usado pela recolha pode conter "coro"/"VanaCoro".
  Os nomes de pastas podem aparecer nos chunks JS e nos source maps, por isso a recolha vive em
  `app/perguntas`, `components/perguntas` e `app/api/perguntas`. As tabelas `vanacoro_*` só se tocam no servidor.
- O jogo nasce **escondido**: o SQL insere em `game_settings` a linha
  `('vana-coro', enabled = true, allowed_roles = ['coordenador'], hidden = true)`.
  Assim a coordenação vê e testa o jogo, e os outros nem sabem que existe (o `gameVisibilityFor` já trata disto).
  Confirmar os nomes das colunas em `supabase-migration-game-settings.sql` e nas migrações seguintes.
- A página de recolha mostra uma linha discreta: *"As respostas são anónimas e podem ser mostradas, sem nomes, em atividades do JA."*

### 2.1 Quem responde e por onde entra
| Quem | Onde vê | Como entra |
|---|---|---|
| Membro com sessão | Cartão "Pergunta da Semana" no painel (`app/page.tsx`) + `/perguntas` | Sessão normal |
| Convidado | Só pelo link de convite | `/perguntas/[token]` |
| Visitante sem link | **Nada.** A landing pública não mostra a pergunta | `/perguntas` sem sessão nem token mostra "Pede o link a alguém do clube" |

- **Link de convite:** é **um token para todo o clube**, não um por pergunta. Fica guardado em `vanacoro_settings.invite_token`.
  A coordenação pode **gerar um novo** no admin, e o antigo deixa de funcionar na hora. O token tem ~8 caracteres
  base62 aleatórios (`crypto.getRandomValues`).
- Cada pergunta tem `allow_guests` (por omissão `true`). Se for `false`, os convidados não a veem.
- O convidado recebe um `guest_id` (UUID) guardado em `localStorage`, com o padrão try/catch e fallback em
  memória de `components/vana-sentinela/storage.ts`. Usar uma chave neutra: `perguntas-guest-id`.
  Não se pede alcunha.

### 2.2 Regras de resposta
- **Até 3 respostas diferentes por pessoa** em cada pergunta. "Pessoa" = `respondent_key = coalesce(profile_id, guest_id)`.
- Cada resposta tem 1–40 caracteres (depois de `trim`). Respostas iguais da mesma pessoa, comparadas pelo `normalized_text`, são recusadas.
- Limite de pedidos: no máximo 10 respostas por `respondent_key` por minuto e 30 por IP por minuto
  (contar as linhas recentes. Não é preciso Redis).
- Depois de enviada, a resposta **pode ser apagada** pelo próprio enquanto a pergunta estiver aberta, para poder corrigir um erro.
- **Recompensa:** um membro recebe **+5 XP** (0 Gold) na **primeira** resposta a cada pergunta, por RPC idempotente
  e com registo no `points_log`. Os convidados não recebem nada.
- A UI mostra as respostas que a pessoa já deu e quantas faltam ("Podes dar mais 2"). **Nunca** mostra as respostas dos outros nem contagens.

### 2.3 Ritmo
- **1 pergunta por semana, aberta 7 dias** (`cadence_days = 7`, `open_days = 7` em `vanacoro_settings`).
- **Modo turbo** (um interruptor no admin): `cadence_days = 3`, `open_days = 5`. Serve para quando há um JA marcado e o banco não chega.
- A coordenação escreve várias perguntas de uma vez numa **fila**. O botão "Agendar fila" dá a cada pergunta sem data um
  `opens_at` = última abertura + `cadence_days`, às 18:00 de Lisboa, e `closes_at = opens_at + open_days`.
- Uma pergunta está **aberta** quando `opens_at <= now() < closes_at`. É calculado na hora; não é preciso cron para abrir ou fechar.

---

## 3. O jogo ao vivo (regras)

### 3.1 Preparação de cada pergunta (o "quadro")
Depois de a recolha fechar, a coordenação revê os grupos (§6) e marca a pergunta como **pronta**. Nesse momento congela-se o quadro:
- Votos de um grupo = `count(DISTINCT respondent_key)` das respostas do grupo. Respostas da mesma pessoa no mesmo grupo contam **1 vez**.
- O quadro fica com **até 5 grupos**, só os que têm **≥ 2 pessoas**, por ordem decrescente de votos. Os empates desempatam pelo nome.
- Só se pode marcar como pronta uma pergunta com **≥ 12 pessoas** diferentes e **≥ 3 grupos** válidos.
- **Pontos normalizados a 100:** `points = round(votos / soma_dos_votos_do_quadro * 100)`, e acerta-se o 1.º lugar para o total dar exatamente 100.
  Exemplo: votos 7·5·4·3·2 dão 33·24·19·14·10.
- O congelamento grava cópias em `vanacoro_board_entries` (nome, emoji, votos, pontos, posição). Editar grupos depois não mexe num quadro congelado,
  mas o admin pode "descongelar" uma pergunta pronta que ainda não foi jogada.

### 3.2 Uma sessão
- O anfitrião cria a sessão, dá nome às duas equipas e escolhe as perguntas do banco: **5 rondas** por omissão (pode escolher 3–8).
  A **última ronda vale ×2**.
- Por omissão sugerem-se as perguntas prontas mais antigas e **nunca** as que já foram jogadas (`used_at` não nulo).
- Os jogadores entram por PIN ou pelo código curto `/j/[code]`, como no VanaSketch, e escolhem a equipa.
  O anfitrião marca o **capitão** de cada equipa (por omissão, o primeiro a entrar). Os convidados podem jogar.

### 3.3 Uma ronda (Family Feud)
1. **Abertura:** o projetor mostra a pergunta e o quadro com N espaços escondidos (só os números 1..N).
   Texto de entrada na 1.ª ronda: *"Lembram-se da Pergunta da Semana?…"*
2. **Duelo (`faceoff`):** os capitães têm o botão **"Já sei!"** no telemóvel. O primeiro toque ganha.
   É uma transição condicional (`buzzed_team IS NULL AND phase = 'faceoff'`), igual às outras transições idempotentes.
   O capitão diz a resposta em voz alta e o anfitrião revela-a (toca no grupo) ou marca ❌. A seguir, o anfitrião
   **dá o controlo** a uma equipa com o botão "Controlo: A / B". As regras de quem fica com o controlo resolvem-se no
   palco, porque é o anfitrião que decide.
3. **A jogar (`playing`):** a equipa com o controlo vai dizendo respostas. Por cada uma, o anfitrião **revela** o grupo
   ou marca **❌ falha**. Os pontos revelados vão para o **pote da ronda**.
4. **3 falhas → roubo (`steal`):** a outra equipa tem **1 tentativa**. Se acertar, o anfitrião revela o grupo e a equipa
   que rouba fica com o pote, incluindo esses pontos. Se falhar, o pote vai para a equipa que tinha o controlo.
5. **Quadro todo revelado** durante `playing`: o pote vai para a equipa com o controlo.
6. **Revelar o resto (`reveal_rest`):** o anfitrião revela os grupos que faltam, **sem pontos**, e cada um tem a sua animação.
7. **Fim da ronda (`round_end`):** soma-se `pote × multiplicador` à equipa vencedora da ronda. A seguir vem a próxima ronda, ou o fim.

Regras puras em `utils/vana-coro/scoring.ts` (com testes):
`applyReveal`, `applyStrike`, `resolveSteal`, `bankPot`, `isBoardCleared`, `roundMultiplier(round, total)`.

### 3.4 Ajudas ao anfitrião (no palco)
- **Sugestão:** um campo "O que disseram?" no controlo. Ao escrever, a normalização + Levenshtein da §6.1 destaca o grupo
  mais parecido, juntando os textos originais do grupo e o nome. **Não usa IA**: é instantâneo e não tem custo.
- **Desfazer** a última ação (revelação ou falha): obrigatório, porque no palco toca-se no botão errado.
  Implementar como um log de ações da ronda (`vanacoro_round_events`) e reconstruir o estado a partir dele, ou como uma operação inversa idempotente.

### 3.5 Fim do jogo e pontos
- Pódio de equipas com o `CinematicPodium` (`components/game-podium/`): 2 entradas, os nomes das equipas e os pontos.
- **"Atribuir XP e Gold"** (idempotente, copiar o `awardSessionPoints` do VanaQuest), por jogador:
  - equipa vencedora: **60 XP / 30 Gold**
  - outra equipa: **30 XP / 15 Gold**
  - empate: as duas recebem o valor da vencedora
  - convidados: escolhem um desbravador para receber os pontos, ou dispensam (o padrão `setRewardsRecipient`/`skipRewards` do VanaQuest)
  - bots: nunca recebem
  - Valores em constantes em `utils/vana-coro/scoring.ts`, fáceis de ajustar à economia da loja.
- No fim, as perguntas jogadas ficam com `used_at = now()` e `used_in_session_id`.

### 3.6 A plateia
Na v1 a plateia **só vê o projetor**. Não há ecrã de plateia.

---

## 4. O que é segredo
| Segredo | Quem pode ver | Como |
|---|---|---|
| Respostas individuais (`vanacoro_answers`) | ninguém pelo cliente; o autor só vê as suas | RPC `get_my_vanacoro_answers` (nome neutro: `get_my_question_answers`) |
| Grupos e contagens (`vanacoro_groups`, `vanacoro_board_entries`) | coordenação (admin); anfitrião da sessão | RPCs `SECURITY DEFINER` que verificam o papel e a sessão |
| Quadro durante o jogo | projetor e jogadores: **só os já revelados** + o número de espaços | `get_vanacoro_board_public(session_id)` |
| Quadro completo durante o jogo | anfitrião | `get_vanacoro_board_host(session_id)` |

- **Nenhuma** destas tabelas entra em `supabase_realtime`. Só `vanacoro_sessions` (e, se for preciso, `vanacoro_players`) é publicada,
  e sem colunas secretas. Atualizações por `board_version++`: o cliente vê-o por realtime e volta a ler a RPC.
  Usar realtime + polling, como o `useLiveSession` do VanaQuest.
- Sem política de SELECT para `anon`/`authenticated` em `vanacoro_answers`, `vanacoro_groups`, `vanacoro_board_entries` e `vanacoro_settings`.

---

## 5. Modelo de dados (`supabase-setup-vana-coro.sql`)

Tudo idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`.

```sql
-- Definições globais (linha única)
vanacoro_settings (
  id smallint primary key default 1 check (id = 1),
  invite_token text not null,
  invite_rotated_at timestamptz not null default now(),
  cadence_days int not null default 7,
  open_days int not null default 7,
  turbo boolean not null default false
)

vanacoro_questions (
  id uuid pk default gen_random_uuid(),
  prompt text not null check (char_length(prompt) between 5 and 140),
  allow_guests boolean not null default true,
  opens_at timestamptz,            -- null = na fila, sem data
  closes_at timestamptz,
  review_status text not null default 'pending'   -- pending | grouped | ready
    check (review_status in ('pending','grouped','ready')),
  ready_at timestamptz,
  used_at timestamptz,
  used_in_session_id uuid,
  push_sent_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
)

vanacoro_groups (
  id uuid pk default gen_random_uuid(),
  question_id uuid not null references vanacoro_questions on delete cascade,
  label text not null,
  emoji text,
  hidden boolean not null default false,          -- impróprio / lixo
  source text not null default 'auto' check (source in ('auto','ai','manual')),
  created_at timestamptz not null default now()
)

vanacoro_answers (
  id uuid pk default gen_random_uuid(),
  question_id uuid not null references vanacoro_questions on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  guest_id uuid,
  respondent_key uuid generated always as (coalesce(profile_id, guest_id)) stored,
  ip_hash text,                                   -- sha256(ip + salt), só para o limite de pedidos
  raw_text text not null check (char_length(raw_text) between 1 and 40),
  normalized_text text not null,
  group_id uuid references vanacoro_groups(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((profile_id is null) <> (guest_id is null)),
  unique (question_id, respondent_key, normalized_text)
)
-- trigger BEFORE INSERT: recusa a 4.ª resposta da mesma respondent_key na mesma pergunta

vanacoro_answer_rewards (          -- idempotência dos +5 XP
  question_id uuid references vanacoro_questions on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (question_id, profile_id)
)

vanacoro_board_entries (           -- quadro congelado
  id uuid pk default gen_random_uuid(),
  question_id uuid not null references vanacoro_questions on delete cascade,
  rank int not null,               -- 1..5
  label text not null,
  emoji text,
  respondents int not null,
  points int not null,
  unique (question_id, rank)
)

vanacoro_sessions (
  id uuid pk default gen_random_uuid(),
  pin text not null, code text not null,          -- utils/pin.ts + código curto como o VanaSketch
  host_id uuid not null references profiles(id),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  phase text check (phase in ('intro','faceoff','playing','steal','reveal_rest','round_end')),
  current_round int not null default 0,
  team_a_name text not null default 'Equipa A',
  team_b_name text not null default 'Equipa B',
  team_a_score int not null default 0,
  team_b_score int not null default 0,
  control_team text check (control_team in ('a','b')),
  buzzed_team text check (buzzed_team in ('a','b')),
  strikes int not null default 0 check (strikes between 0 and 3),
  round_pot int not null default 0,
  board_version int not null default 0,
  is_test_session boolean not null default false,
  rewards_awarded_at timestamptz,
  created_at timestamptz not null default now()
)

vanacoro_rounds (
  id uuid pk default gen_random_uuid(),
  session_id uuid not null references vanacoro_sessions on delete cascade,
  question_id uuid not null references vanacoro_questions,
  round_number int not null,
  multiplier int not null default 1,
  winner_team text check (winner_team in ('a','b')),
  unique (session_id, round_number)
)

vanacoro_reveals (
  round_id uuid references vanacoro_rounds on delete cascade,
  board_entry_id uuid references vanacoro_board_entries on delete cascade,
  team text check (team in ('a','b')),           -- null = revelado sem pontos (reveal_rest)
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  primary key (round_id, board_entry_id)
)

vanacoro_round_events (            -- log para o "Desfazer"
  id bigserial pk,
  round_id uuid references vanacoro_rounds on delete cascade,
  kind text not null check (kind in ('reveal','strike','control','buzz','steal_result')),
  payload jsonb not null default '{}',
  undone boolean not null default false,
  created_at timestamptz not null default now()
)

vanacoro_players (
  id uuid pk default gen_random_uuid(),
  session_id uuid not null references vanacoro_sessions on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  guest_name text,
  team text check (team in ('a','b')),
  is_captain boolean not null default false,
  is_bot boolean not null default false,
  rewards_recipient_id uuid references profiles(id),
  rewards_skipped boolean not null default false,
  joined_at timestamptz not null default now()
)
```
Também no SQL: os índices óbvios (`answers(question_id)`, `answers(respondent_key, created_at)`, `questions(opens_at)`),
a linha `game_settings` escondida da §2, o insert inicial de `vanacoro_settings` com um token aleatório, e o
`REPLICA IDENTITY FULL` nas tabelas publicadas que recebem DELETE filtrado.

---

## 6. Agrupamento das respostas (3 camadas)

### 6.1 Camada 1: normalização (`utils/vana-coro/normalize.ts`, pura, com testes)
- `normalizeAnswer(text)`: usa o `normalizeText()` existente (minúsculas e sem acentos), e depois tira pontuação e emojis,
  junta espaços e tira um **artigo inicial** (`o, a, os, as, um, uma, uns, umas`).
  Não tirar plurais: "moises" acaba em "s".
- Corre **ao inserir**. O resultado vai para `normalized_text`.
- `autoGroup(items)`: junta as respostas com o mesmo `normalized_text` e, a seguir, as quase iguais por Levenshtein,
  com limite pelo tamanho: ≤4 letras, 0; 5–8, 1; >8, 2. Exemplos para os testes: `moizes`↔`moises` juntam; `pao`↔`pa` não juntam.
- `suggestGroup(input, groups)`: usado no palco (§3.4). Devolve o grupo mais próximo comparando com o nome e com os textos de cada grupo.

### 6.2 Camada 2: IA (`lib/vana-coro/cluster.ts` + `lib/vana-coro/ai.ts`)
**Fornecedor configurável**, numa API compatível com OpenAI (chat completions) e com `fetch`, **sem SDK novo**:
```
VANACORO_AI_BASE_URL   (por omissão https://api.groq.com/openai/v1)
VANACORO_AI_API_KEY    (só no servidor, nunca NEXT_PUBLIC_)
VANACORO_AI_MODEL      (por omissão openai/gpt-oss-120b; trocar sem mexer no código)
```
O Groq tem plano gratuito, mas qualquer fornecedor compatível serve (OpenRouter, Gemini pelo endpoint OpenAI, Claude por um proxy compatível…).
Sem chave configurada, o botão "Agrupar com IA" aparece desativado com a explicação, e o resto funciona.

`clusterQuestion(questionId)` (server action, só coordenação):
1. Lê as respostas não escondidas e junta-as pelos grupos da camada 1. Constrói `items = [{ id: "i1", text: "lanterna", count: 5 }, …]`.
   **Só textos e contagens: nada de ids de pessoas, nomes ou guest_ids.**
2. Prompt (temperatura 0, `response_format: { type: "json_object" }`):
   > És o assistente de um jogo estilo "Family Feud" para um grupo de jovens adventistas em Portugal.
   > Recebes respostas a uma pergunta. Agrupa as que **querem dizer a mesma coisa** (sinónimos, variações, erros de escrita,
   > a mesma ideia por outras palavras). **Não** juntes coisas apenas relacionadas (ex.: "Moisés" e "Arão" são diferentes;
   > "tenda" e "saco-cama" são diferentes). Para cada grupo dá um nome curto em português de Portugal (1–3 palavras,
   > com maiúscula inicial) e um emoji. Marca `inappropriate: true` em grupos ofensivos, com palavrões, ou sem sentido.
   > Pergunta: «…». Respostas (JSON): […]
   > Responde **só** com JSON: `{ "groups": [ { "label": "", "emoji": "", "item_ids": [""], "inappropriate": false } ] }`
3. Valida com zod. Cada `item_id` conhecido entra no **primeiro** grupo onde aparece; os desconhecidos ignoram-se; os que faltam ficam num grupo próprio.
   Se o JSON for inválido, tenta **mais 1 vez**. Se falhar outra vez, mostra um erro e mantém os grupos da camada 1.
4. Grava os grupos (`source = 'ai'`, `hidden = inappropriate`) e mete o `group_id` nas respostas. **Antes, apaga só os grupos
   `auto`/`ai` dessa pergunta.** Os grupos `manual` e as respostas que lá estão não se mexem. O UI pede confirmação.
5. Com muitas respostas (> 300 itens únicos), parte em lotes e faz uma 2.ª passagem só com os nomes dos grupos, para os juntar.
6. **"Agrupar as novas":** para respostas que chegaram depois e não têm grupo, envia os nomes dos grupos que já existem e os itens novos,
   e pede para colocar cada item num grupo existente (por id) ou num novo.
- Exportar `maxDuration` na rota/página se for preciso. Confirmar o limite das funções no plano gratuito da Vercel.

### 6.3 Camada 3: revisão humana (obrigatória)
`/admin/vana-coro/perguntas/[id]`:
- Lista de grupos ordenada por votos (pessoas distintas), com o emoji, o nome editável, a origem (auto/IA/manual) e as respostas originais lá dentro.
- Ações: **juntar** (selecionar 2+ e "Juntar", e o grupo final fica `manual`), **tirar** uma resposta para um grupo novo ou para outro grupo
  (drag & drop no desktop, menu "Mover para…" no telemóvel), **mudar o nome e o emoji**, **esconder** um grupo ou uma resposta, **apagar** uma resposta.
- Uma pré-visualização do quadro como vai ficar (top 5, ≥2 pessoas, pontos /100) com os avisos: "Só 9 pessoas: mínimo 12", "Só 2 grupos válidos".
- **"Marcar como pronta"** congela o quadro (§3.1). **"Descongelar"** só aparece se a pergunta ainda não foi jogada.

---

## 7. Server actions e RPCs

### 7.1 Recolha (servidor, *service role* depois de validar)
- `POST /api/perguntas/resposta`: `{ question_id, text, guest_id?, token? }`. Valida a sessão **ou** o token de convite + `guest_id`,
  que a pergunta está aberta e o `allow_guests`, o tamanho, o limite de 3 e os limites de pedidos. Normaliza e insere.
  Se for membro e a resposta for a 1.ª nessa pergunta, chama a RPC `award_question_answer_reward(question_id)` (nome neutro),
  que insere em `vanacoro_answer_rewards` (`ON CONFLICT DO NOTHING`) e só nesse caso no `points_log`
  (`description = 'Pergunta da Semana'`). Lógica testável num `handler.ts` à parte, como o `lib/vana-sentinela/score-handler.ts`.
- `DELETE /api/perguntas/resposta`: apaga a própria resposta enquanto a pergunta estiver aberta. **Não** tira os +5 XP.
- Leitura: `get_open_questions(token?, guest_id?)` devolve as perguntas abertas com as respostas da própria pessoa e quantas faltam.
  Também pode ser uma server action com *service role*.

### 7.2 Admin (`lib/actions/vana-coro.ts`, só coordenação)
`createQuestion`, `updateQuestion`, `deleteQuestion` (só se não tiver respostas, ou com confirmação forte), `scheduleQueue`,
`setTurbo`, `rotateInviteToken`, `clusterQuestion`, `clusterNewAnswers`, `mergeGroups`, `moveAnswer`, `renameGroup`,
`setGroupHidden`, `hideAnswer`, `markReady`, `unfreeze`.

### 7.3 Jogo (anfitrião = dirigente ou coordenador)
`createSession(teamNames, questionIds)`, `joinSession(pinOrCode, team, guestName?)`, `setCaptain`, `startGame`, `buzz(sessionId, playerId)`,
`hostReveal(sessionId, boardEntryId)`, `hostStrike`, `setControl(team)`, `resolveSteal(success, boardEntryId?)`, `revealRest(boardEntryId)`,
`nextRound`, `undoLast`, `finishGame`, `awardSessionPoints`, `setRewardsRecipient`, `skipRewards`, `deleteSession`.
- Todas as transições são **condicionais e idempotentes** (`UPDATE … WHERE phase = 'x' AND current_round = n`) e fazem `board_version++`.
- Sessões de teste com bots: `is_test_session` + `is_bot` + o `HostBotOverlay` do padrão dos jogos ao vivo. Os bots podem carregar no "Já sei!".

---

## 8. Rotas e ecrãs

### 8.1 Recolha
| Rota | Quem | Conteúdo |
|---|---|---|
| `/perguntas` | membro com sessão | perguntas abertas, as próprias respostas e "Podes dar mais N". Sem sessão nem token: "Pede o link a alguém do clube" + botão Entrar |
| `/perguntas/[token]` | convidado | o mesmo; com token inválido mostra o mesmo ecrã de "Pede o link" |
| cartão no painel (`app/page.tsx`) | membro | "Pergunta da Semana" com a pergunta aberta mais recente e um botão "Responder", ou "Já respondeste ✓" |

UI: mobile-first, simples e acolhedora, com um campo de texto + "Enviar" e chips com as respostas já dadas (com ✕ para apagar).
Sem nenhuma estética de jogo.

### 8.2 Admin: `/admin/vana-coro` (só coordenação)
- **Fila:** perguntas com o estado calculado (na fila / agendada / aberta / a rever / pronta / jogada), as datas, o n.º de pessoas
  e um botão para editar. "Nova pergunta", "Agendar fila", interruptor **Modo turbo**.
- **Banco:** "Tens **6** perguntas prontas · um jogo precisa de ~8–9", com uma barra de progresso.
- **Link de convite:** o URL completo, Copiar, QR para imprimir (reaproveitar o `QrPrintDialog` se servir) e **Gerar novo link** (com confirmação).
- Ligação ao ecrã de revisão de cada pergunta (§6.3).
- Dicas na criação de perguntas: *"Evita perguntas datadas: a pergunta pode ser jogada meses depois."*

### 8.3 Jogo ao vivo (padrão de 3 ecrãs)
| Rota | Ecrã |
|---|---|
| `/jogos/vana-coro` | hub: criar sessão (anfitrião) ou entrar por PIN |
| `/jogos/vana-coro/[id]/control` | anfitrião: quadro completo com pontos, botões Revelar / ❌ / Controlo A·B / Roubo certo·errado / Desfazer / Próxima ronda, campo de sugestão (§3.4) |
| `/jogos/vana-coro/[id]/present` | projetor: lobby com QR `/j/[code]`, quadro de 5 espaços, ❌ gigantes com som, pontuações, pote, "×2" na última ronda, pódio |
| `/jogos/vana-coro/[id]/play` | jogador: equipa, pontuação e quadro revelado; o capitão tem o **"Já sei!"** grande durante o duelo (vibra com `utils/vibrate.ts`) |
| `/jogos/vana-coro/[id]/as/[playerId]` | anfitrião a fazer de bot |

- Projetor: o clique "Clica para ativar o áudio e o ecrã inteiro" usa `enterFullscreen()` de `utils/fullscreen.ts`.
- Revelação: a carta vira com o emoji, o nome e os pontos, e toca o som de "ding". Falha: um ❌ vermelho em ecrã inteiro durante ~1 s, com o som de erro.
- Efeitos: `components/presentation-effects/` (`FxEngine`, `SoundSynth`) para os confettis no fim da ronda e do jogo.
- Registar em `utils/games.ts`: `id: "vana-coro"`, `title: "VanaCoro"`,
  `description: "O que é que o JA disse? Adivinha as respostas mais populares e ganha pela tua equipa!"`,
  `singlePlayer: false`, `requiresAuth: false`, `adminCoordOnly: true`, `isNew: true`, `adminHref: "/admin/vana-coro"`.
- Middleware: acrescentar à allowlist `/jogos/vana-coro` (para os convidados entrarem no jogo), `/perguntas` e `/api/perguntas`.
  As páginas `/perguntas` fazem a sua própria verificação (sessão ou token).

---

## 9. Notificações push (Fase 4)
- Quando uma pergunta abre, envia-se **1 push**: título "Pergunta da Semana", corpo = a pergunta, link `/perguntas`.
- O envio atual é a Edge Function `supabase/functions/send-push`, chamada por trigger via `pg_net` quando há um comunicado.
  Como as perguntas abrem por tempo e não por INSERT, é preciso um **`pg_cron`** de hora a hora que procura perguntas com
  `opens_at <= now() AND push_sent_at IS NULL`, chama a função e marca `push_sent_at`.
- Destinatários: todos os membros com subscrição. Os convidados não têm push.

---

## 10. Plano faseado

### Fase 1: Recolha · ENTREGÁVEL SOZINHA ⭐
Tabelas `vanacoro_settings`, `vanacoro_questions`, `vanacoro_answers` e `vanacoro_answer_rewards` + a normalização (§6.1, com testes)
+ `/perguntas` e `/perguntas/[token]` + a API de resposta + o cartão no painel + o admin (fila, agendamento, turbo, link de convite)
+ a linha escondida em `game_settings` + o middleware.
**Objetivo:** pôr a Pergunta da Semana a funcionar **já**, porque o banco precisa de ~2 meses para dar o primeiro jogo.

### Fase 2: Revisão e IA
`vanacoro_groups` e `vanacoro_board_entries` + `autoGroup` + o cliente de IA e o `clusterQuestion`/`clusterNewAnswers` + o ecrã de revisão + "Marcar como pronta" (congelar o quadro).

### Fase 3: Jogo ao vivo
Sessões, jogadores, rondas, revelações, eventos + os 3 ecrãs + as regras do Feud (`scoring.ts` com testes) + desfazer + sugestão + bots + pódio + prémios + o registo em `utils/games.ts`.

### Fase 4: Polimento
Push com `pg_cron`, sons e música, imagem de partilha no fim ("O JA disse…", o quadro da melhor ronda, 1080×1080, como o `BestDrawingShare`),
analítica no `GameAnalyticsPanel` e uma página "Como jogar" para a liderança.

---

## 11. Critérios de aceitação

**Fase 1**
- [ ] Um membro vê o cartão no painel e responde em `/perguntas`. A 1.ª resposta dá +5 XP **uma vez** (testar com duas abas).
- [ ] A 4.ª resposta da mesma pessoa é recusada com uma mensagem amigável, e "Moisés"/"moises" da mesma pessoa conta como repetida.
- [ ] Um convidado com o link responde. Sem link vê "Pede o link". Depois de "Gerar novo link", o link antigo deixa de funcionar.
- [ ] Uma pergunta com `allow_guests = false` não aparece aos convidados.
- [ ] A landing pública e o Centro de Jogos (para desbravadores e dirigentes) **não** mostram nada do VanaCoro. `grep -ri coro` no bundle da rota `/perguntas` não encontra nada.
- [ ] "Agendar fila" põe as perguntas de 7 em 7 dias às 18:00 de Lisboa. O turbo passa a 3 dias e abertas 5.
- [ ] As respostas dos outros nunca chegam ao cliente (verificar com as ferramentas de rede).

**Fase 2**
- [ ] `autoGroup` passa nos testes. A IA com 40 respostas de teste junta "lanterna/frontal/luz" e separa "Moisés/Arão".
- [ ] Sem `VANACORO_AI_API_KEY`, a revisão manual funciona na mesma.
- [ ] Juntar, mover, renomear, esconder e voltar a agrupar com IA preservam os grupos `manual`.
- [ ] "Marcar como pronta" recusa com < 12 pessoas ou < 3 grupos válidos. O quadro congelado soma 100.

**Fase 3**
- [ ] Um jogo de 5 rondas com 2 equipas, duelo, 3 falhas, roubo certo e errado, quadro limpo e ×2 na última ronda dá os totais certos (testes do `scoring.ts`).
- [ ] O projetor nunca recebe os nomes dos grupos por revelar (verificar o payload das RPCs).
- [ ] "Desfazer" repõe o estado depois de uma revelação e depois de uma falha.
- [ ] Os prémios são idempotentes, os convidados escolhem um desbravador e as perguntas jogadas não voltam a ser sugeridas.

---

## 12. Armadilhas deste repositório
1. **O middleware bloqueia rotas públicas:** acrescentar `/perguntas`, `/api/perguntas` e `/jogos/vana-coro` à allowlist em `utils/supabase/middleware.ts`. Atenção também ao redirecionamento para o onboarding (perfil sem `birth_date`).
2. **Fuso horário:** a Vercel corre em UTC. As aberturas às 18:00 calculam-se em `Europe/Lisbon`, em TS com `Intl.DateTimeFormat` e em SQL com `AT TIME ZONE 'Europe/Lisbon'`.
3. **XP e Gold só via `points_log`.** Nunca `update profiles`.
4. **Não há runner de migrações:** os `.sql` são corridos à mão no Supabase. Tudo tem de ser idempotente.
5. **O realtime vaza colunas:** nenhuma tabela com respostas, grupos ou quadro entra na publicação.
6. **`.single()` rebenta:** usar `.maybeSingle()` para tudo o que pode não existir.
7. **`localStorage` falha em modo privado:** try/catch e fallback em memória, como em `components/vana-sentinela/storage.ts`.
8. **Disfarce:** nada de "coro" em `app/perguntas`, `components/perguntas`, `app/api/perguntas`, nos textos, títulos, metadados, `description` do `points_log` nem no corpo do push.
9. **`?next=` no login:** usar o parâmetro que `app/login` respeita (o `utils/safe-next-path.ts`).
10. **Jogadores não recarregam a página** (perde-se a ativação da vibração). Só o anfitrião faz `router.refresh()`/`reload`, como no padrão dos jogos ao vivo.

---

## 13. Decisões já tomadas (resumo)
- O jogo vai para o JA, ~1× por mês ou menos. As respostas são recolhidas num dia e jogadas noutro.
- A recolha é **geral e disfarçada** ("Pergunta da Semana") e o jogo fica escondido até ao dia.
- Convidados só pelo link de convite (um token para o clube, que pode ser regenerado). A landing pública não mostra nada.
- Até 3 respostas por pessoa. A mesma pessoa no mesmo grupo conta 1 vez.
- Agrupamento: normalização → IA → **revisão obrigatória do anfitrião**. No palco não se usa IA, só a sugestão local.
- 1 pergunta por semana, aberta 7 dias, com modo turbo. Quadro de 5, mínimo de 12 pessoas e pontos normalizados a 100.
- Regras do Family Feud completas: duelo, 3 falhas e roubo. Na v1 a plateia só vê o projetor.
