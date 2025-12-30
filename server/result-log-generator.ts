import * as XLSX from 'xlsx';
import type { SendResult } from './session-storage';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface LogGeneratorOptions {
  format: 'xlsx' | 'txt';
  filename?: string;
}

export function generateResultLog(results: SendResult[], options: LogGeneratorOptions): Buffer {
  if (options.format === 'xlsx') {
    return generateXlsxLog(results);
  } else {
    return generateTxtLog(results);
  }
}

function generateXlsxLog(results: SendResult[]): Buffer {
  const data = results.map((r, idx) => ({
    'Seq': idx + 1,
    'Codigo MTR': r.mtrCode,
    'Plataforma': r.platform,
    'Status': r.success ? 'RECEBIDO' : 'ERRO',
    'Mensagem': r.message,
    'Data/Hora': format(r.timestamp, "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
  }));

  const summary = {
    total: results.length,
    success: results.filter(r => r.success).length,
    error: results.filter(r => !r.success).length,
  };

  const summaryData = [
    { 'Resumo': 'Total de MTRs', 'Valor': summary.total },
    { 'Resumo': 'Recebidos com sucesso', 'Valor': summary.success },
    { 'Resumo': 'Com erro', 'Valor': summary.error },
    { 'Resumo': 'Taxa de sucesso', 'Valor': `${summary.total > 0 ? ((summary.success / summary.total) * 100).toFixed(1) : 0}%` },
  ];

  const wb = XLSX.utils.book_new();
  
  const wsResults = XLSX.utils.json_to_sheet(data);
  wsResults['!cols'] = [
    { wch: 5 },   // Seq
    { wch: 40 },  // Codigo MTR
    { wch: 10 },  // Plataforma
    { wch: 12 },  // Status
    { wch: 60 },  // Mensagem
    { wch: 20 },  // Data/Hora
  ];
  XLSX.utils.book_append_sheet(wb, wsResults, 'Resultados');

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [
    { wch: 25 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function generateTxtLog(results: SendResult[]): Buffer {
  const lines: string[] = [];
  const separator = '='.repeat(100);
  
  lines.push(separator);
  lines.push('  LOG DE RECEBIMENTO DE MTRs');
  lines.push(`  Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}`);
  lines.push(separator);
  lines.push('');

  const summary = {
    total: results.length,
    success: results.filter(r => r.success).length,
    error: results.filter(r => !r.success).length,
  };

  lines.push('RESUMO:');
  lines.push(`  Total de MTRs processados: ${summary.total}`);
  lines.push(`  Recebidos com sucesso: ${summary.success}`);
  lines.push(`  Com erro: ${summary.error}`);
  lines.push(`  Taxa de sucesso: ${summary.total > 0 ? ((summary.success / summary.total) * 100).toFixed(1) : 0}%`);
  lines.push('');
  lines.push(separator);
  lines.push('');
  lines.push('DETALHES:');
  lines.push('');

  results.forEach((r, idx) => {
    const status = r.success ? '[OK]' : '[ERRO]';
    lines.push(`${(idx + 1).toString().padStart(3, ' ')}. ${status} ${r.mtrCode}`);
    lines.push(`     Plataforma: ${r.platform}`);
    lines.push(`     Mensagem: ${r.message}`);
    lines.push(`     Data/Hora: ${format(r.timestamp, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}`);
    lines.push('');
  });

  lines.push(separator);
  lines.push('  FIM DO LOG');
  lines.push(separator);

  return Buffer.from(lines.join('\n'), 'utf-8');
}

export function getLogFilename(format: 'xlsx' | 'txt'): string {
  const timestamp = format === 'xlsx' ? format : format;
  const dateStr = format === 'xlsx' 
    ? new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
    : new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `log_recebimento_${dateStr}.${format}`;
}
