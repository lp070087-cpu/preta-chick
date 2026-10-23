/* api/_lib/falha.js — resposta única para erros das rotas da loja/painel.
   Erro de negócio (e.negocio) vira 4xx com a mensagem para a pessoa;
   o resto vira 500 genérico, sem vazar detalhe interno.                   */
"use strict";
const http = require("./http");

module.exports = function falhar(res, e) {
  if (e && e.negocio) return http.enviar(res, e.status || 400, Object.assign({ erro: e.message }, e.extra || {}));
  if (e && e.codigo === "SEM_BANCO") return http.erro(res, 503, "A loja ainda não está ligada ao banco de dados.");
  if (e && e.code === "42P01") return http.erro(res, 503, "O banco da loja ainda não foi preparado (migração pendente).");
  if (e && e.code === "22P02") return http.erro(res, 400, "Identificador inválido.");
  console.error("[api]", e && e.message);
  return http.erro(res, 500, "Não consegui concluir agora. Tente de novo em instantes.");
};
