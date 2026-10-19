import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.createTable(
        "ContactIdentities",
        {
          id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false
          },
          companyId: {
            type: DataTypes.INTEGER,
            references: { model: "Companies", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
            allowNull: false
          },
          contactId: {
            type: DataTypes.INTEGER,
            references: { model: "Contacts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
            allowNull: false
          },
          channel: { type: DataTypes.STRING, allowNull: false },
          externalId: { type: DataTypes.STRING, allowNull: false },
          // Conta que viu o endereço primeiro; só informativo, por isso não
          // entra no índice único (o mesmo remetente é a mesma pessoa em
          // qualquer caixa da empresa).
          emailAccountId: {
            type: DataTypes.INTEGER,
            references: { model: "EmailAccounts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
            allowNull: true
          },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false }
        },
        { transaction }
      );

      await queryInterface.addIndex(
        "ContactIdentities",
        ["companyId", "channel", "externalId"],
        {
          unique: true,
          name: "contact_identities_company_channel_external_unique",
          transaction
        }
      );
      await queryInterface.addIndex("ContactIdentities", ["contactId"], {
        name: "contact_identities_contact_idx",
        transaction
      });
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("ContactIdentities");
  }
};
