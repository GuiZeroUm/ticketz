import Setting from "../../models/Setting";
import Contact from "../../models/Contact";

export type ContactNameSource = "manual" | "external";

const SETTING_KEY = "preserveManualContactNames";

export const preservesManualContactNames = async (
  companyId: number
): Promise<boolean> => {
  const setting = await Setting.findOne({
    where: { companyId, key: SETTING_KEY },
    attributes: ["value"]
  });

  return setting?.value === "enabled";
};

export const contactNameLockOnCreate = async (
  companyId: number,
  source: ContactNameSource,
  isGroup = false
): Promise<boolean> =>
  !isGroup &&
  source === "manual" &&
  (await preservesManualContactNames(companyId));

export const protectContactNameUpdate = async <
  T extends { name?: string; nameLocked?: boolean }
>(
  contact: Contact,
  data: T,
  source: ContactNameSource
): Promise<T> => {
  if (
    contact.isGroup ||
    data.name === undefined ||
    !(await preservesManualContactNames(contact.companyId))
  ) {
    return data;
  }

  if (source === "manual") {
    return { ...data, nameLocked: true };
  }

  if (!contact.nameLocked) {
    return data;
  }

  const protectedData = { ...data };
  delete protectedData.name;
  return protectedData as T;
};

export const preserveLockedNameOnMerge = async (
  winner: Contact,
  loser: Contact
): Promise<{ name: string; nameLocked: boolean } | null> => {
  if (
    winner.isGroup ||
    winner.nameLocked ||
    !loser.nameLocked ||
    !(await preservesManualContactNames(winner.companyId))
  ) {
    return null;
  }

  return { name: loser.name, nameLocked: true };
};
