# Redesign do Espaço Whats

A interface usa React 17, JavaScript e Material-UI v4. A referência é o projeto OpenDesign `e4031325-3084-4a61-a93a-2d585839d8d4`, especialmente `central-atendimento.html`, `painel.html`, `contatos.html`, `campanhas.html`, `configuracoes.html` e os tokens de `assets/core.css`.

## Organização

- `frontend/src/theme/identidadeVisual.js`: tipografia e superfícies claras/escuras.
- `frontend/src/theme/overrides.js`: aparência dos componentes Material-UI.
- `frontend/src/layout/Navegacao.js`: grupos, rotas, seleção e modo recolhido.
- `frontend/src/layout/AtalhosAtendimento.js`: troca entre atendimentos e chat interno.
- `frontend/src/components/CabecalhoPagina/index.js`: títulos e descrições.

As páginas mantêm os serviços, eventos de socket e ações existentes. O editor visual substitui a navegação antiga por níveis. As ligações são publicadas de forma transacional nas opções do chatbot, preservando os identificadores existentes. Cores e arquivos personalizados continuam sendo carregados pelas configurações da empresa. O padrão laranja só se aplica quando não existe uma cor configurada. Login, banners, logos, configurações e acesso ao código-fonte permanecem disponíveis.

## Executar a aplicação completa

Na raiz do repositório, com os arquivos de ambiente local configurados:

```bash
docker compose -f docker-compose-local.yaml up -d --build
```

Frontend: http://localhost:3000. Backend: http://localhost:8080.

## Desenvolvimento e verificação

```bash
cd frontend
npm ci
NODE_OPTIONS=--openssl-legacy-provider npm run build
CI=true npm test -- --watchAll=false --runInBand
```

Para desenvolvimento com `npm start`, configure `public/config.json` para seu backend local, usando `public/config-dev-example.json` como referência. O bootstrap da aplicação consulta esse arquivo antes de iniciar o React.

```bash
NODE_OPTIONS=--openssl-legacy-provider npm start
```

O build compilado está em `frontend/build`. A prévia exige `config.json` e backend acessível. O Docker já gera a configuração e serve os arquivos pelo Nginx.

## Dev

O projeto Dokploy `EspacoWhats Dev` (`espacowhats-dev-axkfsz`) acompanha a branch `dev`. A implantação é verificada pelo estado dos containers, pelo arquivo JavaScript publicado e pelo tenant https://teste.dev.espacowhats.com.br. A branch de produção é independente.

A validação local cobre navegação expandida/recolhida, busca, painel e temas com dados fictícios. Os testes incluem preservação de branding, navegação, chamadas de voz, tarefas, transferência e reabertura de tickets. A inspeção autenticada no tenant depende de uma sessão válida do usuário.


## Editor visual e bibliotecas

- React Flow 12 (`@xyflow/react`): canvas navegável, conexões, nós, zoom e minimapa.
- Dagre: organização automática dos blocos.
- Radix UI: diálogos, abas, tooltips e switches acessíveis.
- Lucide: ícones dos novos componentes.
- Recharts permanece como biblioteca de gráficos; Material-UI atende os formulários existentes.
- CRACO 7 configura a resolução ESM das bibliotecas modernas no CRA 5 com React 17. Motion atual exige React 18.2; não foi instalado para evitar uma migração global sem relação com o canvas.

Os tokens em `components/interface` recebem as cores do tema da empresa. Não há paleta fixa substituindo o branding do tenant. O canvas é carregado sob demanda na rota `/fluxos/:queueId?`.

O editor inclui mensagens, menus, mídia, transferência e atendimento humano. Conectar um bloco muda sua posição na árvore de opções; ciclos e múltiplos pais não são suportados pelo executor atual e são validados. Blocos de condição, HTTP, espera, variáveis e agentes autônomos do protótipo ainda precisam de executores de backend e não aparecem como ações funcionais nesta entrega. Atendimento humano interrompe o bot; não fecha o ticket.

Rascunhos ficam no navegador, separados por empresa e fila. Publicar grava as posições no servidor e atualiza a saudação e as opções em uma transação. A API recusa versões desatualizadas, IDs de outro fluxo, transferências entre tenants e remoção de blocos com tickets ativos. Arquivos são enviados após publicar os blocos; anexos pendentes não sobrevivem ao fechamento da página. O teste de percurso é uma simulação sem envio de mensagens.

A central de configurações organiza os formulários por áreas. O painel lateral da conversa separa contato, atendimento e histórico. Contatos e grupos usam filtro no servidor; campanhas agrupam envios, agendamentos, listas e configuração.

### Backend

A implantação precisa executar a migração `20260912180000-add-queue-flow-layout`, que adiciona `Queues.flowLayout` (JSONB, anulável). O startup Docker já executa as migrações. Instalações manuais:

```bash
cd backend
npm run build
npm run db:migrate
npx jest --runInBand --coverage=false src/services/QueueFlowService/__tests__ src/services/ContactServices/__tests__/ListContactsService.groups.spec.ts
```

Fontes da escolha técnica: [React Flow](https://reactflow.dev/learn/customization/custom-nodes), [Dagre](https://reactflow.dev/examples/layout/dagre), [Radix UI](https://www.radix-ui.com/primitives/docs/components/dialog), [shadcn/ui](https://ui.shadcn.com/docs/installation/manual), [Motion](https://motion.dev/docs/react-installation) e [CRACO](https://craco.js.org/docs/getting-started/).
