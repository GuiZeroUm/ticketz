import "../bootstrap";
import "reflect-metadata";
import sequelize from "../database";
import Company from "../models/Company";
import Plan from "../models/Plan";
import User from "../models/User";
import Setting from "../models/Setting";

const run = async (): Promise<void> => {
  if (process.env.ACNORTE_SUPPLIER_SSO_ROLE !== "target") {
    throw new Error(
      "Supplier initialization is only available on its dedicated runtime"
    );
  }
  const companyId = Number(process.env.ACNORTE_SUPPLIER_COMPANY_ID);
  if (companyId !== 1 || process.env.TENANT_RUNTIME_COMPANY_ID !== "1") {
    throw new Error("Supplier runtime must own only company 1");
  }
  const adminEmail = String(process.env.EMAIL_ADDRESS || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("Supplier admin email is required");
  }

  await sequelize.transaction(async transaction => {
    const company = await Company.findByPk(companyId, { transaction });
    const plan = await Plan.findByPk(company?.planId || 0, { transaction });
    const admin = await User.findOne({
      where: { companyId, super: true },
      transaction
    });
    if (!company || !plan || !admin) {
      throw new Error("Supplier bootstrap records are missing");
    }
    await plan.update(
      { name: "ACNorte Fornecedores", users: 6, connections: 20 },
      { transaction }
    );
    await company.update(
      {
        name: "ACNorte Fornecedores",
        slug: "acnortefornecedores",
        whatsappMode: "normal",
        status: true,
        platformStatus: "ativo",
        platformBilling: "sistema",
        dueDate: "2093-03-14"
      },
      { transaction }
    );
    await admin.update(
      {
        name: "Guilherme Santos",
        email: adminEmail,
        profile: "admin",
        super: true
      },
      { transaction }
    );
    await Setting.findOrCreate({
      where: { companyId, key: "campaignsEnabled" },
      defaults: {
        companyId,
        key: "campaignsEnabled",
        value: "false"
      } as Setting,
      transaction
    });
  });
  await sequelize.close();
};

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
