/* ==========================================================================
   /api/admin/* — painel da proprietária e das atendentes (uma função só)
   --------------------------------------------------------------------------
   Sessão própria do painel (cookie pc_painel, Path=/api/admin, SameSite=
   Strict). Toda rota confere o papel no SERVIDOR — esconder botão na tela
   não é permissão.

   Nenhum dado de demonstração: tudo que o painel mostra vem do banco.
   ========================================================================== */

"use strict";

const crypto = require("crypto");
const http = require("./_lib/http");
const db = require("./_lib/db");
const E = require("./_lib/equipe");
const L = require("./_lib/loja");
const F = require("./_lib/frete");
const P = require("./_lib/pagamentos");
const falhar = require("./_lib/falha");

const neg = L.erroNegocio;
const T = L.texto;

function rota(req) {
  const u = new URL(req.url, "http://x");
  const r = (u.searchParams.get("rota") || u.pathname.replace(/^\/api\/admin\/?/, "")).replace(/^\/+|\/+$/g, "");
  return { p: r ? r.split("/") : [], q: u.searchParams };
}

function exigir(staff, recurso) {
  if (!E.pode(staff, recurso)) throw neg("Seu perfil não tem acesso a esta área.", 403);
}

function centavos(v, campo, permitirNulo) {
  if ((v === null || v === "" || v === undefined) && permitirNulo) return null;
  let n;
  if (typeof v === "number") n = Math.round(v);
  else {
    let t = String(v).trim().replace(/[R$\s]/g, "");
    /* vírgula = decimal brasileiro (pontos são milhar); sem vírgula, ponto com 1-2 casas = decimal */
    if (t.indexOf(",") > -1) t = t.replace(/\./g, "").replace(",", ".");
    else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
    n = Math.round(parseFloat(t) * 100);
  }
  if (!Number.isFinite(n) || n < 0) throw neg("Valor inválido" + (campo ? " em " + campo : "") + ".", 400, { campo });
  return n;
}
function numOuNulo(v) {
  if (v === null || v === "" || v === undefined) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function lista(v) {
  if (Array.isArray(v)) return v.map((x) => T(x, 60)).filter(Boolean);
  return String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
}
function periodo(q) {
  const ate = q.get("ate") ? new Date(q.get("ate") + "T23:59:59-03:00") : new Date();
  const de = q.get("de") ? new Date(q.get("de") + "T00:00:00-03:00") : new Date(ate.getTime() - 29 * 864e5);
  if (isNaN(de) || isNaN(ate)) throw neg("Período inválido.");
  return { de, ate };
}

/* ============================================================ autenticação */
async function configurarInicial(req, res) {
  const c = await http.corpo(req);
  const segredo = (process.env.ADMIN_SETUP_TOKEN || "").trim();
  if (!segredo) throw neg("Configuração inicial desativada: defina ADMIN_SETUP_TOKEN nas variáveis da Vercel.", 403);
  const a = Buffer.from(segredo), b = Buffer.from(String(c.token || ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw neg("Código de configuração inválido.", 403);
  const existe = await db.um("SELECT count(*)::int AS n FROM staff");
  if (existe.n > 0) throw neg("O painel já tem uma proprietária cadastrada. Entre com o seu e-mail.", 409);
  const nome = T(c.nome, 120), email = T(c.email, 160).toLowerCase();
  if (nome.length < 3) throw neg("Informe o nome.", 400, { campo: "nome" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw neg("E-mail inválido.", 400, { campo: "email" });
  if (!E.senhaAceitavel(c.senha)) throw neg("A senha precisa de 10+ caracteres, com letras e números.", 400, { campo: "senha" });
  await db.consulta("INSERT INTO staff (name, email, role, password_hash) VALUES ($1,$2,'proprietaria',$3)", [nome, email, await E.hash(c.senha)]);
  return http.criado(res, { ok: true });
}

async function entrar(req, res) {
  const c = await http.corpo(req);
  const r = await E.entrar(c.email, c.senha);
  if (!r) return http.erro(res, 401, "E-mail ou senha incorretos.");
  return http.ok(res, { ok: true, equipe: E.publico(r.staff), permissoes: E.PERMISSOES[r.staff.role] }, { "Set-Cookie": r.cookie });
}

/* ============================================================== dashboard */
async function dashboard() {
  const [at, pd, vendas, baixo, semPreco, semMedida] = await Promise.all([
    db.consulta("SELECT status, count(*)::int AS n FROM service_requests GROUP BY status"),
    db.consulta("SELECT status, count(*)::int AS n FROM orders GROUP BY status"),
    db.consulta(
      "SELECT coalesce(sum(total_cents) FILTER (WHERE paid_at >= date_trunc('day', now() AT TIME ZONE 'America/Recife') AT TIME ZONE 'America/Recife'),0)::int AS hoje, " +
      "coalesce(sum(total_cents) FILTER (WHERE paid_at >= now() - interval '7 days'),0)::int AS d7, " +
      "coalesce(sum(total_cents) FILTER (WHERE paid_at >= now() - interval '30 days'),0)::int AS d30, " +
      "count(*) FILTER (WHERE paid_at >= now() - interval '30 days')::int AS pedidos30 " +
      "FROM orders WHERE payment_status = 'aprovado'"),
    db.consulta("SELECT v.id, v.size, v.color, v.stock, p.id AS product_id, p.name FROM product_variants v JOIN products p ON p.id = v.product_id " +
      "WHERE v.active AND p.active AND v.stock IS NOT NULL AND v.stock <= 2 ORDER BY v.stock, p.position LIMIT 20"),
    db.um("SELECT count(*)::int AS n FROM products WHERE active AND price_cents IS NULL"),
    db.um("SELECT count(*)::int AS n FROM products WHERE active AND (weight_g IS NULL OR height_cm IS NULL OR width_cm IS NULL OR length_cm IS NULL)"),
  ]);
  const recentes = await db.consulta(
    "SELECT id, code, name, status, created_at, subtotal_cents FROM service_requests WHERE status IN ('aguardando_atendimento','em_atendimento') ORDER BY created_at LIMIT 8");
  return {
    atendimentos: Object.fromEntries(at.rows.map((r) => [r.status, r.n])),
    pedidos: Object.fromEntries(pd.rows.map((r) => [r.status, r.n])),
    vendas: vendas.rows[0],
    estoqueBaixo: baixo.rows,
    produtosSemPreco: semPreco.n,
    produtosSemMedida: semMedida.n,
    filaAtendimento: recentes.rows,
    integracoes: { pagamento: P.status(), frete: F.status() },
  };
}

/* =============================================================== produtos */
function lerProduto(c, parcial) {
  const d = {};
  if (!parcial || c.nome !== undefined) { d.name = T(c.nome, 140); if (d.name.length < 3) throw neg("Nome muito curto.", 400, { campo: "nome" }); }
  if (c.categoria !== undefined) d.category = T(c.categoria, 40);
  if (c.categorias !== undefined) d.categories = lista(c.categorias);
  if (c.cor !== undefined) d.color_name = T(c.cor, 60) || null;
  if (c.cores !== undefined) d.colors = lista(c.cores).filter((x) => /^#[0-9a-f]{3,8}$/i.test(x));
  if (c.selos !== undefined) d.badges = lista(c.selos);
  if (c.descricao !== undefined) d.description = T(c.descricao, 2000) || null;
  if (c.imagens !== undefined) d.images = lista(c.imagens).filter((x) => /^(https:\/\/|assets\/)/.test(x));
  if (c.preco !== undefined) d.price_cents = centavos(c.preco, "preco", true);
  if (c.precoDe !== undefined) d.compare_cents = centavos(c.precoDe, "precoDe", true);
  if (c.peso !== undefined) { const n = numOuNulo(c.peso); d.weight_g = n == null ? null : Math.round(n); }
  if (c.altura !== undefined) d.height_cm = numOuNulo(c.altura);
  if (c.largura !== undefined) d.width_cm = numOuNulo(c.largura);
  if (c.comprimento !== undefined) d.length_cm = numOuNulo(c.comprimento);
  if (c.ativo !== undefined) d.active = !!c.ativo;
  if (c.posicao !== undefined) d.position = L.inteiro(c.posicao, 0, 100000) || 0;
  return d;
}

async function salvarProduto(id, d) {
  const cols = Object.keys(d);
  if (!cols.length) return;
  const sets = cols.map((k, i) => k + " = $" + (i + 1));
  const r = await db.consulta("UPDATE products SET " + sets.join(", ") + ", updated_at = now() WHERE id = $" + (cols.length + 1),
    cols.map((k) => d[k]).concat([id]));
  if (!r.rowCount) throw neg("Produto não encontrado.", 404);
}

async function criarProduto(c) {
  const d = lerProduto(c, false);
  if (!d.category) throw neg("Escolha a categoria.", 400, { campo: "categoria" });
  const ult = await db.um("SELECT max(substring(id from 2)::int) AS n FROM products WHERE id ~ '^p[0-9]+$'");
  const id = "p" + String((ult.n || 0) + 1).padStart(2, "0");
  d.categories = d.categories && d.categories.length ? d.categories : [d.category];
  const cols = ["id"].concat(Object.keys(d));
  await db.transacao(async (t) => {
    await t.query("INSERT INTO products (" + cols.join(",") + ") VALUES (" + cols.map((_, i) => "$" + (i + 1)).join(",") + ")",
      [id].concat(Object.keys(d).map((k) => d[k])));
    const tams = lista(c.tamanhos).length ? lista(c.tamanhos) : L.TAMANHOS;
    for (const tam of tams) {
      await t.query("INSERT INTO product_variants (product_id, size, color) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, tam.toUpperCase(), d.color_name || ""]);
    }
  });
  return id;
}

/* ================================================================ estoque */
async function ajustarEstoque(staff, vid, c) {
  const modo = c.modo === "definir" ? "definir" : c.modo === "nao_controlar" ? "nao_controlar" : "ajuste";
  const motivo = T(c.motivo, 200) || (modo === "definir" ? "contagem" : "ajuste");
  return db.transacao(async (t) => {
    const v = (await t.query("SELECT * FROM product_variants WHERE id = $1 FOR UPDATE", [vid])).rows[0];
    if (!v) throw neg("Variação não encontrada.", 404);
    let novo, delta;
    if (modo === "nao_controlar") { novo = null; delta = 0; }
    else if (modo === "definir") { novo = L.inteiro(c.valor, 0, 100000); if (novo == null) throw neg("Quantidade inválida."); delta = novo - (v.stock || 0); }
    else {
      const d = parseInt(c.valor, 10);
      if (!Number.isFinite(d) || !d) throw neg("Informe quanto entra (+) ou sai (−).");
      novo = (v.stock || 0) + d; delta = d;
      if (novo < 0) throw neg("O estoque não pode ficar negativo.");
    }
    await t.query("UPDATE product_variants SET stock = $1, updated_at = now() WHERE id = $2", [novo, vid]);
    await t.query("INSERT INTO stock_movements (variant_id, delta, reason, ref_type, staff_id, note) VALUES ($1,$2,$3,'manual',$4,$5)",
      [vid, delta, modo === "nao_controlar" ? "deixou de controlar" : modo === "definir" ? "contagem" : "ajuste", staff.id, motivo]);
    return novo;
  });
}

/* ================================================================ pedidos */
async function detalhePedido(id) {
  const o = await db.um("SELECT o.*, s.name AS vendedor FROM orders o LEFT JOIN staff s ON s.id = o.sold_by WHERE o.id = $1", [id]);
  if (!o) throw neg("Pedido não encontrado.", 404);
  const [ev, tx, sol] = await Promise.all([
    db.consulta("SELECT e.*, s.name AS staff_nome FROM order_events e LEFT JOIN staff s ON s.id = e.staff_id WHERE order_id = $1 ORDER BY created_at", [id]),
    db.consulta("SELECT t.*, s.name AS staff_nome FROM payment_transactions t LEFT JOIN staff s ON s.id = t.staff_id WHERE order_id = $1 ORDER BY created_at", [id]),
    o.service_request_id ? db.um("SELECT id, code, status FROM service_requests WHERE id = $1", [o.service_request_id]) : null,
  ]);
  return { pedido: o, eventos: ev.rows, transacoes: tx.rows, atendimento: sol };
}

async function pagamentoManual(staff, id, c) {
  const metodo = T(c.metodo, 30);
  if (P.METODOS_MANUAIS.indexOf(metodo) < 0) throw neg("Escolha a forma de pagamento recebida.", 400, { campo: "metodo" });
  const valor = centavos(c.valor, "valor");
  const ref = T(c.referencia, 120);
  if (!ref) throw neg("Informe uma referência conferível (ID do Pix, NSU, código da transação).", 400, { campo: "referencia" });
  return db.transacao(async (t) => {
    const o = (await t.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!o) throw neg("Pedido não encontrado.", 404);
    if (o.status === "cancelado") throw neg("Pedido cancelado não recebe pagamento.");
    const ins = await t.query(
      "INSERT INTO payment_transactions (order_id, provider, provider_ref, method, status, amount_cents, staff_id, note) " +
      "VALUES ($1,'manual',$2,$3,'aprovado',$4,$5,$6) ON CONFLICT (provider, provider_ref) DO NOTHING RETURNING id",
      [id, o.code + ":" + ref, metodo, valor, staff.id, T(c.observacao, 300) || null]);
    if (!ins.rowCount) throw neg("Esta referência de pagamento já foi registrada.", 409);
    const pago = (await t.query("SELECT coalesce(sum(amount_cents),0)::int AS s FROM payment_transactions WHERE order_id = $1 AND status = 'aprovado'", [id])).rows[0].s;
    await L.evento(t, "order_events", "order_id", id, "pagamento", { metodo, valor, referencia: ref, manual: true, totalPago: pago }, staff.id);
    if (pago >= o.total_cents) return L.confirmarPagamento(t, o, { provider: "manual", ref, method: metodo }, staff.id);
    return o;
  });
}

/* ============================================================ atendimento */
async function detalheAtendimento(id) {
  const s = await db.um(
    "SELECT r.*, a.name AS atendente, v.name AS vendedor, o.code AS order_code, c.name AS cliente_nome, c.email AS cliente_email, c.whatsapp AS cliente_whatsapp " +
    "FROM service_requests r LEFT JOIN staff a ON a.id = r.assigned_to LEFT JOIN staff v ON v.id = r.sold_by " +
    "LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN customers c ON c.id = r.customer_id WHERE r.id = $1", [id]);
  if (!s) throw neg("Solicitação não encontrada.", 404);
  const ev = await db.consulta("SELECT e.*, st.name AS staff_nome FROM service_request_events e LEFT JOIN staff st ON st.id = e.staff_id WHERE request_id = $1 ORDER BY created_at", [id]);
  const ids = (s.items || []).map((l) => l.variant_id);
  const est = ids.length ? await db.consulta("SELECT id, stock FROM product_variants WHERE id = ANY($1::uuid[])", [ids]) : { rows: [] };
  const mapa = Object.fromEntries(est.rows.map((r) => [r.id, r.stock]));
  s.items = (s.items || []).map((l) => Object.assign({}, l, { estoqueAtual: mapa[l.variant_id] === undefined ? null : mapa[l.variant_id] }));
  return { atendimento: s, eventos: ev.rows, total: totalAtendimento(s) };
}

function totalAtendimento(s) {
  const semPreco = (s.items || []).some((l) => l.preco_unit == null);
  const sub = semPreco ? null : (s.items || []).reduce((a, l) => a + l.preco_unit * l.qtd, 0);
  return { subtotal: sub, desconto: s.discount_cents || 0, frete: s.shipping_cents, total: sub == null || s.shipping_cents == null ? null : Math.max(0, sub - (s.discount_cents || 0)) + s.shipping_cents, semPreco };
}

async function travarAtendimento(t, id) {
  const s = (await t.query("SELECT * FROM service_requests WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!s) throw neg("Solicitação não encontrada.", 404);
  return s;
}
function editavel(s) {
  if (s.order_id) throw neg("Esta solicitação já virou pedido. Altere pelo pedido.", 409);
  if (s.status === "cancelado" || s.status === "concluido") throw neg("Solicitação encerrada.", 409);
}

async function editarItensAtendimento(staff, id, c) {
  const pre = await L.precificar(c.itens, { permitirPrecoManual: true });
  return db.transacao(async (t) => {
    const s = await travarAtendimento(t, id); editavel(s);
    /* cupom já aplicado: recalcula o desconto sobre os itens novos (ou remove se não vale mais) */
    let desc = s.discount_cents || 0, cupom = s.coupon_code;
    if (cupom) {
      try { const cup = await L.aplicarCupom(cupom, pre.subtotal, s.shipping_cents, t); desc = cup.desconto; }
      catch (e) { if (!e.negocio) throw e; cupom = null; desc = 0; }
      await t.query("UPDATE service_requests SET discount_cents = $1, coupon_code = $2 WHERE id = $3", [desc, cupom, id]);
    }
    await t.query("UPDATE service_requests SET items = $1, subtotal_cents = $2, status = CASE WHEN status = 'aguardando_atendimento' THEN 'em_atendimento' ELSE status END, " +
      "assigned_to = COALESCE(assigned_to, $3), updated_at = now() WHERE id = $4", [JSON.stringify(pre.linhas), pre.subtotal, staff.id, id]);
    await L.evento(t, "service_request_events", "request_id", id, "itens",
      { antes: (s.items || []).map((l) => l.nome + " " + l.tam + " x" + l.qtd), depois: pre.linhas.map((l) => l.nome + " " + l.tam + " x" + l.qtd), subtotal: pre.subtotal }, staff.id);
    return pre;
  });
}

async function valoresAtendimento(staff, id, c) {
  return db.transacao(async (t) => {
    const s = await travarAtendimento(t, id); editavel(s);
    const sub = totalAtendimento(s).subtotal;
    let desconto = c.desconto !== undefined ? centavos(c.desconto || 0, "desconto") : s.discount_cents;
    let cupom = s.coupon_code;
    if (c.cupom !== undefined) {
      if (c.cupom) { const cup = await L.aplicarCupom(c.cupom, sub, s.shipping_cents, t); cupom = cup.codigo; desconto = cup.desconto; if (cup.freteGratis && c.frete === undefined) { c.frete = 0; c.freteTipo = c.freteTipo || (s.shipping && s.shipping.tipo) || "manual"; c.freteDescricao = c.freteDescricao || "Frete grátis (cupom " + cup.codigo + ")"; } }
      else cupom = null;
    }
    if (sub != null && desconto > sub) throw neg("O desconto não pode ser maior que o subtotal.");
    let frete = s.shipping_cents, envio = s.shipping;
    if (c.frete !== undefined) {
      frete = centavos(c.frete, "frete", true);
      envio = { tipo: T(c.freteTipo, 20) || "manual", nome: T(c.freteDescricao, 120) || "Frete combinado", id: T(c.freteId, 40) || null, servicoId: c.servicoId || null, prazo: L.inteiro(c.prazo, 0, 365), preco: frete };
    }
    await t.query("UPDATE service_requests SET discount_cents = $1, coupon_code = $2, shipping_cents = $3, shipping = $4, updated_at = now() WHERE id = $5",
      [desconto || 0, cupom, frete, envio ? JSON.stringify(envio) : null, id]);
    await L.evento(t, "service_request_events", "request_id", id, "valores", { desconto, cupom, frete, entrega: envio && envio.nome }, staff.id);
  });
}

async function converterAtendimento(staff, id, c) {
  const contatoBase = c.contato || {};
  return db.transacao(async (t) => {
    const s = await travarAtendimento(t, id); editavel(s);
    const tot = totalAtendimento(s);
    if (tot.semPreco) throw neg("Defina o valor de todas as peças antes de gerar o pedido.", 409);
    if (s.shipping_cents == null) throw neg("Defina o frete (pode ser R$ 0,00 para retirada) antes de gerar o pedido.", 409);
    const contato = L.validarContato({ nome: contatoBase.nome || s.name, fone: contatoBase.fone || s.phone, email: contatoBase.email || s.email });
    const tipo = s.shipping && s.shipping.tipo;
    const endereco = tipo === "retirada" ? null : (c.endereco ? L.validarEndereco(c.endereco) : null);
    if (tipo === "melhorenvio" && !endereco) throw neg("Informe o endereço de entrega.", 400, { campo: "cep" });
    /* Revalida estoque controlado no momento da conversão. */
    for (const l of s.items) {
      const v = (await t.query("SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE", [l.variant_id])).rows[0];
      if (v && v.stock !== null && v.stock < l.qtd) throw neg("Estoque insuficiente de " + l.nome + " (" + l.tam + "): " + v.stock + " disponível.", 409);
    }
    const o = await L.inserirPedido(t, {
      customer_id: s.customer_id, channel: "atendimento", service_request_id: s.id, payment_method: T(c.metodo, 30) || null,
      name: contato.nome, phone: contato.fone, email: contato.email, address: endereco,
      items: s.items.map((l) => { const x = Object.assign({}, l); delete x.estoqueAtual; x.total = x.preco_unit * x.qtd; return x; }),
      subtotal: tot.subtotal, discount: tot.desconto, shipping_cents: s.shipping_cents, total: tot.total,
      coupon_code: s.coupon_code, shipping: s.shipping, sold_by: staff.id, notes: s.notes, stock_committed: true,
    });
    await L.baixarEstoque(t, s.items, { tipo: "order", id: o.code }, staff.id);
    if (s.coupon_code) await t.query("UPDATE coupons SET uses = uses + 1 WHERE code = $1", [s.coupon_code]);
    await t.query("UPDATE service_requests SET order_id = $1, sold_by = $2, status = 'aguardando_pagamento', updated_at = now() WHERE id = $3", [o.id, staff.id, s.id]);
    await L.evento(t, "service_request_events", "request_id", s.id, "pedido", { pedido: o.code, total: o.total_cents }, staff.id);
    await L.evento(t, "order_events", "order_id", o.id, "criado", { canal: "atendimento", atendimento: s.code }, staff.id);
    return o;
  });
}

function resumoAtendimento(s, pedido) {
  const tot = totalAtendimento(s);
  const l = ["*Resumo do seu pedido — Preta Chik*", "Solicitação " + s.code + (pedido ? " · Pedido " + pedido.code : ""), ""];
  s.items.forEach((i, n) => l.push((n + 1) + ". " + i.nome + " — Tam. " + i.tam + (i.cor ? " · " + i.cor : "") + " · " + i.qtd + "x " + L.reais(i.preco_unit)));
  l.push("");
  l.push("Subtotal: " + L.reais(tot.subtotal));
  if (tot.desconto) l.push("Desconto: − " + L.reais(tot.desconto));
  l.push("Entrega: " + (s.shipping ? s.shipping.nome + " · " : "") + L.reais(s.shipping_cents));
  l.push("*Total: " + L.reais(tot.total) + "*");
  if (pedido && pedido.payment_link) { l.push(""); l.push("Link de pagamento: " + pedido.payment_link); }
  return l.join("\n");
}

/* =============================================================== roteador */
module.exports = async function handler(req, res) {
  const { p, q } = rota(req);
  const m = String(req.method || "GET").toUpperCase();
  try {
    /* -------- rotas sem sessão */
    if (p[0] === "configurar-inicial" && m === "GET") {
      const n = await db.um("SELECT count(*)::int AS n FROM staff");
      return http.ok(res, { ok: true, precisa: n.n === 0, habilitado: !!(process.env.ADMIN_SETUP_TOKEN || "").trim() });
    }
    if (p[0] === "configurar-inicial" && m === "POST") return await configurarInicial(req, res);
    if (p[0] === "entrar" && m === "POST") return await entrar(req, res);
    if (p[0] === "sair" && m === "POST") { await E.sair(req); return http.ok(res, { ok: true }, { "Set-Cookie": E.cookieSaida() }); }

    const staff = await E.atual(req);
    if (!staff) return http.erro(res, 401, "Entre no painel para continuar.");
    const ok = (d) => http.ok(res, Object.assign({ ok: true }, d || {}));

    if (p[0] === "eu") return ok({ equipe: E.publico(staff), permissoes: E.PERMISSOES[staff.role] });

    /* -------- dashboard */
    if (p[0] === "dashboard") { exigir(staff, "dashboard"); return ok(await dashboard()); }

    /* -------- categorias */
    if (p[0] === "categorias") {
      if (m === "GET") { exigir(staff, "produtos:ler"); return ok({ categorias: (await db.consulta("SELECT * FROM categories ORDER BY position, name")).rows }); }
      exigir(staff, "produtos");
      const c = await http.corpo(req);
      const nome = T(c.nome, 60);
      if (nome.length < 2) throw neg("Nome da categoria muito curto.");
      if (m === "POST") {
        const slug = T(c.slug, 40) || nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        await db.consulta("INSERT INTO categories (slug, name, position, is_showcase) VALUES ($1,$2,$3,$4)", [slug, nome, L.inteiro(c.posicao, 0, 999) || 0, !!c.vitrine]);
      } else if (m === "PUT" && p[1]) {
        await db.consulta("UPDATE categories SET name = $1, position = $2, is_showcase = $3, active = $4 WHERE slug = $5", [nome, L.inteiro(c.posicao, 0, 999) || 0, !!c.vitrine, c.ativo !== false, p[1]]);
      }
      return ok({ categorias: (await db.consulta("SELECT * FROM categories ORDER BY position, name")).rows });
    }

    /* -------- produtos e variações */
    if (p[0] === "produtos") {
      if (m === "GET" && !p[1]) { exigir(staff, "produtos:ler"); return ok({ produtos: await L.catalogo() }); }
      exigir(staff, "produtos");
      if (m === "POST" && !p[1]) { const id = await criarProduto(await http.corpo(req)); return ok({ id }); }
      if (m === "PUT" && p[1] && !p[2]) { await salvarProduto(p[1], lerProduto(await http.corpo(req), true)); return ok({ produto: (await L.catalogo()).find((x) => x.id === p[1]) }); }
      if (m === "POST" && p[1] && p[2] === "variantes") {
        const c = await http.corpo(req);
        const tam = T(c.tamanho, 6).toUpperCase();
        if (!tam) throw neg("Informe o tamanho.");
        try {
          await db.consulta("INSERT INTO product_variants (product_id, size, color, sku, stock) VALUES ($1,$2,$3,$4,$5)",
            [p[1], tam, T(c.cor, 60), T(c.sku, 60) || null, c.estoque === "" || c.estoque == null ? null : L.inteiro(c.estoque, 0, 100000)]);
        } catch (e) { if (e.code === "23505") throw neg("Esta peça já tem o tamanho " + tam + " nessa cor.", 409); throw e; }
        return ok({ produto: (await L.catalogo()).find((x) => x.id === p[1]) });
      }
    }
    if (p[0] === "variantes" && p[1] && m === "PUT") {
      exigir(staff, "produtos");
      const c = await http.corpo(req);
      await db.consulta("UPDATE product_variants SET active = COALESCE($1, active), sku = COALESCE($2, sku), updated_at = now() WHERE id = $3",
        [c.ativo === undefined ? null : !!c.ativo, c.sku === undefined ? null : T(c.sku, 60), p[1]]);
      return ok();
    }

    /* -------- estoque */
    if (p[0] === "estoque") {
      exigir(staff, "estoque");
      if (m === "GET" && p[1] === "movimentos") {
        const r = await db.consulta("SELECT m.*, v.size, v.color, p.name AS produto, s.name AS staff_nome FROM stock_movements m " +
          "JOIN product_variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id LEFT JOIN staff s ON s.id = m.staff_id ORDER BY m.created_at DESC LIMIT 200");
        return ok({ movimentos: r.rows });
      }
      if (m === "GET") {
        const r = await db.consulta("SELECT v.*, p.name AS produto, p.active AS produto_ativo FROM product_variants v JOIN products p ON p.id = v.product_id " +
          "ORDER BY p.position, array_position(ARRAY['PP','P','M','G','GG']::text[], v.size)");
        return ok({ variantes: r.rows });
      }
      if (m === "POST" && p[1]) { const novo = await ajustarEstoque(staff, p[1], await http.corpo(req)); return ok({ estoque: novo }); }
    }

    /* -------- pedidos */
    if (p[0] === "pedidos") {
      exigir(staff, "pedidos");
      if (m === "GET" && !p[1]) {
        const filtros = [], args = [];
        if (q.get("status")) { args.push(q.get("status")); filtros.push("o.status = $" + args.length); }
        if (q.get("canal")) { args.push(q.get("canal")); filtros.push("o.channel = $" + args.length); }
        if (q.get("q")) { args.push("%" + T(q.get("q"), 80) + "%"); filtros.push("(o.code ILIKE $" + args.length + " OR o.name ILIKE $" + args.length + " OR o.phone ILIKE $" + args.length + ")"); }
        const r = await db.consulta("SELECT o.id, o.code, o.channel, o.status, o.payment_status, o.name, o.phone, o.total_cents, o.created_at, o.tracking_code, o.shipping->>'nome' AS entrega, s.name AS vendedor " +
          "FROM orders o LEFT JOIN staff s ON s.id = o.sold_by " + (filtros.length ? "WHERE " + filtros.join(" AND ") : "") + " ORDER BY o.created_at DESC LIMIT 300", args);
        return ok({ pedidos: r.rows, status: L.STATUS_PEDIDO });
      }
      if (m === "GET" && p[1]) return ok(await detalhePedido(p[1]));
      const c = await http.corpo(req);
      if (p[2] === "status") {
        if (c.status === "reembolsado") exigir(staff, "financeiro");
        await db.transacao(async (t) => {
          const o = (await t.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [p[1]])).rows[0];
          if (!o) throw neg("Pedido não encontrado.", 404);
          if (["pago", "em_separacao", "enviado", "entregue", "concluido"].indexOf(c.status) > -1 && o.payment_status !== "aprovado") {
            throw neg("Registre ou confirme o pagamento antes de avançar o pedido.", 409);
          }
          await L.mudarStatusPedido(t, o, c.status, staff.id, { motivo: T(c.motivo, 200) || null });
        });
        return ok(await detalhePedido(p[1]));
      }
      if (p[2] === "pagamento") { await pagamentoManual(staff, p[1], c); return ok(await detalhePedido(p[1])); }
      if (p[2] === "link-pagamento") {
        const ad = P.adaptador();
        if (!ad) throw neg("Nenhuma plataforma de pagamento conectada. " + P.status().observacao, 409);
        const o = await db.um("SELECT * FROM orders WHERE id = $1", [p[1]]);
        if (!o) throw neg("Pedido não encontrado.", 404);
        const cob = await ad.criarCobranca(o, { metodo: T(c.metodo, 30) || null });
        await db.consulta("UPDATE orders SET payment_provider = $1, payment_ref = $2, payment_link = $3, updated_at = now() WHERE id = $4", [ad.nome, cob.ref, cob.link || null, o.id]);
        await db.consulta("INSERT INTO payment_transactions (order_id, provider, provider_ref, method, status, amount_cents, staff_id) VALUES ($1,$2,$3,$4,'pendente',$5,$6) ON CONFLICT DO NOTHING",
          [o.id, ad.nome, cob.ref, T(c.metodo, 30) || null, o.total_cents, staff.id]);
        return ok(await detalhePedido(p[1]));
      }
      if (p[2] === "reembolso") {
        exigir(staff, "financeiro");
        const o = await db.um("SELECT * FROM orders WHERE id = $1", [p[1]]);
        if (!o) throw neg("Pedido não encontrado.", 404);
        if (o.payment_status !== "aprovado") throw neg("Só é possível reembolsar pedido com pagamento aprovado. Para pedido não pago, use Cancelar.", 409);
        const ad = o.payment_provider && o.payment_provider !== "manual" ? P.adaptador(o.payment_provider) : null;
        if (ad && ad.suporta.reembolso) await ad.reembolsar(o.payment_ref, o.total_cents);
        else if (!T(c.referencia, 120)) throw neg("Reembolso manual: informe a referência da devolução feita na plataforma da loja.", 400, { campo: "referencia" });
        await db.transacao(async (t) => {
          const atual = (await t.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [o.id])).rows[0];
          await t.query("UPDATE orders SET payment_status = 'estornado' WHERE id = $1", [o.id]);
          await t.query("INSERT INTO payment_transactions (order_id, provider, provider_ref, method, status, amount_cents, staff_id, note) VALUES ($1,$2,$3,'reembolso','estornado',$4,$5,$6) ON CONFLICT DO NOTHING",
            [o.id, ad ? ad.nome : "manual", o.code + ":reembolso:" + (T(c.referencia, 120) || Date.now()), o.total_cents, staff.id, T(c.observacao, 300) || null]);
          await L.mudarStatusPedido(t, atual, "reembolsado", staff.id, { referencia: T(c.referencia, 120) || null });
        });
        return ok(await detalhePedido(p[1]));
      }
      if (p[2] === "rastreio") {
        const codigo = T(c.codigo, 40).toUpperCase();
        if (!codigo) throw neg("Informe o código de rastreio.", 400, { campo: "codigo" });
        await db.transacao(async (t) => {
          const o = (await t.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [p[1]])).rows[0];
          if (!o) throw neg("Pedido não encontrado.", 404);
          await t.query("UPDATE orders SET tracking_code = $1, tracking_url = $2, updated_at = now() WHERE id = $3", [codigo, T(c.url, 300) || null, p[1]]);
          await L.evento(t, "order_events", "order_id", p[1], "envio", { rastreio: codigo }, staff.id);
          if (o.payment_status === "aprovado" && ["pago", "em_separacao"].indexOf(o.status) > -1) await L.mudarStatusPedido(t, o, "enviado", staff.id);
        });
        return ok(await detalhePedido(p[1]));
      }
      if (p[2] === "etiqueta") {
        exigir(staff, "entregas");
        const o = await db.um("SELECT * FROM orders WHERE id = $1", [p[1]]);
        if (!o) throw neg("Pedido não encontrado.", 404);
        if (o.payment_status !== "aprovado") throw neg("Gere a etiqueta só depois do pagamento confirmado.", 409);
        if (o.shipping_label_id) throw neg("Este pedido já tem etiqueta (" + o.shipping_label_id + ").", 409);
        const et = await F.gerarEtiqueta(o);
        await db.consulta("UPDATE orders SET shipping_label_id = $1, updated_at = now() WHERE id = $2", [et.etiquetaId, o.id]);
        await db.consulta("INSERT INTO order_events (order_id, kind, detail, staff_id) VALUES ($1,'etiqueta',$2,$3)", [o.id, JSON.stringify(et), staff.id]);
        return ok(Object.assign(await detalhePedido(p[1]), { etiqueta: et }));
      }
      if (p[2] === "rastrear") {
        const o = await db.um("SELECT * FROM orders WHERE id = $1", [p[1]]);
        if (!o || !o.shipping_label_id) throw neg("Pedido sem etiqueta do Melhor Envio.", 409);
        const r = await F.rastrear(o.shipping_label_id);
        if (r && r.codigo && r.codigo !== o.tracking_code) await db.consulta("UPDATE orders SET tracking_code = $1, updated_at = now() WHERE id = $2", [r.codigo, o.id]);
        return ok(Object.assign(await detalhePedido(p[1]), { rastreio: r }));
      }
      if (p[2] === "nota") {
        const txt = T(c.texto, 1000);
        if (!txt) throw neg("Escreva a observação.");
        await db.consulta("INSERT INTO order_events (order_id, kind, detail, staff_id) VALUES ($1,'nota',$2,$3)", [p[1], JSON.stringify({ texto: txt }), staff.id]);
        return ok(await detalhePedido(p[1]));
      }
    }

    /* -------- atendimento exclusivo */
    if (p[0] === "atendimentos") {
      exigir(staff, "atendimento");
      if (m === "GET" && !p[1]) {
        const args = [], filtros = [];
        if (q.get("status")) { args.push(q.get("status")); filtros.push("r.status = $" + args.length); }
        if (q.get("q")) { args.push("%" + T(q.get("q"), 80) + "%"); filtros.push("(r.code ILIKE $" + args.length + " OR r.name ILIKE $" + args.length + " OR r.phone ILIKE $" + args.length + ")"); }
        const r = await db.consulta("SELECT r.id, r.code, r.name, r.phone, r.status, r.subtotal_cents, r.created_at, r.updated_at, jsonb_array_length(r.items) AS itens, " +
          "a.name AS atendente, o.code AS order_code FROM service_requests r LEFT JOIN staff a ON a.id = r.assigned_to LEFT JOIN orders o ON o.id = r.order_id " +
          (filtros.length ? "WHERE " + filtros.join(" AND ") : "") + " ORDER BY (r.status IN ('concluido','cancelado')), r.created_at DESC LIMIT 300", args);
        return ok({ atendimentos: r.rows, status: L.STATUS_ATENDIMENTO });
      }
      if (m === "GET" && p[1] && !p[2]) return ok(await detalheAtendimento(p[1]));
      if (m === "GET" && p[2] === "resumo") {
        const d = await detalheAtendimento(p[1]);
        const pedido = d.atendimento.order_id ? await db.um("SELECT * FROM orders WHERE id = $1", [d.atendimento.order_id]) : null;
        const texto = resumoAtendimento(d.atendimento, pedido);
        const fone = L.digitos(d.atendimento.phone);
        return ok({ texto, whatsappUrl: fone ? "https://wa.me/" + (fone.length <= 11 ? "55" + fone : fone) + "?text=" + encodeURIComponent(texto) : null });
      }
      const c = await http.corpo(req);
      if (p[2] === "assumir") {
        await db.transacao(async (t) => {
          const s = await travarAtendimento(t, p[1]);
          await t.query("UPDATE service_requests SET assigned_to = $1, status = CASE WHEN status = 'aguardando_atendimento' THEN 'em_atendimento' ELSE status END, updated_at = now() WHERE id = $2", [staff.id, s.id]);
          await L.evento(t, "service_request_events", "request_id", s.id, "assumido", { por: staff.name }, staff.id);
        });
      } else if (p[2] === "itens") await editarItensAtendimento(staff, p[1], c);
      else if (p[2] === "valores") await valoresAtendimento(staff, p[1], c);
      else if (p[2] === "frete") {
        const s = await db.um("SELECT * FROM service_requests WHERE id = $1", [p[1]]);
        if (!s) throw neg("Solicitação não encontrada.", 404);
        const pre = await L.precificar(s.items.map((l) => ({ id: l.product_id, tam: l.tam, cor: l.cor, qtd: l.qtd })), {});
        const r = await F.cotar(c.cep || s.cep, pre.linhas);
        if (L.digitos(c.cep).length === 8) await db.consulta("UPDATE service_requests SET cep = $1 WHERE id = $2", [L.digitos(c.cep), s.id]);
        return ok({ cotacao: r });
      } else if (p[2] === "status") {
        if (!L.STATUS_ATENDIMENTO[c.status]) throw neg("Status inválido.");
        await db.transacao(async (t) => {
          const s = await travarAtendimento(t, p[1]);
          if (s.order_id && c.status !== "cancelado") throw neg("Com pedido gerado, o status acompanha o pedido. Altere pelo pedido.", 409);
          if (s.order_id && c.status === "cancelado") {
            const o = (await t.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [s.order_id])).rows[0];
            if (o && o.status !== "cancelado") await L.mudarStatusPedido(t, o, "cancelado", staff.id, { motivo: "atendimento cancelado" });
          }
          await t.query("UPDATE service_requests SET status = $1, updated_at = now() WHERE id = $2", [c.status, s.id]);
          await L.evento(t, "service_request_events", "request_id", s.id, "status", { de: s.status, para: c.status, motivo: T(c.motivo, 200) || null }, staff.id);
        });
      } else if (p[2] === "nota") {
        const txt = T(c.texto, 1000);
        if (!txt) throw neg("Escreva a observação.");
        await db.transacao(async (t) => {
          const s = await travarAtendimento(t, p[1]);
          const novo = (s.notes ? s.notes + "\n" : "") + "[" + new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" }) + " · " + staff.name + "] " + txt;
          await t.query("UPDATE service_requests SET notes = $1, updated_at = now() WHERE id = $2", [novo.slice(-8000), s.id]);
          await L.evento(t, "service_request_events", "request_id", s.id, "nota", { texto: txt }, staff.id);
        });
      } else if (p[2] === "contato") {
        const ct = L.validarContato(c);
        await db.consulta("UPDATE service_requests SET name = $1, phone = $2, email = $3, updated_at = now() WHERE id = $4", [ct.nome, ct.fone, ct.email, p[1]]);
      } else if (p[2] === "converter") {
        const o = await converterAtendimento(staff, p[1], c);
        return ok(Object.assign(await detalheAtendimento(p[1]), { pedidoId: o.id, pedidoCodigo: o.code }));
      } else return http.erro(res, 404, "Rota não encontrada.");
      return ok(await detalheAtendimento(p[1]));
    }

    /* -------- clientes */
    if (p[0] === "clientes") {
      exigir(staff, "clientes");
      if (!p[1]) {
        const args = []; let where = "";
        if (q.get("q")) { args.push("%" + T(q.get("q"), 80) + "%"); where = "WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.whatsapp ILIKE $1"; }
        const r = await db.consulta("SELECT c.id, c.name, c.email, c.whatsapp, c.\"createdAt\" AS criado, " +
          "(SELECT count(*) FROM orders o WHERE o.customer_id = c.id)::int AS pedidos, " +
          "(SELECT coalesce(sum(total_cents),0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'aprovado')::int AS gasto, " +
          "(SELECT count(*) FROM service_requests s WHERE s.customer_id = c.id)::int AS atendimentos " +
          "FROM customers c " + where + " ORDER BY c.\"createdAt\" DESC LIMIT 300", args);
        return ok({ clientes: r.rows });
      }
      const c = await db.um("SELECT id, name, email, whatsapp, birth_date, \"createdAt\" AS criado FROM customers WHERE id = $1", [p[1]]);
      if (!c) throw neg("Cliente não encontrada.", 404);
      const [o, s, e] = await Promise.all([
        db.consulta("SELECT id, code, status, payment_status, total_cents, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC", [p[1]]),
        db.consulta("SELECT id, code, status, created_at FROM service_requests WHERE customer_id = $1 ORDER BY created_at DESC", [p[1]]),
        db.consulta("SELECT * FROM customer_addresses WHERE customer_id = $1", [p[1]]),
      ]);
      return ok({ cliente: c, pedidos: o.rows, atendimentos: s.rows, enderecos: e.rows });
    }

    /* -------- financeiro */
    if (p[0] === "financeiro") {
      exigir(staff, "financeiro");
      const { de, ate } = periodo(q);
      const [tx, met, resumo] = await Promise.all([
        db.consulta("SELECT t.*, o.code AS pedido, s.name AS staff_nome FROM payment_transactions t LEFT JOIN orders o ON o.id = t.order_id LEFT JOIN staff s ON s.id = t.staff_id " +
          "WHERE t.created_at BETWEEN $1 AND $2 ORDER BY t.created_at DESC LIMIT 500", [de, ate]),
        db.consulta("SELECT coalesce(method,'—') AS metodo, provider, count(*)::int AS n, sum(amount_cents)::int AS total FROM payment_transactions " +
          "WHERE status = 'aprovado' AND created_at BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY total DESC", [de, ate]),
        db.um("SELECT coalesce(sum(total_cents) FILTER (WHERE payment_status = 'aprovado'),0)::int AS recebido, " +
          "coalesce(sum(total_cents) FILTER (WHERE payment_status = 'pendente' AND status <> 'cancelado'),0)::int AS a_receber, " +
          "coalesce(sum(total_cents) FILTER (WHERE payment_status = 'estornado'),0)::int AS estornado, " +
          "coalesce(sum(discount_cents) FILTER (WHERE payment_status = 'aprovado'),0)::int AS descontos, " +
          "coalesce(sum(shipping_cents) FILTER (WHERE payment_status = 'aprovado'),0)::int AS fretes " +
          "FROM orders WHERE created_at BETWEEN $1 AND $2", [de, ate]),
      ]);
      return ok({ de, ate, transacoes: tx.rows, porMetodo: met.rows, resumo, provedor: P.status() });
    }

    /* -------- cupons */
    if (p[0] === "cupons") {
      exigir(staff, "cupons");
      if (m !== "GET") {
        const c = await http.corpo(req);
        const code = T(p[1] || c.codigo, 40).toUpperCase().replace(/\s+/g, "");
        if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw neg("Código do cupom: 3 a 40 letras/números.", 400, { campo: "codigo" });
        const kind = ["percent", "fixed", "frete"].indexOf(c.tipo) > -1 ? c.tipo : null;
        if (!kind) throw neg("Escolha o tipo do cupom.", 400, { campo: "tipo" });
        const valor = kind === "percent" ? L.inteiro(c.valor, 1, 100) : kind === "fixed" ? centavos(c.valor, "valor") : 0;
        if (valor == null) throw neg("Valor inválido.", 400, { campo: "valor" });
        const args = [code, kind, valor, c.minimo ? centavos(c.minimo, "minimo") : 0, c.maxUsos ? L.inteiro(c.maxUsos, 1, 1e6) : null,
          c.inicio || null, c.fim || null, c.ativo !== false];
        if (m === "POST") await db.consulta("INSERT INTO coupons (code, kind, value, min_cents, max_uses, starts_at, ends_at, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", args);
        else await db.consulta("UPDATE coupons SET kind=$2, value=$3, min_cents=$4, max_uses=$5, starts_at=$6, ends_at=$7, active=$8 WHERE code=$1", args);
      }
      return ok({ cupons: (await db.consulta("SELECT * FROM coupons ORDER BY created_at DESC")).rows });
    }

    /* -------- entregas */
    if (p[0] === "entregas") {
      exigir(staff, "entregas");
      const r = await db.consulta("SELECT id, code, name, status, payment_status, shipping, address->>'cidade' AS cidade, address->>'uf' AS uf, tracking_code, shipping_label_id, created_at " +
        "FROM orders WHERE status IN ('pago','em_separacao','enviado') OR (status = 'aguardando_pagamento' AND channel = 'atendimento') ORDER BY created_at");
      return ok({ entregas: r.rows, frete: F.status() });
    }

    /* -------- configurações */
    if (p[0] === "config") {
      exigir(staff, "config");
      if (m === "PUT" && p[1]) {
        const permitidas = ["loja", "frete", "remetente"];
        if (permitidas.indexOf(p[1]) < 0) throw neg("Ajuste desconhecido.");
        const c = await http.corpo(req);
        const limpo = {};
        for (const k of Object.keys(c).slice(0, 30)) limpo[k] = typeof c[k] === "boolean" ? c[k] : T(c[k], 200);
        if (p[1] === "loja" && limpo.whatsapp && !/^\d{12,13}$/.test(L.digitos(limpo.whatsapp))) throw neg("WhatsApp com DDI e DDD, só números (ex.: 5581999999999).", 400, { campo: "whatsapp" });
        if (p[1] === "frete" && limpo.cep_origem && L.digitos(limpo.cep_origem).length !== 8) throw neg("CEP de origem inválido.", 400, { campo: "cep_origem" });
        await db.consulta("INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value, updated_at = now()", [p[1], JSON.stringify(limpo)]);
      }
      const r = await db.consulta("SELECT key, value FROM settings");
      return ok({ ajustes: Object.fromEntries(r.rows.map((x) => [x.key, x.value])), integracoes: { pagamento: P.status(), frete: F.status() } });
    }

    /* -------- relatórios */
    if (p[0] === "relatorios") {
      exigir(staff, "relatorios");
      const { de, ate } = periodo(q);
      const [dia, prod, canal, vend] = await Promise.all([
        db.consulta("SELECT to_char(paid_at AT TIME ZONE 'America/Recife','YYYY-MM-DD') AS dia, count(*)::int AS pedidos, sum(total_cents)::int AS total FROM orders " +
          "WHERE payment_status = 'aprovado' AND paid_at BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1", [de, ate]),
        db.consulta("SELECT i->>'product_id' AS id, i->>'nome' AS nome, sum((i->>'qtd')::int)::int AS qtd, sum((i->>'total')::int)::int AS total FROM orders, jsonb_array_elements(items) i " +
          "WHERE payment_status = 'aprovado' AND paid_at BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY qtd DESC LIMIT 50", [de, ate]),
        db.consulta("SELECT channel, count(*)::int AS pedidos, sum(total_cents)::int AS total FROM orders WHERE payment_status = 'aprovado' AND paid_at BETWEEN $1 AND $2 GROUP BY 1", [de, ate]),
        db.consulta("SELECT coalesce(s.name,'Site (sem atendente)') AS vendedor, count(*)::int AS pedidos, sum(o.total_cents)::int AS total FROM orders o LEFT JOIN staff s ON s.id = o.sold_by " +
          "WHERE o.payment_status = 'aprovado' AND o.paid_at BETWEEN $1 AND $2 GROUP BY 1 ORDER BY total DESC", [de, ate]),
      ]);
      return ok({ de, ate, porDia: dia.rows, porProduto: prod.rows, porCanal: canal.rows, porVendedor: vend.rows });
    }

    /* -------- equipe */
    if (p[0] === "equipe") {
      exigir(staff, "equipe");
      if (m === "POST") {
        const c = await http.corpo(req);
        const nome = T(c.nome, 120), email = T(c.email, 160).toLowerCase();
        if (nome.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw neg("Nome e e-mail válidos são obrigatórios.");
        if (!E.senhaAceitavel(c.senha)) throw neg("Senha inicial: 10+ caracteres, com letras e números.", 400, { campo: "senha" });
        try {
          await db.consulta("INSERT INTO staff (name, email, role, password_hash) VALUES ($1,$2,$3,$4)", [nome, email, c.papel === "proprietaria" ? "proprietaria" : "atendente", await E.hash(c.senha)]);
        } catch (e) { if (e.code === "23505") throw neg("Já existe alguém com este e-mail.", 409); throw e; }
      } else if (m === "PUT" && p[1]) {
        const c = await http.corpo(req);
        if (p[1] === staff.id && (c.ativo === false || c.papel === "atendente")) throw neg("Você não pode rebaixar ou desativar a sua própria conta.");
        if (c.senha) {
          if (!E.senhaAceitavel(c.senha)) throw neg("Senha: 10+ caracteres, com letras e números.", 400, { campo: "senha" });
          await db.consulta("UPDATE staff SET password_hash = $1, updated_at = now() WHERE id = $2", [await E.hash(c.senha), p[1]]);
          await db.consulta("DELETE FROM staff_sessions WHERE staff_id = $1", [p[1]]);
        }
        await db.consulta("UPDATE staff SET role = COALESCE($1, role), active = COALESCE($2, active), updated_at = now() WHERE id = $3",
          [c.papel === "proprietaria" || c.papel === "atendente" ? c.papel : null, c.ativo === undefined ? null : !!c.ativo, p[1]]);
        if (c.ativo === false) await db.consulta("DELETE FROM staff_sessions WHERE staff_id = $1", [p[1]]);
      }
      const r = await db.consulta("SELECT id, name, email, role, active, created_at FROM staff ORDER BY created_at");
      return ok({ equipe: r.rows.map((s) => ({ id: s.id, nome: s.name, email: s.email, papel: s.role, ativo: s.active, desde: s.created_at })) });
    }

    return http.erro(res, 404, "Rota não encontrada.");
  } catch (e) {
    return falhar(res, e);
  }
};
