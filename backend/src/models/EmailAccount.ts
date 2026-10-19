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
import Queue from "./Queue";
import User from "./User";
import Ticket from "./Ticket";
import { encryptSecret, decryptSecret } from "../helpers/cryptoSecret";

export type EmailProvider = "gmail_api" | "imap_smtp";
export type EmailPreset = "gmail" | "icloud" | "custom";
export type EmailAccountStatus =
  "connecting" | "active" | "reauth_required" | "error" | "disabled";

export type EmailCredentials = { password?: string; refreshToken?: string };

@Table
class EmailAccount extends Model<EmailAccount> {
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

  @AllowNull(false)
  @Column(DataType.STRING)
  provider: EmailProvider;

  @AllowNull(false)
  @Column(DataType.STRING)
  preset: EmailPreset;

  @AllowNull(false)
  @Column(DataType.STRING)
  name: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  address: string;

  @AllowNull(false)
  @Default("connecting")
  @Column(DataType.STRING)
  status: EmailAccountStatus;

  @Column(DataType.STRING)
  externalId: string | null;

  @Default([])
  @Column(DataType.JSONB)
  scopes: string[];

  @Column(DataType.STRING)
  imapHost: string | null;

  @Column(DataType.INTEGER)
  imapPort: number | null;

  @Column(DataType.BOOLEAN)
  imapSecure: boolean | null;

  @Column(DataType.STRING)
  smtpHost: string | null;

  @Column(DataType.INTEGER)
  smtpPort: number | null;

  @Column(DataType.BOOLEAN)
  smtpSecure: boolean | null;

  // JSON cifrado (encryptSecret). Acesso só por getCredentials/setCredentials,
  // e nunca sai em toJSON.
  @Column(DataType.TEXT)
  credentials: string | null;

  @Column(DataType.JSONB)
  syncCursor: Record<string, unknown> | null;

  @Column(DataType.DATE)
  lastSyncAt: Date | null;

  @Column(DataType.JSONB)
  lastError: { code: string; at: string } | null;

  @Default(0)
  @Column(DataType.INTEGER)
  errorCount: number;

  @ForeignKey(() => Queue)
  @Column
  queueId: number | null;

  @BelongsTo(() => Queue)
  queue: Queue;

  @ForeignKey(() => User)
  @Column
  connectedByUserId: number | null;

  @BelongsTo(() => User, "connectedByUserId")
  connectedByUser: User;

  @Column(DataType.DATE)
  watchExpiresAt: Date | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  getCredentials(): EmailCredentials | null {
    const raw = this.getDataValue("credentials");
    if (!raw) return null;
    const plain = decryptSecret(raw);
    if (!plain) return null;
    try {
      return JSON.parse(plain) as EmailCredentials;
    } catch {
      return null;
    }
  }

  setCredentials(credentials: EmailCredentials | null): void {
    this.setDataValue(
      "credentials",
      credentials ? encryptSecret(JSON.stringify(credentials)) : null
    );
  }

  toJSON(): Record<string, unknown> {
    const safe = { ...(super.toJSON() as unknown as Record<string, unknown>) };
    delete safe.credentials;
    delete safe.syncCursor;
    return safe;
  }
}

export default EmailAccount;
