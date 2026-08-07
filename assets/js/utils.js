// Utilitários genéricos compartilhados por qualquer página do projeto:
// formatadores, indicador de status/loading, export CSV e o efeito de
// sombra no header ao rolar a página. Nada aqui deve depender de um
// dataset específico -- isso fica no JS da própria página.

function fmtBRL(v){ return "R$ " + (v||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }

// Versão compacta (249,9K / 1,2M) pra caber em colunas estreitas de
// tabela, tipo comparativos por categoria.
function fmtCompacto(v){
  const n = v || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toLocaleString('pt-BR', {maximumFractionDigits:1}) + 'M';
  if (abs >= 1e3) return (n / 1e3).toLocaleString('pt-BR', {maximumFractionDigits:1}) + 'K';
  return n.toLocaleString('pt-BR', {maximumFractionDigits:0});
}

// Percentual de uma parte em relação a um total. Com apenas 1 casa
// decimal, um valor pequeno mas real (ex.: 0,03%) e outro bem perto de
// 100% arredondavam pra "0.0%" e "100.0%" respectivamente, dando a
// impressão de que um deles não tinha valor nenhum. Usa mais casas quando
// o valor é pequeno e evita cravar 0%/100% quando não é exatamente isso.
function formatarPercentual(valor, total){
  if (!(total > 0) || !(valor > 0)) return '0%';
  const bruto = (valor / total) * 100;
  if (bruto < 0.1) return '<0.1%';
  if (bruto > 99.9 && bruto < 100) return '>99.9%';
  const casas = bruto < 1 ? 2 : 1;
  return bruto.toFixed(casas) + '%';
}

const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function fmtMes(aaaaMm){
  const [ano, mes] = aaaaMm.split('-');
  return `${NOMES_MESES[parseInt(mes, 10) - 1]}/${ano}`;
}

function setStatus(msg, kind){
  const statusEl = document.getElementById('status');
  statusEl.className = kind || '';
  statusEl.innerHTML = '';
  if (kind === 'loading'){
    const spin = document.createElement('span');
    spin.className = 'spin';
    statusEl.appendChild(spin);
  }
  const text = document.createElement('span');
  text.textContent = msg;
  statusEl.appendChild(text);

  const loadingSub = document.getElementById('loadingSub');
  if (loadingSub) loadingSub.textContent = msg;
}

function showLoadingOverlay(){
  document.getElementById('loadingOverlay').classList.add('is-active');
}
function hideLoadingOverlay(){
  document.getElementById('loadingOverlay').classList.remove('is-active');
}

// Export CSV genérico: recebe as colunas (nomes de campo) e as linhas
// (array de objetos) e monta o arquivo -- a página decide o quê exportar
// e como nomear o arquivo. Ponto e vírgula como separador e vírgula
// decimal porque é o que o Excel em pt-BR espera; BOM UTF-8 na frente pra
// acentuação não vir corrompida ao abrir.
function celulaCsv(v){
  if (v == null) return '';
  if (typeof v === 'number'){
    return v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  const s = String(v);
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function gerarCsv(colunas, linhas){
  const BOM = '﻿';
  const linhasCsv = linhas.map(linha => colunas.map(c => celulaCsv(linha[c])).join(';'));
  return BOM + [colunas.join(';'), ...linhasCsv].join('\r\n');
}

function baixarCsv(nomeArquivo, colunas, linhas){
  if (!linhas.length) return;
  const csv = gerarCsv(colunas, linhas);
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Sombra no header ao rolar a página -- convenção do header compartilhado
// (assets/css/base.css), então já ativa sozinho pra qualquer página que
// tenha um elemento #siteHeader.
const siteHeader = document.getElementById('siteHeader');
if (siteHeader){
  document.addEventListener('scroll', () => {
    siteHeader.classList.toggle('is-scrolled', window.scrollY > 4);
  }, {passive:true});
}
