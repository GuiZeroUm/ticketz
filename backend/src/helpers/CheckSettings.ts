import Setting from "../models/Setting";
import AppError from "../errors/AppError";

const CheckSettings = async (
  key: string,
  defaultValue: string = null
): Promise<string> => {
  const setting = await Setting.findOne({
    where: {
      companyId: 1,
      key
    }
  });

  if (!setting && defaultValue === null) {
    throw new AppError("ERR_NO_SETTING_FOUND", 404);
  }

  return setting?.value || defaultValue;
};

const COMPANY_SETTING_TTL_MS = 30000;
const COMPANY_SETTING_MAX_ENTRIES = 5000;

interface CachedCompanySetting {
  found: boolean;
  value: string | null;
  expiresAt: number;
}

const companySettingCache = new Map<string, CachedCompanySetting>();

// Bumped on every invalidation so a read that was already in flight when a
// write was committed does not store the value it read before that write.
let companySettingGeneration = 0;

const companySettingCacheKey = (companyId: number, key: string): string =>
  `${companyId}:${key}`;

/**
 * Drops the cached value of a company setting, so the next read hits the
 * database. Call it after the write is committed.
 */
export const invalidateCompanySetting = (
  companyId: number,
  key: string
): void => {
  companySettingGeneration += 1;
  companySettingCache.delete(companySettingCacheKey(companyId, key));
};

/**
 * Drops every cached company setting.
 */
export const clearCompanySettingCache = (): void => {
  companySettingGeneration += 1;
  companySettingCache.clear();
};

/**
 * Get the company setting by key. Results (including a missing setting) are
 * cached in memory for 30 seconds per process; writes through
 * UpdateSettingService invalidate the local entry, other runtimes converge
 * when the TTL expires.
 *
 * @param companyId - The ID of the company
 * @param key - The key of the setting
 * @param defaultValue - The default value to return if the setting is not found
 * @return The value of the setting or the default value
 */
export const GetCompanySetting = async (
  companyId: number,
  key: string,
  defaultValue: string = undefined
): Promise<string> => {
  const cacheKey = companySettingCacheKey(companyId, key);
  const now = Date.now();
  let entry = companySettingCache.get(cacheKey);

  if (entry && entry.expiresAt <= now) {
    companySettingCache.delete(cacheKey);
    entry = undefined;
  }

  if (!entry) {
    const generation = companySettingGeneration;
    const setting = await Setting.findOne({
      where: {
        companyId,
        key
      }
    });

    entry = {
      found: !!setting,
      value: setting ? setting.value : null,
      expiresAt: now + COMPANY_SETTING_TTL_MS
    };

    if (generation === companySettingGeneration) {
      if (companySettingCache.size >= COMPANY_SETTING_MAX_ENTRIES) {
        companySettingCache.clear();
      }
      companySettingCache.set(cacheKey, entry);
    }
  }

  if (!entry.found && defaultValue === undefined) {
    throw new AppError("ERR_NO_SETTING_FOUND", 404);
  }

  return entry.found ? entry.value : defaultValue;
};

export default CheckSettings;
