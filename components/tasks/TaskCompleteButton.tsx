'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface TaskCompleteButtonProps {
  taskId: string
  userId: string
}

export function TaskCompleteButton({ taskId, userId }: TaskCompleteButtonProps) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleComplete = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.from('task_completions').insert({
        task_id: taskId,
        user_id: userId,
      })
      if (error) throw error
      toast.success('Tarefa marcada como concluída! Aguarda a aprovação dos pontos.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao marcar tarefa.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-blue-600 text-blue-700 hover:bg-blue-50 shrink-0 gap-1"
      onClick={handleComplete}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <CheckCircle2 className="w-3 h-3" />
      )}
      Concluir
    </Button>
  )
}
