import { DataTypes, QueryInterface } from "sequelize";

// Reply-To of received emails: the default recipient of a reply (Task 12).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("EmailMessages", "replyToAddresses", {
      type: DataTypes.JSONB,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("EmailMessages", "replyToAddresses");
  }
};
