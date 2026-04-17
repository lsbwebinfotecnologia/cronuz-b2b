const subtotal = NaN;
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
try {
  console.log(fmt.format(subtotal));
} catch(e) { console.error(e.message) }
