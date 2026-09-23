import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.addColumn(
        "Contacts",
        "nameLocked",
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `UPDATE "Contacts" contact
         SET "nameLocked" = true
         FROM "Companies" company
         WHERE contact."companyId" = company.id
           AND company.slug = 'acnorte'`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `INSERT INTO "Settings" ("key", "value", "companyId", "createdAt", "updatedAt")
         SELECT 'preserveManualContactNames', 'enabled', company.id, NOW(), NOW()
         FROM "Companies" company
         WHERE company.slug = 'acnorte'
           AND NOT EXISTS (
             SELECT 1
             FROM "Settings" setting
             WHERE setting."companyId" = company.id
               AND setting."key" = 'preserveManualContactNames'
           )`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `UPDATE "Settings" setting
         SET "value" = 'enabled', "updatedAt" = NOW()
         FROM "Companies" company
         WHERE setting."companyId" = company.id
           AND company.slug = 'acnorte'
           AND setting."key" = 'preserveManualContactNames'`,
        { transaction }
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        `DELETE FROM "Settings" setting
         USING "Companies" company
         WHERE setting."companyId" = company.id
           AND company.slug = 'acnorte'
           AND setting."key" = 'preserveManualContactNames'`,
        { transaction }
      );
      await queryInterface.removeColumn("Contacts", "nameLocked", {
        transaction
      });
    });
  }
};
