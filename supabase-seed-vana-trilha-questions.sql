-- ============================================
-- VanaTrilha — Seed inicial do banco de perguntas
-- ============================================
-- Correr DEPOIS de supabase-setup-vana-trilha.sql.
-- 105 perguntas: 15 por estação (5 fáceis, 5 médias, 5 difíceis).
-- Todas com referência bíblica e explicação curta.
-- Re-executável: perguntas já existentes (mesma estação + enunciado) são ignoradas.
-- Citações seguem a tradução Almeida (ARC/ARA), adaptadas a português europeu.
-- ============================================

INSERT INTO public.vanatrilha_questions
  (station, category, difficulty, prompt, options, correct_index, reference, explanation)
VALUES

-- ─────────────────────────────────────────────
-- ESTAÇÃO 1 — EGITO (Êxodo 1–12)
-- ─────────────────────────────────────────────
(1, 'personagens', 'facil',
 'Quem foi escolhido por Deus para tirar o povo de Israel do Egito?',
 '["Arão", "Moisés", "José", "Josué"]', 1, 'Êxodo 3:10',
 'Na sarça ardente, Deus disse a Moisés: «Vem agora, e eu te enviarei a Faraó, para que tires o meu povo do Egito.»'),

(1, 'milagres', 'facil',
 'De onde falou Deus com Moisés no monte Horebe?',
 '["De uma nuvem escura", "De uma sarça que ardia sem se queimar", "De uma coluna de fogo", "Do meio de um rio"]', 1, 'Êxodo 3:2',
 'Moisés viu uma sarça (um arbusto) a arder, mas o fogo não a consumia. Foi dali que Deus o chamou.'),

(1, 'personagens', 'facil',
 'Quem encontrou o bebé Moisés num cesto junto ao rio?',
 '["A filha de Faraó", "Miriã, a irmã dele", "Uma escrava egípcia", "A mulher de Faraó"]', 0, 'Êxodo 2:5-6',
 'A filha de Faraó foi lavar-se ao rio, viu o cesto entre os juncos e teve compaixão do menino.'),

(1, 'lugares', 'facil',
 'Em que rio do Egito foi posto o cesto com o bebé Moisés?',
 '["Jordão", "Eufrates", "Nilo", "Tigre"]', 2, 'Êxodo 2:3',
 'A mãe de Moisés pôs o cesto nos juncos à beira do rio do Egito, o Nilo, para o esconder da ordem de Faraó.'),

(1, 'numeros', 'facil',
 'Quantas pragas enviou Deus sobre o Egito?',
 '["7", "10", "12", "3"]', 1, 'Êxodo 7–12',
 'Foram dez pragas, desde a água em sangue até à morte dos primogénitos, antes de Faraó deixar o povo sair.'),

(1, 'milagres', 'media',
 'Qual foi a primeira praga do Egito?',
 '["Rãs por todo o lado", "Gafanhotos", "A água do rio transformou-se em sangue", "Três dias de trevas"]', 2, 'Êxodo 7:20',
 'Arão levantou a vara e feriu as águas do rio: toda a água se tornou em sangue e os peixes morreram.'),

(1, 'personagens', 'media',
 'Quem ajudou Moisés a falar com Faraó, porque falava bem?',
 '["Arão, o seu irmão", "Josué, o seu ajudante", "Jetro, o seu sogro", "Calebe, o espia"]', 0, 'Êxodo 4:14-16',
 'Moisés dizia que não sabia falar bem. Deus respondeu que Arão, o seu irmão, falaria ao povo por ele.'),

(1, 'versiculos', 'media',
 'Completa a mensagem de Deus a Faraó: «Deixa ir o meu povo, para que me ___ no deserto.»',
 '["abandone", "sirva", "procure", "esqueça"]', 1, 'Êxodo 7:16',
 'Deus queria o seu povo livre para O servir e adorar: «Deixa ir o meu povo, para que me sirva no deserto.»'),

(1, 'lugares', 'media',
 'Em que terra do Egito viviam os israelitas?',
 '["Gósen", "Canaã", "Midiã", "Moabe"]', 0, 'Êxodo 8:22',
 'Os israelitas viviam em Gósen. Durante as pragas, Deus protegeu essa terra, e as moscas não chegaram lá.'),

(1, 'versiculos', 'media',
 'Quando Moisés perguntou o nome de Deus, o que Ele respondeu?',
 '["EU SOU O QUE SOU", "O Todo-Poderoso", "O Bom Pastor", "O Rei dos reis"]', 0, 'Êxodo 3:14',
 'Deus disse a Moisés: «EU SOU O QUE SOU». Mostra que Deus sempre existiu e nunca muda.'),

(1, 'personagens', 'dificil',
 'Como se chamavam as parteiras que não obedeceram à ordem de Faraó de matar os meninos?',
 '["Sifrá e Puá", "Raquel e Lia", "Débora e Jael", "Rute e Noemi"]', 0, 'Êxodo 1:15-17',
 'Sifrá e Puá temiam a Deus e deixaram viver os meninos, apesar da ordem do rei do Egito.'),

(1, 'lugares', 'dificil',
 'Para onde fugiu Moisés depois de matar um egípcio?',
 '["Para Gósen", "Para a terra de Midiã", "Para Edom", "Para a Babilónia"]', 1, 'Êxodo 2:15',
 'Moisés fugiu de Faraó e foi viver para a terra de Midiã, onde se casou com Zípora e foi pastor.'),

(1, 'numeros', 'dificil',
 'Que idade tinha Moisés quando falou com Faraó?',
 '["40 anos", "60 anos", "80 anos", "120 anos"]', 2, 'Êxodo 7:7',
 'Moisés tinha 80 anos e Arão 83 quando falaram com Faraó. Deus usa pessoas de todas as idades!'),

(1, 'milagres', 'dificil',
 'Qual destes sinais Deus deu a Moisés junto à sarça ardente?',
 '["A sua vara floresceu", "A sua cara passou a brilhar", "A sua mão ficou leprosa e depois voltou a ficar sã", "Caiu fogo do céu"]', 2, 'Êxodo 4:6-7',
 'Moisés pôs a mão no peito e ela ficou leprosa, branca como a neve. Voltou a pô-la e ficou curada.'),

(1, 'numeros', 'dificil',
 'Em que dia do primeiro mês devia ser morto o cordeiro da Páscoa?',
 '["No dia 1", "No dia 7", "No dia 10", "No dia 14"]', 3, 'Êxodo 12:6',
 'O cordeiro era escolhido no dia 10 e sacrificado ao fim da tarde do dia 14. O sangue nas portas protegia as famílias.'),

-- ─────────────────────────────────────────────
-- ESTAÇÃO 2 — MAR VERMELHO (Êxodo 12–15)
-- ─────────────────────────────────────────────
(2, 'milagres', 'facil',
 'O que aconteceu ao mar quando Moisés estendeu a mão?',
 '["Secou para sempre", "Ficou gelado", "Abriu-se e o povo passou em seco", "Ficou vermelho como sangue"]', 2, 'Êxodo 14:21-22',
 'Deus abriu o mar e os israelitas passaram pelo meio, em terra seca, com as águas como um muro à direita e à esquerda.'),

(2, 'milagres', 'facil',
 'O que guiava o povo de Israel de dia e de noite?',
 '["Uma estrela brilhante", "Uma coluna de nuvem de dia e uma coluna de fogo de noite", "Um anjo com uma tocha", "O sol e a lua"]', 1, 'Êxodo 13:21',
 'Deus ia à frente do povo: de dia numa coluna de nuvem para os guiar, de noite numa coluna de fogo para os iluminar.'),

(2, 'personagens', 'facil',
 'Que rei perseguiu os israelitas com os seus carros até ao Mar Vermelho?',
 '["Nabucodonosor", "Herodes", "Saul", "Faraó"]', 3, 'Êxodo 14:8',
 'Faraó arrependeu-se de deixar o povo sair e perseguiu-os com o exército e os carros do Egito.'),

(2, 'personagens', 'facil',
 'Quem pegou num tamboril e cantou com as mulheres depois da travessia?',
 '["Miriã", "Débora", "Raabe", "Ana"]', 0, 'Êxodo 15:20-21',
 'Miriã, irmã de Moisés e Arão, tocou tamboril e cantou: «Cantai ao Senhor, porque sumamente se exaltou.»'),

(2, 'versiculos', 'facil',
 'Completa o que Moisés disse ao povo junto ao mar: «Não temais; estai quietos e vede o ___ do Senhor.»',
 '["castigo", "livramento", "templo", "rosto"]', 1, 'Êxodo 14:13',
 'Com o exército de Faraó atrás e o mar à frente, Moisés pediu ao povo que confiasse: Deus ia salvá-los.'),

(2, 'milagres', 'media',
 'No Mar Vermelho, o que fez o vento forte que Deus mandou durante toda a noite?',
 '["Separou as águas do mar", "Derrubou as tendas", "Apagou a coluna de fogo", "Levou os egípcios para longe"]', 0, 'Êxodo 14:21',
 'Deus fez soprar um forte vento oriental toda a noite, que abriu as águas e secou o fundo do mar.'),

(2, 'personagens', 'media',
 'De quem eram os ossos que Moisés levou ao sair do Egito?',
 '["De Abraão", "De José", "De Jacó", "De Isaque"]', 1, 'Êxodo 13:19',
 'José tinha pedido que os seus ossos fossem levados para a Terra Prometida quando Deus libertasse o povo.'),

(2, 'lugares', 'media',
 'Porque é que Deus não levou o povo pelo caminho da terra dos filisteus, que era mais curto?',
 '["Porque o caminho estava inundado", "Porque lá viviam gigantes", "Para o povo não desistir ao ver a guerra", "Porque Faraó guardava esse caminho"]', 2, 'Êxodo 13:17',
 'Deus sabia que o povo podia ter medo da guerra e querer voltar ao Egito. Por isso levou-os pelo deserto.'),

(2, 'milagres', 'media',
 'Na noite antes da travessia, para onde foi a coluna de nuvem?',
 '["Para cima do Egito", "Para o meio do mar", "Para entre o exército egípcio e o povo de Israel", "Para o alto do monte"]', 2, 'Êxodo 14:19-20',
 'A nuvem pôs-se atrás do povo: era escuridão para os egípcios e luz para Israel, e assim não se aproximaram.'),

(2, 'versiculos', 'media',
 'Completa o cântico de Moisés: «O Senhor é a minha força e o meu ___.»',
 '["escudo", "cântico", "pastor", "refúgio"]', 1, 'Êxodo 15:2',
 'Depois de atravessarem o mar, Moisés e o povo cantaram: «O Senhor é a minha força e o meu cântico; ele me foi por salvação.»'),

(2, 'numeros', 'dificil',
 'Quantos carros escolhidos levou Faraó para perseguir Israel?',
 '["100", "300", "600", "1000"]', 2, 'Êxodo 14:7',
 'Faraó levou 600 carros escolhidos e todos os outros carros do Egito. Mesmo assim, Deus salvou o seu povo.'),

(2, 'lugares', 'dificil',
 'Junto de que lugar acamparam os israelitas antes de atravessar o mar?',
 '["Pi-Hairote", "Jericó", "Betel", "Hebrom"]', 0, 'Êxodo 14:2',
 'Deus mandou o povo acampar diante de Pi-Hairote, entre Migdol e o mar, diante de Baal-Zefom.'),

(2, 'milagres', 'dificil',
 'O que aconteceu às rodas dos carros egípcios dentro do mar?',
 '["Pegaram fogo", "Deus tirou-lhes as rodas e os carros andavam com dificuldade", "Transformaram-se em pedra", "Ficaram presas em gelo"]', 1, 'Êxodo 14:25',
 'Deus fez com que as rodas saíssem dos carros. Os egípcios disseram: «Fujamos, porque o Senhor peleja por eles.»'),

(2, 'lugares', 'dificil',
 'Em que deserto entrou o povo logo a seguir ao Mar Vermelho, andando três dias sem água?',
 '["Deserto de Sin", "Deserto de Parã", "Deserto de Sur", "Deserto de Zim"]', 2, 'Êxodo 15:22',
 'Depois do Mar Vermelho, Moisés levou o povo ao deserto de Sur. Andaram três dias sem encontrar água.'),

(2, 'numeros', 'dificil',
 'Quantos anos viveram os filhos de Israel no Egito?',
 '["40 anos", "120 anos", "430 anos", "1000 anos"]', 2, 'Êxodo 12:40-41',
 'Os filhos de Israel viveram no Egito 430 anos. No fim desse tempo, no mesmo dia, saíram todos.'),

-- ─────────────────────────────────────────────
-- ESTAÇÃO 3 — DESERTO DE SIN (Êxodo 15–17)
-- ─────────────────────────────────────────────
(3, 'milagres', 'facil',
 'Que alimento Deus mandou do céu todas as manhãs no deserto?',
 '["Figos", "Maná", "Peixe", "Pão de trigo"]', 1, 'Êxodo 16:14-15',
 'De manhã, o chão aparecia coberto de uma coisa miúda e branca. Os israelitas chamaram-lhe maná.'),

(3, 'milagres', 'facil',
 'Em Refidim, de onde saiu água para o povo beber?',
 '["De um poço antigo", "De uma nuvem", "De uma rocha que Moisés feriu com a vara", "De um rio escondido"]', 2, 'Êxodo 17:6',
 'Deus mandou Moisés ferir a rocha com a vara, e dela saiu água para todo o povo.'),

(3, 'personagens', 'facil',
 'Contra quem murmurou (se queixou) o povo no deserto por falta de comida?',
 '["Contra Josué e Calebe", "Contra Moisés e Arão", "Contra Faraó", "Contra Jetro"]', 1, 'Êxodo 16:2',
 'O povo queixou-se contra Moisés e Arão, dizendo que no Egito tinham pão com fartura. Mas Deus cuidou deles.'),

(3, 'numeros', 'facil',
 'Em que dia da semana não caía maná?',
 '["No primeiro dia", "No terceiro dia", "No sétimo dia, o sábado", "Caía todos os dias"]', 2, 'Êxodo 16:26',
 'Durante seis dias caía maná. No sétimo dia, o sábado, não caía: era dia de descanso.'),

(3, 'milagres', 'facil',
 'Que aves Deus enviou ao fim da tarde para o povo comer carne?',
 '["Pombas", "Codornizes", "Galinhas", "Águias"]', 1, 'Êxodo 16:13',
 'À tarde vieram codornizes que cobriram o arraial, e de manhã havia maná à volta do acampamento.'),

(3, 'numeros', 'media',
 'No sexto dia, quanto maná devia cada pessoa apanhar?',
 '["Metade", "O mesmo de sempre", "O dobro", "Nenhum"]', 2, 'Êxodo 16:22-23',
 'No sexto dia apanhavam o dobro, para terem comida no sábado, o dia santo de descanso.'),

(3, 'milagres', 'media',
 'O que acontecia ao maná guardado para o dia seguinte (sem ser para o sábado)?',
 '["Transformava-se em pedra", "Criava bichos e cheirava mal", "Ficava mais doce", "Transformava-se em ouro"]', 1, 'Êxodo 16:20',
 'Alguns guardaram maná para o dia seguinte, mas ele criou bichos e cheirou mal. Deus queria que confiassem n''Ele cada dia.'),

(3, 'versiculos', 'media',
 'Segundo a Bíblia, o maná era branco como semente de coentro e o seu sabor era como…',
 '["bolos de mel", "sal", "uvas", "azeite"]', 0, 'Êxodo 16:31',
 'A Bíblia diz que o maná era branco como semente de coentro, e o seu sabor como bolos de mel.'),

(3, 'personagens', 'media',
 'Quem segurou os braços de Moisés durante a batalha contra Amaleque?',
 '["Josué e Calebe", "Arão e Hur", "Nadabe e Abiú", "Eleazar e Finéias"]', 1, 'Êxodo 17:12',
 'Enquanto Moisés tinha as mãos levantadas, Israel vencia. Quando se cansou, Arão e Hur seguraram-lhe as mãos até ao pôr do sol.'),

(3, 'lugares', 'media',
 'Em que lugar a água amarga ficou doce depois de Moisés lançar nela um pedaço de madeira?',
 '["Elim", "Refidim", "Mara", "Sinai"]', 2, 'Êxodo 15:23-25',
 'Em Mara a água era amarga. Deus mostrou a Moisés um lenho; ele lançou-o na água e ela ficou doce.'),

(3, 'numeros', 'dificil',
 'Qual era a porção de maná que cada pessoa devia apanhar por dia?',
 '["Um ómer", "Um efa", "Um talento", "Um siclo"]', 0, 'Êxodo 16:16',
 'Deus mandou apanhar um ómer por pessoa, conforme o número de pessoas de cada tenda.'),

(3, 'lugares', 'dificil',
 'Que nomes deu Moisés ao lugar onde o povo discutiu por causa da água?',
 '["Mara e Elim", "Massá e Meribá", "Gilgal e Betel", "Sin e Sur"]', 1, 'Êxodo 17:7',
 'Chamou-lhe Massá (prova) e Meribá (contenda), porque o povo discutiu e duvidou se o Senhor estava com eles.'),

(3, 'personagens', 'dificil',
 'Quem comandou os soldados de Israel na batalha contra Amaleque?',
 '["Calebe", "Arão", "Josué", "Hur"]', 2, 'Êxodo 17:9-10',
 'Moisés mandou Josué escolher homens e lutar contra Amaleque, enquanto ele orava no alto do outeiro.'),

(3, 'numeros', 'dificil',
 'Durante quantos anos comeu o povo de Israel o maná?',
 '["7 anos", "12 anos", "40 anos", "70 anos"]', 2, 'Êxodo 16:35',
 'Os filhos de Israel comeram maná 40 anos, até chegarem à fronteira da terra de Canaã.'),

(3, 'versiculos', 'dificil',
 'Depois de vencer Amaleque, Moisés construiu um altar. Que nome lhe deu?',
 '["O Senhor proverá", "O Senhor é paz", "O Senhor é a minha bandeira", "O Senhor é o meu pastor"]', 2, 'Êxodo 17:15',
 'Moisés chamou ao altar «O Senhor é a minha bandeira» (Jeová-Nissi), porque a vitória veio de Deus.'),

-- ─────────────────────────────────────────────
-- ESTAÇÃO 4 — MONTE SINAI (Êxodo 19–34)
-- ─────────────────────────────────────────────
(4, 'numeros', 'facil',
 'Quantos mandamentos Deus deu no monte Sinai?',
 '["5", "7", "10", "12"]', 2, 'Êxodo 20:1-17',
 'Deus deu os Dez Mandamentos, que mostram como amar a Deus e amar as outras pessoas.'),

(4, 'milagres', 'facil',
 'Onde escreveu Deus os Dez Mandamentos?',
 '["Em rolos de papiro", "Em duas tábuas de pedra", "Numa parede do templo", "Em peles de animais"]', 1, 'Êxodo 31:18',
 'Deus deu a Moisés duas tábuas de pedra, escritas pelo dedo de Deus.'),

(4, 'personagens', 'facil',
 'Quem subiu ao monte Sinai para falar com Deus e receber a Lei?',
 '["Arão", "Josué", "Moisés", "Faraó"]', 2, 'Êxodo 19:20',
 'Deus desceu sobre o monte Sinai e chamou Moisés ao cimo do monte. Moisés subiu.'),

(4, 'versiculos', 'facil',
 'Completa o quarto mandamento: «Lembra-te do dia do ___, para o santificar.»',
 '["jejum", "sábado", "perdão", "trabalho"]', 1, 'Êxodo 20:8',
 'O quarto mandamento pede para guardarmos o sábado como dia santo, de descanso e de encontro com Deus.'),

(4, 'lugares', 'facil',
 'Em que monte recebeu Moisés os Dez Mandamentos?',
 '["Monte Carmelo", "Monte das Oliveiras", "Monte Ararate", "Monte Sinai"]', 3, 'Êxodo 19:20; 31:18',
 'Foi no monte Sinai que Deus falou com Moisés e lhe deu as tábuas da Lei.'),

(4, 'numeros', 'media',
 'Quantos dias e noites esteve Moisés no monte com Deus?',
 '["7", "12", "40", "100"]', 2, 'Êxodo 24:18',
 'Moisés entrou na nuvem, subiu ao monte e lá esteve quarenta dias e quarenta noites.'),

(4, 'personagens', 'media',
 'Quem fez o bezerro de ouro quando o povo se cansou de esperar por Moisés?',
 '["Josué", "Arão", "Hur", "Calebe"]', 1, 'Êxodo 32:2-4',
 'Arão pediu ao povo os brincos de ouro e fez com eles um bezerro. Foi um grande pecado contra Deus.'),

(4, 'milagres', 'media',
 'O que aconteceu à cara de Moisés quando desceu do monte?',
 '["Brilhava", "Ficou leprosa", "Ficou cheia de rugas", "Ficou queimada pelo sol"]', 0, 'Êxodo 34:29-30',
 'Moisés tinha estado com Deus e a pele do seu rosto resplandecia. O povo até teve medo de se aproximar.'),

(4, 'versiculos', 'media',
 'Completa o primeiro mandamento: «Não terás outros ___ diante de mim.»',
 '["reis", "amigos", "deuses", "templos"]', 2, 'Êxodo 20:3',
 'O primeiro mandamento ensina que só Deus merece o primeiro lugar na nossa vida.'),

(4, 'milagres', 'media',
 'Como estava o monte Sinai quando Deus desceu sobre ele?',
 '["Coberto de neve", "Fumegava e tremia", "Cheio de flores", "Em silêncio e às escuras"]', 1, 'Êxodo 19:18',
 'O monte fumegava, porque o Senhor desceu sobre ele em fogo, e todo o monte tremia muito.'),

(4, 'milagres', 'dificil',
 'O que fez Moisés às primeiras tábuas da Lei quando viu o bezerro de ouro?',
 '["Escondeu-as numa caverna", "Deu-as a Arão", "Atirou-as e partiu-as ao pé do monte", "Enterrou-as"]', 2, 'Êxodo 32:19',
 'Moisés ficou muito triste e irado ao ver o povo a adorar o bezerro. Atirou as tábuas e partiu-as. Depois Deus deu-lhe outras.'),

(4, 'versiculos', 'dificil',
 'Qual destes mandamentos vem com a promessa de uma vida longa?',
 '["Não furtarás", "Honra a teu pai e a tua mãe", "Não matarás", "Não dirás falso testemunho"]', 1, 'Êxodo 20:12',
 '«Honra a teu pai e a tua mãe, para que se prolonguem os teus dias na terra.» É o mandamento com promessa (Efésios 6:2).'),

(4, 'personagens', 'dificil',
 'Quem acompanhou Moisés quando ele subiu ao monte de Deus?',
 '["Arão, o seu irmão", "Josué, o seu servidor", "Calebe", "Jetro, o seu sogro"]', 1, 'Êxodo 24:13',
 'Moisés levantou-se com Josué, o seu servidor, e subiu ao monte de Deus. Josué estava a ser preparado para ser líder.'),

(4, 'numeros', 'dificil',
 'Em que mês depois de sair do Egito chegou o povo ao deserto do Sinai?',
 '["No primeiro mês", "No terceiro mês", "No sétimo mês", "No décimo segundo mês"]', 1, 'Êxodo 19:1',
 'No terceiro mês depois de saírem do Egito, os filhos de Israel chegaram ao deserto do Sinai.'),

(4, 'lugares', 'dificil',
 'Que outro nome dá a Bíblia ao monte de Deus onde foi feita a aliança com Israel?',
 '["Horebe", "Carmelo", "Moriá", "Sião"]', 0, 'Êxodo 3:1; Deuteronómio 5:2',
 'O monte de Deus também é chamado Horebe. Foi lá que Moisés viu a sarça e que Deus fez aliança com o povo.'),

-- ─────────────────────────────────────────────
-- ESTAÇÃO 5 — CADES-BARNEIA (Números 13–21)
-- ─────────────────────────────────────────────
(5, 'numeros', 'facil',
 'Quantos espias enviou Moisés à terra de Canaã?',
 '["2", "7", "10", "12"]', 3, 'Números 13:2-16',
 'Moisés enviou 12 espias, um de cada tribo de Israel, para ver como era a terra.'),

(5, 'personagens', 'facil',
 'Quais foram os dois espias que confiaram em Deus e deram um bom relatório?',
 '["Arão e Hur", "Josué e Calebe", "Moisés e Arão", "Nadabe e Abiú"]', 1, 'Números 14:6-9',
 'Josué e Calebe disseram: «A terra é muito boa… o Senhor é connosco; não os temais.»'),

(5, 'versiculos', 'facil',
 'Os espias disseram que Canaã era uma terra que mana…',
 '["ouro e prata", "leite e mel", "água e vinho", "azeite e trigo"]', 1, 'Números 13:27',
 '«Fomos à terra a que nos enviaste; e verdadeiramente mana leite e mel.» Era uma terra muito rica.'),

(5, 'personagens', 'facil',
 'Que espia acalmou o povo e disse «Subamos animosamente» para conquistar a terra?',
 '["Josué", "Calebe", "Arão", "Coré"]', 1, 'Números 13:30',
 'Calebe fez calar o povo e disse: «Subamos animosamente e possuamo-la em herança; porque certamente prevaleceremos.»'),

(5, 'milagres', 'facil',
 'Quando o povo foi mordido por serpentes, o que mandou Deus Moisés fazer?',
 '["Um altar de pedra", "Uma serpente de bronze numa haste", "Um bezerro de ouro", "Uma tenda nova"]', 1, 'Números 21:8-9',
 'Quem olhasse para a serpente de bronze posta na haste ficava curado. Jesus comparou-se a esta serpente (João 3:14).'),

(5, 'numeros', 'media',
 'Durante quantos dias os espias observaram a terra de Canaã?',
 '["7 dias", "12 dias", "30 dias", "40 dias"]', 3, 'Números 13:25',
 'Ao fim de quarenta dias, os espias voltaram de espiar a terra.'),

(5, 'numeros', 'media',
 'Por cada dia que os espias andaram na terra, quanto tempo teve o povo de andar no deserto?',
 '["Um mês", "Um ano", "Uma semana", "Dois anos"]', 1, 'Números 14:34',
 'Os espias andaram 40 dias; por não confiar em Deus, o povo andou 40 anos no deserto, um ano por cada dia.'),

(5, 'personagens', 'media',
 'O que disseram os dez espias com medo sobre os habitantes de Canaã?',
 '["Que eram gigantes, e eles pareciam gafanhotos", "Que eram amigos de Israel", "Que já tinham fugido", "Que eram poucos e fracos"]', 0, 'Números 13:33',
 'Disseram: «Também vimos ali gigantes… e éramos aos nossos olhos como gafanhotos.» Esqueceram-se de que Deus era maior.'),

(5, 'milagres', 'media',
 'Em Meribá, Deus mandou Moisés falar à rocha. O que fez Moisés?',
 '["Falou-lhe com calma", "Feriu a rocha duas vezes com a vara", "Partiu-a com uma pedra", "Deitou-lhe azeite"]', 1, 'Números 20:8-11',
 'Moisés, irritado com o povo, feriu a rocha duas vezes em vez de lhe falar. Saiu água, mas Moisés desobedeceu a Deus.'),

(5, 'personagens', 'media',
 'Que irmã de Moisés morreu e foi sepultada em Cades?',
 '["Zípora", "Miriã", "Raabe", "Débora"]', 1, 'Números 20:1',
 'O povo chegou a Cades e ali morreu Miriã, irmã de Moisés e Arão, e ali foi sepultada.'),

(5, 'lugares', 'dificil',
 'Como se chamava o vale onde os espias cortaram um cacho de uvas tão grande que era levado por dois homens?',
 '["Vale de Escol", "Vale de Hinom", "Vale de Jezreel", "Vale de Acor"]', 0, 'Números 13:23-24',
 'Chamaram-lhe vale de Escol (que quer dizer «cacho») por causa do enorme cacho de uvas levado numa vara.'),

(5, 'personagens', 'dificil',
 'Qual era o nome de Josué antes de Moisés o mudar?',
 '["Eliseu", "Oseias", "Isaías", "Eleazar"]', 1, 'Números 13:16',
 'Josué chamava-se Oseias, filho de Num. Moisés chamou-lhe Josué, que quer dizer «o Senhor salva».'),

(5, 'numeros', 'dificil',
 'A partir de que idade os que murmuraram contra Deus não entrariam em Canaã?',
 '["De 12 anos para cima", "De 20 anos para cima", "De 30 anos para cima", "De 50 anos para cima"]', 1, 'Números 14:29-30',
 'Os que tinham 20 anos ou mais e murmuraram morreriam no deserto, exceto Calebe e Josué. Os mais novos entrariam na terra.'),

(5, 'personagens', 'dificil',
 'De que tribo era Calebe, o espia fiel?',
 '["Levi", "Benjamim", "Judá", "Rúben"]', 2, 'Números 13:6',
 'Calebe, filho de Jefoné, representava a tribo de Judá entre os doze espias.'),

(5, 'versiculos', 'dificil',
 'Completa as palavras de Josué e Calebe: «o Senhor é ___; não os temais.»',
 '["connosco", "o nosso rei", "a nossa espada", "poderoso"]', 0, 'Números 14:9',
 'Josué e Calebe lembraram ao povo que não havia razão para ter medo: «o Senhor é connosco; não os temais.»'),

-- ─────────────────────────────────────────────
-- ESTAÇÃO 6 — RIO JORDÃO (Josué 2–4)
-- ─────────────────────────────────────────────
(6, 'milagres', 'facil',
 'O que aconteceu às águas do rio Jordão quando os sacerdotes entraram com a arca?',
 '["Transformaram-se em vinho", "Pararam e o povo passou em seco", "Ficaram vermelhas", "Subiram até ao céu"]', 1, 'Josué 3:15-17',
 'Assim que os pés dos sacerdotes tocaram na água, as águas pararam e todo o povo passou em terra seca.'),

(6, 'personagens', 'facil',
 'Quem liderou o povo na travessia do Jordão, depois da morte de Moisés?',
 '["Calebe", "Arão", "Gideão", "Josué"]', 3, 'Josué 1:2; 3:7',
 'Deus disse a Josué: «Como fui com Moisés, assim serei contigo.» E Josué levou o povo através do Jordão.'),

(6, 'milagres', 'facil',
 'O que levavam os sacerdotes à frente do povo, ao atravessar o Jordão?',
 '["A arca da aliança", "O bezerro de ouro", "A serpente de bronze", "Um cesto de maná"]', 0, 'Josué 3:6',
 'Os sacerdotes levavam a arca da aliança, que lembrava que Deus ia à frente do seu povo.'),

(6, 'personagens', 'facil',
 'Que mulher de Jericó escondeu os dois espias de Israel?',
 '["Rute", "Raabe", "Miriã", "Ester"]', 1, 'Josué 2:1-4',
 'Raabe escondeu os espias no telhado, debaixo de canas de linho, e salvou-lhes a vida.'),

(6, 'numeros', 'facil',
 'Quantas pedras tiraram do meio do Jordão para fazer um memorial?',
 '["7", "10", "12", "40"]', 2, 'Josué 4:3-8',
 'Doze homens tiraram doze pedras do meio do rio, para lembrar às próximas gerações o que Deus fez.'),

(6, 'personagens', 'media',
 'Como fugiram os espias da casa de Raabe?',
 '["Por um túnel", "Disfarçados de soldados", "Desceram por uma corda pela janela", "Escondidos numa carroça de palha"]', 2, 'Josué 2:15',
 'A casa de Raabe ficava no muro da cidade. Ela fê-los descer por uma corda pela janela.'),

(6, 'lugares', 'media',
 'Onde atou Raabe o cordão de fio vermelho (escarlate), como sinal combinado com os espias?',
 '["Na janela da sua casa", "Na porta da cidade", "No poço", "No telhado"]', 0, 'Josué 2:18-21',
 'O cordão vermelho na janela era o sinal para que ela e a sua família fossem salvas quando Israel tomasse Jericó.'),

(6, 'lugares', 'media',
 'Onde acampou o povo depois de atravessar o Jordão, e onde Josué colocou as 12 pedras?',
 '["Betel", "Siló", "Gilgal", "Hebrom"]', 2, 'Josué 4:19-20',
 'O povo acampou em Gilgal, a oriente de Jericó, e Josué levantou lá as doze pedras tiradas do Jordão.'),

(6, 'numeros', 'media',
 'O que representavam as 12 pedras tiradas do rio Jordão?',
 '["Os 12 meses do ano", "As 12 tribos de Israel", "Os 12 espias", "Os 12 apóstolos"]', 1, 'Josué 4:5-8',
 'Cada pedra representava uma das doze tribos dos filhos de Israel.'),

(6, 'personagens', 'media',
 'Porque é que Raabe ajudou os espias de Israel?',
 '["Porque lhe pagaram com ouro", "Porque era israelita", "Porque tinha ouvido o que Deus fez e creu n''Ele", "Porque o rei de Jericó mandou"]', 2, 'Josué 2:9-11',
 'Raabe ouviu como Deus secou o Mar Vermelho e disse: «O Senhor, vosso Deus, é Deus em cima nos céus e em baixo na terra.»'),

(6, 'numeros', 'dificil',
 'A que distância da arca devia ficar o povo durante a travessia?',
 '["100 côvados", "500 côvados", "2000 côvados", "10 000 côvados"]', 2, 'Josué 3:4',
 'O povo devia ficar a cerca de dois mil côvados (quase um quilómetro) da arca, para todos verem o caminho.'),

(6, 'lugares', 'dificil',
 'Junto de que cidade se amontoaram as águas do Jordão?',
 '["Adão", "Siquém", "Zoar", "Ai"]', 0, 'Josué 3:16',
 'As águas que desciam pararam e levantaram-se num montão, muito longe, junto à cidade de Adão.'),

(6, 'lugares', 'dificil',
 'De que lugar Josué enviou os dois espias a Jericó?',
 '["Gilgal", "Cades", "Sitim", "Betel"]', 2, 'Josué 2:1',
 'Josué, filho de Num, enviou secretamente dois espias desde Sitim, para verem a terra e Jericó.'),

(6, 'numeros', 'dificil',
 'Quantos homens armados das tribos de Rúben, Gade e meia tribo de Manassés passaram o Jordão à frente do povo?',
 '["Cerca de 4 mil", "Cerca de 40 mil", "Cerca de 400 mil", "Cerca de 4 milhões"]', 1, 'Josué 4:12-13',
 'Quase quarenta mil homens armados passaram diante do Senhor para a batalha, nas campinas de Jericó.'),

(6, 'versiculos', 'dificil',
 'Completa: as pedras do Jordão serviam «para que todos os povos da terra conheçam a mão do Senhor, que é ___».',
 '["forte", "santa", "eterna", "bondosa"]', 0, 'Josué 4:24',
 'O memorial mostrava a todos os povos que a mão do Senhor é forte, e ensinava Israel a temer a Deus para sempre.'),

-- ─────────────────────────────────────────────
-- ESTAÇÃO 7 — TERRA PROMETIDA, CANAÃ (Josué 1–24)
-- ─────────────────────────────────────────────
(7, 'lugares', 'facil',
 'Que cidade caiu depois de o povo marchar à sua volta?',
 '["Ai", "Jericó", "Jerusalém", "Babilónia"]', 1, 'Josué 6:20',
 'Os israelitas marcharam à volta de Jericó como Deus mandou, e as muralhas caíram.'),

(7, 'versiculos', 'facil',
 'Completa a frase de Josué: «Eu e a minha casa serviremos ao ___.»',
 '["rei", "Senhor", "povo", "Moisés"]', 1, 'Josué 24:15',
 'Já velho, Josué desafiou o povo a escolher a quem servir e disse: «Eu e a minha casa serviremos ao Senhor.»'),

(7, 'numeros', 'facil',
 'Durante quantos dias marcharam os israelitas à volta de Jericó?',
 '["3", "7", "12", "40"]', 1, 'Josué 6:3-4,15',
 'Durante seis dias deram uma volta por dia. No sétimo dia deram sete voltas.'),

(7, 'milagres', 'facil',
 'O que aconteceu às muralhas de Jericó quando o povo gritou?',
 '["Ficaram mais altas", "Pegaram fogo", "Caíram", "Abriram-se as portas"]', 2, 'Josué 6:20',
 'Quando as trombetas tocaram e o povo gritou, o muro caiu e o povo entrou na cidade.'),

(7, 'personagens', 'facil',
 'A quem disse Deus: «Sê forte e corajoso; não temas»?',
 '["Davi", "Gideão", "Sansão", "Josué"]', 3, 'Josué 1:9',
 'Deus animou Josué antes de ele levar o povo para Canaã: «o Senhor, teu Deus, é contigo por onde quer que andares.»'),

(7, 'numeros', 'media',
 'No sétimo dia, quantas voltas deram à cidade de Jericó?',
 '["1", "3", "7", "12"]', 2, 'Josué 6:15-16',
 'No sétimo dia levantaram-se de madrugada e deram sete voltas à cidade. À sétima, Josué mandou gritar.'),

(7, 'milagres', 'media',
 'O que deixou de cair quando o povo comeu dos frutos da terra de Canaã?',
 '["A chuva", "O orvalho", "O maná", "As codornizes"]', 2, 'Josué 5:12',
 'No dia seguinte a comerem do fruto da terra, o maná parou. Deus tinha-os alimentado até ao fim da viagem.'),

(7, 'personagens', 'media',
 'O que mandou o Príncipe do exército do Senhor que Josué fizesse, perto de Jericó?',
 '["Afiar a espada", "Contar os soldados", "Tirar as sandálias, porque o lugar era santo", "Construir uma torre"]', 2, 'Josué 5:13-15',
 'Josué adorou-O, e Ele disse: «Descalça os sapatos dos teus pés, porque o lugar em que estás é santo.»'),

(7, 'versiculos', 'media',
 'Completa o conselho de Deus a Josué sobre o livro da Lei: «medita nele ___».',
 '["uma vez por semana", "dia e noite", "ao sábado", "quando puderes"]', 1, 'Josué 1:8',
 '«Não se aparte da tua boca o livro desta Lei; antes medita nele dia e noite.» Ler a Bíblia todos os dias faz-nos crescer.'),

(7, 'lugares', 'media',
 'Que cidade pediu Calebe como herança, com já 85 anos?',
 '["Jericó", "Siquém", "Betel", "Hebrom"]', 3, 'Josué 14:12-14',
 'Calebe pediu o monte de Hebrom, onde viviam gigantes. Josué abençoou-o e deu-lhe Hebrom, porque seguiu fielmente o Senhor.'),

(7, 'numeros', 'dificil',
 'Que idade tinha Calebe quando pediu a sua herança em Canaã?',
 '["40 anos", "70 anos", "85 anos", "120 anos"]', 2, 'Josué 14:10-11',
 'Calebe disse: «Hoje tenho oitenta e cinco anos… e estou tão forte como no dia em que Moisés me enviou.»'),

(7, 'numeros', 'dificil',
 'Com que idade morreu Josué?',
 '["100 anos", "110 anos", "120 anos", "130 anos"]', 1, 'Josué 24:29',
 'Josué, servo do Senhor, morreu com 110 anos. (Moisés tinha morrido com 120.)'),

(7, 'lugares', 'dificil',
 'Em que cidade reuniu Josué todas as tribos para o seu último discurso?',
 '["Gilgal", "Siquém", "Jericó", "Hebrom"]', 1, 'Josué 24:1',
 'Josué reuniu as tribos em Siquém e lembrou-lhes tudo o que Deus tinha feito, desde Abraão até Canaã.'),

(7, 'personagens', 'dificil',
 'Quem guardou para si coisas proibidas de Jericó, fazendo Israel perder a batalha de Ai?',
 '["Calebe", "Finéias", "Acã", "Coré"]', 2, 'Josué 7:1,20-21',
 'Acã escondeu uma capa, prata e ouro na sua tenda. A desobediência de um trouxe problemas a todo o povo.'),

(7, 'versiculos', 'dificil',
 'Completa: «Palavra alguma ___ de todas as boas palavras que o Senhor falara à casa de Israel; tudo se cumpriu.»',
 '["mudou", "falhou", "se perdeu", "se escreveu"]', 1, 'Josué 21:45',
 'Deus cumpriu todas as promessas que fez ao seu povo. É por isso que esta viagem se chama A Rota da Promessa!')

ON CONFLICT (station, prompt) DO NOTHING;

-- Verificação: deve dar 15 perguntas por estação (5 por dificuldade).
-- SELECT station, difficulty, count(*) FROM public.vanatrilha_questions GROUP BY 1, 2 ORDER BY 1, 2;
