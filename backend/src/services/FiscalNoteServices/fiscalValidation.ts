export const onlyDigits = (value: unknown): string =>
  String(value ?? "").replace(/\D/g, "");

const allSame = (digits: string): boolean => /^(\d)\1+$/.test(digits);

export const isValidCpf = (value: string): boolean => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || allSame(cpf)) return false;
  const check = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
};

export const isValidCnpj = (value: string): boolean => {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || allSame(cnpj)) return false;
  const check = (length: number): number => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, i) => total + Number(cnpj[i]) * weight,
      0
    );
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
};

export const isValidZipCode = (value: string): boolean =>
  /^\d{8}$/.test(onlyDigits(value)) && !allSame(onlyDigits(value));

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()) &&
  String(value).length <= 150;

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
];

export const isValidState = (value: string): boolean =>
  BRAZILIAN_STATES.includes(String(value || "").toUpperCase());
