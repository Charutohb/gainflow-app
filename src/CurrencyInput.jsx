import React from 'react';

/**
 * Um componente de input que formata valores como moeda brasileira (BRL).
 * @param {object} props
 * @param {number} props.value - O valor numérico (ex: 1234.56)
 * @param {function} props.onChange - Função chamada com o novo valor numérico
 */
export const CurrencyInput = ({ value = 0, onChange, ...props }) => {
  
  const handleChange = (e) => {
    // Pega o valor do input e remove todos os caracteres que não são dígitos
    const rawValue = e.target.value.replace(/\D/g, '');
    // Converte a string de dígitos para um número (representando centavos)
    const numericValue = Number(rawValue);
    // Passa o valor em reais (dividido por 100) para a função onChange do componente pai
    onChange(numericValue / 100);
  };

  // Formata o valor numérico para uma string de moeda (ex: "R$ 1.234,56")
  const formatValue = (number) => {
    if (isNaN(number) || number === null) {
      number = 0;
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(number);
  };

  return (
    <input
      {...props}
      type="text" // Usamos tipo "text" para permitir a exibição da máscara
      value={formatValue(value)}
      onChange={handleChange}
    />
  );
};
