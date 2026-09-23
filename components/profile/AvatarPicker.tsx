'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Link2, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { AVATAR_MAX_BYTES } from '@/utils/avatar-upload'

/**
 * Escolha da foto de perfil: `file` é uma foto nova ainda por carregar (só vai para o
 * bucket quando o formulário é guardado, para não deixar ficheiros órfãos);
 * `url` é a foto atual ou um link externo ('' = sem foto).
 */
export interface AvatarChoice {
  file: File | null
  url: string
}

export function AvatarPicker({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string
  value: AvatarChoice
  onChange: (value: AvatarChoice) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showLink, setShowLink] = useState(false)
  // Link que falhou a carregar (deixa de contar assim que o link muda)
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const broken = !!value.url && brokenUrl === value.url

  // Pré-visualização local da foto escolhida (sem a carregar ainda)
  const filePreview = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file])
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview) }, [filePreview])

  const preview = filePreview ?? (value.url && !broken ? value.url : null)
  const hasPhoto = !!value.file || !!value.url

  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = parts.length
    ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
    : null

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite voltar a escolher o mesmo ficheiro
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Escolhe um ficheiro de imagem.')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('A imagem é demasiado grande (máx. 15 MB).')
      return
    }
    setShowLink(false)
    onChange({ file, url: '' })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="group relative shrink-0 cursor-pointer rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400/50 disabled:cursor-not-allowed"
          aria-label="Escolher foto de perfil"
        >
          <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-extrabold text-white ring-4 ring-yellow-400 ring-offset-2">
            {preview ? (
              <img src={preview} alt="Foto de perfil" className="h-full w-full object-cover" onError={() => { if (!value.file) setBrokenUrl(value.url) }} />
            ) : initials ? (
              initials
            ) : (
              <User className="h-10 w-10" />
            )}
          </span>
          <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-blue-950 shadow-md ring-2 ring-white transition-transform group-hover:scale-110">
            <Camera className="h-4 w-4" />
          </span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Camera className="h-4 w-4" /> {hasPhoto ? 'Trocar foto' : 'Tirar ou escolher foto'}
          </button>
          {hasPhoto && (
            <button
              type="button"
              onClick={() => { setShowLink(false); onChange({ file: null, url: '' }) }}
              disabled={disabled}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-red-600 ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Remover foto
            </button>
          )}
        </div>
      </div>

      {/* accept="image/*" deixa o telemóvel escolher entre a câmara e a galeria */}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={disabled} />

      {value.file ? (
        <p className="text-xs text-stone-500">Foto nova escolhida. É carregada quando guardares.</p>
      ) : broken ? (
        <p className="text-xs text-red-500">Não conseguimos carregar esta imagem. Confirma o link.</p>
      ) : null}

      {showLink ? (
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            type="url"
            placeholder="https://exemplo.com/foto.jpg"
            value={value.file ? '' : value.url}
            onChange={(e) => onChange({ file: null, url: e.target.value })}
            disabled={disabled}
            className="h-11 rounded-xl border-stone-200 bg-stone-50 pl-10 text-sm focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowLink(true)}
          disabled={disabled}
          className="cursor-pointer text-xs font-semibold text-stone-400 underline-offset-2 hover:text-blue-950 hover:underline"
        >
          Prefiro usar um link de imagem
        </button>
      )}
    </div>
  )
}
