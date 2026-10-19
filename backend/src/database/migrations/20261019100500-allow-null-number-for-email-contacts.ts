import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts" ALTER COLUMN "number" DROP NOT NULL`,
        { transaction }
      );
      // Só contatos do canal e-mail podem ficar sem número; qualquer outro
      // canal continua exigindo.
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts"
         ADD CONSTRAINT "contacts_number_required_unless_email"
         CHECK ("number" IS NOT NULL OR "channel" = 'email')`,
        { transaction }
      );
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts"
         DROP CONSTRAINT IF EXISTS "contacts_number_required_unless_email"`,
        { transaction }
      );
      // Restaurar NOT NULL exige que não haja linhas sem número. Pelo CHECK,
      // as únicas possíveis são de contatos com channel = 'email', então elas
      // são apagadas antes (Tickets/ContactIdentities caem por CASCADE ou
      // ficam órfãos conforme a FK de cada tabela). É perda de dados
      // intencional: o rollback desfaz o canal de e-mail.
      await queryInterface.sequelize.query(
        `DELETE FROM "Contacts" WHERE "number" IS NULL AND "channel" = 'email'`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts" ALTER COLUMN "number" SET NOT NULL`,
        { transaction }
      );
    });
  }
};
