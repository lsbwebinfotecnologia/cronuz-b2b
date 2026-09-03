'use client';

import React, { useState, useEffect, useRef, ChangeEvent, FocusEvent } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
}

/**
 * CurrencyInput — Campo de valor monetário com formatação BR (ex: 1.250,00)
 *
 * Comportamento:
 * - Ao focar: exibe o valor numérico puro (ex: "950,00") com todo o texto selecionado
 *   para que o usuário possa sobrescrever diretamente.
 * - Durante digitação: aceita qualquer entrada, remove não-numéricos e vírgula/ponto
 *   como separador decimal (ex: "950" ou "950,00" ou "950.00").
 * - Ao sair (blur): formata e confirma o valor no estado do pai.
 */
export function CurrencyInput({
  value,
  onChangeValue,
  prefixStr = '',
  suffixStr = '',
  maxDecimals = 2,
  className,
  ...props
}: CurrencyInputProps) {
  const isFocused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatBR = (num: number) =>
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: maxDecimals,
      maximumFractionDigits: maxDecimals,
    }).format(num);

  // Estado de exibição: formatado quando fora de foco, bruto quando focado
  const [displayValue, setDisplayValue] = useState(formatBR(value ?? 0));

  // Sincroniza quando o valor externo muda (ex: após fetchDetails) e o campo não está focado
  useEffect(() => {
    if (!isFocused.current) {
      setDisplayValue(formatBR(value ?? 0));
    }
  }, [value]);

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    isFocused.current = true;
    // Ao focar, exibe o valor sem formatação para facilitar edição
    // ex: "1.250,00" → "1250,00" (remove pontos de milhar, mantém vírgula decimal)
    const raw = formatBR(value ?? 0);
    setDisplayValue(raw);
    // Seleciona todo o texto para o usuário poder sobrescrever direto
    setTimeout(() => e.target.select(), 0);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Durante a digitação, aceita livremente — parse só ocorre no blur
    setDisplayValue(e.target.value);
  };

  const handleBlur = () => {
    isFocused.current = false;

    const raw = displayValue.trim();

    if (!raw) {
      setDisplayValue(formatBR(0));
      onChangeValue(0);
      return;
    }

    // Parse: suporta formatos BR (1.250,50) e simples (950 ou 950.50 ou 950,50)
    let normalized = raw
      .replace(/[^\d,\.]/g, '') // remove tudo exceto dígitos, vírgula e ponto
      .trim();

    // Detecta formato BR: tem ponto como milhar e vírgula como decimal (ex: 1.250,50)
    if (/^\d{1,3}(\.\d{3})*,\d+$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    }
    // Tem apenas vírgula como decimal (ex: 950,50)
    else if (/^\d+,\d+$/.test(normalized)) {
      normalized = normalized.replace(',', '.');
    }
    // Tem apenas ponto como decimal (ex: 950.50) — mantém como está
    // Inteiro puro (ex: 950) — mantém como está

    const parsed = parseFloat(normalized);
    const finalValue = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;

    setDisplayValue(formatBR(finalValue));
    onChangeValue(finalValue);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      {...props}
    />
  );
}
