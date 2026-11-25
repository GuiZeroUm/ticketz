/* eslint-disable @typescript-eslint/no-explicit-any */
import { getIO } from "../../../libs/socket";
import {
  CLIENT_FAILURE_CODE,
  emitFiscalNoteUpdate,
  serializeFiscalNote
} from "../FiscalNoteService";
import { fakeModel } from "./fiscalTestUtils";

jest.mock("../../../models/FiscalNote", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Invoices", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/CompanyFiscalProfile", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/FiscalNoteWebhookDelivery", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/User", () => ({ __esModule: true, default: {} }));
jest.mock("../fiscalNoteQueue", () => ({
  enqueueFiscalNoteEmission: jest.fn()
}));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock("../../../libs/socket", () => {
  const sent: Record<string, any[]> = {};
  const io = {
    sent,
    to: (room: string) => ({
      emit: (_event: string, payload: any) => {
        sent[room] = [...(sent[room] || []), payload];
      }
    })
  };
  return { getIO: () => io };
});

const failed = () =>
  fakeModel({
    id: 5,
    invoiceId: 28,
    companyId: 7,
    status: "error",
    errorCode: "CONFIG_ERROR",
    errorMessage: "detalhe interno do provedor"
  });

describe("fiscal note error detail by audience", () => {
  it("shows the provider detail only to the platform", () => {
    expect(serializeFiscalNote(failed())).toEqual(
      expect.objectContaining({
        errorCode: "CONFIG_ERROR",
        errorMessage: "detalhe interno do provedor"
      })
    );
    expect(serializeFiscalNote(failed(), "client")).toEqual(
      expect.objectContaining({
        errorCode: CLIENT_FAILURE_CODE,
        errorMessage: null
      })
    );
    const issued = fakeModel({
      id: 6,
      status: "issued",
      errorCode: "CANCEL_REJECTED"
    });
    expect(serializeFiscalNote(issued, "client").errorCode).toBeNull();
  });

  it("sends the generic payload to the company room and the detail to the platform room", () => {
    emitFiscalNoteUpdate(failed());
    const { sent } = getIO() as any;
    const client = sent["company-7-mainchannel"][0].fiscalNote;
    const platform = sent.super[0].fiscalNote;
    expect(client.errorMessage).toBeNull();
    expect(client.errorCode).toBe(CLIENT_FAILURE_CODE);
    expect(platform.errorMessage).toBe("detalhe interno do provedor");
  });
});
