# Login e personalização da marca

## Escopo

Nova composição do login global: identidade Espaço Whats laranja, ícone fornecido pelo proprietário, painel editorial à esquerda e formulário em cartão à direita. Em telas estreitas, apenas o formulário e a marca são exibidos. O exemplo do concorrente orientou simplicidade, não identidade ou reprodução de layout.

- Autenticação existente preservada: identificar e-mail por slug, senha e criação de senha no primeiro acesso.
- Google, Microsoft e Apple são botões visuais desabilitados e identificados como “em breve”; não há OAuth implementado.
- Configurações → **Marca e login** fica visível para administradores do tenant. As permissões vêm do AuthContext, não dependem da consulta de empresa. A autorização da API continua obrigatória.
- Logos light/dark, favicon, cores, nome, links e imagens existentes foram preservados.
- Novas configurações públicas por tenant: `loginHeadline` (120 caracteres), `loginDescription` (240) e `loginTemplate` (`aurora`/`minimal`). Valores vazios usam textos traduzidos. Não requer migração, pois usa a tabela Setting existente.
- Personalização tem prévia do componente real, salvamento explícito e preserva rascunhos durante refetch. Erros não aparecem como sucesso.
- As animações podem ser pausadas, e a preferência `prefers-reduced-motion` também desativa autoplay de vídeo.

## Referências e licenças

O componente **Background Paths**, de Kokonut UI, foi consultado no [21st.dev](https://21st.dev/@kokonutd/components/background-paths) com uma visualização gratuita e adaptado para React 17 + Framer Motion 6 já instalado. A adaptação reduz a quantidade de caminhos, usa tempos determinísticos e acrescenta pausa/movimento reduzido. Licença MIT em `frontend/src/components/LoginExperience/KOKONUT-LICENSE.txt`.

O [Sign In de EaseMize](https://21st.dev/@easemize/components/sign-in) foi observado como referência visual; não copiamos sua implementação. Não foram adicionados serviços externos de autenticação nem dependências novas. O documento de design enviado retrata uma versão antiga com valores azuis; a orientação expressa mais recente do proprietário e os defaults laranja atuais do código prevalecem.

## Verificação

- Testes frontend: `cd frontend && CI=true npm test -- --watchAll=false --runInBand`.
- Testes backend novos são unitários, com modelos mockados; não usam banco nem os hooks destrutivos de `npm test`.
- A validação completa backend deve rodar em banco efêmero no workflow `ci-deploy.yml`.
- Prévia isolada: `cd frontend && node qa/login/serve.cjs`; porta 4319, rotas `/`, `/settings`, `/mobile` e `/mobile-small`. Importa componentes reais e bloqueia chamadas externas. Nenhuma autenticação real é feita na prévia.
- Publicação deste trabalho: apenas branch `dev`, projeto Dokploy **EspacoWhats Dev**, `teste.dev.espacowhats.com.br`. Não publicar em main, produção ou branches AC Norte.
