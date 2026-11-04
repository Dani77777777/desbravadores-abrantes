# Cofre: o registo do dinheiro do clube

**Especificação de construção para o Claude Code.**
Nova ferramenta da coordenação em `/admin/ferramentas/cofre`, ligada à Loja.

> **Como usar este documento:** lê-o todo antes de escrever código.
> - A secção 1 é o princípio. Se uma decisão de implementação o contrariar, o princípio ganha.
> - A secção 2 lista o que já existe e os problemas encontrados no código atual.
> - As secções 3 a 7 são a arquitetura: conceitos, base de dados, RPCs, integração com a Loja e ecrãs.
> - A secção 8 é o plano faseado. **A Fase 0 é uma correção de segurança e entra sozinha, já.**
> - A secção 9 lista armadilhas reais deste repositório. A secção 10 tem as decisões em aberto.

---

## 0. TL;DR

| | |
|---|---|
| **Nome** | Cofre |
| **O que é** | Registo de controlo do dinheiro que passa pelo clube (vendas da loja, reembolsos, despesas, entregas à tesouraria) |
| **O que NÃO é** | Não é a contabilidade nem a conta do clube. A conta oficial é a da igreja, gerida pelo tesoureiro |
| **Quem vê e usa** | Só coordenadores **reais** (`get_my_real_role() = 'coordenador'`). Ajudantes e dirigentes não |
| **Rota** | `/admin/ferramentas/cofre` |
| **Prefixo BD** | `cofre_` (tabela `club_cash_movements`) |
| **Migração** | `supabase-migration-cofre.sql` (idempotente, corre-se inteira no SQL Editor) |
| **Branch** | `feature/Cofre` (a partir de `master`) |
| **Referências de padrões** | Auditoria de pontos (`supabase-migration-points-security-audit.sql`: histórico só de inserções, correções registadas, tab só para coordenação real), Loja (`OrderManagement.tsx`, `process_purchase`, `mark_purchase_paid`, `refund_purchase`), Ferramentas (`ToolsPanel.tsx`) |

**A ideia:** cada euro que entra ou sai fica registado com **quem o tem na mão**. A pergunta
principal que o Cofre responde é: *"Quem tem neste momento dinheiro do clube que ainda não foi
entregue ao tesoureiro?"*. O dinheiro sai da mão de alguém quando a entrega à tesouraria é
**confirmada por outra pessoa**.

---

## 1. O princípio

1. **O Cofre não é uma caixa paralela.** O dinheiro do clube vive na conta da igreja (tesoureiro).
   O Cofre só mostra o caminho do dinheiro até lá. O "saldo" que interessa no Cofre é o
   **dinheiro em mão**, que deve tender para zero.
2. **Nada se apaga e nada se edita.** Um erro corrige-se com um **estorno** (um movimento novo que
   anula o anterior, com motivo). Igual à auditoria de pontos.
3. **Quatro olhos.** Uma entrega à tesouraria só fecha quando a confirma alguém que **não** a criou
   e que **não** era quem tinha o dinheiro.
4. **Só coordenação real.** Mexer em dinheiro nunca passa por `get_my_role()` (que inclui
   ajudantes). Usa sempre `get_my_real_role()`.
5. **O dinheiro em euros nunca passa por `number` com casas decimais no TypeScript.** Ver §9.

---

## 2. Contexto do repositório (o que existe hoje)

### 2.1 Loja
- `store_products`: tem `price_eur`, `cost_price` (permite calcular a margem), `max_discount_percent`, `is_preorder`.
- `store_purchases`: tem `price_eur`, `discount_eur` (desconto pago com Gold), `volume_discount_eur`,
  `amount_due_eur` (o que se paga em dinheiro), `paid_at`, `delivered_at`, `status`
  (`pending | delivered | refunded`), `buyer_name` (convidados), `cancel_token`.
- O pagamento é só **em dinheiro**, "junto da direção do clube" (`PurchaseDialog.tsx`).
- RPCs: `process_purchase`, `mark_purchase_paid(p_purchase_id, p_deliver)`,
  `mark_purchase_delivered`, `refund_purchase`, `delete_purchase_record`, `cancel_my_purchase`,
  `get_guest_purchases`.
- `mark_purchase_paid` é chamado em **dois sítios**: `OrderManagement.tsx` e `OverviewPanel.tsx`.

### 2.2 Problemas encontrados (o Cofre resolve-os)
| # | Problema | Onde |
|---|---|---|
| P1 | **Falha de segurança: anónimos conseguem chamar RPCs de coordenação.** `IF public.get_my_role() <> 'coordenador' THEN RAISE` com um visitante anónimo dá `NULL <> 'coordenador'` → `NULL` → o `IF` não dispara e a função corre. As funções têm `GRANT ... TO anon`. Um convidado que comprou sem conta sabe o id da sua encomenda (fica no browser) e pode marcá-la como paga com a anon key. Num produto digital, isso revela a chave sem pagar. | `mark_purchase_paid`, `mark_purchase_delivered`, `refund_purchase`, `delete_purchase_record`, `finalize_survey` (`<>`) e `list_club_members_for_assignment` (`NOT IN`, mesmo problema) |
| P2 | Ajudantes com `helper_role = 'coordenador'` conseguem confirmar pagamentos, reembolsar e apagar compras (usa `get_my_role()`). | as mesmas RPCs da Loja |
| P3 | `mark_purchase_paid` só guarda `paid_at`. Não fica **quem recebeu**, **como** (numerário/MB Way/transferência), nem uma referência. | `store_purchases`, `mark_purchase_paid` |
| P4 | No reembolso de uma compra paga, o site diz "o dinheiro tens de o devolver em mãos", mas não regista quem devolveu. | `refund_purchase`, `OrderManagement.tsx` |
| P5 | `delete_purchase_record` apaga compras reembolsadas **mesmo que tenham sido pagas**. Apaga o rasto do dinheiro. | `delete_purchase_record` |
| P6 | Não existe registo de **entrega do dinheiro ao tesoureiro**. | (não existe) |
| P7 | O desconto com Gold é dinheiro que o clube não recebe. `price_eur` e `amount_due_eur` não batem, e isso tem de aparecer como desconto nos relatórios, senão parece que falta dinheiro. | relatórios |

---

## 3. Conceitos

| Conceito | Significado |
|---|---|
| **Movimento** | Uma linha em `club_cash_movements`. Imutável. |
| **Fluxo normal** | **Quem compra paga a um coordenador** (em numerário ou por MB Way/transferência para a conta pessoal dele) e **o coordenador passa o dinheiro ao tesoureiro**, que o põe na conta da igreja. |
| **Detentor** (`holder_id`) | O coordenador que tem o dinheiro do clube, seja em numerário ou na sua conta pessoal. Só quando o dinheiro cai **diretamente na conta da igreja** (`to_church_account = true`, Fase 3) é que `holder_id` é `NULL` e o movimento não conta para o "em mão". |
| **Em mão** | Por detentor, seja qual for o método: entradas − reembolsos − despesas − entregas **confirmadas** (estornos incluídos com sinal contrário). O ecrã separa "em numerário" de "na minha conta", para cada um saber o que tem de entregar em dinheiro e o que tem de transferir. |
| **Limites** | O clube combina entregar ao tesoureiro pelo menos uma vez por mês, ou logo que alguém passe de um valor (ex.: 50 €). Os limites ficam em `store_settings` (`cofre_warn_days`, `cofre_warn_eur`, `cofre_alert_days`, `cofre_alert_eur`), para a direção os poder mudar. |
| **Em trânsito** | Entregas registadas mas ainda não confirmadas. Continuam a contar como "em mão" até serem confirmadas, e aparecem em destaque. |
| **Entrega à tesouraria** | O detentor passa o dinheiro ao tesoureiro (ou deposita-o na conta da igreja). Fecha com a confirmação de outra pessoa. |
| **Estorno** | Movimento que anula outro (`reverses_id`), com motivo obrigatório. Cada movimento só pode ser estornado uma vez. Um estorno não se estorna. |

### 3.1 Tipos de movimento (`cash_movement_kind`)
| Tipo | Efeito no "em mão" do detentor | Criado por |
|---|---|---|
| `venda` | **+** (se tem detentor) | automático em `mark_purchase_paid` |
| `reembolso` | **−** (se tem detentor) | automático em `refund_purchase` de compra paga |
| `entrada_outra` | **+** (se tem detentor) | manual: quotas, donativo para acampamento, rifa… |
| `despesa` | **−** (se tem detentor) | manual: material comprado com o dinheiro do clube que o coordenador tem (com comprovativo) |
| `entrega_tesouraria` | **−** quando confirmada | manual |
| `estorno` | o contrário do movimento que anula | manual |
| `abertura` | **+** | manual, uma vez por pessoa: contagem inicial do dinheiro que cada um já tem quando o Cofre arranca (ver §8, Fase 1) |

---

## 4. Base de dados (`supabase-migration-cofre.sql`)

### 4.1 Tipos
```sql
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('numerario', 'mbway', 'transferencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_movement_kind AS ENUM
    ('venda', 'reembolso', 'entrada_outra', 'despesa', 'entrega_tesouraria', 'estorno', 'abertura');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### 4.2 `store_purchases`: colunas novas
```sql
CREATE SEQUENCE IF NOT EXISTS public.store_payment_ref_seq;

ALTER TABLE public.store_purchases
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS payment_ref text;
```
- `payment_ref`: formato `DA-0001`, gerado num trigger `BEFORE INSERT`
  (`'DA-' || lpad(nextval('store_payment_ref_seq')::text, 4, '0')`). Fazer backfill das compras
  existentes por ordem de `created_at` e depois aplicar `UNIQUE` e `NOT NULL`.
- A referência mostra-se ao comprador ("Referência: DA-0427") e é a que ele escreve na descrição do
  MB Way ou da transferência (Fase 3).

### 4.3 `club_cash_movements`
```sql
CREATE TABLE IF NOT EXISTS public.club_cash_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  occurred_on   date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date,
  kind          public.cash_movement_kind NOT NULL,
  amount_eur    numeric(10,2) NOT NULL CHECK (amount_eur > 0),
  method        public.payment_method,              -- NULL só em 'estorno' (herda do original)
  to_church_account boolean NOT NULL DEFAULT false, -- true = caiu direto na conta da igreja (Fase 3)
  holder_id     uuid REFERENCES public.profiles(id), -- coordenador que tem o dinheiro (em mão ou na conta pessoal)
  purchase_id   uuid REFERENCES public.store_purchases(id) ON DELETE RESTRICT,
  description   text NOT NULL CHECK (length(btrim(description)) > 0),
  receipt_path  text,                                -- Storage, bucket privado (Fase 2)
  treasurer_name text,                               -- em 'entrega_tesouraria': a quem foi entregue
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  confirmed_by  uuid REFERENCES public.profiles(id), -- só em 'entrega_tesouraria'
  confirmed_at  timestamptz,
  reverses_id   uuid UNIQUE REFERENCES public.club_cash_movements(id),

  CONSTRAINT cofre_estorno_check CHECK ((kind = 'estorno') = (reverses_id IS NOT NULL)),
  -- Ou tem detentor, ou foi direto para a conta da igreja: nunca as duas coisas, nunca nenhuma.
  CONSTRAINT cofre_holder_check CHECK (
    kind = 'estorno' OR (to_church_account = (holder_id IS NULL))
  ),
  CONSTRAINT cofre_church_not_cash_check CHECK (
    NOT (to_church_account AND method = 'numerario')
  ),
  CONSTRAINT cofre_confirm_only_handover CHECK (
    confirmed_by IS NULL OR kind = 'entrega_tesouraria'
  ),
  CONSTRAINT cofre_four_eyes CHECK (
    confirmed_by IS NULL OR (confirmed_by <> created_by AND confirmed_by IS DISTINCT FROM holder_id)
  )
);
CREATE INDEX IF NOT EXISTS club_cash_movements_holder_idx  ON public.club_cash_movements(holder_id);
CREATE INDEX IF NOT EXISTS club_cash_movements_purchase_idx ON public.club_cash_movements(purchase_id);
CREATE INDEX IF NOT EXISTS club_cash_movements_occurred_idx ON public.club_cash_movements(occurred_on);
```

### 4.4 Imutabilidade (trigger)
- `BEFORE DELETE` → `RAISE EXCEPTION 'Os movimentos do Cofre não se apagam. Faz um estorno.'`
- `BEFORE UPDATE` → só é permitido passar `confirmed_by`/`confirmed_at` de `NULL` para um valor,
  numa `entrega_tesouraria`. Qualquer outra alteração dá erro.
- O trigger aplica-se mesmo a funções `SECURITY DEFINER`. É essa a ideia.

### 4.5 RLS
```sql
ALTER TABLE public.club_cash_movements ENABLE ROW LEVEL SECURITY;
-- Só leitura, só coordenação real. Escrita SÓ por RPC.
CREATE POLICY "Cofre: coordenação real lê" ON public.club_cash_movements
  FOR SELECT USING (public.get_my_real_role() = 'coordenador');
REVOKE INSERT, UPDATE, DELETE ON public.club_cash_movements FROM anon, authenticated;
```

### 4.6 Vista `cofre_em_mao`
Uma linha por detentor: `holder_id`, `full_name`, `em_mao_eur`, `em_transito_eur`,
`ultimo_movimento`. Os sinais seguem a §3.1. A vista é `security_invoker = true`, para herdar a
RLS da tabela.

---

## 5. RPCs

**Regra para todas:** `SECURITY DEFINER`, `SET search_path = public`, e a primeira linha é
```sql
IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
  RAISE EXCEPTION 'Sem permissão.';
END IF;
```
(`IS DISTINCT FROM`, nunca `<>`: ver P1). `REVOKE EXECUTE ... FROM anon` em todas.

| RPC | O que faz |
|---|---|
| `cofre_register(p_kind, p_amount, p_method, p_holder_id, p_description, p_occurred_on, p_receipt_path)` | Só para `entrada_outra`, `despesa` e `abertura`. `abertura` só uma vez por detentor (erro se já houver). Numa `despesa` em numerário, valida que o detentor tem saldo suficiente. |
| `cofre_request_handover(p_amount, p_method, p_treasurer_name, p_note, p_receipt_path)` | Cria `entrega_tesouraria` com `holder_id = auth.uid()`. Valida `p_amount <= em_mao`. `p_method`: `numerario` (entregou em mão ao tesoureiro ou depositou) ou `transferencia` (transferiu da conta pessoal para a conta da igreja). |
| `cofre_confirm_handover(p_movement_id)` | Preenche `confirmed_by`/`confirmed_at`. Falha se quem chama criou o movimento ou era o detentor (o CHECK também o garante). |
| `cofre_reverse(p_movement_id, p_reason)` | Cria `estorno` com o mesmo valor, método e detentor, e `description = 'Estorno: ' || p_reason`. Não deixa estornar movimentos `venda` nem `reembolso` ligados a compras (esses corrigem-se pela Loja, ver §6.3) nem estornos. |
| `cofre_overview()` | `jsonb` com o "em mão" por pessoa, o total em trânsito, as entregas por confirmar (com `can_confirm` calculado para quem chama) e os totais do mês. |
| `cofre_report(p_from date, p_to date)` | Linhas para o relatório (§7.3): movimentos do período e um resumo da loja por produto (unidades, faturado, descontos Gold, descontos de volume, recebido, custo e margem). |

---

## 6. Integração com a Loja

### 6.1 `mark_purchase_paid`: assinatura nova
```sql
DROP FUNCTION IF EXISTS public.mark_purchase_paid(uuid, boolean);
CREATE FUNCTION public.mark_purchase_paid(
  p_purchase_id uuid,
  p_deliver boolean DEFAULT false,
  p_method public.payment_method DEFAULT 'numerario',
  p_received_by uuid DEFAULT NULL,      -- NULL = quem está a confirmar
  p_to_church_account boolean DEFAULT false  -- só existe na UI a partir da Fase 3
) ...
```
- Permissão: `get_my_real_role()`, com `IS DISTINCT FROM`.
- Atualiza `paid_at`, `payment_method`, `received_by` (= `COALESCE(p_received_by, auth.uid())`) e
  mantém a lógica atual de entrega e digital.
- Se `amount_due_eur > 0`, insere um movimento `venda`: `amount_eur = amount_due_eur`,
  `method = p_method`, `holder_id` = quem recebeu (também quando recebeu por MB Way ou
  transferência na conta pessoal). Só com `p_to_church_account = true` fica `holder_id = NULL`,
  `purchase_id`, e `description` = `'DA-0427 · <produto> ×<qtd> · <comprador>'`.
- É idempotente: se a compra já tinha `paid_at`, não cria um segundo movimento.
- `p_received_by` tem de ser um coordenador real (valida). Se não for, dá erro.

### 6.2 `refund_purchase`: assinatura nova
```sql
DROP FUNCTION IF EXISTS public.refund_purchase(uuid);
CREATE FUNCTION public.refund_purchase(
  p_purchase_id uuid,
  p_method public.payment_method DEFAULT 'numerario',
  p_from_church_account boolean DEFAULT false
) ...
```
- Mantém o que já faz (devolver Gold e stock, marcar `refunded`).
- Se a compra estava paga e `amount_due_eur > 0`, insere `reembolso` com
  `holder_id = auth.uid()` (quem devolveu, em mão ou da sua conta). Só quando a devolução foi feita
  pela tesouraria (`p_from_church_account = true`) é que fica `holder_id = NULL`.
- Num reembolso feito por um coordenador, valida que ele tem saldo suficiente no Cofre. Se não tiver, o
  erro deve dizer: "Não tens esse dinheiro em mão no Cofre. Pede a quem recebeu para fazer o
  reembolso."

### 6.3 `delete_purchase_record`
- Passa a recusar compras com `paid_at IS NOT NULL`: "Esta compra teve dinheiro envolvido e fica no
  histórico." Só se apagam pedidos cancelados que nunca foram pagos.
- O `ON DELETE RESTRICT` do `purchase_id` é a segunda barreira.

### 6.4 `mark_purchase_delivered`
- Só corrige a permissão (P1/P2). Não mexe em dinheiro.

### 6.5 UI da Loja
- **`OrderManagement.tsx`:** os botões "Pago" e "Pago + Entregue" abrem um diálogo pequeno com
  *Como foi pago?* (Numerário / MB Way / Transferência, por omissão Numerário) e *Quem recebeu?*
  (por omissão "Eu", com lista de coordenadores reais; a opção "Conta da igreja" só aparece na
  Fase 3). O cartão da encomenda mostra a `payment_ref` e, depois de pago, "Recebido por X ·
  MB Way".
- **Reembolsar:** o diálogo pergunta o método e explica que o valor sai do teu "em mão".
- **`OverviewPanel.tsx`:** usa o mesmo diálogo (ou chama com os valores por omissão). Não pode ficar
  a chamar a assinatura antiga (ver §9).
- **`PurchaseDialog.tsx` / `MyOrders.tsx` / encomendas de convidados:** mostrar "Referência:
  DA-0427" no resultado e na lista de encomendas.
- O botão "Apagar registo" só aparece em compras canceladas que nunca foram pagas.

---

## 7. Ecrãs do Cofre

### 7.1 Acesso
- Rota `app/admin/ferramentas/cofre/page.tsx` (Server Component). Se
  `get_my_real_role() !== 'coordenador'`, redireciona para `/admin?tab=tools`.
- `ToolsPanel.tsx` recebe `isRealCoordenador` e só mostra o cartão do Cofre nesse caso. Ícone
  `Vault` (lucide), cor `from-emerald-600 to-teal-700`, sem `projectorHref` (nunca vai ao projetor).
  Descrição: *"Quem tem dinheiro do clube na mão, entregas à tesouraria e relatório da loja."*

### 7.2 Layout (mobile-first, usado sobretudo ao telemóvel no fim das reuniões)
1. **Cabeçalho com 3 números:** Em mão (total), Em trânsito, Entregue à tesouraria neste mês.
2. **"Quem tem dinheiro do clube"**: um cartão por pessoa com saldo diferente de zero, com o
   valor (dividido em "em numerário" e "na minha conta") e há quanto tempo tem o dinheiro. O cartão
   fica laranja ou vermelho conforme os **limites** (§3). O meu cartão tem o botão **"Entreguei ao
   tesoureiro"**, que abre o diálogo: valor (por omissão tudo o que tenho), a quem entreguei,
   em mão / depósito / transferência e, na Fase 2, foto do talão ou do comprovativo.
3. **"Por confirmar"**: entregas pendentes. O botão **"Confirmo"** só aparece a quem pode
   confirmar. Texto de ajuda: *"Confirma só se viste o dinheiro ser entregue ou o talão do
   depósito."*
4. **Movimentos**: lista cronológica, com filtros por período (este mês / mês passado /
   personalizado) e por tipo. Cada linha tem tipo, valor com sinal, detentor, descrição e quem
   registou. As linhas estornadas aparecem riscadas, com o estorno por baixo. Ação "Estornar"
   com motivo obrigatório.
5. **Botões flutuantes:** "+ Despesa", "+ Outra entrada", "Relatório", "Exportar Excel".

### 7.3 Relatório (Fase 2)
- Período à escolha. Pensado para enviar ao tesoureiro e mostrar à comissão.
- Secção **Loja**: por produto, unidades, valor de tabela, descontos Gold, descontos de volume,
  recebido, custo (`cost_price × unidades`, "—" se não houver custo) e margem. Uma linha de
  totais. Explicar numa nota que o desconto Gold é pago pelo clube (P7).
- Secção **Movimentos** do período, com os totais por tipo.
- Secção **Situação**: em mão por pessoa e em trânsito.
- **Exportar para Excel (`.xlsx`)**: é assim que os registos chegam ao tesoureiro, que não tem
  conta na plataforma. Usar `exceljs` (dependência nova) numa rota de servidor
  `app/admin/ferramentas/cofre/exportar/route.ts`, que valida o coordenador real e devolve o ficheiro
  `Cofre-Desbravadores-Abrantes-AAAA-MM.xlsx`. Folhas:
  1. **Resumo**: período, totais por tipo, em mão por pessoa, em trânsito, data e quem exportou.
  2. **Loja**: a tabela por produto descrita acima, com linha de totais.
  3. **Movimentos**: uma linha por movimento (data, tipo, valor com sinal, método, detentor,
     referência da compra, descrição, quem registou, quem confirmou). Os estornos ficam visíveis.
  Valores como números com formato `#,##0.00 €` (não texto), cabeçalho fixo, filtros automáticos
  e colunas com largura ajustada.
- Ter também uma vista para imprimir (`@media print`), para levar à reunião da comissão.

---

## 8. Plano faseado

### Fase 0: segurança (entra sozinha e já, antes do resto)
Ficheiro próprio: `supabase-migration-security-null-role-fix.sql`.
- Nas 6 funções de P1, trocar `get_my_role() <> 'coordenador'` por
  `get_my_real_role() IS DISTINCT FROM 'coordenador'` nas da Loja (também resolve P2), e por
  `IS DISTINCT FROM` / `COALESCE(..., '') NOT IN (...)` nas outras, mantendo o papel que já usam.
- `REVOKE EXECUTE ... FROM anon` nas RPCs de coordenação da Loja.
- Procurar no resto do schema o mesmo padrão (`<>` ou `NOT IN` com `get_my_role()` /
  `get_my_real_role()` dentro de `IF ... RAISE`) e corrigir.
- Teste: com a anon key, `rpc('mark_purchase_paid', …)` tem de falhar com "Sem permissão".

### Fase 1: o Cofre a funcionar
- Migração §4 (tipos, colunas, sequência + backfill, tabela, trigger, RLS, vista).
- RPCs §5 sem comprovativos e sem relatório.
- §6 completo (Loja integrada).
- Ecrã §7.2, pontos 1 a 5, sem o botão "Relatório".
- **Arranque:** compras pagas antes do Cofre **não** geram movimentos. No primeiro dia, cada
  coordenador conta o dinheiro do clube que tem consigo e regista uma `abertura`.

### Fase 2: comprovativos e relatório
- Bucket privado `cofre-comprovativos` (só coordenação real lê e escreve), com foto em despesas e
  entregas.
- `cofre_report` e §7.3 (exportação Excel `.xlsx` e impressão).

### Fase 3 (opcional): pagamento direto para a conta da igreja (**só se o tesoureiro quiser**)
O fluxo normal continua a ser pagar a um coordenador. Esta fase só acrescenta a opção de o
comprador pagar diretamente à igreja.
- `store_settings`: `payment_iban text`, `payment_mbway text`, `payment_instructions text`, todos
  `NULL` por omissão. Enquanto estiverem `NULL`, a loja continua "em dinheiro" como hoje.
- Se estiverem preenchidos, o resultado da compra mostra: *"Paga por MB Way para <número> ou por
  transferência para <IBAN>, com a referência **DA-0427** na descrição."*
- O coordenador marca "Pago (MB Way)" quando o tesoureiro confirma que o pagamento entrou.

### Fase 4 (opcional): pausa ao sábado
- A loja não aceita encomendas do pôr do sol de sexta ao pôr do sol de sábado (Abrantes). Mostra
  "A loja reabre ao fim do sábado". A hora do pôr do sol é calculada no servidor, sem dependências
  externas.

---

## 9. Armadilhas deste repositório

1. **Overloads no PostgREST.** `CREATE OR REPLACE` com parâmetros novos **não substitui**: cria
   uma segunda função, e o `supabase.rpc('mark_purchase_paid', {…})` passa a dar erro de
   ambiguidade. Faz sempre `DROP FUNCTION IF EXISTS` com a assinatura antiga primeiro, e volta a
   dar os `GRANT`.
2. **`get_my_role()` inclui ajudantes.** Para dinheiro usa sempre `get_my_real_role()`. A página
   `/admin` já distingue `isCoordenador` de `isRealCoordenador`: usa o segundo.
3. **`NULL` em comparações** (P1). `IS DISTINCT FROM`, sempre.
4. **Euros no TypeScript.** O Supabase devolve `numeric` como `string` ou `number` conforme a
   configuração. Converte para **cêntimos inteiros** logo à entrada (`Math.round(Number(x) * 100)`)
   e formata com o `formatEur` que já existe. Nunca somes floats.
5. **Fuso horário.** Os relatórios e os "este mês" usam `Europe/Lisbon`, não UTC
   (`occurred_on` já é uma data local).
6. **`supabase-schema-completo.sql`** é o SQL único usado para montar outro clube (ver README e
   `NOVO-CLUBE.md`). Atualiza-o no fim de cada fase, e a secção da Loja no README.
7. **`revalidatePath`** em `/admin`, `/admin/ferramentas/cofre` e `/shop` depois de marcar
   pago ou reembolsar.
8. **Convidados** (compras sem conta, `buyer_name`): a `payment_ref` também aparece em
   `get_guest_purchases`.

---

## 10. Decisões em aberto (perguntar ao Daniel / direção antes de fechar)

1. **Ajudantes com papel de coordenador** devem poder marcar compras como pagas? Esta spec diz
   **não**. Mexer em dinheiro fica só para coordenadores reais.
2. ~~O tesoureiro vai ter conta na plataforma?~~ **Decidido: não.** O Cofre é uma ferramenta do
   clube. O tesoureiro recebe os registos em Excel (§7.3). As entregas são confirmadas por outro
   coordenador, de preferência com a foto do talão ou do recibo do tesoureiro (Fase 2).
3. **Transparência para os pais:** mostrar no site um resumo do que a loja rendeu e para onde foi o
   lucro (ex.: "Acampamento de primavera")? Seria uma Fase 5.
4. ~~Para onde se paga?~~ **Decidido:** paga-se aos coordenadores (numerário ou MB Way/
   transferência para a conta pessoal), e eles passam o dinheiro ao tesoureiro. O pagamento direto
   à igreja (Fase 3) fica como opção futura.
5. **Limites de entrega:** quais são os valores? A spec sugere aviso aos 14 dias ou 50 € e alerta aos
   30 dias ou 100 €.
