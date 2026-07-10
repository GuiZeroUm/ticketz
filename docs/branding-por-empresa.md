# Personalização (branding) por empresa na tela de login

Cada empresa (tenant) pode ter sua própria identidade visual — cor primária,
logo, nome, links e **banner** (imagem de fundo / imagem lateral) — aplicada
já na **tela de login** e na **tela de carregamento (splash)**, antes mesmo do
usuário se autenticar.

## Como funciona

Antes do login o sistema ainda não sabe quem é o usuário, então ele identifica
a empresa pelo **subdomínio** do endereço acessado:

```
cliente1.seusite.com.br  ->  slug "cliente1"  ->  empresa com slug = cliente1
cliente2.seusite.com.br  ->  slug "cliente2"  ->  empresa com slug = cliente2
seusite.com.br           ->  sem slug         ->  empresa "master" (fallback)
```

Com o slug resolvido, o backend devolve as configurações públicas daquela
empresa (`/public-settings`) e o frontend aplica cor, logo, nome e banner no
login e no splash.

> Depois do login o branding passa a vir da empresa do usuário autenticado
> (independe do subdomínio), por isso a personalização "dentro" do sistema
> sempre funcionou.

## O que precisa ser configurado

Para o branding por empresa aparecer no login, os **quatro** itens abaixo
precisam estar corretos. Se qualquer um faltar, o login cai na marca neutra
(genérica) ou na empresa master.

### 1. Domínio base no frontend — `APP_BASE_DOMAIN`

Variável de ambiente do **serviço frontend** (no Railway: aba *Variables*).
Deve ser o domínio raiz, sem subdomínio:

```
APP_BASE_DOMAIN=seusite.com.br
```

Sem isso, o slug nunca é derivado e o login sempre usa o fallback.

### 2. Empresa master (fallback) no backend — `MASTER_COMPANY_ID`

Variável de ambiente do **serviço backend**. Define qual empresa aparece
quando **não há subdomínio** (domínio raiz, `www`, IP, ou subdomínio
desconhecido):

```
MASTER_COMPANY_ID=1
```

Se ficar vazio/ inválido, o fallback usa a marca neutra embutida (nada
personalizado). Aponte para uma empresa de vitrine/testes — **nunca** para um
cliente real, para não vazar a marca de um cliente no domínio raiz.

### 3. Slug (subdomínio) de cada empresa

No painel, em **Empresas**, preencha o campo **"Subdomínio (slug)"** de cada
empresa com o mesmo texto do subdomínio (ex.: `cliente1`). Regras: apenas
letras minúsculas, números e hífen; até 63 caracteres; alguns nomes são
reservados (`www`, `api`, `app`, `admin`, `backend`, `frontend`, ...).

### 4. DNS + domínio no Railway (curinga)

Para que `cliente1.seusite.com.br`, `cliente2...` etc. cheguem ao frontend:

1. No provedor de DNS, crie um registro **curinga**:
   `*.seusite.com.br  ->  (CNAME para o domínio do frontend no Railway)`
2. No Railway, no serviço **frontend**, em *Settings > Domains*, adicione o
   domínio curinga `*.seusite.com.br` (e também `seusite.com.br` para o
   fallback master).

> Sem o DNS curinga, os subdomínios não resolvem e não há como testar o
> branding por empresa em produção.

## Onde configurar o branding de cada empresa

Painel do sistema (logado como admin da empresa):
**Configurações > Personalização (Whitelabel)**

- **Cor primária clara / escura**
- **Logo claro / escuro / favicon**
- **Nome do app**
- **Links da tela de login**
- **Imagem lateral do login** (`loginSidePanelImage`) — layout dividido
- **Conteúdo de fundo do login** (`loginBackgroundContent`) — imagem ou vídeo
  de fundo. É a imagem usada também como banner na tela de carregamento.

## Banner na tela de carregamento (splash)

A tela de carregamento agora também exibe o banner da empresa (a mesma imagem
do **Conteúdo de fundo do login**; se não houver, usa a **Imagem lateral**).
Apenas imagens são usadas no splash — vídeos são ignorados ali para não pesar
o carregamento. Se nenhuma imagem estiver configurada, o splash mantém o
gradiente animado padrão com a cor primária da empresa.

## Como testar rapidamente

- **Produção:** acesse `https://<slug>.seusite.com.br/login` e confira cor,
  logo e banner da empresa correspondente. Acesse o domínio raiz para ver a
  empresa master.
- **Desenvolvimento local:** os navegadores resolvem `*.localhost` para
  `127.0.0.1` automaticamente, então basta acessar
  `http://<slug>.localhost:3000/login` (não precisa mexer no `APP_BASE_DOMAIN`
  em dev).

## Checklist de diagnóstico ("o login não muda nada")

1. `APP_BASE_DOMAIN` está definido no frontend e igual ao domínio raiz? ✔
2. O subdomínio acessado bate com o **slug** cadastrado na empresa? ✔
3. O DNS curinga (`*.seusite.com.br`) resolve para o frontend? ✔
4. A empresa tem cor/logo/banner salvos na tela de Personalização? ✔
5. Sem subdomínio: `MASTER_COMPANY_ID` aponta para a empresa desejada? ✔
