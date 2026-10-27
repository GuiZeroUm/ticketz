# Acesso às conversas de grupos

Cada grupo pertence a uma empresa. Um administrador da empresa pode abrir todos
os grupos dela.

Para grupos no modo **conversa**, uma lista vazia em `GroupQueues` significa que
todos os usuários da mesma empresa podem ler e participar da conversa, mesmo
sem fila atribuída ao usuário. Ao configurar uma ou mais filas no grupo, somente
os usuários dessas filas e os administradores podem acessá-lo. Grupos no modo
**atendimento** sempre exigem uma fila configurada.

A mesma regra deve ser aplicada à lista de grupos, abertura de mensagens,
entrada na sala do socket, contagem de não lidas e notificações. Alterar as
filas de um grupo sem fila configurada exige perfil de administrador.
