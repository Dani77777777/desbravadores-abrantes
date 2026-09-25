import type { CSSProperties } from 'react'
import Image from 'next/image'
import { displayFont } from '@/components/landing/fonts'
import { ClubBackdrop } from './ClubBackdrop'

const D = displayFont.className
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/** Ecrã de espera: o logo do clube. */
export function LogoStage() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-blue-950 text-white">
      <ClubBackdrop />
      <div className="lp-rise relative" style={delay(0)}>
        <div aria-hidden className="cs-glow absolute inset-[8%] rounded-full bg-yellow-400/25 blur-[7vh]" />
        <Image
          src="/images/Logo Desbravadores.png"
          alt="Desbravadores"
          width={640}
          height={664}
          priority
          className="lp-float relative h-[48vh] w-auto drop-shadow-[0_2vh_4vh_rgba(0,0,0,.45)]"
        />
      </div>
      <p className="lp-rise relative mt-[5vh] text-[2.2vh] font-semibold uppercase tracking-[0.6em] text-yellow-300" style={delay(200)}>
        Desbravadores
      </p>
      <h1 className={`${D} lp-rise relative mt-[1vh] text-[11vh] font-extrabold leading-none tracking-tight`} style={delay(300)}>
        Abrantes
      </h1>
    </div>
  )
}
