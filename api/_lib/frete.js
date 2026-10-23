/* ==========================================================================
   api/_lib/frete.js — frete: Melhor Envio (inclui serviços dos Correios),
   retirada na loja e adaptador reservado para contrato direto dos Correios.
   --------------------------------------------------------------------------
   NADA AQUI INVENTA PREÇO, PRAZO, ETIQUETA OU RASTREIO.

   - Sem MELHORENVIO_TOKEN configurado, a cotação automática responde
     "indisponível" e o site mostra só as opções reais que não dependem de
     API (retirada na loja; entrega a combinar pelo atendimento).
   - Sem peso e medidas cadastrados na peça, não cotamos: o Melhor Envio
     calcularia sobre medida inventada.
   - Os Correios entram pelo Melhor Envio (PAC/SEDEX são serviços dele),
     para não haver duas integrações cobrando a mesma coisa. O adaptador
     direto dos Correios fica preparado, mas desligado até existir contrato.

   VARIÁVEIS (painel da Vercel):
     MELHORENVIO_TOKEN         token de acesso (painel ME > Integrações)
     MELHORENVIO_AMBIENTE      "sandbox" (padrão) ou "producao"
     MELHORENVIO_CONTATO       e-mail técnico exigido no User-Agent pelo ME
     MELHORENVIO_SERVICOS      opcional, ids separados por vírgula (ex.: 1,2)
     MELHORENVIO_WEBHOOK_SECRET segredo do app, para validar X-ME-Signature
     FRETE_CEP_ORIGEM          CEP da loja (ou settings.frete.cep_origem)
   ========================================================================== */

"use strict";

const crypto = require("crypto");
const loja = require("./loja");

function ambiente() {
  return /^prod/i.test(process.env.MELHORENVIO_AMBIENTE || "") ? "producao" : "sandbox";
}
function base() {
  return ambiente() === "producao" ? "https://www.melhorenvio.com.br" : "https://sandbox.melhorenvio.com.br";
}
function configurado() { return !!(process.env.MELHORENVIO_TOKEN || "").trim(); }

function status() {
  return {
    melhorEnvio: {
      configurado: configurado(),
      ambiente: ambiente(),
      webhookAssinado: !!(process.env.MELHORENVIO_WEBHOOK_SECRET || "").trim(),
    },
    correiosDireto: { configurado: false, observacao: "Correios atendidos via Melhor Envio. Adaptador direto aguardando contrato." },
  };
}

async function me(caminho, metodo, corpo) {
  if (!configurado()) throw loja.erroNegocio("Melhor Envio não configurado.", 503);
  const contato = (process.env.MELHORENVIO_CONTATO || "").trim() || "contato@pretachik";
  const r = await fetch(base() + caminho, {
    method: metodo || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.MELHORENVIO_TOKEN.trim(),
      "User-Agent": "Preta Chik Moda Praia (" + contato + ")",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
  });
  const txt = await r.text();
  let dados = null;
  try { dados = txt ? JSON.parse(txt) : null; } catch (e) { dados = { bruto: txt.slice(0, 300) }; }
  if (!r.ok) {
    const msg = (dados && (dados.message || dados.error)) || ("HTTP " + r.status);
    const e = loja.erroNegocio("Melhor Envio respondeu com erro: " + msg, 502);
    e.detalhe = dados;
    throw e;
  }
  return dados;
}

async function cepOrigem() {
  const f = await loja.lerAjuste("frete").catch(() => null);
  return loja.digitos((f && f.cep_origem) || process.env.FRETE_CEP_ORIGEM || "");
}

/* Opções que não dependem de API e são reais na operação da loja. */
async function opcoesLocais() {
  const f = (await loja.lerAjuste("frete").catch(() => null)) || {};
  const ops = [];
  if (f.retirada_na_loja !== false) {
    ops.push({ id: "retirada", tipo: "retirada", nome: "Retirar na loja", empresa: "Preta Chik",
      preco: 0, prazo: null, detalhe: "Estrada de Águas Compridas, 385 — Olinda/PE. A loja avisa quando separar.", pagavelNoSite: true });
  }
  if (f.entrega_local !== false) {
    ops.push({ id: "local", tipo: "local", nome: "Entrega local", empresa: "Preta Chik",
      preco: null, prazo: null, detalhe: "Valor e horário combinados no atendimento pelo WhatsApp.", pagavelNoSite: false });
  }
  return ops;
}

/* Cotação. `linhas` vem de loja.precificar (tem peso/dimensões do banco). */
async function cotar(cepDestino, linhas) {
  const destino = loja.digitos(cepDestino);
  if (destino.length !== 8) throw loja.erroNegocio("CEP inválido.", 400, { campo: "cep" });
  const locais = await opcoesLocais();
  const resultado = { cep: destino, opcoes: locais.slice(), automatico: { disponivel: false, motivo: null } };

  if (!configurado()) { resultado.automatico.motivo = "Cálculo automático de frete ainda não ativado pela loja."; return resultado; }
  const origem = await cepOrigem();
  if (origem.length !== 8) { resultado.automatico.motivo = "CEP de origem da loja não cadastrado."; return resultado; }
  const semMedida = linhas.filter((l) => !l.peso_g || !l.dims);
  if (semMedida.length) {
    resultado.automatico.motivo = "Peso e medidas de algumas peças ainda não foram cadastrados — o frete é confirmado no atendimento.";
    return resultado;
  }

  const corpo = {
    from: { postal_code: origem },
    to: { postal_code: destino },
    products: linhas.map((l) => ({
      id: l.product_id, width: l.dims.l, height: l.dims.a, length: l.dims.c,
      weight: l.peso_g / 1000, insurance_value: (l.preco_unit || 0) / 100, quantity: l.qtd,
    })),
    options: { receipt: false, own_hand: false },
  };
  const servicos = (process.env.MELHORENVIO_SERVICOS || "").trim();
  if (servicos) corpo.services = servicos;

  try {
    const lista = await me("/api/v2/me/shipment/calculate", "POST", corpo);
    const validas = (Array.isArray(lista) ? lista : []).filter((s) => !s.error && s.price != null);
    for (const s of validas) {
      const preco = Math.round(parseFloat(s.custom_price || s.price) * 100);
      resultado.opcoes.push({
        id: "me:" + s.id, tipo: "melhorenvio", servicoId: s.id,
        nome: s.name, empresa: s.company && s.company.name, logo: s.company && s.company.picture,
        preco, prazo: s.custom_delivery_time || s.delivery_time || null, pagavelNoSite: true,
      });
    }
    resultado.automatico.disponivel = validas.length > 0;
    if (!validas.length) resultado.automatico.motivo = "Nenhuma transportadora atende este CEP para estas peças.";
  } catch (e) {
    resultado.automatico.motivo = "Não consegui consultar o frete agora. A loja confirma no atendimento.";
    resultado.automatico.erro = e.message;
  }
  return resultado;
}

/* Recota no servidor a opção escolhida — o preço do navegador não vale. */
async function confirmarOpcao(cepDestino, linhas, opcaoId) {
  const r = await cotar(cepDestino, linhas);
  const o = r.opcoes.find((x) => x.id === opcaoId);
  if (!o) throw loja.erroNegocio("A opção de entrega escolhida não está mais disponível. Calcule o frete de novo.", 409, { campo: "entrega" });
  return o;
}

/* ---------------------------------------------------- etiqueta (painel)
   Fluxo do Melhor Envio: carrinho -> compra (checkout, debita saldo da
   conta ME da loja) -> geração -> impressão. Cada passo é uma chamada
   real; se qualquer um falhar, o erro do ME é mostrado como veio.        */
async function remetente() {
  const r = await loja.lerAjuste("remetente").catch(() => null);
  if (!r || !r.nome || !r.documento || !r.cep || !r.rua || !r.numero || !r.cidade || !r.uf) {
    throw loja.erroNegocio("Cadastre os dados do remetente (nome, CPF/CNPJ e endereço da loja) em Configurações antes de gerar etiqueta.", 400);
  }
  return r;
}

async function gerarEtiqueta(pedido) {
  if (!pedido.shipping || pedido.shipping.tipo !== "melhorenvio") throw loja.erroNegocio("Este pedido não usa transportadora do Melhor Envio.");
  if (!pedido.address) throw loja.erroNegocio("Pedido sem endereço de entrega.");
  const rem = await remetente();
  const end = pedido.address;
  const volumes = pedido.items.filter((l) => l.dims && l.peso_g).map((l) => ({ height: l.dims.a, width: l.dims.l, length: l.dims.c, weight: (l.peso_g * l.qtd) / 1000 }));
  if (!volumes.length) throw loja.erroNegocio("Peças sem peso/medidas: não dá para gerar etiqueta.");
  const carrinho = await me("/api/v2/me/cart", "POST", {
    service: pedido.shipping.servicoId,
    from: { name: rem.nome, phone: loja.digitos(rem.telefone), email: rem.email, document: loja.digitos(rem.documento),
      address: rem.rua, number: rem.numero, complement: rem.complemento || "", district: rem.bairro, city: rem.cidade,
      state_abbr: rem.uf, postal_code: loja.digitos(rem.cep) },
    to: { name: pedido.name, phone: loja.digitos(pedido.phone), email: pedido.email || undefined,
      address: end.rua, number: end.numero, complement: end.complemento || "", district: end.bairro, city: end.cidade,
      state_abbr: end.uf, postal_code: end.cep },
    products: pedido.items.map((l) => ({ name: l.nome + " " + l.tam, quantity: l.qtd, unitary_value: (l.preco_unit || 0) / 100 })),
    volumes,
    options: { insurance_value: (pedido.subtotal_cents || 0) / 100, receipt: false, own_hand: false, reverse: false, non_commercial: true },
  });
  const id = carrinho && carrinho.id;
  if (!id) throw loja.erroNegocio("Melhor Envio não devolveu o id da etiqueta.", 502);
  await me("/api/v2/me/shipment/checkout", "POST", { orders: [id] });
  await me("/api/v2/me/shipment/generate", "POST", { orders: [id] });
  const imp = await me("/api/v2/me/shipment/print", "POST", { mode: "private", orders: [id] });
  return { etiquetaId: id, urlImpressao: imp && imp.url };
}

async function rastrear(etiquetaId) {
  const r = await me("/api/v2/me/shipment/tracking", "POST", { orders: [etiquetaId] });
  const item = r && r[etiquetaId];
  return item ? { codigo: item.tracking || null, status: item.status || null, bruto: item } : null;
}

/* X-ME-Signature = base64(HMAC-SHA256(corpo cru, segredo do app)). */
function assinaturaValida(corpoCru, assinatura) {
  const seg = (process.env.MELHORENVIO_WEBHOOK_SECRET || "").trim();
  if (!seg || !assinatura) return false;
  const esperado = crypto.createHmac("sha256", seg).update(corpoCru).digest("base64");
  const a = Buffer.from(esperado), b = Buffer.from(String(assinatura));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------- Correios direto
   Reservado. Só é ligado com contrato e credenciais da loja nos Correios.
   Enquanto isso, qualquer chamada responde de forma explícita.           */
const correiosDireto = {
  configurado: () => false,
  cotar: async () => { throw loja.erroNegocio("Integração direta com os Correios não contratada. Os serviços dos Correios estão disponíveis via Melhor Envio.", 501); },
};

module.exports = { status, configurado, cotar, confirmarOpcao, opcoesLocais, gerarEtiqueta, rastrear, assinaturaValida, correiosDireto, ambiente };
