/* ==========================================================================
   /api/loja/* — rotas públicas da loja (uma função só; ver vercel.json)
   --------------------------------------------------------------------------
   GET  /api/loja/catalogo              preço/estoque reais do banco
   POST /api/loja/frete                 cotação por CEP
   POST /api/loja/cupom                 confere cupom contra a sacola
   POST /api/loja/pedidos               finalizar pelo site
   POST /api/loja/atendimentos          finalizar com atendimento exclusivo (WhatsApp)
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
      pagamentoAutomatico: P.status().configurado,
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

/* ---------------------------------------------------------------- cupom */
async function postCupom(req, res) {
  const c = await http.corpo(req);
  const pre = await L.precificar(c.itens, {});
  const cup = await L.aplicarCupom(c.codigo, pre.subtotal, null);
  return http.ok(res, { ok: true, codigo: cup.codigo, desconto: cup.desconto, freteGratis: cup.freteGratis, subtotal: pre.subtotal });
}

/* ------------------------------------------------- finalizar pelo site */
async function postPedido(req, res) {
  const c = await http.corpo(req);
  const cliente = await clienteOpcional(req);
  const idem = L.chaveIdem(c.chave);

  if (idem) {
    const ja = await db.um("SELECT * FROM orders WHERE idempotency_key = $1", [idem]);
    if (ja) return http.ok(res, { ok: true, repetido: true, pedido: L.pedidoPublico(ja), whatsapp: await L.whatsappDaLoja() });
  }

  const contato = L.validarContato(c.contato || {});
  const pre = await L.precificar(c.itens, { exigirPreco: true, exigirEstoque: true });

  const escolha = L.texto(c.entrega && c.entrega.id, 40);
  if (!escolha) throw L.erroNegocio("Escolha a forma de entrega.", 400, { campo: "entrega" });
  let endereco = null, opcao;
  if (escolha === "retirada") {
    const locais = await F.opcoesLocais();
    opcao = locais.find((o) => o.id === "retirada");
    if (!opcao) throw L.erroNegocio("Retirada na loja não está disponível.", 409, { campo: "entrega" });
  } else {
    endereco = L.validarEndereco(c.endereco || {});
    opcao = await F.confirmarOpcao(endereco.cep, pre.linhas, escolha);
    if (!opcao.pagavelNoSite || opcao.preco == null) {
      throw L.erroNegocio("Esta forma de entrega é combinada no atendimento. Escolha outra ou finalize pelo WhatsApp.", 409, { campo: "entrega" });
    }
  }

  const cup = await L.aplicarCupom(c.cupom, pre.subtotal, opcao.preco);
  const frete = cup.freteGratis ? 0 : opcao.preco;
  const total = Math.max(0, pre.subtotal - cup.desconto) + frete;
  const metodo = L.texto(c.pagamento && c.pagamento.metodo, 30) || null;

  const pedido = await db.transacao(async (t) => {
    const o = await L.inserirPedido(t, {
      customer_id: cliente ? cliente.id : null, channel: "site", payment_method: metodo,
      name: contato.nome, phone: contato.fone, email: contato.email || (cliente && cliente.email) || null,
      address: endereco, items: pre.linhas, subtotal: pre.subtotal, discount: cup.desconto,
      shipping_cents: frete, total, coupon_code: cup.codigo,
      shipping: { tipo: opcao.tipo, id: opcao.id, nome: opcao.nome, empresa: opcao.empresa || null, servicoId: opcao.servicoId || null, prazo: opcao.prazo, preco: opcao.preco },
      notes: L.texto(c.observacao, 500) || null, stock_committed: true, idempotency_key: idem,
    });
    await L.baixarEstoque(t, pre.linhas, { tipo: "order", id: o.code });
    if (cup.codigo) {
      const u = await t.query("UPDATE coupons SET uses = uses + 1 WHERE code = $1 AND (max_uses IS NULL OR uses < max_uses) RETURNING code", [cup.codigo]);
      if (!u.rowCount) throw L.erroNegocio("Este cupom acabou de atingir o limite de usos.", 409, { campo: "cupom" });
    }
    await L.evento(t, "order_events", "order_id", o.id, "criado", { canal: "site", entrega: opcao.id });
    if (cliente && endereco && c.salvarEndereco) {
      await t.query(
        "INSERT INTO customer_addresses (customer_id, recipient, cep, street, number, complement, district, city, uf, is_default) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = $1))",
        [cliente.id, contato.nome, endereco.cep, endereco.rua, endereco.numero, endereco.complemento || null, endereco.bairro, endereco.cidade, endereco.uf]);
    }
    return o;
  });

  /* Cobrança automática só se o provedor da loja estiver ligado. Falhar
     aqui NÃO desfaz o pedido: a loja envia o pagamento pelo atendimento. */
  let final = pedido;
  const ad = P.adaptador();
  if (ad) {
    try {
      const cob = await ad.criarCobranca(pedido, { metodo });
      final = await db.um("UPDATE orders SET payment_provider = $1, payment_ref = $2, payment_link = $3, updated_at = now() WHERE id = $4 RETURNING *",
        [ad.nome, cob.ref, cob.link || null, pedido.id]);
      await db.consulta("INSERT INTO payment_transactions (order_id, provider, provider_ref, method, status, amount_cents) VALUES ($1,$2,$3,$4,'pendente',$5) ON CONFLICT DO NOTHING",
        [pedido.id, ad.nome, cob.ref, metodo, pedido.total_cents]);
    } catch (e) {
      await db.consulta("INSERT INTO order_events (order_id, kind, detail) VALUES ($1,'pagamento_erro',$2)", [pedido.id, JSON.stringify({ erro: e.message })]);
    }
  }

  return http.criado(res, { ok: true, pedido: L.pedidoPublico(final), whatsapp: await L.whatsappDaLoja() });
}

/* ------------------------------------------ finalizar com atendimento */
async function postAtendimento(req, res) {
  const c = await http.corpo(req);
  const cliente = await clienteOpcional(req);
  const r = await L.criarAtendimento(c, cliente);
  return http.enviar(res, r.repetida ? 200 : 201, {
    ok: true,
    codigo: r.sol.code,
    status: r.sol.status,
    whatsapp: r.numero,
    mensagem: r.mensagem,
    url: "https://wa.me/" + r.numero + "?text=" + encodeURIComponent(r.mensagem),
    vinculadoAConta: !!(cliente && r.sol.customer_id),
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
    if (partes[0] === "cupom" && m === "POST") return await postCupom(req, res);
    if (partes[0] === "pedidos" && m === "POST") return await postPedido(req, res);
    if (partes[0] === "atendimentos" && m === "POST") return await postAtendimento(req, res);
    if (partes[0] === "webhook" && partes[1] === "melhorenvio" && m === "POST") return await webhookMelhorEnvio(req, res);
    if (partes[0] === "webhook" && partes[1] === "pagamento" && partes[2] && m === "POST") return await webhookPagamento(req, res, partes[2]);
    return http.erro(res, 404, "Rota não encontrada.");
  } catch (e) {
    return falhar(res, e);
  }
};
