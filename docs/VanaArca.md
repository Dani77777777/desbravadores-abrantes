# VanaArca — Carrega a Arca

**Especificação de construção para o Claude Code.**
Jogo singleplayer do Centro de Jogos dos Desbravadores de Abrantes, **para jogar
várias vezes por dia** (não é um desafio diário), com pontos limitados por dia,
ranking semanal individual e uma Disputa de Famílias.

> *"De tudo o que vive, de toda a carne, dois de cada espécie, meterás na arca."* — Génesis 6:19
> (na UI, citar só a referência com `BibleReference`; não copiar o texto de uma tradução)

> **Como usar este documento:** lê-o de ponta a ponta antes de escrever código.
> Segue as convenções do `docs/VanaEspada.md` (secção 1) e as armadilhas do
> `docs/VanaTrilha.md` (secção 12). **Faz a Fase 1 primeiro e entrega-a sozinha.**
> Tudo o que está aqui foi aprovado pelo clube. Se algo não estiver claro ou não
> bater certo com o código, pergunta em vez de inventar.

---

## 0. TL;DR

| | |
|---|---|
| **Nome** | VanaArca: Carrega a Arca |
| **Género** | Arcade de equilíbrio, singleplayer, partidas de 1 a 3 minutos |
| **Ideia** | Os pares de animais passam por cima da arca; o jogador larga-os lá dentro (3 andares) sem a deixar virar com o peso e as ondas do dilúvio |
| **Rota** | `/jogos/vana-arca` (com login) · admin em `/admin/vana-arca` |
| **Prefixo BD** | `vanaarca_` |
| **Branch** | `feature/VanaArca` (a partir de `master`) |
| **Pontos por partida** | Só as **3 primeiras partidas do dia** (Europe/Lisbon) dão XP e Gold |
| **Semanal** | Top 3 individual (100/60/40) + Disputa de Famílias (50 a cada membro da família vencedora que jogou), pagos **automaticamente** no domingo às 21:00, com dia e hora configuráveis no admin |
| **Anti-batota** | O servidor repete a partida a partir da semente e dos toques e calcula ele próprio o resultado |

---

## 1. Contexto do repositório

Igual ao `docs/VanaEspada.md` §1 (stack, convenções de nomes, `createClient` vs
`createServiceClient`, guardas nas actions). Pontos a respeitar:

- **XP/Gold só via `points_log`**, nunca escrever em `profiles` (trigger `on_points_log_change`).
- **Migrações idempotentes** em ficheiros `.sql` soltos na raiz (não há runner).
- **Fuso horário:** o "dia" e a "semana" são sempre em `Europe/Lisbon`
  (`(now() AT TIME ZONE 'Europe/Lisbon')`), nunca em UTC.
- `.maybeSingle()` em tudo o que possa não existir.

Referências a copiar:

| O quê | Onde |
|---|---|
| Registo no hub, disponibilidade por cargo, campanhas de multiplicador | `utils/games.ts`, `lib/actions/games.ts`, `supabase-migration-game-points-multiplier.sql` (`game_points_multiplier`, `apply_points_multiplier`, `points_multiplier_label`) |
| Prémio idempotente de um jogo diário (padrão RPC + flag `rewards_awarded`) | `award_vanatrilha_daily_rewards` e `award_vana_codigo_rewards` em `supabase-migration-points-rebalance.sql` |
| Quem conta como participante "a sério" | `get_gold_rate_info()` em `supabase-migration-points-rebalance.sql`: `role IN ('desbravador','dirigente')`, `NOT is_hidden_from_ranking(full_name)` e movimento no `points_log` nos últimos 90 dias |
| Famílias | `supabase-migration-club-families.sql` (`club_families`, `club_family_members`; sem políticas RLS: ler só com service role), `utils/club-families.ts`, `lib/club-families.ts` |
| Tarefa agendada com `pg_cron` + rede de segurança sem pg_cron | secção 14 de `supabase-migration-store-security-fix.sql` e `lib/store-maintenance.ts` |
| Analítica de jogos | `utils/game-analytics.ts`, `supabase-setup-game-analytics.sql` (registar o VanaArca como os outros) |

---

## 2. O jogo

### 2.1 Ecrã

- Canvas, **mobile-first**. Céu, chuva, mar com ondas e a arca a flutuar ao centro.
- A arca é um casco com **3 andares** (Génesis 6:16). O interior é uma grelha de
  **10 colunas × 6 filas** (2 filas por andar), com o 1.º andar em baixo.
- A arca **inclina** conforme o peso; um medidor mostra a inclinação e o limite.
- Por cima da arca, um par de animais vai de um lado para o outro.
- **Tocar em qualquer sítio do ecrã** (ou a barra de espaço no computador) larga o par.

### 2.2 Regras

1. **Largar:** o par cai na coluna mais próxima da sua posição e fica pousado em
   cima do que já lá estiver nas colunas que ocupa (como no Tetris, sem rodar as
   peças e sem as filas desaparecerem). Pode ficar um buraco por baixo.
2. **Não cabe:** se a fila onde pousaria já estiver acima da 6.ª, o par "fica de
   fora" (cai à água) e o jogador **perde 1 de 3 vidas**.
3. **Equilíbrio:** cada espécie tem um **peso**. A inclinação vem do binário dos
   pesos em relação ao centro, somado à oscilação das ondas. Se passar de **14°**,
   **a arca vira** e a partida acaba.
4. **Dificuldade:** os pares passam cada vez mais depressa e as ondas ficam
   cada vez mais fortes ao longo da partida.
5. **Fim:** a arca vira, ou acabam as 3 vidas ("O Senhor fechou a porta", Génesis 7:16).
6. **Pontuação:** **1 ponto por par a bordo** e **+3 por cada fila completa** (as
   10 casas da fila ocupadas).

### 2.3 Espécies (valores iniciais)

| id | Nome (PT) | Largura (casas) | Peso |
|---|---|---|---|
| `coelhos` | coelhos | 1 | 1 |
| `pombas` | pombas | 1 | 1 |
| `ovelhas` | ovelhas | 2 | 2 |
| `cabras` | cabras | 2 | 2 |
| `lobos` | lobos | 2 | 2 |
| `raposas` | raposas | 2 | 2 |
| `leoes` | leões | 2 | 3 |
| `cavalos` | cavalos | 2 | 3 |
| `zebras` | zebras | 2 | 3 |
| `ursos` | ursos | 2 | 4 |
| `girafas` | girafas | 2 | 4 |
| `camelos` | camelos | 3 | 4 |
| `hipopotamos` | hipopótamos | 3 | 5 |
| `elefantes` | elefantes | 3 | 6 |

Cada peça mostra o nome ("2 elefantes"). A cor vai do claro (leve) ao escuro (pesado),
para se perceber o peso de relance. Ilustrações dos animais podem vir depois: na
Fase 1 bastam blocos com o nome.

### 2.4 Motor (valores do protótipo aprovado)

- Simulação a **ticks fixos de 60 por segundo**. O tick 0 é o arranque da partida.
- Velocidade da peça (casas/s): `min(3 + pares * 0.15, 9)`. Ressalta nas paredes.
- Peça nova: espécie aleatória e sentido aleatório (começa encostada à esquerda
  ou à direita).
- Coluna de largada: posição arredondada, limitada a `[0, COLS - largura]`.
- Inclinação "de carga" (graus): `10 * Σ(peso * (centro_da_peça - COLS/2)) / (Σpeso + 15)`.
  Quanto mais carregada a arca, mais estável fica.
- Ondas (graus): `amplitude(t) * sin(1.6 * t)`, com `amplitude(t) = 1 + min(0.05 * t, 5)`
  e `t` em segundos desde o arranque.
- Inclinação total = carga + ondas. Vira se `|total| > 14`.

**O motor TEM de ser determinista em qualquer browser** (secção 4): sem
`Math.random`, sem `Date`, sem `Math.sin`. Usar um PRNG com semente (ex.: mulberry32),
**aritmética inteira / vírgula fixa** (ex.: posições em milésimos de casa, ângulos
em centésimos de grau) e uma **tabela de senos fixa** escrita no código. A ordem das
chamadas ao PRNG é fixa (espécie, depois sentido, em cada peça nova).

---

## 3. Pontos

### 3.1 Prémio por partida

- Qualquer pessoa pode jogar quantas vezes quiser. **Só as 3 primeiras partidas de
  cada dia** (Europe/Lisbon) dão XP e Gold; as seguintes contam para o recorde e para os
  rankings semanais, mas valem 0 pontos.
- Escalões, pelos **pares a bordo**:

  | Pares | XP | Gold |
  |---|---|---|
  | 0 a 9 | 5 | 5 |
  | 10 a 19 | 10 | 10 |
  | 20 ou mais | 15 | 15 |

  Máximo de 45 XP + 45 Gold por dia.
- **Cada partida iniciada ocupa uma das 3 vagas do dia**, mesmo que seja abandonada.
  Isto impede que alguém abandone as partidas más e só termine as boas. O ecrã tem de
  avisar ("Sair agora conta como uma das tuas partidas de hoje").
- **Campanhas de multiplicador** (ex.: a Campanha de Natal ×2 / ×5) **aplicam-se a este
  prémio por partida**, com `game_points_multiplier('vana-arca')`, como nos outros
  singleplayer. Arredondamento e rótulo iguais (`apply_points_multiplier`,
  `points_multiplier_label`).
- Quem recebe pontos por partida: as mesmas regras do VanaCódigo (ver
  `award_vana_codigo_rewards`).
- O ecrã inicial e o de fim mostram sempre **"Partidas com prémio hoje: X de 3"**.

### 3.2 Período semanal

- Os prémios semanais saem **num dia e hora configuráveis no admin**. Para já:
  **domingo às 21:00 (Europe/Lisbon)**.
- O período vai do momento do último pagamento (ou de `launched_at`, na primeira
  semana) até à próxima ocorrência desse dia e hora. Uma partida pertence ao
  período em que **terminou**. Se o dia ou a hora mudarem no admin, a mudança vale a
  partir do período aberto e os períodos já pagos não mudam.
- **Os multiplicadores de campanha NÃO se aplicam aos prémios semanais.**

### 3.3 Top 3 individual

- Conta o **recorde de cada pessoa no período**: a melhor pontuação de uma partida,
  não a soma.
- Elegíveis: `role IN ('desbravador','dirigente')` e `NOT is_hidden_from_ranking(full_name)`.
  Os dirigentes **entram** e os coordenadores e as contas de teste ficam de fora.
- Prémios: **1.º 100 XP + 100 Gold · 2.º 60 + 60 · 3.º 40 + 40**.
- Desempate: ganha quem fez essa pontuação **primeiro** (`finished_at` mais cedo).

### 3.4 Disputa de Famílias

- Média de cada família = soma dos recordes do período dos **membros ativos** ÷ número
  de membros ativos. **Quem não jogou no período conta 0.**
- Membro ativo: membro da família que cumpre as regras de elegibilidade do 3.3 **e** tem
  pelo menos um movimento no `points_log` nos últimos 90 dias (as mesmas regras de
  `get_gold_rate_info`).
- Só entram famílias com **pelo menos 2 membros ativos**.
- Desempate: mais membros que jogaram; depois, quem chegou primeiro à pontuação (o
  `finished_at` mais tardio entre os recordes que contam, o mais cedo ganha).
- Prémio: **50 XP + 50 Gold a cada membro ativo da família vencedora que tenha jogado
  pelo menos uma partida no período**. Quem não jogou não recebe.
- Quem não pertence a nenhuma família continua no top 3 individual.

### 3.5 Pagamento automático

- Função `vanaarca_process_weekly_payout()` (`SECURITY DEFINER`, só para `service_role`):
  1. Lê as definições e calcula o período aberto.
  2. Se `now()` ainda não chegou ao fim do período, não faz nada.
  3. Senão, calcula o top 3 e a família vencedora, escreve no `points_log` e regista
     o período em `vanaarca_weekly_payouts`, **tudo na mesma transação**. A chave
     única do período garante que **nunca paga duas vezes** (bloquear com
     `INSERT ... ON CONFLICT DO NOTHING` ou `FOR UPDATE` antes de pagar).
  4. Se um período inteiro ficou por pagar (o servidor esteve parado), paga-o
     também. Fazer um ciclo até apanhar o período atual.
- **`pg_cron`** (se existir no projeto): correr a função a cada 5 minutos
  (`*/5 * * * *`). A própria função decide se já é hora, por isso a hora de verão e
  as mudanças no admin ficam resolvidas sem mexer no cron. Mesmo padrão `DO $$ IF EXISTS
  pg_extension 'pg_cron' ...` da Loja.
- **Rede de segurança sem pg_cron:** abrir `/jogos/vana-arca` ou `/admin/vana-arca`
  chama a função no servidor (service role), como o `lib/store-maintenance.ts`.
- `awarded_by_user_id`: confirma no schema se pode ser `NULL` e como a Auditoria o
  mostra. Usa o que fizer o pagamento automático aparecer claramente como "sistema" ou
  "VanaArca" na Auditoria. Se tiver de ser um utilizador, usa o próprio vencedor, como
  nos jogos diários.
- Descrições no `points_log` (fixas, porque a Auditoria e a analítica dependem delas):
  - `VanaArca — Partida (N pares)` (+ ` ×2` etc. quando há multiplicador)
  - `VanaArca — 1.º lugar da semana` / `2.º` / `3.º`
  - `VanaArca — Disputa de Famílias (<nome da família>)`

---

## 4. Anti-batota: repetição no servidor

1. `startRun()` no servidor cria a partida com uma **semente aleatória** (gerada no
   servidor) e devolve-a ao cliente.
2. O cliente corre o motor com essa semente e regista **os ticks em que o jogador
   tocou** (só os toques de largar, não o "toca para começar").
3. `finishRun(runId, taps, ticks)` envia a lista de ticks e o total de ticks.
4. O servidor **corre o mesmo motor** (`utils/vana-arca.ts`, função pura) com a
   semente e os toques e obtém pares, filas, pontuação e motivo do fim. **O resultado
   do servidor é o que conta**; o do cliente é só para mostrar. Se forem diferentes,
   mostrar o do servidor.
5. Validações: a partida é do utilizador e está `playing`; os ticks são crescentes e
   estão dentro do total; o motor tem de terminar a partida (virar ou sem vidas) até
   ao último tick; `ticks / 60` não pode ser maior do que o tempo real desde
   `started_at` mais 5 s (não se joga mais depressa do que o relógio). Pode ser menor,
   porque o separador em segundo plano pausa o jogo. Máximo de 45 minutos por partida.
   Falhou alguma? A partida fica `invalid`, não dá pontos nem conta para rankings.
6. O cliente não consegue escrever em `vanaarca_runs` (RLS); só as server actions com
   service role.

---

## 5. Modelo de dados (`supabase-setup-vana-arca.sql`)

```sql
-- Definições (uma linha, id = 1), editáveis no admin
vanaarca_settings (
  id smallint PK CHECK (id = 1),
  prize_weekday smallint NOT NULL DEFAULT 0,      -- 0 = domingo (EXTRACT(dow))
  prize_time time NOT NULL DEFAULT '21:00',       -- hora de Lisboa
  paid_runs_per_day int NOT NULL DEFAULT 3,
  reward_low int DEFAULT 5, reward_mid int DEFAULT 10, reward_high int DEFAULT 15,
  mid_from int DEFAULT 10, high_from int DEFAULT 20,   -- limiares de pares
  top_prizes int[] DEFAULT '{100,60,40}',
  family_prize int DEFAULT 50,
  family_min_members int DEFAULT 2,
  launched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz, updated_by uuid
)

-- Partidas
vanaarca_runs (
  id uuid PK, user_id uuid NOT NULL REFERENCES profiles,
  seed bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('playing','finished','abandoned','invalid')),
  run_date date NOT NULL,             -- dia de Lisboa em que começou (para as 3 vagas)
  daily_index int NOT NULL,           -- 1.ª, 2.ª, 3.ª… partida desse dia
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  taps int[], ticks int,
  pares int, filas int, score int, end_reason text,   -- 'capsized' | 'full'
  species jsonb,                      -- espécies embarcadas (para o álbum, Fase 2)
  reward_xp int DEFAULT 0, reward_gold int DEFAULT 0,
  rewards_awarded boolean NOT NULL DEFAULT false
)
-- índices: (user_id, run_date), (status, finished_at)

-- Pagamentos semanais (um por período; a PK impede pagar duas vezes)
vanaarca_weekly_payouts (
  period_end timestamptz PK, period_start timestamptz NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by uuid,                       -- NULL = automático
  results jsonb NOT NULL              -- top 3, classificação das famílias, quem recebeu quanto
)
```

- Ao iniciar uma partida nova, uma partida anterior ainda em `playing` desse
  utilizador passa a `abandoned`.
- RLS: o utilizador lê as suas partidas; escritas só com service role. Os
  rankings saem por server actions/RPC que devolvem **só o necessário**: nome a
  mostrar (`utils/display-name.ts`), pontuação e posição. Para as famílias: nome,
  média e "X de Y jogaram", sem expor a lista de membros a quem não é da família.
- Não pôr `vanaarca_runs` no Realtime (não é preciso).
- Prémio por partida numa RPC idempotente `award_vanaarca_run_rewards(p_run_id)`
  (padrão do VanaTrilha: `rewards_awarded`, verificação do dono à prova de NULL,
  multiplicador aplicado no fim).

---

## 6. Ficheiros

```
docs/VanaArca.md                          este documento
supabase-setup-vana-arca.sql              tabelas, RLS, RPC, função semanal, pg_cron
types/vana-arca.ts                        tipos
utils/vana-arca.ts                        MOTOR PURO + regras de prémio + período semanal (sem I/O)
utils/vana-arca.test.ts                   testes
lib/actions/vana-arca.ts                  startRun, finishRun, getMyStatus, getWeeklyBoards, admin
app/jogos/vana-arca/page.tsx              jogo
components/vana-arca/*                    canvas, HUD, ecrãs de início/fim, rankings
app/admin/vana-arca/page.tsx              definições + histórico de pagamentos
public/images/VanaArca.png                logótipo (placeholder até o Daniel enviar um)
```

Registar em `utils/games.ts`: `id: "vana-arca"`, `title: "VanaArca"`,
`singlePlayer: true`, `requiresAuth: true`, `isNew: true`, com `href`, `loginHref`
(confirmar se o parâmetro é `?next=` como no VanaCódigo) e `adminHref`. Descrição:
"Carrega a arca dois a dois sem a deixar virar! Joga as vezes que quiseres."
Criar a linha em `game_settings` para aparecer na gestão de jogos e nas campanhas.

---

## 7. Ecrãs

**Jogo (`/jogos/vana-arca`)**
- Início: botão "Jogar", recorde pessoal, recorde da semana, "Partidas com prémio hoje:
  X de 3" e o aviso de que sair a meio conta como partida.
- Durante: canvas, pares a bordo, vidas, pontuação, medidor de inclinação.
- Fim: motivo do fim, pares, filas, pontuação, **prémio ganho** (ou "sem prémio: já
  usaste as 3 partidas de hoje"), referência bíblica com `BibleReference` (rodar
  entre Génesis 6–9), botão "Jogar outra vez", e a posição da família, por exemplo
  "A tua família está em 2.º, a 4 pontos da 1.ª".
- Separadores **"Top da semana"** (com contagem decrescente até ao prémio e os 3
  prémios à vista) e **"Disputa de Famílias"** (nome, média, "X de Y jogaram", a minha
  família destacada).
- Wake lock durante a partida (copiar o `useWakeLock` do VanaCamp). `touch-action:
  manipulation` no canvas para não haver zoom com toques rápidos.

**Admin (`/admin/vana-arca`, coordenadores)**
- Definições editáveis: dia e hora do prémio semanal, partidas pagas por dia,
  escalões e valores, prémios do top 3, prémio da família e mínimo de membros. Mostrar
  em linguagem simples quando é o próximo pagamento.
- Pré-visualização do período aberto: top 3 e famílias como estão agora.
- Histórico dos pagamentos (período, quem ganhou, quanto, se foi automático).
- Botão "Processar pagamentos em atraso": só chama a mesma função, que **não paga
  antes da hora nem paga duas vezes**.

---

## 8. Plano

### Fase 1 (entregar sozinha)
1. SQL: tabelas, RLS, `award_vanaarca_run_rewards`, `vanaarca_process_weekly_payout`, pg_cron.
2. `utils/vana-arca.ts`: motor determinista, escalões, cálculo do período, ranking e
   média das famílias. Testes: mesma semente e mesmos toques dão sempre o mesmo
   resultado; vira acima de 14°; perde vida quando não cabe; filas completas; vagas do
   dia; desempates; família com 1 membro ativo fica de fora; quem não jogou conta 0;
   mudança de dia/hora no admin; mudança da hora de verão (fim de março e fim de outubro).
3. Server actions e páginas do jogo e do admin. Registo no hub e na analítica.

### Fase 2 (só depois de a Fase 1 estar em produção)
- **Álbum da Arca**: espécies que cada um já embarcou, com algumas espécies raras que só
  aparecem a partir dos 15 pares (não dão pontos).
- **Notificação push** aos vencedores semanais (Edge Function `send-push`).
- Ilustrações dos animais e sons (chuva, trovão, largar a peça).

---

## 9. Critérios de aceitação (Fase 1)

- [ ] A partida no telemóvel joga-se só com toques, e no computador com o espaço.
- [ ] O resultado gravado é sempre o calculado no servidor; mexer no cliente não dá mais pontos.
- [ ] Só as 3 primeiras partidas do dia (Lisboa) dão pontos, conforme os escalões;
      partidas abandonadas gastam vaga.
- [ ] Com uma campanha ativa no `game_settings`, o prémio por partida é multiplicado; o
      semanal não.
- [ ] No domingo às 21:00 de Lisboa (ou no dia e hora do admin) os prémios saem sozinhos,
      uma única vez, mesmo que a função corra várias vezes.
- [ ] Coordenadores e contas de teste não aparecem nem ganham nos rankings semanais;
      dirigentes sim.
- [ ] Quem não está numa família aparece no top individual; famílias com menos de 2
      membros ativos não entram na disputa.
- [ ] Tudo aparece na Auditoria com as descrições da secção 3.5.
- [ ] Os ficheiros SQL podem correr duas vezes sem estragar nada.
