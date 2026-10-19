import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.createTable(
        "EmailAccounts",
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
          provider: { type: DataTypes.STRING, allowNull: false },
          preset: { type: DataTypes.STRING, allowNull: false },
          name: { type: DataTypes.STRING, allowNull: false },
          // Sempre em minúsculo; a unicidade por empresa depende disso.
          address: { type: DataTypes.STRING, allowNull: false },
          status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "connecting"
          },
          externalId: { type: DataTypes.STRING, allowNull: true },
          scopes: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
          },
          // NULL para contas Gmail (OAuth), preenchidos só em IMAP/SMTP.
          imapHost: { type: DataTypes.STRING, allowNull: true },
          imapPort: { type: DataTypes.INTEGER, allowNull: true },
          imapSecure: { type: DataTypes.BOOLEAN, allowNull: true },
          smtpHost: { type: DataTypes.STRING, allowNull: true },
          smtpPort: { type: DataTypes.INTEGER, allowNull: true },
          smtpSecure: { type: DataTypes.BOOLEAN, allowNull: true },
          // JSON cifrado com encryptSecret (senha ou refresh token).
          credentials: { type: DataTypes.TEXT, allowNull: true },
          syncCursor: { type: DataTypes.JSONB, allowNull: true },
          lastSyncAt: { type: DataTypes.DATE, allowNull: true },
          // { code, at } - nunca texto livre do provedor.
          lastError: { type: DataTypes.JSONB, allowNull: true },
          errorCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
          },
          queueId: {
            type: DataTypes.INTEGER,
            references: { model: "Queues", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
            allowNull: true
          },
          connectedByUserId: {
            type: DataTypes.INTEGER,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
            allowNull: true
          },
          watchExpiresAt: { type: DataTypes.DATE, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false }
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "EmailAccounts"
         ADD CONSTRAINT "email_accounts_provider_check"
         CHECK ("provider" IN ('gmail_api', 'imap_smtp'))`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "EmailAccounts"
         ADD CONSTRAINT "email_accounts_preset_check"
         CHECK ("preset" IN ('gmail', 'icloud', 'custom'))`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "EmailAccounts"
         ADD CONSTRAINT "email_accounts_status_check"
         CHECK ("status" IN ('connecting', 'active', 'reauth_required', 'error', 'disabled'))`,
        { transaction }
      );

      await queryInterface.addIndex("EmailAccounts", ["companyId", "address"], {
        unique: true,
        name: "email_accounts_company_address_unique",
        transaction
      });
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("EmailAccounts");
  }
};
