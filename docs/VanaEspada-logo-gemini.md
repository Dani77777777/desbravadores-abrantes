# Instruções para o Gemini — logótipo do VanaEspada

**Objetivo:** gerar `public/images/VanaEspada.png` — 1024×1024 — na mesma linguagem
visual dos logótipos que já existem no Centro de Jogos.

---

## 1. Antes de escrever o prompt

Anexa ao Gemini **as quatro imagens de referência**, por esta ordem:

```
public/images/VanaQuest.png
public/images/VanaTrilha.png
public/images/VanaWords.png
public/images/VanaCamp.png
```

E escreve por cima, antes do prompt:

> Estas quatro imagens são a família de logótipos de um clube de Desbravadores.
> Quero um quinto logótipo da mesma família, para um jogo chamado VanaEspada.
> Segue o mesmo emblema, a mesma paleta, a mesma tipografia e a mesma composição.
> As imagens anexas são **referência de estilo**, não para copiar tal e qual.

> **Porquê anexar tudo:** o emblema dos Desbravadores (o triângulo invertido) tem
> demasiados detalhes para se descrever só por palavras. Sem as referências, o
> modelo inventa um emblema diferente e o logótipo deixa de pertencer ao conjunto.

---

## 2. Paleta exata

Cores medidas nos logótipos existentes — usa estas, não aproximações:

| Elemento | Cor | Hex |
|---|---|---|
| Fundo | Branco-sujo quente | `#F8F8F6` |
| Xadrez subtil do fundo | Cinzento muito claro | `#EFEFED` |
| Título e texto principal | Azul-marinho | `#1E3264` |
| Emblema (triângulo) | Vermelho | `#D2301F` |
| Contorno do emblema e ícones laterais | Dourado / mostarda | `#D2A63A` |
| Destaques da espada / brilho | Dourado claro | `#E8C56A` |

---

## 3. Prompt principal (copia tudo)

```
Cria um logótipo quadrado de 1024×1024 px para um jogo bíblico chamado
"VanaEspada", da mesma família visual das imagens em anexo.

COMPOSIÇÃO (de cima para baixo):

1. TOPO, AO CENTRO: o emblema dos Desbravadores tal como aparece nas imagens de
   referência — um triângulo invertido vermelho (#D2301F) com contorno grosso
   dourado, a palavra "DESBRAVADORES" em arco dourado na parte de cima, um escudo
   branco ao centro atravessado por uma espada azul-marinho, e a palavra "CLUBE"
   em dourado junto ao vértice de baixo. Mantém as proporções e o detalhe
   exatamente como nas referências.

2. MARGENS ESQUERDA E DIREITA: ícones pequenos em traço fino dourado (#D2A63A),
   espalhados verticalmente, como nas referências — rosa dos ventos, nó de corda,
   tenda, flecha, galhardete e pegadas. São discretos, não competem com o centro.

3. CENTRO (a ilustração deste jogo): uma Bíblia aberta vista de cima, em tons
   creme e dourado, com uma espada de lâmina prateada e punho dourado pousada na
   diagonal sobre as páginas, a brilhar ao de leve. Sobre a página da direita, um
   marcador de localização (pin de mapa) vermelho, como os dos mapas, a apontar
   para um versículo. O pin é o que dá a ideia do jogo: descobrir ONDE está o
   versículo. Estilo de ilustração digital limpa, com contornos definidos e
   sombras suaves — o mesmo registo do tabuleiro do VanaTrilha.

4. FUNDO: branco-sujo quente (#F8F8F6) com um padrão de xadrez muito subtil em
   cinzento claro, igual ao do VanaQuest e do VanaCamp.

5. RODAPÉ: a palavra "VANAESPADA" em maiúsculas, tipo de letra sans-serif muito
   pesado (black/heavy), em azul-marinho #1E3264, ocupando quase toda a largura.
   Imediatamente a seguir ao "A" final, o pequeno glifo de espada azul-marinho
   estilizada que aparece a seguir ao título em todas as referências, e uma
   pequena estrela branca de quatro pontas no canto inferior direito.

6. POR BAIXO DO TÍTULO: o subtítulo "A ESPADA DO ESPÍRITO" em maiúsculas,
   sans-serif bold, azul-marinho, bem mais pequeno que o título e centrado.

REGRAS:
- Texto em português de Portugal, escrito exatamente assim: "VANAESPADA",
  "A ESPADA DO ESPÍRITO", "DESBRAVADORES", "CLUBE". Sem erros, sem letras a mais
  ou a menos, sem palavras inventadas.
- Formato quadrado 1:1, 1024×1024 px, sem margens transparentes.
- Sem pessoas reais, sem rostos reconhecíveis, sem marcas registadas.
- Sem texto adicional nenhum além do indicado.
```

---

## 4. Checklist antes de aceitar a imagem

Passa por esta lista antes de guardar o ficheiro. Se falhar um ponto, repete o
prompt a pedir só essa correção.

- [ ] O emblema no topo é **igual** ao das referências (triângulo vermelho, arco
      "DESBRAVADORES", escudo branco com espada, "CLUBE" em baixo).
- [ ] Diz **VANAESPADA** — uma palavra, sem espaço, sem hífen, bem escrita.
- [ ] O subtítulo diz **A ESPADA DO ESPÍRITO** — com o acento no "Í".
- [ ] O azul do título é escuro (marinho), não azul vivo nem roxo.
- [ ] O fundo é claro. **Nunca** fundo escuro: no site o logótipo aparece sobre
      fundos escuros e claros, e todos os outros são claros.
- [ ] A imagem é quadrada e o conteúdo não fica cortado nas bordas.
- [ ] **Lê bem a 96 px.** Reduz a imagem para 96×96 e confirma que ainda se
      percebe o que é — é este o tamanho a que aparece no telemóvel e nos ecrãs
      de jogo. Se ficar uma papa, pede uma ilustração central mais simples e
      maior.

---

## 5. Se alguma coisa correr mal

| Problema | O que pedir a seguir |
|---|---|
| Escreveu "VANA ESPADA" ou "VANAESPADAS" | "Corrige apenas o texto do título para VANAESPADA, uma única palavra, mantendo tudo o resto igual." |
| Inventou um emblema diferente | "O emblema do topo tem de ser exatamente o das imagens de referência. Volta a gerar só com esse emblema corrigido." |
| Ilustração central demasiado carregada | "Simplifica o centro: só a Bíblia aberta, a espada na diagonal e o pin de localização. Tira tudo o resto." |
| Fundo escuro ou colorido | "O fundo tem de ser branco-sujo #F8F8F6 com xadrez cinzento muito subtil, como no VanaQuest." |
| Cores fora da família | "Usa exatamente estas cores: fundo #F8F8F6, título #1E3264, emblema #D2301F, ícones #D2A63A." |

---

## 6. Alternativas para o centro

Se a Bíblia com o pin não resultar, estas mantêm-se dentro da identidade:

1. **Mapa-Bíblia** — a Bíblia aberta desenhada como um mapa antigo, com uma linha
   a tracejado a ligar dois pontos e um X dourado a marcar o versículo.
2. **Espada e lanterna** — uma espada dourada cruzada com um feixe de luz que
   ilumina uma página, a lembrar "lâmpada para os meus pés" (Sl 119:105).
3. **Régua de livros** — uma fila de lombadas de livros (os 66 livros da Bíblia)
   em cores diferentes, com um pin a apontar para uma delas. É a mais próxima do
   que o jogo mostra no projetor.

---

## 7. Depois de gerar

Guarda o ficheiro em:

```
public/images/VanaEspada.png
```

O site já o procura nesse caminho — o cartão no Centro de Jogos, o ecrã de
entrada, o painel do anfitrião, o projetor e a gestão passam todos a mostrá-lo
sem mais nenhuma alteração ao código.
