'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Plus, Star, Trash2, X, Pencil, Check, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  createVanaSketchPack,
  updateVanaSketchPack,
  deleteVanaSketchPack,
  addVanaSketchPackWords,
  deleteVanaSketchPackWord,
  type PackWithWords,
  type AddPackWordsResult,
} from '@/lib/actions/vana-sketch-packs'

/**
 * Gestão dos packs de palavras do VanaSketch (Admin → VanaSketch).
 * Cada pack é uma lista de palavras fáceis de desenhar; o host escolhe os
 * packs no lobby. Os marcados com ★ vêm já escolhidos.
 */
export function WordPacksManager({ packs }: { packs: PackWithWords[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <NewPackForm />
      {packs.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-400">Ainda não há packs.</div>
      ) : (
        packs.map((p) => (
          <PackCard key={p.id} pack={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
        ))
      )}
    </div>
  )
}

function NewPackForm() {
  const [emoji, setEmoji] = useState('🎨')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createVanaSketchPack({ name, emoji, description })
      if (res.error) setError(res.error)
      else { setName(''); setDescription(''); setEmoji('🎨') }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-dashed border-pink-300 bg-pink-50/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-pink-700">Novo pack</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={8}
          aria-label="Emoji do pack"
          className="w-full rounded-lg border bg-white px-3 py-2 text-center text-xl sm:w-16"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nome (ex.: Acampamento de Verão)"
          className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={120}
          placeholder="Descrição (opcional)"
          className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Criar
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </form>
  )
}

function PackCard({ pack, open, onToggle }: { pack: PackWithWords; open: boolean; onToggle: () => void }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [emoji, setEmoji] = useState(pack.emoji)
  const [name, setName] = useState(pack.name)
  const [description, setDescription] = useState(pack.description ?? '')

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (res.error) alert(res.error)
      else after?.()
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" className="w-full rounded-lg border px-2 py-1.5 text-center text-lg sm:w-14" />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Nome" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder="Descrição" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm" />
            <div className="flex gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => updateVanaSketchPack(pack.id, { name, emoji, description }), () => setEditing(false))}
                className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700"
                title="Guardar"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setName(pack.name); setEmoji(pack.emoji); setDescription(pack.description ?? '') }}
                className="rounded-lg border p-2 text-slate-500 hover:bg-slate-50"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="text-2xl">{pack.emoji}</span>
            <span className="min-w-0">
              <span className="block truncate font-bold text-gray-900">{pack.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {pack.word_count} palavra{pack.word_count !== 1 ? 's' : ''}
                {pack.description && ` · ${pack.description}`}
              </span>
            </span>
            <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}

        {!editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => updateVanaSketchPack(pack.id, { is_default: !pack.is_default }))}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                pack.is_default ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-50'
              }`}
              title={pack.is_default ? 'Vem já escolhido no lobby (clica para tirar)' : 'Escolher por defeito no lobby'}
            >
              <Star className={`h-3.5 w-3.5 ${pack.is_default ? 'fill-amber-500 text-amber-500' : ''}`} />
              {pack.is_default ? 'Por defeito' : 'Normal'}
            </button>
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" title="Editar nome">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Apagar o pack "${pack.name}" e as suas ${pack.word_count} palavras?`)) run(() => deleteVanaSketchPack(pack.id))
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
              title="Apagar pack"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {open && !editing && (
        <div className="space-y-3 border-t bg-slate-50/60 p-4">
          <AddWords packId={pack.id} />
          {pack.words.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Este pack ainda não tem palavras.</p>
          ) : (
            <div className="flex max-h-80 flex-wrap gap-1.5 overflow-y-auto">
              {pack.words.map((w) => (
                <WordChip key={w.id} id={w.id} word={w.word} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WordChip({ id, word }: { id: string; word: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <span className={`flex items-center gap-1 rounded-lg border bg-white py-1 pl-2.5 pr-1 text-sm font-semibold text-slate-700 ${pending ? 'opacity-40' : ''}`}>
      {word}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const res = await deleteVanaSketchPackWord(id)
          if (res.error) alert(res.error)
        })}
        className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
        title={`Tirar "${word}"`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

function AddWords({ packId }: { packId: string }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<AddPackWordsResult | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    startTransition(async () => {
      const res = await addVanaSketchPackWords(packId, text)
      setResult(res)
      // Fica na caixa só o que não entrou, para se poder corrigir
      if (!res.error) setText(res.invalid.join('\n'))
    })
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter adiciona; Shift+Enter muda de linha para colar listas
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) }
          }}
          rows={1}
          placeholder="Palavras novas — separa por vírgulas ou cola uma por linha"
          className="min-h-[42px] min-w-0 flex-1 resize-y rounded-lg border bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {pending ? 'A adicionar…' : 'Adicionar'}
        </button>
      </form>
      {result && (
        <div className="space-y-1 text-xs">
          {result.error && <p className="flex items-center gap-1.5 font-semibold text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {result.error}</p>}
          {result.added.length > 0 && (
            <p className="flex items-start gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> Adicionada{result.added.length !== 1 ? 's' : ''}: {result.added.join(', ')}
            </p>
          )}
          {result.existing.length > 0 && <p className="text-slate-500">Já estava{result.existing.length !== 1 ? 'm' : ''} no pack: {result.existing.join(', ')}</p>}
          {result.invalid.length > 0 && <p className="text-amber-700">Recusada{result.invalid.length !== 1 ? 's' : ''} (só letras, 2 a 30 caracteres): {result.invalid.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}
