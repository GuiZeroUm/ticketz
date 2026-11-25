import Invoices from "../../models/Invoices";
import { payGatewayReceiptUrl } from "../PaymentGatewayServices/PaymentGatewayServices";
import { invoiceStatusLabel } from "./BillingAdminQuery";
import {
  autoEmitAppliesTo,
  currentFiscalNotesByInvoice,
  FiscalNoteView,
  serializeFiscalNote
} from "../FiscalNoteServices/FiscalNoteService";
import { fiscalCompletenessByCompany } from "../FiscalNoteServices/FiscalProfileService";

export interface BillingInvoiceExtras {
  fiscalNote?: FiscalNoteView | null;
  fiscalDataComplete?: boolean;
  fiscalAutoEmit?: boolean;
}

export interface SerializedBillingInvoice {
  id: number;
  companyId: number;
  detail: string;
  value: number;
  currency: string;
  dueDate: string;
  status: string;
  situacao: string;
  origem: string;
  billingType: string;
  periodStart: string;
  periodEnd: string;
  paidAt: Date;
  createdAt: Date;
  forma: string;
  payGw: string;
  txId: string;
  paymentLink: string | null;
  receiptUrl: string | null;
  fiscalAutoEmit: boolean;
  fiscalNote: FiscalNoteView | null;
  company: {
    id: number;
    name: string;
    email: string;
    phone: string;
    planId: number;
    planName: string | null;
    fiscalDataComplete: boolean;
  } | null;
}

export const serializeBillingInvoice = (
  invoice: Invoices,
  extras: BillingInvoiceExtras = {}
): SerializedBillingInvoice => ({
  id: invoice.id,
  companyId: invoice.companyId,
  detail: invoice.detail,
  value: Number(invoice.value) || 0,
  currency: invoice.currency || "BRL",
  dueDate: invoice.dueDate,
  status: invoice.status,
  // "situacao" é o status que o financeiro enxerga: separa vencido de aberto,
  // coisa que a coluna do banco não faz.
  situacao: invoiceStatusLabel(invoice.status, invoice.dueDate),
  origem: invoice.origem,
  billingType: invoice.billingType,
  periodStart: invoice.periodStart,
  periodEnd: invoice.periodEnd,
  paidAt: invoice.paidAt,
  createdAt: invoice.createdAt,
  forma: invoice.forma,
  payGw: invoice.payGw,
  txId: invoice.txId,
  paymentLink: invoice.linkPagamento || null,
  receiptUrl: payGatewayReceiptUrl(invoice),
  fiscalNote: extras.fiscalNote ?? null,
  fiscalAutoEmit: extras.fiscalAutoEmit ?? false,
  company: invoice.company
    ? {
        id: invoice.company.id,
        name: invoice.company.name,
        email: invoice.company.email,
        phone: invoice.company.phone,
        planId: invoice.company.planId,
        planName: invoice.company.plan?.name || null,
        fiscalDataComplete: extras.fiscalDataComplete ?? false
      }
    : null
});

// Nota fiscal atual e completude dos dados fiscais, em duas consultas para a
// lista inteira.
export const loadBillingInvoiceExtras = async (
  invoices: Invoices[]
): Promise<Map<number, BillingInvoiceExtras>> => {
  const [notes, completeness] = await Promise.all([
    currentFiscalNotesByInvoice(invoices.map(invoice => invoice.id)),
    fiscalCompletenessByCompany(invoices.map(invoice => invoice.companyId))
  ]);
  return new Map(
    invoices.map(invoice => [
      invoice.id,
      {
        fiscalNote: serializeFiscalNote(notes.get(invoice.id)),
        fiscalDataComplete: completeness.get(invoice.companyId) ?? false,
        fiscalAutoEmit: autoEmitAppliesTo(invoice)
      }
    ])
  );
};
