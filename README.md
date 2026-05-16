# VooLisboa ✈️

App mobile (PWA instalável) que monitora preços de passagens aéreas de ida e volta de e para Lisboa. Mostra preços em EUR e BRL, indica a companhia aérea com o melhor preço e gera link de compra direto.

- **Frontend**: React + Vite, hospedado de graça no GitHub Pages
- **Dados de voo**: SerpAPI (Google Flights), via um proxy Cloudflare Worker
- **Persistência**: `localStorage` (rotas e configurações ficam no aparelho)

-----

## Visão geral da arquitetura

```
[App PWA / GitHub Pages]  →  [Cloudflare Worker]  →  [SerpAPI Google Flights]
         │
         └─ localStorage: rotas + último preço por rota + configurações
```

A chave da SerpAPI **fica só no Cloudflare Worker** — nunca vai para o GitHub. O repositório é seguro para ser público.

-----

## Parte 1 — Publicar o app no GitHub Pages

### 1. Criar o repositório

1. Em **github.com**, clique em **New repository**.
1. Nome sugerido: `voo-lisboa` (pode ser outro — o deploy se adapta ao nome).
1. Deixe **público**, sem README/`.gitignore` (já vêm prontos aqui).
1. **Create repository**.

### 2. Subir os arquivos

Opção A — pela interface web (mais simples):

1. Na página do repositório vazio, clique em **uploading an existing file**.
1. Arraste **todo o conteúdo desta pasta** (não a pasta em si — os arquivos e subpastas de dentro).
1. **Commit changes**.

Opção B — pelo Git (terminal), dentro desta pasta:

```bash
git init
git add .
git commit -m "VooLisboa: versão inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/voo-lisboa.git
git push -u origin main
```

> Importante: a branch precisa se chamar **main** (o workflow de deploy escuta essa branch).

### 3. Ativar o GitHub Pages

1. No repositório: **Settings → Pages**.
1. Em **Build and deployment → Source**, escolha **GitHub Actions**.
1. Pronto. Não precisa configurar mais nada aqui.

### 4. Aguardar o deploy

1. Vá na aba **Actions** do repositório.
1. O workflow “Deploy to GitHub Pages” roda sozinho a cada `push`. Aguarde ~1–2 min até ficar verde.
1. A URL do app aparece em **Settings → Pages** (formato `https://SEU-USUARIO.github.io/voo-lisboa/`).

A partir daí, **todo `git push` na branch `main` republica o app automaticamente**.

-----

## Parte 2 — Configurar a fonte de dados (SerpAPI + Cloudflare Worker)

Sem isso o app roda em **modo demo** (preços estimados). Para preços reais:

### 1. SerpAPI

1. Crie conta grátis em **https://serpapi.com/users/sign_up** (250 buscas/mês grátis).
1. Copie sua chave em **https://serpapi.com/manage-api-key**.

### 2. Cloudflare Worker

1. Acesse **https://dash.cloudflare.com** (crie conta grátis — 100k requisições/dia).
1. **Workers & Pages → Create → Create Worker**. Nome: `voo-lisboa`.
1. **Edit code** → cole o conteúdo de `worker/voo-lisboa-worker.js` → **Deploy**.
1. **Settings → Variables and Secrets**, adicione:
- `SERPAPI_KEY` (tipo **Secret**) → sua chave da SerpAPI.
- `APP_SECRET` (tipo **Secret**, opcional) → uma senha aleatória qualquer, para impedir que outras pessoas usem seu Worker.
- `ALLOWED_ORIGIN` (tipo **Text**, opcional) → a URL do app no GitHub Pages, para restringir o CORS. Deixe em branco para permitir qualquer origem.
1. Em **Settings → Triggers**, copie a URL do Worker (`https://voo-lisboa.SEU-USER.workers.dev`).

### 3. Conectar no app

1. Abra a URL do app (Parte 1, passo 4) no **Safari do iPhone**.
1. Toque na engrenagem (⚙) no topo.
1. Cole a **URL do Worker** e o **segredo** (se configurou `APP_SECRET`).
1. **Testar conexão** → deve mostrar um preço de teste LIS→MAD.
1. **Salvar**.

-----

## Parte 3 — Instalar como app no iPhone

Com a URL do app aberta no Safari:

1. Toque no botão de compartilhar (⎙).
1. **Adicionar à Tela de Início**.

Vira um ícone que abre em tela cheia, sem a barra do Safari, como app nativo. As rotas e configurações ficam salvas no aparelho.

-----

## Desenvolvimento local (opcional)

Requer Node.js 18+.

```bash
npm install      # instala as dependências
npm run dev      # servidor de desenvolvimento (http://localhost:5173)
npm run build    # gera a versão de produção em dist/
npm run preview  # pré-visualiza a build
```

-----

## Estrutura do projeto

```
voo-lisboa/
├─ .github/workflows/deploy.yml   → deploy automático no GitHub Pages
├─ public/                        → ícones do app (PWA) e favicon
├─ src/
│  ├─ App.jsx                     → o app inteiro (React)
│  ├─ main.jsx                    → ponto de entrada
│  └─ index.css                   → estilos globais (Tailwind)
├─ worker/voo-lisboa-worker.js    → proxy Cloudflare (deploy separado)
├─ index.html
├─ package.json
├─ vite.config.js                 → config do Vite + PWA
├─ tailwind.config.js
└─ postcss.config.js
```

-----

## Notas

- **Nome do repositório**: o workflow de deploy injeta o caminho base automaticamente a partir do nome do repositório. Se renomear o repo, o próximo deploy se ajusta sozinho.
- **Custos**: GitHub Pages, Cloudflare Workers e a cotação EUR↔BRL (Frankfurter API) são gratuitos. A SerpAPI é grátis até 250 buscas/mês; o Worker faz cache de 30 min para reduzir chamadas.
- **Segurança**: a `SERPAPI_KEY` existe apenas no Cloudflare Worker. Nada sensível fica no repositório, então ele pode ser público sem problema.
- **Modo demo**: enquanto a URL do Worker não estiver configurada, o app mostra preços estimados (claramente rotulados) para você testar a interface.
