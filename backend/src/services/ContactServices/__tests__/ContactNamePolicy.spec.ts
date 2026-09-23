import Contact from "../../../models/Contact";
import Setting from "../../../models/Setting";
import {
  contactNameLockOnCreate,
  preserveLockedNameOnMerge,
  protectContactNameUpdate
} from "../ContactNamePolicy";

jest.mock("../../../models/Setting", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));

const settingFindOne = Setting.findOne as jest.MockedFunction<
  typeof Setting.findOne
>;

const contact = (values: Partial<Contact>): Contact =>
  ({
    companyId: 9,
    isGroup: false,
    name: "Nome atual",
    nameLocked: false,
    ...values
  }) as Contact;

describe("AC Norte manual contact name policy", () => {
  it("locks a manually created contact only when the tenant setting is enabled", async () => {
    settingFindOne.mockResolvedValueOnce({ value: "enabled" } as Setting);
    await expect(contactNameLockOnCreate(9, "manual")).resolves.toBe(true);

    settingFindOne.mockResolvedValueOnce(null);
    await expect(contactNameLockOnCreate(10, "manual")).resolves.toBe(false);

    expect(settingFindOne).toHaveBeenNthCalledWith(1, {
      where: { companyId: 9, key: "preserveManualContactNames" },
      attributes: ["value"]
    });
  });

  it("keeps a locked manual name when WhatsApp publishes another name", async () => {
    settingFindOne.mockResolvedValue({ value: "enabled" } as Setting);
    const result = await protectContactNameUpdate(
      contact({ name: "Associado AC Norte", nameLocked: true }),
      { name: "Nome do WhatsApp", profilePicUrl: "new-picture" },
      "external"
    );

    expect(result).toEqual({ profilePicUrl: "new-picture" });
  });

  it("continues updating external names for unlocked contacts and other tenants", async () => {
    settingFindOne
      .mockResolvedValueOnce({ value: "enabled" } as Setting)
      .mockResolvedValueOnce(null);

    await expect(
      protectContactNameUpdate(
        contact({ nameLocked: false }),
        { name: "Novo nome externo" },
        "external"
      )
    ).resolves.toEqual({ name: "Novo nome externo" });

    await expect(
      protectContactNameUpdate(
        contact({ companyId: 10, nameLocked: true }),
        { name: "Comportamento anterior" },
        "external"
      )
    ).resolves.toEqual({ name: "Comportamento anterior" });
  });

  it("locks a name edited by an attendant", async () => {
    settingFindOne.mockResolvedValue({ value: "enabled" } as Setting);

    await expect(
      protectContactNameUpdate(
        contact({ nameLocked: false }),
        { name: "Nome revisado" },
        "manual"
      )
    ).resolves.toEqual({ name: "Nome revisado", nameLocked: true });
  });

  it("moves a protected name to the winner of a phone/LID merge", async () => {
    settingFindOne.mockResolvedValue({ value: "enabled" } as Setting);

    await expect(
      preserveLockedNameOnMerge(
        contact({ name: "Registro do telefone", nameLocked: false }),
        contact({ name: "Nome revisado", nameLocked: true })
      )
    ).resolves.toEqual({ name: "Nome revisado", nameLocked: true });
  });
});
