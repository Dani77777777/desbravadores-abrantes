import { Car, MapPin, Star, Tent } from 'lucide-react'
import { DIRECTION_LABELS, formatDepart, normalizePlan, type TripDirection, type TripPublished } from '@/utils/trips'

export type TripAssignmentRow = {
  event_id: string
  title: string
  location: string | null
  start_at: string
  end_at: string | null
  published: TripPublished
  published_at: string | null
}

/** Tenda e boleias do membro nas saídas publicadas (vem da RPC get_my_trip_assignments). */
export function TripAssignments({ rows, userId, displayClass }: { rows: TripAssignmentRow[]; userId: string; displayClass: string }) {
  const trips = rows
    .map((r) => {
      const plan = normalizePlan(r.published)
      const names = r.published?.names || {}
      const nameOf = (id: string) => (id === userId ? 'Tu' : names[id] || 'Membro')
      const tent = plan.tents.find((t) => t.members.some((m) => m.id === userId)) ?? null
      const cars = (['ida', 'volta'] as TripDirection[]).map((dir) => ({
        dir,
        car: plan.cars.find((c) => c.direction === dir && c.passengers.includes(userId)) ?? null,
      }))
      return { r, tent, cars, nameOf }
    })
    .filter((t) => t.tent || t.cars.some((c) => c.car))

  if (trips.length === 0) return null

  return (
    <section className="space-y-4">
      <h2 className={`${displayClass} flex items-center gap-2.5 text-2xl font-extrabold text-blue-950`}>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
          <Tent className="h-5 w-5" />
        </span>
        A tua saída
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {trips.map(({ r, tent, cars, nameOf }) => (
          <article key={r.event_id} className="space-y-4 rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-stone-200">
            <div>
              <h3 className="font-extrabold text-blue-950">{r.title}</h3>
              <p className="text-xs text-stone-500">
                {new Date(r.start_at).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
                {r.location && ` · ${r.location}`}
              </p>
            </div>

            {tent && (
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
                <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-900">
                  <Tent className="h-4 w-4" /> {tent.name}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {tent.members.map((m) => (
                    <li
                      key={m.id}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                        m.id === userId ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-900 ring-1 ring-inset ring-emerald-200'
                      }`}
                    >
                      {m.responsible && <Star className="h-3 w-3 fill-current text-amber-400" />}
                      {nameOf(m.id)}
                    </li>
                  ))}
                </ul>
                {tent.members.some((m) => m.responsible) && (
                  <p className="mt-2 text-[11px] text-emerald-700">
                    <Star className="inline h-3 w-3 fill-current text-amber-400" /> responsável da tenda
                  </p>
                )}
              </div>
            )}

            {cars.map(({ dir, car }) =>
              car ? (
                <div key={dir} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-blue-950">
                    <Car className={`h-4 w-4 ${dir === 'volta' ? '-scale-x-100' : ''}`} /> {DIRECTION_LABELS[dir]}
                    {car.driver && <span className="font-bold text-stone-600">· com {car.driver}</span>}
                  </p>
                  {(car.meetingPoint || car.departAt) && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-700">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
                      {[car.meetingPoint, formatDepart(car.departAt)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {car.passengers.length > 1 && (
                    <p className="mt-2 text-xs text-stone-500">
                      Vais com {car.passengers.filter((id) => id !== userId).map(nameOf).join(', ')}
                    </p>
                  )}
                </div>
              ) : null,
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
