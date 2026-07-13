'use client';

import React from 'react';
import { getSemaphoreAngles } from '@/utils/vana-codigo/codecs';

interface SemaphoreCharProps {
  letter: string;
  size?: number;
}

const CX = 50;
const CY = 52; // ponto dos ombros
const ARM_LEN = 34;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  // 0° = para cima, sentido dos ponteiros do relógio
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/** Bandeira quadrada dividida na diagonal (vermelho/amarelo, como no semáforo real). */
function Flag({ angle }: { angle: number }) {
  const tip = polar(angle, ARM_LEN);
  const flagSize = 17;
  return (
    <g>
      <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
      <g transform={`translate(${tip.x}, ${tip.y}) rotate(${angle})`}>
        {/* bandeira presa à ponta do braço, alinhada com a direção do braço */}
        <polygon points={`0,0 ${flagSize},0 0,${-flagSize}`} fill="#dc2626" />
        <polygon points={`${flagSize},0 ${flagSize},${-flagSize} 0,${-flagSize}`} fill="#facc15" />
        <rect x={-1} y={-flagSize} width={2} height={flagSize} fill="#334155" />
      </g>
    </g>
  );
}

/** Sinaleiro de semáforo: figura com duas bandeiras nas posições da letra. */
export default function SemaphoreChar({ letter, size = 64 }: SemaphoreCharProps) {
  const [a1, a2] = getSemaphoreAngles(letter);

  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-label={`Sinal de semáforo`}>
      {/* corpo */}
      <circle cx={CX} cy={38} r={9} fill="#64748b" />
      <line x1={CX} y1={47} x2={CX} y2={82} stroke="#64748b" strokeWidth={6} strokeLinecap="round" />
      {/* pernas */}
      <line x1={CX} y1={82} x2={CX - 9} y2={102} stroke="#64748b" strokeWidth={5} strokeLinecap="round" />
      <line x1={CX} y1={82} x2={CX + 9} y2={102} stroke="#64748b" strokeWidth={5} strokeLinecap="round" />
      {/* bandeiras */}
      <Flag angle={a1} />
      <Flag angle={a2} />
    </svg>
  );
}
