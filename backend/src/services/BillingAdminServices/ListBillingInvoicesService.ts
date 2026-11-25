import Invoices from "../../models/Invoices";
import {
  BillingFilters,
  companyInclude,
  invoiceWhere
} from "./BillingAdminQuery";
import {
  loadBillingInvoiceExtras,
  serializeBillingInvoice,
  SerializedBillingInvoice
} from "./SerializeBillingInvoice";

interface Request extends BillingFilters {
  pageNumber?: string | number;
  perPage?: string | number;
}

interface Response {
  invoices: SerializedBillingInvoice[];
  count: number;
  hasMore: boolean;
}

const ListBillingInvoicesService = async (
  params: Request
): Promise<Response> => {
  const limit = Math.min(200, Math.max(1, Number(params.perPage) || 50));
  const page = Math.max(1, Number(params.pageNumber) || 1);
  const offset = limit * (page - 1);

  const { count, rows } = await Invoices.findAndCountAll({
    where: invoiceWhere(params),
    include: [companyInclude(params)],
    order: [
      ["dueDate", "DESC"],
      ["id", "DESC"]
    ],
    limit,
    offset,
    distinct: true
  });

  const extras = await loadBillingInvoiceExtras(rows);

  return {
    invoices: rows.map(invoice =>
      serializeBillingInvoice(invoice, extras.get(invoice.id))
    ),
    count,
    hasMore: count > offset + rows.length
  };
};

export default ListBillingInvoicesService;
