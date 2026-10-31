import { QueryInterface } from "sequelize";

// CREATE INDEX CONCURRENTLY não roda dentro de transação: cada comando vai em
// uma chamada própria e a migration não abre transação. IF NOT EXISTS em tudo,
// porque o banco é compartilhado entre instalações que rodam as mesmas
// migrations no boot.
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm"
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_body_lower_trgm ON "Messages" USING gin (lower(body) gin_trgm_ops)'
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_name_lower_trgm ON "Contacts" USING gin (lower(name) gin_trgm_ops)'
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_number_trgm ON "Contacts" USING gin (number gin_trgm_ops)'
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      "DROP INDEX CONCURRENTLY IF EXISTS contacts_number_trgm"
    );
    await queryInterface.sequelize.query(
      "DROP INDEX CONCURRENTLY IF EXISTS contacts_name_lower_trgm"
    );
    await queryInterface.sequelize.query(
      "DROP INDEX CONCURRENTLY IF EXISTS messages_body_lower_trgm"
    );
  }
};
