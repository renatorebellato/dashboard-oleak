-- Rode este script no Supabase: Painel do projeto > SQL Editor > New query > colar e Run.
--
-- Este projeto virou multi-tenant: um dashboard (com login e senha
-- próprios) por cliente da Elo Criativo, todos no mesmo app.

-- ============================================================
-- 1) Tabela "clients" — um registro por cliente (Oleak, e os que vierem)
-- ============================================================
create extension if not exists pgcrypto; -- necessário para gen_random_uuid()

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,               -- usado na URL: /c/<slug>
  name text not null,                      -- nome exibido no dashboard
  password_hash text not null,             -- "saltHex.hashHex" (PBKDF2-SHA256) — nunca a senha em texto puro
  active boolean not null default true,

  meta_account_id text,
  meta_account_name text,

  google_customer_id text,
  google_account_name text,
  google_mcc_name text default 'Elo Criativo',

  ga4_property_id text,                    -- preenchido quando integrarmos o GA4

  created_at timestamptz default now()
);

alter table clients enable row level security;
-- De propósito, SEM NENHUMA policy: ninguém com a chave anon (pública)
-- consegue ler ou escrever aqui — a tabela guarda hash de senha e IDs de
-- conta de anúncio. Todo acesso passa pelo servidor (service role key),
-- dentro das rotas /api/**.

-- ============================================================
-- 2) weekly_reports agora pertence a um cliente
-- ============================================================
alter table weekly_reports add column if not exists client_id uuid references clients(id);

-- Remove a regra antiga (período único pra tabela inteira) e cria uma nova
-- (período único POR CLIENTE — dois clientes podem ter relatório da mesma
-- semana).
alter table weekly_reports drop constraint if exists weekly_reports_period_start_period_end_key;
alter table weekly_reports
  drop constraint if exists weekly_reports_client_period_key,
  add constraint weekly_reports_client_period_key unique (client_id, period_start, period_end);

create index if not exists idx_weekly_reports_client_period on weekly_reports (client_id, period_start desc);

-- Fecha o acesso público: antes estava "allow all" (MVP sem login, um único
-- cliente). Agora que a tabela guarda relatório de vários clientes, isso
-- vazaria o relatório de um cliente pro outro pra quem tivesse a chave anon.
-- Toda leitura/escrita passa a ir pelas rotas /api/** (service role, no
-- servidor), então não precisamos de nenhuma policy aqui.
drop policy if exists "allow all - mvp sem login" on weekly_reports;

-- Não usamos mais Supabase Realtime nesta tabela (a tela busca via API
-- autenticada agora, não mais direto do navegador) — remove da publicação.
-- "alter publication ... drop table" nao aceita "if exists", entao
-- checamos antes se a tabela esta mesmo na publicacao.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'weekly_reports'
  ) then
    execute 'alter publication supabase_realtime drop table weekly_reports';
  end if;
end $$;

-- ============================================================
-- 3) Migração: cadastra a Oleak como o primeiro cliente e liga o relatório
-- que já existe a ela. A senha continua sendo a mesma de antes
-- (ELO@2026!Oleak) — o hash abaixo já corresponde a ela.
-- ============================================================
insert into clients (
  slug, name, password_hash,
  meta_account_id, meta_account_name,
  google_customer_id, google_account_name, google_mcc_name
) values (
  'oleak',
  'Oleak',
  'bb5b329a0059c44c055a641f03f3b7e7.cb00b900d7455b2dd26ffde0a230d5c91f140ca267408120d2c3c920caf2373f',
  '271327700853914',
  'OLEAK INDUSTRIA E COMERCIO LTDA',
  '3707738500',
  'Oleak - Ativa',
  'Elo Criativo'
)
on conflict (slug) do nothing;

update weekly_reports
set client_id = (select id from clients where slug = 'oleak')
where client_id is null;

-- A partir daqui todo relatório precisa ter um dono — pega qualquer bug
-- futuro cedo (ex: um insert que esqueceu do client_id).
alter table weekly_reports alter column client_id set not null;
