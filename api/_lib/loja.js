/* ==========================================================================
   api/_lib/loja.js — regras de negócio da loja
   --------------------------------------------------------------------------
   REGRAS QUE ESTE ARQUIVO GARANTE:

   1. PREÇO E ESTOQUE SÃO DO SERVIDOR. O navegador manda só "qual peça,
      qual tamanho, quantas". Valor, desconto e frete são recalculados aqui.
   2. SEM PREÇO CADASTRADO, NÃO HÁ COBRANÇA PELO SITE. A peça segue pelo
      atendimento exclusivo, onde a loja informa o valor.
   3. ESTOQUE NUNCA FICA NEGATIVO. A baixa usa UPDATE ... WHERE stock >= qtd
      dentro de transação: duas compras simultâneas da última peça não
      passam as duas.
   4. NADA É DUPLICADO. Pedido e atendimento aceitam `idempotency_key`:
      clicar duas vezes no botão devolve o mesmo registro.
   5. ABRIR O WHATSAPP NÃO MUDA STATUS. Quem anda com o atendimento é o
      painel.
   ========================================================================== */

"use strict";

const crypto = require("crypto");
const db = require("./db");

/* Aceita um cliente de transação (tem .query) ou usa o pool via db.consulta. */
const POOL = { query: (sql, p) => db.consulta(sql, p) };

const TAMANHOS = ["PP", "P", "M", "G", "GG"];

const STATUS_ATENDIMENTO = {
  aguardando_atendimento: "Aguardando atendimento",
  em_atendimento: "Em atendimento",
  aguardando_confirmacao: "Aguardando confirmação",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_separacao: "Em separação",
  enviado: "Enviado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_PEDIDO = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_separacao: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  concluido: "Concluído",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
};

/* Quando o pedido muda, o atendimento que o originou acompanha. */
const PEDIDO_PARA_ATENDIMENTO = {
  aguardando_pagamento: "aguardando_pagamento",
  pago: "pago",
  em_separacao: "em_separacao",
  enviado: "enviado",
  entregue: "concluido",
  concluido: "concluido",
  cancelado: "cancelado",
  reembolsado: "cancelado",
};

/* ------------------------------------------------------------- utilidades */
function erroNegocio(mensagem, status, extra) {
  const e = new Error(mensagem);
  e.negocio = true;
  e.status = status || 400;
  if (extra) e.extra = extra;
  return e;
}

/* Código curto e legível, sem letras ambíguas (0/O, 1/I). */
function gerarCodigo(prefixo) {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const b = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += alfabeto[b[i] % alfabeto.length];
  return prefixo + "-" + s;
}

function texto(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 200);
}
function digitos(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
function inteiro(v, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
function chaveIdem(v) {
  const s = texto(v, 80);
  return /^[A-Za-z0-9_-]{8,80}$/.test(s) ? s : null;
}

function reais(cents) {
  if (cents == null) return "sob consulta";
  return "R$ " + (cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/* ------------------------------------------------------------- catálogo */
async function catalogo(cliente) {
  const q = cliente || POOL;
  const prods = await q.query(
    "SELECT id, name, category, categories, color_name, colors, badges, description, images, price_cents, " +
    "compare_cents, weight_g, height_cm, width_cm, length_cm, active, position " +
    "FROM products ORDER BY position, id"
  );
  const vars = await q.query(
    "SELECT id, product_id, size, color, sku, stock, active FROM product_variants ORDER BY product_id, " +
    "array_position(ARRAY['PP','P','M','G','GG']::text[], size), size"
  );
  const porProduto = {};
  for (const v of vars.rows) (porProduto[v.product_id] = porProduto[v.product_id] || []).push(v);
  return prods.rows.map((p) => Object.assign({}, p, { variants: porProduto[p.id] || [] }));
}

/* Visão pública: sem SKU, sem custo, só o que a vitrine precisa. */
function produtoPublico(p) {
  return {
    id: p.id,
    nome: p.name,
    cat: p.category,
    cats: p.categories,
    cor: p.color_name,
    cores: p.colors,
    badges: p.badges,
    descricao: p.description || null,
    imagens: p.images || [],
    preco: p.price_cents,
    precoDe: p.compare_cents,
    ativo: p.active,
    freteCalculavel: !!(p.weight_g && p.height_cm && p.width_cm && p.length_cm),
    tamanhos: p.variants.filter((v) => v.active).map((v) => ({
      tam: v.size,
      cor: v.color,
      /* null = loja confirma no atendimento; número = quantidade real */
      estoque: v.stock,
      disponivel: v.stock === null ? null : v.stock > 0,
    })),
  };
}

/* --------------------------------------------------------- precificação
   Recebe [{id, tam, cor, qtd}] do navegador e devolve as linhas com preço
   do banco. `exigirPreco`/`exigirEstoque` dizem se a falta disso bloqueia
   (checkout do site) ou só é anotada (atendimento).                      */
async function precificar(itensBrutos, opcoes, cliente) {
  const o = opcoes || {};
  const q = cliente || POOL;
  if (!Array.isArray(itensBrutos) || !itensBrutos.length) throw erroNegocio("A sacola está vazia.");
  if (itensBrutos.length > 40) throw erroNegocio("Itens demais em um pedido só.");

  const ids = Array.from(new Set(itensBrutos.map((i) => texto(i && i.id, 20))));
  const prods = await q.query(
    "SELECT id, name, color_name, price_cents, active, weight_g, height_cm, width_cm, length_cm " +
    "FROM products WHERE id = ANY($1::text[])", [ids]);
  const vars = await q.query(
    "SELECT id, product_id, size, color, stock, active FROM product_variants WHERE product_id = ANY($1::text[])", [ids]);
  const mapa = {};
  for (const p of prods.rows) mapa[p.id] = p;

  const linhas = [];
  const problemas = [];
  for (const bruto of itensBrutos) {
    const id = texto(bruto && bruto.id, 20);
    const p = mapa[id];
    const tam = texto(bruto && bruto.tam, 6).toUpperCase();
    const qtd = inteiro(bruto && bruto.qtd, 1, 20);
    if (!p || !qtd) { problemas.push({ id, motivo: "peça não encontrada" }); continue; }
    const corPedida = texto(bruto && bruto.cor, 60);
    const v = vars.rows.find((x) => x.product_id === id && x.size === tam && (x.color === corPedida || !corPedida)) ||
              vars.rows.find((x) => x.product_id === id && x.size === tam);
    if (!v || !v.active || !p.active) { problemas.push({ id, tam, motivo: "tamanho indisponível" }); continue; }
    if (o.exigirPreco && p.price_cents == null) problemas.push({ id, tam, motivo: "sem valor cadastrado" });
    if (o.exigirEstoque) {
      if (v.stock == null) problemas.push({ id, tam, motivo: "estoque não confirmado" });
      else if (v.stock < qtd) problemas.push({ id, tam, motivo: v.stock === 0 ? "esgotado" : "só " + v.stock + " em estoque" });
    } else if (v.stock === 0) {
      problemas.push({ id, tam, motivo: "esgotado", aviso: true });
    }
    const unit = bruto && Number.isInteger(bruto.preco_manual) && o.permitirPrecoManual ? bruto.preco_manual : p.price_cents;
    linhas.push({
      product_id: p.id,
      variant_id: v.id,
      nome: p.name,
      cor: v.color || p.color_name || "",
      tam: v.size,
      qtd,
      preco_unit: unit,
      total: unit == null ? null : unit * qtd,
      estoque: v.stock,
      peso_g: p.weight_g,
      dims: p.height_cm && p.width_cm && p.length_cm ? { a: +p.height_cm, l: +p.width_cm, c: +p.length_cm } : null,
    });
  }

  const bloqueantes = problemas.filter((x) => !x.aviso);
  if ((o.exigirPreco || o.exigirEstoque) && bloqueantes.length) {
    throw erroNegocio("Algumas peças não podem ser pagas pelo site agora.", 409, { problemas: bloqueantes });
  }
  const semPreco = linhas.some((l) => l.preco_unit == null);
  const subtotal = semPreco ? null : linhas.reduce((s, l) => s + l.total, 0);
  return { linhas, subtotal, problemas, semPreco };
}

/* ------------------------------------------------------------- cupom */
async function aplicarCupom(codigo, subtotal, frete, cliente) {
  const c = texto(codigo, 40).toUpperCase();
  if (!c) return { codigo: null, desconto: 0, freteGratis: false };
  const q = cliente || POOL;
  const r = await q.query("SELECT * FROM coupons WHERE code = $1", [c]);
  const cup = r.rows[0];
  const agora = Date.now();
  if (!cup || !cup.active) throw erroNegocio("Cupom inválido.", 400, { campo: "cupom" });
  if (cup.starts_at && new Date(cup.starts_at).getTime() > agora) throw erroNegocio("Este cupom ainda não começou.", 400, { campo: "cupom" });
  if (cup.ends_at && new Date(cup.ends_at).getTime() < agora) throw erroNegocio("Este cupom já expirou.", 400, { campo: "cupom" });
  if (cup.max_uses != null && cup.uses >= cup.max_uses) throw erroNegocio("Este cupom já atingiu o limite de usos.", 400, { campo: "cupom" });
  if (subtotal == null) throw erroNegocio("O cupom é aplicado quando todas as peças têm valor.", 400, { campo: "cupom" });
  if (subtotal < cup.min_cents) throw erroNegocio("Este cupom vale a partir de " + reais(cup.min_cents) + ".", 400, { campo: "cupom" });
  let desconto = 0;
  if (cup.kind === "percent") desconto = Math.floor(subtotal * Math.min(100, cup.value) / 100);
  if (cup.kind === "fixed") desconto = Math.min(subtotal, cup.value);
  return { codigo: c, desconto, freteGratis: cup.kind === "frete", cupom: cup };
}

/* ------------------------------------------------------- baixa de estoque
   Só para variantes com estoque controlado (stock não nulo). Estoque nulo
   = a loja confirmou no atendimento; não há número para baixar.          */
async function baixarEstoque(c, linhas, ref, staffId) {
  for (const l of linhas) {
    const r = await c.query(
      "UPDATE product_variants SET stock = stock - $1, updated_at = now() " +
      "WHERE id = $2 AND stock IS NOT NULL AND stock >= $1 RETURNING stock",
      [l.qtd, l.variant_id]);
    if (!r.rowCount) {
      const atual = await c.query("SELECT stock FROM product_variants WHERE id = $1", [l.variant_id]);
      const st = atual.rows[0] ? atual.rows[0].stock : null;
      if (st === null) continue; // não controlado
      throw erroNegocio("Acabou o estoque de " + l.nome + " (" + l.tam + ") enquanto o pedido era fechado.", 409);
    }
    await c.query(
      "INSERT INTO stock_movements (variant_id, delta, reason, ref_type, ref_id, staff_id) VALUES ($1,$2,'venda',$3,$4,$5)",
      [l.variant_id, -l.qtd, ref.tipo, ref.id, staffId || null]);
  }
}

async function devolverEstoque(c, pedido, staffId, motivo) {
  if (!pedido.stock_committed) return;
  for (const l of pedido.items || []) {
    const r = await c.query(
      "UPDATE product_variants SET stock = stock + $1, updated_at = now() WHERE id = $2 AND stock IS NOT NULL RETURNING id",
      [l.qtd, l.variant_id]);
    if (r.rowCount) {
      await c.query(
        "INSERT INTO stock_movements (variant_id, delta, reason, ref_type, ref_id, staff_id) VALUES ($1,$2,$3,'order',$4,$5)",
        [l.variant_id, l.qtd, motivo || "cancelamento", pedido.code, staffId || null]);
    }
  }
  await c.query("UPDATE orders SET stock_committed = false WHERE id = $1", [pedido.id]);
}

/* ------------------------------------------------------- dados da cliente */
function validarContato(d) {
  const nome = texto(d && d.nome, 120);
  const fone = digitos(d && d.fone);
  const email = texto(d && d.email, 160).toLowerCase();
  if (nome.length < 3) throw erroNegocio("Informe o seu nome completo.", 400, { campo: "nome" });
  if (fone.length < 10 || fone.length > 13) throw erroNegocio("Informe um telefone com DDD.", 400, { campo: "fone" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw erroNegocio("E-mail inválido.", 400, { campo: "email" });
  return { nome, fone, email: email || null };
}

function validarEndereco(e) {
  const end = {
    cep: digitos(e && e.cep),
    rua: texto(e && e.rua, 160),
    numero: texto(e && e.numero, 20),
    complemento: texto(e && e.complemento, 80),
    bairro: texto(e && e.bairro, 80),
    cidade: texto(e && e.cidade, 80),
    uf: texto(e && e.uf, 2).toUpperCase(),
  };
  if (end.cep.length !== 8) throw erroNegocio("CEP inválido.", 400, { campo: "cep" });
  if (!end.rua) throw erroNegocio("Informe a rua.", 400, { campo: "rua" });
  if (!end.numero) throw erroNegocio("Informe o número.", 400, { campo: "numero" });
  if (!end.bairro) throw erroNegocio("Informe o bairro.", 400, { campo: "bairro" });
  if (!end.cidade) throw erroNegocio("Informe a cidade.", 400, { campo: "cidade" });
  if (!/^[A-Z]{2}$/.test(end.uf)) throw erroNegocio("Informe a UF com 2 letras.", 400, { campo: "uf" });
  return end;
}

async function lerAjuste(chave, cliente) {
  const r = await (cliente || POOL).query("SELECT value FROM settings WHERE key = $1", [chave]);
  return r.rows[0] ? r.rows[0].value : null;
}

async function whatsappDaLoja() {
  const loja = await lerAjuste("loja").catch(() => null);
  const n = digitos(loja && loja.whatsapp) || digitos(process.env.LOJA_WHATSAPP) || "5581984023286";
  return n;
}

/* ------------------------------------------------- mensagem do WhatsApp */
function mensagemAtendimento(sol, linhas, contato) {
  const partes = [];
  partes.push("Olá, Preta Chik! Quero finalizar minha compra com atendimento exclusivo.");
  partes.push("");
  partes.push("*Solicitação " + sol.code + "*");
  if (contato && contato.nome) partes.push("Nome: " + contato.nome);
  partes.push("");
  partes.push("*Peças escolhidas:*");
  linhas.forEach((l, i) => {
    partes.push((i + 1) + ". " + l.nome + " — Tam. " + l.tam + (l.cor ? " · " + l.cor : "") +
      " · " + l.qtd + "x" + (l.preco_unit != null ? " · " + reais(l.preco_unit) : ""));
  });
  const sub = linhas.some((l) => l.preco_unit == null) ? null : linhas.reduce((s, l) => s + l.total, 0);
  partes.push("");
  partes.push("Subtotal: " + (sub == null ? "a confirmar com a loja" : reais(sub)));
  if (sol.cep) partes.push("CEP para entrega: " + sol.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"));
  if (sol.customer_note) { partes.push(""); partes.push("Observação: " + sol.customer_note); }
  partes.push("");
  partes.push("Pode me ajudar a conferir a disponibilidade e fechar o pedido?");
  return partes.join("\n");
}

/* ------------------------------------------------- criar atendimento */
async function criarAtendimento(corpo, cliente) {
  const idem = chaveIdem(corpo && corpo.chave);
  if (idem) {
    const ja = await db.um("SELECT * FROM service_requests WHERE idempotency_key = $1", [idem]);
    if (ja) {
      const numero = await whatsappDaLoja();
      return { sol: ja, numero, mensagem: mensagemAtendimento(ja, ja.original_items, { nome: ja.name }), repetida: true };
    }
  }
  const pre = await precificar(corpo && corpo.itens, {});
  const nome = texto((corpo && corpo.nome) || (cliente && cliente.name), 120) || null;
  const fone = digitos((corpo && corpo.fone) || (cliente && cliente.whatsapp)) || null;
  const email = texto((corpo && corpo.email) || (cliente && cliente.email), 160).toLowerCase() || null;
  const cep = digitos(corpo && corpo.cep);
  const nota = texto(corpo && corpo.observacao, 500) || null;

  const sol = await db.transacao(async (c) => {
    let tentativa = 0, linha = null;
    while (!linha && tentativa < 5) {
      tentativa++;
      try {
        const r = await c.query(
          "INSERT INTO service_requests (code, customer_id, name, phone, email, cep, original_items, items, " +
          "subtotal_cents, customer_note, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10) RETURNING *",
          [gerarCodigo("AT"), cliente ? cliente.id : null, nome, fone, email, cep.length === 8 ? cep : null,
           JSON.stringify(pre.linhas), pre.subtotal, nota, idem]);
        linha = r.rows[0];
      } catch (e) {
        if (e && e.code === "23505" && /code/.test(e.constraint || e.detail || "")) continue;
        throw e;
      }
    }
    if (!linha) throw new Error("não consegui gerar código único");
    await c.query("INSERT INTO service_request_events (request_id, kind, detail) VALUES ($1,'criado',$2)",
      [linha.id, JSON.stringify({ origem: "site", itens: pre.linhas.length })]);
    return linha;
  });

  const numero = await whatsappDaLoja();
  return { sol, numero, mensagem: mensagemAtendimento(sol, pre.linhas, { nome }) };
}

/* ------------------------------------------------------- inserir pedido */
async function inserirPedido(c, dados) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await c.query(
        "INSERT INTO orders (code, customer_id, channel, service_request_id, status, payment_status, payment_method, " +
        "name, phone, email, address, items, subtotal_cents, discount_cents, shipping_cents, total_cents, coupon_code, " +
        "shipping, sold_by, notes, stock_committed, idempotency_key) " +
        "VALUES ($1,$2,$3,$4,'aguardando_pagamento','pendente',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *",
        [gerarCodigo("PC"), dados.customer_id || null, dados.channel, dados.service_request_id || null, dados.payment_method || null,
         dados.name, dados.phone, dados.email || null, dados.address ? JSON.stringify(dados.address) : null,
         JSON.stringify(dados.items), dados.subtotal, dados.discount || 0, dados.shipping_cents || 0, dados.total,
         dados.coupon_code || null, dados.shipping ? JSON.stringify(dados.shipping) : null, dados.sold_by || null,
         dados.notes || null, !!dados.stock_committed, dados.idempotency_key || null]);
      return r.rows[0];
    } catch (e) {
      if (e && e.code === "23505" && /orders_code/.test(e.constraint || "")) continue;
      throw e;
    }
  }
  throw new Error("não consegui gerar código único de pedido");
}

async function evento(c, tabela, idCampo, id, kind, detail, staffId) {
  await c.query("INSERT INTO " + tabela + " (" + idCampo + ", kind, detail, staff_id) VALUES ($1,$2,$3,$4)",
    [id, kind, detail ? JSON.stringify(detail) : null, staffId || null]);
}

/* Muda status do pedido e propaga para o atendimento de origem. */
async function mudarStatusPedido(c, pedido, novo, staffId, extra) {
  if (!STATUS_PEDIDO[novo]) throw erroNegocio("Status inválido.");
  if (pedido.status === novo) return pedido;
  if ((novo === "cancelado" || novo === "reembolsado") && pedido.stock_committed) {
    await devolverEstoque(c, pedido, staffId, novo === "reembolsado" ? "devolucao" : "cancelamento");
  }
  const sets = ["status = $1", "updated_at = now()"];
  if (novo === "cancelado") sets.push("canceled_at = now()");
  if (novo === "enviado") sets.push("shipped_at = COALESCE(shipped_at, now())");
  const r = await c.query("UPDATE orders SET " + sets.join(", ") + " WHERE id = $2 RETURNING *", [novo, pedido.id]);
  await evento(c, "order_events", "order_id", pedido.id, "status", Object.assign({ de: pedido.status, para: novo }, extra || {}), staffId);
  if (pedido.service_request_id && PEDIDO_PARA_ATENDIMENTO[novo]) {
    await c.query("UPDATE service_requests SET status = $1, updated_at = now() WHERE id = $2",
      [PEDIDO_PARA_ATENDIMENTO[novo], pedido.service_request_id]);
    await evento(c, "service_request_events", "request_id", pedido.service_request_id, "status",
      { para: PEDIDO_PARA_ATENDIMENTO[novo], via: "pedido " + pedido.code }, staffId);
  }
  return r.rows[0];
}

/* Pagamento aprovado — só chamado com confirmação do provedor ou registro
   manual da equipe. Idempotente: aprovar duas vezes não muda nada.       */
async function confirmarPagamento(c, pedido, info, staffId) {
  if (pedido.payment_status === "aprovado") return pedido;
  await c.query(
    "UPDATE orders SET payment_status = 'aprovado', payment_provider = COALESCE($1, payment_provider), " +
    "payment_ref = COALESCE($2, payment_ref), payment_method = COALESCE($3, payment_method), paid_at = now(), updated_at = now() WHERE id = $4",
    [info.provider || null, info.ref || null, info.method || null, pedido.id]);
  const atual = (await c.query("SELECT * FROM orders WHERE id = $1", [pedido.id])).rows[0];
  if (atual.status === "aguardando_pagamento") return mudarStatusPedido(c, atual, "pago", staffId, { pagamento: info.provider });
  return atual;
}

/* Visão do pedido para a cliente — sem notas internas nem quem vendeu. */
function pedidoPublico(o) {
  return {
    codigo: o.code,
    canal: o.channel,
    status: o.status,
    statusNome: STATUS_PEDIDO[o.status] || o.status,
    pagamento: o.payment_status,
    linkPagamento: o.payment_status === "pendente" ? o.payment_link : null,
    itens: (o.items || []).map((l) => ({ id: l.product_id, nome: l.nome, cor: l.cor, tam: l.tam, qtd: l.qtd, preco: l.preco_unit, total: l.total })),
    subtotal: o.subtotal_cents,
    desconto: o.discount_cents,
    frete: o.shipping_cents,
    total: o.total_cents,
    entrega: o.shipping ? { tipo: o.shipping.tipo, nome: o.shipping.nome, prazo: o.shipping.prazo || null } : null,
    endereco: o.address || null,
    rastreio: o.tracking_code || null,
    rastreioUrl: o.tracking_url || null,
    criadoEm: o.created_at,
    pagoEm: o.paid_at,
    enviadoEm: o.shipped_at,
  };
}

function atendimentoPublico(s) {
  return {
    codigo: s.code,
    status: s.status,
    statusNome: STATUS_ATENDIMENTO[s.status] || s.status,
    itens: (s.items || []).map((l) => ({ id: l.product_id, nome: l.nome, cor: l.cor, tam: l.tam, qtd: l.qtd, preco: l.preco_unit })),
    subtotal: s.subtotal_cents,
    desconto: s.discount_cents,
    frete: s.shipping_cents,
    pedido: s.order_code || null,
    criadoEm: s.created_at,
    atualizadoEm: s.updated_at,
  };
}

module.exports = {
  TAMANHOS, STATUS_ATENDIMENTO, STATUS_PEDIDO, PEDIDO_PARA_ATENDIMENTO,
  erroNegocio, gerarCodigo, texto, digitos, inteiro, chaveIdem, reais,
  catalogo, produtoPublico, precificar, aplicarCupom, baixarEstoque, devolverEstoque,
  validarContato, validarEndereco, lerAjuste, whatsappDaLoja, mensagemAtendimento,
  criarAtendimento, inserirPedido, evento, mudarStatusPedido, confirmarPagamento,
  pedidoPublico, atendimentoPublico,
};
