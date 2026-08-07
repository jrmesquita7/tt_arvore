# Arquitetura

Projeto em **PHP + HTML + CSS + JS puro** (sem framework, sem build step). Roda
direto num Apache/PHP (XAMPP), sem Node/npm envolvido. Pensado pra virar um BI
com várias páginas/visuais, cada uma reaproveitando o que já é genérico daqui.

## Estrutura

```
/
├── index.html                 página "Árvore de Troca de Titularidade" (na raiz
│                               por compatibilidade com a URL já em uso)
├── arvore.css / arvore.js     específicos dessa página
├── assets/
│   ├── css/
│   │   ├── tokens.css         paleta, raios, sombras, easing (:root)
│   │   └── base.css           chrome genérico: reset, header, botões,
│   │                          filtros, legenda, status, loading overlay,
│   │                          tour guiado, footer
│   └── js/
│       ├── utils.js           formatadores, status/loading, export CSV
│       └── tour.js            motor genérico do tour guiado (spotlight)
├── lib/
│   ├── config.php             config de conexão Snowflake compartilhada
│   └── snowflake.php          conexão + query + cache com TTL + blindagem
│                               da resposta JSON
├── api/
│   ├── dados_arvore.php       endpoint desta página
│   └── cache/                 cache em arquivo (gitignored -- nunca commitar)
└── .gitignore
```

## Adicionar uma página nova

1. Cria uma pasta própria na raiz (`nome-da-pagina/`) com `index.html` (ou
   `.php`), `nome-da-pagina.css` e `nome-da-pagina.js`.
2. No `<head>`, linka nessa ordem:
   ```html
   <link rel="stylesheet" href="../assets/css/tokens.css">
   <link rel="stylesheet" href="../assets/css/base.css">
   <link rel="stylesheet" href="nome-da-pagina.css">
   ```
3. No fim do `<body>`, na mesma ordem (garante que o DOM já existe quando os
   scripts rodam):
   ```html
   <script src="../assets/js/utils.js"></script>
   <script src="../assets/js/tour.js"></script>
   <script src="nome-da-pagina.js"></script>
   ```
4. Reaproveita o markup do header/loading-overlay/tour do `index.html` atual
   como referência (são os mesmos ids que `assets/css/base.css` e
   `assets/js/utils.js`/`tour.js` esperam: `#siteHeader`, `#status`,
   `#loadingOverlay`/`#loadingSub`, `#tourShield`/`#tourSpotlight`/
   `#tourPopover` e os botões de navegação do tour).
5. Se a página tiver um tour guiado: define seu próprio array de passos e
   chama `criarTourGuiado(MEUS_STEPS)` -- ver `arvore.js` pro padrão
   completo (inclusive como resetar o estado da própria página antes de
   `tour.iniciar()`).

## Adicionar um endpoint novo

Cria `api/dados_x.php` seguindo o padrão de `api/dados_arvore.php`:

```php
<?php
require_once __DIR__ . '/../lib/snowflake.php';

responderJson(function () {
    $config = require __DIR__ . '/../lib/config.php';
    // sobrescreve $config['schema']/['role'] aqui se precisar de outro contexto
    $pediuAtualizar = isset($_POST['atualizar']) || isset($_GET['atualizar']);
    $cacheFile = __DIR__ . '/cache/dados_x.json';

    $resultado = consultarComCache($cacheFile, 3600, $pediuAtualizar, function () use ($config) {
        $conn = conectarSnowflake($config);
        $linhas = executarQuery($conn, "SELECT ... GROUP BY ALL");
        return normalizarNumericas($linhas, ['COLUNA_NUMERICA_1']);
    });

    return [
        'geradoEm' => $resultado['timestamp'],
        'linhas'   => count($resultado['dados']),
        'dados'    => $resultado['dados'],
    ];
});
```

O cache cai automaticamente em `api/cache/` (já gitignored) -- nunca commitar
esses arquivos; um cache antigo commitado sobrescreve o cache real do
servidor a cada `git pull` e já causou bug em produção uma vez.

## O que não foi generalizado ainda (de propósito)

O motor de árvore de decomposição (`path`/`filterByPath`/`aggregateBy`/
drill-down com multi-seleção, hoje inteiro em `arvore.js`) é o pedaço mais
elaborado do projeto e o mais tentador de virar módulo genérico -- mas só
existe uma visualização em árvore até agora. Extrair isso sem uma segunda
tela real pra validar o formato certo da API seria chute. Quando uma
segunda árvore de decomposição existir de verdade, aí sim vale extrair o
padrão comum entre as duas pra `assets/js/`.
