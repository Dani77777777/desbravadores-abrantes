'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { CodeType, CODE_LABELS, encodeLetter } from '@/utils/vana-codigo/codecs';
import SemaphoreChar from './SemaphoreChar';
import CodeReference from './CodeReference';
import VanaCodigoHowToPlay from './VanaCodigoHowToPlay';
import './VanaCodigo.css';

interface VanaCodigoSession {
  id: string;
  user_id: string;
  mode: 'recruta' | 'explorador' | 'mestre';
  code_type: CodeType;
  secret_text: string;
  attempts: string[];
  revealed_indices: number[];
  is_finished: boolean;
  is_won: boolean;
}

interface VanaCodigoGameProps {
  initialSession: VanaCodigoSession;
  userId: string;
}

const MAX_ATTEMPTS: Record<VanaCodigoSession['mode'], number> = {
  recruta: 5,
  explorador: 5,
  mestre: 6,
};

const KEYS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE'],
];

const WRONG_FLASH_MS = 900;
const CELEBRATE_DELAY_MS = 70;
const CELEBRATE_DURATION_MS = 500;

const VanaCodigoGame: React.FC<VanaCodigoGameProps> = ({ initialSession, userId }) => {
  const supabase = createClient();
  const [session, setSession] = useState<VanaCodigoSession>(initialSession);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [wrongIndices, setWrongIndices] = useState<number[]>([]);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [showOverlay, setShowOverlay] = useState(initialSession.is_finished);

  // A resposta só tem letras — os espaços da frase são intervalos entre palavras.
  // "words" mapeia cada letra para um índice global (0..n-1) sobre as letras.
  const words = useMemo(() => {
    let idx = 0;
    return session.secret_text.split(' ').map(word => ({
      letters: word.split('').map(letter => ({ letter, index: idx++ })),
    }));
  }, [session.secret_text]);

  // As palavras não partem a meio — o tamanho das casas ajusta-se à mais longa
  // para caber no ecrã do telemóvel (ver --vc-cell no CSS).
  const longestWord = useMemo(
    () => Math.max(...words.map(word => word.letters.length)),
    [words]
  );

  const secretLetters = useMemo(
    () => session.secret_text.replace(/ /g, '').split(''),
    [session.secret_text]
  );
  const totalLetters = secretLetters.length;
  const maxAttempts = MAX_ATTEMPTS[session.mode];
  const attemptsLeft = maxAttempts - session.attempts.length;

  // Letras confirmadas em tentativas anteriores (posição certa)
  const lockedIndices = useMemo(() => {
    const locked = new Set<number>();
    session.attempts.forEach(attempt => {
      for (let i = 0; i < totalLetters; i++) {
        if (attempt[i] === secretLetters[i]) locked.add(i);
      }
    });
    return locked;
  }, [session.attempts, secretLetters, totalLetters]);

  const revealedSet = useMemo(() => new Set(session.revealed_indices), [session.revealed_indices]);
  const isEditable = useCallback(
    (i: number) => !lockedIndices.has(i) && !revealedSet.has(i),
    [lockedIndices, revealedSet]
  );

  const [currentGuess, setCurrentGuess] = useState<string[]>(() =>
    Array(totalLetters).fill('')
  );
  const [cursorPos, setCursorPos] = useState(() => {
    for (let i = 0; i < totalLetters; i++) {
      if (!lockedIndices.has(i) && !revealedSet.has(i)) return i;
    }
    return 0;
  });

  // Depois de uma tentativa, a casa do cursor pode ter ficado bloqueada (letra
  // certa ou pista) — nesse caso o cursor passa para a primeira casa por resolver.
  const activeCursor = useMemo(() => {
    if (isEditable(cursorPos)) return cursorPos;
    for (let i = 0; i < totalLetters; i++) {
      if (isEditable(i)) return i;
    }
    return cursorPos;
  }, [cursorPos, isEditable, totalLetters]);

  const showMessage = (msg: string, duration = 1800) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  };

  const nextEditable = useCallback((from: number): number => {
    for (let i = from; i < totalLetters; i++) {
      if (isEditable(i)) return i;
    }
    return from - 1 >= 0 ? from - 1 : 0;
  }, [totalLetters, isEditable]);

  const prevEditable = useCallback((from: number): number => {
    for (let i = from; i >= 0; i--) {
      if (isEditable(i)) return i;
    }
    return -1;
  }, [isEditable]);

  const onCellClick = useCallback((pos: number) => {
    if (session.is_finished || isLoading || !isEditable(pos)) return;
    setCursorPos(pos);
  }, [session.is_finished, isLoading, isEditable]);

  const onKey = useCallback((key: string) => {
    if (session.is_finished || isLoading || isCelebrating) return;
    const char = key.toUpperCase();
    if (!/^[A-Z]$/.test(char) || !isEditable(activeCursor)) return;
    setCurrentGuess(prev => {
      const next = [...prev];
      next[activeCursor] = char;
      return next;
    });
    const after = nextEditable(activeCursor + 1);
    setCursorPos(after > activeCursor ? after : activeCursor);
  }, [activeCursor, session.is_finished, isLoading, isCelebrating, isEditable, nextEditable]);

  const onDelete = useCallback(() => {
    if (session.is_finished || isLoading || isCelebrating) return;
    if (isEditable(activeCursor) && currentGuess[activeCursor]) {
      setCurrentGuess(prev => {
        const next = [...prev];
        next[activeCursor] = '';
        return next;
      });
    } else {
      const prevPos = prevEditable(activeCursor - 1);
      if (prevPos >= 0) {
        setCursorPos(prevPos);
        setCurrentGuess(prev => {
          const next = [...prev];
          next[prevPos] = '';
          return next;
        });
      }
    }
  }, [currentGuess, activeCursor, session.is_finished, isLoading, isCelebrating, isEditable, prevEditable]);

  const onEnter = useCallback(async () => {
    if (session.is_finished || isLoading || isCelebrating) return;

    // Palpite completo = letras bloqueadas/reveladas + letras escritas
    const fullGuess = secretLetters.map((letter, i) => {
      if (lockedIndices.has(i) || revealedSet.has(i)) return letter;
      return currentGuess[i] || '';
    });

    if (fullGuess.some(c => !c)) {
      showMessage('Mensagem incompleta');
      return;
    }

    setIsLoading(true);
    const guessString = fullGuess.join('');
    const secretString = secretLetters.join('');
    const isCorrect = guessString === secretString;

    try {
      const newAttempts = [...session.attempts, guessString];
      const isFinished = isCorrect || newAttempts.length >= maxAttempts;

      // Dica: depois de uma tentativa falhada (que não termine o jogo),
      // revela-se uma letra ainda por resolver.
      const newRevealed = [...session.revealed_indices];
      if (!isCorrect && !isFinished) {
        const candidates: number[] = [];
        for (let i = 0; i < totalLetters; i++) {
          const solvedNow = guessString[i] === secretString[i];
          if (!lockedIndices.has(i) && !revealedSet.has(i) && !solvedNow) {
            candidates.push(i);
          }
        }
        if (candidates.length > 1) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          newRevealed.push(pick);
        }
      }

      await supabase
        .from('vana_codigo_sessions')
        .update({
          attempts: newAttempts,
          revealed_indices: newRevealed,
          is_finished: isFinished,
          is_won: isCorrect,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      let rewardData: any = null;
      if (isCorrect) {
        const { data, error } = await supabase.rpc('award_vana_codigo_rewards', {
          p_user_id: userId,
          p_mode: session.mode,
        });
        if (error) console.error('Erro RPC VanaCódigo:', error);
        rewardData = data;
      }

      setSession(prev => ({
        ...prev,
        attempts: newAttempts,
        revealed_indices: newRevealed,
        is_finished: isFinished,
        is_won: isCorrect,
      }));

      if (isCorrect) {
        // Celebração em onda antes do modal
        setIsCelebrating(true);
        const totalCelebrateMs = (totalLetters - 1) * CELEBRATE_DELAY_MS + CELEBRATE_DURATION_MS + 200;
        setTimeout(() => {
          setIsCelebrating(false);
          setShowOverlay(true);
          if (rewardData?.message) toast.success(rewardData.message);
        }, totalCelebrateMs);
      } else {
        // Marca as letras erradas a vermelho e limpa-as de seguida
        const wrong: number[] = [];
        for (let i = 0; i < totalLetters; i++) {
          if (guessString[i] !== secretString[i]) wrong.push(i);
        }
        setWrongIndices(wrong);
        setTimeout(() => {
          setWrongIndices([]);
          setCurrentGuess(prev => {
            const next = [...prev];
            wrong.forEach(i => { next[i] = ''; });
            return next;
          });
          if (isFinished) {
            setShowOverlay(true);
          } else {
            showMessage(maxAttempts - newAttempts.length === 1 ? 'Última tentativa!' : 'Tenta outra vez');
          }
        }, WRONG_FLASH_MS);
      }
    } catch (error) {
      console.error('VanaCódigo error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session, currentGuess, secretLetters, lockedIndices, revealedSet, totalLetters, maxAttempts, supabase, userId, isLoading, isCelebrating]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') onEnter();
      else if (e.key === 'Backspace') onDelete();
      else if (e.key === 'ArrowLeft') {
        const prev = prevEditable(activeCursor - 1);
        if (prev >= 0) setCursorPos(prev);
      }
      else if (e.key === 'ArrowRight') {
        const next = nextEditable(activeCursor + 1);
        if (next > activeCursor) setCursorPos(next);
      }
      else onKey(e.key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEnter, onDelete, onKey, prevEditable, nextEditable, activeCursor]);

  const renderCell = (letter: string, index: number) => {
    const locked = lockedIndices.has(index);
    const revealed = revealedSet.has(index);
    const wrong = wrongIndices.includes(index);
    const value = locked || revealed || session.is_finished
      ? letter
      : currentGuess[index];

    let className = 'vanacodigo-cell';
    if (locked || (session.is_finished && session.is_won)) className += ' locked';
    else if (revealed) className += ' hint';
    else if (wrong) className += ' wrong';
    else if (value) className += ' filled';
    if (!session.is_finished && !locked && !revealed && index === activeCursor) className += ' cursor';
    if (isCelebrating) className += ' celebrate';

    return (
      <div
        key={index}
        className={className}
        style={isCelebrating ? { ['--celebrate-delay' as any]: `${index * CELEBRATE_DELAY_MS}ms` } : undefined}
        onClick={() => onCellClick(index)}
      >
        {wrong ? currentGuess[index] : value}
      </div>
    );
  };

  const renderSymbol = (letter: string) => {
    if (session.code_type === 'semaforo') {
      return <SemaphoreChar letter={letter} size={44} className="vanacodigo-semaphore" />;
    }
    const symbolClass =
      session.code_type === 'morse' ? 'morse'
      : session.code_type === 'numeros' ? 'numeros'
      : 'cifra';
    return (
      <span className={`vanacodigo-symbol ${symbolClass}`}>
        {encodeLetter(letter, session.code_type)}
      </span>
    );
  };

  return (
    <div className="vanacodigo-container relative">
      <div className="vanacodigo-header relative w-full flex flex-col items-center justify-center min-h-[40px]">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="vanacodigo-mode-badge">VANACÓDIGO — {session.mode.toUpperCase()}</span>
          <span className="vanacodigo-code-badge">{CODE_LABELS[session.code_type]}</span>
        </div>
        <div className="absolute right-0 top-0">
          <VanaCodigoHowToPlay variant="icon" />
        </div>
        {message && <div className="vanacodigo-message mt-2">{message}</div>}
      </div>

      <div className="vanacodigo-attempts" title={`${attemptsLeft} tentativas restantes`}>
        {Array.from({ length: maxAttempts }).map((_, i) => (
          <div
            key={i}
            className={`vanacodigo-attempt-dot ${i < session.attempts.length ? 'used' : ''}`}
          />
        ))}
      </div>

      <div
        className="vanacodigo-board"
        style={{ '--vc-letters': longestWord } as React.CSSProperties}
      >
        {words.map((word, wIdx) => (
          <div key={wIdx} className="vanacodigo-word">
            {word.letters.map(({ letter, index }) => (
              <div key={index} className="vanacodigo-letter-col">
                {renderSymbol(letter)}
                {renderCell(letter, index)}
              </div>
            ))}
          </div>
        ))}
      </div>

      <CodeReference codeType={session.code_type} />

      <div className="vanacodigo-keyboard">
        {KEYS.map((row, i) => (
          <div key={i} className="keyboard-row">
            {row.map(key => {
              const isWide = key === 'ENTER' || key === 'DELETE';
              return (
                <button
                  key={key}
                  className={`vanacodigo-key${isWide ? ' wide' : ''}`}
                  onClick={() => {
                    if (key === 'ENTER') onEnter();
                    else if (key === 'DELETE') onDelete();
                    else onKey(key);
                  }}
                >
                  {key === 'DELETE' ? '⌫' : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {showOverlay && (
        <div className="vanacodigo-victory-overlay">
          <div className="vanacodigo-victory-card">
            <div style={{ fontSize: '3rem', lineHeight: 1 }}>{session.is_won ? '🎉' : '😔'}</div>
            <div>
              <p className="vanacodigo-victory-title">{session.is_won ? 'DECIFRADO!' : 'FIM DE JOGO'}</p>
              <p className="vanacodigo-victory-subtitle">
                {session.is_won
                  ? `Excelente trabalho de sinaleiro! Decifraste em ${session.attempts.length} ${session.attempts.length === 1 ? 'tentativa' : 'tentativas'}.`
                  : 'A mensagem escapou-te hoje. Amanhã há um código novo!'}
              </p>
            </div>

            <span className="vanacodigo-victory-word-chip">{session.secret_text}</span>

            <button
              className="vanacodigo-victory-btn"
              onClick={() => (window.location.href = '/jogos/vana-codigo')}
            >
              Voltar ao Posto
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VanaCodigoGame;
