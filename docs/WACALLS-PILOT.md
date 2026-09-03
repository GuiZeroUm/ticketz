# Piloto de chamadas WaCalls

Esta integração é experimental, não oficial e deve permanecer restrita ao tenant
`teste` (empresa `1`) até uma nova decisão. Ela usa uma segunda sessão de dispositivo
vinculado e não substitui nem modifica a conexão de mensagens do Ticketz.

O código do serviço foi incorporado a partir do projeto MIT
[JotaDev66/WaCalls](https://github.com/JotaDev66/WaCalls), revisão
`edeb31f0427aba896639db503153b777a405eccf`. A interface web original do WaCalls
não é publicada.

## Controles de segurança

- A API HTTP do WaCalls existe somente na rede privada do Docker.
- Backend e WaCalls autenticam cada chamada interna com um segredo montado em
  `/run/secrets`; o segredo não fica no Git nem no ambiente salvo no Dokploy.
- O navegador recebe somente um token de mídia assinado, vinculado a tenant,
  usuário e chamada, com validade de dois minutos.
- Todos os endpoints públicos passam pela autenticação do Ticketz, lista de
  permissão de tenant e limites de requisições.
- CORS direto para o WaCalls é bloqueado. O QR só é entregue a administradores.
- Somente metadados são gravados em `VoiceCalls`; áudio não é gravado.

Os arquivos operacionais ficam em `/etc/dokploy/secrets`:

- `espaco_whats_wacalls.env`: flag global, empresa permitida, IP e faixa UDP;
- `espaco_whats_wacalls_internal_token`: autenticação entre serviços;
- `espaco_whats_wacalls_media_token_secret`: assinatura dos tokens curtos.

## Fluxo funcional

O administrador liga “Chamadas experimentais” em **Configurações > Empresas**.
No tenant habilitado, **Configurações > Chamadas experimentais** exige a confirmação
do risco e gera o segundo QR. Chamadas recebidas tocam apenas para atendentes online
associados às filas da conexão de mensagens correspondente. O primeiro aceite é
protegido por transação e bloqueio de linha; os demais recebem conflito e param de
tocar. Após 30 segundos, ou sem atendente online, a chamada vira `missed` e é
recusada no upstream.

Estados persistidos: `ringing`, `accepted`, `rejected`, `missed`, `ended` e
`failed`. São armazenados número, conexão, filas, atendente, horários, duração e
erro técnico.

## Verificação do piloto

Antes de expandir, executar e registrar:

1. Pareamento por QR e restauração após reiniciar backend e WaCalls.
2. Chamada atendida com áudio bidirecional em Wi-Fi.
3. Chamada atendida com áudio bidirecional em 4G/5G.
4. Microfone negado, queda de rede, recusa e timeout de 30 segundos.
5. Dois atendentes aceitando ao mesmo tempo; somente um deve obter a chamada.
6. Tentativa pelo tenant não permitido; deve retornar `403`.
7. Uma chamada contínua de 30 minutos.
8. Envio e recebimento de mensagens antes e depois dos testes.

Monitorar `docker stats`, saúde dos containers, eventos `failed`, chamadas perdidas,
desconexões e relatos de áudio. A expansão fica bloqueada se desconexões superarem
2% ou falhas de áudio superarem 1%. Qualquer alerta de ferramenta não autorizada,
suspensão ou banimento encerra o piloto imediatamente.

## Rollback

O rollback funcional é reversível: definir `WACALLS_ENABLED=false` no arquivo
`/etc/dokploy/secrets/espaco_whats_wacalls.env` e redesplegar o Compose. Isso não
altera a conexão de mensagens. Para remover o dispositivo vinculado, use o botão
“Desligar e desvincular” antes de desabilitar o switch do tenant.

Se uma versão precisar ser revertida, mova a branch `deploy` para o último commit
aprovado e aguarde os health checks do Dokploy. Não apague o volume `wacalls_data`
durante um rollback normal; ele contém a sessão pareada.
