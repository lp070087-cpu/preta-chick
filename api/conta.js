/* ==========================================================================
   /api/conta/* — dados da cliente logada (exige sessão; ver vercel.json)
   --------------------------------------------------------------------------
   GET    /api/conta/pedidos              pedidos da cliente
   GET    /api/conta/pedidos/:codigo      detalhe + linha do tempo
   GET    /api/conta/atendimentos         solicitações de atendimento exclusivo
   GET    /api/conta/enderecos            lista
   POST   /api/conta/enderecos            cria
   PUT    /api/conta/enderecos/:id        edita
   POST   /api/conta/enderecos/:id/principal
   DELETE /api/conta/enderecos/:id
   GET    /api/conta/favoritos            ids
   PUT    /api/conta/favoritos            substitui (sincroniza com o navegador)
   GET    /api/conta/carrinho             sacola persistente
   PUT    /api/conta/carrinho

   Igual ao resto da área da cliente: quem é a cliente vem SÓ da sessão.
   Nenhum id de cliente é aceito do navegador.
   ========================================================================== */

"use strict";

const http = require("./_lib/http");
const db = require("./_lib/db");
const A = require("./_lib/auth");
const L = require("./_lib/loja");
const falhar = require("./_lib/falha");

function partes(req) {
  const u = new URL(req.url, "http://x");
  const r = (u.searchParams.get("rota") || u.pathname.replace(/^\/api\/conta\/?/, "")).replace(/^\/+|\/+$/g, "");
  return r ? r.split("/") : [];
}

function enderecoPublico(e) {
  return { id: e.id, apelido: e.label, destinatario: e.recipient, cep: e.cep, rua: e.street, numero: e.number,
    complemento: e.complement, bairro: e.district, cidade: e.city, uf: e.uf, principal: e.is_default };
}

function lerEndereco(c) {
  const end = L.validarEndereco(c);
  const dest = L.texto(c.destinatario, 120);
  if (dest.length < 3) throw L.erroNegocio("Informe quem recebe.", 400, { campo: "destinatario" });
  return Object.assign(end, { destinatario: dest, apelido: L.texto(c.apelido, 40) || "Casa" });
}

function itensCarrinho(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 40).map((i) => ({
    k: L.texto(i && i.k, 120), id: L.texto(i && i.id, 20), cor: L.texto(i && i.cor, 60),
    tam: L.texto(i && i.tam, 6), qtd: L.inteiro(i && i.qtd, 1, 9) || 1,
  })).filter((i) => i.id && i.tam);
}

module.exports = async function handler(req, res) {
  const p = partes(req);
  const m = String(req.method || "GET").toUpperCase();
  const cli = await A.exigirCliente(req, res, http);
  if (!cli) return;
  try {
    /* ---------------------------------------------------------- pedidos */
    if (p[0] === "pedidos" && m === "GET" && !p[1]) {
      const r = await db.consulta("SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100", [cli.id]);
      return http.ok(res, { ok: true, pedidos: r.rows.map(L.pedidoPublico), status: L.STATUS_PEDIDO });
    }
    if (p[0] === "pedidos" && m === "GET" && p[1]) {
      const o = await db.um("SELECT * FROM orders WHERE customer_id = $1 AND code = $2", [cli.id, L.texto(p[1], 20).toUpperCase()]);
      if (!o) return http.erro(res, 404, "Pedido não encontrado.");
      const ev = await db.consulta("SELECT kind, detail, created_at FROM order_events WHERE order_id = $1 AND kind IN ('criado','status','envio') ORDER BY created_at", [o.id]);
      const at = o.service_request_id ? await db.um("SELECT code FROM service_requests WHERE id = $1", [o.service_request_id]) : null;
      return http.ok(res, { ok: true, pedido: Object.assign(L.pedidoPublico(o), { atendimento: at ? at.code : null }),
        historico: ev.rows.map((e) => ({ tipo: e.kind, detalhe: e.detail, em: e.created_at })) });
    }

    /* ------------------------------------------------------ atendimentos */
    if (p[0] === "atendimentos" && m === "GET") {
      const r = await db.consulta(
        "SELECT s.*, o.code AS order_code FROM service_requests s LEFT JOIN orders o ON o.id = s.order_id " +
        "WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 100", [cli.id]);
      return http.ok(res, { ok: true, atendimentos: r.rows.map(L.atendimentoPublico), status: L.STATUS_ATENDIMENTO });
    }

    /* --------------------------------------------------------- endereços */
    if (p[0] === "enderecos") {
      if (m === "GET") {
        const r = await db.consulta("SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at", [cli.id]);
        return http.ok(res, { ok: true, enderecos: r.rows.map(enderecoPublico) });
      }
      if (m === "POST" && !p[1]) {
        const e = lerEndereco(await http.corpo(req));
        await db.consulta(
          "INSERT INTO customer_addresses (customer_id, label, recipient, cep, street, number, complement, district, city, uf, is_default) " +
          "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = $1))",
          [cli.id, e.apelido, e.destinatario, e.cep, e.rua, e.numero, e.complemento || null, e.bairro, e.cidade, e.uf]);
      } else if (m === "PUT" && p[1]) {
        const e = lerEndereco(await http.corpo(req));
        const r = await db.consulta(
          "UPDATE customer_addresses SET label=$1, recipient=$2, cep=$3, street=$4, number=$5, complement=$6, district=$7, city=$8, uf=$9 " +
          "WHERE id = $10 AND customer_id = $11",
          [e.apelido, e.destinatario, e.cep, e.rua, e.numero, e.complemento || null, e.bairro, e.cidade, e.uf, p[1], cli.id]);
        if (!r.rowCount) return http.erro(res, 404, "Endereço não encontrado.");
      } else if (m === "POST" && p[1] && p[2] === "principal") {
        await db.transacao(async (t) => {
          const r = await t.query("SELECT id FROM customer_addresses WHERE id = $1 AND customer_id = $2", [p[1], cli.id]);
          if (!r.rowCount) throw L.erroNegocio("Endereço não encontrado.", 404);
          await t.query("UPDATE customer_addresses SET is_default = (id = $1) WHERE customer_id = $2", [p[1], cli.id]);
        });
      } else if (m === "DELETE" && p[1]) {
        await db.transacao(async (t) => {
          const r = await t.query("DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 RETURNING is_default", [p[1], cli.id]);
          if (!r.rowCount) throw L.erroNegocio("Endereço não encontrado.", 404);
          if (r.rows[0].is_default) {
            await t.query("UPDATE customer_addresses SET is_default = true WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = $1 ORDER BY created_at LIMIT 1)", [cli.id]);
          }
        });
      } else {
        return http.metodoNaoPermitido(res, ["GET", "POST", "PUT", "DELETE"]);
      }
      const r = await db.consulta("SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at", [cli.id]);
      return http.ok(res, { ok: true, enderecos: r.rows.map(enderecoPublico) });
    }

    /* --------------------------------------------------------- favoritos */
    if (p[0] === "favoritos") {
      if (m === "PUT") {
        const c = await http.corpo(req);
        const ids = Array.isArray(c.ids) ? Array.from(new Set(c.ids.map((x) => L.texto(x, 20)))).slice(0, 200) : [];
        await db.transacao(async (t) => {
          await t.query("DELETE FROM customer_favorites WHERE customer_id = $1", [cli.id]);
          if (ids.length) {
            await t.query("INSERT INTO customer_favorites (customer_id, product_id) SELECT $1, id FROM products WHERE id = ANY($2::text[]) ON CONFLICT DO NOTHING", [cli.id, ids]);
          }
        });
      } else if (m !== "GET") return http.metodoNaoPermitido(res, ["GET", "PUT"]);
      const r = await db.consulta("SELECT product_id FROM customer_favorites WHERE customer_id = $1 ORDER BY created_at", [cli.id]);
      return http.ok(res, { ok: true, ids: r.rows.map((x) => x.product_id) });
    }

    /* ---------------------------------------------------------- carrinho */
    if (p[0] === "carrinho") {
      if (m === "PUT") {
        const c = await http.corpo(req);
        await db.consulta(
          "INSERT INTO customer_carts (customer_id, items, updated_at) VALUES ($1,$2,now()) " +
          "ON CONFLICT (customer_id) DO UPDATE SET items = EXCLUDED.items, updated_at = now()",
          [cli.id, JSON.stringify(itensCarrinho(c.itens))]);
      } else if (m !== "GET") return http.metodoNaoPermitido(res, ["GET", "PUT"]);
      const r = await db.um("SELECT items, updated_at FROM customer_carts WHERE customer_id = $1", [cli.id]);
      return http.ok(res, { ok: true, itens: r ? r.items : [], atualizadoEm: r ? r.updated_at : null });
    }

    return http.erro(res, 404, "Rota não encontrada.");
  } catch (e) {
    return falhar(res, e);
  }
};
