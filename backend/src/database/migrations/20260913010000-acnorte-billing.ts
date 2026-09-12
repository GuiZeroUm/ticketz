import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(
        `CREATE TABLE "SgaBillingConfigs" (
        "companyId" INTEGER PRIMARY KEY REFERENCES "Companies"(id) ON DELETE CASCADE,
        config JSONB NOT NULL, "updatedBy" INTEGER REFERENCES "Users"(id) ON DELETE SET NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE "SgaBillingDeliveries" (
        id BIGSERIAL PRIMARY KEY, "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
        "billId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "billNumber" TEXT NOT NULL,
        "dueDate" DATE NOT NULL, "stage" INTEGER NOT NULL, "localDay" DATE NOT NULL,
        "contactId" INTEGER REFERENCES "Contacts"(id) ON DELETE SET NULL,
        "whatsappId" INTEGER REFERENCES "Whatsapps"(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK(status IN ('PREPARING','SENDING','SENT','SKIPPED','FAILED','UNCERTAIN','SIMULATED')),
        mode TEXT NOT NULL CHECK(mode IN ('live','test','simulation')),
        "dedupeKey" TEXT NOT NULL, "messageId" TEXT, reason TEXT, body TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("companyId", "dedupeKey")
      );
      CREATE INDEX "SgaBillingDeliveries_daily" ON "SgaBillingDeliveries" ("companyId","localDay",mode);
      CREATE INDEX "SgaBillingDeliveries_status" ON "SgaBillingDeliveries" ("companyId",status);
      CREATE TABLE "SgaBillingConfigAudits" (
        id BIGSERIAL PRIMARY KEY, "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
        "userId" INTEGER REFERENCES "Users"(id) ON DELETE SET NULL,
        config JSONB NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
        { transaction }
      );
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("SgaBillingConfigAudits");
    await queryInterface.dropTable("SgaBillingDeliveries");
    await queryInterface.dropTable("SgaBillingConfigs");
  }
};
