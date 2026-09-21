# Dashboard Oleak — Next.js + Supabase

Dashboard de performance de mídia paga da Oleak (Google Ads + Meta Ads),
campanha a campanha e consolidado, sempre comparando os últimos 7 dias com
os 7 dias anteriores. Toda segunda-feira um novo relatório é importado
(manual ou via tarefa agendada do Claude) para a reunião de acompanhamento
com o cliente.

## O que já está pronto

- Tabela `weekly_reports` (schema em `supabase/schema.sql`) — um snapshot
  por semana, guardado como JSON (`data`), com os campos usados na tela.
- Tela única (`app/page.tsx` + `components/Dashboard.tsx`) com: seletor de
  semana, cards de indicadores consolidados (investimento, impressões,
  cliques, CTR, conversões, ROAS) com variação vs. período anterior, tabela
  campanha a campanha por plataforma (Meta Ads e Google Ads), destaque do
  anúncio com melhor desempenho da semana, e um importador de JSON
  (`components/ImportModal.tsx`) — mesmo padrão do dashboard-clientes-next.
- Atualização em tempo real via Supabase Realtime.
- Campanhas filtradas pela regra: **ativas OU com impressões > 1 no
  período**.

## Passo a passo para publicar

### 1. Banco de dados (Supabase)

1. Crie um projeto Supabase novo (dedicado a este dashboard).
2. No painel do projeto, vá em **SQL Editor** → **New query**.
3. Cole o conteúdo do arquivo `supabase/schema.sql` (nesta pasta) e clique
   em **Run**. Isso cria a tabela `weekly_reports`.

### 2. Subir este código para o GitHub

1. Entre em [github.com](https://github.com) e clique em **New repository**.
2. Dê um nome (ex: `dashboard-oleak`) e crie o repositório (pode deixar
   privado).
3. Na página do repositório vazio, clique em **"uploading an existing
   file"** (ou **Add file → Upload files**).
4. Arraste **todos os arquivos e pastas desta pasta** para a janela do
   navegador (exceto `node_modules` e `.next`, que não devem existir aqui).
5. Clique em **Commit changes**.

### 3. Publicar na Vercel

1. Entre em [vercel.com](https://vercel.com) e clique em **Add New → Project**.
2. Selecione o repositório que você acabou de criar no GitHub.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` → Project URL do projeto Supabase da Oleak
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → chave anon/public desse projeto
4. Clique em **Deploy**. Em 1–2 minutos o app estará no ar, com um link
   público (algo como `dashboard-oleak.vercel.app`).

### 4. Primeiro relatório

O dashboard começa vazio. Use o botão **"Importar relatório"** e cole o
JSON gerado (pelo Claude, a partir dos dados do Google Ads e do Meta Ads).
O formato do JSON está em `lib/types.ts` (tipo `ReportData`).

## Rodando localmente (opcional, para quem for mexer no código)

```
npm install
cp .env.example .env.local   # preencher com as chaves do Supabase
npm run dev
```

Abre em `http://localhost:3000`.
