import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("SgaSnapshots", {
      companyId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: "Companies", key: "id" },
        onDelete: "CASCADE"
      },
      data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      syncedAt: { type: DataTypes.DATE, allowNull: true },
      attemptedAt: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "idle"
      },
      error: { type: DataTypes.STRING, allowNull: true }
    });
    await queryInterface.createTable("SgaContactLinks", {
      companyId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: "Companies", key: "id" },
        onDelete: "CASCADE"
      },
      memberId: { type: DataTypes.STRING, primaryKey: true },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Contacts", key: "id" },
        onDelete: "SET NULL"
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onDelete: "SET NULL"
      },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("SgaContactLinks");
    await queryInterface.dropTable("SgaSnapshots");
  }
};
