/* ==========================================================================
   sacola.js — página da sacola: as duas formas de finalizar
   --------------------------------------------------------------------------
   A) Finalizar pelo site  -> POST /api/loja/pedidos
      Só para peças com valor e estoque confirmados no painel. O servidor
      recalcula tudo (preço, estoque, frete, cupom) — o que o navegador
      mostra é prévia.
   B) Atendimento exclusivo -> POST /api/loja/atendimentos
      Registra a solicitação (código AT-...), abre o WhatsApp oficial com a
      sacola organizada e MANTÉM a sacola. Abrir o WhatsApp não confirma
      pedido nem pagamento.
   ========================================================================== */

(function () {
  "use strict";

  LB.iniciar({ pagina: "sacola" });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LISTA = $("#listaItens"), WRAP = $("#sacolaWrap"), VAZIA = $("#sacolaVaziaWrap"), CONF = $("#confirmacao");
  var formSite = $("#formSite"), formAt = $("#formAtendimento");
  var estado = { modo: null, frete: null, opcoes: [], cupom: null, desconto: 0, cliente: null, enviando: false, chaveSite: novaChave(), chaveAt: novaChave() };

  function novaChave() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return "w" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function digitos(v) { return String(v || "").replace(/\D/g, ""); }
  function itensApi() {
    return LB.estado.carrinho.map(function (it) {
      var p = buscaProduto(it.id);
      return { id: it.id, tam: it.tam, cor: p ? p.cor : it.cor, qtd: it.qtd };
    });
  }
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

  /* ---------------------------------------------------- elegibilidade */
  function problemasSite() {
    var lista = [];
    LB.estado.carrinho.forEach(function (it) {
      var p = buscaProduto(it.id);
      if (!p) return;
      if (!temPreco(p)) { lista.push(p.nome + " — valor ainda não cadastrado no site"); return; }
      var sit = situacaoTamanho(p, it.tam), est = null;
      (p.tamanhos || []).forEach(function (t) { if (t.tam === it.tam) est = t.estoque; });
      if (sit === "esgotado") lista.push(p.nome + " (" + it.tam + ") — esgotado");
      else if (sit === "consulta") lista.push(p.nome + " (" + it.tam + ") — disponibilidade confirmada só no atendimento");
      else if (est !== null && est < it.qtd) lista.push(p.nome + " (" + it.tam + ") — só " + est + " em estoque");
    });
    return lista;
  }

  /* ------------------------------------------------------- desenhar */
  function desenhar() {
    var itens = LB.estado.carrinho;
    if (!itens.length) {
      WRAP.classList.add("oculto");
      if (!CONF.classList.contains("oculto")) { VAZIA.innerHTML = ""; return; }
      VAZIA.innerHTML = '<div class="carrinho__vazio" style="border:1px solid var(--linha);border-radius:5px;margin-bottom:clamp(3rem,7vw,6rem)">' +
        LB.ICO.sacola + '<b>Sua sacola está vazia</b>' +
        '<p class="texto-peq">As peças que você escolher aparecem aqui.</p>' +
        '<a class="bt bt--rosa bt--pequeno" href="loja.html?cat=novidades">Ver novidades</a></div>';
      return;
    }
    WRAP.classList.remove("oculto");
    VAZIA.innerHTML = "";
    LISTA.innerHTML = itens.map(function (it) {
      var p = buscaProduto(it.id);
      if (!p) return "";
      var sit = situacaoTamanho(p, it.tam);
      var aviso = sit === "esgotado" ? '<span class="item__aviso">Tamanho esgotado — fale com a loja ou troque o tamanho</span>' : "";
      return '<div class="item">' +
        '<div class="item__foto"><div class="midia"><img src="' + fotoProduto(p, "a") + '" alt="' + LB.escapa(p.nome) + '" width="720" height="900"></div></div>' +
        '<div class="item__corpo">' +
          '<h3><a href="produto.html?id=' + p.id + '">' + LB.escapa(p.nome) + '</a></h3>' +
          '<p class="item__atrib">' + LB.escapa(p.cor || it.cor) + ' · Tam. ' + LB.escapa(it.tam) + '</p>' + aviso +
          '<div class="item__linha">' +
            '<span class="passo">' +
              '<button type="button" data-qtd="-1" data-k="' + LB.escapa(it.k) + '" aria-label="Diminuir">−</button>' +
              '<span>' + it.qtd + '</span>' +
              '<button type="button" data-qtd="1" data-k="' + LB.escapa(it.k) + '" aria-label="Aumentar">+</button>' +
            '</span>' +
            '<button class="item__remover" type="button" data-remover="' + LB.escapa(it.k) + '">Remover</button>' +
          '</div>' +
        '</div>' +
        '<div class="item__preco">' + (temPreco(p) ? '<span class="preco">' + dinheiro(p.preco * it.qtd) + '</span><em>' + it.qtd + ' × ' + dinheiro(p.preco) + '</em>' : LB.precoHTML(p) + '<em>' + it.qtd + ' × peça</em>') + '</div>' +
      '</div>';
    }).join("");
    resumo();
    pintarBloqueio();
  }

  function resumo() {
    var n = LB.estado.carrinho.reduce(function (s, i) { return s + i.qtd; }, 0);
    var sub = LB.subtotalCarrinho();
    $("#resumoPecas").textContent = n;
    $("#resumoSub").textContent = sub === null ? "sob consulta" : dinheiro(sub);
    var temDesc = estado.cupom && estado.desconto > 0 && sub !== null;
    $("#linhaDesconto").classList.toggle("oculto", !temDesc);
    if (temDesc) { $("#resumoDesconto").textContent = "− " + dinheiro(estado.desconto); $("#cupomAplicado").textContent = "(" + estado.cupom + ")"; }
    var f = estado.frete;
    $("#linhaFrete").style.display = f ? "flex" : "none";
    if (f) $("#resumoFrete").textContent = f.preco === null ? "a combinar" : f.preco === 0 ? "grátis" : dinheiro(f.preco);
    var total = sub === null || (f && f.preco === null) ? null : sub - (temDesc ? estado.desconto : 0) + (f ? f.preco : 0);
    $("#resumoTotal").textContent = total === null ? "sob consulta" : dinheiro(total) + (f ? "" : " + entrega");
  }

  function pintarBloqueio() {
    var prob = problemasSite();
    var caixa = $("#siteBloqueio");
    formSite.classList.toggle("oculto", prob.length > 0);
    caixa.innerHTML = prob.length ? '<div class="aviso-compra">' +
      '<b>Para estas peças, a finalização é feita com a nossa equipe</b>' +
      '<ul>' + prob.map(function (x) { return "<li>" + LB.escapa(x) + "</li>"; }).join("") + "</ul>" +
      '<p class="texto-peq">No atendimento exclusivo a loja confirma valor e disponibilidade na hora e fecha o pedido com você.</p>' +
      '<button class="bt bt--zap bt--largo" type="button" data-modo="atendimento">Receber atendimento exclusivo no WhatsApp</button></div>' : "";
  }

  /* ----------------------------------------------------------- modo */
  function escolherModo(modo, rolar) {
    estado.modo = modo;
    $$("[role=tab][data-modo]").forEach(function (b) {
      var on = b.getAttribute("data-modo") === modo;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.classList.toggle("on", on);
    });
    $("#painelSite").classList.toggle("oculto", modo !== "site");
    $("#painelAtendimento").classList.toggle("oculto", modo !== "atendimento");
    if (history.replaceState) history.replaceState(null, "", "#" + modo);
    if (rolar) {
      var alvo = modo === "site" ? $("#painelSite") : $("#painelAtendimento");
      alvo.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-modo]");
    if (b) { e.preventDefault(); escolherModo(b.getAttribute("data-modo"), true); }
    var f = e.target.closest("[data-finalizar]");
    if (f) {
      /* gaveta aberta nesta mesma página: fecha e vai direto ao painel */
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      escolherModo(f.getAttribute("data-finalizar"), true);
    }
  });

  /* ------------------------------------------------------------- frete */
  var cepEl = $("#cep"), aviso = $("#freteAviso"), opcoesEl = $("#freteOpcoes");
  function mascaraCep(el) {
    el.addEventListener("input", function () {
      var v = digitos(el.value).slice(0, 8);
      el.value = v.length > 5 ? v.slice(0, 5) + "-" + v.slice(5) : v;
    });
  }
  mascaraCep(cepEl); mascaraCep(formAt.querySelector("[name=cep]"));

  function calcularFrete() {
    var v = digitos(cepEl.value);
    if (v.length !== 8) { aviso.className = "frete__aviso erro"; aviso.textContent = "Digite um CEP com 8 dígitos."; cepEl.focus(); return; }
    aviso.className = "frete__aviso"; aviso.textContent = "Consultando opções de entrega…";
    $("#calcular").disabled = true;
    api("/api/loja/frete", { cep: v, itens: itensApi() }).then(function (d) {
      estado.opcoes = d.opcoes || [];
      estado.frete = null;
      var pagaveis = estado.opcoes.filter(function (o) { return o.pagavelNoSite; });
      aviso.textContent = (d.automatico && !d.automatico.disponivel && d.automatico.motivo ? d.automatico.motivo + " " : "") +
        (pagaveis.length ? "Escolha como receber:" : "");
      opcoesEl.innerHTML = estado.opcoes.map(function (o) {
        var valor = o.preco === null ? "<i>a combinar</i>" : o.preco === 0 ? "grátis" : dinheiro(o.preco);
        return '<label class="opcao' + (o.pagavelNoSite ? "" : " opcao--mudo") + '">' +
          '<input type="radio" name="entrega" value="' + LB.escapa(o.id) + '"' + (o.pagavelNoSite ? "" : " disabled") + '>' +
          '<span class="opcao__corpo" style="padding:0;border:0;background:none"><b>' + LB.escapa(o.nome) + (o.empresa && o.tipo === "melhorenvio" ? " · " + LB.escapa(o.empresa) : "") + '</b>' +
          '<span>' + LB.escapa(o.detalhe || (o.prazo ? "Prazo estimado: " + o.prazo + " dias úteis" : "")) +
          (o.pagavelNoSite ? "" : " Disponível pelo atendimento exclusivo.") + '</span></span>' +
          '<span class="opcao__valor">' + valor + '</span></label>';
      }).join("");
      opcoesEl.classList.remove("oculto");
      resumo();
    }).catch(function (e) {
      aviso.className = "frete__aviso erro";
      aviso.textContent = e.message + " Você também pode finalizar com o atendimento exclusivo.";
    }).then(function () { $("#calcular").disabled = false; });
  }
  $("#calcular").addEventListener("click", calcularFrete);
  cepEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); calcularFrete(); } });

  document.addEventListener("change", function (e) {
    if (e.target.name === "entrega") {
      $$("[name=entrega]").forEach(function (r) { r.closest(".opcao").classList.toggle("on", r.checked); });
      estado.frete = estado.opcoes.filter(function (o) { return o.id === e.target.value; })[0] || null;
      $("#blocoEndereco").classList.toggle("oculto", !estado.frete || estado.frete.tipo === "retirada");
      resumo();
    }
    if (e.target.name === "pgto") {
      $$("[name=pgto]").forEach(function (r) { r.closest(".opcao").classList.toggle("on", r.checked); });
    }
  });

  /* ------------------------------------------------------------- cupom */
  $("#aplicarCupom").addEventListener("click", function () {
    var c = $("#cupom").value.trim();
    var msg = $("#cupomMsg");
    if (!c) { estado.cupom = null; estado.desconto = 0; msg.textContent = ""; resumo(); return; }
    if (LB.subtotalCarrinho() === null) { msg.textContent = "O cupom é aplicado pela loja no atendimento quando a peça ainda não tem valor no site."; return; }
    msg.textContent = "Conferindo cupom…";
    api("/api/loja/cupom", { codigo: c, itens: itensApi() }).then(function (d) {
      estado.cupom = d.codigo; estado.desconto = d.desconto || 0;
      msg.textContent = d.freteGratis ? "Cupom de frete grátis aplicado." : "Cupom aplicado: − " + dinheiro(estado.desconto);
      resumo();
    }).catch(function (e) { estado.cupom = null; estado.desconto = 0; msg.textContent = e.message; resumo(); });
  });

  /* ------------------------------------------------- finalizar pelo site */
  function marcarErro(nome, msg) {
    var el = formSite.querySelector("[name=" + nome + "]");
    if (!el) { $("#erroSite").textContent = msg; return; }
    el.classList.add("entrada--erro");
    var c = el.closest(".campo"); if (c) c.classList.add("tem-erro");
    el.focus();
    $("#erroSite").textContent = msg;
  }
  formSite.addEventListener("input", function (e) {
    e.target.classList.remove("entrada--erro");
    var c = e.target.closest(".campo"); if (c) c.classList.remove("tem-erro");
  });

  formSite.addEventListener("submit", function (e) {
    e.preventDefault();
    if (estado.enviando) return;
    $("#erroSite").textContent = "";
    var g = function (n) { var el = formSite.querySelector("[name=" + n + "]"); return el ? el.value.trim() : ""; };
    if (g("nome").length < 3) return marcarErro("nome", "Informe o seu nome completo.");
    if (digitos(g("fone")).length < 10) return marcarErro("fone", "Informe o seu WhatsApp com DDD.");
    if (!estado.frete) { cepEl.focus(); $("#erroSite").textContent = "Calcule o frete pelo CEP e escolha a entrega."; return; }
    var corpo = {
      chave: estado.chaveSite,
      itens: itensApi(),
      contato: { nome: g("nome"), fone: g("fone"), email: g("email") },
      entrega: { id: estado.frete.id },
      cupom: estado.cupom,
      pagamento: { metodo: (formSite.querySelector("[name=pgto]:checked") || {}).value || "pix" },
      observacao: g("observacao"),
      salvarEndereco: !!(formSite.querySelector("[name=salvarEndereco]") || {}).checked
    };
    if (estado.frete.tipo !== "retirada") {
      corpo.endereco = { cep: digitos(cepEl.value), rua: g("rua"), numero: g("numero"), complemento: g("complemento"), bairro: g("bairro"), cidade: g("cidade"), uf: g("uf") };
    }
    estado.enviando = true;
    var bt = $("#confirmarSite"); bt.disabled = true; bt.textContent = "Enviando pedido…";
    api("/api/loja/pedidos", corpo).then(function (d) {
      confirmarPedido(d.pedido, d.whatsapp);
    }).catch(function (err) {
      var d = err.dados || {};
      if (d.campo) marcarErro(d.campo, err.message);
      else $("#erroSite").textContent = err.message;
      if (d.problemas && d.problemas.length) {
        LB.catalogo && LB.toast("Algumas peças mudaram de disponibilidade. Confira a sacola.");
      }
    }).then(function () { estado.enviando = false; bt.disabled = false; bt.textContent = "Confirmar pedido"; });
  });

  function confirmarPedido(p, whats) {
    var texto = "Olá, Preta Chik! Acabei de fazer o pedido " + p.codigo + " pelo site (" + (p.total != null ? dinheiro(p.total) : "") + "). Pode me enviar o pagamento?";
    CONF.innerHTML = '<div class="confirmacao">' +
      '<span class="confirmacao__ico" aria-hidden="true">' + LB.ICO.check + '</span>' +
      '<span class="em em--rosa">Pedido recebido</span>' +
      '<h2 class="t-1">Pedido ' + LB.escapa(p.codigo) + '</h2>' +
      '<p class="texto-medio">Recebemos o seu pedido e as peças foram reservadas. Status: <b>' + LB.escapa(p.statusNome) + '</b>.</p>' +
      '<div class="confirmacao__resumo">' +
        p.itens.map(function (i) { return '<div><span>' + i.qtd + '× ' + LB.escapa(i.nome) + ' · ' + LB.escapa(i.tam) + '</span><b>' + dinheiro(i.total) + '</b></div>'; }).join("") +
        (p.desconto ? '<div><span>Desconto</span><b>− ' + dinheiro(p.desconto) + '</b></div>' : '') +
        '<div><span>' + LB.escapa(p.entrega ? p.entrega.nome : "Entrega") + '</span><b>' + (p.frete ? dinheiro(p.frete) : "grátis") + '</b></div>' +
        '<div class="total"><span>Total</span><b>' + dinheiro(p.total) + '</b></div>' +
      '</div>' +
      (p.linkPagamento
        ? '<a class="bt bt--rosa bt--largo" href="' + LB.escapa(p.linkPagamento) + '" target="_blank" rel="noopener">Pagar agora</a>'
        : '<p class="texto-peq">A Preta Chik confere o pedido e envia o <b>Pix ou o link de pagamento</b> pelo WhatsApp. O pedido só é marcado como pago depois da confirmação do pagamento.</p>') +
      '<a class="bt bt--zap bt--largo" href="https://wa.me/' + digitos(whats) + '?text=' + encodeURIComponent(texto) + '" target="_blank" rel="noopener">' + LB.ICO.zap + '<span>Falar com a loja sobre o pedido</span></a>' +
      '<a class="bt bt--vazio bt--largo" href="conta.html#pedidos">Acompanhar na minha conta</a>' +
      '<a class="lk" href="loja.html" style="display:inline-block;margin-top:1rem">Continuar comprando</a>' +
    '</div>';
    CONF.classList.remove("oculto");
    LB.estado.carrinho = [];
    LB.gravarCarrinho();
    LB.atualizarContadores(); LB.desenharGaveta();
    document.dispatchEvent(new CustomEvent("lb:carrinho"));
    estado.chaveSite = novaChave();
    desenhar();
    CONF.focus();
    window.scrollTo({ top: 0 });
  }

  /* --------------------------------------------- atendimento exclusivo */
  function mensagemLocal(nome, cep, obs) {
    var l = ["Olá, Preta Chik! Quero finalizar minha compra com atendimento exclusivo.", ""];
    if (nome) l.push("Nome: " + nome);
    l.push("*Peças escolhidas:*");
    LB.estado.carrinho.forEach(function (it, i) {
      var p = buscaProduto(it.id);
      l.push((i + 1) + ". " + (p ? p.nome : it.id) + " — Tam. " + it.tam + " · " + it.qtd + "x");
    });
    if (cep) l.push("CEP: " + cep);
    if (obs) { l.push(""); l.push("Observação: " + obs); }
    return l.join("\n");
  }

  formAt.addEventListener("submit", function (e) {
    e.preventDefault();
    if (estado.enviando) return;
    var nome = formAt.querySelector("[name=nome]").value.trim();
    var cep = digitos(formAt.querySelector("[name=cep]").value);
    var obs = formAt.querySelector("[name=observacao]").value.trim();
    $("#erroAtendimento").textContent = "";
    /* A janela é aberta já no clique (antes da resposta) para não ser
       bloqueada como pop-up; o endereço é definido quando a API responder. */
    var janela = null;
    try { janela = window.open("", "_blank"); } catch (x) { janela = null; }
    if (janela) { try { janela.document.write("<p style='font-family:sans-serif;padding:2rem'>Abrindo o WhatsApp da Preta Chik…</p>"); } catch (x) {} }
    estado.enviando = true;
    var bt = $("#abrirAtendimento"); bt.disabled = true;
    api("/api/loja/atendimentos", {
      chave: estado.chaveAt, itens: itensApi(), nome: nome, cep: cep,
      observacao: obs, fone: estado.cliente ? estado.cliente.whatsapp : undefined,
      email: estado.cliente ? estado.cliente.email : undefined
    }).then(function (d) {
      if (janela) janela.location.href = d.url; else location.href = d.url;
      confirmarAtendimento(d);
    }).catch(function (err) {
      /* Sem servidor: ainda abrimos a conversa, mas dizemos a verdade —
         a solicitação não ficou registrada no sistema da loja. */
      var url = "https://wa.me/5581984023286?text=" + encodeURIComponent(mensagemLocal(nome, cep, obs));
      if (janela) janela.location.href = url; else window.open(url, "_blank");
      $("#erroAtendimento").textContent = "Abrimos o WhatsApp com a sua sacola, mas não consegui registrar a solicitação no sistema (" + err.message + "). A loja atende você normalmente pela conversa.";
    }).then(function () { estado.enviando = false; bt.disabled = false; });
  });

  function confirmarAtendimento(d) {
    var caixa = document.createElement("div");
    caixa.className = "confirmacao confirmacao--zap";
    caixa.innerHTML = '<span class="confirmacao__ico" aria-hidden="true">' + LB.ICO.zap + '</span>' +
      '<span class="em em--rosa">Atendimento exclusivo solicitado</span>' +
      '<h3 class="t-2">Solicitação ' + LB.escapa(d.codigo) + '</h3>' +
      '<p class="texto-peq">A conversa foi aberta no WhatsApp oficial da Preta Chik com a sua sacola. Envie a mensagem para a equipe começar o atendimento. ' +
      'Sua sacola continua salva aqui' + (d.vinculadoAConta ? " e a solicitação aparece em <a class=\"lk\" href=\"conta.html#atendimentos\">Minha conta</a>." : ".") + '</p>' +
      '<a class="bt bt--zap bt--largo" href="' + LB.escapa(d.url) + '" target="_blank" rel="noopener">' + LB.ICO.zap + '<span>Abrir o WhatsApp novamente</span></a>';
    var antigo = $("#painelAtendimento .confirmacao"); if (antigo) antigo.remove();
    $("#painelAtendimento").insertBefore(caixa, formAt);
    caixa.setAttribute("tabindex", "-1"); caixa.focus();
  }

  /* ------------------------------------------------ cliente logada (opcional) */
  function preencherCliente() {
    if (location.protocol === "file:") return;
    api("/api/auth/me").then(function (d) {
      if (!d || !d.cliente) return;
      estado.cliente = d.cliente;
      var set = function (f, n, v) { var el = f.querySelector("[name=" + n + "]"); if (el && !el.value && v) el.value = v; };
      set(formSite, "nome", d.cliente.nome); set(formSite, "email", d.cliente.email); set(formSite, "fone", d.cliente.whatsapp);
      set(formAt, "nome", d.cliente.nome);
      $("#linhaSalvarEndereco").classList.remove("oculto");
      return api("/api/conta/enderecos").then(function (e) {
        var end = (e.enderecos || []).filter(function (x) { return x.principal; })[0];
        if (!end) return;
        if (!cepEl.value) cepEl.value = end.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
        set(formSite, "rua", end.rua); set(formSite, "numero", end.numero); set(formSite, "complemento", end.complemento);
        set(formSite, "bairro", end.bairro); set(formSite, "cidade", end.cidade); set(formSite, "uf", end.uf);
        set(formAt, "cep", end.cep);
      });
    }).catch(function () { /* visitante: segue sem pré-preenchimento */ });
  }

  /* ViaCEP só ajuda a preencher; se falhar, a pessoa digita. */
  cepEl.addEventListener("blur", function () {
    var v = digitos(cepEl.value);
    if (v.length !== 8 || !window.fetch) return;
    fetch("https://viacep.com.br/ws/" + v + "/json/").then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.erro) return;
      var set = function (n, val) { var el = formSite.querySelector("[name=" + n + "]"); if (el && !el.value && val) el.value = val; };
      set("rua", d.logradouro); set("bairro", d.bairro); set("cidade", d.localidade); set("uf", d.uf);
    }).catch(function () {});
  });

  /* -------------------------------------------------------- esvaziar */
  $("#esvaziar").addEventListener("click", function () {
    if (!window.confirm("Esvaziar a sacola?")) return;
    LB.estado.carrinho = [];
    LB.gravarCarrinho();
    LB.atualizarContadores(); LB.desenharGaveta();
    document.dispatchEvent(new CustomEvent("lb:carrinho"));
    LB.toast("Sacola esvaziada");
  });

  /* ----------------------------------------------------------- início */
  desenhar();
  document.addEventListener("lb:carrinho", function () {
    desenhar();
    estado.cupom && estado.desconto && (estado.desconto = 0, estado.cupom = null, $("#cupomMsg").textContent = "Sacola alterada: aplique o cupom de novo.");
    if (estado.frete) { estado.frete = null; opcoesEl.classList.add("oculto"); aviso.textContent = "Sacola alterada: calcule o frete de novo."; resumo(); }
  });
  document.addEventListener("lb:catalogo", desenhar);
  preencherCliente();
  var inicial = (location.hash || "").replace("#", "");
  if (inicial === "site" || inicial === "atendimento") escolherModo(inicial, false);
})();
