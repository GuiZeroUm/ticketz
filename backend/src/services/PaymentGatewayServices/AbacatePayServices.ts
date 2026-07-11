/*

   DO NOT REMOVE / NÃO REMOVER

   VERSÃO EM PORTUGUÊS MAIS ABAIXO


   BASIC LICENSE INFORMATION:

   Author: Claudemir Todo Bom
   Email: claudemir@todobom.com

   Licensed under the AGPLv3 as stated on LICENSE.md file

   Any work that uses code from this file is obligated to
   give access to its source code to all of its users (not only
   the system's owner running it)

   EXCLUSIVE LICENSE to use on closed source derived work can be
   purchased from the author and put at the root of the source
   code tree as proof-of-purchase.



   INFORMAÇÕES BÁSICAS DE LICENÇA

   Autor: Claudemir Todo Bom
   Email: claudemir@todobom.com

   Licenciado sob a licença AGPLv3 conforme arquivo LICENSE.md

   Qualquer sistema que inclua este código deve ter o seu código
   fonte fornecido a todos os usuários do sistema (não apenas ao
   proprietário da infraestrutura que o executa)

   LICENÇA EXCLUSIVA para uso em produto derivado em código fechado
   pode ser adquirida com o autor e colocada na raiz do projeto
   como prova de compra.

 */

import { Request, Response } from "express";
import axios, { AxiosInstance } from "axios";
import GetSuperSettingService from "../SettingServices/GetSuperSettingService";
import { logger } from "../../utils/logger";
import Invoices from "../../models/Invoices";
import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import {
  processInvoiceExpired,
  processInvoicePaid
} from "./PaymentGatewayServices";

// Base da API AbacatePay (v2 — Checkout, Transparente e recursos
// compartilhados). A mesma URL atende dev e produção; o ambiente é definido
// pela chave de API usada (chave de dev => pagamentos simulados).
const abacateBaseURL = "https://api.abacatepay.com/v2";

export type PaymentMethod = "pix" | "card" | "boleto";

interface FeeRule {
  // percentual em fração (ex.: 0.035 para 3,5%)
  percent: number;
  // taxa fixa em reais
  fixed: number;
}

// ---------------------------------------------------------------------------
// Configuração / cliente HTTP
// ---------------------------------------------------------------------------

// A chave da API pode vir do ambiente (ABACATEPAY_TOKEN) ou das configurações
// no banco (_abacatePayToken). O ambiente tem prioridade: assim a produção usa
// a chave definida no env e, para voltar a testar com a chave de
// desenvolvimento, basta remover a variável de ambiente que o valor salvo nas
// configurações volta a valer.
const getAbacateToken = async (): Promise<string> => {
  const token =
    process.env.ABACATEPAY_TOKEN ||
    (await GetSuperSettingService({ key: "_abacatePayToken" }));
  if (!token) {
    throw new AppError("AbacatePay: API key não configurada", 400);
  }
  return token;
};

const abacateClient = async (): Promise<AxiosInstance> => {
  const token = await getAbacateToken();
  return axios.create({
    baseURL: abacateBaseURL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });
};

// A API v2 responde no padrão { data, error, success }.
const unwrap = (payload: any): any => {
  if (payload && typeof payload === "object" && "data" in payload) {
    if (payload.error) {
      throw new AppError(`AbacatePay: ${JSON.stringify(payload.error)}`, 400);
    }
    return payload.data ?? payload;
  }
  return payload;
};

// ---------------------------------------------------------------------------
// Taxas e gross-up
// ---------------------------------------------------------------------------

const readNumberSetting = async (
  key: string,
  fallback: number
): Promise<number> => {
  const raw = await GetSuperSettingService({ key });
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(String(raw).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Retorna a regra de taxa (percentual + fixo) para o método/parcelas escolhidos.
// Defaults baseados na tabela padrão da AbacatePay; todos editáveis nas
// configurações (chaves _abacatePayFee*).
const getFeeRule = async (
  method: PaymentMethod,
  installments = 1
): Promise<FeeRule> => {
  if (method === "pix") {
    return {
      percent: 0,
      fixed: await readNumberSetting("_abacatePayFeePix", 0.8)
    };
  }

  if (method === "boleto") {
    return {
      percent: 0,
      fixed: await readNumberSetting("_abacatePayFeeBoleto", 2.5)
    };
  }

  // cartão: faixa de parcelas define a taxa
  let pctKey = "_abacatePayFeeCard1xPct";
  let fixKey = "_abacatePayFeeCard1xFix";
  let pctDefault = 3.5;
  const fixDefault = 0.6;

  if (installments >= 2 && installments <= 6) {
    pctKey = "_abacatePayFeeCard2a6Pct";
    fixKey = "_abacatePayFeeCard2a6Fix";
    pctDefault = 4.0;
  } else if (installments >= 7) {
    pctKey = "_abacatePayFeeCard7a12Pct";
    fixKey = "_abacatePayFeeCard7a12Fix";
    pctDefault = 4.5;
  }

  const percent = (await readNumberSetting(pctKey, pctDefault)) / 100;
  const fixed = await readNumberSetting(fixKey, fixDefault);
  return { percent, fixed };
};

// Gross-up exato: cobra o valor tal que, após a taxa, o lojista recebe
// exatamente `base`. valorCobrado = (base + fixo) / (1 - percentual)
const grossUp = (base: number, rule: FeeRule): number => {
  const denom = 1 - rule.percent;
  const value = (base + rule.fixed) / (denom > 0 ? denom : 1);
  return Math.round(value * 100) / 100;
};

// Faixa de taxa aplicada ao cartão. Como o parcelamento é escolhido dentro do
// AbacatePay (a conta permite até 3x), aplicamos a taxa da faixa "2x-6x", que
// cobre com folga qualquer parcelamento permitido — o lojista nunca recebe a
// menos, independente de o cliente pagar em 1x, 2x ou 3x.
const CARD_FEE_INSTALLMENTS = 3;

// Cotação (usada pelo endpoint de quote e na criação da cobrança).
export const abacateQuote = async (baseValue: number) => {
  const base = Number(baseValue) || 0;

  const pixRule = await getFeeRule("pix");
  const boletoRule = await getFeeRule("boleto");
  const cardRule = await getFeeRule("card", CARD_FEE_INSTALLMENTS);

  const feeOf = (total: number) => Math.round((total - base) * 100) / 100;
  const pixTotal = grossUp(base, pixRule);
  const boletoTotal = grossUp(base, boletoRule);
  const cardTotal = grossUp(base, cardRule);

  return {
    base,
    pix: { total: pixTotal, fee: feeOf(pixTotal) },
    boleto: { total: boletoTotal, fee: feeOf(boletoTotal) },
    card: { total: cardTotal, fee: feeOf(cardTotal) }
  };
};

// ---------------------------------------------------------------------------
// Criação de cobrança
// ---------------------------------------------------------------------------

const buildCustomer = (company?: Company, taxId?: string) => {
  const customer: Record<string, string> = {};
  if (company?.name) customer.name = company.name;
  if (company?.email) customer.email = company.email;
  if (company?.phone) customer.cellphone = company.phone;
  if (taxId) customer.taxId = taxId;
  return Object.keys(customer).length ? customer : undefined;
};

const toCents = (value: number): number => Math.round(value * 100);

// PIX transparente: QR Code (copia-e-cola + imagem) exibido no próprio app.
// Não enviamos `customer`: a API exige o objeto completo (com CPF válido) ou
// nenhum — como a empresa não tem CPF, omitimos para não exigir isso no PIX.
const createPixCharge = async (
  client: AxiosInstance,
  invoice: Invoices,
  amount: number
) => {
  const body = {
    method: "PIX",
    data: {
      amount: toCents(amount),
      expiresIn: 3600,
      description: `Fatura #${invoice.id} - ${invoice.detail || "Assinatura"}`,
      metadata: { invoiceId: String(invoice.id) }
    }
  };

  const response = await client.post("/transparents/create", body);
  const data = unwrap(response.data);

  return {
    id: data.id,
    brCode: data.brCode,
    brCodeBase64: data.brCodeBase64,
    raw: data
  };
};

// Boleto transparente: retorna URL para visualização/impressão do boleto.
const createBoletoCharge = async (
  client: AxiosInstance,
  invoice: Invoices,
  amount: number,
  taxId: string,
  company?: Company
) => {
  const body = {
    method: "BOLETO",
    data: {
      amount: toCents(amount),
      description: `Fatura #${invoice.id} - ${invoice.detail || "Assinatura"}`,
      customer: buildCustomer(company, taxId),
      metadata: { invoiceId: String(invoice.id) }
    }
  };

  const response = await client.post("/transparents/create", body);
  const data = unwrap(response.data);

  return {
    id: data.id,
    url: data.url,
    barCode: data.barCode,
    raw: data
  };
};

// Checkout hospedado (PIX e/ou cartão): cria um produto com o valor (já com
// gross-up) e um checkout restrito aos métodos informados; retorna a URL do
// checkout para redirect. O cliente paga na página da AbacatePay e volta pela
// completionUrl; a confirmação chega pelo webhook checkout.completed.
const createHostedCheckout = async (
  client: AxiosInstance,
  invoice: Invoices,
  amount: number,
  methods: string[]
) => {
  const frontend = process.env.FRONTEND_URL || "";

  const productBody = {
    externalId: `invoice-${invoice.id}-${new Date().getTime()}`,
    name: invoice.detail || `Fatura #${invoice.id}`,
    description: invoice.detail || `Fatura #${invoice.id}`,
    price: toCents(amount),
    currency: "BRL"
  };

  const productResp = await client.post("/products/create", productBody);
  const product = unwrap(productResp.data);

  // Não enviamos card.maxInstallments: o parcelamento é definido pela conta
  // AbacatePay (atualmente até 3x) e escolhido pelo cliente na página deles.
  const checkoutBody: Record<string, any> = {
    items: [{ id: product.id, quantity: 1 }],
    methods,
    externalId: `invoice-${invoice.id}`,
    returnUrl: `${frontend}/financeiro`,
    completionUrl: `${frontend}/financeiro`,
    metadata: { invoiceId: String(invoice.id) }
  };

  const checkoutResp = await client.post("/checkouts/create", checkoutBody);
  const checkout = unwrap(checkoutResp.data);

  return {
    id: checkout.id,
    url: checkout.url,
    productId: product.id,
    raw: checkout
  };
};

export const abacateCreateSubscription = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { invoiceId } = req.body;
  const method: PaymentMethod = (req.body.method || "pix") as PaymentMethod;
  // aceita CPF/CNPJ com máscara; envia só dígitos pro gateway
  const taxId = String(req.body.taxId || "").replace(/\D/g, "");

  if (!["pix", "card", "boleto"].includes(method)) {
    throw new AppError("Método de pagamento inválido", 400);
  }

  if (method === "boleto" && !taxId) {
    throw new AppError("CPF/CNPJ é obrigatório para pagamento via boleto", 400);
  }

  try {
    const invoice = await Invoices.findByPk(invoiceId, {
      include: { model: Company, as: "company" }
    });
    if (!invoice) {
      throw new AppError("Invoice not found", 404);
    }

    // O valor base é sempre o da fatura no servidor (não confia no cliente).
    // Cartão usa a faixa de taxa que cobre o parcelamento máximo (até 3x).
    const baseValue = Number(invoice.value) || 0;
    const rule = await getFeeRule(
      method,
      method === "card" ? CARD_FEE_INSTALLMENTS : 1
    );
    const grossed = grossUp(baseValue, rule);

    const client = await abacateClient();

    if (method === "pix") {
      const pix = await createPixCharge(client, invoice, grossed);

      await invoice.update({
        txId: pix.id,
        payGw: "abacatepay",
        payGwData: JSON.stringify({
          method,
          baseValue,
          chargedValue: grossed,
          id: pix.id,
          data: pix.raw
        })
      });
      await invoice.reload();

      abacatePollCheckStatus(invoice);

      return res.json({
        method: "pix",
        qrcode: { qrcode: pix.brCode },
        brCodeBase64: pix.brCodeBase64,
        valor: { original: grossed }
      });
    }

    if (method === "boleto") {
      const boleto = await createBoletoCharge(
        client,
        invoice,
        grossed,
        taxId,
        invoice.company
      );

      await invoice.update({
        txId: boleto.id,
        payGw: "abacatepay",
        payGwData: JSON.stringify({
          method,
          baseValue,
          chargedValue: grossed,
          id: boleto.id,
          data: boleto.raw
        })
      });
      await invoice.reload();

      return res.json({
        method: "boleto",
        redirectUrl: boleto.url,
        barCode: boleto.barCode,
        valor: { original: grossed }
      });
    }

    // cartão -> checkout hospedado (parcelamento definido no AbacatePay)
    const checkout = await createHostedCheckout(
      client,
      invoice,
      grossed,
      ["CARD"]
    );

    await invoice.update({
      txId: checkout.id,
      payGw: "abacatepay",
      payGwData: JSON.stringify({
        method,
        baseValue,
        chargedValue: grossed,
        id: checkout.id,
        productId: checkout.productId,
        data: checkout.raw
      })
    });
    await invoice.reload();

    return res.json({
      method: "card",
      redirectUrl: checkout.url,
      valor: { original: grossed }
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(
      { err: error?.response?.data || error?.message || error },
      "abacateCreateSubscription error"
    );
    throw new AppError(
      "Problema encontrado, entre em contato com o suporte!",
      400
    );
  }
};

// ---------------------------------------------------------------------------
// Confirmação: webhook, check e polling
// ---------------------------------------------------------------------------

const PAID_STATUSES = ["PAID", "APPROVED", "COMPLETE", "COMPLETED"];

const findInvoiceForWebhook = async (data: any): Promise<Invoices | null> => {
  const chargeId =
    data?.id ||
    data?.billing?.id ||
    data?.checkout?.id ||
    data?.transaction?.id ||
    data?.pixQrCode?.id;

  if (chargeId) {
    const byTx = await Invoices.findOne({
      where: { txId: chargeId, status: "open" },
      include: { model: Company, as: "company" }
    });
    if (byTx) return byTx;
  }

  // fallback: metadata.invoiceId (enviado na criação da cobrança)
  const metaInvoiceId =
    data?.metadata?.invoiceId || data?.data?.metadata?.invoiceId;
  if (metaInvoiceId) {
    return Invoices.findOne({
      where: { id: metaInvoiceId, status: "open" },
      include: { model: Company, as: "company" }
    });
  }

  return null;
};

export const abacateWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    // Mesmo esquema do token: env (ABACATEPAY_WEBHOOK_SECRET) tem prioridade
    // sobre o valor salvo nas configurações (_abacatePayWebhookSecret).
    const expectedSecret =
      process.env.ABACATEPAY_WEBHOOK_SECRET ||
      (await GetSuperSettingService({ key: "_abacatePayWebhookSecret" }));

    if (expectedSecret && req.query.webhookSecret !== expectedSecret) {
      logger.warn("abacateWebhook: webhookSecret inválido");
      return res.status(401).json({ error: "invalid webhook secret" });
    }

    const event: string = req.body?.event || "";
    const data = req.body?.data || req.body || {};

    const status: string =
      data.status || data.billing?.status || data.checkout?.status || "";

    const isPaidEvent =
      /paid|completed|complete/i.test(event) ||
      PAID_STATUSES.includes(String(status).toUpperCase());

    if (!isPaidEvent) {
      return res.json({ ok: true });
    }

    const invoice = await findInvoiceForWebhook(data);
    if (!invoice) {
      logger.debug("abacateWebhook: invoice não encontrada ou já paga");
      return res.json({ ok: true });
    }

    await processInvoicePaid(invoice);
    return res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "abacateWebhook error");
    // Retorna 200 para evitar reentregas em loop; reconciliação via polling.
    return res.json({ ok: true });
  }
};

export const abacateCheckStatus = async (
  invoice: Invoices
): Promise<boolean> => {
  try {
    const client = await abacateClient();
    let parsed: any = {};
    try {
      parsed = JSON.parse(invoice.payGwData || "{}");
    } catch {
      parsed = {};
    }

    let status = "";

    if (parsed.method === "boleto") {
      // Boleto (transparente) não tem endpoint de consulta confiável; a
      // confirmação vem pelo webhook transparent.completed.
      return false;
    }

    if (parsed.method === "card") {
      // Cartão usa checkout hospedado (id bill_...). Não há GET /checkouts/{id};
      // consultamos a lista e casamos pelo id.
      const response = await client.get("/checkouts/list");
      const list = unwrap(response.data);
      const found = Array.isArray(list)
        ? list.find((b: any) => b.id === invoice.txId)
        : null;
      status = found?.status || "";
    } else {
      // pix (transparente)
      const response = await client.get("/transparents/check", {
        params: { id: invoice.txId }
      });
      status = unwrap(response.data)?.status || "";
    }

    if (PAID_STATUSES.includes(String(status).toUpperCase())) {
      await processInvoicePaid(invoice);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(
      { err: error?.response?.data || error?.message || error },
      "abacateCheckStatus error"
    );
    return false;
  }
};

export const abacatePollCheckStatus = async (
  invoice: Invoices,
  retries = 10,
  interval = 30000
): Promise<void> => {
  let attempts = 0;

  async function pollStatus(): Promise<void> {
    await invoice.reload();

    if (invoice.status === "paid") {
      return;
    }

    const successful = await abacateCheckStatus(invoice);
    if (successful) {
      return;
    }

    attempts += 1;
    if (attempts >= retries) {
      processInvoiceExpired(invoice);
      return;
    }

    await new Promise(resolve => {
      setTimeout(resolve, interval);
    });
    await pollStatus();
  }

  return pollStatus();
};

// Simula o pagamento de uma cobrança transparente (PIX/boleto) — somente em
// dev mode da AbacatePay.
export const abacateSimulatePayment = async (
  invoice: Invoices
): Promise<boolean> => {
  const client = await abacateClient();
  const response = await client.post(
    "/transparents/simulate-payment",
    { metadata: {} },
    { params: { id: invoice.txId } }
  );

  const status = unwrap(response.data)?.status || "";
  if (PAID_STATUSES.includes(String(status).toUpperCase())) {
    await invoice.reload();
    if (invoice.status === "open") {
      const full = await Invoices.findByPk(invoice.id, {
        include: { model: Company, as: "company" }
      });
      if (full) await processInvoicePaid(full);
    }
    return true;
  }

  return abacateCheckStatus(invoice);
};
