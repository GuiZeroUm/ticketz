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
  HasMany,
  DefaultScope,
  Scopes
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

const SECRET_ATTRIBUTES = ["credentials", "syncCursor"];

const stripSecrets = (values: Record<string, unknown>) => {
  const safe = { ...values };
  SECRET_ATTRIBUTES.forEach(attribute => delete safe[attribute]);
  return safe;
};

// Segredos nunca saem do banco por padrão: o escopo padrão exclui `credentials`
// (JSON cifrado) e `syncCursor`, inclusive quando a conta vem em um include de
// Ticket/EmailMessage/ContactIdentity. Quem precisa deles (conexão IMAP/SMTP,
// refresh de token, sync) carrega com `EmailAccount.scope("withSecrets")`.
// Instâncias carregadas sem o escopo `withSecrets` retornam null em
// getCredentials(), porque a coluna nem foi selecionada. Em camadas extras,
// toJSON() e get({ plain: true }) também removem os dois campos, já que o
// Sequelize serializa includes aninhados por get() e não por toJSON().
@DefaultScope(() => ({ attributes: { exclude: SECRET_ATTRIBUTES } }))
@Scopes(() => ({ withSecrets: {} }))
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
    return stripSecrets(super.toJSON() as unknown as Record<string, unknown>);
  }
}

// Instância pai chama get({ plain: true }) nos filhos de um include, sem passar
// pelo toJSON do filho. Sobrescrever só o caso plain mantém o resto de get()
// (usado pelo próprio Sequelize em save/changed) intacto.
const originalGet = EmailAccount.prototype.get;
EmailAccount.prototype.get = function get(
  this: EmailAccount,
  ...args: unknown[]
) {
  const result = (originalGet as (...a: unknown[]) => unknown).apply(
    this,
    args
  );
  const options = args.length === 1 ? args[0] : args[1];
  const isPlainObjectRead =
    args.length <= 1 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    (options as { plain?: boolean }).plain === true;
  if (isPlainObjectRead && result && typeof result === "object") {
    return stripSecrets(result as Record<string, unknown>);
  }
  return result;
} as typeof originalGet;

export default EmailAccount;
