"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Phone, Video } from "lucide-react";
import { displayFont } from "./fonts";
import { googleMapsUrl } from "@/utils/maps";
import { isOnlineEvent } from "@/utils/online-event";

const D = displayFont.className;
// Fuso fixo: o servidor e o browser formatam igual (sem avisos de hidratação)
const TZ = "Europe/Lisbon";

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  is_online?: boolean | null;
  start_at: string;
  end_at: string | null;
}

function fmt(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleString("pt-PT", { timeZone: TZ, ...options });
}

/** Quanto falta até ao início (null antes de montar, para não haver diferenças servidor/browser). */
function useCountdown(target: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const diff = Math.max(0, target - now);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
    started: diff === 0,
  };
}

/** Cartão do próximo evento aberto a todo o clube, na página inicial dos visitantes. */
export function NextEventCard({ event }: { event: PublicEvent }) {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : null;
  const countdown = useCountdown(start.getTime());

  const time = fmt(start, { hour: "2-digit", minute: "2-digit" });
  const endTime = end ? fmt(end, { hour: "2-digit", minute: "2-digit" }) : null;
  const sameDay = end ? fmt(start, { dateStyle: "short" }) === fmt(end, { dateStyle: "short" }) : true;

  const units = countdown
    ? [
        { value: countdown.days, label: "dias" },
        { value: countdown.hours, label: "horas" },
        { value: countdown.minutes, label: "min" },
        { value: countdown.seconds, label: "seg" },
      ]
    : null;

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-blue-950 p-6 text-white shadow-2xl shadow-blue-950/25 sm:p-8 lg:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(50% 70% at 100% 0%, rgba(250,204,21,.22), transparent 70%), radial-gradient(45% 60% at 0% 100%, rgba(99,102,241,.35), transparent 70%)",
        }}
      />

      <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[auto_1fr_auto] lg:gap-10">
        {/* Data */}
        <div className="flex items-center gap-4 lg:block">
          <div className="-rotate-3 overflow-hidden rounded-3xl bg-white text-center text-blue-950 shadow-xl ring-4 ring-yellow-400">
            <div className="bg-red-500 px-5 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white">
              {fmt(start, { month: "short" }).replace(".", "")}
            </div>
            <div className={`${D} px-5 pb-2 pt-1 text-6xl font-extrabold leading-none`}>
              {fmt(start, { day: "numeric" })}
            </div>
            <div className="pb-2 text-xs font-bold capitalize text-stone-500">
              {fmt(start, { weekday: "long" })}
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-yellow-300 ring-1 ring-inset ring-white/15 lg:hidden">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Próximo evento
          </span>
        </div>

        {/* Detalhes */}
        <div className="min-w-0">
          <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-yellow-300 ring-1 ring-inset ring-white/15 lg:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Próximo evento · Aberto a todos
          </span>
          <h2 className={`${D} mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl`}>
            {event.title}
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-blue-100/85">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-yellow-300" />
              {time}
              {endTime && (sameDay ? ` – ${endTime}` : ` até ${fmt(end!, { day: "numeric", month: "short" })} ${endTime}`)}
            </span>
            {isOnlineEvent(event) ? (
              // Visitantes só sabem que é online; o link está no Painel
              <span className="inline-flex items-center gap-1.5">
                <Video className="h-4 w-4 shrink-0 text-yellow-300" />
                Online
              </span>
            ) : event.location && (
              <a
                href={googleMapsUrl(event)!}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver no mapa"
                className="inline-flex min-w-0 items-center gap-1.5 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                <MapPin className="h-4 w-4 shrink-0 text-yellow-300" />
                <span className="truncate">{event.location}</span>
              </a>
            )}
          </div>
          {event.description && (
            <p className="mt-3 line-clamp-2 max-w-2xl text-blue-100/70">{event.description}</p>
          )}
        </div>

        {/* Contagem decrescente + ações */}
        <div className="flex flex-col gap-4 lg:w-72">
          {countdown?.started ? (
            <div className="rounded-2xl bg-emerald-400 px-4 py-3 text-center font-extrabold text-emerald-950">
              Está a acontecer agora!
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2" aria-label="Tempo até ao evento">
              {(units ?? [{ label: "dias" }, { label: "horas" }, { label: "min" }, { label: "seg" }]).map((u) => (
                <div key={u.label} className="rounded-2xl bg-white/[0.08] py-2.5 text-center ring-1 ring-inset ring-white/10">
                  <div className={`${D} text-2xl font-extrabold tabular-nums leading-none`}>
                    {"value" in u ? String(u.value).padStart(2, "0") : "--"}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-blue-200/60">{u.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Link
              href="/login?mode=signup"
              className="group flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-extrabold text-blue-950 shadow-[0_12px_28px_-12px_rgba(250,204,21,.8)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300"
            >
              Quero participar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/contacts"
              className="flex items-center justify-center rounded-2xl px-3.5 text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10"
              aria-label="Contactos do clube"
              title="Saber mais: contactos do clube"
            >
              <Phone className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
