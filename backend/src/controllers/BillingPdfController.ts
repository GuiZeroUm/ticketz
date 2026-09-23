import { Request, Response } from "express";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import AssertTicketAccessService from "../services/TicketServices/AssertTicketAccessService";
import GetBillingPdfService from "../services/SgaBillingServices/GetBillingPdfService";

export const show = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(
    req.params.ticketId,
    req.user.companyId
  );
  await AssertTicketAccessService(ticket, req.user);
  const pdf = await GetBillingPdfService(ticket, req.params.messageId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(pdf.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    'inline; filename="boleto-ac-norte.pdf"'
  );
  return res.send(pdf);
};
