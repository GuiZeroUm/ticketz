import { QueryInterface } from "sequelize";

const indexName = "idx_messages_ticket_company_createdat";

export default {
  up: async (queryInterface: QueryInterface) => {
    // Keep message reads and writes available while the index is built.
    await queryInterface.sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON "Messages" ("ticketId", "companyId", "createdAt" DESC)`
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`
    );
  }
};
