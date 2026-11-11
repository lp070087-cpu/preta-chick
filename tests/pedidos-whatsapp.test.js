"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

test("checkout WhatsApp e painel com PostgreSQL", async (t) => {
  const url = new URL(process.env.TEST_DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/preta_chik_test");
  process.env.DATABASE_URL = url.href;
  const db = require("../api/_lib/db");
  const equipe = require("../api/_lib/equipe");
  const loja = require("../api/loja");
  const admin = require("../api/admin");
  const pool = db.pool();
  t.after(() => pool.end());
  assert.equal((await db.um("SELECT to_regclass('public.service_requests') AS tabela")).tabela, null,
    "Use um banco de testes vazio.");
  for (const name of ["001_autenticacao.sql", "002_loja.sql", "003_pedidos_whatsapp.sql"]) {
    await db.consulta(await fs.readFile(path.join(__dirname, "../migrations", name), "utf8"));
  }
  const senha = "PcTest-" + randomUUID();
  const senhaHash = await equipe.hash(senha);
  const atendente = await db.um("INSERT INTO staff (name, email, role, password_hash) VALUES ('Atendente Teste','atendente@example.test','atendente',$1) RETURNING id", [senhaHash]);
  await db.consulta("INSERT INTO staff (name, email, role, password_hash) VALUES ('Dona Teste','dona@example.test','proprietaria',$1)", [senhaHash]);
  await db.consulta("UPDATE products SET price_cents=4500 WHERE id IN ('p03','p05')");
  await db.consulta("INSERT INTO product_variants (product_id, size, color, stock) VALUES ('p03','M','Azul teste',3)");

  function chamar(handler, method, endpoint, body, cookie) {
    return new Promise((resolve, reject) => {
      const headers = {};
      const res = { setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(data) { resolve({ status: this.statusCode, data: JSON.parse(data), headers }); } };
      Promise.resolve(handler({ url: endpoint, method, body, headers: cookie ? { cookie } : {} }, res)).catch(reject);
    });
  }
  const painel = (m, p, b, c) => chamar(admin, m, "/api/admin/" + p, b, c);
  const checkout = (b) => chamar(loja, "POST", "/api/loja/pedidos-whatsapp", b);
  const item = { id: "p03", tam: "M", cor: "Azul teste", qtd: 1 };
  const corpo = {
    chave: randomUUID(), itens: [item], nome: "Cliente Teste", fone: "81900000000",
    entrega: { tipo: "envio", opcaoId: "local" },
    endereco: { cep: "53000000", rua: "Rua Sintética", numero: "10", bairro: "Bairro Teste", cidade: "Olinda", uf: "PE" },
    pagamento: "PIX", observacao: "Somente no painel",
  };

  const respostas = await Promise.all(Array.from({ length: 5 }, () => checkout(corpo)));
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 200, 200, 200, 201], JSON.stringify(respostas));
  const { codigo, mensagem, url: whatsapp } = respostas[0].data;
  assert.match(codigo, /^PC-[A-Z0-9]{6}$/);
  assert.ok(respostas.every((r) => r.data.codigo === codigo));
  assert.equal(mensagem, "Olá! Montei meu pedido pelo site da Preta Chik e gostaria de finalizar minha compra.\n\nCódigo do pedido: " + codigo + "\n\nPoderia me ajudar a concluir o atendimento?");
  assert.equal(new URL(whatsapp).searchParams.get("text"), mensagem);
  assert.equal(new URL(whatsapp).hostname, "wa.me");
  const persistido = await db.um("SELECT * FROM service_requests WHERE code = $1", [codigo]);
  assert.equal(persistido.address.rua, corpo.endereco.rua);
  assert.equal(persistido.items[0].cor, item.cor);
  assert.equal(persistido.customer_note, corpo.observacao);
  assert.equal((await db.um("SELECT count(*)::int AS n FROM service_request_events WHERE request_id = $1", [persistido.id])).n, 1);
  const segundo = await checkout({ ...corpo, chave: randomUUID() });
  assert.equal(segundo.status, 201);
  assert.notEqual(segundo.data.codigo, codigo);
  assert.equal((await checkout({ ...corpo, chave: randomUUID(), itens: [{ ...item, cor: "Inválida" }] })).status, 409);
  assert.equal((await checkout({ ...corpo, chave: randomUUID(), itens: [{ ...item, qtd: 2 }, { ...item, qtd: 2 }] })).status, 409);

  const busca = "pedidos?q=" + encodeURIComponent("#" + codigo.toLowerCase());
  assert.equal((await painel("GET", busca)).status, 401);
  assert.equal((await chamar(loja, "GET", "/api/loja/pedidos/" + codigo)).status, 404);
  const login = await painel("POST", "entrar", { email: "atendente@example.test", senha });
  assert.equal(login.status, 200);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const resultado = await painel("GET", busca, undefined, cookie);
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
  assert.equal(resultado.data.pedidos.length, 1);
  assert.equal(resultado.data.pedidos[0].tipo, "atendimento");
  const rota = "atendimentos/" + persistido.id;
  const detalhe = await painel("GET", rota, undefined, cookie);
  assert.equal(detalhe.data.atendimento.address.rua, corpo.endereco.rua);
  assert.equal(detalhe.data.atendimento.payment_pref, "PIX");
  assert.equal((await painel("GET", rota + "/assumir", undefined, cookie)).status, 405);
  assert.equal((await painel("PUT", rota + "/valores", { desconto: 100 }, cookie)).status, 403);
  const editado = await painel("PUT", rota + "/itens", {
    atualizadoEm: detalhe.data.atendimento.updated_at,
    itens: [{ ...item, qtd: 2 }, { id: "p05", tam: "G", cor: "Verde limão", qtd: 1 }],
  }, cookie);
  assert.equal(editado.status, 200, JSON.stringify(editado));
  assert.equal(editado.data.atendimento.items.length, 2);
  assert.equal(editado.data.atendimento.items[0].qtd, 2);
  assert.equal(editado.data.atendimento.assigned_to, atendente.id);
  assert.equal(editado.data.total.subtotal, 13500);
  assert.ok(editado.data.eventos.some((e) => e.kind === "itens" && e.staff_id === atendente.id));
  assert.equal((await painel("POST", rota + "/status", { status: "pago" }, cookie)).status, 409);
  assert.equal((await painel("POST", rota + "/status", { status: "aguardando_confirmacao" }, cookie)).status, 200);

  const dona = await painel("POST", "entrar", { email: "dona@example.test", senha });
  const cookieDona = dona.headers["set-cookie"].split(";")[0];
  assert.equal((await painel("PUT", rota + "/valores", { desconto: 500 }, cookieDona)).status, 200);
  assert.equal((await painel("PUT", rota + "/valores", { frete: 1000, freteTipo: "local" }, cookie)).status, 200);
  const venda = await painel("POST", rota + "/converter", {}, cookie);
  assert.equal(venda.status, 200, JSON.stringify(venda));
  assert.equal(venda.data.pedidoCodigo, codigo);
  const convertido = await painel("GET", busca, undefined, cookie);
  assert.equal(convertido.data.pedidos.length, 1);
  assert.equal(convertido.data.pedidos[0].tipo, "pedido");
  const pedido = "pedidos/" + venda.data.pedidoId;
  const pagou = await painel("POST", pedido + "/pagamento", { metodo: "pix", valor: 14000, referencia: "teste" }, cookie);
  assert.equal(pagou.status, 200, JSON.stringify(pagou));
  assert.equal(pagou.data.pedido.payment_status, "aprovado");
  for (const status of ["em_separacao", "enviado", "concluido"]) {
    const r = await painel("POST", pedido + "/status", { status }, cookie);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.data.pedido.status, status);
  }
  assert.equal((await db.um("SELECT stock FROM product_variants WHERE product_id='p03' AND size='M' AND color='Azul teste'")).stock, 1);
});
