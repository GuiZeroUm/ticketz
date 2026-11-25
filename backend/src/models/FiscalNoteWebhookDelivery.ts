import {
  Table,
  Column,
  Model,
  PrimaryKey,
  DataType,
  CreatedAt
} from "sequelize-typescript";

// Entregas de webhook já processadas, para ignorar reenvios do provedor.
@Table({ tableName: "FiscalNoteWebhookDeliveries", updatedAt: false })
class FiscalNoteWebhookDelivery extends Model<FiscalNoteWebhookDelivery> {
  @PrimaryKey
  @Column(DataType.STRING(100))
  deliveryId: string;

  @Column(DataType.STRING(40))
  event: string;

  @CreatedAt
  createdAt: Date;
}

export default FiscalNoteWebhookDelivery;
