import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn("Users", "groupAccessIds", {
      type: DataTypes.JSONB,
      allowNull: true
    });
  },
  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn("Users", "groupAccessIds");
  }
};
