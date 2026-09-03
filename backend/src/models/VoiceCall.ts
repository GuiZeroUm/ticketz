import {
  AutoIncrement,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import Queue from "./Queue";
import User from "./User";
import VoiceConnection from "./VoiceConnection";
import Whatsapp from "./Whatsapp";

@Table
class VoiceCall extends Model<VoiceCall> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column(DataType.STRING(128))
  externalCallId: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => VoiceConnection)
  @Column
  voiceConnectionId: number;

  @BelongsTo(() => VoiceConnection)
  voiceConnection: VoiceConnection;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column(DataType.JSONB)
  queueIds: number[];

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Column(DataType.STRING(64))
  number: string;

  @Column(DataType.STRING(16))
  direction: string;

  @Column(DataType.STRING(16))
  state: "ringing" | "accepted" | "rejected" | "missed" | "ended" | "failed";

  @Column
  startedAt: Date;

  @Column
  acceptedAt: Date;

  @Column
  endedAt: Date;

  @Column
  durationSeconds: number;

  @Column(DataType.TEXT)
  error: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default VoiceCall;
