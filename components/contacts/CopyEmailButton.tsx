"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success("Email copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o email.");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-3.5 font-bold text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/25"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado!" : "Copiar"}
    </button>
  );
}
