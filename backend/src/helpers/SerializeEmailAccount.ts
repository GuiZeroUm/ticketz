import EmailAccount from "../models/EmailAccount";

// Única forma de expor uma conta de e-mail em resposta de API ou Socket.IO.
// Lista os campos explicitamente: credenciais e cursor de sincronização nunca
// entram, nem por acidente de um campo novo no model.
const serializeEmailAccount = (account: EmailAccount) => ({
  id: account.id,
  provider: account.provider,
  preset: account.preset,
  name: account.name,
  address: account.address,
  status: account.status,
  queueId: account.queueId,
  lastSyncAt: account.lastSyncAt,
  lastError: account.lastError,
  imapHost: account.imapHost,
  imapPort: account.imapPort,
  smtpHost: account.smtpHost,
  smtpPort: account.smtpPort,
  updatedAt: account.updatedAt
});

export default serializeEmailAccount;
