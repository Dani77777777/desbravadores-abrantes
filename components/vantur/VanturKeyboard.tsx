'use client';

import React from 'react';

type KeyStatus = 'correct' | 'present' | 'absent' | '';

interface VanturKeyboardProps {
  onKey: (key: string) => void;
  onEnter: () => void;
  onDelete: () => void;
  keyStatusesPerGrid: Array<Record<string, KeyStatus>>;
}

const KEYS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE'],
];

const STATUS_COLORS: Record<KeyStatus, string> = {
  correct: '#538d4e',
  present: '#b59f3b',
  absent:  '#787c7e',
  '':      '#d3d6da',
};

const STATUS_PRIORITY: Record<KeyStatus, number> = {
  correct: 3,
  present: 2,
  absent:  1,
  '':      0,
};

const VanturKeyboard: React.FC<VanturKeyboardProps> = ({
  onKey,
  onEnter,
  onDelete,
  keyStatusesPerGrid,
}) => {
  const numGrids = keyStatusesPerGrid.length;

  const getBestStatus = (key: string): KeyStatus => {
    const normalKey = key.toLowerCase();
    let best: KeyStatus = '';
    keyStatusesPerGrid.forEach(grid => {
      const s = grid[normalKey] || '';
      if (STATUS_PRIORITY[s] > STATUS_PRIORITY[best]) best = s;
    });
    return best;
  };

  // Returns true if any grid has a non-empty status for this key
  const hasAnyStatus = (key: string) => {
    const normalKey = key.toLowerCase();
    return keyStatusesPerGrid.some(grid => !!grid[normalKey]);
  };

  // Renders a full-key split background for multi-grid modes
  const renderSplitBackground = (key: string) => {
    const normalKey = key.toLowerCase();

    if (numGrids === 2) {
      // Left | Right
      return (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          borderRadius: 'inherit',
          overflow: 'hidden',
          zIndex: 0,
        }}>
          {keyStatusesPerGrid.map((grid, i) => (
            <div key={i} style={{ flex: 1, background: STATUS_COLORS[grid[normalKey] || ''] }} />
          ))}
        </div>
      );
    }

    // 4 grids: 2×2 quadrants
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        borderRadius: 'inherit',
        overflow: 'hidden',
        zIndex: 0,
      }}>
        {keyStatusesPerGrid.slice(0, 4).map((grid, i) => (
          <div key={i} style={{ background: STATUS_COLORS[grid[normalKey] || ''] }} />
        ))}
      </div>
    );
  };

  return (
    <div className="vantur-keyboard">
      {KEYS.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map((key) => {
            const isWide = key === 'ENTER' || key === 'DELETE';
            const isMulti = numGrids > 1 && !isWide;
            // Solo: use class for bg color. Multi: bg is handled by split overlay
            const statusClass = !isMulti ? getBestStatus(key) : '';
            const textIsLight = isMulti ? hasAnyStatus(key) : (statusClass !== '' && statusClass !== undefined);

            return (
              <button
                key={key}
                className={`key-btn${isWide ? ' wide' : ''} ${statusClass}`}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  color: textIsLight ? '#fff' : '#1e293b',
                }}
                onClick={() => {
                  if (key === 'ENTER') onEnter();
                  else if (key === 'DELETE') onDelete();
                  else onKey(key);
                }}
              >
                {/* Letter on top of the background */}
                <span style={{ position: 'relative', zIndex: 1 }}>
                  {key === 'DELETE' ? '⌫' : key}
                </span>
                {isMulti && renderSplitBackground(key)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default VanturKeyboard;
