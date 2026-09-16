import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import { getMetaGraphApiClient, withAuth } from "./MetaGraphApiClient";
import UploadMetaTemplateSampleService from "./UploadMetaTemplateSampleService";
import {
  PLACEHOLDER_EXAMPLES,
  TEMPLATE_BODY_LIMIT,
  TEMPLATE_CATEGORY,
  TEMPLATE_LANGUAGE,
  TemplatePlaceholder
} from "./MetaTemplateFormat";

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  language: string;
  components?: {
    type: string;
    format?: string;
    text?: string;
  }[];
  rejected_reason?: string;
}

export interface TemplateSample {
  content: Buffer;
  filename: string;
  mimetype: string;
}

const requireWaba = (whatsapp: Whatsapp): void => {
  if (!whatsapp.metaWabaId || !whatsapp.metaAccessToken) {
    throw new AppError("ERR_META_CONNECTION_NOT_CONFIGURED");
  }
};

export const listMetaTemplates = async (
  whatsapp: Whatsapp
): Promise<MetaTemplate[]> => {
  requireWaba(whatsapp);

  const { data } = await getMetaGraphApiClient().get(
    `/${whatsapp.metaWabaId}/message_templates`,
    {
      ...withAuth(whatsapp.metaAccessToken),
      params: {
        limit: 200,
        fields: "id,name,status,language,components,rejected_reason"
      }
    }
  );

  return (data?.data as MetaTemplate[]) || [];
};

// A tela de cobranca precisa do status de cada etapa, mas nao pode quebrar se
// a Graph API estiver fora - sem isso a pagina inteira deixaria de abrir.
export const listMetaTemplatesSafe = async (
  whatsapp: Whatsapp
): Promise<MetaTemplate[] | null> => {
  try {
    return await listMetaTemplates(whatsapp);
  } catch (error) {
    logger.warn(
      { error, whatsappId: whatsapp.id },
      "Could not list Meta templates"
    );
    return null;
  }
};

export const bodyOfTemplate = (template: MetaTemplate): string =>
  template.components?.find(component => component.type === "BODY")?.text || "";

export const hasDocumentHeader = (template: MetaTemplate): boolean =>
  !!template.components?.find(
    component => component.type === "HEADER" && component.format === "DOCUMENT"
  );

interface SubmitRequest {
  whatsapp: Whatsapp;
  name: string;
  body: string;
  variables: TemplatePlaceholder[];
  sample?: TemplateSample;
  existing?: MetaTemplate;
}

// Cria o template na WABA ou edita o que ja existe. A Meta nao deixa trocar
// nome, idioma nem categoria numa edicao, so os componentes - e qualquer
// edicao devolve o template para aprovacao (PENDING).
export const submitMetaTemplate = async ({
  whatsapp,
  name,
  body,
  variables,
  sample,
  existing
}: SubmitRequest): Promise<{ id: string; status: string }> => {
  requireWaba(whatsapp);

  if (body.length > TEMPLATE_BODY_LIMIT) {
    throw new AppError("ERR_META_TEMPLATE_BODY_TOO_LONG", 400);
  }

  const components: Record<string, unknown>[] = [];

  if (sample) {
    components.push({
      type: "HEADER",
      format: "DOCUMENT",
      example: {
        header_handle: [
          await UploadMetaTemplateSampleService(
            sample.content,
            sample.filename,
            sample.mimetype
          )
        ]
      }
    });
  }

  components.push({
    type: "BODY",
    text: body,
    ...(variables.length
      ? {
          example: {
            body_text: [variables.map(key => PLACEHOLDER_EXAMPLES[key])]
          }
        }
      : {})
  });

  const { data } = await getMetaGraphApiClient().post(
    existing ? `/${existing.id}` : `/${whatsapp.metaWabaId}/message_templates`,
    existing
      ? { components }
      : {
          name,
          language: TEMPLATE_LANGUAGE,
          category: TEMPLATE_CATEGORY,
          components
        },
    withAuth(whatsapp.metaAccessToken)
  );

  return {
    id: (data?.id as string) || existing?.id || "",
    // Uma edicao devolve apenas success; o status real volta como PENDING.
    status: (data?.status as string) || "PENDING"
  };
};
