import axios from "axios";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";
import { SgaRow } from "./normalize";

const baseURL = "https://api.hinova.com.br/api/sga/v2/";
export const sgaRequest = async (
  path: string,
  body?: Record<string, unknown>
): Promise<SgaRow | SgaRow[]> => {
  const token = process.env.ACNORTE_SGA_TOKEN;
  if (!token) throw new AppError("ERR_SGA_NOT_CONFIGURED", 503);
  try {
    const response = await axios.request({
      baseURL,
      url: path,
      method: body ? "POST" : "GET",
      data: body,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 45000,
      maxRedirects: 0,
      validateStatus: () => true
    });
    const data = response.data;
    // So o texto que a Hinova devolve no corpo, nunca o erro do axios nem os
    // headers: sem isso a recusa chega como um codigo generico e nao da pra
    // saber se foi token, permissao ou a consulta.
    const message = `${data?.mensagem || data?.retorno || ""} ${Array.isArray(data?.error) ? data.error.join(" ") : data?.error || ""}`;
    if ([401, 403].includes(response.status)) {
      logger.warn(
        { path, status: response.status, hinova: message.trim() },
        "SGA refused the request"
      );
      throw new AppError("ERR_SGA_ACCESS_DENIED", 502);
    }
    if (
      /nenhum|nao.*encontrad|não.*encontrad/i.test(message) &&
      [200, 404, 406].includes(response.status)
    )
      return [];
    if (response.status !== 200 || typeof data !== "object" || !data) {
      logger.warn(
        { path, status: response.status, hinova: message.trim() },
        "SGA answered with an unusable response"
      );
      throw new AppError("ERR_SGA_UNAVAILABLE", 502);
    }
    if (/erro|negad|permiss|inv[aá]lid/i.test(message)) {
      logger.warn(
        { path, status: response.status, hinova: message.trim() },
        "SGA refused the request"
      );
      throw new AppError("ERR_SGA_ACCESS_DENIED", 502);
    }
    return data;
  } catch (error) {
    // Axios errors include the Authorization header; never propagate or log them.
    if (error instanceof AppError) throw error;
    throw new AppError("ERR_SGA_UNAVAILABLE", 502);
  }
};

export const sgaPages = async (
  path: string,
  body: Record<string, unknown>,
  key?: string,
  pagination: "offset" | "page" = "offset"
): Promise<SgaRow[]> => {
  const rows: SgaRow[] = [];
  const seen = new Set<string>();
  const pageSize = 500;
  for (let offset = 0; offset < 250000; offset += pageSize) {
    const data = await sgaRequest(path, {
      ...body,
      // Hinova's boleto endpoint uses a zero-based page number, unlike the
      // associated/vehicle endpoints, which use a row offset (verified live).
      inicio_paginacao: pagination === "page" ? offset / pageSize : offset,
      quantidade_por_pagina: pageSize
    });
    const page = Array.isArray(data) ? data : key ? data[key] : null;
    if (!Array.isArray(page))
      throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
    page.forEach(row => {
      const id = String(
        row.codigo_veiculo ||
          row.codigo_boleto ||
          row.codigo_associado ||
          row.nosso_numero
      );
      if (seen.has(id)) throw new AppError("ERR_SGA_PAGINATION", 502);
      seen.add(id);
      rows.push(row);
    });
    if (page.length < pageSize) return rows;
  }
  throw new AppError("ERR_SGA_PAGINATION", 502);
};
