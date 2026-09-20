'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BookOpen, Check, Loader2, Pencil, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { createQuestion, toggleQuestionActive, updateQuestion } from '@/lib/actions/vana-trilha'
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  DIFFICULTY_BADGE_CLASS,
  DIFFICULTY_LABEL,
  STATION_THEME,
} from '@/utils/vana-trilha-labels'
import {
  VANATRILHA_STATIONS,
  getStation,
  type VanaTrilhaCategory,
  type VanaTrilhaDifficulty,
  type VanaTrilhaQuestionAdmin,
  type VanaTrilhaQuestionInput,
} from '@/types/vana-trilha'

const CATEGORIES = Object.keys(CATEGORY_LABEL) as VanaTrilhaCategory[]
const DIFFICULTIES = Object.keys(DIFFICULTY_LABEL) as VanaTrilhaDifficulty[]
const LETTERS = ['A', 'B', 'C', 'D']

const selectClass =
  'h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const EMPTY: VanaTrilhaQuestionInput = {
  station: 1,
  category: 'personagens',
  difficulty: 'facil',
  prompt: '',
  options: ['', '', '', ''],
  correct_index: 0,
  reference: '',
  explanation: '',
  is_active: true,
}

export default function QuestionBankClient({ initialQuestions }: { initialQuestions: VanaTrilhaQuestionAdmin[] }) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [station, setStation] = useState<string>('all')
  const [difficulty, setDifficulty] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [active, setActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<VanaTrilhaQuestionAdmin | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<VanaTrilhaQuestionInput>(EMPTY)
  const [saving, startSaving] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = normalize(search.trim())
    return questions.filter(
      (item) =>
        (station === 'all' || String(item.station) === station) &&
        (difficulty === 'all' || item.difficulty === difficulty) &&
        (category === 'all' || item.category === category) &&
        (active === 'all' || (active === 'active' ? item.is_active : !item.is_active)) &&
        (!q ||
          normalize(item.prompt).includes(q) ||
          item.options.some((o) => normalize(o).includes(q)) ||
          normalize(item.reference ?? '').includes(q)),
    )
  }, [questions, station, difficulty, category, active, search])

  function openCreate() {
    setEditing(null)
    setForm({
      ...EMPTY,
      station: station === 'all' ? 1 : Number(station),
      difficulty: difficulty === 'all' ? 'facil' : (difficulty as VanaTrilhaDifficulty),
      category: category === 'all' ? 'personagens' : (category as VanaTrilhaCategory),
      options: ['', '', '', ''],
    })
    setFormOpen(true)
  }

  function openEdit(q: VanaTrilhaQuestionAdmin) {
    setEditing(q)
    setForm({
      station: q.station,
      category: q.category,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: [...q.options],
      correct_index: q.correct_index,
      reference: q.reference ?? '',
      explanation: q.explanation,
      is_active: q.is_active,
    })
    setFormOpen(true)
  }

  function save() {
    startSaving(async () => {
      const res = editing ? await updateQuestion(editing.id, form) : await createQuestion(form)
      if (res.error || !res.question) {
        toast.error(res.error ?? 'Não foi possível guardar.')
        return
      }
      const saved = res.question
      setQuestions((prev) => (editing ? prev.map((q) => (q.id === saved.id ? saved : q)) : [...prev, saved]))
      toast.success(editing ? 'Pergunta atualizada.' : 'Pergunta criada.')
      setFormOpen(false)
    })
  }

  async function toggle(q: VanaTrilhaQuestionAdmin, value: boolean) {
    setTogglingId(q.id)
    const res = await toggleQuestionActive(q.id, value)
    setTogglingId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setQuestions((prev) => prev.map((item) => (item.id === q.id ? { ...item, is_active: value } : item)))
    toast.success(value ? 'Pergunta ativada.' : 'Pergunta desativada — deixa de sair nas etapas.')
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Banco de perguntas</h2>
          <p className="text-sm text-slate-500">
            {filtered.length} de {questions.length} perguntas. Desativar em vez de apagar mantém o histórico das etapas.
          </p>
        </div>
        <Button onClick={openCreate} className="h-11 rounded-xl bg-amber-500 font-bold text-white hover:bg-amber-600">
          <Plus className="h-4 w-4" /> Nova pergunta
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar…" className="h-10 pl-9" />
        </div>
        <select value={station} onChange={(e) => setStation(e.target.value)} className={selectClass} aria-label="Estação">
          <option value="all">Todas as estações</option>
          {VANATRILHA_STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}. {s.name}
            </option>
          ))}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectClass} aria-label="Dificuldade">
          <option value="all">Todas as dificuldades</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass} aria-label="Categoria">
          <option value="all">Todas as categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          value={active}
          onChange={(e) => setActive(e.target.value as 'all' | 'active' | 'inactive')}
          className={selectClass}
          aria-label="Estado"
        >
          <option value="all">Ativas e inativas</option>
          <option value="active">Só ativas</option>
          <option value="inactive">Só inativas</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Nenhuma pergunta encontrada com estes filtros.
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((q) => {
            const s = getStation(q.station)
            const theme = STATION_THEME[s.color]
            return (
              <li
                key={q.id}
                className={`flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-opacity ${
                  q.is_active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  <span className={`rounded-full px-2 py-0.5 text-white ${theme.bg}`}>
                    {s.id}. {s.name}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${DIFFICULTY_BADGE_CLASS[q.difficulty]}`}>
                    {DIFFICULTY_LABEL[q.difficulty]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {CATEGORY_EMOJI[q.category]} {CATEGORY_LABEL[q.category]}
                  </span>
                  {!q.is_active && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-white">Inativa</span>}
                </div>

                <p className="font-bold leading-snug text-slate-900">{q.prompt}</p>

                <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {q.options.map((o, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-1.5 rounded-lg px-2 py-1 ${
                        i === q.correct_index ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-600'
                      }`}
                    >
                      <span className="font-black">{LETTERS[i]}.</span>
                      <span className="min-w-0 flex-1">{o}</span>
                      {i === q.correct_index && <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                    </li>
                  ))}
                </ol>

                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer select-none font-semibold text-amber-700">
                    Explicação {q.reference ? `· ${q.reference}` : ''}
                  </summary>
                  <p className="mt-1 flex gap-1.5 text-slate-600">
                    <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    {q.explanation}
                  </p>
                </details>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    {togglingId === q.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Switch checked={q.is_active} onCheckedChange={(v) => toggle(q, v)} aria-label="Ativa" />
                    )}
                    {q.is_active ? 'Ativa' : 'Inativa'}
                  </label>
                  <Button variant="outline" size="sm" onClick={() => openEdit(q)} className="rounded-lg">
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => !saving && setFormOpen(open)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar pergunta' : 'Nova pergunta'}</DialogTitle>
            <DialogDescription>
              Escreve para desbravadores de 10–15 anos: frases curtas, e uma explicação com o versículo.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="vt-station">Estação</Label>
                <select
                  id="vt-station"
                  value={form.station}
                  onChange={(e) => setForm({ ...form, station: Number(e.target.value) })}
                  className={selectClass}
                >
                  {VANATRILHA_STATIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}. {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vt-difficulty">Dificuldade</Label>
                <select
                  id="vt-difficulty"
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value as VanaTrilhaDifficulty })}
                  className={selectClass}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vt-category">Categoria</Label>
                <select
                  id="vt-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as VanaTrilhaCategory })}
                  className={selectClass}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vt-prompt">Pergunta</Label>
              <Textarea
                id="vt-prompt"
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                placeholder="Ex.: Quantos espias enviou Moisés à terra de Canaã?"
                maxLength={300}
                rows={2}
                required
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Opções — marca a correta</legend>
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, correct_index: i })}
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border-2 text-sm font-black transition-colors ${
                      form.correct_index === i
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300'
                    }`}
                    aria-label={`Marcar opção ${LETTERS[i]} como correta`}
                    aria-pressed={form.correct_index === i}
                  >
                    {form.correct_index === i ? <Check className="h-4 w-4" /> : LETTERS[i]}
                  </button>
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const options = [...form.options]
                      options[i] = e.target.value
                      setForm({ ...form, options })
                    }}
                    placeholder={`Opção ${LETTERS[i]}`}
                    maxLength={120}
                    required
                    className={form.correct_index === i ? 'border-emerald-300' : ''}
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500">A ordem das opções é baralhada automaticamente no jogo.</p>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="vt-reference">Referência bíblica</Label>
              <Input
                id="vt-reference"
                value={form.reference ?? ''}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="Ex.: Números 13:2-16"
                maxLength={80}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vt-explanation">Explicação (aparece depois de responder)</Label>
              <Textarea
                id="vt-explanation"
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                placeholder="Explica a resposta em 1–2 frases, de preferência com o versículo."
                maxLength={500}
                rows={3}
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              Ativa (pode sair nas etapas)
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-amber-500 font-bold text-white hover:bg-amber-600">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Guardar alterações' : 'Criar pergunta'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
