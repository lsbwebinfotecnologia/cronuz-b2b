'use client';

import React, { useState, useEffect, ChangeEvent } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
}

export function CurrencyInput({
  value,
  onChangeValue,
  prefixStr = '',
  suffixStr = '',
  maxDecimals = 2,
  className,
  ...props
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // Sincroniza o valor externo com o valor do display
  useEffect(() => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'number') {
        const formatted = new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: maxDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value);
        setDisplayValue(`${prefixStr}${formatted}${suffixStr}`);
      }
    } else {
      setDisplayValue('');
    }
  }, [value, prefixStr, suffixStr, maxDecimals]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value;
    
    // Remove tudo que não for número (incluindo vírgula e ponto)
    rawValue = rawValue.replace(/\D/g, '');
    
    // Se o usuário apagar tudo, retorna 0 (ou vazio se preferir)
    if (rawValue === '') {
      onChangeValue(0);
      setDisplayValue('');
      return;
    }

    // Como é campo formatado sempre, se for 2 decimais divide por 100
    // "100" vira 1,00
    // "1090" vira 10,90
    const divisor = Math.pow(10, maxDecimals);
    const numValue = Number(rawValue) / divisor;
    
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: maxDecimals,
      maximumFractionDigits: maxDecimals,
    }).format(numValue);
    
    setDisplayValue(`${prefixStr}${formatted}${suffixStr}`);
    onChangeValue(numValue);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      className={className}
      {...props}
    />
  );
}
