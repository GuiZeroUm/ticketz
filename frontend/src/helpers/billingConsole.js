// A Central de Cobrança é a tela do financeiro da operação e só existe no
// tenant dono da plataforma. Quem decide é o backend: ele manda
// `canUseBillingConsole` no usuário (login, /auth/me e refresh) e repete a
// checagem em toda rota (middleware isBillingAdmin). Aqui é só pra não
// mostrar um menu que responderia 401, sem lista fixa de slugs.
export const podeVerCentralCobranca = user =>
  user?.canUseBillingConsole === true;

export default podeVerCentralCobranca;
