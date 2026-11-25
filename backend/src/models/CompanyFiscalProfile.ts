import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";

export type FiscalDocumentType = "cpf" | "cnpj";

// Dados do tomador da NFS-e: uma linha por empresa cliente.
@Table({ tableName: "CompanyFiscalProfiles" })
class CompanyFiscalProfile extends Model<CompanyFiscalProfile> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.STRING(4))
  documentType: FiscalDocumentType | null;

  @Column(DataType.STRING(14))
  document: string | null;

  @Column(DataType.STRING(150))
  legalName: string | null;

  @Column(DataType.STRING(30))
  municipalRegistration: string | null;

  @Column(DataType.STRING(150))
  email: string | null;

  @Column(DataType.STRING(8))
  zipCode: string | null;

  @Column(DataType.STRING(150))
  street: string | null;

  @Column(DataType.STRING(20))
  number: string | null;

  @Column(DataType.STRING(100))
  complement: string | null;

  @Column(DataType.STRING(100))
  district: string | null;

  @Column(DataType.STRING(100))
  city: string | null;

  @Column(DataType.STRING(7))
  cityIbgeCode: string | null;

  @Column(DataType.STRING(2))
  state: string | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CompanyFiscalProfile;
