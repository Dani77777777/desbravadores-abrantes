'use client';

import React, { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { CodeType, CODE_LABELS, CODE_DESCRIPTIONS, encodeLetter } from '@/utils/vana-codigo/codecs';
import SemaphoreChar from './SemaphoreChar';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface CodeReferenceProps {
  codeType: CodeType;
}

/**
 * Botão + modal com a tabela completa do código de hoje (A–Z).
 * Faz parte da aprendizagem: tal como na especialidade real,
 * começa-se a decifrar com a tabela ao lado.
 */
export default function CodeReference({ codeType }: CodeReferenceProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="vanacodigo-ref-btn" onClick={() => setIsOpen(true)}>
        <BookOpen size={16} />
        Tabela: {CODE_LABELS[codeType]}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl p-6 md:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-black text-slate-800 mb-1 text-center">
              {CODE_LABELS[codeType]}
            </h2>
            <p className="text-sm text-slate-500 text-center mb-5">{CODE_DESCRIPTIONS[codeType]}</p>

            <div className="vanacodigo-ref-grid">
              {ALPHABET.map(letter => (
                <div key={letter} className="vanacodigo-ref-item">
                  <span className="vanacodigo-ref-letter">{letter}</span>
                  {codeType === 'semaforo' ? (
                    <SemaphoreChar letter={letter} size={44} />
                  ) : (
                    <span className="vanacodigo-ref-symbol">{encodeLetter(letter, codeType)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
