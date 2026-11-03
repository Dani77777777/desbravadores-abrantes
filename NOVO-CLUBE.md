# Montar o site para outro clube

Guia para criar uma cópia desta plataforma para outro clube de Desbravadores (ex.: **Angra do Heroísmo**). O código serve para qualquer clube. O que é de Abrantes está fixo nos ficheiros listados abaixo e muda-se à mão.

> [!IMPORTANT]
> Cada clube tem **o seu** projeto Supabase, **o seu** projeto Vercel e **as suas** chaves. Nunca se reutilizam o `.env.local`, as chaves VAPID, a service role nem os dados de Abrantes.

Resumo:
1. [Copiar o repositório](#1-copiar-o-repositório)
2. [Mudar o que é de Abrantes no código](#2-mudar-o-que-é-de-abrantes-no-código)
3. [Criar a base de dados](#3-criar-a-base-de-dados)
4. [Configurar o Supabase](#4-configurar-o-supabase)
5. [Publicar na Vercel](#5-publicar-na-vercel)
6. [Primeiros passos no site](#6-primeiros-passos-no-site)
7. [Verificação final](#7-verificação-final)

---

## 1. Copiar o repositório

- Criar um repositório novo (ex.: `desbravadores-angra`) a partir deste. Pode ser uma cópia com o histórico ou só com o estado atual.
- **Não copiar:** `.env.local`, `.vercel/`, `.next/`, `node_modules/`, `graphify-out/` (já estão no `.gitignore`).
- Na raiz há ficheiros só de Abrantes que podem ser apagados na cópia: `Musica-Reel-Anilha-24s.mp3`, `Aventura, Amizade e Fé.mp3`, `VanaWords-handoff.zip`.
- O submódulo `vendor/pt-br` só é preciso para voltar a gerar a lista de palavras do VANTUR (`npm run words`).

```bash
npm install
```

---

## 2. Mudar o que é de Abrantes no código

### 2.1 Nome do clube
Trocar "Desbravadores (de) Abrantes", "DBV Abrantes" e "Abrantes" pelo nome do clube novo:

| Onde | Ficheiro |
| :--- | :--- |
| Título e descrição do site (SEO, separador) | `app/layout.tsx` (linhas 10–11) |
| Barra de navegação ("DBV Abrantes" / "Desbravadores Abrantes") | `components/layout/Navbar.tsx` (152–154) |
| Ecrãs de login/registo | `components/auth/AuthShell.tsx` (29, 42, 118) |
| Rodapé | `components/landing/SiteFooter.tsx` (18, 33) |
| Página de erro de autenticação | `app/auth/auth-code-error/page.tsx` (59, 112) |
| Títulos de páginas | `app/convites/sair/page.tsx` (6), `app/jogos/indisponivel/[gameId]/page.tsx` (13), `app/jogos/vana-trilha/como-jogar/page.tsx` (25, 33) |
| Impressão dos QR codes | `app/admin/components/QrPrintDialog.tsx` (131, 200) |
| Embed dos inquéritos | `app/embed/inquerito/[id]/page.tsx` (109) |
| Ecrã do Clube (logo e ranking) | `components/club-screen/LogoStage.tsx` (29), `components/club-screen/RankingBoard.tsx` (295) |
| Imagem de partilha dos eventos | `components/events/EventShareDialog.tsx` (297, 373) |
| Imagens de partilha e projetores dos jogos | `components/vana-camp/VanaCampVictoryCard.tsx` (144), `components/vana-coro/WinnersShare.tsx` (421), `components/vana-quest/PodiumShareCard.tsx` (181), `components/vana-words/ProjectorView.tsx` (551), `components/vana-words/WinnersShareCard.tsx` (166) |
| Emails dos convites (remetente e texto) | `lib/email.ts` (`CLUB_NAME`, linha 13) |
| Notificações push (título por omissão) | `public/sw.js` (2, 19) |
| App instalável (PWA) | `public/manifest.json` (`name`, `short_name`, `description`) |
| Modelos de email do Supabase | `supabase/templates/email-change.html` e `magic-link.html` (22, 28, 41/50) |
| Nome do pacote e README | `package.json` (`name`), `README.md` |

### 2.2 Landing page
`components/landing/LandingPage.tsx` tem texto escrito para Abrantes (linhas ~142, 235, 247, 407–460 "O nosso clube", 752). Reescrever com a história e as fotos do clube novo.

### 2.3 Contactos
`app/contacts/page.tsx` (linhas 26–29, 135, 177): Instagram, YouTube, email da direção e morada da sede.

### 2.4 Endereço do site
O endereço público vem de `NEXT_PUBLIC_SITE_URL`, mas há sítios com o de Abrantes escrito:

| Ficheiro | O quê |
| :--- | :--- |
| `app/sitemap.ts` (4) | `baseUrl` |
| `app/jogos/vana-trilha/como-jogar/page.tsx` (20) | URL por omissão |
| `components/events/EventShareDialog.tsx` (40) | `SITE_URL` impresso na imagem de partilha |
| `components/vana-sketch/ProjectorView.tsx` (194) | "Entra em desbravadores-abrantes → Jogos" |
| `components/vana-trilha/RunShareCard.tsx` (21) | só o comentário de exemplo |

### 2.5 Imagens
Substituir em `public/images/` mantendo **os mesmos nomes de ficheiro** (assim não é preciso mexer no código):

| Ficheiro | Onde aparece |
| :--- | :--- |
| `Logo Desbravadores.png` | logo do site, Navbar, login, Ecrã do Clube, QR impressos, carregamento (só se o clube usar outro logo) |
| `desbravadores todos 2.jpg` | foto do grupo na landing e no login |
| `perfil.jpg` | ícone da app instalada (`public/manifest.json`) e outros sítios |
| `desbravadores todos.jpeg`, `desbravadores.png`, `public/icon.png` | não são usados pelo código; podem ser apagados ou trocados |
| `vanatrilha-anuncio*.png` | anúncios do VanaTrilha para as redes (opcional) |

Os logos dos jogos (`VanaQuest.png`, `VanaWords.png`, …) servem para qualquer clube.

### 2.6 Mapa
- `utils/maps.ts` (14): `DEFAULT_CENTER`, o centro do mapa ao criar eventos. Para Angra do Heroísmo: `{ lat: 38.6546, lng: -27.2167 }`.
- `components/events/LocationPicker.tsx` (72): exemplo de morada no campo de local.

### 2.7 Fuso horário (obrigatório nos Açores)
O "dia do clube" (prémios diários, jogos a solo, rankings semanais, datas nos emails e nas imagens) está calculado em `Europe/Lisbon`. Nos Açores é **`Atlantic/Azores`** (uma hora a menos). Se ficar como está, os jogos diários mudam de dia às 23:00 de Angra.

Tem de ser mudado **no código e no SQL ao mesmo tempo**:

- **Código:** trocar `Europe/Lisbon` por `Atlantic/Azores` em:
  `app/admin/components/event-utils.ts`, `app/jogos/page.tsx`, `app/points-history/page.tsx`, `components/events/EventShareDialog.tsx`, `components/landing/NextEventCard.tsx`, `components/perguntas/QuestionBoard.tsx`, `components/vana-coro/QuestionQueueAdmin.tsx`, `lib/actions/daily-game-stats.ts`, `lib/email.ts`, `utils/event-rsvp.ts`, `utils/game-analytics.ts`, `utils/vana-codigo/day.ts`, `utils/vana-coro/schedule.ts`, `utils/vana-trilha.ts` (e os testes que o usem).
- **SQL:** em `supabase-schema-completo.sql`, **antes de o correr**, trocar `Europe/Lisbon` por `Atlantic/Azores` (8 sítios: `award_vantur_rewards`, `award_vana_sentinela_rewards`, `get_vana_sentinela_ranking`, `log_singleplayer_play`, `log_vana_sentinela_play`, `vana_codigo_day_start` e o valor por omissão de `vanatrilha_daily_runs.run_date`).

Comando para fazer as duas coisas de uma vez (Git Bash):
```bash
grep -rl "Europe/Lisbon" app components lib utils supabase-schema-completo.sql | xargs sed -i 's#Europe/Lisbon#Atlantic/Azores#g'
```

Também há comentários que dizem "Lisboa"; não afetam o funcionamento.

### 2.8 Domínio interno dos perfis de criança
`utils/club-families.ts` (31): `MANAGED_EMAIL_DOMAIN = 'family.desbravadores-abrantes.invalid'`. É o email falso dos perfis de criança sem email. Mudar para o clube novo (ex.: `family.desbravadores-angra.invalid`) **antes** de criar o primeiro perfil de criança, e atualizar `utils/club-families.test.ts`. Depois de haver perfis criados, já não se muda.

### 2.9 Conteúdos regionais
- **VanaSentinela** é sobre as pregações do Evangelista Jefferson Araújo em Abrantes (`utils/vana-sentinela/packs.ts`, `utils/vana-sentinela/packs/abrantes.json`, `app/jogos/vana-sentinela/page.tsx` (14, 82) e as etiquetas em `utils/game-analytics.ts` (15)). Opções: **desativar ou esconder** o jogo em Gestão → Jogos, ou criar packs próprios no mesmo formato (um `.json` por pack, registado em `packs.ts`).
- **Agenda JA** (`utils/ja-agenda.ts`) lê a agenda nacional da Juventude Adventista (juventudeadventista.pt). Serve para qualquer clube da UPASD; confirmar que os eventos dos Açores aparecem como esperado.
- **Notificações push:** `supabase/functions/send-push/index.ts` (25) tem `admin@desbravadoresabrantes.pt` como email VAPID por omissão. Definir o segredo `VAPID_EMAIL` com um email do clube novo.

### 2.10 O que NÃO é preciso mudar
- Secções (Rebentos, Tições, Exploradores, Companheiros, Embaixadores), papéis, pontos e regras: são os da UPASD e estão na base de dados como enums.
- Os jogos, os bancos de perguntas, versículos, packs do VanaSketch e a Pergunta da Semana: são genéricos.
- Os testes que falam em "abrantes" (`lib/vana-sentinela/score-handler.test.ts`, `utils/vana-sentinela/game.test.ts`, `utils/game-analytics.test.ts`) só usam o nome do pack; só mudam se o pack mudar.

Para confirmar que não ficou nada para trás:
```bash
grep -rniE "abrantes|Europe/Lisbon" app components lib utils public supabase/functions supabase/templates --include=*.ts --include=*.tsx --include=*.json --include=*.js --include=*.html
```

---

## 3. Criar a base de dados

1. Criar um projeto novo no [Supabase](https://supabase.com/dashboard) (região da UE, ex.: Frankfurt ou Londres).
2. Confirmar o fuso do SQL (ponto 2.7).
3. SQL Editor → colar `supabase-schema-completo.sql` → **Run**. Cria tudo numa só transação: tabelas, funções, RLS, permissões, bucket `imagens`, Realtime, o trigger que cria o perfil no registo e os dados iniciais dos jogos. Não traz nenhum dado de Abrantes (membros, eventos, pontos, produtos).

> [!WARNING]
> Se depois disso entrar uma migração nova neste repositório (`supabase-migration-*.sql`), corre-se também no projeto do clube novo. Ver a ordem das migrações no `README.md`.

---

## 4. Configurar o Supabase

1. **Authentication → URL Configuration:** Site URL = o endereço do site novo; Redirect URLs = `<site>/auth/callback`.
2. **Authentication → Providers → Email:** manter a confirmação de email ligada. Não ligar Google nem outros logins sociais (o site não os usa).
3. **Authentication → Email Templates:** colar `supabase/templates/magic-link.html` ("Magic Link") e `email-change.html` ("Change Email Address"), já com o nome do clube novo.
4. **Authentication → SMTP (recomendado):** usar o Gmail do clube novo, para os emails não saírem do remetente genérico do Supabase (que tem limite baixo).
5. **Notificações push:**
   ```bash
   npx web-push generate-vapid-keys
   ```
   ```bash
   supabase functions deploy send-push --project-ref <ref-do-projeto-novo>
   ```
   ```bash
   supabase secrets set --project-ref <ref-do-projeto-novo> VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_EMAIL=...
   ```
   Depois, **Database → Webhooks → Create:** tabela `public.announcements`, evento `INSERT`, tipo Supabase Edge Functions, função `send-push`.

---

## 5. Publicar na Vercel

1. Importar o repositório novo num projeto Vercel novo.
2. Variáveis de ambiente (Production e Preview):

| Variável | Valor |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase novo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key do projeto novo |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do projeto novo |
| `NEXT_PUBLIC_SITE_URL` | endereço do site novo (ex.: `https://desbravadores-angra.vercel.app`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | as chaves VAPID **novas** do ponto 4.5 |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail do clube novo (palavra-passe de aplicação, com verificação em 2 passos) |
| `VANACORO_AI_API_KEY` | opcional, chave do Groq (ou outra API compatível com OpenAI) para o VanaCoro |
| `PERGUNTAS_IP_SALT` | opcional, texto aleatório |

3. Se houver domínio próprio, ligá-lo na Vercel e atualizar `NEXT_PUBLIC_SITE_URL` e as URLs do Supabase (ponto 4.1).

---

## 6. Primeiros passos no site

1. Criar a conta do responsável no site e fazer o onboarding.
2. No SQL Editor, promovê-la a coordenador (comando da secção 5.2 no fim de `supabase-schema-completo.sql`):
   ```sql
   BEGIN;
   SELECT set_config('app.allow_role_change', 'on', true);
   UPDATE public.profiles SET role = 'coordenador'
    WHERE id = (SELECT id FROM auth.users WHERE email = '<email-da-conta>');
   COMMIT;
   ```
3. No painel `/admin`:
   - **Membros:** nomear dirigentes (com a secção) e ajudantes, à medida que os membros se registam.
   - **Jogos:** escolher que jogos ficam ativos (desativar o VanaSentinela se não houver packs próprios).
   - **Loja:** criar os produtos e rever a taxa do Gold.
   - **Eventos:** criar os primeiros eventos.
   - Pergunta da Semana (`/admin/vana-coro`): gerar um link de convite novo e agendar a fila de perguntas.

---

## 7. Verificação final

- [ ] O `grep` do ponto 2.10 não encontra nada de Abrantes (a não ser o que se decidiu manter).
- [ ] O fuso está igual no código e no SQL.
- [ ] Registo com um email novo: chega o email de confirmação, o link volta ao site e o onboarding cria o perfil na classe certa.
- [ ] O primeiro coordenador vê todas as abas do `/admin`.
- [ ] Um comunicado de teste chega como notificação push a um telemóvel subscrito.
- [ ] Um evento com local mostra o mapa no sítio certo.
- [ ] Um jogo diário (ex.: VANTUR) paga o prémio e bloqueia até ao dia seguinte à meia-noite local.

```bash
npm run lint
```

```bash
bun test
```

```bash
npm run build
```
