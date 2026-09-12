# Redesign do Espaço Whats

A interface usa React 17, JavaScript e Material-UI v4. A referência é o projeto OpenDesign `e4031325-3084-4a61-a93a-2d585839d8d4`, especialmente `central-atendimento.html`, `painel.html`, `contatos.html`, `campanhas.html`, `configuracoes.html` e os tokens de `assets/core.css`.

## Organização

- `frontend/src/theme/identidadeVisual.js`: tipografia e superfícies claras/escuras.
- `frontend/src/theme/overrides.js`: aparência dos componentes Material-UI.
- `frontend/src/layout/Navegacao.js`: grupos, rotas, seleção e modo recolhido.
- `frontend/src/layout/AtalhosAtendimento.js`: troca entre atendimentos e chat interno.
- `frontend/src/components/CabecalhoPagina/index.js`: títulos e descrições.

As páginas mantêm os serviços, eventos de socket e ações existentes. O editor de chatbot mantém a árvore de opções e a persistência existente; os blocos demonstrativos de IA, supervisão e métricas sem equivalente no backend não criam funções fictícias. Cores e arquivos personalizados continuam sendo carregados pelas configurações da empresa. O padrão laranja só se aplica quando não existe uma cor configurada. Login, banners, logos, configurações e acesso ao código-fonte permanecem disponíveis.

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
