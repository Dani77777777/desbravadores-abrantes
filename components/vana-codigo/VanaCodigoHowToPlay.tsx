'use client';

import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { CODE_BY_WEEKDAY, CODE_LABELS } from '@/utils/vana-codigo/codecs';

interface Props {
  variant?: 'button' | 'icon';
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function VanaCodigoHowToPlay({ variant = 'button' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const today = new Date().getDay();

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
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-6 md:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-2xl font-black text-slate-800 mb-6 text-center">Como Jogar o VanaCódigo</h2>

            <div className="space-y-5 text-slate-600 font-medium text-sm md:text-base leading-relaxed">
              <p>
                Todos os dias há uma <strong>mensagem secreta</strong> escrita num código de
                comunicação dos Desbravadores. Decifra-a símbolo a símbolo e escreve a resposta
                nas células — a mensagem é igual para todo o clube!
              </p>

              <p>
                Usa a <strong>Tabela de Código</strong> para consultar o alfabeto do dia, tal
                como farias na especialidade. Tens um número limitado de tentativas
                (5 no Recruta e no Explorador, 6 no Mestre).
              </p>

              <div className="pt-2 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-[#538d4e] text-white font-black text-xl rounded">A</div>
                  <p className="text-sm">Letra <strong>certa</strong> — fica bloqueada nas próximas tentativas.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-[#b59f3b] text-white font-black text-xl rounded">B</div>
                  <p className="text-sm">Letra <strong>revelada como dica</strong> depois de uma tentativa falhada.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-red-100 border-2 border-red-500 text-red-700 font-black text-xl rounded">C</div>
                  <p className="text-sm">Letra <strong>errada</strong> — é limpa para tentares outra vez.</p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-3 text-center">
                  O código muda com o dia da semana
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {WEEKDAYS.map((day, i) => (
                    <div
                      key={day}
                      className={`flex justify-between items-center px-4 py-1.5 rounded-full text-sm ${
                        i === today ? 'bg-emerald-50 border border-emerald-200 font-bold text-emerald-800' : 'text-slate-500'
                      }`}
                    >
                      <span>{day}</span>
                      <span className="font-semibold">{CODE_LABELS[CODE_BY_WEEKDAY[i]]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500 text-center uppercase tracking-widest font-bold">
                  Morse, Semáforo e Cifras — especialidades verdadeiras de Desbravadores
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
