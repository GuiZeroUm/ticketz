import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany
} from "sequelize-typescript";
import Company from "./Company";
import EmailAccount from "./EmailAccount";
import Ticket from "./Ticket";
import User from "./User";
import EmailAttachment from "./EmailAttachment";

export type EmailAddress = { name?: string; address: string };
export type EmailSendStatus = "queued" | "sent" | "failed" | "unknown";

@Table
class EmailMessage extends Model<EmailMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => EmailAccount)
  @Column
  emailAccountId: number | null;

  @BelongsTo(() => EmailAccount)
  emailAccount: EmailAccount;

  @ForeignKey(() => Ticket)
  @AllowNull(false)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  // Messages.id da mensagem do chat que representa este e-mail.
  @AllowNull(false)
  @Column(DataType.STRING)
  messageId: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  direction: "in" | "out";

  @Column(DataType.STRING)
  providerMessageId: string | null;

  @Column(DataType.STRING)
  providerThreadId: string | null;

  @Column(DataType.STRING)
  internetMessageId: string | null;

  @Column(DataType.STRING)
  inReplyTo: string | null;

  @Default([])
  @Column(DataType.JSONB)
  references: string[];

  @Column(DataType.STRING(998))
  subject: string | null;

  @Column(DataType.JSONB)
  fromAddress: EmailAddress | null;

  // Reply-To of received emails (null for sends and older rows)
  @Column(DataType.JSONB)
  replyToAddresses: EmailAddress[] | null;

  @Column(DataType.JSONB)
  toAddresses: EmailAddress[] | null;

  @Column(DataType.JSONB)
  ccAddresses: EmailAddress[] | null;

  @Column(DataType.TEXT)
  htmlSanitized: string | null;

  @Column(DataType.DATE)
  receivedAt: Date | null;

  @Default([])
  @Column(DataType.JSONB)
  flags: string[];

  @Column(DataType.STRING)
  sendStatus: EmailSendStatus | null;

  @Column(DataType.JSONB)
  sendError: { code: string; at?: string } | null;

  @ForeignKey(() => User)
  @Column
  userId: number | null;

  @BelongsTo(() => User)
  user: User;

  @Column(DataType.STRING)
  idempotencyKey: string | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => EmailAttachment)
  attachments: EmailAttachment[];
}

export default EmailMessage;
