import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn("Tickets", "closedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE "Tickets" AS ticket
      SET "closedAt" = COALESCE(
        (SELECT MAX(tracking."finishedAt")
         FROM "TicketTraking" AS tracking
         WHERE tracking."ticketId" = ticket.id),
        ticket."updatedAt"
      )
      WHERE ticket.status = 'closed';

      CREATE OR REPLACE FUNCTION set_ticket_closed_at() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'closed' AND
           (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'closed') THEN
          NEW."closedAt" := CURRENT_TIMESTAMP;
        ELSIF NEW.status <> 'closed' THEN
          NEW."closedAt" := NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER tickets_closed_at_transition
      BEFORE INSERT OR UPDATE OF status ON "Tickets"
      FOR EACH ROW EXECUTE FUNCTION set_ticket_closed_at();

      CREATE INDEX tickets_closed_at_lookup
      ON "Tickets" ("companyId", "contactId", "whatsappId", "closedAt" DESC)
      WHERE status = 'closed' AND channel = 'whatsapp' AND "isGroup" = false;
    `);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS tickets_closed_at_lookup;
      DROP TRIGGER IF EXISTS tickets_closed_at_transition ON "Tickets";
      DROP FUNCTION IF EXISTS set_ticket_closed_at();
    `);
    await queryInterface.removeColumn("Tickets", "closedAt");
  }
};
