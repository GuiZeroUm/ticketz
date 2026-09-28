import { QueryInterface, QueryTypes } from "sequelize";
import { parseStoredConfig } from "../../services/SgaBillingServices/policy";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        "SELECT pg_advisory_xact_lock(73422,9)",
        { transaction }
      );
      const rows = await queryInterface.sequelize.query<{ config: unknown }>(
        'SELECT config FROM "SgaBillingConfigs" WHERE "companyId"=9 AND EXISTS (SELECT 1 FROM "Companies" WHERE id=9 AND slug=\'acnorte\') FOR UPDATE',
        { transaction, type: QueryTypes.SELECT }
      );
      if (!rows.length) return;
      const config = JSON.stringify(parseStoredConfig(rows[0].config));
      await queryInterface.sequelize.query(
        'UPDATE "SgaBillingConfigs" SET config=CAST(:config AS jsonb),"updatedBy"=NULL,"updatedAt"=NOW() WHERE "companyId"=9',
        { replacements: { config }, transaction }
      );
      await queryInterface.sequelize.query(
        'INSERT INTO "SgaBillingConfigAudits" ("companyId","userId",config) VALUES (9,NULL,CAST(:config AS jsonb))',
        { replacements: { config }, transaction }
      );
    });
  },
  // Reverting application code must not restore misleading collection text.
  down: async () => undefined
};
