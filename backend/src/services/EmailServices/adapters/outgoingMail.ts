import fs from "fs";
import type { OutgoingEmail } from "../types";
import { EmailSendRejectedError } from "./errors";

// Shared by the SMTP and Gmail API adapters: the same refusal for a stored
// attachment that is gone, and the same nodemailer message fields.

// Refuses (nothing sent) when a stored attachment file can no longer be read.
export const assertAttachmentsReadable = async (
  mail: OutgoingEmail
): Promise<void> => {
  const results = await Promise.all(
    mail.attachments.map(attachment =>
      fs.promises.access(attachment.path, fs.constants.R_OK).then(
        () => true,
        () => false
      )
    )
  );
  if (results.some(readable => !readable)) {
    throw new EmailSendRejectedError(
      "ERR_EMAIL_INVALID_MESSAGE",
      "attachment_missing"
    );
  }
};

// nodemailer message options (sendMail / MailComposer). The From is always
// the account address; there is never a Bcc.
export const toMailOptions = (mail: OutgoingEmail) => ({
  from: { name: mail.from.name || "", address: mail.from.address },
  to: mail.to.map(a => ({ name: a.name || "", address: a.address })),
  cc: mail.cc.map(a => ({ name: a.name || "", address: a.address })),
  subject: mail.subject,
  text: mail.text,
  html: mail.html,
  messageId: mail.messageId,
  ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
  references: mail.references,
  attachments: mail.attachments.map(a => ({
    filename: a.filename,
    contentType: a.contentType,
    path: a.path
  }))
});
