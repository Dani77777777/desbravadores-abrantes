import { Car, MapPin, Route, Star, Tent } from 'lucide-react'
import {
  DIRECTION_LABELS,
  carStops,
  formatDepart,
  normalizePlan,
  pointColor,
  routeUrl,
  type TripDirection,
  type TripPublished,
} from '@/utils/trips'
import { TripStopMap } from './TripStopMap'

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
        car: plan.cars.find((c) => c.direction === dir && (c.passengers.includes(userId) || c.driverId === userId)) ?? null,
      }))
      return { r, plan, tent, cars, nameOf }
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
        {trips.map(({ r, plan, tent, cars, nameOf }) => (
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

            {cars.map(({ dir, car }) => {
              if (!car) return null
              const driving = car.driverId === userId
              const driverName = car.driverId ? nameOf(car.driverId) : car.driver
              const others = car.passengers.filter((id) => id !== userId)
              const stops = carStops(car, plan)
              const myStop = stops.find((s) => s.point && s.passengers.includes(userId)) ?? null
              const route = driving ? routeUrl(dir, stops, r.published?.dest) : null
              const colorOf = (id: string) => pointColor(plan.points.findIndex((x) => x.id === id))
              return (
                <div key={dir} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-blue-950">
                    <Car className={`h-4 w-4 ${dir === 'volta' ? '-scale-x-100' : ''}`} /> {DIRECTION_LABELS[dir]}
                    {driving ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-extrabold text-white">Vais a conduzir</span>
                    ) : (
                      driverName && <span className="font-bold text-stone-600">· com {driverName}</span>
                    )}
                  </p>
                  {myStop?.point ? (
                    <div className="mt-1">
                      <p className="flex items-center gap-1.5 text-sm text-stone-700">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: colorOf(myStop.point.id) }} />
                        <span>
                          {dir === 'ida' ? 'Apanhado em' : 'Deixado em'} <b>{myStop.point.name || 'ponto de encontro'}</b>
                          {car.departAt && ` · ${formatDepart(car.departAt, myStop.time)}`}
                        </span>
                      </p>
                      {myStop.point.lat != null && myStop.point.lng != null && (
                        <TripStopMap coords={{ lat: myStop.point.lat, lng: myStop.point.lng }} />
                      )}
                    </div>
                  ) : (
                    (car.meetingPoint || car.departAt) && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-700">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
                        {[car.meetingPoint, formatDepart(car.departAt)].filter(Boolean).join(' · ')}
                      </p>
                    )
                  )}
                  {driving && stops.some((s) => s.point) && (
                    <div className="mt-3 space-y-2">
                      <ol className="space-y-1.5">
                        {stops.map((s) => (
                          <li key={s.point?.id ?? 'geral'} className="flex items-start gap-2 text-sm">
                            <span
                              className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: s.point ? colorOf(s.point.id) : '#a8a29e' }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-bold text-blue-950">
                                {s.time && <span className="tabular-nums">{s.time} · </span>}
                                {s.point ? s.point.name || 'Ponto de encontro' : car.meetingPoint || 'Sem ponto marcado'}
                              </span>
                              <span className="block text-xs text-stone-500">
                                {dir === 'ida' ? 'Apanhas' : 'Deixas'} {s.passengers.map(nameOf).join(', ')}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                      {route && (
                        <a
                          href={route}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-950 px-3 py-2 text-xs font-bold text-white hover:bg-blue-900"
                        >
                          <Route className="h-3.5 w-3.5" /> Abrir percurso no Google Maps
                        </a>
                      )}
                    </div>
                  )}
                  {others.length > 0 && !(driving && stops.some((s) => s.point)) && (
                    <p className="mt-2 text-xs text-stone-500">
                      {driving ? 'Levas' : 'Vais com'} {others.map(nameOf).join(', ')}
                    </p>
                  )}
                </div>
              )
            })}
          </article>
        ))}
      </div>
    </section>
  )
}
