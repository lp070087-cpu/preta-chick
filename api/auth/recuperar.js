/* ==========================================================================
   POST /api/auth/recuperar — pedir redefinição de senha
   --------------------------------------------------------------------------
   ESTADO ATUAL: arquitetura pronta, ENVIO DE E-MAIL PENDENTE.

   O projeto não tem serviço de e-mail configurado. Inventar um reset "de
   mentira" (que devolve um link na tela, ou que troca a senha sem provar
   quem é) seria pior do que não ter: seria um buraco com cara de recurso.

   Então este endpoint faz o que dá para fazer com segurança hoje:

   1. Responde SEMPRE a mesma coisa, exista ou não o e-mail.
      Ninguém descobre quais endereços têm conta aqui.
   2. Se (e somente se) houver um provedor de e-mail configurado, gera o
      token, grava o HASH dele em password_resets e dispara o e-mail.
   3. Sem provedor configurado, NÃO cria token nenhum. Um token que nunca
      chega até a pessoa é lixo no banco e mais uma coisa para dar errado.

   PARA LIGAR O ENVIO (quando você decidir o provedor):
     - configure a variável de ambiente do provedor (ex.: RESEND_API_KEY);
     - preencha o bloco `enviarEmail` abaixo;
     - o resto já está pronto: token, validade, uso único e rota de
       redefinição (api/auth/redefinir.js).
   ========================================================================== */

"use strict";

const crypto = require("crypto");
const http = require("../_lib/http");
const V = require("../_lib/validar");
const db = require("../_lib/db");

/* A MESMA resposta para todos os casos. Não mude isso sem querer. */
const RESPOSTA_GENERICA =
  "Se este e-mail tiver uma conta na Preta Chik, enviaremos as instruções para " +
  "redefinir a senha. Confira também a caixa de spam.";

const VALIDADE_MINUTOS = 60;

/* O provedor de e-mail ainda não foi escolhido. Enquanto esta variável não
   existir, o endpoint responde a mensagem genérica e não grava nada.     */
function provedorConfigurado() {
  return !!(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY);
}

/* --------------------------------------------------------------- envio
   PENDENTE DE INTEGRAÇÃO DE E-MAIL.
   Quando o provedor for escolhido, é só preencher aqui. O corpo do e-mail
   leva o link com o token; nada de dado sensível além do necessário.     */
async function enviarEmail(/* para, token, nome */) {
  throw new Error("PENDENTE: integração de e-mail ainda não configurada.");
}

module.exports = async function handler(req, res) {
  if (!http.permitir(req, res, ["POST"])) return;

  let corpo;
  try {
    corpo = await http.corpo(req);
  } catch (e) {
    return http.erro(res, 400, "Não consegui ler os dados enviados.");
  }

  const email = V.normalizarEmail(corpo && corpo.email);

  /* Formato inválido também recebe a mensagem genérica. Do contrário, a
     própria mensagem diria quais formatos existem na base.              */
  if (!V.emailValido(email)) return http.ok(res, { ok: true, mensagem: RESPOSTA_GENERICA });

  try {
    if (!provedorConfigurado()) {
      /* Sem provedor: nada é gravado, nada é enviado, e a resposta é a
         mesma. É honesto e não cria resíduo no banco.                   */
      return http.ok(res, { ok: true, mensagem: RESPOSTA_GENERICA });
    }

    const cliente = await db.um("SELECT id, name, email FROM customers WHERE email = $1", [email]);

    if (cliente) {
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
      const expiraEm = new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);

      /* Invalida pedidos anteriores desta conta antes de criar o novo:
         só o link mais recente vale.                                   */
      await db.consulta('DELETE FROM password_resets WHERE "customerId" = $1 AND "usedAt" IS NULL', [cliente.id]);
      await db.consulta(
        'INSERT INTO password_resets ("customerId", "tokenHash", "expiresAt") VALUES ($1, $2, $3)',
        [cliente.id, tokenHash, expiraEm]
      );

      try {
        await enviarEmail(cliente.email, token, cliente.name);
      } catch (e) {
        /* Falha de envio NÃO pode virar resposta diferente: isso revelaria
           que a conta existe. O erro fica só no log do servidor.        */
      }
    }

    return http.ok(res, { ok: true, mensagem: RESPOSTA_GENERICA });
  } catch (e) {
    /* Banco fora do ar também responde igual. Pedir senha não pode ser um
       oráculo de "o banco está de pé?" nem de "esta conta existe?".     */
    return http.ok(res, { ok: true, mensagem: RESPOSTA_GENERICA });
  }
};
