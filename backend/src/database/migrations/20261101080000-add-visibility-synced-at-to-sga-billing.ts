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

    // Deliveries whose message is already projected are done. Without this the
    // first cycle would re-add billing tags that attendants removed by hand.
    await queryInterface.sequelize.query(
      `UPDATE "${table}" d SET "${column}" = clock_timestamp() WHERE d.status = 'SENT' AND d."${column}" IS NULL AND EXISTS (SELECT 1 FROM "Messages" m WHERE m.id = d."messageId" AND m."companyId" = d."companyId")`
    );

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
