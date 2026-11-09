/* ==========================================================================
   sacola.js — pedido em etapas, finalizado SOMENTE pelo WhatsApp
   --------------------------------------------------------------------------
   1. Sacola  2. Entrega  3. Preferência de pagamento  4. Revisão -> WhatsApp

   - Nada é cobrado no site. A cliente informa a preferência de pagamento.
   - Frete só aparece com valor/prazo quando a integração real devolve; sem
     isso: "Frete a confirmar com nossa equipe".
   - POST /api/loja/pedidos-whatsapp registra a solicitação (código PC-...),
     devolve a mensagem pronta e o link wa.me do número oficial.
   - A mesma sacola + os mesmos dados = a mesma chave: clicar de novo não
     cria outra solicitação.
   - Abrir o WhatsApp não prova que a mensagem foi enviada; por isso há
     "Copiar resumo" e "Abrir o WhatsApp novamente".
   ========================================================================== */

(function () {
  "use strict";

  LB.iniciar({ pagina: "sacola" });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var WHATS_PADRAO = "5581984023286"; // número oficial (dados.js / ajustes da loja)
  var PAGAMENTOS_PADRAO = ["PIX", "Cartão de crédito", "Cartão de débito", "Dinheiro na retirada"];
  var CHAVE_RASCUNHO = "pc_pedido_rascunho_v1";

  var LISTA = $("#listaItens"), WRAP = $("#sacolaWrap"), VAZIA = $("#sacolaVaziaWrap"), CONF = $("#confirmacao");
  var formE = $("#formEntrega"), formP = $("#formPagamento");

  var est = lerRascunho() || {};
  est.passo = 1;
  est.opcoesFrete = [];
  est.enviando = false;

  function lerRascunho() { try { return JSON.parse(sessionStorage.getItem(CHAVE_RASCUNHO) || "null"); } catch (e) { return null; } }
  function salvarRascunho() {
    try {
      sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ modo: est.modo, contato: est.contato, endereco: est.endereco,
        frete: est.frete, pagamento: est.pagamento, observacao: est.observacao }));
    } catch (e) { /* segue sem rascunho */ }
  }
  function digitos(v) { return String(v || "").replace(/\D/g, ""); }
  function api(caminho, corpo) {
    return fetch(caminho, {
      method: corpo === undefined ? "GET" : "POST", credentials: "same-origin",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = {}; try { d = t ? JSON.parse(t) : {}; } catch (e) { d = {}; }
        if (!r.ok) { var e = new Error(d.erro || "Não foi possível concluir agora."); e.dados = d; e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function itensApi() {
    return LB.estado.carrinho.map(function (it) {
      var p = buscaProduto(it.id);
      return { id: it.id, tam: it.tam, cor: p ? p.cor : it.cor, qtd: it.qtd };
    });
  }
  function checkout() { return (LB.estado && LB.estado.checkout) || {}; }
  function whatsLoja() { return digitos(checkout().whatsapp) || WHATS_PADRAO; }

  /* ---------------------------------------------------------- passos */
  function irPara(n, rolar) {
    if (n > 1 && !validarSacola()) n = 1;
    if (n > 2 && !validarEntrega(true)) n = 2;
    if (n > 3 && !est.pagamento) n = 3;
    est.passo = n;
    for (var i = 1; i <= 4; i++) $("#etapa" + i).classList.toggle("oculto", i !== n);
    $$("#passos li").forEach(function (li) {
      var k = +li.getAttribute("data-passo");
      li.classList.toggle("feito", k < n);
      if (k === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    if (n === 3) desenharPagamentos();
    if (n === 4) desenharRevisao();
    resumo();
    if (rolar) {
      var alvo = $("#passos");
      alvo.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      var h = $("#etapa" + n + " h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ir]");
    if (b) { e.preventDefault(); irPara(+b.getAttribute("data-ir"), true); }
    var f = e.target.closest("[data-finalizar]");
    if (f) { e.preventDefault(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); irPara(1, true); }
  });

  /* ---------------------------------------------------------- 1. sacola */
  function problemasSacola() {
    var l = [];
    LB.estado.carrinho.forEach(function (it) {
      var p = buscaProduto(it.id);
      if (!p) { l.push("Uma peça da sacola não está mais disponível."); return; }
      if (p.ativo === false) l.push(p.nome + " saiu da loja — remova da sacola.");
      else if (situacaoTamanho(p, it.tam) === "esgotado") l.push(p.nome + " (" + it.tam + ") está esgotado — troque o tamanho ou remova.");
    });
    return l;
  }
  function validarSacola() {
    var erro = $("#erro1");
    if (!LB.estado.carrinho.length) { erro.textContent = "Sua sacola está vazia."; return false; }
    var p = problemasSacola();
    erro.textContent = p.join(" ");
    return !p.length;
  }

  function desenhar() {
    var itens = LB.estado.carrinho;
    if (!itens.length) {
      WRAP.classList.add("oculto");
      $("#passos").classList.add("oculto");
      if (!CONF.classList.contains("oculto")) { VAZIA.innerHTML = ""; return; }
      VAZIA.innerHTML = '<div class="carrinho__vazio" style="border:1px solid var(--linha);border-radius:5px;margin-bottom:clamp(3rem,7vw,6rem)">' +
        LB.ICO.sacola + '<b>Sua sacola está vazia</b>' +
        '<p class="texto-peq">As peças que você escolher aparecem aqui.</p>' +
        '<a class="bt bt--rosa bt--pequeno" href="loja.html?cat=novidades">Ver novidades</a></div>';
      return;
    }
    WRAP.classList.remove("oculto");
    $("#passos").classList.remove("oculto");
    VAZIA.innerHTML = "";
    LISTA.innerHTML = itens.map(function (it) {
      var p = buscaProduto(it.id);
      if (!p) return "";
      var esg = situacaoTamanho(p, it.tam) === "esgotado";
      return '<div class="item">' +
        '<div class="item__foto"><div class="midia"><img src="' + fotoProduto(p, "a") + '" alt="' + LB.escapa(p.nome) + '" width="720" height="900"></div></div>' +
        '<div class="item__corpo">' +
          '<h3><a href="produto.html?id=' + p.id + '">' + LB.escapa(p.nome) + '</a></h3>' +
          '<p class="item__atrib">Cor ' + LB.escapa(p.cor || it.cor) + ' · Tam. ' + LB.escapa(it.tam) + '</p>' +
          (esg ? '<span class="item__aviso">Este tamanho está esgotado</span>' : '') +
          '<div class="item__linha">' +
            '<span class="passo">' +
              '<button type="button" data-qtd="-1" data-k="' + LB.escapa(it.k) + '" aria-label="Diminuir quantidade de ' + LB.escapa(p.nome) + '">−</button>' +
              '<span aria-live="polite">' + it.qtd + '</span>' +
              '<button type="button" data-qtd="1" data-k="' + LB.escapa(it.k) + '" aria-label="Aumentar quantidade de ' + LB.escapa(p.nome) + '">+</button>' +
            '</span>' +
            '<button class="item__remover" type="button" data-remover="' + LB.escapa(it.k) + '">Remover</button>' +
          '</div>' +
        '</div>' +
        '<div class="item__preco">' + (temPreco(p) ? '<span class="preco">' + dinheiro(p.preco * it.qtd) + '</span><em>' + it.qtd + ' × ' + dinheiro(p.preco) + '</em>' : LB.precoHTML(p) + '<em>' + it.qtd + ' × peça</em>') + '</div>' +
      '</div>';
    }).join("");
    resumo();
  }

  /* --------------------------------------------------------- 2. entrega */
  var cepEl = $("#cep"), aviso = $("#freteAviso"), opcoesEl = $("#freteOpcoes");
  cepEl.addEventListener("input", function () {
    var v = digitos(cepEl.value).slice(0, 8);
    cepEl.value = v.length > 5 ? v.slice(0, 5) + "-" + v.slice(5) : v;
    if (est.frete && est.frete.cep !== v) { est.frete = null; opcoesEl.classList.add("oculto"); aviso.textContent = ""; resumo(); }
  });

  function campo(n) { return formE.querySelector("[name=" + n + "]"); }
  function marcar(n, msg, caixa) {
    var el = campo(n);
    if (el) { el.classList.add("entrada--erro"); var c = el.closest(".campo"); if (c) c.classList.add("tem-erro"); el.focus(); }
    $(caixa || "#erro2").textContent = msg;
    return false;
  }
  formE.addEventListener("input", function (e) {
    e.target.classList.remove("entrada--erro");
    var c = e.target.closest(".campo"); if (c) c.classList.remove("tem-erro");
  });
  formE.addEventListener("change", function (e) {
    if (e.target.name === "modo") {
      est.modo = e.target.value;
      $$("[name=modo]", formE).forEach(function (r) { r.closest(".opcao").classList.toggle("on", r.checked); });
      $("#blocoEnvio").classList.toggle("oculto", est.modo !== "envio");
      if (est.modo === "retirada") est.frete = { tipo: "retirada", preco: 0, nome: "Retirada na loja" };
      else if (!est.frete || est.frete.tipo === "retirada") est.frete = null;
      salvarRascunho(); resumo();
    }
    if (e.target.name === "frete") {
      var o = est.opcoesFrete.filter(function (x) { return x.id === e.target.value; })[0];
      $$("[name=frete]", formE).forEach(function (r) { r.closest(".opcao").classList.toggle("on", r.checked); });
      est.frete = o ? { tipo: o.tipo, id: o.id, nome: o.nome, empresa: o.empresa, preco: o.preco, prazo: o.prazo, cep: digitos(cepEl.value) } : null;
      salvarRascunho(); resumo();
    }
  });

  function consultarFrete() {
    var v = digitos(cepEl.value);
    if (v.length !== 8) { aviso.className = "frete__aviso erro"; aviso.textContent = "Digite um CEP com 8 dígitos."; cepEl.focus(); return; }
    aviso.className = "frete__aviso"; aviso.textContent = "Consultando frete…";
    $("#calcular").disabled = true;
    api("/api/loja/frete", { cep: v, itens: itensApi() }).then(function (d) {
      est.opcoesFrete = (d.opcoes || []).filter(function (o) { return o.tipo === "melhorenvio" || o.tipo === "local"; });
      var reais = est.opcoesFrete.filter(function (o) { return o.tipo === "melhorenvio"; });
      var pendente = { id: "pendente", tipo: "envio", nome: "Frete a confirmar com nossa equipe", preco: null,
        detalhe: reais.length ? "Prefere que a equipe confirme o envio? Escolha esta opção." : (d.automatico && d.automatico.motivo ? d.automatico.motivo : "A equipe confirma valor e prazo no WhatsApp.") };
      est.opcoesFrete.push(pendente);
      aviso.textContent = reais.length ? "Escolha o envio:" : "Frete a confirmar com nossa equipe.";
      desenharOpcoesFrete(v);
    }).catch(function () {
      est.opcoesFrete = [{ id: "pendente", tipo: "envio", nome: "Frete a confirmar com nossa equipe", preco: null, detalhe: "Não conseguimos consultar o frete agora. A equipe confirma no WhatsApp." }];
      aviso.className = "frete__aviso"; aviso.textContent = "Frete a confirmar com nossa equipe.";
      desenharOpcoesFrete(v);
    }).then(function () { $("#calcular").disabled = false; });
  }
  function desenharOpcoesFrete(cep) {
    opcoesEl.innerHTML = est.opcoesFrete.map(function (o) {
      var valor = o.preco == null ? "<i>a confirmar</i>" : o.preco === 0 ? "grátis" : dinheiro(o.preco);
      return '<label class="opcao"><input type="radio" name="frete" value="' + LB.escapa(o.id) + '">' +
        '<span class="opcao__corpo" style="padding:0;border:0;background:none"><b>' + LB.escapa(o.nome) + (o.empresa && o.tipo === "melhorenvio" ? " · " + LB.escapa(o.empresa) : "") + '</b>' +
        '<span>' + LB.escapa(o.prazo ? "Prazo estimado: " + o.prazo + " dias úteis" : (o.detalhe || "")) + '</span></span>' +
        '<span class="opcao__valor">' + valor + '</span></label>';
    }).join("");
    opcoesEl.classList.remove("oculto");
    var sel = est.frete && est.frete.cep === cep ? est.frete.id : (est.opcoesFrete.length === 1 ? "pendente" : null);
    if (sel) { var r = opcoesEl.querySelector('[value="' + sel + '"]'); if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); } }
  }
  $("#calcular").addEventListener("click", consultarFrete);
  cepEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); consultarFrete(); } });
  cepEl.addEventListener("blur", function () {
    var v = digitos(cepEl.value);
    if (v.length !== 8 || !window.fetch) return;
    fetch("https://viacep.com.br/ws/" + v + "/json/").then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.erro) { aviso.className = "frete__aviso erro"; aviso.textContent = "Não encontramos este CEP. Confira os números."; return; }
      var set = function (n, val) { var el = campo(n); if (el && !el.value && val) el.value = val; };
      set("rua", d.logradouro); set("bairro", d.bairro); set("cidade", d.localidade); set("uf", d.uf);
    }).catch(function () { /* sem ViaCEP: a cliente digita */ });
  });

  function lerEntrega() {
    var g = function (n) { var el = campo(n); return el ? el.value.trim() : ""; };
    est.contato = { nome: g("nome"), fone: g("fone") };
    est.endereco = est.modo === "envio" ? { cep: digitos(cepEl.value), rua: g("rua"), numero: g("numero"), complemento: g("complemento"), bairro: g("bairro"), cidade: g("cidade"), uf: g("uf").toUpperCase() } : null;
  }
  function validarEntrega(silencioso) {
    lerEntrega();
    var m = silencioso ? function () { return false; } : marcar;
    if (!est.modo) { if (!silencioso) $("#erro2").textContent = "Escolha retirada na loja ou entrega."; return false; }
    if (est.contato.nome.length < 3) return m("nome", "Informe o seu nome completo.");
    if (digitos(est.contato.fone).length < 10) return m("fone", "Informe o telefone com DDD.");
    if (est.modo === "envio") {
      var e = est.endereco;
      if (e.cep.length !== 8) return m("cep", "Informe um CEP válido.");
      if (!e.rua) return m("rua", "Informe a rua.");
      if (!e.numero) return m("numero", "Informe o número.");
      if (!e.bairro) return m("bairro", "Informe o bairro.");
      if (!e.cidade) return m("cidade", "Informe a cidade.");
      if (!/^[A-Z]{2}$/.test(e.uf)) return m("uf", "Informe o estado com 2 letras (ex.: PE).");
      if (!est.frete || est.frete.tipo === "retirada") {
        est.frete = { id: "pendente", tipo: "envio", nome: "Frete a confirmar com nossa equipe", preco: null, cep: e.cep };
      }
    }
    if (!silencioso) $("#erro2").textContent = "";
    return true;
  }
  formE.addEventListener("submit", function (e) {
    e.preventDefault();
    if (validarEntrega(false)) { salvarRascunho(); irPara(3, true); }
  });

  /* -------------------------------------------------------- 3. pagamento */
  function desenharPagamentos() {
    if (LB.catalogoCarregando() && !(checkout().pagamentos && checkout().pagamentos.length)) {
      // opções da loja ainda chegando: mesmas caixas, como skeleton
      $("#opcoesPagamento").innerHTML = [0, 1, 2].map(function () {
        return '<div class="opcao" aria-hidden="true"><span class="opcao__corpo"><b>' + LB.esqTexto("9em") + '</b></span></div>';
      }).join("") + '<span class="so-leitor" role="status">Carregando formas de pagamento</span>';
      return;
    }
    var ops = (checkout().pagamentos && checkout().pagamentos.length) ? checkout().pagamentos : PAGAMENTOS_PADRAO;
    if (est.modo !== "retirada") ops = ops.filter(function (o) { return !/retirada/i.test(o); });
    if (est.pagamento && ops.indexOf(est.pagamento) < 0) est.pagamento = null;
    $("#opcoesPagamento").innerHTML = ops.map(function (o) {
      var on = est.pagamento === o;
      return '<label class="opcao' + (on ? " on" : "") + '"><input type="radio" name="pagamento" value="' + LB.escapa(o) + '"' + (on ? " checked" : "") + '>' +
        '<span class="opcao__corpo"><b>' + LB.escapa(o) + '</b></span></label>';
    }).join("");
    formP.querySelector("[name=observacao]").value = est.observacao || "";
  }
  formP.addEventListener("change", function (e) {
    if (e.target.name === "pagamento") {
      est.pagamento = e.target.value;
      $$("[name=pagamento]", formP).forEach(function (r) { r.closest(".opcao").classList.toggle("on", r.checked); });
      salvarRascunho();
    }
  });
  formP.addEventListener("submit", function (e) {
    e.preventDefault();
    est.observacao = formP.querySelector("[name=observacao]").value.trim();
    if (!est.pagamento) { $("#erro3").textContent = "Escolha como prefere pagar."; return; }
    $("#erro3").textContent = "";
    salvarRascunho(); irPara(4, true);
  });

  /* ---------------------------------------------------------- 4. revisão */
  function subtotal() { return LB.subtotalCarrinho(); }
  function totalConhecido() {
    var s = subtotal(), f = est.frete;
    if (s === null || !f || f.preco == null) return null;
    return s + f.preco;
  }
  function textoFrete(f) {
    if (!f) return "a escolher";
    if (f.tipo === "retirada") return "Retirada na loja";
    return f.preco == null ? "a confirmar" : (f.preco === 0 ? "grátis" : dinheiro(f.preco));
  }
  function desenharRevisao() {
    var s = subtotal(), t = totalConhecido(), e = est.endereco;
    $("#revisao").innerHTML = '<div class="revisao">' +
      '<div class="revisao__bloco"><h3>Produtos</h3>' + LB.estado.carrinho.map(function (it) {
        var p = buscaProduto(it.id) || { nome: it.id };
        return '<div class="revisao__linha"><span>' + it.qtd + '× ' + LB.escapa(p.nome) + '<small>Tam. ' + LB.escapa(it.tam) + ' · Cor ' + LB.escapa(p.cor || it.cor) + '</small></span>' +
          '<b>' + (temPreco(p) ? dinheiro(p.preco * it.qtd) : "a confirmar") + '</b></div>';
      }).join("") + '</div>' +
      '<div class="revisao__bloco"><h3>Entrega</h3><p>' + (est.modo === "retirada" ? "Retirada na loja" : LB.escapa(est.frete ? est.frete.nome : "Envio")) + '</p>' +
        (e ? '<p class="texto-peq">' + LB.escapa(e.rua + ", " + e.numero + (e.complemento ? " — " + e.complemento : "") + " · " + e.bairro + " · " + e.cidade + "/" + e.uf + " · CEP " + e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")) + '</p>' : '') + '</div>' +
      '<div class="revisao__bloco"><h3>Pagamento preferido</h3><p>' + LB.escapa(est.pagamento || "") + '</p><p class="texto-peq">Sem cobrança no site — a equipe envia o pagamento após confirmar.</p></div>' +
      '<div class="revisao__bloco"><h3>Seus dados</h3><p>' + LB.escapa(est.contato.nome) + ' · ' + LB.escapa(est.contato.fone) + '</p>' +
        (est.observacao ? '<p class="texto-peq">Observação: ' + LB.escapa(est.observacao) + '</p>' : '') + '</div>' +
      '<div class="revisao__totais">' +
        '<div><span>Subtotal</span><b>' + (s === null ? "a confirmar" : dinheiro(s)) + '</b></div>' +
        '<div><span>Frete</span><b>' + textoFrete(est.frete) + '</b></div>' +
        '<div class="total"><span>' + (t === null ? "Total (a confirmar)" : "Total") + '</span><b>' + (t === null ? (s === null ? "a confirmar" : dinheiro(s) + " + frete") : dinheiro(t)) + '</b></div>' +
      '</div>' +
      (t === null ? '<p class="texto-peq">O total final é confirmado pela equipe no WhatsApp.</p>' : '') +
    '</div>';
  }

  function resumo() {
    var n = LB.estado.carrinho.reduce(function (a, i) { return a + i.qtd; }, 0);
    var s = subtotal(), t = totalConhecido();
    $("#resumoPecas").textContent = n;
    $("#resumoFrete").textContent = est.modo ? textoFrete(est.frete) : "a escolher";
    $("#rotuloTotal").textContent = t === null ? "Total (a confirmar)" : "Total";
    if (s === null && n && LB.catalogoCarregando()) {
      // preços reais a caminho: skeleton em vez de "a confirmar" que depois troca
      $("#resumoSub").innerHTML = LB.esqTexto("5.5em");
      $("#resumoTotal").innerHTML = LB.esqTexto("6.5em");
      return;
    }
    LB.trocarSuave($("#resumoSub"), s === null ? "a confirmar" : dinheiro(s));
    LB.trocarSuave($("#resumoTotal"), t === null ? (s === null ? "a confirmar" : dinheiro(s) + " + frete") : dinheiro(t));
  }

  /* -------------------------------------------------------- enviar */
  function assinatura() {
    return JSON.stringify([itensApi(), est.modo, est.contato, est.endereco, est.frete && est.frete.id, est.pagamento, est.observacao]);
  }
  function chaveDoEnvio() {
    /* mesma sacola + mesmos dados -> mesma chave (sem solicitação duplicada) */
    var ass = assinatura(), guardado = null;
    try { guardado = JSON.parse(sessionStorage.getItem("pc_pedido_chave") || "null"); } catch (e) {}
    if (guardado && guardado.ass === ass) return guardado.chave;
    var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
    var chave = "w" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    try { sessionStorage.setItem("pc_pedido_chave", JSON.stringify({ ass: ass, chave: chave })); } catch (e) {}
    return chave;
  }

  function mensagemLocal() {
    /* Só usada se o servidor estiver fora do ar: mesmo formato, sem número de pedido. */
    var l = ["*PRETA CHIK — NOVO PEDIDO*", "", "Olá! Montei meu pedido pelo site da Preta Chik e gostaria de finalizar com atendimento exclusivo.", "", "*Meus produtos:*"];
    LB.estado.carrinho.forEach(function (it, i) {
      var p = buscaProduto(it.id) || { nome: it.id };
      l.push((i + 1) + ". " + p.nome, "Tamanho: " + it.tam, "Cor: " + (p.cor || it.cor), "Quantidade: " + it.qtd,
        "Valor: " + (temPreco(p) ? dinheiro(p.preco) : "a confirmar com a loja"), "");
    });
    var e = est.endereco;
    l.push("Entrega: " + (est.modo === "retirada" ? "Retirada na loja" : "Envio"));
    if (e) l.push("Endereço: " + e.rua + ", " + e.numero + (e.complemento ? " — " + e.complemento : "") + " · " + e.bairro + " · " + e.cidade + "/" + e.uf + " · CEP " + e.cep);
    l.push("Frete: " + (est.modo === "retirada" ? "sem frete (retirada)" : textoFrete(est.frete)));
    l.push("Pagamento preferido: " + est.pagamento);
    var s = subtotal(), t = totalConhecido();
    l.push("Subtotal: " + (s === null ? "a confirmar" : dinheiro(s)), "Total: " + (t === null ? "a confirmar" : dinheiro(t)), "Cliente: " + est.contato.nome);
    if (est.observacao) l.push("Observação: " + est.observacao);
    l.push("", "Gostaria de confirmar a disponibilidade e finalizar meu pedido. Obrigada!");
    return l.join("\n");
  }

  $("#finalizarWhats").addEventListener("click", function () {
    if (est.enviando) return;
    if (!validarSacola()) { irPara(1, true); return; }
    if (!validarEntrega(true)) { irPara(2, true); return; }
    if (!est.pagamento) { irPara(3, true); return; }
    est.enviando = true;
    var bt = $("#finalizarWhats"); bt.disabled = true; bt.querySelector("span").textContent = "Preparando seu pedido…";
    $("#erro4").textContent = "";
    /* A aba é aberta já no clique para o navegador não bloquear como pop-up. */
    var janela = null;
    try { janela = window.open("", "_blank"); } catch (x) { janela = null; }
    if (janela) { try { janela.document.write("<p style='font-family:sans-serif;padding:2rem'>Abrindo o WhatsApp da Preta Chik…</p>"); } catch (x) {} }
    var corpo = {
      chave: chaveDoEnvio(), itens: itensApi(), nome: est.contato.nome, fone: est.contato.fone,
      entrega: est.modo === "retirada" ? { tipo: "retirada" } : { tipo: "envio", opcaoId: est.frete && est.frete.id !== "pendente" ? est.frete.id : null },
      endereco: est.endereco, pagamento: est.pagamento, observacao: est.observacao
    };
    api("/api/loja/pedidos-whatsapp", corpo).then(function (d) {
      abrir(janela, d.url);
      confirmar({ codigo: d.codigo, url: d.url, mensagem: d.mensagem, registrado: true, conta: d.vinculadoAConta });
    }).catch(function (err) {
      var dd = err.dados || {};
      if (err.status && err.status < 500 && err.status !== 404) {
        /* erro de dados (peça esgotada, campo inválido): corrige antes de enviar */
        if (janela) try { janela.close(); } catch (x) {}
        $("#erro4").textContent = err.message + (dd.problemas ? " " + dd.problemas.map(function (p) { return (buscaProduto(p.id) || {}).nome + (p.tam ? " (" + p.tam + ")" : "") + ": " + p.motivo; }).join("; ") : "");
        return;
      }
      /* servidor indisponível: ainda abre a conversa, sem fingir que registrou */
      var msg = mensagemLocal();
      var url = "https://wa.me/" + whatsLoja() + "?text=" + encodeURIComponent(msg);
      abrir(janela, url);
      confirmar({ codigo: null, url: url, mensagem: msg, registrado: false });
    }).then(function () {
      est.enviando = false; bt.disabled = false; bt.querySelector("span").textContent = "Finalizar pedido pelo WhatsApp";
    });
  });

  function abrir(janela, url) {
    if (janela) { try { janela.location.href = url; return; } catch (x) {} }
    var w = null; try { w = window.open(url, "_blank"); } catch (x) {}
    if (!w) location.href = url;
  }

  function confirmar(r) {
    CONF.innerHTML = '<div class="confirmacao">' +
      '<span class="confirmacao__ico" aria-hidden="true">' + LB.ICO.zap + '</span>' +
      '<span class="em em--rosa">Pedido encaminhado</span>' +
      '<h2 class="t-1">' + (r.codigo ? "Pedido #" + LB.escapa(r.codigo) : "Pedido pronto para envio") + '</h2>' +
      '<p class="texto-medio">Abrimos o WhatsApp oficial da Preta Chik com o seu pedido. <b>Toque em enviar</b> na conversa para a nossa equipe começar o atendimento.</p>' +
      '<p class="texto-peq">O pedido ainda não está pago nem confirmado: a equipe confere disponibilidade, frete e total com você.' +
        (r.registrado ? (r.conta ? ' Você acompanha o status em <a class="lk" href="conta.html#atendimentos">Minha conta</a>.' : '') : ' (Não conseguimos registrar o pedido no sistema agora, mas a equipe atende normalmente pela conversa.)') + '</p>' +
      '<a class="bt bt--zap bt--largo" href="' + LB.escapa(r.url) + '" target="_blank" rel="noopener">' + LB.ICO.zap + '<span>Abrir o WhatsApp novamente</span></a>' +
      '<button class="bt bt--vazio bt--largo" type="button" id="copiarResumo">Copiar resumo do pedido</button>' +
      '<p class="texto-peq" id="copiado" aria-live="polite"></p>' +
      '<details class="confirmacao__msg"><summary>Ver a mensagem</summary><pre>' + LB.escapa(r.mensagem) + '</pre></details>' +
      '<div style="display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;margin-top:.4rem">' +
        '<a class="lk" href="loja.html">Continuar comprando</a>' +
        '<button class="lk" type="button" id="novaSacola" style="background:none;border:0;cursor:pointer">Esvaziar a sacola</button>' +
      '</div>' +
    '</div>';
    CONF.classList.remove("oculto");
    $("#copiarResumo").addEventListener("click", function () {
      var ok = function () { $("#copiado").textContent = "Resumo copiado. Cole na conversa do WhatsApp da loja."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.mensagem).then(ok, copiaManual);
      else copiaManual();
      function copiaManual() {
        var t = document.createElement("textarea"); t.value = r.mensagem; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); ok(); } catch (x) { $("#copiado").textContent = "Selecione a mensagem abaixo e copie."; }
        t.remove();
      }
    });
    $("#novaSacola").addEventListener("click", function () {
      LB.estado.carrinho = []; LB.gravarCarrinho(); LB.atualizarContadores(); LB.desenharGaveta();
      document.dispatchEvent(new CustomEvent("lb:carrinho"));
      try { sessionStorage.removeItem("pc_pedido_chave"); } catch (x) {}
      LB.toast("Sacola esvaziada");
    });
    try { CONF.focus({ preventScroll: true }); } catch (x) { CONF.focus(); }
    CONF.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  /* -------------------------------------------------------- esvaziar */
  $("#esvaziar").addEventListener("click", function () {
    if (!window.confirm("Esvaziar a sacola?")) return;
    LB.estado.carrinho = []; LB.gravarCarrinho(); LB.atualizarContadores(); LB.desenharGaveta();
    document.dispatchEvent(new CustomEvent("lb:carrinho"));
    LB.toast("Sacola esvaziada");
  });

  /* ------------------------------------------------ cliente logada */
  function preencherCliente() {
    if (location.protocol === "file:") return;
    api("/api/auth/me").then(function (d) {
      if (!d || !d.cliente) return;
      var set = function (n, v) { var el = campo(n); if (el && !el.value && v) el.value = v; };
      set("nome", d.cliente.nome); set("fone", d.cliente.whatsapp);
      return api("/api/conta/enderecos").then(function (r) {
        var e = (r.enderecos || []).filter(function (x) { return x.principal; })[0];
        if (!e) return;
        if (!cepEl.value) cepEl.value = e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
        set("rua", e.rua); set("numero", e.numero); set("complemento", e.complemento); set("bairro", e.bairro); set("cidade", e.cidade); set("uf", e.uf);
      });
    }).catch(function () { /* visitante */ });
  }

  /* --------------------------------------------- restaurar rascunho */
  function restaurar() {
    if (est.contato) { campo("nome").value = est.contato.nome || ""; campo("fone").value = est.contato.fone || ""; }
    if (est.endereco) {
      var e = est.endereco;
      cepEl.value = (e.cep || "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
      ["rua", "numero", "complemento", "bairro", "cidade", "uf"].forEach(function (k) { campo(k).value = e[k] || ""; });
    }
    if (est.modo) {
      var r = formE.querySelector('[name=modo][value="' + est.modo + '"]');
      if (r) { r.checked = true; r.closest(".opcao").classList.add("on"); }
      $("#blocoEnvio").classList.toggle("oculto", est.modo !== "envio");
    }
    infoRetirada();
  }
  function infoRetirada() {
    var ret = checkout().retirada;
    if (ret && ret.detalhe) $("#infoRetirada").textContent = ret.detalhe;
  }

  /* ----------------------------------------------------------- início */
  desenhar();
  restaurar();
  preencherCliente();
  irPara(1, false);
  document.addEventListener("lb:carrinho", function () {
    desenhar();
    if (est.frete && est.frete.tipo !== "retirada" && est.frete.preco != null) {
      est.frete = null; opcoesEl.classList.add("oculto"); aviso.textContent = "Sacola alterada: consulte o frete de novo.";
    }
    if (est.passo > 1) irPara(1, false);
    resumo();
  });
  document.addEventListener("lb:catalogo", function () { desenhar(); infoRetirada(); if (est.passo === 3) desenharPagamentos(); });
})();
