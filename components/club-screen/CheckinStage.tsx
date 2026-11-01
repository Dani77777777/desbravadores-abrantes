'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { displayFont } from '@/components/landing/fonts'
import { CHECKIN_ENTER_PATH } from '@/utils/checkin'
import { initials } from '@/utils/raffle'
import { ClubBackdrop } from './ClubBackdrop'
import { useCheckinBoard } from './useCheckinBoard'

const D = displayFont.className
/** Nomes que cabem no ecrã; os mais antigos saem (o contador continua certo). */
const MAX_NAMES = 40

/** Presenças no projetor: o QR (muda a cada 30 s), o contador e os nomes a chegar. */
export function CheckinStage({ eventId }: { eventId: string | null }) {
  const { board, error } = useCheckinBoard(eventId, 3000)
  const [origin, setOrigin] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), [])

  if (!eventId || error || !board) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-blue-950 text-center text-white">
        <ClubBackdrop />
        <p className="relative max-w-[60vw] text-[3.2vh] font-bold text-blue-100">
          {!eventId ? 'Escolhe o evento no controlo do Ecrã do Clube.' : error ?? 'A carregar…'}
        </p>
      </div>
    )
  }

  const people = [
    ...board.members.map((m) => ({ key: m.id, name: m.name, avatar: m.avatar, guest: false, at: m.at })),
    ...board.guests.map((g) => ({ key: g.id, name: g.name, avatar: null, guest: true, at: g.at })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const url = `${origin}${CHECKIN_ENTER_PATH}?e=${board.event.id}&t=${board.token}`

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-blue-950 text-white">
      <ClubBackdrop />
      <section className="relative flex w-[44%] flex-col items-center justify-center gap-[3vh] px-[3vw]">
        <p className="text-[2.2vh] font-semibold uppercase tracking-[0.5em] text-yellow-300">Marca a tua presença</p>
        <h1 className={`${D} text-center text-[6vh] font-extrabold leading-tight`}>{board.event.title}</h1>
        {board.open ? (
          <div className="rounded-[3vh] bg-white p-[2.4vh] shadow-[0_3vh_6vh_rgba(0,0,0,.45)]">
            {origin && <QRCodeSVG value={url} size={512} level="M" className="h-[46vh] w-[46vh]" />}
          </div>
        ) : (
          <p className="rounded-[2vh] bg-white/10 px-[3vh] py-[2vh] text-[3vh] font-bold text-blue-100">As presenças fecharam.</p>
        )}
        <p className="max-w-[34vw] text-center text-[2.3vh] text-blue-100">
          Aponta a câmara do telemóvel. Quem é do clube entra na conta; as visitas escrevem só o nome.
        </p>
      </section>

      <section className="relative flex min-w-0 flex-1 flex-col py-[5vh] pr-[4vw]">
        <div className="flex items-end gap-[2vw]">
          <p className={`${D} text-[16vh] font-extrabold leading-none tabular-nums text-yellow-300`}>{people.length}</p>
          <div className="pb-[2vh] text-[2.6vh] font-bold text-blue-100">
            <p>{people.length === 1 ? 'presente' : 'presentes'}</p>
            <p className="text-[2vh] font-semibold text-blue-300">
              {board.members.length} do clube · {board.guests.length} {board.guests.length === 1 ? 'visita' : 'visitas'}
            </p>
          </div>
        </div>
        <ul className="mt-[3vh] flex min-h-0 flex-1 flex-wrap content-start gap-[1.2vh] overflow-hidden">
          {people.slice(0, MAX_NAMES).map((p) => (
            <li
              key={p.key}
              className="cs-enter flex items-center gap-[1vh] rounded-full bg-white/10 py-[0.8vh] pl-[0.8vh] pr-[2vh] ring-1 ring-white/15"
            >
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" className="h-[4.4vh] w-[4.4vh] rounded-full object-cover" />
              ) : (
                <span
                  className={`flex h-[4.4vh] w-[4.4vh] items-center justify-center rounded-full text-[1.7vh] font-black ${
                    p.guest ? 'bg-yellow-400 text-blue-950' : 'bg-blue-200 text-blue-900'
                  }`}
                >
                  {initials(p.name)}
                </span>
              )}
              <span className="text-[2.4vh] font-bold">{p.name}</span>
            </li>
          ))}
          {people.length === 0 && <li className="text-[2.6vh] text-blue-200">Ainda ninguém. Sê o primeiro! 👋</li>}
        </ul>
      </section>
    </div>
  )
}
