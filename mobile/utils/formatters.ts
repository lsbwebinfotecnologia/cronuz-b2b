/** Formata valor monetário em BRL */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Formata data ISO para DD/MM/YYYY HH:mm */
export function formatDate(iso: string, showTime = true): string {
  try {
    const date = new Date(iso);
    const d = date.toLocaleDateString('pt-BR');
    if (!showTime) return d;
    const t = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${d} ${t}`;
  } catch {
    return iso;
  }
}

/** Formata data relativa (ex: "há 2 horas") */
export function formatRelativeDate(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 172800) return 'ontem';
  return formatDate(iso, false);
}

/** Capitaliza primeira letra */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Status do pedido em português — DE/PARA completo */
export function formatOrderStatus(status: string): string {
  const map: Record<string, string> = {
    // Status padrão
    pending:              'Pendente',
    approved:             'Aprovado',
    processing:           'Em Processamento',
    shipped:              'Enviado',
    delivered:            'Entregue',
    cancelled:            'Cancelado',
    rejected:             'Rejeitado',
    // Status Horus ERP
    sent_to_horus:        'Enviado ao ERP',
    invoiced:             'Faturado',
    // Status Cronuz
    processado:           'Processado',
    recebido:             'Recebido',
    em_separacao:         'Em Separação',
    separado:             'Separado',
    em_transito:          'Em Trânsito',
    entregue:             'Entregue',
    devolvido:            'Devolvido',
    // Aliases
    'sent to horus':      'Enviado ao ERP',
    draft:                'Rascunho',
    confirmed:            'Confirmado',
    completed:            'Concluído',
  };
  const key = status?.toLowerCase().replace(/ /g, '_');
  return map[key] ?? map[status?.toLowerCase()] ?? capitalize(status ?? '');
}

/** Trunca string com ellipsis */
export function truncate(str: string, max: number): string {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '…';
}

/** Remove máscara de CPF/CNPJ e retorna só números */
export function unmaskDocument(doc: string): string {
  return doc.replace(/\D/g, '');
}
