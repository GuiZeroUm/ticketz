export type EmailAddress = { address: string; name?: string };

export type NormalizedAttachment = {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  contentId?: string;
  inline: boolean;
};

export type NormalizedEmail = {
  accountId: number;
  direction: "in" | "out";
  providerMessageId: string;
  providerThreadId?: string;
  internetMessageId?: string;
  inReplyTo?: string;
  references: string[];
  // An empty from.address ("") means the sender is missing or unparseable,
  // i.e. there is no usable counterpart (ruling R16); callers must not create
  // contacts or tickets from it.
  from: EmailAddress;
  replyTo: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  text: string;
  htmlSanitized?: string;
  attachments: NormalizedAttachment[];
  receivedAt: Date;
  // The provider's own arrival time (IMAP INTERNALDATE, Gmail internalDate),
  // used when the Date header is missing, invalid or in the future.
  providerDate?: Date;
  flags: string[];
  // Message-ID do envio original quando o e-mail é um aviso de não entrega
  bounceOf?: string;
};

export type OutgoingEmail = {
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  text: string;
  html: string;
  messageId: string;
  inReplyTo?: string;
  references: string[];
  attachments: { filename: string; contentType: string; path: string }[];
  providerThreadId?: string;
};
