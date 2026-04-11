'use client';

import React from 'react';
import { normalizeText } from '@/utils/text-normalization';

interface WordleGridProps {
  secretWord: string;
  attempts: string[];
  currentGuess: string[];
  cursorPos: number;
  onCellClick: (pos: number) => void;
  isCompleted: boolean;
  isDone: boolean;
  maxAttempts: number;
  shakeCurrentRow?: boolean;
}

const WordleGrid: React.FC<WordleGridProps> = ({
  secretWord,
  attempts,
  currentGuess,
  cursorPos,
  onCellClick,
  isCompleted,
  isDone,
  maxAttempts,
  shakeCurrentRow = false,
}) => {
  const secretClean = normalizeText(secretWord);
  const wordLength = secretWord.length;

  let displayAttempts = attempts;
  if (isDone) {
    const winIdx = attempts.findIndex(a => normalizeText(a) === secretClean);
    if (winIdx >= 0) {
      displayAttempts = attempts.slice(0, winIdx + 1);
    }
  }

  const getCellStatus = (guessWord: string, index: number) => {
    const guessClean = normalizeText(guessWord);
    const char = guessClean[index];
    const secretChar = secretClean[index];

    if (char === secretChar) return 'correct';

    if (secretClean.includes(char)) {
      const secretLetterCount = secretClean.split('').filter(c => c === char).length;
      const correctMatches = guessClean.split('').filter((c, i) => c === char && secretClean[i] === char).length;
      const presentPriorMatches = guessClean.slice(0, index).split('').filter((c, i) => c === char && secretClean[i] !== char).length;

      if (presentPriorMatches < (secretLetterCount - correctMatches)) {
        return 'present';
      }
    }

    return 'absent';
  };

  const rows = [];
  for (let i = 0; i < maxAttempts; i++) {
    const attempt = displayAttempts[i];
    const isCurrentRow = i === displayAttempts.length && !isDone;
    const isPastRow = i < displayAttempts.length;
    const isShaking = isCurrentRow && shakeCurrentRow;

    const rowCells = [];
    for (let j = 0; j < wordLength; j++) {
      let char = '';
      let statusClass = '';

      if (isPastRow) {
        char = attempt[j] || '';
        statusClass = getCellStatus(attempt, j);
      } else if (isCurrentRow) {
        char = currentGuess[j] || '';
        statusClass = char ? 'typing' : '';
      }

      const isCursor = isCurrentRow && j === cursorPos;

      rowCells.push(
        <div
          key={j}
          className={`vantur-cell ${statusClass}${isCursor ? ' cursor' : ''}${char && !isPastRow ? ' filled' : ''}`}
          style={isPastRow ? { animationDelay: `${j * 0.08}s` } : undefined}
          onClick={isCurrentRow ? () => onCellClick(j) : undefined}
        >
          {char}
        </div>
      );
    }

    rows.push(
      <div
        key={i}
        className="wordle-row"
        style={isShaking ? { animation: 'rowShake 0.4s ease-in-out' } : undefined}
      >
        {rowCells}
      </div>
    );
  }

  return (
    <div className={`wordle-grid${isDone ? ' completed' : ''}`}>
      <style>{`
        @keyframes rowShake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-5px); }
          30%       { transform: translateX(5px); }
          45%       { transform: translateX(-4px); }
          60%       { transform: translateX(4px); }
          75%       { transform: translateX(-2px); }
          90%       { transform: translateX(2px); }
        }
      `}</style>
      {rows}
    </div>
  );
};

export default WordleGrid;
