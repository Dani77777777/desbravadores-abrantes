/** Fundo do Ecrã do Clube: as luzes e a grelha da landing page e do Ranking. */
export function ClubBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(45% 35% at 50% 0%, rgba(250,204,21,.22), transparent 70%), radial-gradient(40% 45% at 0% 45%, rgba(99,102,241,.25), transparent 70%), radial-gradient(40% 45% at 100% 75%, rgba(239,68,68,.15), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
          backgroundSize: '6vh 6vh',
          maskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
        }}
      />
    </>
  )
}
