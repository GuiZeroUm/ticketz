import { QueryInterface } from "sequelize";

// Gmail thread lookup in IngestEmailService (a reply in the Gmail thread of
// one of our forwards joins the forward's ticket). Partial: IMAP rows have no
// providerThreadId. EmailMessages is new and small, so a plain (non
// concurrent) build is quick.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "email_messages_account_provider_thread_idx"
       ON "EmailMessages" ("emailAccountId", "providerThreadId")
       WHERE "providerThreadId" IS NOT NULL`
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "email_messages_account_provider_thread_idx"`
    );
  }
};
