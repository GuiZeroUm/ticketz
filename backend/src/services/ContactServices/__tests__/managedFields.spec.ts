import Contact from "../../../models/Contact";
import ContactCustomField from "../../../models/ContactCustomField";
import UpdateContactService from "../UpdateContactService";
jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/ContactCustomField", () => ({
  __esModule: true,
  default: { create: jest.fn(), update: jest.fn(), destroy: jest.fn() }
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../ScheduleServices/recurrence", () => ({
  isValidBirthday: () => true
}));
describe("managed contact fields protection", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (Contact.findOne as jest.Mock).mockResolvedValue({
      id: 10,
      companyId: 9,
      extraInfo: [
        { id: 1, name: "Placa", value: "ABC1D23", managedBy: "acnorte-sga" },
        { id: 2, name: "Nota", value: "manual", managedBy: null }
      ],
      update: jest.fn(),
      reload: jest.fn()
    });
  });
  it("ignores SGA changes and only updates the manual field", async () => {
    await UpdateContactService({
      companyId: 9,
      contactId: "10",
      contactData: {
        extraInfo: [
          { id: 1, name: "Placa", value: "forged" },
          { id: 2, name: "Nota", value: "edited" }
        ]
      }
    });
    expect(ContactCustomField.update).toHaveBeenCalledTimes(1);
    expect(ContactCustomField.update).toHaveBeenCalledWith(
      { name: "Nota", value: "edited" },
      { where: { id: 2, contactId: 10, managedBy: null } }
    );
    expect(ContactCustomField.destroy).not.toHaveBeenCalled();
  });
  it("preserves omitted managed fields while allowing manual removal", async () => {
    await UpdateContactService({
      companyId: 9,
      contactId: "10",
      contactData: { extraInfo: [] }
    });
    expect(ContactCustomField.destroy).toHaveBeenCalledTimes(1);
    expect(ContactCustomField.destroy).toHaveBeenCalledWith({
      where: { id: 2, contactId: 10, managedBy: null }
    });
  });
  it("does not resurrect managed fields from stale forms", async () => {
    await UpdateContactService({
      companyId: 9,
      contactId: "10",
      contactData: {
        extraInfo: [
          { id: 999, name: "Placa 9", value: "old", managedBy: "acnorte-sga" }
        ]
      }
    });
    expect(ContactCustomField.create).not.toHaveBeenCalled();
    expect(ContactCustomField.update).not.toHaveBeenCalled();
  });
  it("rejects IDs belonging to other contacts", async () => {
    await expect(
      UpdateContactService({
        companyId: 9,
        contactId: "10",
        contactData: {
          extraInfo: [{ id: 999, name: "other", value: "forged" }]
        }
      })
    ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION" });
    expect(ContactCustomField.update).not.toHaveBeenCalled();
  });
});
