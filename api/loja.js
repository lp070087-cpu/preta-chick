/* ==========================================================================
   /api/loja/* — rotas públicas da loja (uma função só; ver vercel.json)
   --------------------------------------------------------------------------
   GET  /api/loja/catalogo              preço/estoque reais do banco
   POST /api/loja/frete                 cotação por CEP
   POST /api/loja/pedidos-whatsapp      registra o pedido e devolve a mensagem/link do WhatsApp

   REGRA COMERCIAL: pedidos SOMENTE pelo WhatsApp. Não existe pagamento no
   site — a cliente informa a preferência e a loja conclui a venda.
   POST /api/loja/webhook/melhorenvio   eventos de envio (assinatura HMAC)
   POST /api/loja/webhook/pagamento/:p  eventos do provedor de pagamento

   A sessão da cliente é OPCIONAL aqui: com sessão, o pedido/atendimento
   fica vinculado à conta e aparece em "Minha conta"; sem sessão, funciona
   como compra de visitante.
   ========================================================================== */

"use strict";

const http = require("./_lib/http");
const db = require("./_lib/db");
const A = require("./_lib/auth");
const L = require("./_lib/loja");
const F = require("./_lib/frete");
const P = require("./_lib/pagamentos");
const falhar = require("./_lib/falha");

function rota(req) {
  const u = new URL(req.url, "http://x");
  const r = (u.searchParams.get("rota") || u.pathname.replace(/^\/api\/loja\/?/, "")).replace(/^\/+|\/+$/g, "");
  return { partes: r ? r.split("/") : [], query: u.searchParams };
}

async function clienteOpcional(req) {
  try { return await A.clienteDaRequisicao(req); } catch (e) { return null; }
}

/* Corpo cru — webhooks precisam dos bytes exatos para conferir assinatura.
   Não toca em req.body de propósito (o getter da Vercel consumiria o stream). */
function corpoCru(req) {
  return new Promise((resolve) => {
    const partes = []; let total = 0;
    req.on("data", (c) => { total += c.length; if (total <= 256 * 1024) partes.push(c); });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

/* ------------------------------------------------------------ catálogo */
async function getCatalogo(req, res) {
  const lista = await L.catalogo();
  return http.enviar(res, 200, {
    ok: true,
    produtos: lista.map(L.produtoPublico),
    checkout: {
      canal: "whatsapp",
      whatsapp: await L.whatsappDaLoja(),
      pagamentos: await L.opcoesPagamento(),
      retirada: (await F.opcoesLocais()).find((o) => o.id === "retirada") || null,
      freteAutomatico: F.configurado(),
    },
  }, { "Cache-Control": "no-cache", "Vercel-CDN-Cache-Control": "max-age=15" });
}

/* ---------------------------------------------------------------- frete */
async function postFrete(req, res) {
  const c = await http.corpo(req);
  const pre = await L.precificar(c.itens, {});
  const r = await F.cotar(c.cep, pre.linhas);
  return http.ok(res, Object.assign({ ok: true }, r));
}

/* -------------------------------------------- pedido pelo WhatsApp */
async function postPedidoWhatsapp(req, res) {
  const c = await http.corpo(req);
  const cliente = await clienteOpcional(req);
  const r = await L.criarPedidoWhatsapp(c, cliente);
  return http.enviar(res, r.repetida ? 200 : 201, {
    ok: true,
    codigo: r.sol.code,
    status: r.sol.status,
    whatsapp: r.numero,
    mensagem: r.mensagem,
    url: "https://wa.me/" + r.numero + "?text=" + encodeURIComponent(r.mensagem),
    vinculadoAConta: !!(cliente && r.sol.customer_id),
    repetido: !!r.repetida,
  });
}

/* --------------------------------------------------------------- webhooks */
async function registrarWebhook(provedor, eventId, ok, payload) {
  const r = await db.consulta(
    "INSERT INTO webhook_events (provider, event_id, signature_ok, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id",
    [provedor, eventId, ok, payload ? JSON.stringify(payload) : null]);
  return r.rows[0] ? r.rows[0].id : null; // null = já recebido antes
}

async function webhookMelhorEnvio(req, res) {
  const cru = await corpoCru(req);
  const ok = F.assinaturaValida(cru, req.headers["x-me-signature"]);
  let corpo = {};
  try { corpo = JSON.parse(cru.toString("utf8") || "{}"); } catch (e) { corpo = {}; }
  const dados = corpo.data || {};
  const eventId = L.texto((corpo.event || "evento") + ":" + (dados.id || "") + ":" + (dados.status || "") + ":" + (dados.tracking || ""), 200);
  const id = await registrarWebhook("melhorenvio", eventId, ok, corpo);
  if (!ok) return http.erro(res, 401, "assinatura inválida");
  if (!id) return http.ok(res, { ok: true, repetido: true });
  try {
    const pedido = dados.id ? await db.um("SELECT * FROM orders WHERE shipping_label_id = $1", [String(dados.id)]) : null;
    if (pedido) {
      await db.transacao(async (t) => {
        if (dados.tracking) await t.query("UPDATE orders SET tracking_code = $1, updated_at = now() WHERE id = $2", [dados.tracking, pedido.id]);
        await L.evento(t, "order_events", "order_id", pedido.id, "envio", { evento: corpo.event, status: dados.status, rastreio: dados.tracking || null });
        if (/posted|released/.test(corpo.event || "") && ["pago", "em_separacao"].indexOf(pedido.status) > -1) await L.mudarStatusPedido(t, pedido, "enviado", null, { via: "melhorenvio" });
        if (/delivered/.test(corpo.event || "")) {
          const atual = (await t.query("SELECT * FROM orders WHERE id = $1", [pedido.id])).rows[0];
          if (atual.status === "enviado") await L.mudarStatusPedido(t, atual, "entregue", null, { via: "melhorenvio" });
        }
      });
    }
    await db.consulta("UPDATE webhook_events SET processed_at = now() WHERE id = $1", [id]);
  } catch (e) {
    await db.consulta("UPDATE webhook_events SET error = $1 WHERE id = $2", [String(e.message).slice(0, 300), id]);
  }
  return http.ok(res, { ok: true });
}

async function webhookPagamento(req, res, provedor) {
  const ad = P.adaptador(provedor);
  const cru = await corpoCru(req);
  if (!ad) return http.erro(res, 404, "provedor não configurado");
  const ok = !!ad.validarWebhook(req, cru);
  let corpo = {};
  try { corpo = JSON.parse(cru.toString("utf8") || "{}"); } catch (e) { corpo = {}; }
  const ident = ad.lerWebhook(corpo);
  const id = await registrarWebhook(ad.nome, (ident && ident.eventId) || ("sem-id:" + Date.now()), ok, corpo);
  if (!ok) return http.erro(res, 401, "assinatura inválida");
  if (!id || !ident || !ident.ref) return http.ok(res, { ok: true });
  try {
    /* Fonte da verdade = consulta ao provedor, não o corpo recebido. */
    const situ = await ad.consultar(ident.ref);
    await db.transacao(async (t) => {
      const tx = (await t.query("SELECT * FROM payment_transactions WHERE provider = $1 AND provider_ref = $2 FOR UPDATE", [ad.nome, ident.ref])).rows[0];
      if (!tx) return;
      await t.query("UPDATE payment_transactions SET status = $1, raw = $2, updated_at = now() WHERE id = $3", [situ.status, JSON.stringify(situ.bruto || null), tx.id]);
      const pedido = tx.order_id ? (await t.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [tx.order_id])).rows[0] : null;
      if (!pedido) return;
      if (situ.status === "aprovado" && situ.valorCents >= pedido.total_cents) {
        await L.confirmarPagamento(t, pedido, { provider: ad.nome, ref: ident.ref, method: situ.metodo });
      } else if (situ.status === "estornado") {
        await t.query("UPDATE orders SET payment_status = 'estornado', updated_at = now() WHERE id = $1", [pedido.id]);
        await L.evento(t, "order_events", "order_id", pedido.id, "pagamento", { status: "estornado", via: ad.nome });
      } else if (situ.status === "aprovado") {
        await L.evento(t, "order_events", "order_id", pedido.id, "pagamento_divergente", { pago: situ.valorCents, total: pedido.total_cents });
      }
    });
    await db.consulta("UPDATE webhook_events SET processed_at = now() WHERE id = $1", [id]);
  } catch (e) {
    await db.consulta("UPDATE webhook_events SET error = $1 WHERE id = $2", [String(e.message).slice(0, 300), id]);
  }
  return http.ok(res, { ok: true });
}

/* --------------------------------------------------------------- roteador */
module.exports = async function handler(req, res) {
  const { partes } = rota(req);
  const m = String(req.method || "GET").toUpperCase();
  try {
    if (partes[0] === "catalogo" && m === "GET") return await getCatalogo(req, res);
    if (partes[0] === "frete" && m === "POST") return await postFrete(req, res);
    if ((partes[0] === "pedidos-whatsapp" || partes[0] === "atendimentos") && m === "POST") return await postPedidoWhatsapp(req, res);
    if (partes[0] === "pedidos" && m === "POST") return http.erro(res, 410, "Os pedidos são finalizados pelo WhatsApp da loja.");
    if (partes[0] === "webhook" && partes[1] === "melhorenvio" && m === "POST") return await webhookMelhorEnvio(req, res);
    if (partes[0] === "webhook" && partes[1] === "pagamento" && partes[2] && m === "POST") return await webhookPagamento(req, res, partes[2]);
    return http.erro(res, 404, "Rota não encontrada.");
  } catch (e) {
    return falhar(res, e);
  }
};
