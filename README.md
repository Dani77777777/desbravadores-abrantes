# 🏕️ Clube de Desbravadores - Abrantes

Plataforma de gamificação e gestão para o Clube de Desbravadores de Abrantes, desenvolvida com foco na motivação e organização seguindo as diretrizes da UPASD Portugal.

---

## 🌟 Visão Geral

O projeto **Desbravadores Abrantes** é uma plataforma "Mobile-First" que transforma a progressão dos desbravadores numa experiência interativa. Através de um sistema de XP (Experiência) e Gold (Moedas), os membros são recompensados pela sua participação, pontualidade e dedicação às atividades do clube.

### ✨ Funcionalidades Principais

#### 🎒 Para Desbravadores
- **Dashboard Personalizado:** Visualização de progresso, saldo de Gold e medalha de investidura.
- **Ranking (Leaderboard):** Tabela classificativa pública em tempo real entre todos os membros.
- **Agenda de Eventos:** Consulta de próximas atividades, localizações e recompensas previstas.
- **Sistema de Tarefas e Loja:** Conclusão de objetivos e troca de Gold por recompensas físicas na loja.
- **Transferência de Gold:** Envio de moedas entre amigos para incentivar a cooperação.
- **Caixa de Sugestões:** Canal direto para enviar críticas ou ideias à liderança.
- **Histórico de Pontos:** Transparência total sobre como e quando os pontos foram ganhos.
- **Anúncios Globais:** Avisos importantes em destaque para todos os membros.
- **Resgate de Códigos QR:** Leitura de códigos QR para receber pontos em atividades e eventos.

#### 🛡️ Para Liderança (Dirigentes e Coordenadores)
- **Painel de Gestão Admin:** Visão consolidada de secções com dashboard horizontal otimizado.
- **Visão Geral (Coordenadores):** Dashboard de métricas com estatísticas de engajamento, aniversários e distribuição de membros.
- **Controlo de Presenças por Evento:** Gestão de presenças com filtragem automática por faixa etária — os eventos direcionados a uma secção só mostram os membros dessa secção na lista de presenças.
- **QR Codes:** Criação, edição e impressão de QR Codes (A4/A5) para check-in por scan, com limites globais de resgate.
- **Gestão de Loja e Entregas:** Widget prático para gerir as entregas pendentes dos produtos da loja.
- **Emissão de Comunicados:** Sistema de anúncios globais ou direcionados (por pessoa, secção ou papel).
- **Gestão de Investiduras:** Toggle manual para marcar a conclusão de classes.
- **Moderação de Sugestões:** Leitura, gestão e resolução do feedback recebido, com atribuição de pontos.
- **Gestão de Tarefas:** Criação de tarefas com recompensas de XP/Gold, aprovação de conclusões.
- **Gestão de Eventos:** Criação, edição, reagendamento e cancelamento de eventos com notificação automática.

---

## 🔒 Filtragem por Faixa Etária e Hierarquia

O sistema aplica filtragem rigorosa baseada no papel do utilizador:

| Papel | Visibilidade |
| :--- | :--- |
| **Desbravador** | Apenas os seus próprios dados e o ranking público. |
| **Dirigente** | Apenas os membros da sua `leadership_section` (secção de liderança atribuída). |
| **Coordenador** | Acesso total a todos os dados e ferramentas do clube. |

### Presenças com Faixa Etária
- Quando um evento é criado com uma secção alvo (ex: "Exploradores"), a lista de presenças **mostra apenas** os membros dessa secção.
- Os dirigentes vêem apenas os desbravadores da sua faixa etária atribuída, independentemente do público alvo do evento.
- Os coordenadores vêem os membros filtrados pela secção do evento, ou todos se o evento for para "Todos".

---

## 👤 Secções e Cores

O sistema adapta-se visualmente à secção do utilizador, calculada automaticamente pela data de nascimento:

| Secção | Cor Principal | Faixa Etária (Aprox.) |
| :--- | :--- | :--- |
| **Rebentos** | 🟢 Esmeralda | 3 - 5 anos |
| **Tições** | 🔴 Bordeaux | 6 - 10 anos |
| **Exploradores** | 🟡 Amarelo | 11 - 15 anos |
| **Companheiros** | 🔵 Azul | 16 - 23 anos |
| **Embaixadores** | ⚪ Cinza/Dourado | Liderança / +23 anos |

---

## 🛠️ Stack Tecnológica

- **Frontend:** [Next.js 15+](https://nextjs.org/) (App Router, React 19)
- **Estilo:** [Tailwind CSS v4](https://tailwindcss.com/) & [Shadcn/UI](https://ui.shadcn.com/)
- **Backend:** [Supabase](https://supabase.com/) (Auth, PostgreSQL, Real-time, Storage)
- **Notificações:** Web Push API (Service Workers)
- **Ícones:** [Lucide React](https://lucide.dev/)
- **Formulários:** React Hook Form + Zod

---

## 🚀 Guia de Início Rápido

### 1. Requisitos
- Node.js 18.x ou superior.
- Conta no Supabase.

### 2. Instalação
```bash
git clone <url-do-repositorio>
cd desbravadores-abrantes
npm install
```

### 3. Configuração de Ambiente
Crie um `.env.local` com:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
NEXT_PUBLIC_VAPID_PUBLIC_KEY=sua-chave-push-publica
VAPID_PRIVATE_KEY=sua-chave-push-privada
# Opcional: agrupar respostas com IA (API compatível com OpenAI; por omissão o Groq)
VANACORO_AI_API_KEY=sua-chave-groq
# VANACORO_AI_BASE_URL=https://api.groq.com/openai/v1
# VANACORO_AI_MODEL=openai/gpt-oss-120b
```

### 4. Base de Dados
O coração do sistema reside no arquivo `supabase-setup.sql`. Execute este script no editor SQL do Supabase para configurar:
- Tabelas e Enums.
- **RLS (Row Level Security):** Proteção rigorosa de dados.
- **Triggers:** Automação de criação de perfis, cálculo de secção por idade e sincronização de totais de XP/Gold.
- **Functions:** Lógica de transferência de ouro e cálculo de classes.

Ficheiros SQL adicionais:
- `supabase-setup-store.sql` — Configuração da loja (produtos, compras, entregas).
- `supabase-push-setup.sql` — Configuração de notificações push.
- `supabase-setup-vantur.sql` — VANTUR (sessões, dicionários e RPCs de sorteio). Correr antes de `supabase-setup-game-analytics.sql` e de `supabase-migration-game-points-multiplier.sql`.

---

## 📂 Estrutura de Pastas

```text
app/
├── admin/          # Painel de controlo (Tabs: Overview, Members, Tasks, Events, Announcements, Suggestions, QR, Store)
│   └── components/ # Componentes do admin (EventPanel, EventAttendanceManager, MemberList, etc.)
├── auth/           # Callbacks de autenticação
├── codes/          # Resgate de códigos QR
├── contacts/       # Informação útil e redes sociais
├── leaderboard/    # Ranking público de membresia
├── login/          # Login e registo com magic links
├── onboarding/     # Setup inicial do perfil
├── points-history/ # Registo detalhado de ganhos/gastos
├── profile/        # Edição de perfil e transferências
├── shop/           # Loja de recompensas
└── suggestions/    # Sistema de feedback
components/
├── dashboard/      # Componentes do dashboard (CodeEntryDialog, ManualClaimForm)
├── events/         # Calendar e Card de eventos
├── layout/         # Navbar dinâmica
├── notifications/  # Gestor de notificações push
├── profile/        # Dialogs e Avatars
├── shop/           # Componentes da loja
└── ui/             # Componentes base (Shadcn)
lib/
└── actions/        # Server Actions (QR codes)
utils/
└── supabase/       # Configuração client/server/middleware
```

---

## 🔐 Segurança e Regras

1. **Privacidade:** Membros só vêem os seus próprios dados e o ranking básico.
2. **Hierarquia:** 
   - **Dirigentes:** Gerem apenas a sua secção atribuída (`leadership_section`). Presenças, tarefas, sugestões e membros são filtrados pela sua secção.
   - **Coordenadores:** Acesso total a todos os dados e ferramentas do clube.
3. **Filtragem de Presenças por Secção:** Eventos com faixa etária específica mostram apenas os membros dessa faixa na lista de presenças.
4. **Persistência:** Todo o XP e Gold é auditado através da tabela `points_log`, impedindo alterações manuais sem rasto.
5. **RLS (Row Level Security):** Todas as tabelas têm políticas de segurança ao nível da base de dados, garantindo que mesmo chamadas diretas à API são controladas.
6. **Limites de Resgate:** Os QR Codes têm limites globais de resgate controlados por trigger na base de dados.

## 🤝 Contacto e Suporte

Este projeto é desenvolvido para o **Clube de Desbravadores de Abrantes**. Para suporte técnico ou sugestões, contacte a equipa de tecnologia do clube ou utilize a aba de Sugestões na plataforma.

---
**Aventura • Amizade • Fé** 🏕️
