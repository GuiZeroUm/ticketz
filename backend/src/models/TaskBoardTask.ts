import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  CreatedAt,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import TaskBoardColumn from "./TaskBoardColumn";

@Table({ tableName: "TaskBoardTasks" })
class TaskBoardTask extends Model<TaskBoardTask> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  @AllowNull(false)
  @Default(0)
  @Column
  position: number;

  @Column
  completedAt: Date;

  @AllowNull(false)
  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @ForeignKey(() => TaskBoardColumn)
  @Column
  columnId: number;

  @BelongsTo(() => TaskBoardColumn)
  column: TaskBoardColumn;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TaskBoardTask;
