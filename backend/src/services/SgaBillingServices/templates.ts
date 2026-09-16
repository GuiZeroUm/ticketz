import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import {
  TEMPLATE_LANGUAGE,
  templateNameForOffset,
  toTemplateBody
} from "../MetaWhatsAppServices/MetaTemplateFormat";
import {
  MetaTemplate,
  bodyOfTemplate,
  hasDocumentHeader,
  listMetaTemplates,
  listMetaTemplatesSafe,
  submitMetaTemplate
} from "../MetaWhatsAppServices/MetaTemplateRegistryService";
import { BillingConfig, BillingStep } from "./policy";
import { BOLETO_FILENAME, testPdf } from "./transport";

export interface BillingTemplateState {
  offset: number;
  name: string;
  // APPROVED, PENDING, REJECTED, PAUSED (da Meta) ou ABSENT (nunca enviado).
  status: string;
  rejectedReason: string | null;
  // Texto do painel divergiu do que foi aprovado: o envio usaria o texto
  // antigo ate reenviar para aprovacao.
  outdated: boolean;
  error?: string;
}

const findTemplate = (
  templates: MetaTemplate[],
  name: string
): MetaTemplate | undefined =>
  templates.find(
    template => template.name === name && template.language === TEMPLATE_LANGUAGE
  );

const matches = (template: MetaTemplate, step: BillingStep): boolean => {
  const { text } = toTemplateBody(step.body);
  return (
    bodyOfTemplate(template).trim() === text.trim() &&
    hasDocumentHeader(template) === step.attachPdf
  );
};

const stateOf = (
  step: BillingStep,
  templates: MetaTemplate[]
): BillingTemplateState => {
  const name = templateNameForOffset(step.offset);
  const template = findTemplate(templates, name);

  return {
    offset: step.offset,
    name,
    status: template?.status || "ABSENT",
    rejectedReason: template?.rejected_reason || null,
    outdated: !!template && !matches(template, step)
  };
};

// Estado de aprovacao de cada etapa, para a tela de cobrancas. Devolve null
// quando a Graph API nao responde: a pagina continua abrindo, so sem status.
export const billingTemplateStates = async (
  whatsapp: Whatsapp,
  config: BillingConfig
): Promise<BillingTemplateState[] | null> => {
  const templates = await listMetaTemplatesSafe(whatsapp);
  if (!templates) return null;

  return config.steps.map(step => stateOf(step, templates));
};

// Uma etapa so pode enviar quando o template aprovado corresponde ao texto
// salvo: template aprovado com texto antigo enviaria a mensagem errada, e sem
// aprovacao a Meta recusa o envio.
export const approvedBillingTemplate = async (
  whatsapp: Whatsapp,
  step: BillingStep
): Promise<boolean> => {
  const templates = await listMetaTemplatesSafe(whatsapp);
  if (!templates) return false;

  const template = findTemplate(templates, templateNameForOffset(step.offset));

  return !!template && template.status === "APPROVED" && matches(template, step);
};

// Envia para aprovacao as etapas ativas cujo texto ainda nao existe na Meta
// ou ficou diferente do aprovado. Nunca lanca: salvar a configuracao nao pode
// depender da Graph API estar de pe.
export const submitBillingTemplates = async (
  whatsapp: Whatsapp,
  config: BillingConfig
): Promise<BillingTemplateState[] | null> => {
  let templates: MetaTemplate[];

  try {
    templates = await listMetaTemplates(whatsapp);
  } catch (error) {
    logger.warn(
      { error, whatsappId: whatsapp.id },
      "Could not list Meta templates before submitting billing templates"
    );
    return null;
  }

  const states: BillingTemplateState[] = [];

  for (const step of config.steps) {
    const name = templateNameForOffset(step.offset);
    const existing = findTemplate(templates, name);
    const current = stateOf(step, templates);

    const needsSubmit =
      step.enabled &&
      (!existing || current.outdated || existing.status === "REJECTED");

    if (!needsSubmit) {
      states.push(current);
      continue;
    }

    const { text, variables } = toTemplateBody(step.body);

    try {
      // eslint-disable-next-line no-await-in-loop
      const submitted = await submitMetaTemplate({
        whatsapp,
        name,
        body: text,
        variables,
        sample: step.attachPdf
          ? {
              content: testPdf(),
              filename: BOLETO_FILENAME,
              mimetype: "application/pdf"
            }
          : undefined,
        existing
      });
      states.push({
        ...current,
        status: submitted.status,
        rejectedReason: null,
        outdated: false
      });
    } catch (error) {
      // Edicao de template em aprovacao, corpo acima de 1024 caracteres ou
      // recusa da Meta: a etapa fica visivel com o motivo, sem travar o save.
      logger.warn(
        { error, whatsappId: whatsapp.id, name },
        "Could not submit Meta billing template"
      );
      states.push({
        ...current,
        error: error instanceof Error ? error.message : "ERR_META_TEMPLATE"
      });
    }
  }

  return states;
};
