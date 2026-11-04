# Loja: correções urgentes

**Pedido para o Claude Code.** São erros que existem hoje na Loja, encontrados ao rever o código
(`supabase-schema-completo.sql`, `components/shop/*`, `app/admin/components/*`).
Não incluem o Cofre: esse vem depois, em `docs/Cofre.md`. **Isto entra primeiro, sozinho.**

- **Branch:** `fix/loja-seguranca` (a partir de `master`)
- **Migração:** `supabase-migration-store-security-fix.sql` (idempotente, corre-se inteira no SQL Editor)
- **No fim:** atualizar `supabase-schema-completo.sql` e a secção da Loja no README.

> Antes de corrigir, **confirma cada problema** com o teste indicado. Depois de corrigir, o mesmo
> teste tem de falhar. O código revisto é o do repositório; a base de dados em produção pode
> estar ligeiramente diferente.

---

## Resumo

| # | Gravidade | Problema |
|---|---|---|
| 1 | 🔴 Crítico | Visitantes sem sessão conseguem correr funções da coordenação (marcar pago, reembolsar, apagar) |
| 2 | 🔴 Crítico | Um membro consegue ler a chave de um artigo digital antes de pagar, e depois cancelar |
| 3 | 🟠 Alto | Ajudantes com papel de coordenador mexem em pagamentos, preços e chaves digitais |
| 4 | 🟠 Alto | A coordenação pode alterar compras diretamente na tabela, sem passar pelas funções |
| 5 | 🟠 Alto | Apagar uma compra reembolsada apaga também compras que chegaram a ser pagas |
| 6 | 🟡 Médio | Qualquer pessoa pode esgotar o stock e gastar as chaves digitais com encomendas que nunca paga |
| 7 | 🟡 Médio | A loja diz ao comprador para pagar "ao teu dirigente", mas só a coordenação confirma pagamentos |
| 8 | 🟢 Baixo | O preço de custo dos artigos chega ao browser de qualquer visitante |

---

## 1. 🔴 Visitantes sem sessão correm funções da coordenação

**Onde:** `mark_purchase_paid`, `mark_purchase_delivered`, `refund_purchase`,
`delete_purchase_record`, `finalize_survey` (usam `<>`) e `list_club_members_for_assignment`
(usa `NOT IN`).

**O erro:** a verificação é
```sql
IF public.get_my_role() <> 'coordenador' THEN RAISE EXCEPTION ...
```
Sem sessão, `get_my_role()` devolve `NULL`. `NULL <> 'coordenador'` dá `NULL`, o `IF` não dispara
e a função corre até ao fim. Todas estas funções têm `GRANT EXECUTE ... TO anon`.

**Impacto real:** um convidado que comprou sem conta tem o id da encomenda no `localStorage`
(`shop:guest-orders`). Com a anon key (que é pública) consegue:
- marcar a encomenda como paga sem pagar;
- num artigo digital, ficar com a encomenda "entregue" e a chave disponível;
- reembolsar ou apagar encomendas de que saiba o id.

**Teste:** sem sessão, `supabase.rpc('mark_purchase_paid', { p_purchase_id: '<id de uma encomenda de teste>' })`.
Hoje funciona. Depois da correção tem de dar "Sem permissão".

**Correção:**
- Nas funções da Loja: `IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN RAISE ...`
  (o `real` resolve também o problema 3).
- Em `finalize_survey`: `IS DISTINCT FROM`, mantendo o papel que já usa.
- Em `list_club_members_for_assignment`: `IF COALESCE(public.get_my_real_role(), '') NOT IN (...)`.
- `REVOKE EXECUTE ON FUNCTION ... FROM anon` em todas as funções de coordenação da Loja.
- **Procurar no schema inteiro** outros `IF ... <> ...` ou `NOT IN` com `get_my_role()` /
  `get_my_real_role()` / `get_my_section()` seguidos de `RAISE`, e corrigir da mesma forma.
  A regra passa a ser: **nunca `<>` nem `NOT IN` numa verificação de permissão.**

---

## 2. 🔴 Chave digital legível antes de pagar

**Onde:** `process_purchase` + política `"Users can view own purchases"` em `store_purchases`.

**O erro:** `process_purchase` escolhe a chave e grava-a logo em
`store_purchases.digital_key_delivered`, **mesmo quando a encomenda fica por pagar**. A resposta
da função esconde a chave (`'digital_key', CASE WHEN v_paid ...`), mas a política de leitura
(`user_id = auth.uid()`) deixa o membro ler a linha inteira.

**Impacto real:** um membro encomenda um artigo digital, lê a chave diretamente da tabela e
cancela a encomenda com `cancel_my_purchase`. Fica com a chave e não paga nada. A chave fica
gasta (`is_used = true`) e não volta ao stock.

**Teste:** com sessão de membro, encomendar um digital sem Gold suficiente para o pagar todo e
depois `supabase.from('store_purchases').select('digital_key_delivered').eq('id', '<id>')`.
Hoje devolve a chave.

**Correção:**
- `process_purchase` **só atribui a chave quando a compra fica paga** (paga toda com Gold). Se
  ficar por pagar, não reserva nenhuma chave e só verifica que há stock de chaves.
- `mark_purchase_paid` passa a atribuir a chave no momento em que o pagamento é confirmado
  (`SELECT ... FOR UPDATE SKIP LOCKED`, como já se faz em `process_purchase`). Se já não houver
  chaves, dá um erro claro e não marca como paga.
- Fazer limpeza: nas encomendas digitais **por pagar** que já têm chave, devolver a chave ao stock
  (`is_used = false`) e limpar `digital_key_delivered`.
- Opcional, mas recomendado: tirar `digital_key_delivered` da leitura direta (`REVOKE SELECT
  (digital_key_delivered)` a `authenticated`) e mostrar a chave só através de uma função que
  confirma que a compra é do próprio e está paga.

---

## 3. 🟠 Ajudantes com papel de coordenador mexem em dinheiro

**Onde:** as funções do problema 1 e as políticas RLS de `store_purchases`, `store_products`,
`store_settings` e `digital_keys`. Todas usam `get_my_role()`, que devolve o `helper_role` dos
ajudantes.

**Impacto real:** um ajudante (às vezes um desbravador menor) nomeado com papel de coordenador
consegue confirmar pagamentos, fazer reembolsos e apagar compras. Consegue também alterar
produtos e preços e ler **todas** as chaves digitais.

**Correção:** em tudo o que é Loja, trocar `get_my_role()` por `get_my_real_role()`, tanto nas
funções como nas políticas:
- `"Coordinators can view all purchases"`
- `"Coordinators manage products"`
- `"Coordinators manage store settings"`
- `"Only coordinators can manage keys"`
- e o ramo de coordenador de `"Public can view active products"`.

Os ajudantes deixam de ver o separador Loja no `/admin`. Em `app/admin/page.tsx`, hoje o
`activeTab === 'store'` depende de `isCoordenador` (papel efetivo, que inclui ajudantes). Tem de
passar a depender de `isRealCoordenador`, tal como o separador `audit`. O mesmo vale para o botão
de confirmar pagamento no `OverviewPanel`.

---

## 4. 🟠 Alteração direta de compras sem passar pelas funções

**Onde:** política `"Coordinators can update purchases"` (FOR UPDATE) em `store_purchases`.

**O erro:** com esta política, qualquer coordenador (e, hoje, qualquer ajudante) pode fazer
`update` direto a `paid_at`, `status`, `amount_due_eur`, etc. a partir do browser. Isso passa
ao lado das validações e não deixa rasto.

**Correção:** apagar a política de UPDATE. Todas as mudanças em compras passam a ser feitas só
pelas funções `SECURITY DEFINER`. Antes, confirmar com `grep` que nenhum componente faz
`.from('store_purchases').update(` (na revisão não encontrei nenhum).

---

## 5. 🟠 Apagar compras pagas

**Onde:** `delete_purchase_record`.

**O erro:** deixa apagar qualquer compra com `status = 'refunded'`, incluindo as que **foram
pagas** e depois reembolsadas. Desaparece o registo de que houve dinheiro envolvido.

**Correção:** recusar se `paid_at IS NOT NULL`, com a mensagem "Esta compra teve dinheiro
envolvido e fica no histórico." Em `OrderManagement.tsx`, o botão de apagar só aparece se
`!order.paid_at`.

---

## 6. 🟡 Esgotar a loja com encomendas que nunca se pagam

**Onde:** `process_purchase` (convidados sem conta) e `cancel_my_purchase`.

**O erro:**
- Uma encomenda física por pagar **retira logo o stock**, e não há prazo para caducar.
- Os convidados não têm limite de encomendas (a função é chamada diretamente do browser com a
  anon key).
- Nos digitais, cada encomenda gasta uma chave que **nunca volta ao stock**, mesmo quando é
  cancelada (fica resolvido com o problema 2).

**Impacto real:** alguém de fora, ou um miúdo a brincar, pode esgotar um artigo em segundos com
encomendas falsas.

**Correção:**
- **Limite de encomendas por pagar:** no máximo 3 por membro. Para convidados, um teto global
  (ex.: 10 encomendas de convidado por pagar ao mesmo tempo, configurável em `store_settings`),
  com a mensagem "Há muitas encomendas por pagar. Fala com a coordenação."
- **Caducidade:** encomendas físicas não pagas (que não sejam reservas) caducam ao fim de N dias
  (`store_settings.unpaid_expiry_days`, por omissão 14). Repõe-se o stock e devolve-se o Gold, com
  a mesma lógica de `cancel_my_purchase`. Correr com `pg_cron` se estiver disponível no projeto.
  Se não estiver, chamar a função a partir de uma server action com service role ao abrir a Loja e
  o `/admin`, como já se faz com `cleanup_stale_event_guests` em `lib/actions/checkin.ts`.
- Mostrar na gestão de encomendas há quantos dias cada encomenda espera pagamento.

---

## 7. 🟡 "Paga ao teu dirigente"

**Onde:** mensagens de `process_purchase` ("Paga X € em dinheiro **ao teu dirigente**") e
`PurchaseDialog.tsx` ("O pagamento é feito em dinheiro, **junto da direção do clube**").

**O erro:** as duas mensagens dizem coisas diferentes, e os dirigentes não conseguem confirmar
pagamentos. Se um pai paga a um dirigente, o dinheiro passa por uma pessoa que não aparece em
lado nenhum.

**Correção (até a direção decidir outra coisa):** as mensagens passam a dizer
**"Paga X € a um coordenador do clube"**, de forma igual na função e no diálogo, e mostram a
referência da encomenda quando ela existir (vem com o Cofre).

---

## 8. 🟢 Preço de custo visível a qualquer visitante

**Onde:** `app/shop/page.tsx` faz `.from('store_products').select('*')` e a política
`"Public can view active products"` deixa qualquer pessoa ler a linha inteira.

**O erro:** o `cost_price` (quanto o clube pagou por cada artigo) chega ao browser de qualquer
visitante, nos dados da página e pela API.

**Atenção:** o `PurchaseDialog` usa o custo no browser (`lib/store-pricing.ts`,
`computePurchasePricing`) para calcular os tetos do desconto Gold e do desconto por quantidade.
Por isso não basta tirar a coluna.

**Correção (prioridade baixa, fazer por último):**
- Criar uma função `get_purchase_quote(p_product_id, p_quantity)` que devolve os valores já
  calculados no servidor (total, desconto por quantidade, desconto Gold máximo), com a mesma lógica
  de `process_purchase`. O diálogo passa a usá-la em vez de calcular com o custo.
- Em `app/shop/page.tsx`, selecionar só as colunas necessárias, sem `cost_price`.
- `REVOKE SELECT (cost_price) ON public.store_products FROM anon, authenticated`. Os ecrãs de
  gestão leem o custo por uma função só para coordenação real.
- Manter `lib/store-pricing.test.ts` a passar. Se a lógica passar para SQL, os testes passam a
  cobrir a função de cotação.

---

## Checklist de testes no fim

- [ ] Sem sessão: `mark_purchase_paid`, `mark_purchase_delivered`, `refund_purchase` e
      `delete_purchase_record` dão "Sem permissão".
- [ ] Ajudante com papel de coordenador: não vê a Loja no admin e as mesmas funções dão "Sem permissão".
- [ ] Membro com digital por pagar: `digital_key_delivered` vem vazio; depois de o coordenador
      marcar como pago, a chave aparece.
- [ ] Cancelar um digital por pagar não gasta chaves (o stock de chaves fica igual).
- [ ] Não é possível apagar uma compra paga e reembolsada.
- [ ] A 4.ª encomenda por pagar de um membro é recusada.
- [ ] Uma encomenda física por pagar há mais de N dias caduca e repõe o stock.
- [ ] Nos dados da página `/shop` não aparece `cost_price`.
- [ ] A Loja continua a funcionar: comprar com Gold, comprar em dinheiro, reservas, desconto por
      quantidade, cancelar, marcar pago/entregue e reembolsar.
- [ ] `bun test lib/store-pricing.test.ts` passa, e `bun run build` também.
