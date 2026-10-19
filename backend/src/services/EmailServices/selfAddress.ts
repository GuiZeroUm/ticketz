import { normalizeEmailAddress } from "./addresses";
import { EmailAddress, NormalizedEmail } from "./types";

// Ruling R35: mail sent BY the mailbox TO the mailbox with a foreign Reply-To
// is a website contact form (WordPress & co. sending through the account's
// own SMTP): it is inbound mail from the Reply-To person. Returns that person
// (normalized address, display name), or null when the mail does not have
// that exact shape: From = mailbox, mailbox among the To addresses (Cc/Bcc
// only is a copy of staff mail, not a form), and a valid Reply-To other
// than the mailbox. Shared by ingestion and the Gmail adapter so IMAP and
// Gmail decide the same way.
export const contactFormSender = (
  email: Pick<NormalizedEmail, "from" | "to" | "replyTo">,
  accountAddress: string
): EmailAddress | null => {
  const own = normalizeEmailAddress(accountAddress);
  if (!own || normalizeEmailAddress(email.from?.address) !== own) return null;
  if (
    !(email.to || []).some(
      entry => normalizeEmailAddress(entry?.address) === own
    )
  ) {
    return null;
  }
  const sender = (email.replyTo || [])
    .map(entry => ({
      address: normalizeEmailAddress(entry?.address) || "",
      name: entry?.name
    }))
    .find(entry => entry.address && entry.address !== own);
  if (!sender) return null;
  return sender.name
    ? { address: sender.address, name: sender.name }
    : { address: sender.address };
};
