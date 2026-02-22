# 🏕️ Clube de Desbravadores - Abrantes

Plataforma de gamificação para o Clube de Desbravadores de Abrantes, seguindo as regras da UPASD Portugal.

## 📋 Sobre o Projeto

Sistema de gestão e gamificação que permite:
- **Autenticação segura** via Google OAuth
- **Dashboard personalizado** para cada desbravador
- **Sistema de XP e Gold** para recompensar atividades
- **Gestão de membros** para coordenadores e dirigentes
- **Controlo de investiduras** e progressão por secções

## 🎯 Secções (Baseadas na Idade)

| Secção | Cor | Idade |
|--------|-----|-------|
| Rebentos | Verde | Calculado automaticamente |
| Tições | Bordeaux | pela base de dados |
| Exploradores | Amarelo/Verde | com base na |
| Companheiros | Azul | data de nascimento |
| Embaixadores | Cinza/Dourado | |

## 🛠️ Stack Tecnológica

- **Framework:** Next.js 14+ (App Router)
- **Linguagem:** TypeScript
- **Estilo:** Tailwind CSS v4
- **Componentes:** Shadcn/ui
- **Ícones:** Lucide React
- **Backend:** Supabase (Auth + Database)

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js 18+ instalado
- Conta Supabase configurada
- Credenciais do Google OAuth

### 1. Clonar o Repositório

```bash
git clone <url-do-repositorio>
cd desbravadores-abrantes
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

Crie um ficheiro `.env.local` na raiz do projeto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```

### 4. Configurar Supabase

#### Estrutura da Base de Dados

O projeto espera as seguintes tabelas:

**profiles**
```sql
- id (uuid, FK para auth.users)
- full_name (text)
- avatar_url (text, nullable)
- section (enum: rebentos, ticoes, exploradores, companheiros, embaixadores)
- role (enum: coordenador, dirigente, desbravador)
- total_xp (integer, default: 0)
- current_gold (integer, default: 0)
- birth_date (date, nullable)
- is_invested (boolean, default: false)
- created_at (timestamp)
```

**points_log**
```sql
- id (uuid)
- target_user_id (uuid, FK para profiles)
- awarded_by_user_id (uuid, FK para profiles)
- amount_xp (integer, default: 0)
- amount_gold (integer, default: 0)
- description (text)
- created_at (timestamp)
```

**announcements**
```sql
- id (uuid)
- title (text)
- message (text)
- created_at (timestamp)
- author_id (uuid, FK para profiles)
- target_user_id (uuid, nullable, FK para profiles)
- target_section (enum, nullable)
- target_role (enum, nullable)
```

#### Configurar Autenticação

1. Aceda ao painel Supabase → Authentication → Providers
2. Certifique-se que "Email" está ativado
3. (Opcional) Para desenvolvimento, desative a confirmação de email:
   - Authentication → Settings → Email Auth
   - Desative "Enable email confirmations"

#### Configurar Trigger de Criação de Perfis

**IMPORTANTE:** Execute o SQL em `supabase-setup.sql` no SQL Editor do Supabase.

Este script cria:
- Trigger automático para criar perfil quando utilizador se regista
- Políticas RLS (Row Level Security) para proteger os dados
- Permissões adequadas para coordenadores e desbravadores

Ver ficheiro `supabase-setup.sql` para detalhes.

### 5. Executar em Desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

### 6. Build para Produção

```bash
npm run build
npm start
```

## 📱 Funcionalidades

### Para Desbravadores

- ✅ Login com Email/Password
- ✅ Criação de conta (Sign Up)
- ✅ Onboarding automático (captura data de nascimento)
- ✅ Dashboard personalizado com:
  - Avatar e informações pessoais
  - Barra de progresso de XP
  - Saldo de Gold (moedas)
  - Feed de avisos e notícias
  - Indicador de investidura
- ✅ Botão de scan QR (UI preparada)

### Para Coordenadores/Dirigentes

- ✅ Acesso ao painel de gestão (`/admin`)
- ✅ Listagem de membros da secção
- ✅ Atribuir XP e Gold com motivo
- ✅ Marcar/desmarcar investidura
- ✅ Visualização de estatísticas dos membros

## 🔐 Proteção de Rotas

O middleware protege automaticamente:
- Redireciona utilizadores não autenticados para `/login`
- Redireciona novos utilizadores sem `birth_date` para `/onboarding`
- Restringe `/admin` apenas para coordenadores e dirigentes

## 🎨 Design System

### Cores das Secções

```typescript
const SECTION_COLORS = {
  rebentos: 'bg-green-500',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}
```

### Componentes Shadcn/ui Utilizados

- Button
- Card
- Progress
- Avatar
- Dialog
- Switch
- Input
- Badge
- Sonner (Toasts)
- Label
- Dropdown Menu
- Skeleton
- Separator

## 📂 Estrutura do Projeto

```
desbravadores-abrantes/
├── app/
│   ├── admin/
│   │   ├── components/
│   │   │   └── MemberList.tsx
│   │   └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts
│   ├── login/
│   │   └── page.tsx
│   ├── onboarding/
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── page.tsx (Dashboard)
│   └── globals.css
├── components/
│   ├── layout/
│   │   └── Navbar.tsx
│   └── ui/ (Shadcn components)
├── utils/
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── middleware.ts
├── types/
│   └── supabase.ts
├── middleware.ts
└── .env.local
```

## 🔄 Fluxo de Autenticação

1. Utilizador acede à aplicação
2. Middleware verifica sessão
3. Se não autenticado → redireciona para `/login`
4. Login com Google OAuth
5. Callback processa a sessão
6. Se `birth_date` é NULL → redireciona para `/onboarding`
7. Após onboarding → redireciona para Dashboard (`/`)

## 🧪 Verificação

Para testar a aplicação:

1. **Login Flow:**
   - Aceda a `http://localhost:3000`
   - Clique em "Entrar com Google"
   - Complete o onboarding (se necessário)

2. **Dashboard:**
   - Verifique a cor da secção
   - Confirme barras de XP e Gold
   - Veja avisos (se existirem)

3. **Painel Admin:**
   - Faça login com conta de coordenador/dirigente
   - Aceda a `/admin`
   - Teste atribuir pontos
   - Teste toggle de investidura

## 🐛 Resolução de Problemas

### Build Errors

Se encontrar erros de build:
```bash
rm -rf .next node_modules
npm install
npm run build
```

### Problemas de Autenticação

- Verifique se as credenciais estão corretas no `.env.local`
- Limpe os cookies do navegador

### Erro no Onboarding (Birth Date)

Se aparecer erro ao guardar a data de nascimento:

1. **Verifique se executou o SQL do `supabase-setup.sql`**
   - O trigger deve criar o perfil automaticamente
   - As políticas RLS devem permitir INSERT e UPDATE

2. **Execute este SQL adicional no Supabase:**
   ```sql
   -- Permitir utilizadores criarem o próprio perfil
   CREATE POLICY "Users can insert own profile"
     ON public.profiles
     FOR INSERT
     WITH CHECK (auth.uid() = id);
   ```

3. **Verifique no Supabase → Table Editor → profiles**
   - Se o perfil não foi criado, o código agora cria automaticamente

### Middleware Loops

Se houver loops de redirecionamento:
- Verifique se o perfil tem `birth_date` preenchido
- Confirme que a tabela `profiles` existe e está acessível

## 📝 Próximos Passos

- [ ] Implementar funcionalidade de QR Code
- [ ] Sistema de conquistas/badges
- [ ] Ranking de desbravadores
- [ ] Notificações push
- [ ] Histórico detalhado de pontos
- [ ] Exportação de relatórios

## 🤝 Contribuir

1. Fork o projeto
2. Crie uma branch para a feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit as mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é privado e destinado exclusivamente ao Clube de Desbravadores de Abrantes.

## 👥 Contacto

Para questões ou suporte, contacte a coordenação do clube.

---

**Aventura • Amizade • Fé** 🏕️
