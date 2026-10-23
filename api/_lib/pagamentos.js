/* ==========================================================================
   api/_lib/pagamentos.js — camada de pagamentos, neutra de provedor
   --------------------------------------------------------------------------
   A proprietária já usa uma plataforma para receber. O NOME dessa plataforma
   ainda não foi informado, então NENHUM provedor foi escolhido por nós.

   O que existe hoje, funcionando:
     - provedor "manual": a equipe registra no painel um pagamento que JÁ
       ENTROU na conta da loja (Pix recebido, link pago, maquininha).
       Fica gravado quem registrou, quando, valor, forma e referência.

   O que está pronto para receber o provedor real:
     - contrato de adaptador (abaixo, `CONTRATO`): criar cobrança/link,
       consultar, reembolsar, validar assinatura do webhook, ler o evento;
     - rota de webhook /api/loja/webhook/pagamento/<provedor> com registro
       idempotente (webhook_events) e confirmação SÓ depois de consultar o
       provedor — o corpo da notificação sozinho nunca aprova pagamento.

   Para ligar: crie api/_lib/provedores/<nome>.js seguindo o CONTRATO,
   registre-o em ADAPTADORES e defina PAGAMENTO_PROVEDOR=<nome> + as
   credenciais dele nas variáveis da Vercel.
   ========================================================================== */

"use strict";

/* CONTRATO de um adaptador de provedor:
   {
     nome: "x",
     suporta: { pix: bool, cartao: bool, link: bool, reembolso: bool },
     configurado(): bool,
     criarCobranca(pedido, { metodo }): Promise<{ ref, link, pixCopiaECola?, expiraEm? }>,
     consultar(ref): Promise<{ status: 'pendente'|'aprovado'|'recusado'|'estornado'|'cancelado', valorCents, metodo, bruto }>,
     reembolsar(ref, valorCents): Promise<{ status, bruto }>,
     validarWebhook(req, corpoCru): bool,               // assinatura do provedor
     lerWebhook(corpo): { eventId, ref } | null,         // só identifica; quem decide é consultar()
   }                                                                       */
const ADAPTADORES = {
  // "<provedor>": require("./provedores/<provedor>"),
};

function nomeConfigurado() {
  return (process.env.PAGAMENTO_PROVEDOR || "").trim().toLowerCase() || null;
}

function adaptador(nome) {
  const n = (nome || nomeConfigurado() || "").toLowerCase();
  const a = ADAPTADORES[n];
  return a && a.configurado() ? a : null;
}

function status() {
  const nome = nomeConfigurado();
  const a = nome ? ADAPTADORES[nome] : null;
  return {
    provedor: nome,
    implementado: !!a,
    configurado: !!(a && a.configurado()),
    suporta: a ? a.suporta : null,
    manual: true,
    observacao: !nome
      ? "Plataforma de pagamento da loja ainda não informada. Pagamentos são registrados manualmente pela equipe após conferência."
      : !a ? "Provedor '" + nome + "' definido, mas o adaptador ainda não foi implementado."
      : !a.configurado() ? "Adaptador presente, credenciais ausentes." : "Ativo.",
  };
}

const METODOS_MANUAIS = ["pix", "cartao_credito", "cartao_debito", "link", "dinheiro", "transferencia"];

module.exports = { ADAPTADORES, adaptador, nomeConfigurado, status, METODOS_MANUAIS };
