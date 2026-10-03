'use client';

import React, { useState } from 'react';
import { Play } from 'lucide-react';
import VanturReplay, { type VanturReplaySession } from './VanturReplay';

/** Botão para rever a jogada de hoje num modo já concluído. */
export default function VanturReplayButton({ session }: { session: VanturReplaySession }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-4 bg-white border-2 border-blue-600 text-blue-600 rounded-2xl font-bold hover:bg-blue-50 transition-all active:scale-95 inline-flex items-center justify-center gap-2"
      >
        <Play className="w-4 h-4 fill-current" /> REVER JOGADA
      </button>
      {open && <VanturReplay session={session} onClose={() => setOpen(false)} />}
    </>
  );
}
