import { messages as portugueseMessages } from "./pt";
import { messages as portuguesePortugalMessages } from "./pt_PT";
import { messages as englishMessages } from "./en";
import { messages as spanishMessages } from "./es";
import { messages as frenchMessages } from "./fr";
import { messages as germanMessages } from "./de";
import { messages as italianMessages } from "./it";
import { messages as indonesianMessages } from "./id";
import { schedulingMessages } from "./scheduling";

const mergeTranslations = (base, extra) => {
  const result = { ...base };
  Object.entries(extra || {}).forEach(([key, value]) => {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? mergeTranslations(result[key] || {}, value)
        : value;
  });
  return result;
};

const messages = {
  ...portugueseMessages,
  ...portuguesePortugalMessages,
  ...englishMessages,
  ...spanishMessages,
  ...frenchMessages,
  ...germanMessages,
  ...italianMessages,
  ...indonesianMessages
};

Object.entries(schedulingMessages).forEach(([language, extra]) => {
  messages[language].translations = mergeTranslations(
    messages[language].translations,
    extra
  );
});

export { messages };
