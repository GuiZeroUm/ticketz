import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.createTable(
        "EmailMessages",
        {
          id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false
          },
          companyId: {
            type: DataTypes.INTEGER,
            references: { model: "Companies", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
            allowNull: false
          },
          emailAccountId: {
            type: DataTypes.INTEGER,
            references: { model: "EmailAccounts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
            allowNull: true
          },
          ticketId: {
            type: DataTypes.INTEGER,
            references: { model: "Tickets", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
            allowNull: false
          },
          // Messages.id (STRING) da mensagem do chat que representa este e-mail.
          messageId: { type: DataTypes.STRING, allowNull: false },
          direction: { type: DataTypes.STRING, allowNull: false },
          providerMessageId: { type: DataTypes.STRING, allowNull: true },
          providerThreadId: { type: DataTypes.STRING, allowNull: true },
          internetMessageId: { type: DataTypes.STRING, allowNull: true },
          inReplyTo: { type: DataTypes.STRING, allowNull: true },
          references: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
          },
          subject: { type: DataTypes.STRING(998), allowNull: true },
          fromAddress: { type: DataTypes.JSONB, allowNull: true },
          toAddresses: { type: DataTypes.JSONB, allowNull: true },
          ccAddresses: { type: DataTypes.JSONB, allowNull: true },
          htmlSanitized: { type: DataTypes.TEXT, allowNull: true },
          receivedAt: { type: DataTypes.DATE, allowNull: true },
          flags: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
          },
          sendStatus: { type: DataTypes.STRING, allowNull: true },
          sendError: { type: DataTypes.JSONB, allowNull: true },
          userId: {
            type: DataTypes.INTEGER,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
            allowNull: true
          },
          idempotencyKey: { type: DataTypes.STRING, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false }
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "EmailMessages"
         ADD CONSTRAINT "email_messages_direction_check"
         CHECK ("direction" IN ('in', 'out'))`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "EmailMessages"
         ADD CONSTRAINT "email_messages_send_status_check"
         CHECK ("sendStatus" IS NULL OR "sendStatus" IN ('queued', 'sent', 'failed', 'unknown'))`,
        { transaction }
      );

      // Índices únicos parciais por SQL cru: o addIndex do Sequelize escreve
      // o WHERE com operadores de símbolo, menos legível e mais frágil.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "email_messages_provider_unique"
         ON "EmailMessages" ("companyId", "emailAccountId", "providerMessageId")
         WHERE "providerMessageId" IS NOT NULL`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "email_messages_idempotency_unique"
         ON "EmailMessages" ("companyId", "idempotencyKey")
         WHERE "idempotencyKey" IS NOT NULL`,
        { transaction }
      );
      await queryInterface.addIndex(
        "EmailMessages",
        ["emailAccountId", "internetMessageId"],
        { name: "email_messages_account_internet_message_idx", transaction }
      );
      await queryInterface.addIndex("EmailMessages", ["ticketId"], {
        name: "email_messages_ticket_idx",
        transaction
      });
      await queryInterface.addIndex("EmailMessages", ["messageId"], {
        name: "email_messages_message_idx",
        transaction
      });
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("EmailMessages");
  }
};
