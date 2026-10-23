/* ==========================================================================
   api/_lib/db.js — acesso ao PostgreSQL (Neon)
   --------------------------------------------------------------------------
   REGRAS DESTE ARQUIVO:

   1. A DATABASE_URL e lida do ambiente, NUNCA escrita no codigo.
   2. Este arquivo so roda no servidor. A pasta api/ nao e servida como
      arquivo estatico: a Vercel compila cada arquivo dela como uma funcao.
   3. TODA consulta usa parametro ($1, $2...). Nao existe concatenacao de
      texto em SQL neste projeto — e isso que fecha a porta da injecao.
   4. O pool e reaproveitado entre invocacoes (cold start), porque abrir
      conexao nova a cada requisicao derruba a performance no serverless.
   ========================================================================== */

"use strict";

const { Pool } = require("pg");

/* O pool fica pendurado no objeto global para sobreviver ao reuso do
   container. Sem isso, cada invocacao abriria um pool novo e o Neon
   estouraria o limite de conexoes.                                        */
const globalParaPool = globalThis;

function criarPool() {
  const url = (process.env.DATABASE_URL || "").trim();

  if (!url) {
    /* Erro claro, e sem vazar nada: a mensagem NAO imprime a variavel. */
    const e = new Error(
      "DATABASE_URL nao configurada. Defina a variavel de ambiente no painel " +
      "da Vercel (Settings -> Environment Variables) e rode a migration."
    );
    e.codigo = "SEM_BANCO";
    throw e;
  }

  return new Pool({
    connectionString: url,
    /* O Neon exige TLS. Mantemos a verificacao do certificado ligada. */
    ssl: /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: true },
    /* Neon pooled connection: poucas conexoes por instancia serverless. */
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

function pool() {
  if (!globalParaPool.__labellePool) {
    globalParaPool.__labellePool = criarPool();
    /* Se o pool emitir erro fora de uma consulta (conexao caiu), nao
       deixamos o processo morrer em silencio.                              */
    globalParaPool.__labellePool.on("error", () => { /* tratado na consulta */ });
  }
  return globalParaPool.__labellePool;
}

/* consulta(sql, [parametros]) -> resultado do pg
   Toda consulta do projeto passa por aqui. Um lugar unico para revisar.   */
async function consulta(sql, params) {
  return pool().query(sql, params || []);
}

/* Uma linha, ou null. Açúcar para leitura de registro unico. */
async function um(sql, params) {
  const r = await consulta(sql, params);
  return r.rows.length ? r.rows[0] : null;
}

/* transacao(async (c) => { ... }) — BEGIN/COMMIT num cliente dedicado.
   Qualquer erro dentro da função faz ROLLBACK e é relançado. Usada onde
   estoque e pedido precisam mudar juntos ou não mudar nada.               */
async function transacao(fn) {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/* ------------------------------------------------------- codigos de erro
   Erros do Postgres que o codigo trata de forma especifica. */
const PG_EMAIL_DUPLICADO = "23505"; // violacao de UNIQUE

function ehEmailDuplicado(e) {
  return !!(e && e.code === PG_EMAIL_DUPLICADO);
}

module.exports = { consulta, um, pool, transacao, ehEmailDuplicado, PG_EMAIL_DUPLICADO };
