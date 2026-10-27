# Acesso às conversas de grupos

Cada grupo pertence a uma empresa. Um administrador da empresa pode abrir todos
os grupos dela.

Para grupos no modo **conversa**, uma lista vazia em `GroupQueues` significa que
todos os usuários da mesma empresa podem ler e participar da conversa, mesmo
sem fila atribuída ao usuário. Ao configurar uma ou mais filas no grupo, somente
os usuários dessas filas e os administradores podem acessá-lo. Grupos no modo
**atendimento** sempre exigem uma fila configurada.

Na edição de usuário, **Acesso aos grupos de conversa** permite selecionar
grupos específicos. `Users.groupAccessIds = null` preserva a regra por filas
acima, inclusive para todos os usuários existentes. Um array, mesmo vazio,
substitui a regra por filas para conversas: o usuário comum só acessa os
grupos listados. Administradores continuam com acesso a todos os grupos da
própria empresa. A API valida os IDs selecionados contra os grupos de conversa
da empresa do usuário. `GET /users/group-options` lista as opções para
administradores; `POST/PUT /users` recebem `groupAccessIds`.

A mesma regra deve ser aplicada à lista de grupos, abertura de mensagens,
entrada na sala do socket, contagem de não lidas e notificações. Alterar as
filas e o modo de um grupo exige perfil de administrador. A alteração de acesso
de um usuário dispara `groupAccessChanged` para recarregar sua lista e contagem
de não lidas em tempo real.
