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

#### 🛡️ Para Liderança (Dirigentes e Coordenadores)
- **Painel de Gestão Admin:** Visão consolidada de secções com dashboard horizontal otimizado.
- **Controlo de Presenças & QR Codes:** Criação, edição e impressão de QR Codes (A4/A5) para check-in por scan.
- **Gestão de Loja/Entregas:** Widget prático para gerir as entregas pendentes dos produtos da loja.
- **Emissão de Avisos:** Sistema de anúncios globais ou direcionados (por pessoa, secção ou papel).
- **Gestão de Investiduras:** Toggle manual para marcar a conclusão de classes.
- **Dashboard de Métricas:** Estatísticas de engajamento, aniversários e distribuição de membros.
- **Moderação de Sugestões:** Leitura, gestão e resolução do feedback recebido.

---

## � Secções e Cores

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
```

### 4. Base de Dados
O coração do sistema reside no arquivo `supabase-setup.sql`. Execute este script no editor SQL do Supabase para configurar:
- Tabelas e Enums.
- **RLS (Row Level Security):** Proteção rigorosa de dados.
- **Triggers:** Automação de criação de perfis, cálculo de secção por idade e sincronização de totais de XP/Gold.
- **Functions:** Lógica de transferência de ouro e cálculo de classes.

---

## 📂 Estrutura de Pastas

```text
app/
├── (auth)/         # Login, Onboarding e Callbacks
├── admin/          # Painel de controlo (Tabs: Overview, Members, Events, etc)
├── contacts/       # Informação útil e redes sociais
├── leaderboard/    # Ranking público de membresia
├── points-history/ # Registo detalhado de ganhos/gastos
├── profile/        # Edição de perfil e transferências
└── suggestions/    # Sistema de feedback
components/
├── events/         # Calendar e Card de eventos
├── layout/         # Navbar e Footer dinâmicos
├── profile/        # Dialogs e Avatars
└── ui/             # Componentes base (Shadcn)
utils/
└── supabase/       # Configuração client/server/middleware
```

---

## � Segurança e Regras

1. **Privacidade:** Membros só vêem os seus próprios dados e o ranking básico.
2. **Hierarquia:** 
   - **Dirigentes:** Gerem apenas a sua secção atribuída (`leadership_section`).
   - **Coordenadores:** Acesso total a todos os dados e ferramentas do clube.
3. **Persistência:** Todo o XP e Gold é auditado através da tabela `points_log`, impedindo alterações manuais sem rasto.

## 🤝 Contacto e Suporte

Este projeto é desenvolvido para o **Clube de Desbravadores de Abrantes**. Para suporte técnico ou sugestões, contacte a equipa de tecnologia do clube ou utilize a aba de Sugestões na plataforma.

---
**Aventura • Amizade • Fé** 🏕️

