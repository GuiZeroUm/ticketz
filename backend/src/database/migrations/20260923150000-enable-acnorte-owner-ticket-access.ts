import { QueryInterface, QueryTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const companies = (await queryInterface.sequelize.query(
      `SELECT "id" FROM "Companies" WHERE LOWER("slug") = 'acnorte'`,
      { type: QueryTypes.SELECT }
    )) as Array<{ id: number }>;

    await Promise.all(
      companies.map(async company => {
        await queryInterface.sequelize.query(
          `INSERT INTO "Settings" ("key", "value", "companyId", "createdAt", "updatedAt")
         SELECT :key, :value, :companyId, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM "Settings" WHERE "companyId" = :companyId AND "key" = :key
         )`,
          {
            replacements: {
              key: "ticketAccessMode",
              value: "owner",
              companyId: company.id
            }
          }
        );
        await queryInterface.sequelize.query(
          `UPDATE "Settings" SET "value" = 'owner', "updatedAt" = NOW()
         WHERE "companyId" = :companyId AND "key" = 'ticketAccessMode'`,
          { replacements: { companyId: company.id } }
        );

        await queryInterface.sequelize.query(
          `INSERT INTO "Settings" ("key", "value", "companyId", "createdAt", "updatedAt")
         SELECT :key, :value, :companyId, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM "Settings" WHERE "companyId" = :companyId AND "key" = :key
         )`,
          {
            replacements: {
              key: "messageVisibility",
              value: "ticket",
              companyId: company.id
            }
          }
        );
        await queryInterface.sequelize.query(
          `UPDATE "Settings" SET "value" = 'ticket', "updatedAt" = NOW()
         WHERE "companyId" = :companyId AND "key" = 'messageVisibility'`,
          { replacements: { companyId: company.id } }
        );
      })
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM "Settings"
       WHERE "companyId" IN (
         SELECT "id" FROM "Companies" WHERE LOWER("slug") = 'acnorte'
       )
       AND (("key" = 'ticketAccessMode' AND "value" = 'owner')
         OR ("key" = 'messageVisibility' AND "value" = 'ticket'))`
    );
  }
};
