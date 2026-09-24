import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async transaction => {
      const columns = await queryInterface.describeTable("Contacts");

      // AC Norte introduced this column in its tenant-specific migration
      // before the equivalent global migration existed. A merged release must
      // keep both migration histories without trying to create it twice.
      if (!columns.nameLocked) {
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
      }

      // Existing names may already have been curated by an attendant. Preserve
      // them on rollout; new externally-created contacts start unlocked.
      await queryInterface.sequelize.query(
        `UPDATE "Contacts" SET "nameLocked" = true`,
        { transaction }
      );
    });
  },

  // The earlier AC Norte migration owns this column in the merged history and
  // removes it when the full migration chain is rolled back.
  down: async (): Promise<void> => undefined
};
