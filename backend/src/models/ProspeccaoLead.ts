import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
  AllowNull,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Ticket from "./Ticket";

@Table({ tableName: "ProspeccaoLeads" })
class ProspeccaoLead extends Model<ProspeccaoLead> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  jobId: string;

  // Id do lead no hermes-bridge. Junto com companyId forma a chave única que
  // deixa a ingestão rodar a cada poll sem duplicar nada.
  @Column
  externalId: number;

  @AllowNull
  @Column
  nome: string;

  // Só dígitos, com DDI: é por aqui que uma busca nova reconhece um lead que
  // já existe na base e o descarta.
  @AllowNull
  @Column
  telefone: string;

  @AllowNull
  @Column
  telefoneExibicao: string;

  @AllowNull
  @Column
  categoria: string;

  @AllowNull
  @Column(DataType.TEXT)
  endereco: string;

  @AllowNull
  @Column
  instagramHandle: string;

  @AllowNull
  @Column(DataType.TEXT)
  instagramBio: string;

  @AllowNull
  @Column
  instagramSeguidores: number;

  @AllowNull
  @Column
  idiomaSugerido: string;

  @Default("pendente")
  @Column
  status: string;

  @AllowNull
  @Column(DataType.TEXT)
  rascunho: string;

  @AllowNull
  @Column(DataType.TEXT)
  erro: string;

  @ForeignKey(() => Contact)
  @AllowNull
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Ticket)
  @AllowNull
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @AllowNull
  @Column
  abertoEm: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ProspeccaoLead;
