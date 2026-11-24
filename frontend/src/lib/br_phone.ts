export const VALID_BR_DDDS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99',
]);

export function formatBrPhoneMask(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function validateBrPhoneClient(raw: string): { valid: boolean; error?: string; digits: string } {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (digits.length < 10) {
    return { valid: false, error: 'Informe o DDD (2 dígitos) + número completo.', digits };
  }
  if (digits.length > 11) {
    return { valid: false, error: 'Número com dígitos acima do padrão (DDD + 9 dígitos).', digits };
  }
  const ddd = digits.slice(0, 2);
  if (!VALID_BR_DDDS.has(ddd)) {
    return { valid: false, error: `DDD (${ddd}) inválido no Brasil.`, digits };
  }
  if (digits.length === 11 && digits[2] !== '9') {
    return { valid: false, error: 'Celular de 9 dígitos deve começar com 9 após o DDD.', digits };
  }
  return { valid: true, digits };
}
