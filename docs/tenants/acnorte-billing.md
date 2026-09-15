# Cobranças AC Norte

## Rollout

Página administrativa: `/sga/cobrancas`, acessível pelo botão **Cobranças automáticas** em Placas.
O dev fixa `ACNORTE_BILLING_SEND_ENABLED=false`; a produção exige a variável explicitamente habilitada e uma configuração auditada por administrador.
`ACNORTE_BILLING_TEST_NUMBER` recebe o número autorizado pelo administrador, no servidor, como DDD+número (10/11 dígitos) ou E.164 sem `+`. O remetente consulta o WhatsApp usando a normalização brasileira já existente no sistema e envia somente ao identificador confirmado, validando equivalência do número. Nunca copiar credenciais WhatsApp de produção para dev.

## Régua

| Dias em relação ao vencimento | Conteúdo |
| --- | --- |
| −5, −3, −1, 0 | Documento PDF com legenda personalizada, sem link automático |
| +1, +3, +5, +25, +30, +90 | Texto personalizado, sem link automático |

Textos fornecidos pela AC Norte, com correções ortográficas, editáveis na interface. Variáveis `[nome]`, `[valor]`, `[vencimento]`, `[boleto]`. O nome vem do associado SGA, não de um telefone usado como nome no contato. Sem duplicação por placa: unidade de envio é **boleto + etapa**.

Padrão inicial de produção: 5h–17h, dias úteis, America/Rio_Branco, limite 500/dia. É uma janela exclusiva no término (17h não envia). A ordem e os horários são embaralhados deterministicamente por dia e distribuídos pela janela, com ao menos 30 segundos entre posições e no máximo um envio por ciclo/minuto. Reiniciar o serviço não muda o plano do dia nem duplica cobranças. Só envia no dia exato; **não recupera etapas passadas, dias desmarcados ou excedentes do limite no dia seguinte**. A configuração recusa um limite maior que a capacidade de um envio por minuto da janela.

Uma conexão selecionada pode permanecer desabilitada por decisão do usuário. Nesse estado, o worker aguarda silenciosamente e retoma sozinho quando **essa mesma conexão** ficar conectada; nunca escolhe outro número como fallback. Desabilitar uma conexão não exige apagar seus dados ou sessões.

## Conferência e proteção

- Exige vínculo não ambíguo, contato individual WhatsApp da mesma empresa e número válido.
- IDs na lista de exclusão não recebem mensagens (exceções, contestação, pedido de interrupção).
- Exige snapshot SGA concluído há menos de 90 minutos. Falha/sincronização em andamento suspende envio.
- Consulta `buscar/boleto` antes de preparar e novamente antes de enviar: proprietário, identificação, vencimento, pagamento e situação precisam continuar válidos. Apenas situações explicitamente consideradas inadimplência e não pagas na tabela SGA são aceitas.
- Alterações de telefone ou vínculo interrompem o envio. Nenhum número é inventado a partir do nome.
- PDFs somente de `https://short.hinova.com.br/v2/<identificador>.pdf`, formato verificado na API real. HTTPS, sem redirecionamento, timeout 30s, limite 5MB, assinatura `%PDF-` e content-type obrigatórios. Nenhum token SGA acompanha o download.
- Documento mantido em memória, enviado em um único envelope com legenda; sem arquivo público persistido no servidor. A mensagem e metadados ficam no histórico interno como os demais envios fora de ticket.
- Etapas pós-vencimento exigem confirmação administrativa da adequação dos textos à política/contrato. A etapa +30 exige adicionalmente que SGA retorne situação inativa/cancelada do associado. O código **não** suspende proteção, inativa contratos, protesta ou negativa ninguém.

## Persistência / falhas

Migration aditiva `20260913010000-acnorte-billing`: tabelas `SgaBillingConfigs`, `SgaBillingConfigAudits`, `SgaBillingDeliveries`. Nenhuma alteração de registros existentes ou sessões.

Mutex PostgreSQL por empresa `(73422, companyId)`, distinto da sincronização SGA. A chave única `(companyId, dedupeKey)` impede repetição do mesmo boleto/etapa inclusive depois de reinício. A identidade não inclui vencimento, evitando reenvio da mesma etapa se o boleto for remarcado.

Estados:

`PREPARING → SENDING → SENT`

Antes do transporte: falha `FAILED` ou inelegibilidade `SKIPPED`. Depois de começar o transporte: falha `UNCERTAIN`. Transições são confirmadas no banco **antes** do I/O de rede, fora da transação que segura o mutex; um crash não apaga a marca de tentativa. Inicialização recupera tentativas interrompidas como `FAILED`/`UNCERTAIN`. **Não há reenvio automático de falhas ou estados incertos**; revisar a mensagem no WhatsApp. `SENT` significa API do WhatsApp aceitou, não entrega/leitura confirmada.

Envios incertos contam no limite diário. Testes e simulações têm modos separados e não consomem a identidade de uma cobrança real. Rotas somente para administradores, com isolamento SGA + runtime. Atualizações de configuração deixam trilha de auditoria.

## Teste

Por padrão, a prévia usa Guilherme Santos e valores fictícios, sem link. O PDF de demonstração diz **SEM VALOR — NÃO PAGAR**. Endpoint `/sga/billing/test.pdf` autenticado, sem cache público.

Para teste expressamente autorizado com documento real, configurar **ambas** `ACNORTE_BILLING_TEST_BILL_NUMBER` (nosso número) e `ACNORTE_BILLING_TEST_MEMBER_ID` no dev. A combinação deve existir no snapshot do tenant; cada prévia/teste consulta `buscar/boleto` e valida identidade, titularidade, vencimento e situação não paga. As etapas são simuladas independentemente da data real, mas o PDF é o original atual da API, nunca uma substituição fictícia. O envio continua exclusivamente para `ACNORTE_BILLING_TEST_NUMBER`, nunca para o contato do associado. O histórico registra os identificadores reais com `mode=test`, sem afetar deduplicação de cobranças reais. O documento permanece somente em memória. Falhas de API ou PDF bloqueiam o envio. Remover ambas as variáveis para voltar à demonstração fictícia. A interface identifica o boleto real e oculta o download de PDF fictício nesse modo.

Nenhum link é acrescentado automaticamente às mensagens. Textos personalizados ainda podem solicitar explicitamente `[boleto]` no fluxo real; os testes nunca inserem um link de pagamento ou do painel.

**Simular envio sem WhatsApp** registra `SIMULATED` e valida a composição sem chamar o transporte. **Enviar teste ao número autorizado** exige conexão do dev, usa exclusivamente a allowlist do servidor, é limitado e idempotente por `requestId`. A interface retém o identificador depois de erro de rede para não duplicar uma tentativa. Reiniciar/repetir deliberadamente um teste requer nova entrada na tela.

## Produção

Promover a branch `acnorte` para `acnorte-deploy` somente pelo workflow normal após CI. O manifest mantém `ACNORTE_BILLING_SEND_ENABLED` com padrão false; a variável persistida do ambiente de produção é a chave de liberação operacional. Selecionar exclusivamente a conexão pertencente ao runtime AC Norte, confirmar textos, horários e lista de exclusão e visualizar candidatos antes da ativação. Preservar exclusão company9 no runtime geral e não compartilhar processos de autenticação WhatsApp.
