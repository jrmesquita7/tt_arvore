<?php
// ============================================================================
// dados_arvore.php
// Mesma abordagem de conexão que você já usa (odbc_connect + DSN configurado),
// adaptada para a query agregada da árvore de decomposição multimétrica.
//
// Uso:
//   GET  dados_arvore.php               -> devolve o cache mais recente
//   GET/POST dados_arvore.php?atualizar=1 -> consulta o Snowflake de novo e
//                                            atualiza o cache
// ============================================================================

header('Content-Type: application/json; charset=utf-8');

// ----------------------------------------------------------------------------
// Configuração da conexão -- mesmo padrão do seu arquivo existente
// ----------------------------------------------------------------------------
$snowflakeConfig = [
    'dsn'       => 'SnowflakeCobranca',
    'user'      => 'SCORPCOBRANCA@GRUPOEQUATORIALENERGIA.ONMICROSOFT.COM',
    'password'  => '',
    'warehouse' => 'WH_EQTLINFO',
    'database'  => 'SB_COBRANCA',
    'schema'    => 'EQTL_CORP',  
    'role'      => 'GRP_SWF_COBRANCA'
];

$cacheDir  = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/dados_arvore.json';
$cacheTtlSegundos = 3600; // cache expira depois de 1h; a partir daí uma
                          // carga normal já dispara consulta nova sozinha

if (!file_exists($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

// ----------------------------------------------------------------------------
// A query agregada (grão das 7 dimensões, 3 métricas somadas)
// ----------------------------------------------------------------------------
function montarQuery() {
    return "
        SELECT
            EMPRESA,
            CLASSE,
            SEGMENTO,
            STATUS_COMERCIAL,
            ORIGEM_TROCA,
            GRUPO_TARIFARIO,
            VERIFICACAO,
            FATURA_FINAL,
            SUM(TOTAL_AB_CC_ANT)   AS TOTAL_AB_CC_ANT,
            SUM(TOTAL_AB_PARCELAS) AS TOTAL_AB_PARCELAS,
            SUM(VALOR_CNR)         AS VALOR_CNR
        FROM SB_COBRANCA.EQTL_CORP.CB_ARVORE_TT_CORP
        GROUP BY ALL
    ";
}

// ----------------------------------------------------------------------------
// Consulta ao Snowflake via ODBC -- mesmo padrão do seu código
// ----------------------------------------------------------------------------
function consultarSnowflake($config) {
    $conn = odbc_connect($config['dsn'], $config['user'], $config['password']);

    if (!$conn) {
        throw new Exception("Erro ao conectar: " . odbc_errormsg());
    }

    odbc_exec($conn, "USE WAREHOUSE {$config['warehouse']}");
    odbc_exec($conn, "USE DATABASE {$config['database']}");
    odbc_exec($conn, "USE SCHEMA {$config['schema']}");

    try {
        @odbc_exec($conn, "USE ROLE \"{$config['role']}\"");
    } catch (Exception $e) {
        // segue sem trocar role explicitamente se falhar
    }

    $result = odbc_exec($conn, montarQuery());

    if (!$result) {
        $msg = odbc_errormsg($conn);
        odbc_close($conn);
        throw new Exception("Erro ao executar query: " . $msg);
    }

    $dados = [];
    while ($row = odbc_fetch_array($result)) {
        // as 3 últimas colunas são numéricas -- normaliza pra float
        foreach (['TOTAL_AB_CC_ANT', 'TOTAL_AB_PARCELAS', 'VALOR_CNR'] as $col) {
            if (isset($row[$col])) {
                $row[$col] = (float) str_replace(',', '.', $row[$col]);
            }
        }
        $dados[] = $row;
    }

    odbc_close($conn);
    return $dados;
}

// ----------------------------------------------------------------------------
// Roteamento: atualizar (consulta de verdade) ou servir cache
// ----------------------------------------------------------------------------
try {
    $pediuAtualizar = isset($_POST['atualizar']) || isset($_GET['atualizar']);
    $cacheValido = file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtlSegundos;

    if ($pediuAtualizar || !$cacheValido) {
        $dados = consultarSnowflake($snowflakeConfig);
        $timestamp = date('Y-m-d H:i:s');

        file_put_contents($cacheFile, json_encode([
            'data'      => $dados,
            'timestamp' => $timestamp,
        ], JSON_UNESCAPED_UNICODE));

    } else {
        $cache = json_decode(file_get_contents($cacheFile), true);
        $dados = $cache['data'] ?? [];
        $timestamp = $cache['timestamp'] ?? null;
    }

    echo json_encode([
        'geradoEm' => $timestamp,
        'linhas'   => count($dados),
        'dados'    => $dados,
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
