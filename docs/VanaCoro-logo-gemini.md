# Instruções para o Gemini — logótipo do VanaCoro

**Objetivo:** gerar `public/images/VanaCoro.png` — 1024×1024 — na mesma linguagem
visual dos logótipos mais recentes do Centro de Jogos.

---

## 1. Referências a anexar

Anexa ao Gemini estas imagens, por esta ordem:

```
public/images/VanaSketch.png
public/images/VanaEspada.jpeg
public/images/VanaSentinela.jpeg
public/images/VanaCodigo.png
```

---

## 2. Prompt (copia tudo)

```
Estas imagens são a família de logótipos dos jogos de um clube de Desbravadores.
Quero mais um logótipo da mesma família, para um jogo chamado VanaCoro. Segue o
mesmo emblema, a mesma paleta, a mesma tipografia e a mesma composição das
referências. As imagens são referência de estilo, não para copiar tal e qual.

Sobre o jogo: é ao estilo de "Family Feud" / "100 Portugueses Disseram". Durante
a semana toda a gente responde a uma pergunta; no dia do programa de jovens (JA)
duas equipas sobem ao palco e tentam adivinhar as respostas mais populares, que
vão sendo reveladas num quadro grande no projetor. O nome vem de "em coro":
quando toda a gente diz a mesma coisa.

Cria um logótipo quadrado de 1024×1024 px, com esta composição de cima para baixo:

1. TOPO, AO CENTRO: o emblema dos Desbravadores igual ao das referências — o
   triângulo invertido vermelho (#D2301F) com contorno dourado, a palavra
   "DESBRAVADORES" em dourado na faixa de cima, o escudo branco atravessado pela
   espada azul-marinho e a palavra "CLUBE" em dourado junto ao vértice de baixo.

2. MARGENS ESQUERDA E DIREITA: os pequenos ícones em traço fino dourado (#D2A63A)
   das referências — rosa dos ventos, nó de corda, tenda, arco e flecha, pegadas
   e o mini-emblema. Discretos, não competem com o centro.

3. CENTRO (a ilustração deste jogo): um quadro de concurso de televisão, em
   azul-marinho (#1E3264) com moldura dourada brilhante e pequenas luzes à volta,
   como nos programas de concursos. Dentro do quadro, 5 barras horizontais
   empilhadas: as 3 de cima já estão "viradas" e reveladas em dourado com um ícone
   simples cada (uma lanterna, uma tenda e uma fogueira), e as 2 de baixo ainda
   estão escondidas, em azul, só com os números "4" e "5". Por trás e por cima
   do quadro saem 3 ou 4 balões de fala de banda desenhada, em branco com contorno
   azul-marinho, sobrepostos uns aos outros como se muitas pessoas falassem ao
   mesmo tempo (o "coro"). À frente do quadro, em baixo, um botão de campainha
   vermelho redondo, daqueles de concurso. Alguns brilhos dourados de quatro
   pontas à volta. Estilo de ilustração digital limpa, com contornos definidos e
   sombras suaves, como o VanaSketch e o VanaEspada.

4. FUNDO: claro, branco-sujo quente (#F8F8F6) com o padrão de quadrados muito
   subtil em cinzento claro, igual ao do VanaSketch e do VanaEspada.

5. TÍTULO: a palavra "VANACORO" em maiúsculas, numa só palavra, no mesmo tipo de
   letra sans-serif muito pesado das referências, em azul-marinho #1E3264,
   ocupando quase toda a largura, com o pequeno traço/glifo azul-marinho junto ao
   título como nas referências.

6. SUBTÍTULO, por baixo do título: "O QUE É QUE O JA DISSE?" em maiúsculas,
   sans-serif bold, azul-marinho, mais pequeno que o título e centrado.

7. CANTO INFERIOR DIREITO: a pequena estrela branca de quatro pontas, como nas
   referências.

Texto em português de Portugal, escrito exatamente assim: "VANACORO",
"O QUE É QUE O JA DISSE?", "DESBRAVADORES", "CLUBE".
```

---

## 3. Antes de aceitar a imagem

- [ ] O emblema do topo é igual ao das referências.
- [ ] Diz **VANACORO**: uma palavra, sem espaço nem hífen.
- [ ] O subtítulo diz **O QUE É QUE O JA DISSE?**, com o acento no "É" e o ponto de interrogação.
- [ ] O fundo é claro, como nos outros.
- [ ] **Lê bem a 96 px**: reduz a imagem e confirma que ainda se percebe o quadro com as barras.

## 4. Se alguma coisa correr mal

| Problema | O que pedir a seguir |
|---|---|
| Escreveu "VANA CORO" ou outra coisa | "Corrige só o título para VANACORO, uma única palavra, e mantém tudo o resto igual." |
| Subtítulo errado | "Corrige só o subtítulo para O QUE É QUE O JA DISSE?, exatamente assim." |
| Emblema diferente | "O emblema do topo tem de ser exatamente o das imagens de referência." |
| Centro demasiado carregado | "Simplifica o centro: só o quadro com as 5 barras e os balões de fala. Tira a campainha." |
| Barras cheias de palavras inventadas | "Nas barras reveladas põe só um ícone (lanterna, tenda, fogueira); nas escondidas só os números 4 e 5." |

## 5. Depois de gerar

Guarda em `public/images/VanaCoro.png`. O site já procura o logótipo nesse caminho.
