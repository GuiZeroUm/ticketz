import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.addColumn(
        "Tickets",
        "emailAccountId",
        {
          type: DataTypes.INTEGER,
          references: { model: "EmailAccounts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
          allowNull: true
        },
        { transaction }
      );
      await queryInterface.addColumn(
        "Tickets",
        "emailThreadKey",
        { type: DataTypes.STRING, allowNull: true },
        { transaction }
      );
      await queryInterface.addColumn(
        "Tickets",
        "subject",
        { type: DataTypes.STRING(998), allowNull: true },
        { transaction }
      );
      await queryInterface.addIndex(
        "Tickets",
        ["companyId", "emailAccountId", "emailThreadKey"],
        { name: "tickets_email_thread_idx", transaction }
      );
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.removeIndex("Tickets", "tickets_email_thread_idx", {
        transaction
      });
      await queryInterface.removeColumn("Tickets", "subject", { transaction });
      await queryInterface.removeColumn("Tickets", "emailThreadKey", {
        transaction
      });
      await queryInterface.removeColumn("Tickets", "emailAccountId", {
        transaction
      });
    });
  }
};
