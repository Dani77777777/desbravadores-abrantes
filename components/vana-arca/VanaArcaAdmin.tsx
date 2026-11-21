'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, History, Loader2, RefreshCw, Save, Trophy, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { processPayoutsNow, saveVanaArcaSettings, type VanaArcaAdminPreview } from '@/lib/actions/vana-arca'
import { WEEKDAY_NAMES, formatAverage, nextPrizeAt, normalizePrizeTime } from '@/utils/vana-arca'
import type { VanaArcaPayoutRow, VanaArcaSettings } from '@/types/vana-arca'
import { prizeDateLabel } from './ArcaBoards'

interface Props {
  initialSettings: VanaArcaSettings
  preview: VanaArcaAdminPreview
  history: VanaArcaPayoutRow[]
}

type Form = {
  prize_weekday: number
  prize_time: string
  paid_runs_per_day: string
  reward_low: string
  reward_mid: string
  reward_high: string
  mid_from: string
  high_from: string
  top1: string
  top2: string
  top3: string
  family_prize: string
  family_min_members: string
}

function toForm(s: VanaArcaSettings): Form {
  return {
    prize_weekday: s.prize_weekday,
    prize_time: normalizePrizeTime(s.prize_time),
    paid_runs_per_day: String(s.paid_runs_per_day),
    reward_low: String(s.reward_low),
    reward_mid: String(s.reward_mid),
    reward_high: String(s.reward_high),
    mid_from: String(s.mid_from),
    high_from: String(s.high_from),
    top1: String(s.top_prizes[0] ?? 0),
    top2: String(s.top_prizes[1] ?? 0),
    top3: String(s.top_prizes[2] ?? 0),
    family_prize: String(s.family_prize),
    family_min_members: String(s.family_min_members),
  }
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

function NumberField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-bold text-slate-600">{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(e.target.value)} className="tabular-nums" />
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function VanaArcaAdmin({ initialSettings, preview, history }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(() => toForm(initialSettings))
  const [saved, setSaved] = useState<VanaArcaSettings>(initialSettings)
  const [saving, startSaving] = useTransition()
  const [processing, startProcessing] = useTransition()

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const scheduleChanged = form.prize_weekday !== saved.prize_weekday || form.prize_time !== normalizePrizeTime(saved.prize_time)
  // A mudança de dia/hora vale a partir de agora: o período aberto acaba na próxima ocorrência.
  const nextIfSaved = /^\d{2}:\d{2}$/.test(form.prize_time) ? nextPrizeAt(new Date(), form.prize_weekday, form.prize_time) : null

  const save = () =>
    startSaving(async () => {
      const res = await saveVanaArcaSettings({
        prize_weekday: form.prize_weekday,
        prize_time: form.prize_time,
        paid_runs_per_day: num(form.paid_runs_per_day),
        reward_low: num(form.reward_low),
        reward_mid: num(form.reward_mid),
        reward_high: num(form.reward_high),
        mid_from: num(form.mid_from),
        high_from: num(form.high_from),
        top_prizes: [num(form.top1), num(form.top2), num(form.top3)],
        family_prize: num(form.family_prize),
        family_min_members: num(form.family_min_members),
      })
      if (res.error || !res.settings) {
        toast.error(res.error ?? 'Não foi possível gravar.')
        return
      }
      setSaved(res.settings)
      setForm(toForm(res.settings))
      toast.success('Definições gravadas.')
      router.refresh()
    })

  const processNow = () =>
    startProcessing(async () => {
      const res = await processPayoutsNow()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.paidPeriods
          ? `${res.paidPeriods} ${res.paidPeriods === 1 ? 'semana paga' : 'semanas pagas'}.`
          : 'Nada em atraso: ainda não chegou a hora do próximo pagamento.',
      )
      router.refresh()
    })

  return (
    <div className="space-y-8">
      {/* Próximo pagamento */}
      <section className="rounded-2xl border border-sky-100 bg-sky-50 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-sky-900">
          <CalendarClock className="h-4 w-4" /> Próximo pagamento automático
        </p>
        <p className="mt-1 text-2xl font-black text-sky-950 first-letter:uppercase">{prizeDateLabel(preview.period.end)}</p>
        <p className="mt-1 text-sm text-sky-800">
          Conta as partidas acabadas desde {fmtShort(preview.period.start)}. Os prémios saem sozinhos, uma única vez, mesmo que
          ninguém abra o site (se o projeto tiver pg_cron; sem ele, saem quando alguém abrir o jogo ou esta página).
        </p>
        <Button onClick={processNow} disabled={processing} variant="outline" className="mt-3 bg-white">
          {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Processar pagamentos em atraso
        </Button>
        <p className="mt-1 text-[11px] text-sky-700">Nunca paga antes da hora nem paga a mesma semana duas vezes.</p>
      </section>

      {/* Pré-visualização */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-black text-slate-900">
            <Trophy className="h-4 w-4 text-amber-500" /> Top 3 agora
          </h2>
          {preview.top.length === 0 ? (
            <p className="text-sm text-slate-400">Ainda ninguém (elegível) jogou neste período.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {preview.top.map((r) => (
                <li key={r.position} className="flex items-center gap-2">
                  <span className="w-6 font-black text-slate-500">{r.position}.º</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="tabular-nums text-slate-500">{r.score} pts</span>
                  {r.prize > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">+{r.prize}</span>}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Só desbravadores e dirigentes; coordenadores e contas de teste ficam de fora.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-black text-slate-900">
            <Users className="h-4 w-4 text-emerald-600" /> Disputa de Famílias agora
          </h2>
          {preview.families.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma família tem {saved.family_min_members} membros ativos.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {preview.families.map((f) => (
                <li key={f.position} className="flex items-center gap-2">
                  <span className="w-6 font-black text-slate-500">{f.position}.º</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                  <span className="text-xs text-slate-500">{f.played} de {f.active} jogaram</span>
                  <span className="w-12 text-right font-bold tabular-nums">{formatAverage(f.average)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            {preview.family_winner
              ? `Se acabasse agora, a ${preview.family_winner} ganhava ${saved.family_prize} XP + Gold para cada membro que jogou.`
              : 'Ainda não há família vencedora.'}
          </p>
        </div>
      </section>

      {/* Definições */}
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-black text-slate-900">Definições</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="va-day" className="text-xs font-bold text-slate-600">Dia do prémio semanal</Label>
            <select
              id="va-day"
              value={form.prize_weekday}
              onChange={(e) => set('prize_weekday', Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="va-time" className="text-xs font-bold text-slate-600">Hora (Lisboa)</Label>
            <Input id="va-time" type="time" value={form.prize_time} onChange={(e) => set('prize_time', e.target.value)} />
          </div>
        </div>
        {scheduleChanged && nextIfSaved && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
            Se gravares, o próximo pagamento passa a ser <strong>{prizeDateLabel(nextIfSaved.toISOString())}</strong>. As semanas já pagas não mudam.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="va-paid" label="Partidas com prémio por dia" value={form.paid_runs_per_day} onChange={(v) => set('paid_runs_per_day', v)} />
          <NumberField id="va-mid-from" label="Escalão do meio a partir de (pares)" value={form.mid_from} onChange={(v) => set('mid_from', v)} />
          <NumberField id="va-high-from" label="Escalão alto a partir de (pares)" value={form.high_from} onChange={(v) => set('high_from', v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="va-low" label="Prémio baixo (XP = Gold)" value={form.reward_low} onChange={(v) => set('reward_low', v)} />
          <NumberField id="va-mid" label="Prémio do meio" value={form.reward_mid} onChange={(v) => set('reward_mid', v)} />
          <NumberField id="va-high" label="Prémio alto" value={form.reward_high} onChange={(v) => set('reward_high', v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="va-top1" label="1.º lugar da semana" value={form.top1} onChange={(v) => set('top1', v)} />
          <NumberField id="va-top2" label="2.º lugar" value={form.top2} onChange={(v) => set('top2', v)} />
          <NumberField id="va-top3" label="3.º lugar" value={form.top3} onChange={(v) => set('top3', v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="va-fam"
            label="Prémio da família vencedora (por membro que jogou)"
            value={form.family_prize}
            onChange={(v) => set('family_prize', v)}
          />
          <NumberField
            id="va-fam-min"
            label="Mínimo de membros ativos por família"
            value={form.family_min_members}
            onChange={(v) => set('family_min_members', v)}
          />
        </div>
        <p className="text-xs text-slate-500">
          As campanhas de multiplicador (Gestão → Jogos) aplicam-se ao prémio por partida, nunca aos prémios semanais.
        </p>
        <Button onClick={save} disabled={saving} className="bg-sky-700 hover:bg-sky-800">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Gravar definições
        </Button>
      </section>

      {/* Histórico */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-black text-slate-900">
          <History className="h-4 w-4" /> Histórico dos pagamentos
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Ainda não houve pagamentos semanais.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map((p) => (
              <li key={p.period_end} className="space-y-1 py-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    {fmtShort(p.period_start)} → {fmtShort(p.period_end)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {p.paid_by ? `Processado por ${p.paid_by_name}` : 'Automático'} · {fmtShort(p.paid_at)}
                  </span>
                </p>
                {p.results.top.length === 0 ? (
                  <p className="text-slate-400">Ninguém elegível jogou nesta semana.</p>
                ) : (
                  <p className="text-slate-700">
                    {p.results.top.map((t) => `${t.position}.º ${t.name} (${t.score} pts, +${t.prize})`).join(' · ')}
                  </p>
                )}
                <p className="text-slate-600">
                  {p.results.family_winner
                    ? `Família: ${p.results.family_winner.name} — ${p.results.family_winner.recipients.length} × ${p.results.family_winner.prize} XP + Gold (${p.results.family_winner.recipients.map((r) => r.name).join(', ')})`
                    : 'Sem família vencedora.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
