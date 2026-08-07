// Lógica específica da página "Árvore de Troca de Titularidade": estado
// da árvore de decomposição, filtros, cards, conectores e o passo a passo
// do tour guiado. Usa os utilitários genéricos de assets/js/utils.js e o
// motor de tour de assets/js/tour.js.

const API_URL = 'api/dados_arvore.php';
const DIMENSIONS = ['FATURA_FINAL','ORIGEM_TROCA','VERIFICACAO','GRUPO_TARIFARIO','SEGMENTO','CLASSE_CONSUMO','STATUS_COMERCIAL'];
// Rótulo amigável pro cabeçalho da coluna -- os dados continuam vindo do
// nome de campo real (chave de DIMENSIONS), só a exibição muda.
const DIMENSION_LABELS = {
  STATUS_COMERCIAL: 'STATUS PRÉ TT',
};
function labelDim(dim){
  return DIMENSION_LABELS[dim] || dim;
}
const MEASURES = [
  {key:'TOTAL_AB_CC_ANT',  label:'Débito',   color:'var(--m1)'},
  {key:'TOTAL_AB_PARCELAS',label:'Parcelas', color:'var(--m2)'},
  {key:'VALOR_CNR',        label:'CNR',      color:'var(--m3)'},
];

let FULL_DATA = [];
let DATA = [];
let path = [];
let empresaSelecionada = '__todas__';
let mesesDisponiveis = [];
let periodoDe = null;
let periodoAte = null;
let boardHasRendered = false;

async function carregarDados(forcarAtualizacao){
  const metaEl = document.getElementById('metaInfo');
  const btn = document.getElementById('btnReload');
  const board = document.getElementById('board');
  const isFirstLoad = !boardHasRendered;

  btn.classList.add('is-loading');
  btn.disabled = true;
  if (isFirstLoad){
    showLoadingOverlay();
  } else {
    board.classList.add('is-refreshing');
  }
  setStatus(forcarAtualizacao ? 'Consultando o Snowflake (pode levar alguns segundos)...' : 'Carregando dados (usa cache de até 1h, se disponível)...', 'loading');
  try{
    const url = forcarAtualizacao ? `${API_URL}?atualizar=1` : API_URL;
    const resp = await fetch(url, {cache:'no-store'});
    const json = await resp.json();
    if (!resp.ok || json.error){
      throw new Error(json.detalhe || json.error || ('HTTP ' + resp.status));
    }
    FULL_DATA = json.dados || [];
    metaEl.textContent = `${json.linhas} combinações · atualizado em ${json.geradoEm ? new Date(json.geradoEm).toLocaleString('pt-BR') : '--'}`;
    setStatus('', '');

    montarFiltroEmpresa();
    montarFiltroPeriodo();
    aplicarFiltros();
    path = [];
    render();
    boardHasRendered = true;
  } catch(err){
    setStatus('Erro ao carregar dados: ' + err.message, 'error');
    console.error(err);
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    board.classList.remove('is-refreshing');
    hideLoadingOverlay();
  }
}

function montarFiltroEmpresa(){
  const sel = document.getElementById('selEmpresa');
  const empresas = [...new Set(FULL_DATA.map(r => r.EMPRESA).filter(Boolean))].sort();
  const valorAtual = sel.value || '__todas__';
  sel.innerHTML = '<option value="__todas__">Todas</option>' +
    empresas.map(e => `<option value="${e}">${e}</option>`).join('');
  sel.value = empresas.includes(valorAtual) ? valorAtual : '__todas__';
  empresaSelecionada = sel.value;
}

// Popula os selects De/Até com os meses realmente presentes nos dados
// (MES_CONCLUSAO, truncado no SQL). Sem coluna de data disponível (ou sem
// nenhum valor não-nulo), os selects ficam desabilitados e o filtro vira
// um no-op -- a árvore continua mostrando tudo, como antes dessa feature.
function montarFiltroPeriodo(){
  mesesDisponiveis = [...new Set(FULL_DATA.map(r => r.MES_CONCLUSAO).filter(Boolean))].sort();
  const selDe = document.getElementById('selPeriodoDe');
  const selAte = document.getElementById('selPeriodoAte');

  if (!mesesDisponiveis.length){
    selDe.innerHTML = '<option value="">--</option>';
    selAte.innerHTML = '<option value="">--</option>';
    selDe.disabled = true;
    selAte.disabled = true;
    periodoDe = null;
    periodoAte = null;
    return;
  }

  selDe.disabled = false;
  selAte.disabled = false;
  const optsHtml = mesesDisponiveis.map(m => `<option value="${m}">${fmtMes(m)}</option>`).join('');
  selDe.innerHTML = optsHtml;
  selAte.innerHTML = optsHtml;

  periodoDe = mesesDisponiveis.includes(periodoDe) ? periodoDe : mesesDisponiveis[0];
  periodoAte = mesesDisponiveis.includes(periodoAte) ? periodoAte : mesesDisponiveis[mesesDisponiveis.length - 1];
  selDe.value = periodoDe;
  selAte.value = periodoAte;
}

// Registros sem MES_CONCLUSAO (troca ainda sem data de conclusão) só
// aparecem quando o período está no alcance total default -- assim que o
// usuário restringe o período, eles saem (não têm como saber se caem
// dentro do intervalo escolhido).
function aplicarFiltroPeriodo(rows){
  if (!mesesDisponiveis.length) return rows;
  const periodoTotal = periodoDe === mesesDisponiveis[0] && periodoAte === mesesDisponiveis[mesesDisponiveis.length - 1];
  return rows.filter(r => {
    if (!r.MES_CONCLUSAO) return periodoTotal;
    return r.MES_CONCLUSAO >= periodoDe && r.MES_CONCLUSAO <= periodoAte;
  });
}

function aplicarFiltros(){
  const porEmpresa = empresaSelecionada === '__todas__'
    ? FULL_DATA
    : FULL_DATA.filter(r => r.EMPRESA === empresaSelecionada);
  DATA = aplicarFiltroPeriodo(porEmpresa);
}

function filterByPath(data, path){
  return data.filter(row => path.every(p => p.values.includes(row[p.dim])));
}
function aggregate(rows){
  const out = {};
  MEASURES.forEach(m => out[m.key] = 0);
  rows.forEach(r => MEASURES.forEach(m => out[m.key] += (r[m.key] || 0)));
  return out;
}
function aggregateBy(rows, dim){
  const groups = {};
  rows.forEach(r => {
    const key = r[dim] ?? '(vazio)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.keys(groups).map(key => ({
    label: key, rows: groups[key], agg: aggregate(groups[key]),
  })).sort((a,b) => b.agg[MEASURES[0].key] - a.agg[MEASURES[0].key]);
}

// Reaplica a decomposição já aberta (path) em cima do DATA atual, em vez de
// recolher a árvore. Em cada nível, mantém os valores selecionados que
// ainda existirem no novo recorte (um nível pode ter mais de um valor
// selecionado via Ctrl+clique); se nenhum sobreviver (ex.: empresa sem
// nenhum daqueles valores), cai pro nó de maior valor daquele nível, igual
// ao preenchimento automático usado ao clicar num nó.
function reaplicarPathNoFiltro(){
  const novoPath = [];
  let subset = DATA;
  for (let level = 0; level < path.length; level++){
    if (!subset || subset.length === 0) break;
    const dim = DIMENSIONS[level];
    const nodesNivel = aggregateBy(subset, dim);
    if (!nodesNivel.length) break;
    const valoresAntigos = path[level].values;
    const sobreviventes = valoresAntigos.filter(v => nodesNivel.some(n => n.label === v));
    const valoresEscolhidos = sobreviventes.length ? sobreviventes : [nodesNivel[0].label]; // já vem ordenado desc
    novoPath.push({dim, values: valoresEscolhidos});
    subset = filterByPath(DATA, novoPath);
  }
  path = novoPath;
}

function metricRowRoot(measure, value, maxVal){
  const pct = maxVal > 0 ? Math.max(2, Math.min(100, (value / maxVal) * 100)) : 0;
  return `<div class="metric-row">
    <span class="dot" style="background:${measure.color}"></span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${measure.color}"></span></span>
    <span class="lblval"><span class="name">${measure.label}:</span>${fmtBRL(value)}</span>
  </div>`;
}
function metricRowNode(measure, value, maxVal){
  const pct = maxVal > 0 ? Math.max(2, Math.min(100, (value / maxVal) * 100)) : 0;
  return `<div class="metric-row">
    <div class="top-line">
      <span class="lblval"><span class="dot" style="background:${measure.color};display:inline-block;width:6px;height:6px;border-radius:1px;margin-right:4px;"></span><span class="name">${measure.label}:</span>${fmtBRL(value)}</span>
    </div>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${measure.color}"></span></span>
  </div>`;
}

// Card de comparação por empresa, logo abaixo do card raiz. Ao contrário
// do total geral (que sempre reflete todo o DATA filtrado), esse card
// segue o recorte atual da árvore -- filterByPath(DATA, path) já devolve
// o próprio DATA quando path está vazio, então funciona igual antes de
// qualquer nó ser selecionado.
function empresaCompareCardHtml(subsetAtual){
  const porEmpresa = aggregateBy(subsetAtual, 'EMPRESA');
  if (!porEmpresa.length){
    return `<div class="empresa-card">
      <div class="label">Comparativo por empresa</div>
      <div class="empty-hint">Nenhum dado para os filtros atuais.</div>
    </div>`;
  }
  const linhas = porEmpresa.map(item => `<tr>
    <td>${item.label}</td>
    ${MEASURES.map(m => `<td>${fmtCompacto(item.agg[m.key])}</td>`).join('')}
  </tr>`).join('');
  return `<div class="empresa-card">
    <div class="label">Comparativo por empresa</div>
    <table class="empresa-table">
      <thead><tr>
        <th>Empresa</th>
        ${MEASURES.map(m => `<th><span class="dot" style="background:${m.color}"></span>${m.label}</th>`).join('')}
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>`;
}

// Baixa a base atual (já com os filtros de Empresa/Período aplicados, mas
// sem restringir pela decomposição da árvore -- é a mesma base que
// alimenta a árvore inteira) em CSV, usando o helper genérico baixarCsv()
// de assets/js/utils.js.
function baixarCsvBase(){
  const colunas = ['EMPRESA', ...DIMENSIONS, 'MES_CONCLUSAO', ...MEASURES.map(m => m.key)];
  const agora = new Date();
  const pad = n => String(n).padStart(2, '0');
  const nomeArquivo = `arvore-troca-titularidade-${agora.getFullYear()}${pad(agora.getMonth()+1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}.csv`;
  baixarCsv(nomeArquivo, colunas, DATA);
}

function render(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  const totalGeral = aggregate(DATA);
  const subsetAtual = filterByPath(DATA, path);

  const rootCol = document.createElement('div');
  rootCol.className = 'root-col root-block';
  rootCol.innerHTML = `<div class="root-card" data-nodeid="root">
      <div class="label">Débito Associado</div>
      ${MEASURES.map(m => metricRowRoot(m, totalGeral[m.key], totalGeral[MEASURES[0].key])).join('')}
      <div class="root-note">Os valores de Parcelas e CNR já estão contidos no Débito acima — não devem ser somados a ele.</div>
    </div>
    ${empresaCompareCardHtml(subsetAtual)}
    <button class="download-btn" id="btnDownloadCsv" type="button">
      <svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10m0 0-3.5-3.5M10 13l3.5-3.5M4 15.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Baixar base (CSV)</span>
    </button>`;
  board.appendChild(rootCol);

  if (!DATA.length){
    const emptyCol = document.createElement('div');
    emptyCol.className = 'col';
    emptyCol.innerHTML = `<div class="empty-hint">Nenhum dado para os filtros atuais.</div>`;
    board.appendChild(emptyCol);
    drawConnectors([]);
    return;
  }

  let subset = DATA;
  let lastActiveIds = ['root'];
  const connectors = [];
  let travado = false;

  for (let level = 0; level < DIMENSIONS.length; level++){
    const dim = DIMENSIONS[level];

    // Mostra desde já a coluna de toda dimensão futura (travada, sem
    // opções calculadas ainda) pra o usuário ver de antemão qual é o
    // próximo passo da decomposição, mesmo antes de chegar nesse nível.
    if (travado || !subset || subset.length === 0){
      travado = true;
      const lockedCol = document.createElement('div');
      lockedCol.className = 'col col-locked';
      lockedCol.dataset.colIndex = level;
      lockedCol.innerHTML = `<div class="col-head col-head-locked"><span class="name">${labelDim(dim)}</span></div><div class="locked-hint">Selecione o nó anterior para ver as opções</div>`;
      board.appendChild(lockedCol);
      continue;
    }

    const nodes = aggregateBy(subset, dim);
    const maxVal = Math.max(...nodes.map(n => n.agg[MEASURES[0].key]), 1);

    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.colIndex = level;
    col.style.animationDelay = (level * 0.03) + 's';
    col.innerHTML = `<div class="col-head"><span class="name">${labelDim(dim)}</span><span class="count">${nodes.length}</span></div><div class="nodes"></div>`;
    const nodesWrap = col.querySelector('.nodes');

    const totalPaiObj = level === 0 ? totalGeral : aggregate(filterByPath(DATA, path.slice(0,level)));
    const activeIdsEsteNivel = [];

    nodes.forEach((node, idx) => {
      const nodeId = `c${level}_${idx}`;
      const isActive = !!(path[level] && path[level].values.includes(node.label));
      const totalPai = totalPaiObj[MEASURES[0].key];
      const pct = formatarPercentual(node.agg[MEASURES[0].key], totalPai);

      const el = document.createElement('div');
      el.className = 'node' + (isActive ? ' active' : '');
      el.dataset.nodeid = nodeId;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      el.setAttribute('aria-label', `${labelDim(dim)}: ${node.label}, ${pct} do total`);
      const pctDoMax = maxVal > 0 ? Math.max(2, Math.min(100, (node.agg[MEASURES[0].key] / maxVal) * 100)) : 0;
      el.innerHTML = `
        <div class="lbl"><span>${node.label}</span><span class="pct">${pct}</span></div>
        <div class="headline-bar"><div class="headline-fill" style="width:${pctDoMax}%"></div></div>
        ${MEASURES.map(m => metricRowNode(m, node.agg[m.key], maxVal)).join('')}
      `;
      // Ctrl/Cmd+clique acrescenta ou tira esse nó da seleção do nível em
      // vez de substituí-la -- assim dá pra decompor a soma de vários
      // valores do mesmo nível de uma vez (ex.: duas classes juntas).
      const selecionar = (comCtrl) => {
        const nivelAtual = path[level];
        const jaSelecionadoAqui = !!nivelAtual && nivelAtual.values.includes(node.label);
        const novosValues = (comCtrl && nivelAtual)
          ? (jaSelecionadoAqui ? nivelAtual.values.filter(v => v !== node.label) : [...nivelAtual.values, node.label])
          : [node.label];

        const tinhaNiveisMaisFundos = path.length > level + 1;
        const profundidadeAlvo = tinhaNiveisMaisFundos ? path.length : level + 1;

        path = path.slice(0, level);

        if (!novosValues.length){
          // desmarcou o último valor selecionado nesse nível -- fecha esse
          // nível e tudo que vinha depois, já que não sobra ramo nenhum
          // pra decompor mais fundo.
          render();
          scrollParaNovaColuna();
          return;
        }
        path.push({dim, values: novosValues});

        // Se já existia decomposição mais funda antes do clique, mantém a
        // mesma quantidade de colunas abertas, reajustando cada nível
        // seguinte para o maior valor dentro do novo recorte selecionado.
        let subsetAuto = filterByPath(DATA, path);
        for (let lv = level + 1; lv < profundidadeAlvo && lv < DIMENSIONS.length; lv++){
          if (!subsetAuto.length) break;
          const nodesAuto = aggregateBy(subsetAuto, DIMENSIONS[lv]);
          if (!nodesAuto.length) break;
          path.push({dim: DIMENSIONS[lv], values: [nodesAuto[0].label]}); // já vem ordenado desc
          subsetAuto = filterByPath(DATA, path);
        }

        render();
        scrollParaNovaColuna();
      };
      el.addEventListener('click', (e) => selecionar(e.ctrlKey || e.metaKey));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          selecionar(e.ctrlKey || e.metaKey);
        }
      });
      nodesWrap.appendChild(el);

      if (isActive){
        activeIdsEsteNivel.push(nodeId);
      }
    });

    if (activeIdsEsteNivel.length){
      lastActiveIds.forEach(fromId => {
        activeIdsEsteNivel.forEach(toId => connectors.push({fromId, toId}));
      });
      lastActiveIds = activeIdsEsteNivel;
    }

    board.appendChild(col);
    subset = path[level] ? filterByPath(DATA, path.slice(0, level+1)) : null;
  }

  drawConnectors(connectors);
}

function scrollParaNovaColuna(){
  requestAnimationFrame(() => {
    const cols = document.querySelectorAll('.col');
    const last = cols[cols.length - 1];
    if (last) last.scrollIntoView({behavior:'smooth', block:'center', inline:'end'});
  });
}

function drawConnectors(connectors){
  const svg = document.getElementById('svgConnectors');
  const stage = document.getElementById('stage');
  const stageRect = stage.getBoundingClientRect();
  svg.setAttribute('width', stage.scrollWidth);
  svg.setAttribute('height', stage.scrollHeight);
  svg.innerHTML = '';

  connectors.forEach((c) => {
    const fromEl = document.querySelector(`[data-nodeid="${c.fromId}"]`);
    const toEl = document.querySelector(`[data-nodeid="${c.toId}"]`);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Um pequeno respiro nas pontas: com as colunas mais compactas o
    // espaço entre elas ficou curto e a linha, saindo rente à borda dos
    // cards, parecia colada neles.
    const respiro = 3;
    const x1 = fromRect.right - stageRect.left + stage.scrollLeft + respiro;
    const y1 = fromRect.top + fromRect.height/2 - stageRect.top + stage.scrollTop;
    const x2 = toRect.left - stageRect.left + stage.scrollLeft - respiro;
    const y2 = toRect.top + toRect.height/2 - stageRect.top + stage.scrollTop;

    const midX = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    path.setAttribute('stroke', '#FF5A1F');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('opacity', '0.6');
    svg.appendChild(path);
  });
}

document.getElementById('btnReload').addEventListener('click', () => carregarDados(true));
document.getElementById('selEmpresa').addEventListener('change', (e) => {
  empresaSelecionada = e.target.value;
  aplicarFiltros();
  reaplicarPathNoFiltro();
  render();
});
document.getElementById('selPeriodoDe').addEventListener('change', (e) => {
  periodoDe = e.target.value;
  if (periodoDe > periodoAte){
    periodoAte = periodoDe;
    document.getElementById('selPeriodoAte').value = periodoAte;
  }
  aplicarFiltros();
  reaplicarPathNoFiltro();
  render();
});
document.getElementById('selPeriodoAte').addEventListener('change', (e) => {
  periodoAte = e.target.value;
  if (periodoAte < periodoDe){
    periodoDe = periodoAte;
    document.getElementById('selPeriodoDe').value = periodoDe;
  }
  aplicarFiltros();
  reaplicarPathNoFiltro();
  render();
});
window.addEventListener('resize', () => drawConnectors([]));
// Delegado no document porque o botão é recriado a cada render().
document.addEventListener('click', (e) => {
  if (e.target.closest('#btnDownloadCsv')) baixarCsvBase();
});

const TOUR_STEPS = [
  { selector: '.root-card', title: 'Total geral',
    text: 'Aqui fica o valor total do Débito Associado. Parcelas e CNR já estão contidos nele não devem ser somados ao total.' },
  { selector: '.empresa-card', title: 'Comparativo por empresa',
    text: 'Débito, Parcelas e CNR agrupados por empresa, pra comparar entre elas. Esse card acompanha a decomposição: conforme você seleciona nós na árvore, os valores aqui são recalculados pro recorte atual.' },
  { selector: '#btnDownloadCsv', title: 'Baixar a base em CSV',
    text: 'Baixa a base completa (já com os filtros de Empresa e Período aplicados, mas sem restringir pela árvore) em CSV, pronta pra abrir no Excel.' },
  { selector: '#selEmpresa', title: 'Filtrar por empresa',
    text: 'Escolha uma empresa aqui pra recalcular os valores só dela. Se você já tiver decomposto a árvore, ela continua aberta só os números mudam.' },
  { selector: '#selPeriodoDe', title: 'Filtrar por período',
    text: 'Escolha o mês inicial e final aqui pra ver só as trocas concluídas nesse intervalo. Sem alterar, a árvore mostra todos os meses disponíveis.' },
  { selector: '.legend', title: 'O que cada cor significa',
    text: 'Laranja é o Débito Associado (a métrica principal da árvore), azul é Parcelas e dourado é CNR. As mesmas cores aparecem nas barrinhas de cada nó.' },
  { selector: '.col[data-col-index="0"] .node:first-child', title: 'Clique pra decompor',
    text: 'Cada card é um valor dessa dimensão. Clique nele pra abrir a próxima coluna e ver como esse valor se decompõe. Segurando Ctrl (ou Cmd no Mac) e clicando em outro card do mesmo nível, você decompõe a soma dos dois juntos.' },
  { selector: '.col[data-col-index="0"] .node:first-child .pct', title: 'Percentual do total',
    text: 'Mostra quanto aquele nó representa do total do nível anterior não do total geral da árvore.' },
  { selector: '.col.col-locked', title: 'Próximos passos, à vista',
    text: 'As colunas mais à direita já mostram o nome da próxima dimensão, mesmo antes de você chegar nelas. Elas liberam os valores assim que você seleciona o nó anterior.' },
  { selector: '#btnReload', title: 'Atualizar dados',
    text: 'Os dados ficam em cache por até 1 hora. Se precisar do valor mais recente na hora, clique aqui pra forçar uma nova consulta ao Snowflake.' },
  { selector: '#stage', title: 'Mais colunas pra ver',
    text: 'A árvore tem 7 níveis de decomposição. Arraste pros lados ou use a barra de rolagem embaixo pra ver as colunas que não cabem na tela.' },
];

const tour = criarTourGuiado(TOUR_STEPS);
document.getElementById('btnGuia').addEventListener('click', () => {
  // O tour começa sempre com a árvore fechada, pra garantir que os alvos
  // de cada passo (nó, coluna travada etc.) existam.
  path = [];
  render();
  tour.iniciar();
});

// Carga normal: o backend decide sozinho se o cache (válido por até 1h)
// já basta ou se precisa consultar o Snowflake de novo. O botão
// "Recarregar dados" é quem força uma consulta nova a qualquer momento.
carregarDados(false);
