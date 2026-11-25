import { DataTypes, QueryInterface } from "sequelize";

// Dados fiscais do tomador (a empresa cliente) usados na NFS-e. A tabela pode
// já existir quando o mesmo arquivo roda em outro runtime que compartilha o
// banco; por isso a criação é condicional.
module.exports = {
  up: async (q: QueryInterface) => {
    const tables = (await q.showAllTables()).map(String);
    if (tables.includes("CompanyFiscalProfiles")) return;

    await q.sequelize.transaction(async transaction => {
      await q.createTable(
        "CompanyFiscalProfiles",
        {
          id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false
          },
          companyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: { model: "Companies", key: "id" },
            onDelete: "CASCADE"
          },
          documentType: { type: DataTypes.STRING(4) },
          document: { type: DataTypes.STRING(14) },
          legalName: { type: DataTypes.STRING(150) },
          municipalRegistration: { type: DataTypes.STRING(30) },
          email: { type: DataTypes.STRING(150) },
          zipCode: { type: DataTypes.STRING(8) },
          street: { type: DataTypes.STRING(150) },
          number: { type: DataTypes.STRING(20) },
          complement: { type: DataTypes.STRING(100) },
          district: { type: DataTypes.STRING(100) },
          city: { type: DataTypes.STRING(100) },
          cityIbgeCode: { type: DataTypes.STRING(7) },
          state: { type: DataTypes.STRING(2) },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false }
        },
        { transaction }
      );
    });
  },

  down: async (q: QueryInterface) => {
    await q.dropTable("CompanyFiscalProfiles");
  }
};
