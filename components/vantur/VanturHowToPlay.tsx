'use client';

import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface Props {
  variant?: 'button' | 'icon';
}

export default function VanturHowToPlay({ variant = 'button' }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {variant === 'button' ? (
        <button 
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-full hover:bg-slate-50 transition-colors shadow-sm"
        >
          <HelpCircle size={20} />
          Como Jogar
        </button>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors focus:outline-none"
          title="Como Jogar"
        >
          <HelpCircle size={20} />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-6 md:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-2xl font-black text-slate-800 mb-6 text-center">Como Jogar o Vantur</h2>
            
            <div className="space-y-5 text-slate-600 font-medium text-sm md:text-base leading-relaxed">
              <p>Descobre a palavra bíblica escondida! Tens um número limitado de tentativas de acordo com a dificuldade (6 no Solo, 7 no Mix e 9 no Plex).</p>
              
              <p>Cada palpite deve ser uma palavra válida com 5 letras. Após cada palpite, a cor das letras altera-se para mostrar o quão perto estás da solução.</p>
              
              <div className="pt-2 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-[#538d4e] text-white font-black text-xl rounded">P</div>
                  <p className="text-sm">A letra <strong>P</strong> faz parte da palavra e está na <strong>posição correta</strong>.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-[#b59f3b] text-white font-black text-xl rounded">E</div>
                  <p className="text-sm">A letra <strong>E</strong> faz parte da palavra, mas está na <strong>posição errada</strong>.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-[#787c7e] text-white font-black text-xl rounded">Z</div>
                  <p className="text-sm">A letra <strong>Z</strong> <strong>não faz parte</strong> da palavra.</p>
                </div>
              </div>
              
              <div className="pt-5 mt-5 border-t border-slate-100">
                 <p className="text-xs text-slate-500 text-center uppercase tracking-widest font-bold">As palavras são sobre o Universo Bíblico e Adventista</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
