import { DataTypes, QueryInterface } from "sequelize";

const table = "SgaBillingDeliveries";
const column = "visibilitySyncedAt";
const indexName = "sga_billing_deliveries_visibility_pending";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // The database is shared by two runtimes that both migrate on boot, so
    // this must be safe to run twice.
    const columns = await queryInterface.describeTable(table);
    if (!columns[column]) {
      await queryInterface.addColumn(table, column, {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON "${table}" ("companyId", id DESC) WHERE status = 'SENT' AND "${column}" IS NULL AND "messageId" IS NOT NULL AND "contactId" IS NOT NULL`
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${indexName}`);
    const columns = await queryInterface.describeTable(table);
    if (columns[column]) {
      await queryInterface.removeColumn(table, column);
    }
  }
};
