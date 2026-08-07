<?php
// ============================================================================
// dados_arvore.php
// Dados agregados da árvore de decomposição (7 dimensões, 3 métricas
// somadas). Conexão, cache com TTL e blindagem da resposta JSON vêm de
// lib/snowflake.php -- aqui só a query e a configuração deste endpoint.
//
// Uso:
//   GET  dados_arvore.php               -> devolve o cache mais recente
//                                           (ou consulta de novo se tiver
//                                           passado de 1h)
//   GET/POST dados_arvore.php?atualizar=1 -> consulta o Snowflake de novo e
//                                            atualiza o cache
// ============================================================================

require_once __DIR__ . '/../lib/snowflake.php';

responderJson(function () {
    $config = require __DIR__ . '/../lib/config.php';
    $pediuAtualizar = isset($_POST['atualizar']) || isset($_GET['atualizar']);
    $cacheFile = __DIR__ . '/cache/dados_arvore.json';

    $resultado = consultarComCache($cacheFile, 3600, $pediuAtualizar, function () use ($config) {
        $conn = conectarSnowflake($config);

        $sql = "
            SELECT
                EMPRESA,
                CLASSE_CONSUMO,
                SEGMENTO,
                STATUS_COMERCIAL,
                ORIGEM_TROCA,
                GRUPO_TARIFARIO,
                VERIFICACAO,
                FATURA_FINAL,
                TO_CHAR(DATE_TRUNC('MONTH', DATA_CONCLUSAO), 'YYYY-MM') AS MES_CONCLUSAO,
                SUM(TOTAL_AB_CC_ANT)   AS TOTAL_AB_CC_ANT,
                SUM(TOTAL_AB_PARCELAS) AS TOTAL_AB_PARCELAS,
                SUM(VALOR_CNR)         AS VALOR_CNR
            FROM SB_COBRANCA.EQTL_CORP.CB_ARVORE_TT_CORP
            GROUP BY ALL
        ";

        $linhas = executarQuery($conn, $sql);
        return normalizarNumericas($linhas, ['TOTAL_AB_CC_ANT', 'TOTAL_AB_PARCELAS', 'VALOR_CNR']);
    });

    return [
        'geradoEm' => $resultado['timestamp'],
        'linhas'   => count($resultado['dados']),
        'dados'    => $resultado['dados'],
    ];
});
