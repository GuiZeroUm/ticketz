import axios from "axios";
import { sgaPages, sgaRequest } from "../client";
jest.mock("axios");
const request = axios.request as jest.Mock;

describe("SGA upstream boundary", () => {
  beforeEach(() => {
    process.env.ACNORTE_SGA_TOKEN = "test-only-token";
    request.mockReset();
  });
  afterAll(() => {
    delete process.env.ACNORTE_SGA_TOKEN;
  });
  it("handles documented empty result without treating every 406 as empty", async () => {
    request.mockResolvedValueOnce({
      status: 406,
      data: {
        mensagem: "Não aceitável",
        error: ["Não foram encontrados veículos dentro dos parâmetros enviados"]
      }
    });
    expect(await sgaPages("listar/veiculo", {}, "veiculos")).toEqual([]);
    request.mockResolvedValueOnce({
      status: 406,
      data: { mensagem: "Não aceitável", error: ["Permissão negada"] }
    });
    await expect(sgaRequest("listar/veiculo", {})).rejects.toMatchObject({
      statusCode: 502
    });
  });
  it("reads beyond the first page and fails if upstream repeats a page", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      codigo_veiculo: String(i + 1)
    }));
    request
      .mockResolvedValueOnce({ status: 200, data: { veiculos: rows } })
      .mockResolvedValueOnce({
        status: 200,
        data: { veiculos: [{ codigo_veiculo: "501" }] }
      });
    expect(await sgaPages("listar/veiculo", {}, "veiculos")).toHaveLength(501);
    expect(request.mock.calls[1][0].data.inicio_paginacao).toBe(500);
    request.mockResolvedValue({ status: 200, data: { veiculos: rows } });
    await expect(
      sgaPages("listar/veiculo", {}, "veiculos")
    ).rejects.toMatchObject({ message: "ERR_SGA_PAGINATION" });
  });
  it("does not leak axios authorization headers on transport failure", async () => {
    request.mockRejectedValueOnce({
      message: "connection failed",
      config: { headers: { Authorization: "secret" } }
    });
    await expect(sgaRequest("listar/veiculo", {})).rejects.toMatchObject({
      message: "ERR_SGA_UNAVAILABLE"
    });
  });
});
