import { createHash } from "crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import {
  Bill,
  SgaRow,
  normalizeBill,
  text,
  normalizedText,
  money
} from "../SgaServices/normalize";
import AppError from "../../errors/AppError";
import { TemplatePlaceholder } from "../MetaWhatsAppServices/MetaTemplateFormat";

export const OFFSETS = [-5, -3, -1, 0, 1, 3, 5, 25, 30, 90] as const;
const footer =
  "Esta é uma mensagem preventiva para ajudar você a manter seu cadastro regular e os benefícios\nativos. Caso precise da segunda via do boleto, estamos à disposição.";
const signature = "Setor de Adimplência | AC Norte Proteção Veicular";
const introductions: Record<(typeof OFFSETS)[number], string> = {
  [-5]: "Passando para lembrar que a mensalidade vencerá em 5 dias.",
  [-3]: "Passando para lembrar que a mensalidade vencerá em 3 dias.",
  [-1]: "Passando para lembrar que a mensalidade vencerá amanhã.",
  0: "Passando para lembrar que a mensalidade vencerá hoje.",
  1: "Passando para lembrar que a mensalidade venceu ontem e você está sem proteção, fale conosco para regularizar.",
  3: "Passando para lembrar que a mensalidade está em aberto e você está sem proteção, fale conosco para regularizar.",
  5: "Passando para lembrar que a mensalidade está em aberto e você está sem proteção, fale conosco para regularizar.",
  25: "Passando para lembrar que a mensalidade continua em aberto. Em 5 dias seu contrato será inativado e a mensalidade continuará em aberto e poderá ir para o SPC e SERASA. Fale conosco para regularizar.",
  30: "Passando para lembrar que, a partir desse momento, seu contrato foi inativado e a mensalidade continua em aberto. Para regularizar, entre em contato. Não havendo regularização da mensalidade em aberto em até 60 dias, o boleto será protestado no SPC/SERASA.",
  90: "Passando para lembrar que o último boleto ainda continua em aberto. Em 24h, não havendo a regularização, o mesmo será protestado no SPC/SERASA."
};
export const DEFAULT_STEPS = OFFSETS.map(offset => ({
  offset,
  enabled: true,
  attachPdf: offset <= 0,
  body: [
    `Olá, [nome]. Tudo bem?`,
    introductions[offset],
    ...(offset <= 25 ? [footer] : []),
    signature
  ].join("\n")
}));
export const configSchema = z
  .object({
    enabled: z.boolean(),
    whatsappId: z.number().int().positive().nullable(),
    timezone: z.literal("America/Rio_Branco"),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    dailyLimit: z.number().int().min(1).max(500),
    termsReviewed: z.boolean(),
    excludedContactIds: z.array(z.number().int().positive()).max(10000),
    steps: z
      .array(
        z
          .object({
            offset: z.number().int(),
            enabled: z.boolean(),
            attachPdf: z.boolean(),
            body: z.string().trim().min(10).max(3000)
          })
          .strict()
      )
      .length(10)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startHour >= value.endHour ||
      value.dailyLimit > (value.endHour - value.startHour) * 60 ||
      new Set(value.weekdays).size !== value.weekdays.length ||
      value.steps.some(
        (step, i) =>
          step.offset !== OFFSETS[i] ||
          step.attachPdf !== step.offset <= 0 ||
          /\[(?!nome\]|valor\]|vencimento\]|boleto\])[^\]]+\]/i.test(step.body)
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid billing configuration"
      });
    if (
      value.enabled &&
      (!value.whatsappId ||
        (value.steps.some(s => s.enabled && s.offset > 0) &&
          !value.termsReviewed))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review terms and select connection"
      });
  });
export type BillingConfig = z.infer<typeof configSchema>;
export type BillingStep = BillingConfig["steps"][number];
export const defaults = (): BillingConfig => ({
  enabled: false,
  whatsappId: null,
  timezone: "America/Rio_Branco",
  startHour: 9,
  endHour: 17,
  weekdays: [1, 2, 3, 4, 5],
  dailyLimit: 100,
  termsReviewed: false,
  excludedContactIds: [],
  steps: DEFAULT_STEPS.map(s => ({ ...s }))
});
export const parseConfig = (input: unknown): BillingConfig => {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) throw new AppError("ERR_BILLING_CONFIG", 400);
  return parsed.data;
};
export const parseStoredConfig = (input: unknown): BillingConfig => {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError("ERR_BILLING_CONFIG", 400);
  const raw = input as Partial<BillingConfig> & {
    steps?: Array<Partial<BillingStep> & { offset?: number }>;
  };
  const byOffset = new Map(
    Array.isArray(raw.steps)
      ? raw.steps.map(step => [Number(step.offset), step])
      : []
  );
  return parseConfig({
    ...raw,
    steps: DEFAULT_STEPS.map(step => ({
      ...step,
      ...(byOffset.get(step.offset) || {})
    }))
  });
};

export type PlannedBillingDispatch = {
  key: string;
  scheduledAt: Date;
};

const hashUnit = (value: string): number =>
  Number.parseInt(
    createHash("sha256").update(value).digest("hex").slice(0, 12),
    16
  ) / 0xffffffffffff;

export const planBillingDispatches = (
  keys: string[],
  config: BillingConfig,
  day: string
): PlannedBillingDispatch[] => {
  const start = DateTime.fromISO(
    `${day}T${String(config.startHour).padStart(2, "0")}:00:00`,
    {
      zone: config.timezone
    }
  );
  const end = DateTime.fromISO(
    `${day}T${String(config.endHour).padStart(2, "0")}:00:00`,
    {
      zone: config.timezone
    }
  );
  if (!start.isValid || !end.isValid || end <= start) return [];
  const selected = [...new Set(keys)]
    .sort((a, b) => {
      const order =
        hashUnit(`${day}:order:${a}`) - hashUnit(`${day}:order:${b}`);
      return order || a.localeCompare(b);
    })
    .slice(0, config.dailyLimit);
  if (!selected.length) return [];
  const windowSeconds = end.diff(start, "seconds").seconds;
  const spacing = windowSeconds / selected.length;
  const minimumGap = Math.min(90, Math.max(30, spacing * 0.6));
  const jitter = Math.max(0, (spacing - minimumGap) / 2);
  return selected.map((key, index) => {
    const displacement = (hashUnit(`${day}:time:${key}`) * 2 - 1) * jitter;
    const seconds = Math.max(
      0,
      Math.min(windowSeconds - 1, (index + 0.5) * spacing + displacement)
    );
    return { key, scheduledAt: start.plus({ seconds }).toJSDate() };
  });
};
export const localDay = (now = new Date()): string =>
  DateTime.fromJSDate(now, { zone: "America/Rio_Branco" }).toISODate();
export const stageFor = (bill: Bill, day: string): number | null => {
  const due = DateTime.fromISO(bill.due, { zone: "America/Rio_Branco" });
  const current = DateTime.fromISO(day, { zone: "America/Rio_Branco" });
  if (
    !bill.number ||
    bill.paid ||
    !bill.countsAsDebt ||
    bill.amount <= 0 ||
    !due.isValid ||
    due.toISODate() !== bill.due ||
    !current.isValid
  )
    return null;
  const days = Math.round(current.diff(due, "days").days);
  return OFFSETS.includes(days as (typeof OFFSETS)[number]) ? days : null;
};
export const inWindow = (config: BillingConfig, now = new Date()): boolean => {
  const dt = DateTime.fromJSDate(now, { zone: config.timezone });
  return (
    config.enabled &&
    config.weekdays.includes(dt.weekday) &&
    dt.hour >= config.startHour &&
    dt.hour < config.endHour
  );
};
export const freshSnapshot = (
  stored: { status: string; syncedAt: Date | string | null },
  now = new Date()
): boolean => {
  const age = now.getTime() - new Date(stored.syncedAt || 0).getTime();
  return stored.status === "ready" && age >= 0 && age < 90 * 60000;
};
// Os mesmos valores servem para o texto livre (Baileys) e para os parametros
// do template (Cloud API oficial), que sao posicionais - por isso ficam numa
// funcao unica em vez de repetidos nos dois caminhos.
export const reminderValues = (
  name: string,
  bill: Pick<Bill, "due" | "amount">,
  url: string
): Record<TemplatePlaceholder, string> => ({
  nome: name.trim() || "associado",
  valor: new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(bill.amount),
  vencimento: DateTime.fromISO(bill.due).toFormat("dd/MM/yyyy"),
  boleto: url
});
export const renderReminder = (
  step: BillingStep,
  name: string,
  bill: Pick<Bill, "due" | "amount">,
  url: string
): string => {
  const values = reminderValues(name, bill, url);
  const body = step.body.replace(
    /\[(nome|valor|vencimento|boleto)\]/g,
    (_, key) => values[key as TemplatePlaceholder]
  );
  return body;
};
// Only known, unpaid SGA debt statuses may reach the transport. An unavailable
// API, missing status, cancellation or different owner is never proof of debt.
export const revalidateBill = (
  original: Bill,
  row: SgaRow,
  statuses: SgaRow[],
  day: string
): Bill | null => {
  if (
    text(row.codigo_associado) !== original.memberId ||
    text(row.nosso_numero) !== original.number ||
    text(row.codigo_boleto) !== original.id
  )
    return null;
  const status = statuses.find(
    s => text(s.codigo_situacaoboleto) === text(row.codigo_situacao_boleto)
  );
  if (
    !status ||
    !["Y", "S", "SIM"].includes(
      text(status.considerado_inadimplencia).toUpperCase()
    ) ||
    normalizedText(status.pago) !== "nao"
  )
    return null;
  const bill = normalizeBill(row, true);
  if (
    bill.paid ||
    money(row.valor_pagamento) > 0 ||
    ["S", "SIM", "Y"].includes(text(row.parcela_paga).toUpperCase())
  )
    return null;
  return stageFor(bill, day) === stageFor(original, day) &&
    bill.due === original.due &&
    stageFor(bill, day) !== null
    ? bill
    : null;
};
