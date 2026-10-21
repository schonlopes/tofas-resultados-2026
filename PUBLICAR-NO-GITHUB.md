# Publicar no GitHub e testar

## 1. Enviar o projeto

Extraia tofas-github-pronto.zip em uma pasta nova. Crie um repositório no GitHub e envie o conteúdo extraído para a raiz: package.json, public/, pages/, scripts/, src/, migrations/, test/ e .github/ devem ficar nesse nível, sem pasta intermediária.

Envie somente o pacote preparado. Não envie a pasta outputs inteira: ela contém um arquivo privado da conta antiga. Não envie private/, work/, .wrangler/, .env, .dev.vars, exportações de estudantes ou credenciais. O arquivo .gitignore reforça essas exclusões. Se usar upload pelo navegador, confirme que .github/workflows/pages.yml também foi enviado.

## 2. Ativar o Pages

No repositório, abra Settings → Pages → Build and deployment → Source: GitHub Actions. Na aba Actions, execute “Publicar portal no GitHub Pages” na branch main. O workflow também roda automaticamente a cada push em main.

O link será exibido no resultado do workflow e em Settings → Pages. Não foi criado nenhum repositório remoto nesta entrega; use o endereço gerado pelo seu GitHub.

Abra “Testar com dados fictícios” para selecionar NRE e escola e simular a consulta. Essa demonstração funciona sem Google Cloud, Cloudflare ou dados reais.

## 3. Configurar o login Google

No Google Cloud, configure um aplicativo OAuth do tipo Web application para o portal. Use somente identidade básica (openid/email/profile); não solicite leitura do Drive no login dos visitantes.

Em Authorized JavaScript origins, cadastre a origem exata do Worker, sem caminho:

https://tofas-2026.tofas-2026.workers.dev

O login ocorre no Worker, portanto não precisa cadastrar a URL do repositório como origem do login. Para teste local, siga a documentação Google e adicione localhost e sua porta. O fluxo usa callback JavaScript, sem redirect URI de login.

Copie o Client ID (termina em .apps.googleusercontent.com) para GOOGLE_CLIENT_ID em wrangler.jsonc. Client ID é público; não coloque client secret. A opção de audiência “Interno” só se aplica se o projeto pertencer à organização Workspace correspondente. Caso contrário, configure a audiência apropriada e solicite ao administrador do domínio a liberação do aplicativo se houver bloqueio institucional. O backend restringe hd=escola.pr.gov.br independentemente da dica exibida no seletor de conta.

Esta etapa de cadastro Google ainda não foi concluída. Não associe conta de faturamento ou aceite contratação para testar a demonstração estática.

## 4. Implantar o backend

No computador autorizado, na pasta do projeto:

```
npm ci
npx wrangler login
npx wrangler d1 migrations apply tofas --remote
npm run deploy
```

wrangler.jsonc referencia o D1 e a conta Cloudflare já utilizados neste projeto. Para outra conta, crie outro D1 e substitua os identificadores. HMAC_SECRET já está configurado no Worker existente; em um Worker novo, defina um segredo aleatório com pelo menos 32 caracteres por `npx wrangler secret put HMAC_SECRET`. Não o inclua no GitHub.

Mantenha AUTH_PROVIDER=google, DOCUMENT_DELIVERY=drive e RELEASE_APPROVED=false durante a configuração. Teste o botão Google com uma conta do domínio e com uma conta externa. O modo Google não aceita o login/senha Embaixador antigo.

## 5. Conectar Pages ao backend

Depois de configurar e testar o login Google no Worker, abra Settings → Secrets and variables → Actions → Variables e crie PROTECTED_PORTAL_URL com a origem HTTPS do Worker, sem caminho. Execute novamente o workflow Pages. A área institucional passará a encaminhar os visitantes ao Worker.

O site estático sem essa variável continua disponível para demonstração; não anuncia login real funcionando.

## 6. Liberar consulta real

Importe o índice das quatro planilhas em staging conforme README. Revise registros rejeitados e conflitos; confira as permissões de PDFs e teste a abertura com conta autorizada e sem autorização. Preencha o contato e aviso institucional de privacidade. Aprove escolas/documentos no banco e só então altere DATASET=real e RELEASE_APPROVED=true e publique o Worker. Nenhum comando de publicação de Pages ativa dados reais automaticamente.

## Verificação desta entrega

20 testes automatizados passaram, incluindo JWT Google, domínio exato, token falso/expirado, recusa de cookies antigos no modo Google, controle de links e pacote público. Checagem estática e geração de Pages também passaram. O teste real de login Google depende do Client ID e da conta institucional; não foi executado.
