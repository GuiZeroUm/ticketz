/* eslint-disable no-restricted-syntax */
import { DataTypes, QueryInterface } from "sequelize";

// Correção de nota: reemissão automática após o cancelamento, motivo de um
// cancelamento recusado e os dados do tomador usados em cada nota. Aditiva e
// idempotente: o banco é compartilhado entre runtimes.
const COLUMNS = {
  replacementPending: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  replacementRequestedAt: { type: DataTypes.DATE },
  cancelStatusDetail: { type: DataTypes.STRING(60) },
  takerName: { type: DataTypes.STRING(150) },
  takerDocumentType: { type: DataTypes.STRING(4) },
  takerDocumentMasked: { type: DataTypes.STRING(20) },
  takerEmail: { type: DataTypes.STRING(150) },
  replacesNumber: { type: DataTypes.STRING(20) }
};

module.exports = {
  up: async (q: QueryInterface) => {
    const existing = await q.describeTable("FiscalNotes");
    await q.sequelize.transaction(async transaction => {
      for (const [name, spec] of Object.entries(COLUMNS)) {
        if (!existing[name]) {
          await q.addColumn("FiscalNotes", name, spec, { transaction });
        }
      }
    });
  },

  down: async (q: QueryInterface) => {
    const existing = await q.describeTable("FiscalNotes");
    await q.sequelize.transaction(async transaction => {
      for (const name of Object.keys(COLUMNS)) {
        if (existing[name]) {
          await q.removeColumn("FiscalNotes", name, { transaction });
        }
      }
    });
  }
};
