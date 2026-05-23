'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Check, Clock, Zap, Pencil, Trash2, X } from 'lucide-react'
import { reorderQuestions } from '@/lib/actions/vana-quest'

const OPTION_COLORS: Record<string, string> = {
  A: 'bg-red-500', B: 'bg-blue-500', C: 'bg-yellow-400', D: 'bg-green-500',
}
const OPTION_LABELS: Record<string, string> = { A: '▲', B: '●', C: '◆', D: '■' }

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  time_seconds: number
  points_multiplier: number
  question_order: number
}

interface Props {
  questions: Question[]
  questId: string
  editingId?: string
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onSaveEdit: (formData: FormData) => void
}

function QuestionCard({
  q,
  index,
  isEditing,
  onEdit,
  onCancelEdit,
  onDelete,
  onSaveEdit,
  isDragOverlay = false,
}: {
  q: Question
  index: number
  isEditing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onSaveEdit: (fd: FormData) => void
  isDragOverlay?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q.id, disabled: isEditing })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
        isEditing ? 'ring-2 ring-blue-500' : ''
      } ${isDragOverlay ? 'shadow-2xl rotate-1 scale-[1.02]' : ''}`}
    >
      {isEditing ? (
        <EditForm q={q} index={index} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="mt-1 p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            tabIndex={-1}
          >
            <GripVertical className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-blue-900 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                {index + 1}
              </span>
              <p className="font-semibold text-gray-900 truncate">{q.question_text}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                const val = q[`option_${opt.toLowerCase()}` as keyof Question] as string
                const isCorrect = q.correct_option === opt
                return (
                  <div
                    key={opt}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                      isCorrect ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ${OPTION_COLORS[opt]}`}>
                      {OPTION_LABELS[opt]}
                    </span>
                    <span className={`truncate text-xs ${isCorrect ? 'font-semibold text-green-700' : 'text-gray-600'}`}>{val}</span>
                    {isCorrect && <Check className="w-3 h-3 text-green-600 flex-shrink-0 ml-auto" />}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {q.time_seconds}s</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> ×{q.points_multiplier}</span>
              <span className="text-blue-600 font-medium">max {10 * q.points_multiplier} pts</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              title="Editar"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditForm({
  q,
  index,
  onCancel,
  onSave,
}: {
  q: Question
  index: number
  onCancel: () => void
  onSave: (fd: FormData) => void
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSave(new FormData(e.currentTarget))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="id" value={q.id} />
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-blue-600 flex items-center gap-1.5">
          <Pencil className="w-3.5 h-3.5" /> A editar pergunta {index + 1}
        </span>
        <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <textarea
        name="question_text"
        required
        defaultValue={q.question_text}
        rows={2}
        className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['a', 'b', 'c', 'd'] as const).map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${OPTION_COLORS[opt.toUpperCase()]}`}>
              {OPTION_LABELS[opt.toUpperCase()]}
            </span>
            <input
              name={`option_${opt}`}
              required
              defaultValue={q[`option_${opt}` as keyof Question] as string}
              placeholder={`Opção ${opt.toUpperCase()}`}
              className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Resposta correcta</label>
          <select name="correct_option" defaultValue={q.correct_option}
            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="A">▲ A</option>
            <option value="B">● B</option>
            <option value="C">◆ C</option>
            <option value="D">■ D</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Tempo
          </label>
          <select name="time_seconds" defaultValue={String(q.time_seconds)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="5">5 segundos</option>
            <option value="10">10 segundos</option>
            <option value="20">20 segundos</option>
            <option value="30">30 segundos</option>
            <option value="60">60 segundos</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Pontos
          </label>
          <select name="points_multiplier" defaultValue={String(q.points_multiplier)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="1">Normal (×1)</option>
            <option value="2">Duplo (×2)</option>
            <option value="3">Triplo (×3)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit"
          className="flex-1 bg-blue-900 text-white py-2.5 rounded-xl font-bold hover:bg-blue-800 transition-colors flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> Guardar alterações
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 rounded-xl border font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-sm">
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function SortableQuestionList({ questions: initial, questId, onEdit, onCancelEdit, onDelete, onSaveEdit, editingId }: Props) {
  const [questions, setQuestions] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Sync local state when server props change (added, removed, or content edited)
  // — but preserve order if only the IDs are the same (user is mid-drag/save)
  useEffect(() => {
    const localIds = questions.map((q) => q.id).join(',')
    const propIds = initial.map((q) => q.id).join(',')
    if (localIds !== propIds || initial.length !== questions.length) {
      setQuestions(initial)
    } else {
      // Same set of IDs — just refresh content (text/options/etc. may have changed)
      const idToProp = new Map(initial.map((q) => [q.id, q]))
      setQuestions((prev) => prev.map((q) => idToProp.get(q.id) || q))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = questions.findIndex((q) => q.id === active.id)
    const newIndex = questions.findIndex((q) => q.id === over.id)
    const reordered = arrayMove(questions, oldIndex, newIndex)
    setQuestions(reordered)

    setSaving(true)
    await reorderQuestions(questId, reordered.map((q) => q.id))
    setSaving(false)
  }

  const activeQuestion = activeId ? questions.find((q) => q.id === activeId) : null

  return (
    <div className="space-y-3">
      {saving && (
        <p className="text-xs text-blue-600 font-semibold text-center animate-pulse">A guardar ordem...</p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              q={q}
              index={i}
              isEditing={editingId === q.id}
              onEdit={() => onEdit(q.id)}
              onCancelEdit={onCancelEdit}
              onDelete={() => onDelete(q.id)}
              onSaveEdit={onSaveEdit}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeQuestion && (
            <QuestionCard
              q={activeQuestion}
              index={questions.findIndex((q) => q.id === activeId)}
              isEditing={false}
              onEdit={() => {}}
              onCancelEdit={() => {}}
              onDelete={() => {}}
              onSaveEdit={() => {}}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
