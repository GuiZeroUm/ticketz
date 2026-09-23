import * as Yup from "yup";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import ProspeccaoAutomation from "../../models/ProspeccaoAutomation";
import ProspeccaoExecution from "../../models/ProspeccaoExecution";
import ProspeccaoLead from "../../models/ProspeccaoLead";
import ProspeccaoSchedule from "../../models/ProspeccaoSchedule";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { resolveLocation } from "./LocalidadesService";

export interface ScheduleInput {
  time: string;
  nicho: string;
  countryCode: string;
  stateCode?: string;
  cityName?: string;
  maxResults: number;
  product: string;
  tone: "curta" | "media" | "longa";
  onlyWhatsapp: boolean;
}

export interface AutomationInput {
  whatsappId: number;
  userId: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  dailyLimit: number;
  acknowledgedRisk: boolean;
  schedules: ScheduleInput[];
}

const schema = Yup.object({
  whatsappId: Yup.number().integer().positive().required(),
  userId: Yup.number().integer().positive().required(),
  minDelaySeconds: Yup.number().integer().min(180).required(),
  maxDelaySeconds: Yup.number().integer().min(180).max(3600).required(),
  dailyLimit: Yup.number().integer().min(1).max(30).required(),
  acknowledgedRisk: Yup.boolean().required(),
  schedules: Yup.array()
    .of(
      Yup.object({
        time: Yup.string()
          .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
          .required(),
        nicho: Yup.string().trim().max(120).required(),
        countryCode: Yup.string().length(2).required(),
        stateCode: Yup.string().max(20).nullable(),
        cityName: Yup.string().max(120).nullable(),
        maxResults: Yup.number().integer().min(1).max(30).required(),
        product: Yup.string().max(60).required(),
        tone: Yup.string().oneOf(["curta", "media", "longa"]).required(),
        onlyWhatsapp: Yup.boolean().required()
      })
    )
    .min(1)
    .required()
});

export const getAutomation = async (companyId: number) => {
  const company = await Company.findByPk(companyId);
  let automation = await ProspeccaoAutomation.findOne({ where: { companyId } });
  if (!automation) {
    automation = await ProspeccaoAutomation.create({
      companyId
    } as ProspeccaoAutomation);
  }
  const schedules = await ProspeccaoSchedule.findAll({
    where: { automationId: automation.id, companyId },
    order: [["time", "ASC"]]
  });
  const executions = await ProspeccaoExecution.findAll({
    where: { companyId },
    order: [["createdAt", "DESC"]],
    limit: 20
  });
  const pending = await ProspeccaoLead.count({
    where: { companyId, deliveryStatus: ["QUEUED", "PAUSED", "SENDING"] }
  });
  return {
    ...automation.toJSON(),
    schedules,
    executions,
    pending,
    timezone: company?.timezone || "America/Rio_Branco"
  };
};

export const saveAutomation = async (
  companyId: number,
  input: AutomationInput
) => {
  try {
    await schema.validate(input, { abortEarly: false });
  } catch (error) {
    throw new AppError((error as Yup.ValidationError).message, 400);
  }
  if (input.maxDelaySeconds < input.minDelaySeconds) {
    throw new AppError("ERR_PROSPECCAO_INTERVALO_INVALIDO", 400);
  }
  const [whatsapp, user] = await Promise.all([
    Whatsapp.findOne({ where: { id: input.whatsappId, companyId } }),
    User.findOne({ where: { id: input.userId, companyId } })
  ]);
  if (!whatsapp || !user)
    throw new AppError("ERR_PROSPECCAO_CONFIG_INVALIDA", 400);

  const resolved = await Promise.all(
    input.schedules.map(async schedule => ({
      ...schedule,
      location: await resolveLocation(schedule)
    }))
  );

  await sequelize.transaction(async transaction => {
    const [automation] = await ProspeccaoAutomation.findOrCreate({
      where: { companyId },
      defaults: { companyId } as ProspeccaoAutomation,
      transaction
    });
    await automation.update(
      {
        whatsappId: input.whatsappId,
        userId: input.userId,
        minDelaySeconds: input.minDelaySeconds,
        maxDelaySeconds: input.maxDelaySeconds,
        dailyLimit: input.dailyLimit,
        acknowledgedRisk: input.acknowledgedRisk
      },
      { transaction }
    );
    await ProspeccaoSchedule.destroy({
      where: { automationId: automation.id, companyId },
      transaction
    });
    await ProspeccaoSchedule.bulkCreate(
      resolved.map(item => ({
        automationId: automation.id,
        companyId,
        time: item.time,
        nicho: item.nicho.trim(),
        countryCode: item.location.country.code,
        countryName: item.location.country.name,
        stateCode: item.location.state?.code,
        stateName: item.location.state?.name,
        cityName: item.location.city,
        maxResults: item.maxResults,
        product: item.product,
        tone: item.tone,
        onlyWhatsapp: item.onlyWhatsapp
      })) as never,
      { transaction }
    );
  });
  return getAutomation(companyId);
};

export const setAutomationEnabled = async (
  companyId: number,
  enabled: boolean
) => {
  const config = await getAutomation(companyId);
  const automation = await ProspeccaoAutomation.findByPk(config.id);
  if (!automation) throw new AppError("ERR_PROSPECCAO_CONFIG_INVALIDA", 400);
  if (enabled) {
    const whatsapp = await Whatsapp.findOne({
      where: { id: automation.whatsappId, companyId }
    });
    if (
      !automation.acknowledgedRisk ||
      !automation.userId ||
      !whatsapp ||
      whatsapp.status !== "CONNECTED" ||
      !config.schedules.length
    ) {
      throw new AppError("ERR_PROSPECCAO_ATIVACAO_INVALIDA", 400);
    }
  }
  await automation.update({ enabled });
  await ProspeccaoLead.update(
    { deliveryStatus: enabled ? "QUEUED" : "PAUSED", scheduledSendAt: null },
    {
      where: {
        companyId,
        deliveryStatus: enabled ? "PAUSED" : "QUEUED"
      }
    }
  );
  return getAutomation(companyId);
};
