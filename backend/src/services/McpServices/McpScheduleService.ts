import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import Schedule from "../../models/Schedule";
import CreateService, {
  SchedulePayload
} from "../ScheduleServices/CreateService";
import PreviewService from "../ScheduleServices/PreviewService";
import ShowService from "../ScheduleServices/ShowService";
import UpdateService from "../ScheduleServices/UpdateService";
import { validateTimezone } from "../ScheduleServices/recurrence";
import { AudienceMode, ScheduleKind } from "../ScheduleServices/audience";
import { McpAuthContext } from "./OAuthService";
import { getTenantTimezone } from "./tenantTimezone";

// Limites da camada MCP. bodyMinLength é o mesmo 5 que o CreateService já
// exige: fica aqui só para ser publicado no contexto do modelo, a validação
// continua sendo a do domínio para não existirem dois mínimos.
export const SCHEDULE_LIMITS = {
  bodyMinLength: 5,
  bodyMaxLength: 5000,
  maxSelectedContacts: 100
};

export type ScheduleToolInput = {
  kind: ScheduleKind;
  body: string;
  audience_mode: AudienceMode;
  contact_ids?: number[];
  send_at?: string;
  send_time?: string;
  timezone?: string;
  commemorative_date_id?: number;
};

export type UpdateScheduleToolInput = {
  schedule_id: number;
  body?: string;
  audience_mode?: AudienceMode;
  contact_ids?: number[];
  send_at?: string;
  send_time?: string;
  timezone?: string;
};

type ScheduleView = {
  id: number;
  kind: ScheduleKind;
  status: string;
  active: boolean;
  audienceMode: AudienceMode;
  body: string;
  sendAt: string | null;
  sendTime: string | null;
  timezone: string;
  nextRunAt: string | null;
  totalRecipients: number;
  commemorativeDate: { id: number; name: string } | null;
  contacts: Array<{ id: number; name: string; number: string }>;
  createdAt: Date;
  updatedAt: Date;
};

const isoOrNull = (value?: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

// A view é explícita de propósito: mediaPath, mediaName e mediaType existem no
// registro mas ficam fora daqui. Devolvê-los entregaria ao modelo referências
// de arquivos do servidor, e ele não tem como criar mídia nenhuma.
const toView = (record: Schedule): ScheduleView => ({
  id: record.id,
  kind: record.kind,
  status: record.status,
  active: record.active,
  audienceMode: record.audienceMode,
  body: record.body,
  sendAt: isoOrNull(record.sendAt),
  sendTime: record.sendTime || null,
  timezone: record.timezone,
  nextRunAt: isoOrNull(record.nextRunAt),
  totalRecipients: record.totalRecipients,
  commemorativeDate: record.commemorativeDate
    ? { id: record.commemorativeDate.id, name: record.commemorativeDate.name }
    : null,
  contacts: (record.audienceContacts || [])
    .map(item => item.contact)
    .filter(Boolean)
    .map(contact => ({
      id: contact.id,
      name: contact.name,
      number: contact.number
    })),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

// O mínimo de 5 caracteres e as variáveis Mustache continuam sendo checados
// pelo domínio; aqui só entra o teto que protege o payload da tool.
const normalizeBody = (body: string): string => {
  const value = (body || "").trim();
  if (value.length > SCHEDULE_LIMITS.bodyMaxLength) {
    throw new AppError("ERR_SCHEDULE_MESSAGE_TOO_LONG", 400);
  }
  return value;
};

// Um payload com centenas de IDs viria de alucinação, não de um pedido real.
// A conferência de tenant não é feita aqui: resolveAudience já rejeita IDs de
// outra empresa comparando a contagem encontrada com a pedida.
const normalizeContactIds = (ids?: number[]): number[] | undefined => {
  if (ids === undefined) return undefined;
  const unique = Array.from(new Set(ids.map(Number).filter(Boolean)));
  if (unique.length > SCHEDULE_LIMITS.maxSelectedContacts) {
    throw new AppError("ERR_SCHEDULE_TOO_MANY_RECIPIENTS", 400);
  }
  return unique;
};

const resolveTimezone = (
  companyId: number,
  timezone?: string
): Promise<string> =>
  timezone
    ? Promise.resolve(validateTimezone(timezone))
    : getTenantTimezone(companyId);

// A sala do socket é o próprio tenant: o evento carrega o texto e os
// destinatários do agendamento, então um emit global vazaria isso para
// qualquer cliente que escutasse o nome do evento.
const emit = (
  companyId: number,
  action: "create" | "update",
  schedule: Schedule
): void => {
  try {
    getIO()
      .to(`company-${companyId}-mainchannel`)
      .emit(`company-${companyId}-schedule`, { action, schedule });
  } catch {
    // O socket não é o canal de verdade da operação: o agendamento já está
    // gravado e a tela recarrega a lista. Falhar aqui desfaria uma escrita boa.
  }
};

const toPayload = (
  auth: McpAuthContext,
  input: ScheduleToolInput,
  timezone: string
): SchedulePayload => ({
  body: normalizeBody(input.body),
  kind: input.kind,
  audienceMode: input.audience_mode,
  contactIds: normalizeContactIds(input.contact_ids),
  sendAt: input.send_at,
  sendTime: input.send_time,
  commemorativeDateId: input.commemorative_date_id,
  timezone,
  // companyId e userId vêm sempre do token verificado, nunca do argumento da
  // ferramenta: é o que impede o modelo de escrever em outro tenant ou de
  // registrar o agendamento no nome de outro usuário.
  companyId: auth.companyId,
  userId: auth.userId
});

export const previewSchedule = async (
  auth: McpAuthContext,
  input: ScheduleToolInput
) => {
  const timezone = await resolveTimezone(auth.companyId, input.timezone);
  const preview = await PreviewService(toPayload(auth, input, timezone));

  return {
    preview: {
      eligibleCount: preview.eligibleCount,
      excludedCount: preview.excludedCount,
      missingVariables: preview.missingVariables,
      estimatedDurationSeconds: preview.estimatedDurationSeconds,
      nextRunAt: preview.nextRunAt.toISOString(),
      timezone,
      // Informativo, não impeditivo: o domínio aceita data passada e a tela
      // também, então rejeitar aqui faria o ChatGPT divergir do sistema. O
      // modelo usa isso para avisar o usuário antes de confirmar a criação.
      isInPast: preview.nextRunAt.getTime() < Date.now(),
      sampleRenderedMessage: preview.renderedMessage
    },
    persisted: false,
    coverage: { returnedRecords: 0 }
  };
};

export const createSchedule = async (
  auth: McpAuthContext,
  input: ScheduleToolInput
) => {
  const timezone = await resolveTimezone(auth.companyId, input.timezone);
  const created = await CreateService(toPayload(auth, input, timezone));
  // O CreateService recarrega sem os contatos da audiência; reler pelo
  // ShowService dá a mesma forma de registro que o update devolve.
  const schedule = await ShowService(created.id, auth.companyId);

  emit(auth.companyId, "create", schedule);

  return { schedule: toView(schedule), coverage: { returnedRecords: 1 } };
};

export const updateSchedule = async (
  auth: McpAuthContext,
  input: UpdateScheduleToolInput
) => {
  // ShowService busca por id + companyId: agendamento de outra empresa não é
  // encontrado, então nem chega ao UpdateService.
  const current = await ShowService(input.schedule_id, auth.companyId);
  const changed = [
    input.body,
    input.audience_mode,
    input.contact_ids,
    input.send_at,
    input.send_time,
    input.timezone
  ].some(value => value !== undefined);
  if (!changed) {
    throw new AppError("ERR_SCHEDULE_NOTHING_TO_UPDATE", 400);
  }
  if (input.send_at !== undefined && current.kind !== "ONCE") {
    throw new AppError("ERR_SCHEDULE_FIELD_NOT_APPLICABLE", 400);
  }
  if (input.send_time !== undefined && current.kind === "ONCE") {
    throw new AppError("ERR_SCHEDULE_FIELD_NOT_APPLICABLE", 400);
  }

  const timezone = input.timezone
    ? validateTimezone(input.timezone)
    : current.timezone;
  const scheduleData: Partial<SchedulePayload> = {
    timezone,
    ...(input.body !== undefined ? { body: normalizeBody(input.body) } : {}),
    ...(input.audience_mode !== undefined
      ? { audienceMode: input.audience_mode }
      : {}),
    ...(input.contact_ids !== undefined
      ? { contactIds: normalizeContactIds(input.contact_ids) }
      : {}),
    ...(input.send_time !== undefined ? { sendTime: input.send_time } : {}),
    // O sendAt gravado volta como Date e parseOneTimeSchedule só entende ISO:
    // sem reenviar o instante atual em ISO, alterar apenas o texto de um
    // agendamento ONCE cairia em ERR_SCHEDULE_INVALID_DATE.
    ...(current.kind === "ONCE"
      ? {
          sendAt:
            input.send_at ??
            isoOrNull(current.sendAt || current.nextRunAt) ??
            undefined
        }
      : {})
  };

  const schedule = await UpdateService({
    scheduleData,
    id: current.id,
    companyId: auth.companyId
  });

  emit(auth.companyId, "update", schedule);

  return { schedule: toView(schedule), coverage: { returnedRecords: 1 } };
};
