import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
  DataType,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import Invoices from "./Invoices";
import User from "./User";

// queued: na nossa fila, ainda não enviada ao provedor.
// processing: aceita pelo provedor, aguardando a prefeitura.
// pending_fiscal_data: fatura paga, mas a empresa não tem dados fiscais.
export type FiscalNoteStatus =
  | "pending_fiscal_data"
  | "queued"
  | "processing"
  | "issued"
  | "error"
  | "cancelling"
  | "cancelled";

export type FiscalNoteTrigger = "auto" | "manual";

@Table({ tableName: "FiscalNotes" })
class FiscalNote extends Model<FiscalNote> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Invoices)
  @Column
  invoiceId: number;

  @BelongsTo(() => Invoices)
  invoice: Invoices;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default("notaas")
  @Column(DataType.STRING(20))
  provider: string;

  @Column(DataType.STRING(64))
  providerInvoiceId: string | null;

  @AllowNull(false)
  @Column(DataType.STRING(64))
  reference: string;

  @Default(1)
  @Column
  emissionAttempt: number;

  @AllowNull(false)
  @Column(DataType.STRING(30))
  status: FiscalNoteStatus;

  @AllowNull(false)
  @Column(DataType.STRING(10))
  trigger: FiscalNoteTrigger;

  @Column(DataType.STRING(60))
  accessKey: string | null;

  @Column(DataType.STRING(20))
  number: string | null;

  @Column(DataType.TEXT)
  pdfUrl: string | null;

  @Column(DataType.TEXT)
  xmlUrl: string | null;

  @Default(false)
  @Column
  documentsReady: boolean;

  @Column(DataType.STRING(60))
  errorCode: string | null;

  @Column(DataType.TEXT)
  errorMessage: string | null;

  @Column(DataType.STRING(255))
  cancelReason: string | null;

  @ForeignKey(() => User)
  @Column
  requestedByUserId: number | null;

  @Column
  submittedAt: Date | null;

  @Column
  emittedAt: Date | null;

  @Column
  cancelledAt: Date | null;

  @Column
  lastSyncedAt: Date | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default FiscalNote;
