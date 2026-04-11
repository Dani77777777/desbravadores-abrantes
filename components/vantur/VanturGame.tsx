'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { normalizeText } from '@/utils/text-normalization';
import WordleGrid from './WordleGrid';
import VanturKeyboard from './VanturKeyboard';
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
}

const VanturGame: React.FC<VanturGameProps> = ({ initialSession, userId }) => {
  const supabase = createClient();
  const [session, setSession] = useState<VanturSession>(initialSession);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shakeRow, setShakeRow] = useState(false);

  const cleanSecretWords = useMemo(() => {
    return session.secret_words.map(w =>
      w.replace(/[^a-zA-ZáàâãéèêíïóôõöúçÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ]/g, '').toUpperCase()
    );
  }, [session.secret_words]);

  const wordLength = cleanSecretWords[0]?.length || 5;
  const maxAttempts = session.mode === 'solo' ? 6 : session.mode === 'mix' ? 7 : 9;

  // currentGuess is a fixed-length array — each slot is '' or a letter
  const emptyGuess = useMemo(() => Array(wordLength).fill('') as string[], [wordLength]);
  const [currentGuess, setCurrentGuess] = useState<string[]>(emptyGuess);
  const [cursorPos, setCursorPos] = useState(0);

  // Per-grid key statuses
  const getKeyStatusesPerGrid = useCallback((): Array<Record<string, 'correct' | 'present' | 'absent' | ''>> => {
    return cleanSecretWords.map((secret, gridIndex) => {
      const statuses: Record<string, 'correct' | 'present' | 'absent' | ''> = {};
      const gridDone = session.completed_indices.includes(gridIndex) ||
        session.attempts.some(a => normalizeText(a) === normalizeText(secret));

      let attemptsToCheck = session.attempts;
      if (gridDone) {
        const winIdx = session.attempts.findIndex(a => normalizeText(a) === normalizeText(secret));
        if (winIdx >= 0) attemptsToCheck = session.attempts.slice(0, winIdx + 1);
      }

      attemptsToCheck.forEach((attempt) => {
        const attemptClean = normalizeText(attempt);
        const secretClean = normalizeText(secret);
        for (let i = 0; i < attemptClean.length; i++) {
          const char = attemptClean[i];
          if (char === secretClean[i]) {
            statuses[char] = 'correct';
          } else if (secretClean.includes(char) && statuses[char] !== 'correct') {
            statuses[char] = 'present';
          } else if (!statuses[char]) {
            statuses[char] = 'absent';
          }
        }
      });
      return statuses;
    });
  }, [session.attempts, session.completed_indices, cleanSecretWords]);

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
    if (session.is_finished || isLoading) return;

    if (currentGuess.some(c => !c)) {
      setShakeRow(true);
      showMessage('Palavra incompleta');
      setTimeout(() => setShakeRow(false), 500);
      return;
    }

    setIsLoading(true);
    const guessString = currentGuess.join('');
    const normalizedGuess = normalizeText(guessString).toUpperCase();

    try {
      const { data: wordData } = await supabase
        .from('portuguese_words')
        .select('word_display')
        .eq('word_clean', normalizedGuess)
        .single();

      if (!wordData) {
        setShakeRow(true);
        showMessage('Palavra não encontrada');
        setTimeout(() => setShakeRow(false), 500);
        setIsLoading(false);
        return;
      }

      const displayWord = wordData.word_display.toUpperCase();
      const newAttempts = [...session.attempts, displayWord];
      const newCompletedIndices = [...session.completed_indices];

      cleanSecretWords.forEach((secret, index) => {
        if (!newCompletedIndices.includes(index)) {
          if (normalizeText(secret) === normalizeText(guessString)) {
            newCompletedIndices.push(index);
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

      if (isFinished && newCompletedIndices.length === cleanSecretWords.length) {
        await supabase.rpc('award_vantur_rewards', { user_id: userId, mode: session.mode });
      }
    } catch (error) {
      console.error('Vantur error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentGuess, session, cleanSecretWords, wordLength, maxAttempts, supabase, userId, isLoading, emptyGuess]);

  const onDelete = useCallback(() => {
    if (session.is_finished || isLoading) return;
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
  }, [currentGuess, cursorPos, session.is_finished, isLoading]);

  const onKey = useCallback((key: string) => {
    if (session.is_finished || isLoading) return;
    const char = key.toLowerCase();
    const statuses = getCombinedKeyStatuses();
    if (statuses[char] === 'absent') return;
    if (/^[a-zç]$/.test(char)) {
      setCurrentGuess(prev => {
        const next = [...prev];
        next[cursorPos] = char.toUpperCase();
        return next;
      });
      setCursorPos(prev => Math.min(prev + 1, wordLength - 1));
    }
  }, [cursorPos, wordLength, session.is_finished, isLoading, getCombinedKeyStatuses]);

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
    <div className="vantur-container">
      <div className="vantur-header">
        <span className="vantur-mode-badge">VANTUR — {session.mode.toUpperCase()}</span>
        {message && (
          <div className="vantur-message mt-2">{message}</div>
        )}
      </div>

      <div className="vantur-grids-container">
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

      {session.is_finished && (
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
              className="vantur-victory-btn"
              onClick={() => (window.location.href = '/jogos/vantur')}
            >
              Voltar ao Estudo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VanturGame;
