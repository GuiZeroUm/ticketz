/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import CompanyFiscalProfile, {
  FiscalDocumentType
} from "../../models/CompanyFiscalProfile";
import {
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  isValidState,
  isValidZipCode,
  onlyDigits
} from "./fiscalValidation";

export interface FiscalProfileAddress {
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  state: string | null;
}

export interface FiscalProfileView {
  documentType: FiscalDocumentType | null;
  document: string | null;
  legalName: string | null;
  municipalRegistration: string | null;
  email: string | null;
  address: FiscalProfileAddress;
  complete: boolean;
}

type ProfileLike = Partial<
  Pick<
    CompanyFiscalProfile,
    | "documentType"
    | "document"
    | "legalName"
    | "municipalRegistration"
    | "email"
    | "zipCode"
    | "street"
    | "number"
    | "complement"
    | "district"
    | "city"
    | "cityIbgeCode"
    | "state"
  >
>;

const REQUIRED: (keyof ProfileLike)[] = [
  "documentType",
  "document",
  "legalName",
  "email",
  "zipCode",
  "street",
  "number",
  "district",
  "city",
  "state"
];

// Completo = tem tudo o que a NFS-e exige do tomador identificado.
export const isFiscalProfileComplete = (
  profile?: ProfileLike | null
): boolean => {
  if (!profile) return false;
  if (REQUIRED.some(field => !String(profile[field] ?? "").trim())) {
    return false;
  }
  const docValid =
    profile.documentType === "cpf"
      ? isValidCpf(profile.document)
      : profile.documentType === "cnpj" && isValidCnpj(profile.document);
  return (
    docValid &&
    isValidEmail(profile.email) &&
    isValidZipCode(profile.zipCode) &&
    isValidState(profile.state)
  );
};

export const serializeFiscalProfile = (
  profile?: CompanyFiscalProfile | null
): FiscalProfileView => ({
  documentType: profile?.documentType ?? null,
  document: profile?.document ?? null,
  legalName: profile?.legalName ?? null,
  municipalRegistration: profile?.municipalRegistration ?? null,
  email: profile?.email ?? null,
  address: {
    zipCode: profile?.zipCode ?? null,
    street: profile?.street ?? null,
    number: profile?.number ?? null,
    complement: profile?.complement ?? null,
    district: profile?.district ?? null,
    city: profile?.city ?? null,
    cityIbgeCode: profile?.cityIbgeCode ?? null,
    state: profile?.state ?? null
  },
  complete: isFiscalProfileComplete(profile)
});

const text = (value: unknown, max: number): string | null => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new AppError("ERR_FISCAL_FIELD_TOO_LONG");
  return trimmed;
};

// Valida o formato de cada campo informado. Campos vazios são permitidos:
// o cadastro pode ser salvo aos poucos e só emite nota quando completo.
export const normalizeFiscalProfileInput = (
  body: Record<string, any>
): ProfileLike => {
  const address = (body?.address || {}) as Record<string, unknown>;
  const documentType = text(body?.documentType, 4);
  if (documentType && !["cpf", "cnpj"].includes(documentType)) {
    throw new AppError("ERR_FISCAL_INVALID_DOCUMENT");
  }
  const document = onlyDigits(body?.document) || null;
  if (document) {
    const valid =
      documentType === "cpf"
        ? isValidCpf(document)
        : documentType === "cnpj" && isValidCnpj(document);
    if (!valid) throw new AppError("ERR_FISCAL_INVALID_DOCUMENT");
  }
  const email = text(body?.email, 150);
  if (email && !isValidEmail(email)) {
    throw new AppError("ERR_FISCAL_INVALID_EMAIL");
  }
  const zipCode = onlyDigits(address.zipCode) || null;
  if (zipCode && !isValidZipCode(zipCode)) {
    throw new AppError("ERR_FISCAL_INVALID_ZIPCODE");
  }
  const state = text(address.state, 2)?.toUpperCase() || null;
  if (state && !isValidState(state)) {
    throw new AppError("ERR_FISCAL_INVALID_STATE");
  }
  const cityIbgeCode = onlyDigits(address.cityIbgeCode) || null;
  if (cityIbgeCode && cityIbgeCode.length !== 7) {
    throw new AppError("ERR_FISCAL_INVALID_CITY_CODE");
  }

  return {
    documentType: documentType as FiscalDocumentType | null,
    document,
    legalName: text(body?.legalName, 150),
    municipalRegistration: text(body?.municipalRegistration, 30),
    email,
    zipCode,
    street: text(address.street, 150),
    number: text(address.number, 20),
    complement: text(address.complement, 100),
    district: text(address.district, 100),
    city: text(address.city, 100),
    cityIbgeCode,
    state
  };
};

export const getFiscalProfile = async (
  companyId: number
): Promise<CompanyFiscalProfile | null> =>
  CompanyFiscalProfile.findOne({ where: { companyId } });

export const showFiscalProfile = async (
  companyId: number
): Promise<FiscalProfileView> =>
  serializeFiscalProfile(await getFiscalProfile(companyId));

export const upsertFiscalProfile = async (
  companyId: number,
  body: Record<string, any>
): Promise<FiscalProfileView> => {
  const company = await Company.findByPk(companyId, { attributes: ["id"] });
  if (!company) throw new AppError("ERR_NO_COMPANY_FOUND", 404);

  const data = normalizeFiscalProfileInput(body);
  const existing = await getFiscalProfile(companyId);
  const profile = existing
    ? await existing.update(data)
    : await CompanyFiscalProfile.create({ ...data, companyId } as any);
  return serializeFiscalProfile(profile);
};

// Completude em lote, para listas de faturas/clientes.
export const fiscalCompletenessByCompany = async (
  companyIds: number[]
): Promise<Map<number, boolean>> => {
  const ids = [...new Set(companyIds.filter(Boolean))];
  const result = new Map<number, boolean>();
  if (!ids.length) return result;
  const profiles = await CompanyFiscalProfile.findAll({
    where: { companyId: ids }
  });
  ids.forEach(id => result.set(id, false));
  profiles.forEach(profile =>
    result.set(profile.companyId, isFiscalProfileComplete(profile))
  );
  return result;
};

export interface ZipCodeLookup {
  street: string | null;
  district: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  state: string | null;
}

// Consulta pública de CEP (ViaCEP). Só o CEP sai do sistema.
export const lookupZipCode = async (cep: string): Promise<ZipCodeLookup> => {
  const zipCode = onlyDigits(cep);
  if (!isValidZipCode(zipCode)) {
    throw new AppError("ERR_FISCAL_INVALID_ZIPCODE");
  }
  let data: Record<string, any>;
  try {
    ({ data } = await axios.get(`https://viacep.com.br/ws/${zipCode}/json/`, {
      timeout: 5000
    }));
  } catch {
    throw new AppError("ERR_ZIPCODE_LOOKUP_FAILED", 502);
  }
  if (!data || data.erro) throw new AppError("ERR_ZIPCODE_NOT_FOUND", 404);
  return {
    street: data.logradouro || null,
    district: data.bairro || null,
    city: data.localidade || null,
    cityIbgeCode: data.ibge || null,
    state: data.uf || null
  };
};
