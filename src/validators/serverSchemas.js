import { z } from 'zod';

const KANBAN_STATUS_LIST = [
  'pendente',
  'exportando',
  'fila_impressao',
  'sublimando',
  'na_costura'
];

export const KANBAN_STATUS_VALUES = new Set(KANBAN_STATUS_LIST);
const FICHA_STATUS_LIST = ['pendente', 'entregue'];

function isValidISODate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;

  const [yearStr, monthStr, dayStr] = raw.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && (date.getMonth() + 1) === month && date.getDate() === day;
}

function toTrimmedStringOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function toDateOnlyOrUndefined(value) {
  const text = toTrimmedStringOrUndefined(value);
  return text || undefined;
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function zodIssueDetails(error) {
  return error.issues.map(issue => ({
    path: issue.path.join('.') || 'root',
    message: issue.message
  }));
}

export function parseWithZod(res, schema, payload, errorMessage = 'Dados inválidos') {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: errorMessage,
    details: zodIssueDetails(parsed.error)
  });
  return null;
}

const optionalTextSchema = z.preprocess(
  toTrimmedStringOrUndefined,
  z.string().optional()
);

const requiredTextSchema = z.preprocess(
  value => {
    const text = toTrimmedStringOrUndefined(value);
    return text ?? '';
  },
  z.string().min(1, 'Campo obrigatório')
);

const optionalIsoDateSchema = z.preprocess(
  toDateOnlyOrUndefined,
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
    .refine(isValidISODate, 'Data inválida')
    .optional()
);

const requiredIsoDateSchema = z.preprocess(
  value => {
    const text = toDateOnlyOrUndefined(value);
    return text ?? '';
  },
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
    .refine(isValidISODate, 'Data inválida')
);

export const positiveIdParamSchema = z.object({
  id: z.preprocess(parsePositiveInt, z.number().int().positive())
});

export const fichaQuerySchema = z.object({
  status: z.preprocess(
    toTrimmedStringOrUndefined,
    z.enum(FICHA_STATUS_LIST).optional()
  ),
  cliente: optionalTextSchema,
  vendedor: optionalTextSchema,
  dataInicio: optionalIsoDateSchema,
  dataFim: optionalIsoDateSchema
}).superRefine((data, ctx) => {
  if (data.dataInicio && data.dataFim && data.dataInicio > data.dataFim) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFim'],
      message: 'dataFim deve ser maior ou igual a dataInicio'
    });
  }
});

export const fichaBodySchema = z.object({
  cliente: requiredTextSchema,
  vendedor: optionalTextSchema,
  dataInicio: optionalIsoDateSchema,
  numeroVenda: optionalTextSchema,
  dataEntrega: requiredIsoDateSchema,
  evento: z.preprocess(
    toTrimmedStringOrUndefined,
    z.enum(['sim', 'nao']).optional()
  ),
  status: z.preprocess(
    toTrimmedStringOrUndefined,
    z.enum(FICHA_STATUS_LIST).optional()
  ),
  material: optionalTextSchema,
  composicao: optionalTextSchema,
  corMaterial: optionalTextSchema,
  manga: optionalTextSchema,
  acabamentoManga: optionalTextSchema,
  larguraManga: optionalTextSchema,
  corAcabamentoManga: optionalTextSchema,
  gola: optionalTextSchema,
  corGola: optionalTextSchema,
  acabamentoGola: optionalTextSchema,
  larguraGola: optionalTextSchema,
  corPeitilhoInterno: optionalTextSchema,
  corPeitilhoExterno: optionalTextSchema,
  corPeDeGolaInterno: optionalTextSchema,
  corPeDeGolaExterno: optionalTextSchema,
  corBotao: optionalTextSchema,
  aberturaLateral: optionalTextSchema,
  corAberturaLateral: optionalTextSchema,
  reforcoGola: optionalTextSchema,
  corReforco: optionalTextSchema,
  bolso: optionalTextSchema,
  filete: optionalTextSchema,
  fileteLocal: optionalTextSchema,
  fileteCor: optionalTextSchema,
  faixa: optionalTextSchema,
  faixaLocal: optionalTextSchema,
  faixaCor: optionalTextSchema,
  arte: optionalTextSchema,
  observacoes: optionalTextSchema,
  imagemData: optionalTextSchema,
  imagensData: optionalTextSchema,
  produtos: z.array(z.record(z.any())).optional(),
  comNomes: z.union([z.boolean(), z.number().int().min(0).max(3), z.string()]).optional(),
  com_nomes: z.union([z.boolean(), z.number().int().min(0).max(3), z.string()]).optional()
}).passthrough();

export const kanbanStatusBodySchema = z.object({
  status: optionalTextSchema,
  kanbanStatus: optionalTextSchema
}).refine(data => {
  const value = String(data.status ?? data.kanbanStatus ?? '').trim().toLowerCase();
  return KANBAN_STATUS_VALUES.has(value);
}, {
  message: 'Status de kanban inválido. Use: pendente, exportando, fila_impressao, sublimando, na_costura.'
});

export const kanbanOrderBodySchema = z.object({
  status: z.preprocess(
    value => {
      const text = toTrimmedStringOrUndefined(value);
      return text ? text.toLowerCase() : undefined;
    },
    z.enum(KANBAN_STATUS_LIST)
  ),
  orderedIds: z.array(z.preprocess(parsePositiveInt, z.number().int().positive())).default([])
});

export const clientesQuerySchema = z.object({
  termo: optionalTextSchema
});

export const clienteUpdateBodySchema = z.object({
  nome: optionalTextSchema,
  primeiro_pedido: z.preprocess(
    value => {
      if (value === null) return null;
      return toDateOnlyOrUndefined(value);
    },
    z.union([
      z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
        .refine(isValidISODate, 'Data inválida'),
      z.null(),
      z.undefined()
    ])
  ),
  ultimo_pedido: z.preprocess(
    value => {
      if (value === null) return null;
      return toDateOnlyOrUndefined(value);
    },
    z.union([
      z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
        .refine(isValidISODate, 'Data inválida'),
      z.null(),
      z.undefined()
    ])
  )
}).passthrough();

export const cloudinarySignatureBodySchema = z.record(z.any()).default({});

export const cloudinaryDeleteParamsSchema = z.object({
  publicId: requiredTextSchema
});

export const cloudinaryDeleteQuerySchema = z.object({
  excludeFichaId: z.preprocess(parsePositiveInt, z.number().int().positive().optional())
});

export const relatorioPeriodoQuerySchema = z.object({
  periodo: z.preprocess(
    value => {
      const text = toTrimmedStringOrUndefined(value);
      return text ? text.toLowerCase() : undefined;
    },
    z.enum(['mes', 'ano', 'customizado', 'geral']).optional()
  ),
  dataInicio: optionalIsoDateSchema,
  dataFim: optionalIsoDateSchema
}).superRefine((data, ctx) => {
  const hasInicio = Boolean(data.dataInicio);
  const hasFim = Boolean(data.dataFim);

  if ((hasInicio && !hasFim) || (!hasInicio && hasFim)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFim'],
      message: 'Informe dataInicio e dataFim juntos'
    });
  }

  if (data.periodo === 'customizado' && (!hasInicio || !hasFim)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodo'],
      message: 'Período customizado exige dataInicio e dataFim'
    });
  }

  if (hasInicio && hasFim && data.dataInicio > data.dataFim) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFim'],
      message: 'dataFim deve ser maior ou igual a dataInicio'
    });
  }
});
