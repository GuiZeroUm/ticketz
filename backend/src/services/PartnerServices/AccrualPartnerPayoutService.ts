import { UniqueConstraintError } from "sequelize";
import Invoices from "../../models/Invoices";
import Company from "../../models/Company";
import Partner from "../../models/Partner";
import PartnerPayout from "../../models/PartnerPayout";
import { getPartnerPixFee } from "../PaymentGatewayServices/AbacatePayServices";
import { logger } from "../../utils/logger";

export const round2 = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;

/**
 * Registra a comissão de uma fatura paga.
 *
 * Idempotente por construção: `PartnerPayouts.invoiceId` é único, então um
 * replay do webhook de pagamento não consegue gerar um segundo repasse. Essa
 * é a invariante crítica do módulo — tudo o mais pode ser reprocessado.
 *
 * No-op silencioso quando a empresa não foi vendida por parceiro, quando o
 * parceiro está inativo ou quando a comissão é zero.
 */
const AccrualPartnerPayoutService = async (
  invoice: Invoices
): Promise<PartnerPayout | null> => {
  const company =
    invoice.company || (await Company.findByPk(invoice.companyId));

  if (!company?.partnerId) {
    return null;
  }

  const partner = await Partner.findByPk(company.partnerId);

  if (!partner || !partner.status) {
    return null;
  }

  const commissionPct = Number(partner.commissionPct) || 0;
  if (commissionPct <= 0) {
    return null;
  }

  const baseValue = round2(invoice.value);
  const amount = round2((baseValue * commissionPct) / 100);

  if (amount <= 0) {
    return null;
  }

  // No modo imediato cada repasse é uma transferência, então a tarifa sai do
  // parceiro. No agendado o mês inteiro sai numa transferência só e a tarifa
  // é absorvida pela plataforma.
  const mode = partner.payoutMode === "scheduled" ? "scheduled" : "immediate";
  const feeAmount = mode === "immediate" ? round2(await getPartnerPixFee()) : 0;

  try {
    return await PartnerPayout.create({
      partnerId: partner.id,
      companyId: company.id,
      invoiceId: invoice.id,
      baseValue,
      commissionPct,
      amount,
      feeAmount,
      netAmount: round2(amount - feeAmount),
      mode,
      status: "pending",
      attempts: 0
    } as any);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      logger.debug(
        `[partnerPayouts] comissão da fatura ${invoice.id} já registrada`
      );
      return PartnerPayout.findOne({ where: { invoiceId: invoice.id } });
    }
    throw error;
  }
};

export default AccrualPartnerPayoutService;
