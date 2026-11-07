# 🏕️ Clube de Desbravadores de Abrantes

Plataforma *mobile-first* de gamificação e gestão do **Clube de Desbravadores de Abrantes** (UPASD Portugal). Os membros ganham **XP** e **Gold** por participarem nas atividades; a liderança gere membros, famílias, eventos, presenças, loja e comunicados, tem ferramentas para o projetor do clube e uma coleção de **10 jogos** feitos de raiz.

**Aventura • Amizade • Fé**

---

## Índice

1. [Visão geral](#-visão-geral)
2. [Funcionalidades para os membros](#-funcionalidades-para-os-membros)
3. [Funcionalidades para a liderança](#️-funcionalidades-para-a-liderança)
4. [Jogos](#-jogos)
5. [Pontos: XP e Gold](#-pontos-xp-e-gold)
6. [Papéis, secções e permissões](#-papéis-secções-e-permissões)
7. [Stack](#️-stack)
8. [Instalação](#-instalação)
9. [Base de dados](#️-base-de-dados)
10. [Estrutura do código e rotas](#-estrutura-do-código-e-rotas)
11. [Convenções](#-convenções)

---

## 🌟 Visão geral

| | |
| :--- | :--- |
| **Quem usa** | Desbravadores, as suas famílias, dirigentes e coordenação do clube; visitantes e convidados em partes públicas (loja, alguns jogos, inquéritos embutidos, presenças por QR). |
| **O que faz** | Progressão com XP/Gold e ranking, eventos com confirmação de presença, presenças por QR, comunicados com push, tarefas, inquéritos, loja com desconto em Gold, ferramentas de projetor (sorteio, equipas, cronómetro, tendas e boleias, ecrã do clube) e jogos ao vivo e diários. |
| **Como está feito** | Next.js 16 (App Router, React 19) + Supabase (Auth, Postgres com RLS, Realtime, Storage, Edge Functions), alojado no plano gratuito da Vercel e do Supabase. |
| **Segurança** | Todas as permissões vivem na base de dados (RLS + RPCs `SECURITY DEFINER`); todos os pontos passam por um registo único auditável (`points_log`); os segredos dos jogos nunca vão para o realtime. |

---

## 🎒 Funcionalidades para os membros

### Conta, perfil e família
- **Registo e entrada** com email e palavra-passe (não há login com Google). O registo passa sempre pela verificação de email; `/login/reset-password` recupera a palavra-passe.
- **Onboarding** (`/onboarding`): nome, foto, data de nascimento (define a classe inicial) e sexo (obrigatório e fixo; só a coordenação o corrige).
- **Perfil** (`/profile`): dados pessoais, avatar, histórico de compras da loja, progresso no VanaTrilha, transferências de Gold e **apagar a conta** com um código enviado por email.
- **Transferir Gold** a outro membro, para incentivar a cooperação (RPC `transfer_gold`, fica no histórico).
- **Histórico de pontos** (`/points-history`): todos os movimentos de XP e Gold do membro.
- **A minha família**: uma pessoa é **Adulto** ou **Criança**.
  - Os adultos criam a família, criam perfis de criança (sem email) e convidam outras contas por código/link (`/familia/CÓDIGO`, 48 h, uma utilização).
  - **Todos os adultos da família entram nas contas de todas as crianças** (troca de sessão real na Navbar, com "Voltar para…" por cookie assinado durante 12 h). As crianças não entram nas contas dos adultos.
  - Adulto/Criança segue a idade (18+), mas só a coordenação o muda à mão. A coordenação vê e corrige todas as famílias em Membros → Famílias do clube.

### Painel do membro (`/`)
- Nível, XP, Gold e medalha de investidura.
- **Calendário de eventos** do clube + **Agenda JA** (eventos nacionais da Juventude Adventista, lidos do site público e filtrados pela secção pessoal; a inscrição é sempre feita pelo próprio no site da JA).
- Aviso "**N eventos à espera da tua resposta**".
- Comunicados (com estado lido), tarefas, inquéritos abertos e a **Pergunta da Semana**.
- **A minha tenda / o meu carro** quando a liderança publica um plano de Tendas e boleias, com o mapa do ponto de encontro.
- Introdução de **códigos** de pontos.
- Para visitantes sem conta, a mesma rota mostra a landing page com os próximos eventos e os jogos públicos.

### Eventos
- Detalhe de cada evento com local num **mapa** (Leaflet + OpenStreetMap, botões Google Maps / Waze / "Como chegar") ou **evento online** (o link só aparece a membros; o `anon` nem tem permissão de leitura da coluna `online_url`).
- **Confirmação de presença (RSVP)**: "Vou / Não vou" nos eventos que a pedem, com prazo opcional. A resposta não é presença: a liderança valida depois.
- **Convites por email** para membros por investir, com link direto para o evento (`/?evento=<id>`) e "deixar de receber" de um clique (HMAC).
- **Presenças por QR** (`/presenca/[evento]`): o projetor mostra um QR que muda a cada 30 s; quem o lê fica marcado no rascunho das presenças (até 10 min depois do início = presente, depois = atrasado). Um adulto marca-se a si e às crianças da família ("Quem está aqui?"). Visitas escrevem só o nome e são apagadas quando as presenças são finalizadas (fica só o número, por RGPD).

### Comunicados, tarefas, sugestões e inquéritos
- **Comunicados** para todos, uma secção, um papel ou membros específicos; os destinatários ficam gravados no envio e cada um tem estado lido.
- **Notificações push** (Web Push + Service Worker, também em iOS com a app instalada como PWA) sempre que há um comunicado.
- **Tarefas** com recompensa em XP/Gold: o membro conclui, a liderança aprova.
- **Caixa de sugestões** (`/suggestions`): ideias e críticas à liderança, que pode premiar uma boa sugestão.
- **Inquéritos** de escolha múltipla com recompensa por opção, resultados ao vivo opcionais, voto definitivo ou alterável até ao prazo, e resultados visíveis até 3 dias depois. Têm um **embed público** (`/embed/inquerito/[id]`, com `?qr=1`) para o Canva ou o projetor.
- **Pergunta da Semana** (`/perguntas`): uma pergunta aberta por semana, até 3 respostas por pessoa, para membros (com 5 XP) e convidados por link de convite do clube (`/perguntas/[token]`). As respostas alimentam um jogo ao vivo.

### QR codes de pontos
- Códigos criados pela liderança e impressos em A4/A5. Três tipos: **resgate automático**, **manual** e **pergunta** (só dá pontos com a resposta certa).
- Cada membro usa cada código uma vez; limite global opcional. Entrada pela câmara (`/codes/[code]`) ou escrevendo o código no Painel. Os pontos são dados só pelo servidor.

### Leaderboard e loja
- **Ranking** público (`/leaderboard`) por XP; os ajudantes continuam no ranking. Contas com "teste" no nome ou que ainda só têm o email ficam de fora (`is_hidden_from_ranking`), mas aparecem nos Membros do admin.
- **Loja** (`/shop`, pública):
  - preços fixos em euros e o **Gold dá desconto** a uma taxa dinâmica (quanto mais Gold em circulação, mais caro fica o desconto), até um máximo por artigo;
  - membros compram com desconto; **convidados sem conta** compram sem desconto;
  - artigos físicos e **chaves digitais** (a chave só é atribuída quando a compra fica paga), artigos **por encomenda** com prazo, 1 a 10 unidades com desconto de quantidade;
  - pagamento **a um coordenador do clube** (numerário, MB Way ou transferência para a conta dele), confirmado pela coordenação (só coordenadores reais; os ajudantes não mexem na loja), e cancelamento pelo próprio enquanto não houver pagamento;
  - cada encomenda tem uma **referência** (`DA-0427`) que o comprador vê no fim da compra e nos seus pedidos, e diz ao coordenador (ou escreve na descrição do MB Way);
  - ao confirmar o pagamento fica registado **como foi pago e quem recebeu**, e o dinheiro entra no [Cofre](#cofre-dinheiro-do-clube); os reembolsos saem do "em mão" de quem devolve;
  - um artigo que já teve vendas pagas não se apaga (desativa-se);
  - no máximo **3 encomendas por pagar por membro** e um teto global para convidados (`store_settings.max_guest_unpaid_orders`, 10 por omissão);
  - encomendas físicas por pagar (não as reservas) **caducam** ao fim de `store_settings.unpaid_expiry_days` dias (14 por omissão): o stock e o Gold voltam e o registo é apagado. Corre pelo `pg_cron`, se existir, e sempre que a loja ou o `/admin` abrem;
  - compras que chegaram a ser pagas ficam sempre no histórico (não se apagam);
  - o **preço de custo** não chega ao browser: a página da loja calcula os preços por quantidade no servidor (`lib/store-maintenance.ts`) e a gestão lê o custo por `get_store_product_costs()`.

---

## 🛡️ Funcionalidades para a liderança

### Painel de gestão (`/admin`)

| Aba | Quem | O que faz |
| :--- | :--- | :--- |
| Visão Geral | coordenação | métricas de participação, aniversários, distribuição de membros |
| Membros | todos | lista, cargos, ajudantes, classes e sugestões de classe por idade, investiduras, famílias do clube, convites por email, apagar membro |
| Tarefas | todos | criar tarefas e aprovar conclusões |
| Eventos | todos | criar, editar, duplicar, reagendar, cancelar (com aviso), imagem de partilha, presenças, RSVP, reverter pontos de um evento |
| Comunicados | todos | enviar e ver quem leu |
| Sugestões | todos | ler, resolver e premiar |
| Questões / QR | coordenação | criar, editar e imprimir QR codes |
| Inquéritos | coordenação | criar, abrir, fechar e finalizar votações |
| Jogos | todos (dirigentes só leem) | disponibilidade de cada jogo, analítica dos jogos a solo, multiplicador de pontos |
| Ferramentas | todos | ferramentas do projetor (ver abaixo) |
| Loja | coordenador real | produtos, encomendas, entregas, taxa do Gold, caducidade das encomendas |
| Cofre | coordenador real | quem tem dinheiro do clube, despesas, outras entradas, estornos, relatório e Excel |
| Auditoria | coordenador real | auditoria de pontos e reset de fim de época |

Cada jogo tem também uma página de gestão (`/admin/<jogo>`) para bancos de perguntas, versículos, palavras, packs e relatórios por sessão.

### Cofre: dinheiro do clube
Registo de controlo do dinheiro que passa pelo clube (especificação em `docs/Cofre.md`). **Não é a contabilidade**: a conta do clube é a da igreja. Responde a "quem tem neste momento dinheiro do clube?". Só para coordenadores reais (a aba, a RLS de `club_cash_movements` e as funções `cofre_*`).
- **Movimentos imutáveis** (`club_cash_movements`): venda da loja, reembolso, outra entrada, despesa, contagem inicial e estorno. Nada se apaga nem se edita (um trigger impede-o, mesmo às funções); os enganos corrigem-se com um **estorno** com motivo.
- **Em mão** por coordenador (vista `cofre_em_mao`), dividido em numerário e "na conta" (MB Way / transferência para a conta pessoal). As despesas e os reembolsos não podem passar do que a pessoa tem.
- **Loja ligada:** "Pago" pergunta como foi pago e quem recebeu (`mark_purchase_paid`); "Corrigir" estorna a venda errada e regista a certa (`correct_purchase_payment`); as encomendas pagas **antes do Cofre** têm o botão "Quem recebeu?" (`set_purchase_receiver`), que pergunta se o dinheiro ainda está com essa pessoa.
- **Arranque:** cada coordenador regista uma vez a **contagem inicial** do dinheiro do clube que já tem.
- **Comprovativos** (fotos ou PDF, até 5 MB) no bucket privado `cofre-comprovativos`.
- **Relatório** (`/admin/cofre/relatorio`, para imprimir) e **Excel** (`/admin/cofre/exportar`, com as folhas Resumo, Loja e Movimentos) por período: vendas por artigo com descontos Gold, recebido, custo e margem.
- **Ainda não:** entregas ao tesoureiro da igreja e pagamento direto à conta da igreja (a direção está a avaliar).

### Ajudantes
Um desbravador pode receber **acesso de gestão** de dirigente de uma secção ou de coordenação **sem deixar de ser membro** (continua no ranking e a ganhar pontos). Faz tudo menos gerir cargos. As RLS usam sempre o cargo efetivo.

### Classes e investiduras
A classe é calculada pela idade só na criação do perfil. Depois só a coordenação a muda (à mão ou aceitando as **sugestões por idade**), escolhendo se reinicia a investidura e se avisa o membro; cada mudança fica no histórico. Os dirigentes marcam a investidura dos membros da sua classe.

### Auditoria e reset de pontos
- Vista com todos os movimentos, a origem deduzida e sinais de alerta (auto-atribuições, totais que não batem com o histórico), com correção de totais.
- **Reset de fim de época** sem apagar o histórico: insere movimentos de compensação, arquiva a classificação final da época e exige escrever "RESETAR".

### Ferramentas do projetor
Todas abrem uma **janela de projetor** controlada pelo PC (sem base de dados, por `BroadcastChannel`) ou são controladas **pelo telemóvel** (estado em realtime).

| Ferramenta | O que faz |
| :--- | :--- |
| **Ecrã do Clube** | projetor fixo que mostra o logo, o **ranking animado** ("ontem" → "hoje", quem subiu e desceu), o cronómetro, o sorteio, as equipas ou as **presenças por QR** |
| **Sorteador** | sorteio de pessoas com animação de *slot*, a partir das presenças de um evento (com visitas), atalhos "Tirar dirigentes" / "Tirar ajudantes", não repetir |
| **Formador de equipas** | equipas equilibradas (idades, secções, rapazes/raparigas, dirigentes, pares a não juntar), nomes de animais e revelação no projetor; **modo Famílias** com as famílias reais juntas, nomes bíblicos e sorteio de quem joga |
| **Cronómetro** | contagem decrescente, cronómetro, chegadas de equipas com ranking e sequência de rondas |
| **Tendas e boleias** | distribui as pessoas de um evento por tendas e carros, com pontos de encontro no mapa e horas por paragem, e publica para cada membro ver no Painel |

---

## 🎮 Jogos

`/jogos` é o hub. Cada jogo pode ser **ativado/desativado**, limitado por cargo ou **escondido** (para surpresas) na aba Jogos. Os jogos a solo têm **analítica** (quem joga, vitórias, assiduidade) e campanhas de **pontos multiplicados** (até ×10).

### Ao vivo (projetor + telemóveis)
Todos têm controlo do anfitrião, ecrã de projetor e ecrã de jogador; entra-se por PIN ou código/QR. Os pontos são atribuídos no fim pelo anfitrião; os convidados escolhem um desbravador para receber os seus pontos.

| Jogo | Em que consiste |
| :--- | :--- |
| **VanaQuest** | quiz em tempo real estilo Kahoot: rapidez, sequências de acertos, multiplicador por pergunta, sala de espera com reações, pódio cinematográfico |
| **VanaEspada** | "Onde está?": aparece um excerto da Bíblia (ACF) e cada um adivinha livro → capítulo → versículo; pontuação por proximidade, prémios sem teto |
| **VanaWords** | estilo Codenames: grelha 5×5, equipas Leão e Águia, um Arauto por equipa, sessões de teste com bots |
| **VanaSketch** | estilo Pictionary: desenho no telemóvel em tempo real no projetor, packs de palavras, música e efeitos, imagem do melhor desenho |
| **VanaCamp: Infiltrados** | estilo Lobisomem (tom IASD: ninguém morre, "vai para casa"), 5 a 25 jogadores, fases com temporizador, Diretor, só para membros |
| **VanaCoro** | estilo Family Feud com as respostas da Pergunta da Semana (agrupadas por IA e revistas pelo anfitrião): duelo, 3 falhas, roubo, ronda ×2; as equipas podem ser as famílias sorteadas no Formador |

### A solo (desafio diário)
Pagam uma vez por modo por dia, com o multiplicador ativo.

| Jogo | Em que consiste |
| :--- | :--- |
| **VANTUR** | palavras bíblicas de 5 letras estilo Wordle, modos Solo / Mix (2 grelhas) / Plex (4 grelhas) |
| **VanaCódigo** | decifrar a mensagem do dia: Morse, semáforo, César, Atbash ou A1Z26 conforme o dia da semana; modos Recruta / Explorador / Mestre |
| **VanaTrilha: A Rota da Promessa** | tabuleiro bíblico pelo Êxodo: 7 estações, 8 casas, 3 vidas, casas especiais, insígnia "Peregrino da Promessa" |
| **VanaSentinela** | "Verdade ou Distorção?": *swipe* de citações por pack, combo e rapidez, ranking com membros e convidados (público) |

---

## 💰 Pontos: XP e Gold

- **XP** mede a progressão: nível = `floor(XP / 1000) + 1`.
- **Gold** é a moeda: dá desconto na loja e pode ser transferido.
- **Regra de ouro:** todos os pontos entram como uma linha em `points_log`. Os totais do perfil são recalculados por trigger e o trigger `protect_point_totals` rejeita qualquer outro valor.
- Origens: presenças em eventos, QR codes, tarefas, sugestões, inquéritos, Pergunta da Semana, jogos e atribuição manual (dirigentes só à sua classe).
- As descrições dos movimentos identificam a origem na Auditoria e na analítica: não se mudam sem atualizar essas contagens.

---

## 🔒 Papéis, secções e permissões

| Papel | Visibilidade e ações |
| :--- | :--- |
| **Desbravador** | os seus dados, o ranking público e os jogos |
| **Dirigente** | gere a sua `leadership_section`: membros, presenças, tarefas, sugestões, investiduras |
| **Coordenador** | acesso total ao clube |
| **Ajudante** | desbravador com acesso de dirigente ou coordenador, sem sair do ranking |

| Secção | Cor | Idade aprox. |
| :--- | :--- | :--- |
| Rebentos | 🟢 Esmeralda | 3–5 |
| Tições | 🔴 Bordeaux | 6–10 |
| Exploradores | 🟡 Amarelo | 11–15 |
| Companheiros | 🔵 Azul | 16–23 |
| Embaixadores | ⚪ Cinza/Dourado | liderança / +23 |

**Como é garantido**
- As RLS usam funções `SECURITY DEFINER` que devolvem o valor efetivo: `get_my_role()`, `get_my_section()`, `get_my_leadership_section()` e `get_my_real_role()` (cargo real, para a gestão de cargos).
- **Verificações à prova de NULL:** sem sessão, `get_my_role()` e `get_my_real_role()` devolvem `NULL`, e `NULL <> 'coordenador'` não dispara o `RAISE`. Nunca usar `<>`, `NOT IN` nem `IF NOT (...)` numa verificação de permissão: usar `IS DISTINCT FROM`, `COALESCE(..., '') NOT IN (...)` ou `NOT COALESCE(..., false)`. As funções de gestão também não têm `EXECUTE` para o `anon`.
- Dinheiro (loja: pagamentos, reembolsos, preços, chaves digitais) usa sempre `get_my_real_role()`: os ajudantes nunca lhe tocam.
- Salvaguardas por trigger: `protect_role_columns` (só o coordenador real muda cargos), `protect_point_totals` e `protect_gender_column`.
- O cliente `createServiceClient()` (ignora a RLS) só é usado em server actions e route handlers, depois das verificações de permissão.
- Segredos dos jogos (respostas, papéis, palavras) não têm política de SELECT nem estão no realtime: leem-se por RPCs que filtram pelo estado da sessão.

---

## 🛠️ Stack

| Camada | Tecnologia |
| :--- | :--- |
| Frontend | Next.js 16.1 (App Router), React 19.2, TypeScript |
| Estilo | Tailwind CSS v4, shadcn/ui (Radix), Lucide |
| Formulários | React Hook Form + Zod 4 |
| Backend | Supabase: Auth, PostgreSQL com RLS, Realtime, Storage, Edge Functions |
| Mapas | Leaflet + OpenStreetMap / Nominatim (sem chave) |
| Push | Web Push API (`web-push`) + Edge Function `send-push` |
| Email | Gmail do clube por SMTP (`nodemailer`) |
| IA (VanaCoro) | qualquer API compatível com OpenAI (por omissão o Groq) |
| Outros | `@dnd-kit`, `canvas-confetti`, `html-to-image`, `qrcode.react`, `sonner` |
| Testes | `bun test` (regras puras em `utils/` e `lib/`) |
| Alojamento | Vercel |

---

## 🚀 Instalação

### 1. Requisitos
- Node.js 20+ (ou Bun)
- Um projeto Supabase
- Opcional: conta Gmail do clube com palavra-passe de aplicação (convites por email) e chave de uma API de IA (VanaCoro)

### 2. Código
```bash
git clone https://github.com/Dani77777777/desbravadores-abrantes.git
cd desbravadores-abrantes
npm install
```

### 3. Variáveis de ambiente (`.env.local` e Vercel)

| Variável | Obrigatória | Para quê |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | chave pública |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | server actions que ignoram a RLS (só no servidor) |
| `NEXT_PUBLIC_SITE_URL` | ✅ | URL público do site (QR codes, links dos emails) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | push | chave pública VAPID das notificações |
| `VAPID_PRIVATE_KEY` | push | chave privada VAPID |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` | — | bucket das imagens (por omissão `imagens`) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | convites | envio dos convites por email (~500 destinatários/dia) |
| `VANACORO_AI_API_KEY` | VanaCoro | agrupar respostas com IA |
| `VANACORO_AI_BASE_URL`, `VANACORO_AI_MODEL` | — | por omissão `https://api.groq.com/openai/v1` e `openai/gpt-oss-120b` |
| `PERGUNTAS_IP_SALT` | — | sal do hash de IP da Pergunta da Semana (por omissão usa a service role) |

Gerar as chaves VAPID:
```bash
npx web-push generate-vapid-keys
```

### 4. Base de dados
Ver [Base de dados](#️-base-de-dados): num projeto novo basta correr **um ficheiro**.

### 5. Correr
```bash
npm run dev
```

```bash
bun test
```

```bash
npm run lint
```

---

## 🗄️ Base de dados

### Projeto novo: um só ficheiro
[`supabase-schema-completo.sql`](supabase-schema-completo.sql) cria **toda** a base de dados de uma vez, numa só transação:

- 5 enums, 91 tabelas, 4 vistas, 106 funções/RPCs, 23 triggers, 53 índices e 164 políticas RLS;
- as permissões exatas (incluindo as permissões por coluna do `anon` e as RPCs só para o `service_role`);
- o trigger que cria o perfil quando alguém se regista (`on_auth_user_created`);
- o bucket `imagens` e as suas políticas (avatares e produtos da loja);
- as 25 tabelas publicadas no Realtime (com `REPLICA IDENTITY FULL` onde é preciso);
- os dados iniciais: definições dos jogos e da loja, perguntas do VanaTrilha, versículos do VanaEspada, packs do VanaSketch e o banco inicial da Pergunta da Semana.

Corre-se no **SQL Editor** do Supabase (colar tudo → Run) ou com `psql`:
```bash
psql "<connection string do projeto>" -f supabase-schema-completo.sql
```

> [!IMPORTANT]
> É para um projeto **vazio**. Na base de produção continuam a usar-se as migrações individuais (abaixo).

> [!TIP]
> Para montar o site para **outro clube** (ex.: Angra do Heroísmo), seguir o [NOVO-CLUBE.md](NOVO-CLUBE.md): o que mudar no código, o fuso horário dos Açores e a configuração do Supabase e da Vercel.

Depois de correr o SQL:
1. **Auth → URL Configuration:** Site URL = `NEXT_PUBLIC_SITE_URL` e Redirect URL `<site>/auth/callback`. Manter a confirmação de email ligada.
2. **Auth → Email Templates:** copiar os modelos de `supabase/templates/` (`magic-link.html` envia o código de confirmação para apagar a conta; `email-change.html`).
3. **Notificações push:** fazer deploy da Edge Function e definir os segredos dela:
   ```bash
   supabase functions deploy send-push
   ```
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_EMAIL=...
   ```
   e criar o webhook em **Database → Webhooks**: tabela `public.announcements`, evento `INSERT`, Edge Function `send-push` (há um modelo em SQL no fim do ficheiro).
4. **Primeiro coordenador:** criar a conta no site, fazer o onboarding e correr o comando da secção 5.2 do ficheiro (põe `role = 'coordenador'`). A partir daí os cargos geram-se no painel.

### Migrações individuais (base existente)
Não há ferramenta de migrações: cada `supabase-*.sql` na raiz é corrido à mão no SQL Editor e é idempotente. O `supabase-schema-completo.sql` é o resultado de as aplicar todas por esta ordem (os `supabase-teste-*.sql` são só dados de teste do VanaCoro e não entram):

<details>
<summary>Ordem das migrações</summary>

1. `supabase-setup.sql`
2. `supabase-push-setup.sql`
3. `supabase-setup-store.sql`
4. `supabase/migrations/20260225_qr_system.sql`
5. `supabase/migrations/20240301_qr_limit_trigger.sql`
6. `supabase-setup-vantur.sql`
7. `supabase-setup-vana-quest.sql` → `-vana-quest-v2` → `-v3` → `-v4` → `-v5`
8. `supabase-setup-vana-camp.sql` → `-vana-camp-v2-test-mode`
9. `supabase-setup-surveys.sql`
10. `supabase-setup-vana-words.sql` → `-vana-words-word-bank` → `-vana-words-realtime-delete`
11. `supabase-setup-surveys-embed.sql`
12. `-vana-quest-explanation` → `-vana-quest-rewards-decision`
13. `-event-revert` → `-helpers` → `-event-optional-end` → `-store-product-images`
14. `-vana-words-reveal-on-finish` → `-vana-words-swap-request` → `-vana-words-arauto-choice` → `-vana-words-public-present`
15. `-store-v2-euros` → `-levels-revert`
16. `supabase-setup-vana-codigo.sql`
17. `supabase-setup-vana-sketch.sql` → `-vana-sketch-bots`
18. `supabase-setup-vana-trilha.sql` → `supabase-seed-vana-trilha-questions.sql`
19. `-classes-and-announcements` → `-points-security-audit` → `-role-safeguards` → `-points-reset`
20. `-game-settings` → `-game-settings-vana-camp` → `-vana-sketch` → `-vana-codigo` → `-vana-espada`
21. `supabase-setup-vana-espada.sql` → `supabase-seed-vana-espada.sql` → `-vana-espada-acf-fix`
22. `-game-points-multiplier`
23. `supabase-setup-tools-raffle.sql` → `-audit-helper-label` → `-event-rsvp`
24. `supabase-setup-tools-timer-trips.sql` → `supabase-setup-tools-teams.sql` → `supabase-setup-tools-club-screen.sql` → `-leaderboard-dirigentes`
25. `-store-preorders` → `-store-quantity` → `-store-self-cancel` → `-store-volume-discount`
26. `supabase-setup-game-analytics.sql` → `-event-location-map`
27. `supabase-setup-vana-sentinela.sql` → `-vana-sentinela-convidados-premios` → `-game-analytics-vana-sentinela`
28. `-event-online` → `-event-rsvp-leader-response`
29. `supabase/migrations/20261017_family_accounts.sql` → `20261017_family_accounts_multiple_profiles.sql`
30. `-event-invites` → `-vana-sketch-fixes` → `-vana-sketch-packs`
31. `supabase-setup-vana-coro.sql` → `supabase-seed-vana-coro-perguntas.sql` → `-vana-coro-grupos` → `-audit-vanasketch` → `-vana-coro-jogo` → `-vana-coro-duelo` → `-vana-coro-familias`
32. `supabase-setup-event-checkin.sql` → `-club-families` → `-audit-pergunta-semana`
33. `-store-security-fix`
34. `-cofre`
35. `-ranking-hide-tests`
36. `-club-families-delete-fix`

(`-x` = `supabase-migration-x.sql`.)
</details>

Regras ao escrever uma migração nova:
- idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE`); `DROP FUNCTION` antes de mudar o tipo de retorno;
- quando um setup já foi corrido, a migração tem só a diferença;
- verificações de permissão à prova de `NULL` (ver "Como é garantido");
- só se publicam no Realtime tabelas **sem segredos**; os listeners de DELETE filtrados precisam de `REPLICA IDENTITY FULL`;
- depois, voltar a gerar o `supabase-schema-completo.sql` para ele continuar a ter tudo.

---

## 📂 Estrutura do código e rotas

```text
app/            rotas (páginas, server actions e route handlers)
  admin/        painel de gestão, ferramentas e gestão de cada jogo
  jogos/        um diretório por jogo (control / present / play / as)
  api/          family-accounts, push/subscribe, perguntas, convites/sair, pontuação do VanaSentinela
components/     UI por domínio (events/, shop/, vana-quest/, game-lobby/, game-podium/, ui/ …)
lib/actions/    server actions (I/O com o Supabase)
utils/          regras puras e testáveis (pontuação, equipas, sorteio, check-in …)
types/          tipos de cada jogo
supabase/       Edge Function send-push, modelos de email e migrações antigas
docs/           especificações (Cofre, VanaCoro, VanaEspada, VanaTrilha)
NOVO-CLUBE.md   guia para criar o site de outro clube
supabase-*.sql  setup e migrações; supabase-schema-completo.sql = tudo junto
```

Padrão dos módulos mais recentes: `types/` → `utils/` (regras puras com testes) → `lib/actions/` (I/O) → `components/`.

**Rotas principais**
- Membros: `/`, `/onboarding`, `/login`, `/profile`, `/points-history`, `/leaderboard`, `/shop`, `/suggestions`, `/contacts`, `/codes/[code]`, `/perguntas`, `/presenca/[eventId]`, `/familia/[code]`
- Gestão: `/admin?tab=…`, `/admin/ferramentas/{ecra,sorteio,equipas,cronometro,tendas}` (+ `/projetor`), `/admin/cofre/{relatorio,exportar}`, `/admin/<jogo>`
- Jogos: `/jogos`, `/jogos/<jogo>/…`, `/j/[code]` (link curto dos QR para VanaWords, VanaSketch e VanaCoro)
- Públicas: `/shop`, `/embed/inquerito/[id]`, `/perguntas/[token]`, `/convites/sair`, VanaEspada, VanaSentinela e os ecrãs de projetor

---

## 📏 Convenções

- **A semana começa ao domingo** e acaba ao sábado. Em SQL nunca se usa `date_trunc('week')`.
- O "dia" do clube é o de **Lisboa** (`Europe/Lisbon`); o servidor corre em UTC.
- Interface em **português de Portugal**, com tom adventista (IASD). Nos jogos nunca se diz "apostar".
- Só o plano gratuito da Vercel e do Supabase: sem workers pagos, e os telemóveis enviam por `httpSend` em vez de subscreverem canais com muito tráfego.
- Nunca automatizar inscrições no site da Juventude Adventista.
- Nos filtros por secção usa-se sempre a secção pessoal, também para coordenadores.

---

Desenvolvido para o **Clube de Desbravadores de Abrantes**. Para suporte ou ideias, falar com a equipa de tecnologia do clube ou usar a Caixa de Sugestões da plataforma.
