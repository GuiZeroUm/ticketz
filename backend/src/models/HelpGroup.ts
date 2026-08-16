import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  HasMany
} from "sequelize-typescript";
import Help from "./Help";

/**
 * Card de assunto da Central de Ajuda ("Chatbot", "Campanhas", ...).
 *
 * O publico (audience) vive aqui e o conteudo herda: manter o campo tambem em
 * Help criaria duas fontes de verdade que divergem.
 */
@Table({
  tableName: "HelpGroups"
})
class HelpGroup extends Model<HelpGroup> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  @Column(DataType.TEXT)
  subtitle: string;

  // Nome do icone MUI. A galeria curada em components/IconPicker/icons.js e a
  // unica fonte: nomes fora dela caem no fallback HelpOutline.
  @AllowNull(false)
  @Default("HelpOutline")
  @Column
  icon: string;

  // "company" (tutoriais do tenant) ou "partner" (tutoriais de revenda).
  @AllowNull(false)
  @Default("company")
  @Column
  audience: string;

  // Posicao entre os cards do mesmo publico (0..N-1).
  @AllowNull(false)
  @Default(0)
  @Column
  order: number;

  @AllowNull(false)
  @Default(true)
  @Column
  isActive: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Help, { onDelete: "CASCADE" })
  contents: Help[];
}

export default HelpGroup;
