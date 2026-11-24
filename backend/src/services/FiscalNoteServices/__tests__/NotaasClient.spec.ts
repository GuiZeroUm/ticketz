import axios from "axios";
import { emitNfse, toNotaasError } from "../NotaasClient";

jest.mock("axios");

describe("Notaas client (simulated HTTP)", () => {
  const post = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOTAAS_API_KEY = "test-key";
    (axios.create as jest.Mock).mockReturnValue({ post });
  });

  it("sends the API key and the idempotency key", async () => {
    post.mockResolvedValue({ data: { invoiceId: "inv-1", status: "queued" } });
    const result = await emitNfse(
      {
        servico: { codigo: "010501", descricao: "x" },
        valores: { total: 10, aliquotaIss: 5 },
        referencia: "EW-1"
      },
      "ew-invoice-1"
    );
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-api-key": "test-key" } })
    );
    expect(post).toHaveBeenCalledWith("/emitir", expect.anything(), {
      headers: { "Idempotency-Key": "ew-invoice-1" }
    });
    expect(result).toEqual(
      expect.objectContaining({ invoiceId: "inv-1", status: "queued" })
    );
  });

  it("retries 429 respecting Retry-After and 5xx, never 4xx", () => {
    const tooMany = toNotaasError({
      response: { status: 429, headers: { "retry-after": "7" }, data: {} }
    });
    expect(tooMany.retryable).toBe(true);
    expect(tooMany.retryAfterMs).toBe(7000);
    expect(
      toNotaasError({ response: { status: 500, data: {} } }).retryable
    ).toBe(true);
    [400, 402, 403, 409, 422].forEach(status => {
      expect(
        toNotaasError({ response: { status, data: { code: "X" } } }).retryable
      ).toBe(false);
    });
    expect(toNotaasError(new Error("socket hang up")).retryable).toBe(true);
  });
});
