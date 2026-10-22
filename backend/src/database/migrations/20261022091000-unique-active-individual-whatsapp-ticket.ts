import { QueryInterface } from "sequelize";

// Deploy after every runtime uses the contact advisory lock. The table lock
// makes reconciliation and index creation one atomic operation, so an arrival
// cannot open another ticket between them.
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        'LOCK TABLE "Tickets" IN SHARE ROW EXCLUSIVE MODE',
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE TEMP TABLE ticket_duplicate_losers ON COMMIT DROP AS
         WITH duplicate_contacts AS (
           SELECT "companyId", "contactId", "whatsappId"
           FROM "Tickets"
           WHERE channel = 'whatsapp' AND "isGroup" = false
             AND status IN ('open', 'pending') AND "whatsappId" IS NOT NULL
           GROUP BY "companyId", "contactId", "whatsappId"
           HAVING COUNT(*) > 1
         ), ranked AS (
           SELECT ticket.id,
             ROW_NUMBER() OVER (
               PARTITION BY ticket."companyId", ticket."contactId", ticket."whatsappId"
               ORDER BY latest_message."createdAt" DESC NULLS LAST,
                        ticket."updatedAt" DESC, ticket.id DESC
             ) AS position
           FROM "Tickets" AS ticket
           JOIN duplicate_contacts AS duplicate
             ON duplicate."companyId" = ticket."companyId"
            AND duplicate."contactId" = ticket."contactId"
            AND duplicate."whatsappId" = ticket."whatsappId"
           LEFT JOIN LATERAL (
             SELECT message."createdAt" FROM "Messages" AS message
             WHERE message."ticketId" = ticket.id
             ORDER BY message."createdAt" DESC LIMIT 1
           ) AS latest_message ON true
           WHERE ticket.channel = 'whatsapp' AND ticket."isGroup" = false
             AND ticket.status IN ('open', 'pending')
         )
         SELECT id FROM ranked WHERE position > 1;

         UPDATE "TicketTraking" AS tracking
         SET "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         FROM ticket_duplicate_losers AS loser
         WHERE tracking."ticketId" = loser.id AND tracking."finishedAt" IS NULL;

         UPDATE "Tickets" AS ticket
         SET status = 'closed', "updatedAt" = CURRENT_TIMESTAMP
         FROM ticket_duplicate_losers AS loser
         WHERE ticket.id = loser.id;

         CREATE UNIQUE INDEX tickets_one_active_individual_whatsapp
         ON "Tickets" ("companyId", "contactId", "whatsappId")
         WHERE channel = 'whatsapp' AND "isGroup" = false
           AND status IN ('open', 'pending') AND "whatsappId" IS NOT NULL;`,
        { transaction }
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS tickets_one_active_individual_whatsapp"
    );
  }
};
