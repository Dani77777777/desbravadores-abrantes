'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { normalizeText } from '@/utils/text-normalization';
import WordleGrid from './WordleGrid';
import VanturKeyboard from './VanturKeyboard';
import { computeKeyStatusesPerGrid, cleanSecretWord, maxAttemptsForMode } from './key-statuses';
import './Vantur.css';

export interface VanturReplaySession {
  secret_words: string[];
  attempts: string[];
  mode: 'solo' | 'mix' | 'plex';
}

interface VanturReplayProps {
  session: VanturReplaySession;
  onClose: () => void;
}

// Mesmos tempos das animações do jogo (Vantur.css / VanturGame)
const TYPE_MS = 160;
const BEFORE_ENTER_MS = 450;
const BETWEEN_ATTEMPTS_MS = 350;
const REVEAL_DELAY_MS = 300;
const REVEAL_DURATION_MS = 500;
const CELEBRATE_DELAY_MS = 70;
const CELEBRATE_DURATION_MS = 500;

type Phase = 'typing' | 'reveal' | 'celebrate' | 'end';

interface ReplayState {
  /** Nº de tentativas já submetidas (visíveis na grelha). */
  shown: number;
  /** Letras já "escritas" da próxima tentativa. */
  typed: number;
  phase: Phase;
  celebrating: { attemptIdx: number; gridIdx: number } | null;
  faded: number[];
}

const INITIAL_STATE: ReplayState = { shown: 0, typed: 0, phase: 'typing', celebrating: null, faded: [] };

const noop = () => {};

/**
 * Reproduz uma jogada de VANTUR já terminada, tentativa a tentativa,
 * com as mesmas animações do jogo — para mostrar aos outros como se joga.
 */
const VanturReplay: React.FC<VanturReplayProps> = ({ session, onClose }) => {
  const secretWords = useMemo(() => session.secret_words.map(cleanSecretWord), [session.secret_words]);
  const attempts = session.attempts;
  const wordLength = secretWords[0]?.length || 5;
  const maxAttempts = maxAttemptsForMode(session.mode);

  const initialState: ReplayState = { ...INITIAL_STATE, phase: attempts.length > 0 ? 'typing' : 'end' };
  const [state, setState] = useState<ReplayState>(initialState);
  const [playing, setPlaying] = useState(true);

  const isSolved = useCallback(
    (gridIdx: number, upTo: number) =>
      attempts.slice(0, upTo).some(a => normalizeText(a) === normalizeText(secretWords[gridIdx])),
    [attempts, secretWords]
  );

  // Motor da reprodução: cada estado agenda o seguinte
  useEffect(() => {
    if (!playing || state.phase === 'end') return;

    const nextAttemptOrEnd = (s: ReplayState): ReplayState =>
      s.shown >= attempts.length
        ? { ...s, phase: 'end', celebrating: null }
        : { ...s, phase: 'typing', typed: 0, celebrating: null };

    let delay: number;
    let next: (s: ReplayState) => ReplayState;

    switch (state.phase) {
      case 'typing':
        if (state.typed < wordLength) {
          delay = state.typed === 0 ? BETWEEN_ATTEMPTS_MS : TYPE_MS;
          next = s => ({ ...s, typed: s.typed + 1 });
        } else {
          delay = BEFORE_ENTER_MS;
          next = s => ({ ...s, phase: 'reveal', shown: s.shown + 1 });
        }
        break;

      case 'reveal':
        delay = (wordLength - 1) * REVEAL_DELAY_MS + REVEAL_DURATION_MS + 150;
        next = s => {
          const attemptIdx = s.shown - 1;
          const guess = normalizeText(attempts[attemptIdx]);
          const gridIdx = secretWords.findIndex(
            (w, i) => normalizeText(w) === guess && !isSolved(i, attemptIdx)
          );
          if (gridIdx !== -1) return { ...s, phase: 'celebrate', celebrating: { attemptIdx, gridIdx } };
          return nextAttemptOrEnd(s);
        };
        break;

      case 'celebrate':
        delay = (wordLength - 1) * CELEBRATE_DELAY_MS + CELEBRATE_DURATION_MS + 100;
        next = s => {
          const faded = s.celebrating ? [...new Set([...s.faded, s.celebrating.gridIdx])] : s.faded;
          return nextAttemptOrEnd({ ...s, faded });
        };
        break;
    }

    const t = setTimeout(() => setState(next), delay);
    return () => clearTimeout(t);
  }, [state, playing, attempts, secretWords, wordLength, isSolved]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Não deixar as teclas chegarem ao jogo por trás
      e.stopImmediatePropagation();
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const restart = () => {
    setState(initialState);
    setPlaying(true);
  };

  const visibleAttempts = attempts.slice(0, state.shown);
  const revealingAttemptIndex = state.phase === 'reveal' ? state.shown - 1 : null;

  const upcoming = state.phase === 'typing' ? attempts[state.shown] ?? '' : '';
  const currentGuess = Array.from({ length: wordLength }, (_, i) =>
    i < state.typed ? upcoming[i] ?? '' : ''
  );
  const cursorPos = Math.min(state.typed, wordLength - 1);

  const keyStatusesPerGrid = computeKeyStatusesPerGrid(
    secretWords,
    revealingAttemptIndex !== null ? attempts.slice(0, revealingAttemptIndex) : visibleAttempts
  );

  const isEnd = state.phase === 'end';
  const won = secretWords.every((_, i) => isSolved(i, attempts.length));
  const attemptLabel = Math.min(state.shown + (state.phase === 'typing' && !isEnd ? 1 : 0), attempts.length);

  return (
    <div className="vantur-replay-overlay" role="dialog" aria-modal="true" aria-label="Rever jogada">
      <div className="vantur-replay-panel">
        <div className="vantur-replay-top">
          <span className="vantur-mode-badge">REVER JOGADA — {session.mode.toUpperCase()}</span>
          <button className="vantur-replay-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <p className="vantur-replay-progress">
          {isEnd
            ? won
              ? `🎉 Vitória em ${attempts.length} ${attempts.length === 1 ? 'tentativa' : 'tentativas'}!`
              : '😔 Não foi desta — as palavras eram:'
            : `Tentativa ${attemptLabel} de ${attempts.length}`}
        </p>

        {isEnd && !won && (
          <div className="vantur-victory-words">
            {secretWords.map((w, i) => (
              <span key={`${w}-${i}`} className="vantur-victory-word-chip">{w}</span>
            ))}
          </div>
        )}

        <div className={`vantur-grids-container mode-${session.mode}`}>
          {secretWords.map((word, index) => {
            const gridDone = visibleAttempts.some(a => normalizeText(a) === normalizeText(word));
            return (
              <WordleGrid
                key={index}
                secretWord={word}
                attempts={visibleAttempts}
                currentGuess={gridDone ? Array(wordLength).fill('') : currentGuess}
                cursorPos={cursorPos}
                onCellClick={noop}
                isCompleted={gridDone}
                isDone={gridDone}
                maxAttempts={maxAttempts}
                revealingAttemptIndex={revealingAttemptIndex}
                celebratingInfo={state.celebrating}
                gridIndex={index}
                isFaded={state.faded.includes(index)}
              />
            );
          })}
        </div>

        <div className="vantur-replay-keyboard" aria-hidden="true">
          <VanturKeyboard onKey={noop} onEnter={noop} onDelete={noop} keyStatusesPerGrid={keyStatusesPerGrid} />
        </div>

        <div className="vantur-replay-controls">
          {isEnd ? (
            <button className="vantur-victory-btn" onClick={restart}>↺ Ver outra vez</button>
          ) : (
            <>
              <button className="vantur-victory-btn secondary" onClick={restart}>↺ Recomeçar</button>
              <button className="vantur-victory-btn" onClick={() => setPlaying(p => !p)}>
                {playing ? '❚❚ Pausar' : '▶ Continuar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VanturReplay;
