# Músicas do VanaCoro — prompts para o Suno

**Objetivo:** a banda sonora do projetor do VanaCoro, ao estilo de um concurso de
televisão ("Family Feud" / "100 Portugueses Disseram"), na mesma linha das músicas do
VanaSketch.

Guarda os ficheiros em **`public/sounds/VanaCoro/`** com estes nomes exatos: o jogo
procura-os aí. Enquanto um ficheiro não existir, essa música não toca, e os efeitos
sonoros usam um som sintetizado de reserva, por isso podes ir pondo as músicas aos poucos.

---

## Como usar no Suno

1. **Create → Custom.**
2. Liga **Instrumental** (sem voz) em todas.
3. Copia o texto de **Style** para o campo *Style of Music* e o **Title** para o título.
4. Gera 2 ou 3 versões e escolhe a que soa melhor no projetor (colunas de sala, não auscultadores).
5. Para as músicas em loop, corta no Audacity (ou no próprio editor do Suno) um troço de
   **60–90 s** que termine num ponto parecido com o início, para o loop não "saltar".
6. Exporta em **MP3** e muda o nome para o indicado.

> [!tip] Coerência
> Gera todas na mesma sessão e, se o Suno deixar, usa a primeira (o tema do lobby) como
> referência (*Cover* / *Persona*) para as outras: assim soam ao mesmo programa de TV.

---

## Músicas (por ordem de importância)

### 1. Lobby — `VanaCoro - Lobby Theme.mp3` (loop)
Toca enquanto as pessoas entram com o QR code.
- **Title:** VanaCoro Lobby
- **Style:**
```
instrumental, TV game show theme, upbeat funky brass and slap bass, bright synth stabs, handclaps, catchy hook, 118 bpm, joyful, family friendly, studio audience energy, loopable, no vocals
```

### 2. A jogar — `VanaCoro - Playing.mp3` (loop)
Fundo enquanto as equipas vão dizendo respostas. Tem de ficar **baixinho e não cansar**.
- **Title:** VanaCoro Board
- **Style:**
```
instrumental, light game show background bed, soft funk groove, muted guitar, warm electric piano, gentle percussion, 105 bpm, playful and curious, minimal melody, background music under talking, loopable, no vocals
```

### 3. Duelo — `VanaCoro - Faceoff.mp3` (loop)
Os dois capitães frente a frente, à espera do "Já sei!".
- **Title:** VanaCoro Faceoff
- **Style:**
```
instrumental, game show face-off tension, ticking hi-hats, pulsing synth bass, rising string ostinato, drum rolls, suspenseful but fun, 128 bpm, short build loop, no vocals
```

### 4. Roubo — `VanaCoro - Steal.mp3` (loop)
3 falhas: a outra equipa tem uma tentativa para roubar o pote.
- **Title:** VanaCoro Steal
- **Style:**
```
instrumental, dramatic game show suspense, low brass hits, heartbeat kick drum, tremolo strings, timpani rolls, tense countdown feeling, cinematic but playful, 90 bpm, loopable, no vocals
```

### 5. Fim da ronda — `VanaCoro - Round End.mp3` (toca uma vez)
A ronda tem vencedor: fanfarra curta. Corta para **6–10 s**.
- **Title:** VanaCoro Round Win
- **Style:**
```
instrumental, short game show winner fanfare, triumphant brass, cymbal crash, bright synth sparkle, applause feel, celebratory sting, 5 to 10 seconds, no vocals
```

### 6. Vitória — `VanaCoro - Victory Celebration.mp3` (loop)
Pódio final das equipas.
- **Title:** VanaCoro Victory
- **Style:**
```
instrumental, big game show finale celebration, energetic brass section, funky drums, gospel-style organ, joyful handclaps, confetti moment, 124 bpm, euphoric and family friendly, loopable, no vocals
```

---

## Efeitos sonoros (ElevenLabs → Sound Effects)

Se não puseres nenhum, o jogo usa sons sintetizados. Com o ElevenLabs:

1. Abre **Sound Effects** e cola o **Prompt**.
2. Em **Duration**, põe a duração indicada (não deixes em automático).
3. **Prompt influence** alto (~70–80 %), para seguir à risca o pedido.
4. Gera, ouve as 4 variações e descarrega a melhor em MP3 com o nome indicado.

| Ficheiro | Quando toca | Duração |
|---|---|---|
| `sfx-reveal.mp3` | Uma resposta é revelada no quadro (a carta vira) | 1,5 s |
| `sfx-strike.mp3` | ❌ gigante no ecrã (resposta errada) | 1,2 s |
| `sfx-buzz.mp3` | Um capitão carregou em "Já sei!" | 0,8 s |
| `sfx-steal.mp3` | Começa o roubo (3 falhas) | 2,5 s |

### `sfx-reveal.mp3` — resposta certa
```
Bright game show correct answer ding, a clean two-note chime with a sparkly shimmer tail, cheerful and satisfying, like a TV quiz board tile flipping to reveal an answer, no voice, no music
```

### `sfx-strike.mp3` — resposta errada (❌)
```
Loud classic game show wrong answer buzzer, harsh low electronic "ehhh" buzz, short and punchy, like a TV family quiz show strike, no voice, no music
```

### `sfx-buzz.mp3` — "Já sei!"
```
Quick game show buzz-in button sound, a sharp bright electronic beep-buzz when a contestant slams the buzzer first, energetic and short, no voice, no music
```

### `sfx-steal.mp3` — começa o roubo
```
Dramatic game show suspense sting, a deep orchestral brass hit with a timpani boom and a short rising tension swell, the moment the other team gets a chance to steal, cinematic but playful, no voice
```

> [!tip] Volume
> Os efeitos tocam por cima da música. Se algum sair muito mais alto ou mais baixo que os
> outros, gera outra vez ou ajusta no Audacity (Efeitos → Normalizar a −3 dB) para soarem
> todos ao mesmo nível.

---

## Onde guardar

```
public/sounds/VanaCoro/
├── VanaCoro - Lobby Theme.mp3
├── VanaCoro - Playing.mp3
├── VanaCoro - Faceoff.mp3
├── VanaCoro - Steal.mp3
├── VanaCoro - Round End.mp3
├── VanaCoro - Victory Celebration.mp3
├── sfx-reveal.mp3      (ElevenLabs)
├── sfx-strike.mp3      (ElevenLabs)
├── sfx-buzz.mp3        (ElevenLabs)
└── sfx-steal.mp3       (ElevenLabs)
```
