import AppError from "../errors/AppError";

const parseConnectionFilter = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new AppError("ERR_INVALID_CONNECTION_FILTER", 400);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new AppError("ERR_INVALID_CONNECTION_FILTER", 400);
  }
  return id;
};

export default parseConnectionFilter;
