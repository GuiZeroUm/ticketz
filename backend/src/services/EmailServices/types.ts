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
  from: EmailAddress;
  replyTo: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  text: string;
  htmlSanitized?: string;
  attachments: NormalizedAttachment[];
  receivedAt: Date;
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
