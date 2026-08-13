import {
  AuthorizationMembership,
  AuthorizationRequest
} from "../services/McpServices/OAuthService";

type AuthorizationStep = "email" | "password" | "company";

type PageInput = {
  nonce: string;
  issuer: string;
  handle: string;
  request: AuthorizationRequest;
  step: AuthorizationStep;
  email?: string;
  memberships?: AuthorizationMembership[];
  error?: string;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, char => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return entities[char];
  });

const scopeLabels: Record<string, { title: string; description: string }> = {
  "conversations:read": {
    title: "Ler conversas",
    description:
      "Consultar mensagens e dados de atendimento da empresa escolhida."
  },
  "reports:read": {
    title: "Consultar relatórios",
    description: "Calcular indicadores e resumos dos atendimentos."
  }
};

const pageStyles = `
:root {
  --inbox-canvas: #f3f6fb;
  --inbox-paper: #ffffff;
  --inbox-field: #f7f9fd;
  --ink: #172033;
  --ink-secondary: #4c5870;
  --ink-muted: #7d8799;
  --conversation-blue: #1746d1;
  --conversation-blue-hover: #1039b2;
  --conversation-blue-soft: #eaf0ff;
  --line: rgba(23, 32, 51, 0.11);
  --danger: #b42318;
  --danger-soft: #fff2f0;
  --warning: #8a4b08;
  --warning-soft: #fff7e8;
}
* { box-sizing: border-box; }
html { min-height: 100%; background: var(--inbox-canvas); }
body {
  min-height: 100vh;
  margin: 0;
  color: var(--ink);
  background: var(--inbox-canvas);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.shell {
  width: min(100% - 32px, 560px);
  margin: 0 auto;
  padding: 48px 0;
}
.card {
  overflow: hidden;
  border-radius: 20px;
  background: var(--inbox-paper);
  box-shadow:
    0 0 0 1px rgba(23, 32, 51, 0.05),
    0 10px 32px rgba(36, 51, 84, 0.08),
    0 2px 8px rgba(36, 51, 84, 0.04);
}
.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 20px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.brand-mark { display: flex; align-items: stretch; gap: 3px; height: 24px; }
.brand-mark span { width: 6px; background: var(--conversation-blue); }
.brand-mark span:nth-child(2) { opacity: 0.68; }
.brand-mark span:nth-child(3) { opacity: 0.38; }
.secure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-secondary);
  font-size: 12px;
  font-weight: 600;
}
.secure::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16835c;
  content: "";
  box-shadow: 0 0 0 3px rgba(22, 131, 92, 0.12);
}
.progress {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0;
  padding: 0 28px 24px;
  list-style: none;
}
.progress li { min-width: 0; color: var(--ink-muted); font-size: 11px; font-weight: 600; }
.progress .track {
  display: block;
  height: 3px;
  margin-bottom: 8px;
  border-radius: 99px;
  background: rgba(23, 32, 51, 0.09);
}
.progress li.done, .progress li.current { color: var(--conversation-blue); }
.progress li.done .track, .progress li.current .track { background: var(--conversation-blue); }
.content { padding: 32px 28px 28px; border-top: 1px solid var(--line); }
.eyebrow {
  margin: 0 0 8px;
  color: var(--conversation-blue);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  font-size: clamp(26px, 5vw, 32px);
  line-height: 1.16;
  letter-spacing: -0.035em;
  text-wrap: balance;
}
.lead {
  margin: 12px 0 28px;
  color: var(--ink-secondary);
  font-size: 15px;
  line-height: 1.55;
  text-wrap: pretty;
}
.email-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -12px 0 24px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--conversation-blue-soft);
  color: #263658;
  font-size: 14px;
}
.field-label {
  display: block;
  margin-bottom: 8px;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
}
input[type="email"], input[type="password"], select {
  width: 100%;
  min-height: 48px;
  padding: 11px 13px;
  border: 1px solid rgba(23, 32, 51, 0.18);
  border-radius: 9px;
  outline: none;
  background: var(--inbox-field);
  color: var(--ink);
  font: inherit;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
input:hover, select:hover { border-color: rgba(23, 32, 51, 0.32); }
input:focus, select:focus {
  border-color: var(--conversation-blue);
  background: var(--inbox-paper);
  box-shadow: 0 0 0 3px rgba(23, 70, 209, 0.14);
}
.error {
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 14px;
  line-height: 1.45;
}
.permissions { margin: 24px 0; padding: 0; list-style: none; }
.permission {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.permission:first-child { border-top: 1px solid var(--line); }
.permission-icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: var(--conversation-blue-soft);
  color: var(--conversation-blue);
  font-size: 14px;
  font-weight: 800;
}
.permission strong { display: block; margin: 1px 0 3px; font-size: 14px; }
.permission p { margin: 0; color: var(--ink-secondary); font-size: 13px; line-height: 1.4; }
.warning {
  margin: 20px 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 13px;
  line-height: 1.48;
}
.consent {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 10px;
  align-items: start;
  color: var(--ink-secondary);
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
}
.consent input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--conversation-blue); }
.actions { display: flex; align-items: center; gap: 12px; margin-top: 28px; }
button {
  min-height: 44px;
  padding: 10px 17px;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms ease, background 160ms ease, color 160ms ease;
}
button:active { transform: scale(0.97); }
button:focus-visible { outline: 3px solid rgba(23, 70, 209, 0.25); outline-offset: 2px; }
button:disabled { cursor: wait; opacity: 0.72; }
.primary { flex: 1; background: var(--conversation-blue); color: #fff; }
.primary:hover { background: var(--conversation-blue-hover); }
.secondary { background: transparent; color: var(--ink-secondary); }
.secondary:hover { background: rgba(23, 32, 51, 0.06); color: var(--ink); }
.footer {
  margin: 18px 0 0;
  color: var(--ink-muted);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}
@media (max-width: 520px) {
  .shell { width: 100%; padding: 0; }
  .card { min-height: 100vh; border-radius: 0; }
  .brand-row { padding: 20px; }
  .progress { padding: 0 20px 20px; }
  .progress li { font-size: 10px; }
  .content { padding: 28px 20px 24px; }
  .actions { align-items: stretch; flex-direction: column; }
  .actions button { width: 100%; }
  .primary { order: -1; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
`;

const progress = (step: AuthorizationStep): string => {
  const currentIndex = ["email", "password", "company"].indexOf(step);
  return ["E-mail", "Senha", "Empresa"]
    .map((label, index) => {
      const state =
        index < currentIndex ? "done" : index === currentIndex ? "current" : "";
      const current = index === currentIndex ? ' aria-current="step"' : "";
      return `<li class="${state}"${current}><span class="track"></span>${index + 1}. ${label}</li>`;
    })
    .join("");
};

const permissions = (request: AuthorizationRequest): string =>
  request.scopes
    .map(scope => scopeLabels[scope])
    .filter(Boolean)
    .map(
      permission =>
        `<li class="permission"><span class="permission-icon" aria-hidden="true">✓</span><div><strong>${escapeHtml(permission.title)}</strong><p>${escapeHtml(permission.description)}</p></div></li>`
    )
    .join("");

const companyOptions = (memberships: AuthorizationMembership[]): string =>
  memberships
    .map(
      membership =>
        `<option value="${membership.companyId}">${escapeHtml(membership.companyName)}</option>`
    )
    .join("");

const formContent = (input: PageInput): string => {
  const { step, handle } = input;
  const issuer = escapeHtml(input.issuer);
  const hiddenHandle = `<input type="hidden" name="handle" value="${escapeHtml(handle)}">`;
  const error = input.error
    ? `<div class="error" role="alert">${escapeHtml(input.error)}</div>`
    : "";

  if (step === "email") {
    const email = escapeHtml(input.email || "");
    return `<p class="eyebrow">Etapa 1 de 3</p><h1>Conectar ao ChatGPT</h1><p class="lead">Digite o e-mail que você usa para acessar o Ticketz.</p>${error}<form method="post" action="${issuer}/oauth/authorize/email" data-loading-form>${hiddenHandle}<label class="field-label" for="email">E-mail</label><input id="email" name="email" type="email" value="${email}" autocomplete="username" inputmode="email" maxlength="254" required autofocus><div class="actions"><button class="primary" type="submit" data-loading-label="Continuando…">Continuar</button><button class="secondary" type="submit" formaction="${issuer}/oauth/authorize/cancel" formnovalidate data-loading-label="Cancelando…">Cancelar</button></div></form>`;
  }

  if (step === "password") {
    const email = escapeHtml(input.email || "");
    return `<p class="eyebrow">Etapa 2 de 3</p><h1>Confirme sua identidade</h1><p class="lead">Digite sua senha para localizar as empresas às quais você tem acesso.</p><div class="email-summary"><span>${email}</span><span aria-hidden="true">•••</span></div>${error}<form method="post" action="${issuer}/oauth/authorize/password" data-loading-form>${hiddenHandle}<input type="hidden" name="email" value="${email}"><label class="field-label" for="password">Senha</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><div class="actions"><button class="primary" type="submit" data-loading-label="Verificando…">Continuar</button><button class="secondary" type="submit" formaction="${issuer}/oauth/authorize/restart" formnovalidate data-loading-label="Voltando…">Alterar e-mail</button><button class="secondary" type="submit" formaction="${issuer}/oauth/authorize/cancel" formnovalidate data-loading-label="Cancelando…">Cancelar</button></div></form>`;
  }

  return `<p class="eyebrow">Etapa 3 de 3</p><h1>Escolha a empresa</h1><p class="lead">Defina qual empresa poderá ser consultada nesta conexão com o ChatGPT.</p>${error}<form method="post" action="${issuer}/oauth/authorize/approve" data-loading-form>${hiddenHandle}<label class="field-label" for="companyId">Selecione sua empresa:</label><select id="companyId" name="companyId" autocomplete="organization" required autofocus>${companyOptions(input.memberships || [])}</select><ul class="permissions" aria-label="Permissões solicitadas">${permissions(input.request)}</ul><div class="warning"><strong>Atenção:</strong> conversas identificáveis e possíveis dados clínicos poderão ser transmitidos ao ChatGPT conforme suas solicitações.</div><label class="consent"><input type="checkbox" name="consent" value="yes" required><span>Compreendo e autorizo o compartilhamento dos dados da empresa escolhida dentro das permissões acima.</span></label><div class="actions"><button class="primary" type="submit" data-loading-label="Autorizando…">Autorizar conexão</button><button class="secondary" type="submit" formaction="${issuer}/oauth/authorize/restart" formnovalidate data-loading-label="Voltando…">Voltar</button><button class="secondary" type="submit" formaction="${issuer}/oauth/authorize/cancel" formnovalidate data-loading-label="Cancelando…">Cancelar</button></div></form>`;
};

const shell = (
  content: string,
  step: AuthorizationStep,
  nonce: string
): string =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Conectar Ticketz ao ChatGPT</title><style>${pageStyles}</style></head><body><main class="shell"><section class="card" aria-labelledby="page-title"><header class="brand-row"><div class="brand"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><span>ticketz</span></div><span class="secure">Conexão segura</span></header><ol class="progress" aria-label="Progresso da autorização">${progress(step)}</ol><div class="content">${content}<p class="footer">Ao concluir, você será redirecionado de volta ao ChatGPT.</p></div></section></main><script nonce="${escapeHtml(nonce)}">document.querySelectorAll('[data-loading-form]').forEach(function(form){form.addEventListener('submit',function(event){var button=event.submitter;if(!button)return;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=button.dataset.loadingLabel||'Aguarde…';});});</script></body></html>`;

export const renderAuthorizationPage = (input: PageInput): string =>
  shell(
    formContent(input).replace("<h1>", '<h1 id="page-title">'),
    input.step,
    input.nonce
  );

export const renderExpiredAuthorizationPage = (nonce: string): string =>
  shell(
    '<p class="eyebrow">Sessão encerrada</p><h1 id="page-title">Esta autorização expirou</h1><p class="lead">Por segurança, a conexão deve ser iniciada novamente. Volte ao ChatGPT e tente conectar o Ticketz mais uma vez.</p><div class="warning">Nenhuma empresa ou conversa foi compartilhada.</div>',
    "email",
    nonce
  );
