import { Op, UniqueConstraintError } from "sequelize";
import Contact from "../../../models/Contact";
import ContactIdentity from "../../../models/ContactIdentity";
import sequelize from "../../../database";
import AppError from "../../../errors/AppError";
import FindOrCreateEmailContactService from "../FindOrCreateEmailContactService";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn() }
}));

jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() }
}));

jest.mock("../../../models/ContactIdentity", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() }
}));

jest.mock("../../ContactServices/CreateOrUpdateContactService", () => ({
  __esModule: true,
  emitContact: jest.fn().mockResolvedValue(undefined)
}));

const identityFindOne = ContactIdentity.findOne as jest.Mock;
const identityCreate = ContactIdentity.create as jest.Mock;
const contactFindAll = Contact.findAll as jest.Mock;
const contactFindOne = Contact.findOne as jest.Mock;
const contactCreate = Contact.create as jest.Mock;
const transactionMock = sequelize.transaction as unknown as jest.Mock;

const TX = { id: "tx" };
let rolledBack: number;

type FakeContact = {
  id: number;
  companyId: number;
  number?: string;
  channel?: string;
  email?: string;
  update: jest.Mock;
  save: jest.Mock;
  reload: jest.Mock;
};

const makeContact = (
  id: number,
  extra: Partial<FakeContact> = {}
): FakeContact => ({
  id,
  companyId: 1,
  update: jest.fn(),
  save: jest.fn(),
  reload: jest.fn().mockResolvedValue(undefined),
  ...extra
});

const uniqueError = () =>
  new UniqueConstraintError({ message: "duplicate", errors: [] });

describe("FindOrCreateEmailContactService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    rolledBack = 0;
    // Managed-transaction stand-in: a rejected callback counts as a rollback.
    transactionMock.mockImplementation(async cb => {
      try {
        return await cb(TX);
      } catch (e) {
        rolledBack += 1;
        throw e;
      }
    });
    identityFindOne.mockResolvedValue(null);
    contactFindAll.mockResolvedValue([]);
    contactFindOne.mockResolvedValue(null);
  });

  it("returns the contact of an existing identity", async () => {
    const existing = makeContact(10);
    identityFindOne.mockResolvedValue({ contactId: 10 });
    contactFindOne.mockResolvedValue(existing);

    const result = await FindOrCreateEmailContactService({
      companyId: 1,
      address: "Ana@Example.com",
      name: "Ana",
      emailAccountId: 5
    });

    expect(result).toBe(existing);
    expect(identityFindOne.mock.calls[0][0].where).toEqual({
      companyId: 1,
      channel: "email",
      externalId: "ana@example.com"
    });
    expect(contactFindOne.mock.calls[0][0].where).toEqual({
      id: 10,
      companyId: 1
    });
    expect(contactCreate).not.toHaveBeenCalled();
    expect(identityCreate).not.toHaveBeenCalled();
  });

  it("links to the single existing contact with the same email", async () => {
    const whatsapp = makeContact(20, {
      number: "5511999990000",
      channel: "whatsapp",
      email: "Ana@Example.com"
    });
    contactFindAll.mockResolvedValue([whatsapp]);
    identityCreate.mockResolvedValue({});

    const result = await FindOrCreateEmailContactService({
      companyId: 1,
      address: "ana@example.com",
      name: "Ana",
      emailAccountId: 5
    });

    expect(result).toBe(whatsapp);
    expect(contactCreate).not.toHaveBeenCalled();
    expect(identityCreate).toHaveBeenCalledWith(
      {
        companyId: 1,
        contactId: 20,
        channel: "email",
        externalId: "ana@example.com",
        emailAccountId: 5
      },
      { transaction: TX }
    );
    // number/channel of the existing WhatsApp contact are untouched
    expect(whatsapp.number).toBe("5511999990000");
    expect(whatsapp.channel).toBe("whatsapp");
    expect(whatsapp.update).not.toHaveBeenCalled();
    expect(whatsapp.save).not.toHaveBeenCalled();

    const query = contactFindAll.mock.calls[0][0];
    expect(query.limit).toBe(2);
    expect(query.where.companyId).toBe(1);
    const [emailCondition] = query.where[Op.and];
    expect(emailCondition.attribute.fn).toBe("lower");
    expect(emailCondition.attribute.args[0].col).toBe("email");
    expect(emailCondition.logic).toBe("ana@example.com");
  });

  it("creates a new email-only contact when two contacts share the email", async () => {
    contactFindAll.mockResolvedValue([makeContact(30), makeContact(31)]);
    const created = makeContact(40);
    contactCreate.mockResolvedValue(created);
    identityCreate.mockResolvedValue({});

    const result = await FindOrCreateEmailContactService({
      companyId: 1,
      address: "shared@example.com",
      name: "Shared",
      emailAccountId: 5
    });

    expect(result).toBe(created);
    expect(contactCreate).toHaveBeenCalledTimes(1);
    expect(contactCreate).toHaveBeenCalledWith(
      {
        name: "Shared",
        number: null,
        email: "shared@example.com",
        channel: "email",
        companyId: 1
      },
      { transaction: TX }
    );
    expect(identityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 40,
        externalId: "shared@example.com"
      }),
      { transaction: TX }
    );
  });

  it("falls back to the address as name when none is given", async () => {
    contactCreate.mockResolvedValue(makeContact(41));
    identityCreate.mockResolvedValue({});

    await FindOrCreateEmailContactService({
      companyId: 1,
      address: "noname@example.com",
      emailAccountId: 5
    });

    expect(contactCreate.mock.calls[0][0].name).toBe("noname@example.com");
  });

  it("never matches by name", async () => {
    contactCreate.mockResolvedValue(makeContact(50));
    identityCreate.mockResolvedValue({});

    await FindOrCreateEmailContactService({
      companyId: 1,
      address: "other@example.com",
      name: "Ana Souza",
      emailAccountId: 5
    });

    contactFindAll.mock.calls.forEach(([query]) => {
      expect(JSON.stringify(query)).not.toContain("Ana Souza");
      expect(JSON.stringify(query)).not.toContain('"name"');
    });
    expect(contactCreate).toHaveBeenCalledTimes(1);
  });

  it("creates one contact under concurrent calls for the same address", async () => {
    const identities: Array<{ contactId: number }> = [];
    const contacts = new Map<number, FakeContact>();
    let nextId = 100;
    const tick = () => new Promise(resolve => setTimeout(resolve, 5));

    identityFindOne.mockImplementation(async () => {
      await tick();
      return identities[0] || null;
    });
    contactFindOne.mockImplementation(async ({ where }) => {
      await tick();
      return contacts.get(where.id) || null;
    });
    contactCreate.mockImplementation(async () => {
      await tick();
      nextId += 1;
      const c = makeContact(nextId);
      contacts.set(nextId, c);
      return c;
    });
    identityCreate.mockImplementation(async data => {
      await tick();
      identities.push({ contactId: data.contactId });
      return {};
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        FindOrCreateEmailContactService({
          companyId: 1,
          address: "race@example.com",
          name: "Race",
          emailAccountId: 5
        })
      )
    );

    expect(contactCreate).toHaveBeenCalledTimes(1);
    expect(identityCreate).toHaveBeenCalledTimes(1);
    expect(new Set(results.map(r => r.id)).size).toBe(1);
  });

  it("does not serialize calls for different addresses or companies", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    contactCreate.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      inFlight -= 1;
      return makeContact(1);
    });
    identityCreate.mockResolvedValue({});

    await Promise.all([
      FindOrCreateEmailContactService({
        companyId: 1,
        address: "a@example.com",
        emailAccountId: 1
      }),
      FindOrCreateEmailContactService({
        companyId: 1,
        address: "b@example.com",
        emailAccountId: 1
      }),
      FindOrCreateEmailContactService({
        companyId: 2,
        address: "a@example.com",
        emailAccountId: 1
      })
    ]);

    expect(maxInFlight).toBe(3);
  });

  it("recovers from a unique violation raised by another process and rolls back its own contact", async () => {
    const winner = makeContact(60);
    // 1st read (before create): nothing; re-read after the violation: found
    identityFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ contactId: 60 });
    contactFindOne.mockResolvedValue(winner);
    contactCreate.mockResolvedValue(makeContact(61));
    identityCreate.mockRejectedValue(uniqueError());

    const result = await FindOrCreateEmailContactService({
      companyId: 1,
      address: "cross@example.com",
      name: "Cross",
      emailAccountId: 5
    });

    expect(result).toBe(winner);
    // contact + identity were created in the same transaction, which rolled back
    expect(contactCreate.mock.calls[0][1]).toEqual({ transaction: TX });
    expect(identityCreate.mock.calls[0][1]).toEqual({ transaction: TX });
    expect(rolledBack).toBe(1);
    // the re-read happens outside the failed transaction
    expect(identityFindOne.mock.calls[1][0].transaction).toBeUndefined();
    expect(identityFindOne.mock.calls[1][0].where).toEqual({
      companyId: 1,
      channel: "email",
      externalId: "cross@example.com"
    });
  });

  it("recovers from a unique violation when linking an existing contact", async () => {
    const existing = makeContact(70, { email: "link@example.com" });
    const winner = makeContact(71);
    contactFindAll.mockResolvedValue([existing]);
    identityFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ contactId: 71 });
    contactFindOne.mockResolvedValue(winner);
    identityCreate.mockRejectedValue(uniqueError());

    await expect(
      FindOrCreateEmailContactService({
        companyId: 1,
        address: "link@example.com",
        emailAccountId: 5
      })
    ).resolves.toBe(winner);
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it("rethrows a unique violation that does not come from the identity", async () => {
    contactCreate.mockRejectedValue(uniqueError());

    await expect(
      FindOrCreateEmailContactService({
        companyId: 1,
        address: "boom@example.com",
        emailAccountId: 5
      })
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it.each(["", "   ", "not-an-email", "a@b", "a@example.com, b@example.com"])(
    "rejects invalid address %j without touching the database",
    async address => {
      const promise = FindOrCreateEmailContactService({
        companyId: 1,
        address,
        name: "X",
        emailAccountId: 5
      });
      await expect(promise).rejects.toBeInstanceOf(AppError);
      await expect(promise).rejects.toMatchObject({
        message: "ERR_EMAIL_INVALID_ADDRESS",
        statusCode: 400
      });
      expect(identityFindOne).not.toHaveBeenCalled();
      expect(contactFindAll).not.toHaveBeenCalled();
      expect(contactCreate).not.toHaveBeenCalled();
    }
  );

  it("normalizes display-name form and IDN domains before matching", async () => {
    identityFindOne.mockResolvedValue({ contactId: 1 });
    contactFindOne.mockResolvedValue(makeContact(1));

    await FindOrCreateEmailContactService({
      companyId: 1,
      address: "Ana <Ana@Exämple.com>",
      emailAccountId: 5
    });

    expect(identityFindOne.mock.calls[0][0].where.externalId).toBe(
      "ana@xn--exmple-cua.com"
    );
  });

  it("scopes every lookup by companyId", async () => {
    contactCreate.mockResolvedValue(makeContact(80, { companyId: 7 }));
    identityCreate.mockResolvedValue({});

    await FindOrCreateEmailContactService({
      companyId: 7,
      address: "tenant@example.com",
      emailAccountId: 5
    });

    expect(identityFindOne.mock.calls[0][0].where.companyId).toBe(7);
    expect(contactFindAll.mock.calls[0][0].where.companyId).toBe(7);
    expect(contactCreate.mock.calls[0][0].companyId).toBe(7);
    expect(identityCreate.mock.calls[0][0].companyId).toBe(7);
  });
});
