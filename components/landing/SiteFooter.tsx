import Link from "next/link";
import { displayFont } from "./fonts";

/** Rodapé partilhado pelas páginas públicas (landing e contactos). */
export function SiteFooter() {
  return (
    <footer className="bg-blue-950 py-12 text-blue-200/70">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-4 sm:px-6 md:flex-row lg:px-8">
        <div className="flex items-center gap-3">
          <img
            src="/images/Logo Desbravadores.png"
            alt="Logo"
            className="h-10 w-auto shrink-0 drop-shadow-[0_2px_8px_rgba(250,204,21,.25)]"
          />
          <span
            className={`${displayFont.className} text-lg font-extrabold text-white`}
          >
            Desbravadores Abrantes
          </span>
        </div>
        <div className="flex gap-8 text-sm">
          <Link href="/" className="transition-colors hover:text-yellow-300">
            Início
          </Link>
          <Link
            href="/contacts"
            className="transition-colors hover:text-yellow-300"
          >
            Contactos
          </Link>
        </div>
        <div className="text-center text-xs md:text-right">
          © {new Date().getFullYear()} Clube de Desbravadores de Abrantes.
          <br className="md:hidden" />{" "}
          <span className="text-yellow-300/80">Aventura • Amizade • Fé</span>
        </div>
      </div>
    </footer>
  );
}
