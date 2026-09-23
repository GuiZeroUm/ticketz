import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("SgaBillingDeliveries", "documentPath", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addIndex(
      "SgaBillingDeliveries",
      ["companyId", "messageId"],
      { name: "sga_billing_deliveries_message" }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex(
      "SgaBillingDeliveries",
      "sga_billing_deliveries_message"
    );
    await queryInterface.removeColumn("SgaBillingDeliveries", "documentPath");
  }
};
