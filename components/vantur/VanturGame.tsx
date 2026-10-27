'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { normalizeText } from '@/utils/text-normalization';
import { WORD_LIST } from '@/utils/vantur-word-list';
import { toast } from 'sonner';
import WordleGrid from './WordleGrid';
import VanturKeyboard from './VanturKeyboard';
import VanturHowToPlay from './VanturHowToPlay';
import VanturReplay from './VanturReplay';
import { computeKeyStatusesPerGrid, cleanSecretWord, maxAttemptsForMode } from './key-statuses';
import './Vantur.css';

interface VanturSession {
  id: string;
  user_id: string;
  secret_words: string[];
  attempts: string[];
  completed_indices: number[];
  mode: 'solo' | 'mix' | 'plex';
  is_finished: boolean;
}

interface VanturGameProps {
  initialSession: VanturSession;
  userId: string;
  /** Palavras bíblicas fora do WORD_LIST (forma limpa → forma com acentos), sempre aceites como palpite */
  extraWords?: Record<string, string>;
}

const REVEAL_DELAY_MS = 300;
const REVEAL_DURATION_MS = 500;
const CELEBRATE_DELAY_MS = 70;
const CELEBRATE_DURATION_MS = 500;

const VanturGame: React.FC<VanturGameProps> = ({ initialSession, userId, extraWords = {} }) => {
  const supabase = createClient();
  const [session, setSession] = useState<VanturSession>(initialSession);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shakeRow, setShakeRow] = useState(false);
  const [revealingAttemptIndex, setRevealingAttemptIndex] = useState<number | null>(null);
  const [celebratingInfo, setCelebratingInfo] = useState<{ attemptIdx: number; gridIdx: number } | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [fadedGridIndices, setFadedGridIndices] = useState<number[]>(initialSession.completed_indices);
  const isRevealing = revealingAttemptIndex !== null;
  const isCelebrating = celebratingInfo !== null;

  const cleanSecretWords = useMemo(() => {
    return session.secret_words.map(cleanSecretWord);
  }, [session.secret_words]);

  const wordLength = cleanSecretWords[0]?.length || 5;
  const maxAttempts = maxAttemptsForMode(session.mode);

  // currentGuess is a fixed-length array — each slot is '' or a letter
  const emptyGuess = useMemo(() => Array(wordLength).fill('') as string[], [wordLength]);
  const [currentGuess, setCurrentGuess] = useState<string[]>(emptyGuess);
  const [cursorPos, setCursorPos] = useState(0);

  // Per-grid key statuses
  const getKeyStatusesPerGrid = useCallback(() => {
    // Durante a revelação, o teclado não mostra as cores da tentativa ainda a revelar
    const attemptsForKeyboard = revealingAttemptIndex !== null
      ? session.attempts.slice(0, revealingAttemptIndex)
      : session.attempts;
    return computeKeyStatusesPerGrid(cleanSecretWords, attemptsForKeyboard);
  }, [session.attempts, cleanSecretWords, revealingAttemptIndex]);

  const getCombinedKeyStatuses = useCallback(() => {
    const perGrid = getKeyStatusesPerGrid();
    const combined: Record<string, 'correct' | 'present' | 'absent' | ''> = {};
    perGrid.forEach(gridStatuses => {
      Object.entries(gridStatuses).forEach(([char, status]) => {
        const current = combined[char];
        if (!current) combined[char] = status;
        else if (status === 'correct') combined[char] = 'correct';
        else if (status === 'present' && current !== 'correct') combined[char] = 'present';
      });
    });
    return combined;
  }, [getKeyStatusesPerGrid]);

  const showMessage = (msg: string, duration = 1800) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  };

  const onCellClick = useCallback((pos: number) => {
    if (session.is_finished || isLoading) return;
    setCursorPos(pos);
  }, [session.is_finished, isLoading]);

  const onEnter = useCallback(async () => {
    if (session.is_finished || isLoading || isRevealing || isCelebrating) return;

    if (currentGuess.some(c => !c)) {
      setShakeRow(true);
      showMessage('Palavra incompleta');
      setTimeout(() => setShakeRow(false), 500);
      return;
    }

    setIsLoading(true);
    const guessString = currentGuess.join('');
    const normalizedGuess = normalizeText(guessString);

    try {
      const secretWordsNormalized = cleanSecretWords.map(w => normalizeText(w));
      const wordDisplay = WORD_LIST[normalizedGuess] ?? extraWords[normalizedGuess];
      const isValidWord = wordDisplay !== undefined || secretWordsNormalized.includes(normalizedGuess);

      if (!isValidWord) {
        setShakeRow(true);
        showMessage('Palavra não encontrada');
        setTimeout(() => setShakeRow(false), 500);
        setIsLoading(false);
        return;
      }

      const displayWord = (wordDisplay ?? normalizedGuess).toUpperCase();
      const newAttempts = [...session.attempts, displayWord];
      const newCompletedIndices = [...session.completed_indices];

      let justCompletedGridIdx = -1;
      cleanSecretWords.forEach((secret, index) => {
        if (!newCompletedIndices.includes(index)) {
          if (normalizeText(secret) === normalizeText(guessString)) {
            newCompletedIndices.push(index);
            justCompletedGridIdx = index;
          }
        }
      });

      const isFinished =
        newCompletedIndices.length === cleanSecretWords.length ||
        newAttempts.length >= maxAttempts;

      await supabase
        .from('vantur_sessions')
        .update({
          attempts: newAttempts,
          completed_indices: newCompletedIndices,
          is_finished: isFinished,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      setSession(prev => ({
        ...prev,
        attempts: newAttempts,
        completed_indices: newCompletedIndices,
        is_finished: isFinished,
      }));
      setCurrentGuess([...emptyGuess]);
      setCursorPos(0);

      // Arrancar revelação antes do await para garantir que isRevealing=true
      // na mesma batch que is_finished=true — evita flash do modal
      const revealIdx = newAttempts.length - 1;
      setRevealingAttemptIndex(revealIdx);

      const totalRevealMs = (wordLength - 1) * REVEAL_DELAY_MS + REVEAL_DURATION_MS + 150;
      
      // Chamar RPC logo, mas guardar resultado para mostrar o toast depois do suspense
      let rewardData: any = null;
      if (isFinished && newCompletedIndices.length === cleanSecretWords.length) {
        console.log('Vantur: Vitória detetada. A chamar recompensas...');
        const { data, error } = await supabase.rpc('award_vantur_rewards', { 
          user_id: userId, 
          mode: session.mode 
        });
        if (error) console.error('Erro RPC Vantur:', error);
        rewardData = data;
      }

      setTimeout(() => {
        setRevealingAttemptIndex(null);

        // Se o RPC retornou dados, mostramos a mensagem (ganhou pontos ou já os tinha ganho hoje)
        if (rewardData && rewardData.message) {
          console.log('Vantur: A mostrar toast:', rewardData.message);
          toast.success(rewardData.message);
        }
        // Após reveal, celebrar se acertou numa palavra
        if (justCompletedGridIdx !== -1) {
          setCelebratingInfo({ attemptIdx: revealIdx, gridIdx: justCompletedGridIdx });
          const totalCelebrateMs = (wordLength - 1) * CELEBRATE_DELAY_MS + CELEBRATE_DURATION_MS + 100;
          setTimeout(() => {
            setCelebratingInfo(null);
            setFadedGridIndices(prev => [...new Set([...prev, justCompletedGridIdx])]);
          }, totalCelebrateMs);
        }
      }, totalRevealMs);
    } catch (error) {
      console.error('Vantur error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentGuess, session, cleanSecretWords, wordLength, maxAttempts, supabase, userId, isLoading, isRevealing, isCelebrating, emptyGuess, extraWords]);

  const onDelete = useCallback(() => {
    if (session.is_finished || isLoading || isRevealing || isCelebrating) return;
    if (currentGuess[cursorPos]) {
      // Clear the letter at cursor, stay at same position
      setCurrentGuess(prev => {
        const next = [...prev];
        next[cursorPos] = '';
        return next;
      });
    } else if (cursorPos > 0) {
      // Move cursor back and clear that cell
      const newPos = cursorPos - 1;
      setCursorPos(newPos);
      setCurrentGuess(prev => {
        const next = [...prev];
        next[newPos] = '';
        return next;
      });
    }
  }, [currentGuess, cursorPos, session.is_finished, isLoading, isRevealing, isCelebrating]);

  const onKey = useCallback((key: string) => {
    if (session.is_finished || isLoading || isRevealing || isCelebrating) return;
    const char = key.toLowerCase();
    if (/^[a-zç]$/.test(char)) {
      setCurrentGuess(prev => {
        const next = [...prev];
        next[cursorPos] = char.toUpperCase();
        return next;
      });
      setCursorPos(prev => Math.min(prev + 1, wordLength - 1));
    }
  }, [cursorPos, wordLength, session.is_finished, isLoading, isRevealing, isCelebrating, getCombinedKeyStatuses]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') onEnter();
      else if (e.key === 'Backspace') onDelete();
      else if (e.key === 'ArrowLeft') setCursorPos(p => Math.max(p - 1, 0));
      else if (e.key === 'ArrowRight') setCursorPos(p => Math.min(p + 1, wordLength - 1));
      else onKey(e.key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEnter, onDelete, onKey, wordLength]);

  const won = session.completed_indices.length === cleanSecretWords.length;

  return (
    <div className="vantur-container relative">
      <div className="vantur-header relative w-full flex flex-col items-center justify-center min-h-[40px]">
        <span className="vantur-mode-badge">VANTUR — {session.mode.toUpperCase()}</span>
        <div className="absolute right-0 top-0">
          <VanturHowToPlay variant="icon" />
        </div>
        {message && (
          <div className="vantur-message mt-2">{message}</div>
        )}
      </div>

      <div className={`vantur-grids-container mode-${session.mode}`}>
        {cleanSecretWords.map((word, index) => {
          const gridDone = session.completed_indices.includes(index) ||
            session.attempts.some(a => normalizeText(a) === normalizeText(word));

          return (
            <WordleGrid
              key={index}
              secretWord={word}
              attempts={session.attempts}
              currentGuess={gridDone ? emptyGuess : currentGuess}
              cursorPos={cursorPos}
              onCellClick={onCellClick}
              isCompleted={session.completed_indices.includes(index)}
              isDone={gridDone}
              maxAttempts={maxAttempts}
              shakeCurrentRow={shakeRow && !gridDone}
              revealingAttemptIndex={revealingAttemptIndex}
              celebratingInfo={celebratingInfo}
              gridIndex={index}
              isFaded={fadedGridIndices.includes(index)}
            />
          );
        })}
      </div>

      <VanturKeyboard
        onKey={onKey}
        onEnter={onEnter}
        onDelete={onDelete}
        keyStatusesPerGrid={getKeyStatusesPerGrid()}
      />

      {session.is_finished && !isRevealing && !isCelebrating && !showReplay && (
        <div className="vantur-victory-overlay">
          <div className="vantur-victory-card">
            <div style={{ fontSize: '3rem', lineHeight: 1 }}>{won ? '🎉' : '😔'}</div>
            <div>
              <p className="vantur-victory-title">{won ? 'VITÓRIA!' : 'FIM DE JOGO'}</p>
              <p className="vantur-victory-subtitle">
                {won
                  ? 'Impressionante! A tua bíblia está em dia.'
                  : 'Não desistas, a perseverança é uma virtude.'}
              </p>
            </div>

            <div className="vantur-victory-words">
              {cleanSecretWords.map(w => (
                <span key={w} className="vantur-victory-word-chip">{w}</span>
              ))}
            </div>

            <button
              className="vantur-victory-btn secondary"
              onClick={() => setShowReplay(true)}
            >
              ▶ Rever jogada
            </button>

            <button
              className="vantur-victory-btn"
              onClick={() => (window.location.href = '/jogos/vantur')}
            >
              Voltar ao Estudo
            </button>
          </div>
        </div>
      )}

      {showReplay && (
        <VanturReplay session={session} onClose={() => setShowReplay(false)} />
      )}
    </div>
  );
};

export default VanturGame;
