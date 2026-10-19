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
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import EmailMessage from "./EmailMessage";

@Table
class EmailAttachment extends Model<EmailAttachment> {
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

  @ForeignKey(() => EmailMessage)
  @AllowNull(false)
  @Column
  emailMessageId: number;

  @BelongsTo(() => EmailMessage)
  emailMessage: EmailMessage;

  @AllowNull(false)
  @Column(DataType.STRING)
  filename: string;

  @Column(DataType.STRING)
  contentType: string | null;

  @Column(DataType.INTEGER)
  size: number | null;

  @Column(DataType.STRING)
  storageKey: string | null;

  @Column(DataType.STRING)
  contentId: string | null;

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  inline: boolean;

  @Column(DataType.STRING)
  skippedReason: string | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default EmailAttachment;
