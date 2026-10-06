import "../bootstrap";
import "reflect-metadata";
import sequelize from "../database";
import Company from "../models/Company";
import Plan from "../models/Plan";
import User from "../models/User";
import Setting from "../models/Setting";
import { promises as fs } from "fs";
import path from "path";
import uploadConfig from "../config/upload";

const branding: Record<string, string> = {
  appName: "ACNorte Fornecedores",
  appLogoLight: "branding/1/logo_light-acnorte-fornecedores.jpg",
  appLogoDark: "branding/1/logo_dark-acnorte-fornecedores.jpg",
  appLogoFavicon: "branding/1/favicon-acnorte-fornecedores.jpg",
  primaryColorLight: "#007A25",
  primaryColorDark: "#007A25"
};

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

  const asset = path.resolve(__dirname, "../../assets/acnorte-fornecedores.jpg");
  for (const key of ["appLogoLight", "appLogoDark", "appLogoFavicon"]) {
    const destination = path.join(uploadConfig.directory, branding[key]);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(asset, destination);
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
    for (const [key, value] of Object.entries(branding)) {
      await Setting.findOrCreate({
        where: { companyId, key },
        defaults: { companyId, key, value } as Setting,
        transaction
      });
    }
  });
  await sequelize.close();
};

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
