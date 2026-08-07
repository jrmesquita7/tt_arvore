<?php
// ============================================================================
// lib/snowflake.php
// Conexão com o Snowflake via ODBC + cache em arquivo com TTL + blindagem
// da resposta JSON contra ruído de warning/notice do PHP. Compartilhado por
// qualquer endpoint em /api -- cada endpoint só define sua query e chama
// consultarComCache() dentro de responderJson().
//
// Uso típico num api/dados_x.php:
//
//   <?php
//   require_once __DIR__ . '/../lib/snowflake.php';
//
//   responderJson(function () {
//       $config = require __DIR__ . '/../lib/config.php';
//       $pediuAtualizar = isset($_POST['atualizar']) || isset($_GET['atualizar']);
//       $cacheFile = __DIR__ . '/cache/dados_x.json';
//
//       $resultado = consultarComCache($cacheFile, 3600, $pediuAtualizar, function () use ($config) {
//           $conn = conectarSnowflake($config);
//           $linhas = executarQuery($conn, "SELECT ... FROM ... GROUP BY ALL");
//           return normalizarNumericas($linhas, ['COLUNA_NUMERICA_1', 'COLUNA_NUMERICA_2']);
//       });
//
//       return [
//           'geradoEm' => $resultado['timestamp'],
//           'linhas'   => count($resultado['dados']),
//           'dados'    => $resultado['dados'],
//       ];
//   });
// ============================================================================

// ----------------------------------------------------------------------------
// Conexão + execução de query -- mesmo padrão já usado no projeto
// ----------------------------------------------------------------------------
function conectarSnowflake(array $config) {
    $conn = odbc_connect($config['dsn'], $config['user'], $config['password']);

    if (!$conn) {
        throw new Exception("Erro ao conectar: " . odbc_errormsg());
    }

    odbc_exec($conn, "USE WAREHOUSE {$config['warehouse']}");
    odbc_exec($conn, "USE DATABASE {$config['database']}");
    odbc_exec($conn, "USE SCHEMA {$config['schema']}");

    if (!empty($config['role'])) {
        try {
            @odbc_exec($conn, "USE ROLE \"{$config['role']}\"");
        } catch (Exception $e) {
            // segue sem trocar role explicitamente se falhar
        }
    }

    return $conn;
}

function executarQuery($conn, string $sql): array {
    $result = odbc_exec($conn, $sql);

    if (!$result) {
        $msg = odbc_errormsg($conn);
        odbc_close($conn);
        throw new Exception("Erro ao executar query: " . $msg);
    }

    $linhas = [];
    while ($row = odbc_fetch_array($result)) {
        $linhas[] = $row;
    }

    odbc_close($conn);
    return $linhas;
}

// Normaliza colunas numéricas vindas do ODBC (vírgula decimal -> ponto,
// string -> float), preservando null (ex.: métrica sem valor pra aquela
// combinação de dimensões).
function normalizarNumericas(array $linhas, array $colunas): array {
    foreach ($linhas as &$row) {
        foreach ($colunas as $col) {
            if (isset($row[$col])) {
                $row[$col] = (float) str_replace(',', '.', $row[$col]);
            }
        }
    }
    return $linhas;
}

// ----------------------------------------------------------------------------
// Cache em arquivo com TTL
// ----------------------------------------------------------------------------
// Serve do cache (arquivo JSON) se ele existir e ainda estiver dentro do
// TTL; senão roda $consultaFn() (que deve devolver um array de linhas) e
// reescreve o cache. $pediuAtualizar força a consulta nova, ignorando o
// TTL -- é o que o botão "Recarregar dados" do front usa.
function consultarComCache(string $cacheFile, int $ttlSegundos, bool $pediuAtualizar, callable $consultaFn): array {
    $cacheDir = dirname($cacheFile);
    if (!file_exists($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }

    $cacheValido = file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $ttlSegundos;

    if ($pediuAtualizar || !$cacheValido) {
        $dados = $consultaFn();
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

    return ['dados' => $dados, 'timestamp' => $timestamp];
}

// ----------------------------------------------------------------------------
// Blindagem da resposta JSON
// ----------------------------------------------------------------------------
// Se o PHP emitir um warning/notice/deprecation durante a consulta (ex.: o
// driver ODBC reclamar de algo depois de uma mudança na tabela fonte),
// esse aviso normalmente é impresso como HTML ("<br /><b>Warning</b>: ...")
// misturado à saída e quebra o JSON no front. Bufferiza toda a saída, roda
// $fn() (que devolve o array a ser json_encode'ado ou lança Exception),
// descarta qualquer ruído impresso por fora (só loga, pra dar pra
// investigar depois) e garante que o corpo da resposta seja sempre
// exatamente o JSON esperado.
function responderJson(callable $fn): void {
    header('Content-Type: application/json; charset=utf-8');
    ini_set('display_errors', '0');
    ob_start();

    try {
        $payload = $fn();
    } catch (Exception $e) {
        http_response_code(500);
        $payload = ['error' => $e->getMessage()];
    }

    $resposta = json_encode($payload, JSON_UNESCAPED_UNICODE);

    $saidaIncidental = trim(ob_get_clean());
    if ($saidaIncidental !== '') {
        error_log(basename($_SERVER['SCRIPT_NAME']) . ': saída inesperada suprimida da resposta: ' . $saidaIncidental);
    }

    echo $resposta;
}
