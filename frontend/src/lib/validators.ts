/**
 * Utilitários de Validação e Formatação de Documentos e Telefones
 */

// Formata string para máscara de CPF: 000.000.000-00
export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Validação matemática de CPF (algoritmo dos dois dígitos verificadores - Módulo 11)
export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // Bloqueia 00000000000, 11111111111, etc.

  // 1º Dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(9), 10)) return false;

  // 2º Dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(10), 10)) return false;

  return true;
}

// Formata string para máscara de Telefone: (00) 0000-0000 ou (00) 00000-0000
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// Valida se o telefone tem DDD e tamanho mínimo
export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

/**
 * Formata valores numéricos ou strings de dígitos em moeda brasileira (BRL).
 * Ex: "150" -> "1,50", "15000" -> "150,00", 18.5 -> "18,50"
 */
export function maskCurrency(value: string | number | null | undefined, allowEmpty = false): string {
  if (value === null || value === undefined || value === '') {
    return allowEmpty ? '' : '0,00';
  }

  // Se já for número, converte diretamente
  if (typeof value === 'number') {
    if (value === 0 && allowEmpty) return '';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Remove não-dígitos
  const digits = String(value).replace(/\D/g, '');
  if (!digits) {
    return allowEmpty ? '' : '0,00';
  }

  const cents = parseInt(digits, 10);
  if (cents === 0 && allowEmpty) return '';

  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converte string formatada em moeda BRL ("1.250,50" ou "18,50") de volta para float (number).
 */
export function parseCurrency(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;

  const str = String(value).trim();
  // Se for uma string de dígitos crus sem formatação
  const digits = str.replace(/\D/g, '');
  if (!digits) return 0;

  // Se a string contiver vírgula ou ponto como separador
  if (str.includes(',') || str.includes('.')) {
    // Se foi formatada por maskCurrency (ex: "1.250,50")
    const normalized = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }

  return parseInt(digits, 10) / 100;
}

/**
 * Formata valores percentuais com até 2 casas decimais e teto configurável (padrão 100%).
 * Ex: "15" -> "15%", "15,5" -> "15,50%"
 */
export function maskPercentage(value: string | number | null | undefined, max = 100, allowEmpty = false): string {
  if (value === null || value === undefined || value === '') {
    return allowEmpty ? '' : '0,00%';
  }

  if (typeof value === 'number') {
    const clamped = Math.min(Math.max(0, value), max);
    return `${clamped.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  const digits = String(value).replace(/\D/g, '');
  if (!digits) return allowEmpty ? '' : '0,00%';

  const cents = parseInt(digits, 10);
  const num = Math.min(cents / 100, max);
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Extrai o valor numérico de um percentual.
 */
export function parsePercentage(value: string | number | null | undefined, max = 100): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.min(Math.max(0, value), max);

  const clean = String(value).replace(/%/g, '').trim().replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  return Math.min(Math.max(0, parsed), max);
}

