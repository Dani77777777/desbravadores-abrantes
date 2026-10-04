// Validação dos packs com zod — corre nos testes, para um pack mal formatado
// falhar no CI e não em produção.

import { z } from 'zod'

export const CartaSchema = z.object({
  id: z.string().regex(/^[a-z]{3}-\d{2,3}$/, 'id no formato "abr-01"'),
  afirmacao: z.string().trim().min(10).max(180),
  verdade: z.boolean(),
  explicacao: z.string().trim().min(10).max(300),
  citacao: z.string().trim().min(1).optional(),
  referencia: z.string().trim().min(1).optional(),
  minuto: z.string().regex(/^\d{1,2}:\d{2}:\d{2}$/, 'minuto no formato "h:mm:ss"').optional(),
  dificuldade: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export const PackSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  cidade: z.string().min(1),
  titulo: z.string().min(1),
  orador: z.string().min(1),
  fraseChave: z.string(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  disponivel: z.boolean(),
  cartas: z.array(CartaSchema),
})
