# Chamadas WhatsApp — análise para a AC Norte

## Conclusão

A AC Norte já usa uma conexão oficial da WhatsApp Cloud API. A evolução segura
é integrar a Calling API oficial da Meta com webhooks e WebRTC no navegador.
Os providers experimentais baseados em sessão QR existentes no projeto não
devem ser habilitados para essa conexão.

## Pré-requisitos externos

- Confirmar no Meta Manager que o número e a WABA estão elegíveis para calling.
- Validar limite da WABA, forma de pagamento e permissões avançadas
  `whatsapp_business_messaging` e `whatsapp_business_management`.
- Assinar o webhook `calls` e validar chamadas recebidas antes de liberar as
  realizadas.
- Definir finalidade, base legal, aviso ao titular e retenção antes de ativar
  gravação ou transcrição, conforme a LGPD.

## Arquitetura recomendada para uma entrega futura

1. Provider Meta isolado por feature flag e allowlist da AC Norte.
2. Webhook de chamadas e sinalização Graph API no backend.
3. WebRTC com trilha de áudio no navegador do atendente.
4. Reuso do histórico, locks de aceite, filas, sockets e controles de acesso já
   existentes, sem reutilizar o transporte PCM do piloto não oficial.
5. Piloto somente com chamadas recebidas; depois chamadas realizadas com
   permissão explícita; gravação/transcrição por último.

Referência oficial: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/

Esta análise não habilita chamadas nem altera a configuração de voz em
produção.
