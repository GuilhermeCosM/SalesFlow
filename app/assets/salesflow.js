const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const number = value => new Intl.NumberFormat('pt-BR').format(value || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let summaryData = null;
let runsData = [];
let chartRange = 7;
let lastAutomationEvent = null;
try { lastAutomationEvent = localStorage.getItem('salesflow-last-auto-event'); } catch { /* storage may be disabled */ }

function showView(name, updateUrl = true) {
  document.querySelectorAll('.screen').forEach(view => view.classList.toggle('active', view.dataset.screen === name));
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === name;
    link.classList.toggle('active', active);
    if (active && link.closest('.nav')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (updateUrl) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderTable(headers, rows, emptyTitle, emptyDescription) {
  if (!rows.length) return `<div class="history-empty"><span class="history-empty-icon" aria-hidden="true">↗</span><h3>${emptyTitle}</h3><p>${emptyDescription}</p><a class="button button-soft" href="#import" data-view="import">Importar vendas</a></div>`;
  return `<table class="table"><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderSellerTable(sellers) {
  const max = Math.max(...sellers.map(item => item.revenue), 0);
  const rows = sellers.map((item, index) => `<tr><td><span class="rank-number">${index + 1}</span>${escapeHtml(item.seller)}</td><td>${number(item.sales)}</td><td><div class="table-meter"><span class="table-meter-track"><i class="table-meter-fill" style="width:${max ? Math.max(4, item.revenue / max * 100) : 0}%"></i></span><span class="table-meter-value">${money(item.revenue)}</span></div></td></tr>`);
  document.querySelector('#sellerTable').innerHTML = renderTable(['Vendedor', 'Vendas', 'Faturamento'], rows, 'Sem vendas por enquanto', 'Assim que uma planilha válida for importada, o desempenho dos vendedores aparecerá aqui.');
}

function renderProductTable(products) {
  const max = Math.max(...products.map(item => item.units), 0);
  const rows = products.map((item, index) => `<tr><td><span class="rank-number">${index + 1}</span>${escapeHtml(item.product)}</td><td><div class="table-meter"><span class="table-meter-track"><i class="table-meter-fill" style="width:${max ? Math.max(4, item.units / max * 100) : 0}%"></i></span><span class="table-meter-value">${number(item.units)}</span></div></td><td>${money(item.revenue)}</td></tr>`);
  document.querySelector('#productTable').innerHTML = renderTable(['Produto', 'Unidades', 'Faturamento'], rows, 'Nenhum produto no relatório', 'Os produtos serão classificados assim que as vendas forem importadas.');
}

function dayLabel(dateString, includeYear = false) {
  return new Intl.DateTimeFormat('pt-BR', includeYear ? { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' } : { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${dateString}T00:00:00Z`)).replace('.', '');
}

function renderTrend(data) {
  const chart = document.querySelector('#salesChart');
  const trend = data?.trend || [];
  const latest = data?.latest_sale_date;
  if (!latest || !trend.length) {
    chart.innerHTML = '<div class="chart-empty"><div><strong>Nenhum histórico para mostrar ainda.</strong><br>Importe uma planilha de vendas para ver a evolução do faturamento.</div></div>';
    document.querySelector('#trendCurrent').textContent = money(0);
    document.querySelector('#trendChange').textContent = 'Aguardando dados';
    document.querySelector('#trendChange').className = 'trend-change neutral';
    document.querySelector('#trendCaption').textContent = 'O gráfico será preenchido automaticamente após a primeira importação.';
    return;
  }
  const map = new Map(trend.map(point => [point.date, point.revenue]));
  const latestDate = new Date(`${latest}T00:00:00Z`);
  const currentDays = [], previousDays = [];
  for (let offset = chartRange - 1; offset >= 0; offset--) {
    const day = new Date(latestDate);
    day.setUTCDate(day.getUTCDate() - offset);
    const date = day.toISOString().slice(0, 10);
    currentDays.push({ date, value: map.get(date) || 0 });
  }
  for (let offset = chartRange * 2 - 1; offset >= chartRange; offset--) {
    const day = new Date(latestDate);
    day.setUTCDate(day.getUTCDate() - offset);
    const date = day.toISOString().slice(0, 10);
    previousDays.push({ date, value: map.get(date) || 0 });
  }
  const currentTotal = currentDays.reduce((total, point) => total + point.value, 0);
  const previousTotal = previousDays.reduce((total, point) => total + point.value, 0);
  const maxValue = Math.max(...currentDays.map(point => point.value), ...previousDays.map(point => point.value), 1);
  const width = 760, height = 250, left = 52, right = 16, top = 16, bottom = 31;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = index => left + (currentDays.length === 1 ? plotWidth / 2 : index * plotWidth / (currentDays.length - 1));
  const y = value => top + plotHeight - value / maxValue * plotHeight;
  const coords = points => points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const currentPath = coords(currentDays), previousPath = coords(previousDays);
  const areaPath = `${currentPath} L${x(currentDays.length - 1).toFixed(1)},${(top + plotHeight).toFixed(1)} L${left},${(top + plotHeight).toFixed(1)} Z`;
  const ticks = [0, .25, .5, .75, 1].map(ratio => {
    const value = maxValue * ratio, yy = top + plotHeight - plotHeight * ratio;
    return `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}" stroke="#e8edf3"/><text class="chart-label" x="${left - 8}" y="${yy + 4}" text-anchor="end" fill="#8290a1" font-size="10">${value >= 1000 ? `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : Math.round(value)}</text>`;
  }).join('');
  const labelEvery = chartRange <= 7 ? 1 : Math.ceil(chartRange / 7);
  const labels = currentDays.map((point, index) => index % labelEvery === 0 || index === currentDays.length - 1 ? `<text class="chart-label" x="${x(index)}" y="${height - 8}" text-anchor="middle" fill="#8290a1" font-size="10">${dayLabel(point.date)}</text>` : '').join('');
  const currentPoints = currentDays.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3.5" fill="#326ced"><title>${dayLabel(point.date, true)}: ${money(point.value)}</title></circle>`).join('');
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de faturamento comparando o período atual e anterior"><defs><linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#326ced" stop-opacity=".2"/><stop offset="1" stop-color="#326ced" stop-opacity="0"/></linearGradient></defs>${ticks}<path class="chart-area" d="${areaPath}" fill="url(#salesArea)"/><path class="chart-line-previous" d="${previousPath}" fill="none" stroke="#a9b6c7" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round"/><path class="chart-line-current" d="${currentPath}" fill="none" stroke="#326ced" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${currentPoints}${labels}</svg>`;
  document.querySelector('#trendCurrent').textContent = money(currentTotal);
  const change = document.querySelector('#trendChange'), caption = document.querySelector('#trendCaption');
  if (!previousTotal) {
    change.textContent = currentTotal ? 'Novo período' : 'Sem movimento';
    change.className = 'trend-change neutral';
    caption.textContent = currentTotal ? `Sem vendas no período anterior para comparar. Comparação com os ${chartRange} dias anteriores.` : `Sem faturamento nos últimos ${chartRange} dias.`;
  } else {
    const percent = (currentTotal - previousTotal) / previousTotal * 100;
    change.textContent = `${percent >= 0 ? '↑' : '↓'} ${Math.abs(percent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    change.className = `trend-change ${percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral'}`;
    caption.textContent = `${money(currentTotal)} agora · ${money(previousTotal)} nos ${chartRange} dias anteriores.`;
  }
}

function renderRuns() {
  const search = (document.querySelector('#runSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const filter = document.querySelector('#runFilter')?.value || 'all';
  const filtered = runsData.filter(run => (filter === 'all' || run.status === filter) && run.source.toLocaleLowerCase('pt-BR').includes(search));
  const target = document.querySelector('#runs');
  if (!filtered.length) {
    const hasRuns = runsData.length > 0;
    target.innerHTML = `<div class="history-empty"><span class="history-empty-icon" aria-hidden="true">${hasRuns ? '⌕' : '↗'}</span><h3>${hasRuns ? 'Nenhuma execução encontrada' : 'Seu histórico começa aqui'}</h3><p>${hasRuns ? 'Tente outro nome de arquivo ou altere o filtro de status.' : 'Quando você importar uma planilha, cada processamento aparecerá nesta lista.'}</p>${hasRuns ? '' : '<a class="button button-primary" href="#import" data-view="import">Importar primeira planilha</a>'}</div>`;
    return;
  }
  target.innerHTML = filtered.map(run => {
    const status = run.status === 'success' ? ['success', 'Concluído'] : run.status === 'warning' ? ['warning', 'Precisa de atenção'] : ['error', 'Falha'];
    const chips = `<span class="count-chip ok">${number(run.accepted_rows)} válidas</span>${run.rejected_rows ? `<span class="count-chip warn">${number(run.rejected_rows)} para revisar</span>` : ''}${run.duplicate_rows ? `<span class="count-chip">${number(run.duplicate_rows)} duplicadas</span>` : ''}`;
    const canCorrect = run.errors?.length && run.errors.every(error => Number(error.row_number) > 0);
    const errorContent = run.errors?.length ? `<details class="run-errors"><summary>Revisar ${number(run.errors.length)} linha(s) rejeitada(s)</summary><p class="correction-help">Revise os campos desta linha. Você pode completar os dados que faltam ou corrigir valores inválidos.</p><div class="error-list">${run.errors.map(renderFriendlyError).join('')}</div>${run.duplicate_rows ? `<p class="duplicates-note">${number(run.duplicate_rows)} linha(s) repetidas foram ignoradas e não precisam ser corrigidas.</p>` : ''}${canCorrect ? `<div class="correction-actions"><button class="button button-primary" type="button" onclick="exportCorrectedRun(${run.id})">Baixar planilha corrigida</button></div>` : ''}</details>` : '';
    const dashboardButton = `<div class="run-export-actions"><button class="button button-primary" type="button" onclick="exportRunPowerBI(${run.id})">Baixar projeto Power BI (.zip)</button></div>`;
    return `<article class="history-row" data-run-id="${run.id}" data-rejected-rows="${Number(run.rejected_rows) || 0}"><span class="run-time">${new Date(run.created_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</span><span class="run-source">${escapeHtml(run.source)}</span><span class="run-status ${status[0]}">${status[1]}</span><span class="run-count">${chips}</span>${errorContent}${dashboardButton}</article>`;
  }).join('');
}

function correctionPayload(runId) {
  const runElement = document.querySelector(`[data-run-id="${runId}"]`);
  const rows = [...(runElement?.querySelectorAll('[data-correction-row]') || [])];
  return rows.map(row => ({
    row_number: Number(row.dataset.correctionRow),
    ...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()])),
  }));
}

function showExportFeedback(message, error = false) {
  const box = document.querySelector('#exportFeedback');
  box.textContent = message;
  box.className = `export-feedback${error ? ' error' : ''}`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function downloadRunFile(runId, kind) {
  const powerbi = kind === 'powerbi';
  const enteredCorrections = correctionPayload(runId);
  const runElement = document.querySelector(`[data-run-id="${runId}"]`);
  const rejectedRows = Number(runElement?.dataset.rejectedRows || 0);
  const correctionRows = [...(runElement?.querySelectorAll('[data-correction-row]') || [])];
  document.querySelectorAll('[data-field].correction-invalid').forEach(input => input.classList.remove('correction-invalid'));
  if (rejectedRows > 0 && correctionRows.length !== rejectedRows) {
    showExportFeedback('Esta planilha tem erros de estrutura ou linhas que não podem ser corrigidas aqui. Corrija a origem e importe novamente antes de exportar.', true);
    return;
  }
  const missingInputs = correctionRows.flatMap(row => [...row.querySelectorAll('[data-field]')]
    .filter(input => !input.value.trim() || !validCorrectionField(input)));
  if (missingInputs.length) {
    missingInputs.forEach(input => input.classList.add('correction-invalid'));
    const first = missingInputs[0];
    showExportFeedback(`Corrija todos os campos pendentes antes de exportar. Confira “${first.closest('.correction-field')?.querySelector('span')?.textContent || 'campo obrigatório'}” da linha ${first.closest('[data-correction-row]')?.dataset.correctionRow}.`, true);
    first.focus({ preventScroll: true });
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const corrections = enteredCorrections;
  try {
    const endpoint = powerbi ? 'powerbi-export' : 'corrected-export';
    const response = await fetch(`/api/runs/${runId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corrections }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const message = typeof detail.detail === 'string' ? detail.detail : 'Confira os campos destacados e tente novamente.';
      showExportFeedback(message, true);
      return;
    }
    const blob = await response.blob();
    const filename = powerbi ? `SalesFlow_Vendas_${runId}.zip` : `vendas_corrigidas_${runId}.xlsx`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (powerbi) {
      const omittedRows = Number(response.headers.get('X-Omitted-Rows')) || 0;
      const omitted = omittedRows ? ` ${number(omittedRows)} linha(s) rejeitada(s) sem correção ficaram de fora.` : '';
      showExportFeedback(`Download do projeto PBIP iniciado. Extraia o ZIP e abra SalesFlow_Vendas.pbip no Power BI Desktop.${omitted}`);
    } else {
      showExportFeedback('Planilha corrigida exportada. Reimporte-a para incluir as linhas corrigidas nos relatórios.');
    }
  } catch {
    showExportFeedback('Não foi possível exportar agora. Verifique se o SalesFlow ainda está conectado e tente novamente.', true);
  }
}

function exportCorrectedRun(runId) { return downloadRunFile(runId, 'corrected'); }
function exportRunPowerBI(runId) { return downloadRunFile(runId, 'powerbi'); }

function validCorrectionField(input) {
  if (input.dataset.field === 'valor_unitario') {
    let value = input.value.trim().replace(/R\$|\s/g, '');
    if (value.includes(',') && value.includes('.')) {
      value = value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
    } else if (value.includes(',')) value = value.replace(',', '.');
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0;
  }
  return input.checkValidity();
}

function renderSummary(data) {
  summaryData = data;
  document.querySelector('#revenue').textContent = money(data.revenue);
  document.querySelector('#sales').textContent = number(data.sale_count);
  document.querySelector('#units').textContent = number(data.units_sold);
  document.querySelector('#average').textContent = money(data.average_sale);
  renderSellerTable(data.by_seller);
  renderProductTable(data.top_products);
  renderTrend(data);
}

async function refresh() {
  const [summaryResponse, runsResponse] = await Promise.all([fetch('/api/reports/summary'), fetch('/api/runs')]);
  if (!summaryResponse.ok || !runsResponse.ok) throw new Error('Não foi possível carregar os dados. Atualize a página para tentar novamente.');
  renderSummary(await summaryResponse.json());
  runsData = await runsResponse.json();
  renderRuns();
}

function showAutomationNotice(eventData) {
  const notice = document.querySelector('#automationNotice');
  const warning = Boolean(eventData.rejected_rows || eventData.duplicate_rows || eventData.has_errors);
  const files = eventData.files || [];
  const fileSummary = files.length === 1 ? files[0] : `${files[0]} e mais ${files.length - 1} arquivo(s)`;
  notice.className = `automation-notice${warning ? ' warning' : ''}`;
  notice.innerHTML = `<span class="automation-notice-icon" aria-hidden="true">${warning ? '!' : '✓'}</span><span><strong>${warning ? 'Arquivo processado com avisos' : 'Novo arquivo processado automaticamente'}</strong><small>${escapeHtml(fileSummary)} · ${number(eventData.accepted_rows)} vendas adicionadas${eventData.rejected_rows ? ` · ${number(eventData.rejected_rows)} para revisar` : ''}${eventData.duplicate_rows ? ` · ${number(eventData.duplicate_rows)} duplicadas ignoradas` : ''}</small></span><a href="#runs" data-view="runs">Ver resultado</a><button type="button" aria-label="Fechar aviso">×</button>`;
  notice.hidden = false;
  notice.querySelector('button').addEventListener('click', () => { notice.hidden = true; });
}

async function checkAutomationStatus() {
  try {
    const response = await fetch('/api/automation/status');
    if (!response.ok) return;
    const status = await response.json();
    const label = document.querySelector('#automationStatusText');
    if (label) label.textContent = !status.enabled ? 'MONITORAMENTO PAUSADO' : status.last_error ? 'MONITORAMENTO COM ALERTA' : 'MONITORANDO PASTA';
    const eventData = status.last_event;
    if (eventData?.id && eventData.id !== lastAutomationEvent) {
      lastAutomationEvent = eventData.id;
      try { localStorage.setItem('salesflow-last-auto-event', lastAutomationEvent); } catch { /* storage may be disabled */ }
      showAutomationNotice(eventData);
      await refresh();
    }
  } catch { /* the dashboard remains usable if the status check is temporarily unavailable */ }
}

function setImportStep(active, complete = false) {
  document.querySelectorAll('[data-import-step]').forEach(item => {
    const step = Number(item.dataset.importStep);
    item.classList.toggle('active', step === active && !complete);
    item.classList.toggle('done', step < active || (complete && step === active));
  });
}

function showToast(text, warning = false) {
  const message = document.querySelector('#message');
  message.innerHTML = `<div class="toast${warning ? ' warning' : ''}">${escapeHtml(text)}</div>`;
}

function showImportResult(title, description, warning, runLink = true) {
  const result = document.querySelector('#importResult');
  result.className = `import-result visible${warning ? ' warning' : ''}`;
  result.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>${runLink ? '<a href="#runs" data-view="runs">Ver execuções →</a>' : ''}`;
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB` : `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function updateFilePreview() {
  const input = document.querySelector('#file'), preview = document.querySelector('#filePreview');
  const file = input.files[0];
  if (!file) {
    preview.hidden = true;
    setImportStep(1);
    return;
  }
  preview.hidden = false;
  preview.querySelector('strong').textContent = file.name;
  preview.querySelector('span').textContent = formatSize(file.size);
  document.querySelector('#importResult').className = 'import-result';
  setImportStep(1, true);
}

async function uploadFile() {
  const input = document.querySelector('#file'), file = input.files[0], button = document.querySelector('#uploadButton');
  if (!file) {
    showToast('Escolha uma planilha para começar.', true);
    input.focus();
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast('Este arquivo ultrapassa o limite de 25 MB.', true);
    return;
  }
  setImportStep(2);
  document.body.classList.add('loading');
  button.disabled = true;
  button.textContent = 'Processando…';
  showToast('Estamos validando os dados e preparando seu relatório.');
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch('/api/process/upload', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Não foi possível processar o arquivo.');
    setImportStep(3, true);
    const warning = Boolean(data.rejected_rows || data.duplicate_rows);
    const description = `${number(data.accepted_rows)} vendas adicionadas · ${number(data.rejected_rows)} para revisar · ${number(data.duplicate_rows)} duplicadas ignoradas.`;
    showImportResult(warning ? 'Importação concluída com alguns avisos' : 'Tudo certo! Sua planilha foi processada.', description, warning);
    document.querySelector('#message').innerHTML = '';
    await refresh();
  } catch (error) {
    setImportStep(1, true);
    showToast(error.message, true);
  } finally {
    document.body.classList.remove('loading');
    button.disabled = false;
    button.textContent = 'Enviar e processar';
  }
}

async function processInbox() {
  const button = document.querySelector('.folder-zone button');
  button.disabled = true;
  button.textContent = 'Processando…';
  document.body.classList.add('loading');
  try {
    const response = await fetch('/api/process/inbox', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Não foi possível processar a pasta.');
    const accepted = data.runs.reduce((sum, run) => sum + (run.accepted_rows || 0), 0);
    const rejected = data.runs.reduce((sum, run) => sum + (run.rejected_rows || 0), 0);
    const duplicates = data.runs.reduce((sum, run) => sum + (run.duplicate_rows || 0), 0);
    showImportResult(data.files_found ? `${number(data.files_found)} arquivo(s) processado(s)` : 'A pasta está vazia', data.files_found ? `${number(accepted)} vendas adicionadas · ${number(rejected)} para revisar · ${number(duplicates)} duplicadas ignoradas.` : 'Adicione arquivos Excel ou CSV à pasta data/inbox para processar em lote.', Boolean(rejected || duplicates), Boolean(data.files_found));
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    document.body.classList.remove('loading');
    button.disabled = false;
    button.textContent = 'Processar pasta';
  }
}

function setTheme(theme, save = true) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const button = document.querySelector('#themeToggle');
  button.setAttribute('aria-pressed', String(dark));
  button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
  button.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
  if (save) {
    try { localStorage.setItem('salesflow-theme', theme); } catch { /* local storage may be disabled */ }
  }
}

const aliases = { overview: 'overview', top: 'overview', import: 'import', importar: 'import', resumo: 'overview', reports: 'reports', relatorios: 'reports', runs: 'runs', historico: 'runs' };
const initialView = location.hash.slice(1);
showView(aliases[initialView] || 'overview', false);
document.addEventListener('click', event => {
  const link = event.target.closest('[data-view]');
  if (!link) return;
  event.preventDefault();
  showView(link.dataset.view);
});
document.addEventListener('input', event => {
  if (event.target.matches('[data-field]')) event.target.classList.remove('correction-invalid');
});
document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
  chartRange = Number(button.dataset.range);
  document.querySelectorAll('[data-range]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  if (summaryData) renderTrend(summaryData);
}));
document.querySelector('#file').addEventListener('change', updateFilePreview);
document.querySelector('#runSearch').addEventListener('input', renderRuns);
document.querySelector('#runFilter').addEventListener('change', renderRuns);
document.querySelector('#themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', false);
refresh().catch(error => showToast(error.message, true));
checkAutomationStatus();
window.setInterval(checkAutomationStatus, 5000);
