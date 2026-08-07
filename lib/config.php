<?php
// Configuração padrão de conexão com o Snowflake, compartilhada por
// qualquer endpoint em /api. Um endpoint pode sobrescrever campos
// específicos (schema, role) se precisar de outro contexto:
//
//   $config = require __DIR__ . '/../lib/config.php';
//   $config['schema'] = 'OUTRO_SCHEMA';
//
return [
    'dsn'       => 'SnowflakeCobranca',
    'user'      => 'SCORPCOBRANCA@GRUPOEQUATORIALENERGIA.ONMICROSOFT.COM',
    'password'  => '',
    'warehouse' => 'WH_EQTLINFO',
    'database'  => 'SB_COBRANCA',
    'schema'    => 'EQTL_CORP',
    'role'      => 'GRP_SWF_COBRANCA',
];
