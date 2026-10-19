export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_INBOUND_ATTACHMENTS_BYTES = 50 * 1024 * 1024;
export const MAX_OUTBOUND_ATTACHMENTS_BYTES = 25 * 1024 * 1024;
export const MAX_RECIPIENTS = 20;
export const SYNC_BATCH_MAX = 100;
export const INITIAL_IMPORT_HOURS = 24;
export const INITIAL_IMPORT_MAX = 50;
export const SUBJECT_FALLBACK_DAYS = 30;
export const MAX_REFERENCES = 20;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
// Largest raw message imported with its body; bigger ones come in headers only.
export const MAX_RAW_MESSAGE_BYTES =
  MAX_INBOUND_ATTACHMENTS_BYTES + MAX_HTML_BYTES;
// Raw bytes one sync round may download (at least one message is always taken).
export const SYNC_ROUND_MAX_BYTES = 64 * 1024 * 1024;
