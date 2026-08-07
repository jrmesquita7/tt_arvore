// Motor genérico do tour guiado com spotlight. Cada passo aponta um
// seletor CSS; o elemento real de trás continua no lugar (sem mexer em
// z-index dele) e um elemento fixo por cima escurece a tela inteira com
// box-shadow gigante, deixando um "buraco" transparente exatamente no
// retângulo do alvo.
//
// Não sabe nada sobre o dataset/estado da página -- só steps (array de
// {selector, title, text}) e os ids fixos do markup do tour (definidos em
// assets/css/base.css + o HTML de #tourShield/#tourSpotlight/#tourPopover
// que cada página inclui). Uma página que precisa resetar seu próprio
// estado antes do tour abrir (ex.: fechar a árvore) faz isso ela mesma,
// antes de chamar tour.iniciar() -- ver arvore.js.
//
// Uso:
//   const tour = criarTourGuiado(MEUS_STEPS);
//   document.getElementById('btnGuia').addEventListener('click', tour.iniciar);
function criarTourGuiado(steps){
  let tourAtivo = false;
  let tourIndex = 0;

  function iniciar(){
    tourAtivo = true;
    tourIndex = 0;
    document.getElementById('tourShield').classList.add('is-active');
    document.getElementById('tourSpotlight').classList.add('is-active');
    document.getElementById('tourPopover').classList.add('is-active');
    mostrarPasso();
  }

  function encerrar(){
    tourAtivo = false;
    document.getElementById('tourShield').classList.remove('is-active');
    document.getElementById('tourSpotlight').classList.remove('is-active');
    document.getElementById('tourPopover').classList.remove('is-active');
  }

  function mostrarPasso(){
    const step = steps[tourIndex];
    const el = document.querySelector(step.selector);
    if (!el){
      // alvo não existe nesse momento (ex.: nenhuma coluna travada) -- pula o passo
      if (tourIndex < steps.length - 1){ tourIndex++; mostrarPasso(); }
      else { encerrar(); }
      return;
    }
    el.scrollIntoView({block:'center', inline:'center', behavior:'auto'});
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      posicionarSpotlight(rect);
      preencherPopover(step, tourIndex, steps.length);
      requestAnimationFrame(() => posicionarPopover(rect));
    });
  }

  function posicionarSpotlight(rect){
    const pad = 6;
    const sp = document.getElementById('tourSpotlight');
    sp.style.top = (rect.top - pad) + 'px';
    sp.style.left = (rect.left - pad) + 'px';
    sp.style.width = (rect.width + pad * 2) + 'px';
    sp.style.height = (rect.height + pad * 2) + 'px';
  }

  function preencherPopover(step, idx, total){
    document.getElementById('tourStepCount').textContent = `Passo ${idx + 1} de ${total}`;
    document.getElementById('tourTitle').textContent = step.title;
    document.getElementById('tourText').textContent = step.text;
    document.getElementById('tourPrev').disabled = idx === 0;
    document.getElementById('tourNext').textContent = idx === total - 1 ? 'Concluir' : 'Próximo';
  }

  function posicionarPopover(rect){
    const pop = document.getElementById('tourPopover');
    const margin = 14;
    const vw = window.innerWidth, vh = window.innerHeight;
    const popRect = pop.getBoundingClientRect();

    let top = rect.bottom + margin;
    if (top + popRect.height > vh - 10){
      top = rect.top - popRect.height - margin;
    }
    if (top < 10) top = 10;

    let left = rect.left;
    if (left + popRect.width > vw - 10) left = vw - popRect.width - 10;
    if (left < 10) left = 10;

    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  document.getElementById('tourClose').addEventListener('click', encerrar);
  document.getElementById('tourSkip').addEventListener('click', encerrar);
  document.getElementById('tourPrev').addEventListener('click', () => {
    if (tourIndex > 0){ tourIndex--; mostrarPasso(); }
  });
  document.getElementById('tourNext').addEventListener('click', () => {
    if (tourIndex < steps.length - 1){ tourIndex++; mostrarPasso(); }
    else { encerrar(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!tourAtivo) return;
    if (e.key === 'Escape') encerrar();
    else if (e.key === 'ArrowRight') document.getElementById('tourNext').click();
    else if (e.key === 'ArrowLeft') document.getElementById('tourPrev').click();
  });
  window.addEventListener('resize', () => { if (tourAtivo) mostrarPasso(); });

  return { iniciar, encerrar };
}
