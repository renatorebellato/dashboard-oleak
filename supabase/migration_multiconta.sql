-- Rode no Supabase: Painel do projeto > SQL Editor > New query > colar e Run.
--
-- Clientes multi-conta no Google Ads (ex: Grupo Meddi, uma conta por
-- unidade dentro da MCC Elo Criativo) e período padrão por cliente.

-- Quando preenchido (ex: '[Meddi]'), o Google Ads do cliente vira a soma de
-- TODAS as contas ativas da MCC cujo nome contém esse texto (sem diferenciar
-- maiúsculas). Contas novas com o mesmo prefixo entram sozinhas no dashboard.
-- Vazio = usa google_customer_id (uma conta só), como a Oleak.
alter table clients add column if not exists google_account_filter text;

-- Período em que o dashboard abre: '7d', '14d', '30d', 'month' ou 'ytd'
-- (ano atual). Vazio = 7 dias.
alter table clients add column if not exists default_period text;

-- O cadastro do cliente em si (com o hash da senha) NÃO fica neste arquivo,
-- porque o repositório é público — é feito direto no SQL Editor.
