// Calcula o período do relatório: últimos 7 dias completos (sem contar
// hoje) e os 7 dias imediatamente anteriores, sempre no fuso de São Paulo.
// Mesma regra usada nos relatórios montados manualmente.

function formatDateYYYYMMDD(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function computeWeekPeriod(referenceDate: Date = new Date()) {
  const todayStr = formatDateYYYYMMDD(referenceDate);
  const today = new Date(`${todayStr}T00:00:00Z`);

  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - 1); // ontem
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6); // 7 dias terminando ontem

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return {
    period: { start: fmt(start), end: fmt(end) },
    previous_period: { start: fmt(prevStart), end: fmt(prevEnd) },
  };
}

// Período "ao vivo": últimos 7 dias incluindo hoje (dados parciais do dia
// corrente), comparado aos 7 dias anteriores a essa janela. Usado pelo
// dashboard em tempo real (/api/live), diferente do computeWeekPeriod()
// acima que só considera dias completos (usado no snapshot semanal salvo).
export function computeLiveWeekPeriod(referenceDate: Date = new Date()) {
  const todayStr = formatDateYYYYMMDD(referenceDate);
  const end = new Date(`${todayStr}T00:00:00Z`); // hoje (parcial)
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6); // 7 dias terminando hoje

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return {
    period: { start: fmt(start), end: fmt(end) },
    previous_period: { start: fmt(prevStart), end: fmt(prevEnd) },
  };
}

// Período customizado: recebe início/fim escolhidos no filtro do dashboard
// (presets de 7/14/30 dias, mês atual, ou datas livres) e calcula o período
// anterior com a mesma duração, imediatamente antes do início escolhido.
export function computeCustomPeriod(startStr: string, endStr: string) {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));

  return {
    period: { start: fmt(start), end: fmt(end) },
    previous_period: { start: fmt(prevStart), end: fmt(prevEnd) },
  };
}

// Número de dias (inclusive) de um período — usado para calcular médias
// diárias (ex: controle de orçamento diário).
export function periodDays(period: { start: string; end: string }): number {
  const start = new Date(`${period.start}T00:00:00Z`);
  const end = new Date(`${period.end}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}
