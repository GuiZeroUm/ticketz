import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  DataType,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import EmailAccount from "./EmailAccount";

@Table
class ContactIdentity extends Model<ContactIdentity> {
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

  @ForeignKey(() => Contact)
  @AllowNull(false)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @AllowNull(false)
  @Column(DataType.STRING)
  channel: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  externalId: string;

  @ForeignKey(() => EmailAccount)
  @Column
  emailAccountId: number | null;

  @BelongsTo(() => EmailAccount)
  emailAccount: EmailAccount;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContactIdentity;
