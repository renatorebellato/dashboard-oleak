-- Rode este script no Supabase: Painel do projeto > SQL Editor > New query > colar e Run.
-- Cria a tabela "weekly_reports", que guarda um snapshot por semana com o
-- desempenho das campanhas da Oleak (Google Ads + Meta Ads), campanha a
-- campanha e consolidado, sempre comparando com os 7 dias anteriores.

create table if not exists weekly_reports (
  id bigint generated always as identity primary key,
  period_start date not null,
  period_end date not null,
  prev_period_start date not null,
  prev_period_end date not null,
  data jsonb not null,              -- relatório completo (ver lib/types.ts no app)
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (period_start, period_end)
);

create index if not exists idx_weekly_reports_period on weekly_reports (period_start desc);

-- Segurança (RLS): por enquanto liberado para leitura/escrita com a chave
-- pública (anon), mesmo modelo usado no dashboard-clientes-next, já que o
-- app ainda não tem login de usuário.
-- IMPORTANTE: qualquer pessoa com o link do site consegue ler e editar os
-- dados enquanto essa política estiver assim. Se isso for um problema,
-- peça para adicionarmos login (Supabase Auth) mais adiante.
alter table weekly_reports enable row level security;

drop policy if exists "allow all - mvp sem login" on weekly_reports;
create policy "allow all - mvp sem login"
  on weekly_reports
  for all
  using (true)
  with check (true);

-- Habilita eventos em tempo real (para a tela atualizar sozinha quando o
-- relatório da semana for importado).
alter publication supabase_realtime add table weekly_reports;
