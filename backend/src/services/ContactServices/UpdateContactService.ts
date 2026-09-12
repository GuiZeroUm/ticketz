import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import { isValidBirthday } from "../ScheduleServices/recurrence";
import ContactCustomField from "../../models/ContactCustomField";

interface ExtraInfo {
  id?: number;
  managedBy?: string;
  name: string;
  value: string;
}
interface ContactData {
  email?: string;
  number?: string;
  name?: string;
  extraInfo?: ExtraInfo[];
  disableBot?: boolean;
  language?: string;
  nickname?: string;
  birthdayDay?: number | null;
  birthdayMonth?: number | null;
}

interface Request {
  contactData: ContactData;
  contactId: string;
  companyId: number;
}

export function websocketUpdateContact(
  contact: Contact,
  moreChannels?: string[]
) {
  const io = getIO();
  let ioStack = io.to(`company-${contact.companyId}-mainchannel`);

  if (moreChannels) {
    moreChannels.forEach(channel => {
      ioStack = ioStack.to(channel);
    });
  }

  ioStack.emit(`company-${contact.companyId}-contact`, {
    action: "update",
    contact
  });
}

const UpdateContactService = async ({
  contactData,
  contactId,
  companyId
}: Request): Promise<Contact> => {
  const {
    email,
    name,
    number,
    extraInfo,
    disableBot,
    language,
    nickname,
    birthdayDay,
    birthdayMonth
  } = contactData;
  const normalizedBirthdayDay = birthdayDay ? Number(birthdayDay) : null;
  const normalizedBirthdayMonth = birthdayMonth ? Number(birthdayMonth) : null;
  if (!isValidBirthday(normalizedBirthdayDay, normalizedBirthdayMonth)) {
    throw new AppError("ERR_INVALID_BIRTHDAY", 400);
  }

  const contact = await Contact.findOne({
    where: { id: contactId },
    attributes: [
      "id",
      "name",
      "number",
      "email",
      "companyId",
      "profilePicUrl",
      "language",
      "nickname",
      "birthdayDay",
      "birthdayMonth"
    ],
    include: ["tags", "extraInfo"]
  });

  if (contact?.companyId !== companyId) {
    throw new AppError("Não é possível alterar registros de outra empresa");
  }

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  if (extraInfo) {
    await Promise.all(
      extraInfo.map(async info => {
        const existing = contact.extraInfo.find(
          field => field.id === Number(info.id)
        );
        // Never trust client-supplied ownership or allow stale forms to overwrite SGA.
        if (info.managedBy || existing?.managedBy) return;
        if (info.id && !existing) throw new AppError("ERR_NO_PERMISSION", 403);
        if (existing) {
          await ContactCustomField.update(
            { name: info.name, value: info.value },
            {
              where: { id: existing.id, contactId: contact.id, managedBy: null }
            }
          );
        } else {
          await ContactCustomField.create({
            name: info.name,
            value: info.value,
            contactId: contact.id
          });
        }
      })
    );

    await Promise.all(
      contact.extraInfo.map(async oldInfo => {
        const stillExists = extraInfo.findIndex(info => info.id === oldInfo.id);

        if (stillExists === -1 && !oldInfo.managedBy) {
          await ContactCustomField.destroy({
            where: { id: oldInfo.id, contactId: contact.id, managedBy: null }
          });
        }
      })
    );
  }

  try {
    await contact.update({
      name,
      number,
      email,
      disableBot,
      language,
      nickname,
      birthdayDay: normalizedBirthdayDay,
      birthdayMonth: normalizedBirthdayMonth
    });
  } catch (e) {
    if (e.original?.constraint === "number_companyid_unique") {
      throw new AppError("ERR_DUPLICATED_CONTACT");
    }
    throw e;
  }

  await contact.reload({
    attributes: [
      "id",
      "name",
      "number",
      "email",
      "profilePicUrl",
      "language",
      "nickname",
      "birthdayDay",
      "birthdayMonth"
    ],
    include: ["tags", "extraInfo"]
  });

  return contact;
};

export default UpdateContactService;
