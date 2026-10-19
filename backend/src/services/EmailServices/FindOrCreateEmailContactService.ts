import { Mutex } from "async-mutex";
import { col, fn, Op, where as sqlWhere } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactIdentity from "../../models/ContactIdentity";
import { emitContact } from "../ContactServices/CreateOrUpdateContactService";
import { normalizeEmailAddress } from "./addresses";

interface Request {
  companyId: number;
  address: string;
  name?: string;
  emailAccountId: number;
}

const EMAIL_CHANNEL = "email";

// One mutex per companyId:address, removed once nobody is waiting on it. It
// only serializes callers of this process; across processes the unique index
// of ContactIdentity (companyId, channel, externalId) is the real guard.
const mutexes = new Map<string, { mutex: Mutex; users: number }>();

const runExclusive = async <T>(
  key: string,
  callback: () => Promise<T>
): Promise<T> => {
  let entry = mutexes.get(key);
  if (!entry) {
    entry = { mutex: new Mutex(), users: 0 };
    mutexes.set(key, entry);
  }
  entry.users += 1;
  try {
    return await entry.mutex.runExclusive(callback);
  } finally {
    entry.users -= 1;
    if (entry.users === 0) mutexes.delete(key);
  }
};

const isUniqueViolation = (error: unknown): boolean =>
  (error as { name?: string } | null)?.name ===
  "SequelizeUniqueConstraintError";

const findIdentityContact = async (
  companyId: number,
  address: string
): Promise<Contact | null> => {
  const identity = await ContactIdentity.findOne({
    where: { companyId, channel: EMAIL_CHANNEL, externalId: address }
  });
  if (!identity) return null;
  return Contact.findOne({ where: { id: identity.contactId, companyId } });
};

const announceNewContact = async (contact: Contact): Promise<void> => {
  try {
    await contact.reload({ include: ["tags", "extraInfo"] });
    await emitContact(contact, "create");
  } catch {
    // The contact is already committed; a failed notification must not fail
    // the message ingestion.
  }
};

const FindOrCreateEmailContactService = async ({
  companyId,
  address,
  name,
  emailAccountId
}: Request): Promise<Contact> => {
  const normalized = normalizeEmailAddress(address);
  if (!normalized) {
    throw new AppError("ERR_EMAIL_INVALID_ADDRESS", 400);
  }

  return runExclusive(`${companyId}:${normalized}`, async () => {
    // (1) identity already known
    const known = await findIdentityContact(companyId, normalized);
    if (known) return known;

    try {
      const { contact, created } = await sequelize.transaction(
        async transaction => {
          // (2) exactly one contact of the company with this email
          const matches = await Contact.findAll({
            where: {
              companyId,
              [Op.and]: [sqlWhere(fn("lower", col("email")), normalized)]
            },
            limit: 2,
            transaction
          });

          // Contact and identity are created in the same transaction so that
          // losing the race on the unique index leaves no orphan contact.
          let target: Contact;
          let isNew = false;
          if (matches.length === 1) {
            [target] = matches;
          } else {
            // (3) none, or ambiguous (several): a new email-only contact.
            target = await Contact.create(
              {
                name: name || normalized,
                number: null,
                email: normalized,
                channel: EMAIL_CHANNEL,
                companyId
              },
              { transaction }
            );
            isNew = true;
          }

          await ContactIdentity.create(
            {
              companyId,
              contactId: target.id,
              channel: EMAIL_CHANNEL,
              externalId: normalized,
              emailAccountId
            },
            { transaction }
          );

          return { contact: target, created: isNew };
        }
      );

      if (created) await announceNewContact(contact);
      return contact;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another process created the identity first; the transaction (and the
      // contact created in it) is rolled back, so read the winner outside it.
      const winner = await findIdentityContact(companyId, normalized);
      if (!winner) throw error;
      return winner;
    }
  });
};

export default FindOrCreateEmailContactService;
