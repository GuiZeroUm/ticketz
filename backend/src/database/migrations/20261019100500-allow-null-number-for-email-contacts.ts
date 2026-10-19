import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts" ALTER COLUMN "number" DROP NOT NULL`,
        { transaction }
      );
      // Só contatos do canal e-mail podem ficar sem número; qualquer outro
      // canal continua exigindo. Contacts.channel aceita NULL e um CHECK com
      // resultado NULL passa, por isso o COALESCE: channel NULL sem número
      // tem que ser rejeitado.
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts"
         ADD CONSTRAINT "contacts_number_required_unless_email"
         CHECK ("number" IS NOT NULL OR COALESCE("channel", '') = 'email')`,
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
      // são apagadas antes (Tickets/ContactIdentities caem por CASCADE). É
      // perda de dados intencional: o rollback desfaz o canal de e-mail. Se
      // sobrar alguma linha sem número de outro canal, o SET NOT NULL falha
      // alto em vez de apagar dados que não são do canal de e-mail.
      await queryInterface.sequelize.query(
        `DELETE FROM "Contacts"
         WHERE "number" IS NULL AND COALESCE("channel", '') = 'email'`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Contacts" ALTER COLUMN "number" SET NOT NULL`,
        { transaction }
      );
    });
  }
};
