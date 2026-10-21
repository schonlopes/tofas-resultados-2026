# Portal TOFAS 2026

Portal responsivo para consulta de certificados e relatórios do 8º ano e da 2ª série. Frontend público no GitHub Pages; API e área institucional no Cloudflare Workers/D1. Documentos permanecem no Google Drive.

## Estado desta entrega

- Pacote preparado para publicação e teste no GitHub Pages, com demonstração exclusivamente fictícia.
- Login Google implementado no código para todo o domínio escola.pr.gov.br, sem cadastro de usuários. Validação de assinatura, emissor, audiência, validade, email_verified e hd no backend.
- GOOGLE_CLIENT_ID ainda precisa ser preenchido com o identificador do aplicativo web criado no Google Cloud. Nenhum client secret é necessário neste fluxo.
- Importação real e liberação ainda pendentes; RELEASE_APPROVED=false. O código não equivale a login Google já configurado em produção.
- Em 20/10/2026, metadados das quatro planilhas confirmaram ausência de anyone e acesso leitor de escola.pr.gov.br. As permissões individuais dos PDFs não foram comprovadas pelo conector.
- O Worker publicado anteriormente ainda usa a versão de login local; esta entrega NÃO foi implantada automaticamente para evitar substituir o acesso funcional por uma configuração Google incompleta.

## Publicar e testar

Siga [PUBLICAR-NO-GITHUB.md](PUBLICAR-NO-GITHUB.md). A demonstração está em demo.html no build estático e não acessa nenhuma planilha ou arquivo real.

```
npm ci
npm test
npm run check
npm run build:pages
```

A pasta dist-pages contém somente arquivos públicos. Não use a raiz do projeto como conteúdo de Pages. O workflow .github/workflows/pages.yml testa, gera e publica essa pasta.

## Autenticação e acesso

A página de login roda no mesmo domínio da API (Worker). GitHub Pages encaminha o usuário para ela; não precisa de CORS nem recebe credenciais. O token Google fica somente na memória da aba, nunca em URL, localStorage ou arquivo. Cada requisição verifica sua validade; validade máxima de uma hora. Recarregar a página exige novo login. Sair apaga a credencial local, mas não desconecta a conta Google do navegador nem revoga tokens já emitidos.

Todo usuário com hd=escola.pr.gov.br confirmado pelo Google recebe acesso às escolas e documentos aprovados. Contas de outros domínios são negadas. Cookies e senhas do modo Embaixador antigo não autenticam no modo Google. Os módulos antigos permanecem apenas para compatibilidade com a versão anteriormente implantada; não habilitar AUTH_PROVIDER=ambassador no novo ambiente.

Os links de documentos são obtidos somente após autenticação, autorização e aprovação. O Google Drive decide se a conta conectada pode abrir o PDF. O portal não concede acesso no Drive, não copia PDFs e não confirma que houve download. Auditoria registra open_drive.

## Importação

scripts/sources.mjs contém os quatro IDs fornecidos. scripts/import.mjs faz apenas leituras das planilhas; exige GOOGLE_ACCESS_TOKEN autorizado com sheets.readonly e drive.metadata.readonly, IMPORT_HMAC_SECRET forte e estável, e registro de autorização em private/approval.json. O segredo de importação é separado do HMAC_SECRET de autenticação; preserve-o para manter IDs estáveis. Nenhum desses valores deve entrar no Git.

```
node scripts/import.mjs
node scripts/import.mjs --approved-read --index-only
```

O primeiro comando verifica estrutura/permissões sem importar linhas. O segundo prepara private/staging.sql, sem aprovar os documentos. O registro privado de autorização deve conter authorizedBy, purpose, sources (array com os quatro IDs) e expires (data ISO futura). Aplicar o SQL somente em um D1 de staging novo, com migrations/0001.sql; revisar contagens, conflitos, rejeições e permissões antes de promover. Não executar seed sintético no banco real. Não sobrepor um banco populado com staging.sql.

## Privacidade e segredos

Nomes e links reais ficam no D1 protegido; CGM não é persistido em texto pelo importador. As quatro planilhas são somente leitura. Nenhum arquivo privado, credencial de conta, exportação ou dado real integra o pacote. O aviso de privacidade institucional e contato ainda precisam ser finalizados antes da consulta real.

Referências: [Google Identity: configuração](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) e [validação do token e domínio](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
