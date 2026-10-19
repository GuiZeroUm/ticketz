import { QueryInterface } from "sequelize";
import {
  translationsDown,
  TranslationsMap,
  translationsUp
} from "../translationFunctions";

// Labels of the header added to a forwarded email (SendEmailService).
const translationsMap: TranslationsMap = {
  en: {
    "Forwarded message": "Forwarded message",
    "Forwarded message From": "From:",
    "Forwarded message Date": "Date:",
    "Forwarded message Subject": "Subject:",
    "Forwarded message To": "To:",
    "Forwarded message Cc": "Cc:"
  },
  de: {
    "Forwarded message": "Weitergeleitete Nachricht",
    "Forwarded message From": "Von:",
    "Forwarded message Date": "Datum:",
    "Forwarded message Subject": "Betreff:",
    "Forwarded message To": "An:",
    "Forwarded message Cc": "Cc:"
  },
  fr: {
    "Forwarded message": "Message transféré",
    "Forwarded message From": "De :",
    "Forwarded message Date": "Date :",
    "Forwarded message Subject": "Objet :",
    "Forwarded message To": "À :",
    "Forwarded message Cc": "Cc :"
  },
  pt: {
    "Forwarded message": "Mensagem encaminhada",
    "Forwarded message From": "De:",
    "Forwarded message Date": "Data:",
    "Forwarded message Subject": "Assunto:",
    "Forwarded message To": "Para:",
    "Forwarded message Cc": "Cc:"
  },
  pt_PT: {
    "Forwarded message": "Mensagem reencaminhada",
    "Forwarded message From": "De:",
    "Forwarded message Date": "Data:",
    "Forwarded message Subject": "Assunto:",
    "Forwarded message To": "Para:",
    "Forwarded message Cc": "Cc:"
  },
  id: {
    "Forwarded message": "Pesan yang diteruskan",
    "Forwarded message From": "Dari:",
    "Forwarded message Date": "Tanggal:",
    "Forwarded message Subject": "Subjek:",
    "Forwarded message To": "Kepada:",
    "Forwarded message Cc": "Cc:"
  },
  it: {
    "Forwarded message": "Messaggio inoltrato",
    "Forwarded message From": "Da:",
    "Forwarded message Date": "Data:",
    "Forwarded message Subject": "Oggetto:",
    "Forwarded message To": "A:",
    "Forwarded message Cc": "Cc:"
  },
  es: {
    "Forwarded message": "Mensaje reenviado",
    "Forwarded message From": "De:",
    "Forwarded message Date": "Fecha:",
    "Forwarded message Subject": "Asunto:",
    "Forwarded message To": "Para:",
    "Forwarded message Cc": "Cc:"
  }
};

export default {
  up: async (queryInterface: QueryInterface) => {
    return translationsUp(translationsMap, queryInterface);
  },
  down: async (queryInterface: QueryInterface) => {
    return translationsDown(translationsMap, queryInterface);
  }
};
