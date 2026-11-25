/* eslint-disable @typescript-eslint/no-explicit-any */
// Instância falsa de modelo: update grava os campos no próprio objeto.
export const fakeModel = (fields: Record<string, any>): any => {
  const model: any = { ...fields };
  model.update = jest.fn(async (changes: Record<string, any>) => {
    Object.assign(model, changes);
    return model;
  });
  return model;
};

// Dados de exemplo fictícios (números de documento de exemplo, válidos só
// pelo dígito verificador).
export const completeProfile = (overrides: Record<string, any> = {}) => ({
  companyId: 7,
  documentType: "cnpj",
  document: "11222333000181",
  legalName: "Empresa Exemplo Ltda",
  municipalRegistration: null,
  email: "financeiro@example.com",
  zipCode: "01001000",
  street: "Praça da Sé",
  number: "100",
  complement: null,
  district: "Sé",
  city: "São Paulo",
  cityIbgeCode: "3550308",
  state: "SP",
  ...overrides
});
