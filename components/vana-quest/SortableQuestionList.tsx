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
import { ArrowDown, ArrowUp, GripVertical, Check, Clock, Zap, Pencil, Trash2, X, Lightbulb } from 'lucide-react'
import { reorderQuestions } from '@/lib/actions/vana-quest'
import { OPTION_COLORS, OPTION_LABELS, QuestionForm } from './QuestionForm'

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
  time_seconds: number
  points_multiplier: number
  question_order: number
}

interface Props {
  questions: Question[]
  questId: string
  editingId?: string
  /** A edição em curso está a ser guardada */
  saving?: boolean
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onSaveEdit: (formData: FormData) => void
}

const ICON_BTN =
  'w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

function QuestionCard({
  q,
  index,
  total,
  isEditing,
  saving,
  onEdit,
  onCancelEdit,
  onDelete,
  onSaveEdit,
  onMove,
  isDragOverlay = false,
}: {
  q: Question
  index: number
  total: number
  isEditing: boolean
  saving?: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onSaveEdit: (fd: FormData) => void
  onMove: (direction: -1 | 1) => void
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
      className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-all ${
        isEditing ? 'ring-2 ring-blue-500' : ''
      } ${isDragOverlay ? 'shadow-2xl rotate-1 scale-[1.02]' : ''}`}
    >
      {isEditing ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-blue-600 flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> A editar a pergunta {index + 1}
            </span>
            <button
              type="button"
              onClick={onCancelEdit}
              aria-label="Cancelar edição"
              className={`${ICON_BTN} hover:bg-gray-100`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <QuestionForm
            initial={q}
            submitLabel="Guardar alterações"
            pending={saving}
            onSubmit={(fd) => onSaveEdit(fd)}
            onCancel={onCancelEdit}
          />
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-2 mb-3">
            {/* Pega para arrastar */}
            <button
              {...attributes}
              {...listeners}
              type="button"
              aria-label={`Arrastar a pergunta ${index + 1} para reordenar`}
              className="-ml-1.5 -mt-1 w-8 h-9 flex items-center justify-center text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
              tabIndex={-1}
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <span className="w-6 h-6 mt-0.5 rounded-full bg-blue-900 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <p className="flex-1 min-w-0 font-semibold text-gray-900 break-words">{q.question_text}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            {(['A', 'B', 'C', 'D'] as const).map((opt) => {
              const val = q[`option_${opt.toLowerCase()}` as keyof Question] as string
              const isCorrect = q.correct_option === opt
              return (
                <div
                  key={opt}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    isCorrect ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <span aria-hidden className={`w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ${OPTION_COLORS[opt]}`}>
                    {OPTION_LABELS[opt]}
                  </span>
                  <span className={`min-w-0 break-words text-sm sm:text-xs ${isCorrect ? 'font-semibold text-green-700' : 'text-gray-600'}`}>{val}</span>
                  {isCorrect && (
                    <span className="ml-auto flex-shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-green-700">
                      <Check className="w-3.5 h-3.5" /> Certa
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {q.explanation && (
            <div className="mb-3 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
              <span className="leading-snug break-words min-w-0">{q.explanation}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {q.time_seconds}s</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> ×{q.points_multiplier}</span>
              <span className="text-blue-600 font-medium">máx. {10 * q.points_multiplier} pts</span>
            </div>

            <div className="flex items-center ml-auto -mr-1.5">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                aria-label={`Subir a pergunta ${index + 1}`}
                title="Subir"
                className={`${ICON_BTN} hover:bg-gray-100 hover:text-gray-700`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                aria-label={`Descer a pergunta ${index + 1}`}
                title="Descer"
                className={`${ICON_BTN} hover:bg-gray-100 hover:text-gray-700`}
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Editar a pergunta ${index + 1}`}
                title="Editar"
                className={`${ICON_BTN} hover:bg-blue-50 hover:text-blue-600`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Eliminar a pergunta ${index + 1}`}
                title="Eliminar"
                className={`${ICON_BTN} hover:bg-red-50 hover:text-red-500`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SortableQuestionList({ questions: initial, questId, onEdit, onCancelEdit, onDelete, onSaveEdit, editingId, saving: savingEdit }: Props) {
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
    await persistOrder(arrayMove(questions, oldIndex, newIndex))
  }

  // Alternativa ao arrastar: setas para subir/descer (teclado e ecrãs táteis)
  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    await persistOrder(arrayMove(questions, index, target))
  }

  async function persistOrder(reordered: Question[]) {
    setQuestions(reordered)
    setSaving(true)
    try {
      await reorderQuestions(questId, reordered.map((q) => q.id))
    } finally {
      setSaving(false)
    }
  }

  const activeQuestion = activeId ? questions.find((q) => q.id === activeId) : null

  return (
    <div className="space-y-3">
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
              total={questions.length}
              isEditing={editingId === q.id}
              saving={savingEdit}
              onEdit={() => onEdit(q.id)}
              onCancelEdit={onCancelEdit}
              onDelete={() => onDelete(q.id)}
              onSaveEdit={onSaveEdit}
              onMove={(direction) => handleMove(i, direction)}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeQuestion && (
            <QuestionCard
              q={activeQuestion}
              index={questions.findIndex((q) => q.id === activeId)}
              total={questions.length}
              isEditing={false}
              onEdit={() => {}}
              onCancelEdit={() => {}}
              onDelete={() => {}}
              onSaveEdit={() => {}}
              onMove={() => {}}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
      {saving && (
        <p role="status" className="text-xs text-blue-600 font-semibold text-center animate-pulse">A guardar ordem...</p>
      )}
    </div>
  )
}
