import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.createTable(
        "EmailAttachments",
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
          emailMessageId: {
            type: DataTypes.INTEGER,
            references: { model: "EmailMessages", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
            allowNull: false
          },
          filename: { type: DataTypes.STRING, allowNull: false },
          contentType: { type: DataTypes.STRING, allowNull: true },
          size: { type: DataTypes.INTEGER, allowNull: true },
          // NULL quando o anexo foi ignorado (ver skippedReason).
          storageKey: { type: DataTypes.STRING, allowNull: true },
          contentId: { type: DataTypes.STRING, allowNull: true },
          inline: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
          },
          skippedReason: { type: DataTypes.STRING, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false }
        },
        { transaction }
      );

      await queryInterface.addIndex("EmailAttachments", ["emailMessageId"], {
        name: "email_attachments_message_idx",
        transaction
      });
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("EmailAttachments");
  }
};
