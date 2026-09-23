import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { text } from "../SgaServices/normalize";
import { sgaRequest } from "../SgaServices/client";
import { boletoUrl, fetchBoletoPdf } from "./transport";
import { readBillingPdf, storeBillingPdf } from "./documents";

type Delivery = {
  id: string;
  companyId: number;
  contactId: number | null;
  memberId: string;
  billNumber: string;
  documentPath: string | null;
};

const sameConversation = (current: Ticket, source: Ticket): boolean =>
  source.id <= current.id &&
  source.contactId === current.contactId &&
  source.channel === current.channel;

const GetBillingPdfService = async (
  currentTicket: Ticket,
  messageId: string
): Promise<Buffer> => {
  const message = await Message.findOne({
    where: { id: messageId, companyId: currentTicket.companyId },
    include: [
      {
        model: Ticket,
        as: "ticket",
        attributes: ["id", "companyId", "contactId", "whatsappId", "channel"]
      }
    ]
  });
  const sourceTicket = message?.ticket as Ticket | undefined;
  if (
    !message ||
    !sourceTicket ||
    !sameConversation(currentTicket, sourceTicket)
  ) {
    throw new AppError("ERR_BILLING_PDF_NOT_FOUND", 404);
  }

  const [delivery] = await sequelize.query<Delivery>(
    'SELECT id,"companyId","contactId","memberId","billNumber","documentPath" FROM "SgaBillingDeliveries" WHERE "companyId"=:companyId AND "messageId"=:messageId AND "contactId"=:contactId ORDER BY id DESC LIMIT 1',
    {
      replacements: {
        companyId: currentTicket.companyId,
        messageId,
        contactId: currentTicket.contactId
      },
      type: QueryTypes.SELECT
    }
  );
  if (!delivery) throw new AppError("ERR_BILLING_PDF_NOT_FOUND", 404);

  if (delivery.documentPath) {
    return readBillingPdf(delivery.documentPath);
  }

  const result = await sgaRequest(
    `buscar/boleto/${encodeURIComponent(delivery.billNumber)}`
  );
  const row = Array.isArray(result)
    ? result.length === 1
      ? result[0]
      : null
    : result;
  if (!row || text(row.codigo_associado) !== delivery.memberId) {
    throw new AppError("ERR_BILLING_PDF_NOT_FOUND", 404);
  }
  const pdf = await fetchBoletoPdf(boletoUrl(row.link_boleto));
  const documentPath = await storeBillingPdf(
    currentTicket.companyId,
    delivery.id,
    pdf
  );
  await sequelize.query(
    'UPDATE "SgaBillingDeliveries" SET "documentPath"=:documentPath,"updatedAt"=NOW() WHERE id=:id AND "companyId"=:companyId',
    {
      replacements: {
        documentPath,
        id: delivery.id,
        companyId: currentTicket.companyId
      }
    }
  );
  return pdf;
};

export default GetBillingPdfService;
