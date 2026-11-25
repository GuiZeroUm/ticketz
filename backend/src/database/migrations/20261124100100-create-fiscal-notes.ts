import { DataTypes, Op, QueryInterface } from "sequelize";

// Notas fiscais (NFS-e) emitidas para as faturas da plataforma. Uma fatura tem
// no máximo uma nota não cancelada (índice único parcial); depois de um
// cancelamento, uma nova nota pode ser emitida. Criação condicional porque o
// banco é compartilhado entre runtimes que podem rodar o mesmo arquivo.
module.exports = {
  up: async (q: QueryInterface) => {
    const tables = (await q.showAllTables()).map(String);

    await q.sequelize.transaction(async transaction => {
      if (!tables.includes("FiscalNotes")) {
        await q.createTable(
          "FiscalNotes",
          {
            id: {
              type: DataTypes.INTEGER,
              autoIncrement: true,
              primaryKey: true,
              allowNull: false
            },
            invoiceId: {
              type: DataTypes.INTEGER,
              allowNull: false,
              references: { model: "Invoices", key: "id" },
              onDelete: "CASCADE"
            },
            companyId: {
              type: DataTypes.INTEGER,
              allowNull: false,
              references: { model: "Companies", key: "id" },
              onDelete: "CASCADE"
            },
            provider: {
              type: DataTypes.STRING(20),
              allowNull: false,
              defaultValue: "notaas"
            },
            providerInvoiceId: { type: DataTypes.STRING(64) },
            reference: { type: DataTypes.STRING(64), allowNull: false },
            emissionAttempt: {
              type: DataTypes.INTEGER,
              allowNull: false,
              defaultValue: 1
            },
            status: { type: DataTypes.STRING(30), allowNull: false },
            trigger: { type: DataTypes.STRING(10), allowNull: false },
            accessKey: { type: DataTypes.STRING(60) },
            number: { type: DataTypes.STRING(20) },
            pdfUrl: { type: DataTypes.TEXT },
            xmlUrl: { type: DataTypes.TEXT },
            documentsReady: {
              type: DataTypes.BOOLEAN,
              allowNull: false,
              defaultValue: false
            },
            errorCode: { type: DataTypes.STRING(60) },
            errorMessage: { type: DataTypes.TEXT },
            cancelReason: { type: DataTypes.STRING(255) },
            requestedByUserId: {
              type: DataTypes.INTEGER,
              references: { model: "Users", key: "id" },
              onDelete: "SET NULL"
            },
            submittedAt: { type: DataTypes.DATE },
            emittedAt: { type: DataTypes.DATE },
            cancelledAt: { type: DataTypes.DATE },
            lastSyncedAt: { type: DataTypes.DATE },
            createdAt: { type: DataTypes.DATE, allowNull: false },
            updatedAt: { type: DataTypes.DATE, allowNull: false }
          },
          { transaction }
        );
        await q.addIndex("FiscalNotes", ["invoiceId"], {
          unique: true,
          name: "fiscal_notes_one_active_per_invoice",
          where: { status: { [Op.ne]: "cancelled" } },
          transaction
        });
        await q.addIndex("FiscalNotes", ["providerInvoiceId"], {
          unique: true,
          name: "fiscal_notes_provider_invoice_id",
          transaction
        });
        await q.addIndex("FiscalNotes", ["status", "updatedAt"], {
          name: "fiscal_notes_status_updated",
          transaction
        });
        await q.addIndex("FiscalNotes", ["companyId"], {
          name: "fiscal_notes_company",
          transaction
        });
      }

      if (!tables.includes("FiscalNoteWebhookDeliveries")) {
        await q.createTable(
          "FiscalNoteWebhookDeliveries",
          {
            deliveryId: {
              type: DataTypes.STRING(100),
              primaryKey: true,
              allowNull: false
            },
            event: { type: DataTypes.STRING(40), allowNull: false },
            createdAt: { type: DataTypes.DATE, allowNull: false }
          },
          { transaction }
        );
      }
    });
  },

  down: async (q: QueryInterface) => {
    await q.dropTable("FiscalNoteWebhookDeliveries");
    await q.dropTable("FiscalNotes");
  }
};
