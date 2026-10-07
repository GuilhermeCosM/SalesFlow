function friendlyReason(reason) {
  const value = String(reason || '').toLowerCase();
  if (value.includes('coluna obrigatória ausente')) return 'Falta uma coluna obrigatória. Confira se a planilha tem data, vendedor, produto, quantidade e valor unitário.';
  if (value.includes('não foi possível ler')) return 'Não foi possível abrir a planilha. Confira se o arquivo está íntegro e se está no formato Excel ou CSV.';
  if (value.includes('vendedor vazio')) return 'Informe o nome do vendedor.';
  if (value.includes('produto vazio')) return 'Informe o nome do produto.';
  if (value.includes('quantidade precisa ser um número inteiro')) return 'A quantidade deve ser um número inteiro, como 1 ou 2.';
  if (value.includes('quantidade deve ser maior que zero')) return 'A quantidade precisa ser maior que zero.';
  if (value.includes('valor unitário não pode ser negativo')) return 'O valor unitário não pode ser negativo.';
  if (value.includes('datetime') || value.includes('date') || value.includes('data-invalida')) return 'Confira a data. Use um formato reconhecido, como 12/10/2026.';
  return 'Revise os dados desta venda e confira se todos os campos estão preenchidos corretamente.';
}

function renderFriendlyError(error) {
  const data = error.raw_data || {};
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
  const fields = [
    { key: 'data', label: 'Data da venda', type: 'date', aliases: ['data', 'date', 'data venda', 'data da venda'] },
    { key: 'vendedor', label: 'Vendedor', type: 'text', aliases: ['vendedor', 'seller', 'representante'] },
    { key: 'produto', label: 'Produto', type: 'text', aliases: ['produto', 'product', 'item'] },
    { key: 'quantidade', label: 'Quantidade', type: 'number', aliases: ['quantidade', 'quantity', 'qtd'] },
    { key: 'valor_unitario', label: 'Valor unitário (R$)', type: 'text', aliases: ['valor unitario', 'preco unitario', 'valor', 'unit price', 'price'] },
  ];
  const inputFor = field => {
    const header = Object.keys(data).find(key => field.aliases.includes(normalize(key)));
    let value = header ? data[header] : '';
    if (field.key === 'data' && value) {
      const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
      value = match ? match[1] : '';
    }
    if (field.key === 'valor_unitario' && value !== '' && value != null) {
      let normalized = String(value).trim().replace(/R\$|\s/g, '');
      if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
      } else if (normalized.includes(',')) normalized = normalized.replace(',', '.');
      const amount = Number(normalized);
      if (Number.isFinite(amount)) value = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const numeric = field.key === 'quantidade' ? ' min="1" step="1" inputmode="numeric"' : field.key === 'valor_unitario' ? ' inputmode="decimal" autocomplete="off"' : '';
    return `<label class="correction-field"><span>${field.label}</span><input data-field="${field.key}" type="${field.type}" value="${escapeHtml(value == null ? '' : value)}"${numeric} required></label>`;
  };
  const location = Number(error.row_number) > 0 ? `Linha ${error.row_number}` : 'Arquivo';
  const form = Number(error.row_number) > 0 ? `<div class="correction-fields" data-correction-row="${error.row_number}">${fields.map(inputFor).join('')}</div>` : '<p class="file-correction-note">Este arquivo tem um problema nos cabeçalhos ou no formato. Confira a estrutura e importe-o novamente.</p>';
  return `<article class="error-item"><div class="error-item-head"><span class="error-line">${location}</span><span class="error-reason">${friendlyReason(error.reason)}</span></div>${form}</article>`;
}
