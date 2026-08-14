import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  Default
} from "sequelize-typescript";

@Table({
  tableName: "Helps"
})
class Help extends Model<Help> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  title: string;

  @Column
  description: string;

  @Column
  video: string;

  @Column
  link: string;

  // "company" (tutoriais do tenant) ou "partner" (tutoriais de revenda).
  @Default("company")
  @Column
  audience: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Help;
