/* ==========================================================================
   conta-app.js — motor da AREA DO CLIENTE
   --------------------------------------------------------------------------
   Monta as secoes dentro de #painelConta e cuida da navegacao por hash.

   DE ONDE VEM CADA COISA — a divisao que este arquivo respeita:

   1. AUTENTICACAO e DADOS PESSOAIS sao REAIS. Quem decide se esta tela
      abre e o servidor: `CONTA_API.AUTH.eu()` pergunta a /api/auth/me e,
      se nao houver sessao valida, a pessoa vai para login.html. Nao existe
      mais interruptor de demonstracao — antes havia um botao "Ver a area da
      cliente" que abria esta tela sem sessao nenhuma; isso era uma porta
      falsa e foi removido. O token da sessao mora num cookie HttpOnly: este
      codigo NAO consegue le-lo, e nada de sessao fica em localStorage.

   2. PEDIDOS, ATENDIMENTOS e ENDERECOS tambem sao REAIS: vem de
      CONTA_API.LOJA (/api/conta/*), com a mesma sessao. Nao existe mais
      dado de demonstracao nesta tela — se a cliente nao tem pedido, a tela
      diz que nao tem, em vez de mostrar exemplo.

   3. DINHEIRO: a API manda centavos inteiros ou null. null = "sob
      consulta" (a loja ainda nao cadastrou preco). Esta tela nunca soma,
      estima ou inventa valor: so formata o que o servidor mandou.

   4. FAVORITOS e SACOLA sao sincronizados com o servidor por
      conta-sync.js (CONTA_SYNC), iniciado aqui depois que a sessao e
      confirmada.
   ========================================================================== */

var CONTA_APP = (function () {

  "use strict";

  /* ------------------------------------------------------------- estado
     Cada colecao tem tres estados: null = carregando, [] / [..] = pronta,
     e um erro separado (texto) quando a API falhou.                       */
  var S = {
    cliente: null,
    pedidos: null,
    erroPedidos: "",
    statusPedido: {},
    atendimentos: null,
    erroAtendimentos: "",
    statusAtendimento: {},
    enderecos: null,
    erroEnderecos: "",
    detalhes: {},          /* codigo -> { carregando, dados, erro } */
    secao: "visao",
    pedidoAberto: null,
    enderecoEditando: null,
    /* So vira true depois que o SERVIDOR confirmou a sessao em
       /api/auth/me. Enquanto for false, a area da cliente nao pode ser
       montada nem abrir rota por hash — e o guarda que impede a tela de
       existir sem autenticacao.                                          */
    entrou: false
  };

  var R = {}; /* referencias do DOM */

  /* secoes com formulario: nao sao redesenhadas quando um dado chega em
     segundo plano, para nao apagar o que a pessoa esta digitando.        */
  var SECOES_FORM = { endereco: 1, dados: 1, seguranca: 1 };

  /* ---------------------------------------------------------- utilitarios */
  function escapa(t) { return LB.escapa(t == null ? "" : t); }

  function sel(raiz, s) { return (raiz || document).querySelector(s); }
  function todos(raiz, s) { return Array.prototype.slice.call((raiz || document).querySelectorAll(s)); }

  function icone(nome, cls) {
    return '<span class="' + (cls || "cx-ic") + '" aria-hidden="true">' + CONTA_UI.svg(nome) + "</span>";
  }

  function msgDe(falha, padrao) {
    return (falha && (falha.mensagem || falha.message)) || padrao;
  }

  /* O projeto nao inventa preco. null = "Valor sob consulta", exatamente o
     mesmo texto do site publico. Numero = centavos vindos do servidor.    */
  function dinheiro(cents) {
    if (cents == null || isNaN(cents)) return '<span class="consulta">Valor sob consulta</span>';
    var v = (Number(cents) / 100).toFixed(2).split(".");
    return "R$ " + v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + v[1];
  }

  function paraData(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  function dataCurta(iso) {
    var d = paraData(iso);
    if (!d) return CONTA_UI.dataBR(iso);
    return d.toLocaleDateString("pt-BR");
  }
  function dataHora(iso) {
    var d = paraData(iso);
    if (!d) return "";
    return d.toLocaleDateString("pt-BR") + " às " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  /* --------------------------------------------------------- status */
  function tipoPedido(st) {
    if (st === "cancelado" || st === "reembolsado") return "cancelado";
    if (st === "entregue" || st === "concluido") return "ok";
    if (st === "aguardando_pagamento") return "alerta";
    return "andamento";
  }
  function tipoAtendimento(st) {
    if (st === "cancelado") return "cancelado";
    if (st === "concluido") return "ok";
    if (st === "aguardando_pagamento") return "alerta";
    return "andamento";
  }
  /* nomes de reserva — os oficiais chegam da API junto com cada lista */
  var NOMES_PEDIDO = {
    aguardando_pagamento: "Aguardando pagamento", pago: "Pago", em_separacao: "Em separação",
    enviado: "Enviado", entregue: "Entregue", concluido: "Concluído", cancelado: "Cancelado",
    reembolsado: "Reembolsado"
  };
  var NOMES_ATENDIMENTO = {
    aguardando_atendimento: "Aguardando atendimento", em_atendimento: "Em atendimento",
    aguardando_confirmacao: "Aguardando confirmação", aguardando_pagamento: "Aguardando pagamento",
    pago: "Pago", em_separacao: "Em separação", enviado: "Enviado", concluido: "Concluído",
    cancelado: "Cancelado"
  };
  function nomeStatusPedido(st) { return S.statusPedido[st] || NOMES_PEDIDO[st] || st || "—"; }
  function nomeStatusAtendimento(st) { return S.statusAtendimento[st] || NOMES_ATENDIMENTO[st] || st || "—"; }

  function seloPedido(p) {
    return '<span class="cx-selo cx-selo--' + tipoPedido(p.status) + '">' +
      escapa(p.statusNome || nomeStatusPedido(p.status)) + "</span>";
  }
  function seloAtendimento(a) {
    return '<span class="cx-selo cx-selo--' + tipoAtendimento(a.status) + '">' +
      escapa(a.statusNome || nomeStatusAtendimento(a.status)) + "</span>";
  }

  function aguardaPagamento(p) {
    return p.status === "aguardando_pagamento";
  }
  function atendimentoAtivo(a) {
    return a.status !== "concluido" && a.status !== "cancelado";
  }

  var PAGAMENTO_NOME = {
    pendente: "Aguardando pagamento",
    aprovado: "Pagamento aprovado",
    estornado: "Pagamento estornado",
    recusado: "Pagamento recusado"
  };

  /* --------------------------------------------------------- itens */
  function itensDe(x) { return (x && x.itens) || []; }

  function qtdItens(x) {
    return itensDe(x).reduce(function (s, i) { return s + (Number(i.qtd) || 0); }, 0);
  }

  function resumoPecas(x) {
    var n = qtdItens(x);
    return n === 1 ? "1 peça" : n + " peças";
  }

  /* nomes longos nao podem quebrar o cartao no celular */
  function tituloItens(x) {
    var nomes = itensDe(x).map(function (i) { return i.nome || "Peça"; });
    if (!nomes.length) return "Sem peças registradas";
    if (nomes.length === 1) return nomes[0];
    if (nomes.length === 2) return nomes[0] + " e " + nomes[1];
    return nomes[0] + " e mais " + (nomes.length - 1) + " peças";
  }

  function detalheItem(i) {
    var p = [];
    if (i.cor) p.push(i.cor);
    if (i.tam) p.push("Tamanho " + i.tam);
    p.push("Quantidade " + (i.qtd || 1));
    return p.join(" · ");
  }

  /* foto so quando a peca existe no catalogo do site; senao, nada (nao
     inventamos imagem para peca que o site nao conhece).                 */
  function fotoItem(i, w, h) {
    var prod = (typeof buscaProduto === "function" && i && i.id) ? buscaProduto(i.id) : null;
    if (!prod) return "";
    return '<img src="' + escapa(LB.img("card", prod.id + "-a")) + '" alt="" width="' + w + '" height="' + h + '" loading="lazy">';
  }

  function enderecoLinha(e) {
    if (!e) return "—";
    var partes = [(e.rua || "") + (e.numero ? ", " + e.numero : "")];
    if (e.complemento) partes.push(e.complemento);
    if (e.bairro) partes.push(e.bairro);
    if (e.cidade || e.uf) partes.push((e.cidade || "") + (e.uf ? "/" + e.uf : ""));
    if (e.cep) partes.push("CEP " + formatarCep(e.cep));
    return partes.join(" · ");
  }

  function formatarCep(c) {
    var d = CONTA_UI.digitos(c);
    return d.length === 8 ? d.slice(0, 5) + "-" + d.slice(5) : String(c || "");
  }

  function enderecoPorId(id) {
    var achou = null;
    (S.enderecos || []).forEach(function (e) { if (String(e.id) === String(id)) achou = e; });
    return achou;
  }

  /* codigo do atendimento que gerou um pedido (a lista de pedidos nao traz
     esse codigo; a de atendimentos traz `pedido` quando houve conversao). */
  function atendimentoDoPedido(codigo) {
    var achou = null;
    (S.atendimentos || []).forEach(function (a) { if (a.pedido === codigo) achou = a; });
    return achou;
  }

  /* ------------------------------------------- estados de tela (a11y) */
  function carregandoHTML(texto) {
    return '<div class="cx-estado" role="status" aria-live="polite">' +
      '<span class="cx-estado__giro" aria-hidden="true"></span><p>' + escapa(texto) + "</p></div>";
  }
  function erroHTML(texto, recarregar) {
    return '<div class="cx-estado cx-estado--erro" role="alert">' + icone("info") +
      "<p>" + escapa(texto) + "</p>" +
      (recarregar ? '<button class="bt bt--vazio bt--pequeno" type="button" data-recarregar="' + escapa(recarregar) + '">Tentar de novo</button>' : "") +
      "</div>";
  }
  function vazioHTML(texto, botao) {
    return '<div class="cx-cartao cx-estado--vazio">' +
      "<p>" + texto + "</p>" + (botao || "") + "</div>";
  }

  function contagem(lista) { return lista === null ? "…" : String(lista.length); }

  /* ============================================================ 1. VISAO */
  function secaoVisao() {
    var primeiro = CONTA_UI.primeiroNome(S.cliente.nome);
    var pedidos = S.pedidos || [];
    var atend = S.atendimentos || [];
    var pendentes = pedidos.filter(aguardaPagamento);
    var ativosAt = atend.filter(atendimentoAtivo);
    var abertos = pedidos.filter(function (p) {
      return ["entregue", "concluido", "cancelado", "reembolsado"].indexOf(p.status) < 0;
    });

    var h = '<section aria-labelledby="t-visao">' +
      '<div class="cx-cabeca">' +
        '<div><h1 id="t-visao" class="cx-titulo">Olá, ' + escapa(primeiro) + '</h1>' +
        '<p>Este é o resumo da sua conta na Preta Chik.</p></div>' +
      '</div>';

    h += '<div class="cx-grade">';
    h += '<div class="cx-cartao"><span>Pedidos</span><b>' + contagem(S.pedidos) + '</b>' +
         '<small>' + (S.pedidos === null ? "carregando…" : (abertos.length ? abertos.length + " em andamento" : "nenhum pedido aberto")) + '</small></div>';
    h += '<div class="cx-cartao"><span>Aguardando pagamento</span><b>' + (S.pedidos === null ? "…" : pendentes.length) + '</b>' +
         '<small>' + (pendentes.length ? "pedidos com pagamento pendente" : "nenhum pagamento pendente") + '</small></div>';
    h += '<div class="cx-cartao"><span>Atendimentos ativos</span><b>' + (S.atendimentos === null ? "…" : ativosAt.length) + '</b>' +
         '<small>' + (ativosAt.length ? "a loja segue pelo WhatsApp" : "nenhum atendimento aberto") + '</small></div>';
    h += '<div class="cx-cartao"><span>Endereços</span><b>' + contagem(S.enderecos) + '</b>' +
         '<small>' + ((S.enderecos && S.enderecos.length) ? escapa((S.enderecos.filter(function (e) { return e.principal; })[0] || {}).cidade || "") : "cadastre um endereço") + '</small></div>';
    h += '</div>';

    if (S.erroPedidos) h += '<div style="margin-top:1rem">' + erroHTML("Não consegui carregar os seus pedidos agora.", "pedidos") + "</div>";

    /* pagamentos pendentes: aviso com atalho direto para pagar */
    if (pendentes.length) {
      h += '<div class="cx-pagar" role="region" aria-labelledby="t-pendentes">' + icone("cartao") +
        '<div><h2 id="t-pendentes" class="cx-pagar__titulo">Pagamentos pendentes</h2><ul class="cx-pagar__lista">';
      pendentes.forEach(function (p) {
        h += "<li><span><b>" + escapa(p.codigo) + "</b> · " + dinheiro(p.total) + "</span>" +
          (p.linkPagamento
            ? '<a class="bt bt--rosa bt--pequeno" href="' + escapa(p.linkPagamento) + '" target="_blank" rel="noopener">Pagar agora<span class="cx-sr"> o pedido ' + escapa(p.codigo) + ' (abre em nova aba)</span></a>'
            : '<span class="cx-pagar__obs">a loja envia o link pelo WhatsApp</span>') +
          '<button class="cx-bt-mini" type="button" data-ir="pedido/' + escapa(p.codigo) + '">Ver pedido</button></li>';
      });
      h += "</ul></div></div>";
    }

    var ultimo = pedidos[0];
    if (ultimo) {
      h += '<div class="cx-cartao cx-cartao--fita" style="margin-top:1rem">' +
        fotoItem(itensDe(ultimo)[0], 54, 68) +
        '<div><span>Último pedido · ' + escapa(ultimo.codigo) + '</span>' +
        '<b>' + escapa(ultimo.statusNome || nomeStatusPedido(ultimo.status)) + '</b>' +
        '<small>' + escapa(resumoPecas(ultimo)) + ' · ' + escapa(tituloItens(ultimo)) + '</small></div>' +
        '<button class="bt bt--vazio bt--pequeno" type="button" data-ir="pedido/' + escapa(ultimo.codigo) + '" style="margin-left:auto">Ver pedido</button>' +
        '</div>';
    }

    h += '<div class="cx-atalhos">' +
      atalho("pedidos", "caixa", "Meus pedidos", S.pedidos === null ? "carregando…" : pedidos.length + " no histórico") +
      atalho("atendimentos", "zap", "Atendimentos", S.atendimentos === null ? "carregando…" : (ativosAt.length ? ativosAt.length + " em andamento" : atend.length + " no histórico")) +
      atalho("enderecos", "pino", "Endereços", S.enderecos === null ? "carregando…" : S.enderecos.length + " cadastrados") +
      atalho("favoritos", "coracao", "Favoritos", "as peças que você guardou") +
      atalho("dados", "conta", "Meus dados", "nome, e-mail e WhatsApp") +
      atalho("seguranca", "escudo", "Segurança", "alterar a sua senha") +
      '</div>';

    h += "</section>";
    return h;
  }

  function atalho(secao, ico, titulo, sub) {
    return '<button class="cx-atalho" type="button" data-ir="' + secao + '">' +
      icone(ico) + '<span><b>' + escapa(titulo) + '</b><small>' + escapa(sub) + '</small></span></button>';
  }

  /* bloco "este pedido veio do atendimento exclusivo" */
  function origemHTML(codigoAt) {
    return '<p class="cx-origem">' + icone("zap") + "<span>Pedido gerado no atendimento exclusivo" +
      (codigoAt ? " <b>" + escapa(codigoAt) + "</b>" : " pelo WhatsApp") + "</span></p>";
  }

  /* aviso de pagamento pendente (lista e detalhe) */
  function pagamentoPendenteHTML(p) {
    return '<div class="cx-pagar cx-pagar--linha">' + icone("cartao") +
      "<div><p><b>Pagamento pendente.</b> " +
      (p.linkPagamento
        ? "Assim que o pagamento for confirmado, o pedido segue para separação.</p>" +
          '<p style="margin-top:.6rem"><a class="bt bt--rosa bt--pequeno" href="' + escapa(p.linkPagamento) + '" target="_blank" rel="noopener">Pagar agora<span class="cx-sr"> (abre em nova aba)</span></a></p>'
        : "A loja vai enviar o link de pagamento pelo WhatsApp.</p>") +
      "</div></div>";
  }

  /* ========================================================= 2. PEDIDOS */
  function secaoPedidos() {
    var h = '<section aria-labelledby="t-pedidos">' +
      '<div class="cx-cabeca"><div>' +
      '<h1 id="t-pedidos" class="cx-titulo">Meus pedidos</h1>' +
      '<p>Toque em um pedido para ver as peças, o pagamento e a entrega.</p></div></div>';

    if (S.pedidos === null && !S.erroPedidos) return h + carregandoHTML("Carregando os seus pedidos…") + "</section>";
    if (S.erroPedidos) return h + erroHTML(S.erroPedidos, "pedidos") + "</section>";

    if (!S.pedidos.length) {
      h += vazioHTML("Você ainda não fez nenhum pedido na Preta Chik.",
        '<a class="bt bt--rosa" href="loja.html" style="margin-top:1rem">Ver a loja</a>');
      return h + "</section>";
    }

    h += '<div class="cx-pedidos">';
    S.pedidos.forEach(function (p) {
      var itens = itensDe(p);
      var fotos = itens.slice(0, 3).map(function (i) { return fotoItem(i, 54, 68); }).join("");
      if (fotos && itens.length > 3) fotos += '<span class="cx-mais">+' + (itens.length - 3) + "</span>";
      var at = atendimentoDoPedido(p.codigo);

      h += '<article class="cx-pedido" aria-labelledby="ped-' + escapa(p.codigo) + '">' +
        '<div class="cx-pedido__topo">' +
          '<span class="cx-pedido__num" id="ped-' + escapa(p.codigo) + '">Pedido ' + escapa(p.codigo) + '</span>' +
          '<span class="cx-pedido__data">' + escapa(dataCurta(p.criadoEm)) + '</span>' +
          seloPedido(p) +
        '</div>' +
        '<div class="cx-pedido__corpo">' +
          (fotos ? '<div class="cx-pedido__fotos">' + fotos + '</div>' : "") +
          '<div class="cx-pedido__info">' +
            '<b>' + escapa(tituloItens(p)) + '</b>' +
            '<span>' + escapa(resumoPecas(p)) +
              (p.rastreio ? " · Rastreio " + escapa(p.rastreio) : "") + '</span>' +
            ((p.canal === "atendimento" || at) ? origemHTML(at ? at.codigo : null) : "") +
          '</div>' +
        '</div>' +
        (aguardaPagamento(p) ? '<div style="padding:0 1.15rem">' + pagamentoPendenteHTML(p) + "</div>" : "") +
        '<div class="cx-pedido__pe">' +
          '<span class="cx-pedido__data">Total: ' + dinheiro(p.total) + '</span>' +
          '<button class="bt bt--vazio bt--pequeno" type="button" data-ir="pedido/' + escapa(p.codigo) + '">Ver pedido<span class="cx-sr"> ' + escapa(p.codigo) + '</span></button>' +
        '</div>' +
      '</article>';
    });
    h += "</div></section>";
    return h;
  }

  /* ================================================= 3. DETALHE PEDIDO */
  var ETAPAS = [
    { chave: "aguardando_pagamento", nome: "Aguardando pagamento" },
    { chave: "pago", nome: "Pagamento confirmado" },
    { chave: "em_separacao", nome: "Em separação" },
    { chave: "enviado", nome: "Enviado" },
    { chave: "entregue", nome: "Entregue" }
  ];
  function indiceEtapa(st) {
    if (st === "concluido") return ETAPAS.length; /* tudo feito */
    for (var i = 0; i < ETAPAS.length; i++) if (ETAPAS[i].chave === st) return i;
    return 0;
  }

  function voltarPedidosHTML() {
    return '<button class="cx-voltar" type="button" data-ir="pedidos">' +
      '<span class="cx-ic" aria-hidden="true">' + CONTA_UI.svg("setaEsq") + "</span>" +
      "Voltar para os pedidos</button>";
  }

  function secaoPedido(codigo) {
    var det = S.detalhes[codigo];
    if (!det) { carregarDetalhe(codigo); det = S.detalhes[codigo]; }

    var h = '<section aria-labelledby="t-detalhe">' + voltarPedidosHTML();

    if (det.carregando) {
      return h + '<h2 id="t-detalhe" class="cx-titulo" style="font-size:clamp(1.4rem,3vw,1.95rem)">Pedido ' + escapa(codigo) + "</h2>" +
        carregandoHTML("Carregando o pedido…") + "</section>";
    }
    if (det.erro) {
      return h + '<h2 id="t-detalhe" class="cx-titulo" style="font-size:clamp(1.4rem,3vw,1.95rem)">Pedido ' + escapa(codigo) + "</h2>" +
        erroHTML(det.erro, det.status === 404 ? "" : "pedido") + "</section>";
    }

    var p = det.dados.pedido || {};
    var historico = det.dados.historico || [];
    var cancelado = p.status === "cancelado" || p.status === "reembolsado";

    h += '<div class="cx-detalhe__topo">' +
        '<h2 id="t-detalhe" class="cx-titulo" style="font-size:clamp(1.4rem,3vw,1.95rem)">Pedido ' + escapa(p.codigo) + '</h2>' +
        seloPedido(p) +
      '</div>' +
      '<p class="cx-sub" style="margin-bottom:1.2rem">Feito em ' + escapa(dataCurta(p.criadoEm)) + '</p>';

    if (p.atendimento || p.canal === "atendimento") h += origemHTML(p.atendimento);
    if (aguardaPagamento(p) || (p.pagamento === "pendente" && p.linkPagamento)) h += pagamentoPendenteHTML(p);

    h += cancelado ? avisoCancelado(p.status) : linhaDoTempo(indiceEtapa(p.status));

    h += '<h3 class="cx-bloco" style="border:0;padding:0;margin-bottom:.7rem">Peças do pedido</h3>';
    var itens = itensDe(p);
    if (!itens.length) {
      h += "<p class=\"cx-sub\">Nenhuma peça registrada neste pedido.</p>";
    } else {
      h += '<ul class="cx-itens" role="list">';
      itens.forEach(function (i) {
        var total = i.total != null ? i.total : null;
        h += '<li class="cx-item">' + fotoItem(i, 66, 84) +
          '<div class="cx-item__txt"><b>' + escapa(i.nome || "Peça") + '</b>' +
          '<span>' + escapa(detalheItem(i)) + '</span>' +
          (i.preco != null && (i.qtd || 1) > 1 ? "<span>" + dinheiro(i.preco) + " cada</span>" : "") +
          '</div>' +
          '<div class="cx-item__preco">' + dinheiro(total != null ? total : (i.preco != null && (i.qtd || 1) === 1 ? i.preco : null)) + '</div>' +
          '</li>';
      });
      h += "</ul>";
    }

    h += '<div class="cx-resumo"><dl>' +
        linhaResumo("Subtotal", dinheiro(p.subtotal)) +
        (p.desconto ? linhaResumo("Desconto", "− " + dinheiro(p.desconto)) : "") +
        linhaResumo("Frete", p.frete === 0 ? "Grátis" : dinheiro(p.frete)) +
        '<div class="cx-total"><dt>Total</dt><dd>' + dinheiro(p.total) + "</dd></div>" +
      "</dl></div>";

    var ent = p.entrega;
    var prazo = ent && ent.prazo != null && ent.prazo !== "" ? (typeof ent.prazo === "number" ? "Prazo: " + ent.prazo + (ent.prazo === 1 ? " dia útil" : " dias úteis") : "Prazo: " + ent.prazo) : "";

    h += '<div class="cx-blocos">' +
      '<div class="cx-bloco"><h3>Endereço de entrega</h3>' +
        (p.endereco ? "<p>" + escapa(enderecoLinha(p.endereco)) + "</p>" : "<p>Endereço não informado.</p>") +
      "</div>" +
      '<div class="cx-bloco"><h3>Entrega</h3><p>' +
        (ent ? "<b>" + escapa(ent.nome || ent.tipo || "Entrega") + "</b>" + (prazo ? "<br>" + escapa(prazo) : "") : "A combinar com a loja.") +
        (p.enviadoEm ? "<br>Enviado em " + escapa(dataCurta(p.enviadoEm)) : "") +
        "</p>" +
        (p.rastreio ? '<p class="cx-rastreio">Código de rastreio <b>' + escapa(p.rastreio) + "</b></p>" : "") +
        (p.rastreioUrl ? '<p style="margin-top:.5rem"><a class="lk" href="' + escapa(p.rastreioUrl) + '" target="_blank" rel="noopener">Acompanhar a entrega<span class="cx-sr"> (abre em nova aba)</span></a></p>' : "") +
      "</div>" +
      '<div class="cx-bloco"><h3>Pagamento</h3><p><b>' + escapa(PAGAMENTO_NOME[p.pagamento] || p.pagamento || "—") + "</b>" +
        (p.pagoEm ? "<br>Confirmado em " + escapa(dataCurta(p.pagoEm)) : "") + "</p>" +
        '<p style="margin-top:.5rem"><a class="lk" href="' + escapa(LB.LOJA.whatsapp) + '" target="_blank" rel="noopener">Falar com a loja sobre este pedido</a></p>' +
      "</div>" +
    "</div>";

    h += '<h3 class="cx-bloco" style="border:0;padding:0;margin:1.8rem 0 .7rem">Histórico do pedido</h3>';
    h += historicoHTML(historico);

    h += "</section>";
    return h;
  }

  function lerDetalhe(d) {
    if (!d) return {};
    if (typeof d === "string") { try { return JSON.parse(d) || {}; } catch (e) { return {}; } }
    return d;
  }

  function textoEvento(ev) {
    var d = lerDetalhe(ev.detalhe);
    if (ev.tipo === "criado") {
      if (d.canal === "atendimento") return "Pedido criado no atendimento exclusivo" + (d.atendimento ? " " + d.atendimento : "");
      return "Pedido feito no site";
    }
    if (ev.tipo === "status") {
      var t = "Status: " + nomeStatusPedido(d.para);
      return t;
    }
    if (ev.tipo === "envio") {
      if (d.rastreio) return "Código de rastreio informado: " + d.rastreio;
      return "Atualização da entrega" + (d.status ? " (" + d.status + ")" : "");
    }
    return "Atualização do pedido";
  }

  function historicoHTML(lista) {
    if (!lista.length) return '<p class="cx-sub">Ainda não há movimentações registradas.</p>';
    var h = '<ol class="cx-historico">';
    lista.forEach(function (ev) {
      h += '<li><span class="cx-historico__pt" aria-hidden="true"></span>' +
        '<div><b>' + escapa(textoEvento(ev)) + "</b>" +
        (ev.em ? '<time datetime="' + escapa(ev.em) + '">' + escapa(dataHora(ev.em)) + "</time>" : "") +
        "</div></li>";
    });
    return h + "</ol>";
  }

  function linhaResumo(rotulo, valor) {
    return "<div><dt>" + escapa(rotulo) + "</dt><dd>" + valor + "</dd></div>";
  }

  function linhaDoTempo(atual) {
    var h = '<div class="cx-linha"><ol class="cx-linha__trilho" aria-label="Andamento do pedido">';
    ETAPAS.forEach(function (e, i) {
      var cls = i < atual ? "feita" : (i === atual ? "atual" : "");
      h += '<li class="cx-linha__etapa ' + cls + '"' + (i === atual ? ' aria-current="step"' : "") + '>' +
        '<span class="cx-linha__marca" aria-hidden="true"></span>' +
        '<span class="cx-linha__pt" aria-hidden="true"></span>' +
        '<span class="cx-linha__nome">' + escapa(e.nome) + "</span></li>";
    });
    h += "</ol></div>";
    return h;
  }

  function avisoCancelado(st) {
    return '<div class="cx-cancelado">' + icone("info") +
      "<p><b>" + (st === "reembolsado" ? "Este pedido foi reembolsado." : "Este pedido foi cancelado.") + "</b> " +
      "Se ficou alguma dúvida sobre o cancelamento ou sobre o reembolso, fale direto com a loja pelo " +
      "WhatsApp — a Preta Chik responde por lá.</p></div>";
  }

  /* ===================================================== 4. ATENDIMENTOS */
  function secaoAtendimentos() {
    var h = '<section aria-labelledby="t-at">' +
      '<div class="cx-cabeca"><div>' +
      '<h1 id="t-at" class="cx-titulo">Atendimentos</h1>' +
      "<p>Os seus pedidos de atendimento exclusivo pelo WhatsApp.</p></div></div>";

    h += '<div class="cx-aviso">' + icone("zap") +
      "<p><b>Como funciona:</b> quando você pede atendimento exclusivo, a equipe da Preta Chik " +
      "continua a conversa com você pelo WhatsApp — confirma tamanhos, valores e frete. Aqui você " +
      "acompanha o andamento e, quando o atendimento vira pedido, encontra o link para ele.</p></div>";

    if (S.atendimentos === null && !S.erroAtendimentos) return h + carregandoHTML("Carregando os seus atendimentos…") + "</section>";
    if (S.erroAtendimentos) return h + erroHTML(S.erroAtendimentos, "atendimentos") + "</section>";

    if (!S.atendimentos.length) {
      h += vazioHTML("Você ainda não pediu atendimento exclusivo.",
        '<a class="bt bt--rosa" href="loja.html" style="margin-top:1rem">Ver a loja</a>');
      return h + "</section>";
    }

    h += '<div class="cx-pedidos">';
    S.atendimentos.forEach(function (a) {
      var itens = itensDe(a);
      h += '<article class="cx-pedido" aria-labelledby="at-' + escapa(a.codigo) + '">' +
        '<div class="cx-pedido__topo">' +
          '<span class="cx-pedido__num" id="at-' + escapa(a.codigo) + '">Atendimento ' + escapa(a.codigo) + '</span>' +
          '<span class="cx-pedido__data">' + escapa(dataCurta(a.criadoEm)) + '</span>' +
          seloAtendimento(a) +
        '</div>';
      if (itens.length) {
        h += '<ul class="cx-itens cx-itens--compacto" role="list">';
        itens.forEach(function (i) {
          h += '<li class="cx-item">' + fotoItem(i, 54, 68) +
            '<div class="cx-item__txt"><b>' + escapa(i.nome || "Peça") + "</b><span>" + escapa(detalheItem(i)) + "</span></div>" +
            '<div class="cx-item__preco">' + dinheiro(i.preco != null ? i.preco * (Number(i.qtd) || 1) : null) + "</div></li>";
        });
        h += "</ul>";
      }
      h += '<div class="cx-pedido__pe" style="padding-top:1rem">' +
          '<span class="cx-pedido__data">Subtotal: ' + dinheiro(a.subtotal) +
            (a.atualizadoEm ? " · atualizado em " + escapa(dataCurta(a.atualizadoEm)) : "") + "</span>" +
          (a.pedido
            ? '<button class="bt bt--vazio bt--pequeno" type="button" data-ir="pedido/' + escapa(a.pedido) + '">Ver pedido ' + escapa(a.pedido) + "</button>"
            : (atendimentoAtivo(a)
              ? '<a class="lk" href="' + escapa(LB.LOJA.whatsapp) + '" target="_blank" rel="noopener">Falar com a loja no WhatsApp</a>'
              : "")) +
        "</div>" +
      "</article>";
    });
    h += "</div></section>";
    return h;
  }

  /* ======================================================= 5. ENDERECOS */
  function secaoEnderecos() {
    var h = '<section aria-labelledby="t-end">' +
      '<div class="cx-cabeca"><div>' +
      '<h1 id="t-end" class="cx-titulo">Endereços</h1>' +
      '<p>O endereço principal é o que vem sugerido nas próximas compras.</p></div></div>';

    if (S.enderecos === null && !S.erroEnderecos) return h + carregandoHTML("Carregando os seus endereços…") + "</section>";
    if (S.erroEnderecos) return h + erroHTML(S.erroEnderecos, "enderecos") + "</section>";

    if (!S.enderecos.length) {
      h += '<p class="cx-sub" style="margin-bottom:1rem">Você ainda não cadastrou nenhum endereço.</p>';
    }

    h += '<div class="cx-enderecos">';
    S.enderecos.forEach(function (e) {
      var nome = e.apelido || "Endereço";
      h += '<article class="cx-endereco' + (e.principal ? " cx-endereco--principal" : "") + '">' +
        '<div class="cx-endereco__topo"><b>' + escapa(nome) + "</b>" +
          (e.principal ? '<span class="cx-tag">Principal</span>' : "") + "</div>" +
        "<p>" + escapa(e.destinatario || "") + "<br>" + escapa(enderecoLinha(e)) + "</p>" +
        '<div class="cx-endereco__acoes">' +
          '<button class="cx-bt-mini" type="button" data-editar="' + escapa(e.id) + '" aria-label="Editar o endereço ' + escapa(nome) + '">' + icone("documento") + "Editar</button>" +
          (e.principal ? "" : '<button class="cx-bt-mini" type="button" data-principal="' + escapa(e.id) + '" aria-label="Definir ' + escapa(nome) + ' como endereço principal">' + icone("check") + "Definir principal</button>") +
          '<button class="cx-bt-mini cx-bt-mini--perigo" type="button" data-excluir="' + escapa(e.id) + '" aria-label="Excluir o endereço ' + escapa(nome) + '">' + icone("lixo") + "Excluir</button>" +
        "</div></article>";
    });

    h += '<button class="cx-endereco cx-endereco--novo" type="button" data-editar="">' +
      icone("mais") + "<b>Adicionar endereço</b></button>";
    h += "</div></section>";
    return h;
  }

  /* formulario de endereco — reaproveita .campo/.entrada/.bt do site */
  function formEndereco(e) {
    var v = e || {};
    function campo(nome, rotulo, valor, extra) {
      return '<label class="campo"><span class="rotulo">' + rotulo + "</span>" +
        '<input class="entrada" name="' + nome + '" value="' + escapa(valor || "") + '" ' + (extra || "") + "></label>";
    }
    return '<section aria-labelledby="t-endform">' +
      '<button class="cx-voltar" type="button" data-ir="enderecos">' +
        '<span class="cx-ic" aria-hidden="true">' + CONTA_UI.svg("setaEsq") + "</span>" +
        "Voltar para os endereços</button>" +
      '<h2 id="t-endform" class="cx-titulo" style="font-size:clamp(1.4rem,3vw,1.95rem)">' +
        (e ? "Editar endereço" : "Novo endereço") + "</h2>" +
      '<p class="cx-sub">Digite o CEP e nós completamos a rua, o bairro e a cidade quando possível.</p>' +
      '<form class="cx-form" id="formEndereco" novalidate>' +
        '<input type="hidden" name="id" value="' + escapa(v.id || "") + '">' +
        '<div class="cx-form__grade">' +
          campo("apelido", "Identificação", v.apelido, 'maxlength="40" placeholder="Casa, Trabalho..."') +
          campo("destinatario", "Quem recebe", v.destinatario || (S.cliente ? S.cliente.nome : ""), 'maxlength="120" autocomplete="name" required') +
          campo("cep", "CEP", v.cep ? formatarCep(v.cep) : "", 'inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" required') +
          campo("numero", "Número", v.numero, 'maxlength="20" required') +
        "</div>" +
        '<p class="cx-dica" id="cepStatus" role="status" aria-live="polite" style="margin:-.5rem 0 .9rem"></p>' +
        campo("rua", "Rua", v.rua, 'maxlength="160" autocomplete="address-line1" required') +
        '<div class="cx-form__grade">' +
          campo("complemento", "Complemento", v.complemento, 'maxlength="80" autocomplete="address-line2" placeholder="Apto, bloco..."') +
          campo("bairro", "Bairro", v.bairro, 'maxlength="80" required') +
          campo("cidade", "Cidade", v.cidade, 'maxlength="80" autocomplete="address-level2" required') +
          campo("uf", "Estado (UF)", v.uf, 'maxlength="2" autocomplete="address-level1" placeholder="PE" required') +
        "</div>" +
        (v.principal ? "" :
        '<label class="escolha" style="margin:.3rem 0 1.3rem">' +
          '<input type="checkbox" name="principal">' +
          "<span>Usar como endereço principal</span></label>") +
        '<div class="cx-form__acoes">' +
          '<button class="bt bt--rosa" type="submit">' + (e ? "Salvar alterações" : "Adicionar endereço") + "</button>" +
          '<button class="bt bt--vazio" type="button" data-ir="enderecos">Cancelar</button>' +
        "</div>" +
      "</form></section>";
  }

  /* ======================================================== 6. MEUS DADOS */
  function secaoDados(cliente) {
    var c = cliente || S.cliente;
    var inicial = CONTA_UI.iniciais(c.nome);

    var h = '<section aria-labelledby="t-dados">' +
      '<div class="cx-cabeca"><div>' +
      '<h1 id="t-dados" class="cx-titulo">Meus dados</h1>' +
      "<p>Como a Preta Chik fala com você e como você aparece na sua conta.</p></div></div>";

    h += '<div class="cx-grade" style="margin-bottom:1.6rem">' +
      '<div class="cx-cartao"><span>Nome na conta</span><b style="font-size:1.1rem">' +
        '<span style="display:inline-flex;align-items:center;gap:.6rem">' +
        '<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--rosa-lavado);color:var(--rosa-escuro);font-family:var(--sans);font-size:.78rem">' + escapa(inicial) + "</span>" +
        escapa(c.nome) + "</span></b>" +
        '<small>' + escapa(c.email) + "</small></div>" +
      '<div class="cx-cartao"><span>Cliente desde</span><b style="font-size:1.1rem">' + escapa(CONTA_UI.dataBR(c.desde)) + "</b>" +
        '<small>' + (S.pedidos === null ? "carregando pedidos…" :
          escapa(resumoPecas({ itens: S.pedidos.reduce(function (a, p) { return a.concat(itensDe(p)); }, []) })) + " no total") + "</small></div>" +
      "</div>";

    /* O e-mail vem do servidor e fica SOMENTE LEITURA nesta fase: trocar o
       e-mail muda como a pessoa entra na conta, e isso pede confirmacao por
       link — que depende do servico de e-mail ainda nao ligado. Melhor
       travar do que aceitar uma troca que ninguem conseguiria confirmar.
       Ver secoes 11 e 15 do escopo.                                      */
    h += '<form class="cx-form" id="formDados" novalidate>' +
      '<div class="cx-form__grade">' +
        '<label class="campo"><span class="rotulo">Nome completo</span>' +
          '<input class="entrada" name="nome" value="' + escapa(c.nome) + '" autocomplete="name" required></label>' +
        '<label class="campo"><span class="rotulo">Data de nascimento</span>' +
          '<input class="entrada" type="date" name="nascimento" value="' + escapa(c.nascimento || "") + '"></label>' +
        '<label class="campo"><span class="rotulo">E-mail</span>' +
          '<input class="entrada" type="email" name="email" value="' + escapa(c.email) + '" autocomplete="email" readonly aria-readonly="true"></label>' +
        '<p class="cx-sub" style="grid-column:1/-1;margin:-.4rem 0 0">O e-mail que identifica a sua conta não pode ser trocado por aqui.</p>' +
        '<label class="campo"><span class="rotulo">WhatsApp</span>' +
          '<input class="entrada" type="tel" name="whatsapp" value="' + escapa(c.whatsapp) + '" inputmode="tel" autocomplete="tel"></label>' +
      "</div>" +
      '<div class="cx-form__acoes">' +
        '<button class="bt bt--rosa" type="submit">Salvar os meus dados</button>' +
        '<button class="bt bt--vazio" type="button" data-ir="visao">Cancelar</button>' +
      "</div>" +
    "</form></section>";
    return h;
  }

  /* ======================================================= 7. SEGURANCA */
  function secaoSeguranca() {
    return '<section aria-labelledby="t-seg">' +
      '<div class="cx-cabeca"><div>' +
      '<h1 id="t-seg" class="cx-titulo">Segurança</h1>' +
      "<p>Trocar a senha da sua conta Preta Chik.</p></div></div>" +

      '<div class="cx-aviso">' + icone("info") +
      "<p><b>A sua senha é conferida e trocada no servidor.</b> Aqui só viaja pelo HTTPS, e o " +
      "servidor guarda apenas o hash — nunca o que você digitou. Ao salvar, as outras sessões " +
      "abertas são encerradas; esta continua valendo.</p></div>" +

      '<form class="cx-form" id="formSenha" novalidate>' +
        '<label class="campo"><span class="rotulo">Senha atual</span>' +
          '<input class="entrada" type="password" name="atual" autocomplete="current-password" required></label>' +
        '<label class="campo"><span class="rotulo">Nova senha</span>' +
          '<input class="entrada" type="password" name="nova" autocomplete="new-password" placeholder="Pelo menos 8 caracteres" required></label>' +
        '<div class="forca" data-nivel="0"><div class="forca__barras" aria-hidden="true">' +
          '<span class="forca__barra"></span><span class="forca__barra"></span>' +
          '<span class="forca__barra"></span><span class="forca__barra"></span></div>' +
          '<span class="forca__txt">Força da senha</span></div>' +
        '<label class="campo"><span class="rotulo">Confirmar nova senha</span>' +
          '<input class="entrada" type="password" name="nova2" autocomplete="new-password" required></label>' +
        '<div class="cx-form__acoes">' +
          '<button class="bt bt--rosa" type="submit">Alterar a minha senha</button>' +
        "</div>" +
      "</form>" +

      '<div class="cx-secao" style="margin-top:2rem;padding-top:1.6rem">' +
        "<h2>Sair da conta</h2>" +
        "<p>Encerra a sessão neste navegador e volta para a tela de acesso.</p>" +
        '<button class="bt bt--vazio" type="button" id="btSairLongo">' + "Sair da conta" + "</button>" +
      "</div>" +
    "</section>";
  }

  /* ========================================================= 8. FAVORITOS
     Esta secao NAO e nova funcionalidade: o coracao do cabecalho, o aviso
     "Salvo nos favoritos" e os links do rodape e da gaveta ja apontavam para
     conta.html#favoritos. Ela e mantida aqui para esses links continuarem
     funcionando — apagar seria regressao.
     Reaproveita o motor do site: LB.estado.favoritos e LB.desenharCartoes.
     A lista e sincronizada com o servidor por conta-sync.js.              */
  function listaFavoritos() {
    var ids = (LB.estado && LB.estado.favoritos) || [];
    return ids.map(function (id) { return buscaProduto(id); })
              .filter(function (p) { return !!p; });
  }

  function secaoFavoritos() {
    var lista = listaFavoritos();

    var h = '<section aria-labelledby="t-fav">' +
      '<div class="cx-cabeca"><div>' +
      '<h1 id="t-fav" class="cx-titulo">Favoritos</h1>' +
      '<p>As peças que você guardou tocando no coração. Elas ficam salvas na sua conta.</p></div></div>';

    if (!lista.length) {
      h += vazioHTML("Você ainda não salvou nenhuma peça.",
        '<a class="bt bt--rosa" href="loja.html" style="margin-top:1rem">Ver a loja</a>');
      h += "</section>";
      return h;
    }

    h += '<div class="grade-produtos" id="gradeFavoritos"></div></section>';
    return h;
  }

  /* =========================================================== 9. RENDER */
  var TITULOS = {
    visao: "Visão geral", pedidos: "Meus pedidos", atendimentos: "Atendimentos",
    enderecos: "Endereços", dados: "Meus dados", seguranca: "Segurança",
    endereco: "Endereço", favoritos: "Favoritos"
  };

  function render() {
    var h;
    if (S.secao === "pedido") h = secaoPedido(S.pedidoAberto);
    else if (S.secao === "pedidos") h = secaoPedidos();
    else if (S.secao === "atendimentos") h = secaoAtendimentos();
    else if (S.secao === "enderecos") h = secaoEnderecos();
    else if (S.secao === "endereco") h = formEndereco(S.enderecoEditando);
    else if (S.secao === "dados") h = secaoDados(null);
    else if (S.secao === "seguranca") h = secaoSeguranca();
    else if (S.secao === "favoritos") h = secaoFavoritos();
    else h = secaoVisao();

    R.caixa.innerHTML = h;

    /* os favoritos reusam o MESMO cartao de produto do site */
    if (S.secao === "favoritos") {
      var lista = listaFavoritos();
      if (lista.length) LB.desenharCartoes("#gradeFavoritos", lista);
    }

    /* marca a aba ativa (o hash do detalhe pertence a aba de pedidos) */
    var abaMaior = (S.secao === "pedido") ? "pedidos" : (S.secao === "endereco" ? "enderecos" : S.secao);
    todos(R.menu, "button[data-aba]").forEach(function (b) {
      var on = b.getAttribute("data-aba") === abaMaior;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });

    ligarAcoes();
    CONTA_UI.prepararSenhas(R.caixa);
    CONTA_UI.pintarIcones(R.caixa);
  }

  /* redesenha quando um dado chega em segundo plano — exceto no meio de um
     formulario, para nao apagar o que a pessoa esta digitando.           */
  function renderSeSeguro() {
    if (!S.entrou || !R.caixa) return;
    if (SECOES_FORM[S.secao]) return;
    render();
  }

  /* ------------------------------------------------------- eventos */
  function ligarAcoes() {
    /* navegacao interna: botao com data-ir="secao" ou "pedido/CODIGO" */
    todos(R.caixa, "[data-ir]").forEach(function (b) {
      b.addEventListener("click", function () {
        abrirRota(b.getAttribute("data-ir"));
      });
    });

    /* tentar de novo depois de um erro */
    todos(R.caixa, "[data-recarregar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = b.getAttribute("data-recarregar");
        if (o === "pedidos") carregarPedidos();
        else if (o === "atendimentos") carregarAtendimentos();
        else if (o === "enderecos") carregarEnderecos();
        else if (o === "pedido" && S.pedidoAberto) { delete S.detalhes[S.pedidoAberto]; }
        render();
      });
    });

    /* enderecos */
    todos(R.caixa, "[data-editar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-editar");
        S.enderecoEditando = id ? copia(enderecoPorId(id)) : null;
        S.secao = "endereco";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        var primeiro = sel(R.caixa, "#formEndereco [name=apelido]");
        if (primeiro) try { primeiro.focus({ preventScroll: true }); } catch (e) { /* ok */ }
      });
    });
    todos(R.caixa, "[data-principal]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        CONTA_API.LOJA.definirPrincipal(b.getAttribute("data-principal")).then(function (lista) {
          S.enderecos = lista; render(); toast("Endereço principal atualizado");
        })["catch"](function (falha) {
          b.disabled = false;
          if (falha && falha.status === 401) { sairParaLogin(); return; }
          toast(msgDe(falha, "Não foi possível atualizar agora."));
        });
      });
    });
    todos(R.caixa, "[data-excluir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-excluir");
        if (!window.confirm("Excluir este endereço?")) return;
        b.disabled = true;
        CONTA_API.LOJA.excluirEndereco(id).then(function (lista) {
          S.enderecos = lista; render(); toast("Endereço excluído");
        })["catch"](function (falha) {
          b.disabled = false;
          if (falha && falha.status === 401) { sairParaLogin(); return; }
          toast(msgDe(falha, "Não foi possível excluir agora."));
        });
      });
    });

    var fe = sel(R.caixa, "#formEndereco");
    if (fe) {
      fe.addEventListener("submit", submitEndereco);
      ligarCep(fe);
    }

    var fd = sel(R.caixa, "#formDados");
    if (fd) fd.addEventListener("submit", submitDados);

    var fs = sel(R.caixa, "#formSenha");
    if (fs) fs.addEventListener("submit", submitSenha);

    var sair = sel(R.caixa, "#btSairLongo");
    if (sair) sair.addEventListener("click", sairDaConta);

    /* medidor de forca do formulario de seguranca */
    if (fs) {
      var nova = sel(fs, "[name=nova]");
      var fEl = sel(fs, ".forca");
      nova.addEventListener("input", function () {
        var r = CONTA_UI.forcaSenha(nova.value);
        fEl.setAttribute("data-nivel", String(nova.value ? r.nivel : 0));
        sel(fEl, ".forca__txt").textContent = nova.value ? r.rotulo : "Força da senha";
      });
    }
  }

  function copia(x) { return x ? JSON.parse(JSON.stringify(x)) : x; }

  function toast(msg) { if (LB.toast) LB.toast(msg); }

  /* ------------------------------------------- CEP: mascara + ViaCEP
     Opcional e tolerante a falha: se o ViaCEP nao responder, a pessoa
     preenche a mao e nada quebra. So completa campos; nunca bloqueia.    */
  function ligarCep(f) {
    var cep = f.querySelector("[name=cep]");
    var status = f.querySelector("#cepStatus");
    var ultimo = "";
    if (!cep) return;

    cep.addEventListener("input", function () {
      var d = CONTA_UI.digitos(cep.value).slice(0, 8);
      var fmt = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
      if (fmt !== cep.value) cep.value = fmt;
      if (d.length === 8 && d !== ultimo) { ultimo = d; buscarCep(d); }
    });

    function buscarCep(d) {
      if (typeof fetch !== "function") return;
      if (status) status.textContent = "Buscando o endereço do CEP…";
      fetch("https://viacep.com.br/ws/" + d + "/json/")
        .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
        .then(function (j) {
          if (!document.body.contains(f)) return;
          if (!j || j.erro) {
            if (status) status.textContent = "Não encontramos esse CEP. Confira os números ou preencha o endereço.";
            return;
          }
          [["rua", j.logradouro], ["bairro", j.bairro], ["cidade", j.localidade], ["uf", j.uf]].forEach(function (par) {
            var el = f.querySelector("[name=" + par[0] + "]");
            if (el && par[1]) { el.value = par[1]; CONTA_UI.limparErro(el); }
          });
          if (status) status.textContent = "Endereço preenchido pelo CEP. Confira e informe o número.";
          var num = f.querySelector("[name=numero]");
          if (num && !num.value) try { num.focus(); } catch (e) { /* ok */ }
        })
        ["catch"](function () {
          if (status && document.body.contains(f)) status.textContent = "Não consegui buscar o CEP agora. Preencha o endereço manualmente.";
        });
    }
  }

  /* -------------------------------------------------- envio: endereco */
  function submitEndereco(e) {
    e.preventDefault();
    var f = e.target;
    CONTA_UI.limparTudo(f);

    var g = function (n) { return f.querySelector("[name=" + n + "]"); };
    var obrig = [
      { el: g("destinatario"), ok: g("destinatario").value.trim().length >= 3, msg: "Informe quem recebe." },
      { el: g("cep"), ok: CONTA_UI.digitos(g("cep").value).length === 8, msg: "Digite um CEP com 8 números." },
      { el: g("numero"), ok: !!g("numero").value.trim(), msg: "Digite o número." },
      { el: g("rua"), ok: !!g("rua").value.trim(), msg: "Digite a rua." },
      { el: g("bairro"), ok: !!g("bairro").value.trim(), msg: "Digite o bairro." },
      { el: g("cidade"), ok: !!g("cidade").value.trim(), msg: "Digite a cidade." },
      { el: g("uf"), ok: /^[A-Za-z]{2}$/.test(g("uf").value.trim()), msg: "Digite o estado com duas letras." }
    ];
    obrig.forEach(function (o) { if (!o.ok) CONTA_UI.marcarErro(o.el, o.msg); });
    if (CONTA_UI.focarPrimeiroErro(f)) return;

    var id = g("id").value || null;
    var querPrincipal = !!(g("principal") && g("principal").checked);
    var dados = {
      apelido: g("apelido").value.trim(),
      destinatario: g("destinatario").value.trim(),
      cep: CONTA_UI.digitos(g("cep").value),
      rua: g("rua").value.trim(),
      numero: g("numero").value.trim(),
      complemento: g("complemento").value.trim(),
      bairro: g("bairro").value.trim(),
      cidade: g("cidade").value.trim(),
      uf: g("uf").value.trim().toUpperCase().slice(0, 2)
    };

    var botao = f.querySelector('button[type="submit"]');
    var rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Salvando…";

    var antes = (S.enderecos || []).map(function (x) { return String(x.id); });
    var A = CONTA_API.LOJA;
    var envio = id ? A.atualizarEndereco(id, dados) : A.criarEndereco(dados);

    envio.then(function (lista) {
      /* "usar como principal": depois de salvar, marca o endereco certo */
      var alvo = id;
      if (!alvo) {
        var novos = lista.filter(function (x) { return antes.indexOf(String(x.id)) < 0; });
        alvo = novos.length ? novos[novos.length - 1].id : null;
      }
      var atual = null;
      lista.forEach(function (x) { if (String(x.id) === String(alvo)) atual = x; });
      if (querPrincipal && atual && !atual.principal) return A.definirPrincipal(alvo);
      return lista;
    }).then(function (lista) {
      S.enderecos = lista;
      S.erroEnderecos = "";
      abrirRota("enderecos");
      toast(id ? "Endereço atualizado" : "Endereço adicionado");
    })["catch"](function (falha) {
      botao.disabled = false;
      botao.textContent = rotulo;
      if (falha && falha.status === 401) { sairParaLogin(); return; }
      if (falha && falha.campo) {
        var alvoEl = g(falha.campo);
        if (alvoEl) { CONTA_UI.marcarErro(alvoEl, msgDe(falha, "Confira este campo.")); CONTA_UI.focarPrimeiroErro(f); return; }
      }
      toast(msgDe(falha, "Não foi possível salvar o endereço agora."));
    });
  }

  /* ----------------------------------------------------- envio: dados */
  function submitDados(e) {
    e.preventDefault();
    var f = e.target;
    CONTA_UI.limparTudo(f);

    var nome = f.querySelector("[name=nome]");
    var whats = f.querySelector("[name=whatsapp]");
    var nasc = f.querySelector("[name=nascimento]");

    if (nome.value.trim().length < 3) CONTA_UI.marcarErro(nome, "Digite o seu nome completo.");
    else if (nome.value.trim().indexOf(" ") < 1) CONTA_UI.marcarErro(nome, "Inclua também o sobrenome.");
    if (CONTA_UI.digitos(whats.value).length < 10) CONTA_UI.marcarErro(whats, "Digite o DDD e o número.");
    if (CONTA_UI.focarPrimeiroErro(f)) return;

    /* O e-mail NAO vai no corpo: o servidor ignora o que o navegador manda
       para identificar quem esta sendo editado — quem decide isso e o cookie
       de sessao. Mandar o e-mail so criaria a ilusao de que ele pode mudar
       por aqui. Ver secao 11 do escopo.                                   */
    var botao = f.querySelector('button[type="submit"]');
    botao.disabled = true;
    CONTA_API.CONTA.atualizarCliente({
      nome: nome.value.trim(),
      whatsapp: CONTA_UI.digitos(whats.value),
      nascimento: nasc.value
    }).then(function (c) {
      botao.disabled = false;
      S.cliente = c;
      pintarQuem();
      render();
      toast("Os seus dados foram salvos");
    })["catch"](function (falha) {
      botao.disabled = false;
      if (falha && falha.status === 401) { sairParaLogin(); return; }
      if (falha && falha.campo) {
        var alvo = f.querySelector("[name=" + falha.campo + "]");
        if (alvo) { CONTA_UI.marcarErro(alvo, falha.mensagem || falha.message); CONTA_UI.focarPrimeiroErro(f); return; }
      }
      toast((falha && (falha.mensagem || falha.message)) || "Não foi possível salvar agora.");
    });
  }

  /* -------------------------------------------------- envio: senha
     Troca REAL: a senha atual e a nova vao no corpo do POST (por HTTPS) e o
     servidor confere a atual antes de gravar o hash da nova. Nada de senha
     fica neste navegador — nem em variavel, nem em storage: os campos sao
     limpos assim que a resposta chega.                                     */
  function submitSenha(e) {
    e.preventDefault();
    var f = e.target;
    CONTA_UI.limparTudo(f);

    var atual = f.querySelector("[name=atual]");
    var nova = f.querySelector("[name=nova]");
    var nova2 = f.querySelector("[name=nova2]");

    if (!atual.value) CONTA_UI.marcarErro(atual, "Digite a sua senha atual.");
    if (CONTA_UI.forcaSenha(nova.value).fraca) {
      CONTA_UI.marcarErro(nova, "Use pelo menos 8 caracteres, misturando letras e números.");
    }
    if (!nova2.value) CONTA_UI.marcarErro(nova2, "Repita a nova senha.");
    else if (nova2.value !== nova.value) CONTA_UI.marcarErro(nova2, "As duas senhas estão diferentes.");
    if (CONTA_UI.focarPrimeiroErro(f)) return;

    var botao = f.querySelector('button[type="submit"]');
    botao.disabled = true;

    function limpar() {
      f.reset();
      var fEl = f.querySelector(".forca");
      if (fEl) { fEl.setAttribute("data-nivel", "0"); f.querySelector(".forca__txt").textContent = "Força da senha"; }
      botao.disabled = false;
    }

    CONTA_API.CONTA.trocarSenha({ atual: atual.value, nova: nova.value, confirmar: nova2.value })
      .then(function () {
        limpar();
        /* O servidor derruba as outras sessoes e mantem esta. Por isso a
           pessoa continua na tela, em vez de ser jogada para o login.     */
        toast("Senha alterada. As outras sessões foram encerradas.");
      })
      ["catch"](function (falha) {
        limpar();
        if (falha && falha.status === 401 && !falha.campo) { sairParaLogin(); return; }
        if (falha && falha.campo) {
          var alvo = f.querySelector("[name=" + falha.campo + "]");
          if (alvo) { CONTA_UI.marcarErro(alvo, falha.mensagem || falha.message); CONTA_UI.focarPrimeiroErro(f); return; }
        }
        toast((falha && (falha.mensagem || falha.message)) || "Não foi possível alterar a senha agora.");
      });
  }

  /* ==================================================== 10. SESSAO */
  function pintarQuem() {
    if (!R.quem) return;
    sel(R.quem, "[data-quem-nome]").textContent = S.cliente ? S.cliente.nome : "Visitante";
    sel(R.quem, "[data-quem-email]").textContent = S.cliente ? S.cliente.email : "—";
  }

  /* Sem sessao valida nao existe Area do Cliente: volta para o login.
     Chamado tanto na abertura quanto quando o servidor responde 401 no meio
     do uso (sessao vencida, ou derrubada por uma troca de senha em outro
     aparelho). E a unica saida possivel — nao ha tela a mostrar.          */
  function sairParaLogin() {
    location.href = "login.html";
  }

  /* SAIR DA CONTA de verdade: o servidor apaga a linha da sessao no banco e
     manda o navegador descartar o cookie. So depois disso a area some da
     tela — e, mesmo que a chamada falhe (rede caindo), a area some do mesmo
     jeito: nao existe "sair" que deixe a conta aberta na tela.            */
  function sairDaConta() {
    var bt = document.querySelector("#sair");
    if (bt) bt.disabled = true;
    if (typeof CONTA_SYNC !== "undefined" && CONTA_SYNC.parar) CONTA_SYNC.parar();

    CONTA_API.AUTH.sair()
      ["catch"](function () { /* a saida local acontece de qualquer forma */ })
      .then(function () {
        S.entrou = false;
        S.cliente = null;
        S.pedidos = null;
        S.atendimentos = null;
        S.enderecos = null;
        S.detalhes = {};
        S.secao = "visao";
        if (bt) bt.disabled = false;
        if (R.painel) R.painel.classList.add("oculto");
        document.body.classList.remove("tem-conta");
        if (R.conferindo) R.conferindo.classList.add("oculto");
        if (R.semSessao) R.semSessao.classList.remove("oculto");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
  }

  /* roteamento por hash: #visao, #pedidos, #pedido/PC-XXXXXX, #atendimentos,
     #enderecos, #endereco, #dados, #seguranca, #favoritos — assim o botao
     "voltar" do celular funciona e cada tela pode ser linkada direto.     */
  function aplicarRota(rota) {
    var partes = String(rota || "visao").split("/");
    var alvo = partes[0];
    if (alvo === "pedido" && partes[1]) { S.secao = "pedido"; S.pedidoAberto = decodeURIComponent(partes[1]); }
    else if (alvo === "endereco") { S.secao = "endereco"; }
    else S.secao = TITULOS[alvo] ? alvo : "visao";
  }

  function abrirRota(rota) {
    var partes = String(rota || "visao").split("/");
    if (partes[0] === "endereco") S.enderecoEditando = null;
    /* reabrir um pedido busca o detalhe de novo (status pode ter mudado) */
    if (partes[0] === "pedido" && partes[1]) delete S.detalhes[partes[1]];
    aplicarRota(rota);
    if (location.hash !== "#" + rota) {
      S.ignorarHash = true;
      location.hash = "#" + rota;
    }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    focarTitulo();
  }

  /* leva o foco para o titulo da secao nova (leitor de tela anuncia) */
  function focarTitulo() {
    var t = sel(R.caixa, "h1, h2");
    if (!t) return;
    t.setAttribute("tabindex", "-1");
    try { t.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }

  function rotaDoHash() {
    return (location.hash || "#visao").replace("#", "");
  }

  /* =================================================== 11. CARREGAMENTO
     Cada colecao carrega em paralelo e a tela mostra "carregando" so na
     parte que falta. 401 em qualquer uma = sessao caiu -> login.         */
  function falhaCarga(falha, padrao) {
    if (falha && falha.status === 401) { sairParaLogin(); return null; }
    return msgDe(falha, padrao);
  }

  function carregarPedidos() {
    S.pedidos = null; S.erroPedidos = "";
    return CONTA_API.LOJA.pedidos().then(function (r) {
      S.pedidos = r.pedidos;
      S.statusPedido = r.status || {};
      renderSeSeguro();
    })["catch"](function (falha) {
      var m = falhaCarga(falha, "Não consegui carregar os seus pedidos agora.");
      if (m === null) return;
      S.erroPedidos = m;
      renderSeSeguro();
    });
  }

  function carregarAtendimentos() {
    S.atendimentos = null; S.erroAtendimentos = "";
    return CONTA_API.LOJA.atendimentos().then(function (r) {
      S.atendimentos = r.atendimentos;
      S.statusAtendimento = r.status || {};
      renderSeSeguro();
    })["catch"](function (falha) {
      var m = falhaCarga(falha, "Não consegui carregar os seus atendimentos agora.");
      if (m === null) return;
      S.erroAtendimentos = m;
      renderSeSeguro();
    });
  }

  function carregarEnderecos() {
    S.enderecos = null; S.erroEnderecos = "";
    return CONTA_API.LOJA.enderecos().then(function (lista) {
      S.enderecos = lista;
      renderSeSeguro();
    })["catch"](function (falha) {
      var m = falhaCarga(falha, "Não consegui carregar os seus endereços agora.");
      if (m === null) return;
      S.erroEnderecos = m;
      renderSeSeguro();
    });
  }

  function carregarDetalhe(codigo) {
    S.detalhes[codigo] = { carregando: true };
    CONTA_API.LOJA.pedido(codigo).then(function (r) {
      S.detalhes[codigo] = { dados: r };
      if (r.pedido && r.pedido.status && !S.statusPedido[r.pedido.status] && r.pedido.statusNome) {
        S.statusPedido[r.pedido.status] = r.pedido.statusNome;
      }
      if (S.secao === "pedido" && S.pedidoAberto === codigo) render();
    })["catch"](function (falha) {
      var m = falhaCarga(falha, "Não consegui carregar este pedido agora.");
      if (m === null) return;
      S.detalhes[codigo] = { erro: m, status: falha && falha.status };
      if (S.secao === "pedido" && S.pedidoAberto === codigo) render();
    });
  }

  /* ========================================================= 12. INICIO */
  function iniciar() {
    /* #areaConta, e nao #painel: o ui.js injeta o mega-menu com id="painel"
       na casca do topo, que vem ANTES desta secao. Com o mesmo id, o
       querySelector devolvia o mega-menu e a area da cliente nunca abria.
       Ver prova I de bancada-conta.js.                                    */
    R.painel = document.querySelector("#areaConta");
    R.caixa = document.querySelector("#painelConta");
    R.menu = document.querySelector(".conta__menu");
    R.quem = document.querySelector(".conta__quem");
    R.conferindo = document.querySelector("#conferindo");
    R.semSessao = document.querySelector("#semSessao");

    /* abas do menu lateral */
    if (R.menu) {
      todos(R.menu, "button[data-aba]").forEach(function (b) {
        b.addEventListener("click", function () { abrirRota(b.getAttribute("data-aba")); });
      });
    }

    var btSair = document.querySelector("#sair");
    if (btSair) btSair.addEventListener("click", sairDaConta);

    window.addEventListener("hashchange", function () {
      if (!S.entrou) return;   /* sem sessao confirmada, nenhuma rota abre */
      if (S.ignorarHash) { S.ignorarHash = false; return; }
      aplicarRota(rotaDoHash());
      render();
    });

    /* favoritos/sacola mudaram (aqui ou depois da sincronizacao): a secao
       de favoritos se redesenha para refletir a lista nova.              */
    function talvezFavoritos() { if (S.entrou && S.secao === "favoritos") render(); }
    document.addEventListener("lb:favoritos", talvezFavoritos);
    document.addEventListener("conta:sincronizado", talvezFavoritos);

    /* QUEM DECIDE SE ESTA TELA ABRE E O SERVIDOR.
       Perguntamos a /api/auth/me. O cookie de sessao (HttpOnly) vai junto
       automaticamente; o codigo desta pagina nao le o token e nao guarda
       nada. Resposta valida -> monta a area. 401 -> login.
       Nao existe caminho alternativo: e isto que impede conta.html — que e
       um arquivo publico — de mostrar a area sem autenticacao.            */
    CONTA_API.AUTH.eu()
      .then(function (cliente) {
        S.cliente = cliente;
        S.entrou = true;
        document.body.classList.add("tem-conta");
        if (R.conferindo) R.conferindo.classList.add("oculto");
        if (R.semSessao) R.semSessao.classList.add("oculto");
        if (R.painel) R.painel.classList.remove("oculto");
        carregar();
      })
      ["catch"](function (falha) {
        /* 401 = nao ha sessao. Aqui ha duas saidas honestas e escolhemos a
           mais util: em vez de jogar a pessoa para login.html no mesmo
           instante (o que parece um soluço da pagina), mostramos o convite
           para entrar. Quem clicar vai para o login de verdade, e o link
           fica no endereco para quem quiser guardar ou compartilhar. Nos
           outros pontos do codigo — sessao que cai no meio do uso — o
           redirecionamento direto continua, porque ali a pessoa JA estava
           dentro e a saida tem de ser imediata.                          */
        if (falha && falha.status === 401) {
          if (R.conferindo) R.conferindo.classList.add("oculto");
          if (R.semSessao) R.semSessao.classList.remove("oculto");
          return;
        }
        /* 503 = o servidor nao conseguiu nem olhar a sessao (banco fora do
           ar). Nao da para afirmar "voce nao esta conectada" nem "esta":
           a tela diz exatamente isso, em vez de escolher por conta propria. */
        if (falha && falha.status === 503) {
          if (R.conferindo) {
            R.conferindo.innerHTML =
              '<div class="entrar__lado"><div class="entrar__caixa">' +
                '<div class="cx-marca"><img src="assets/img/logo/preta-chik.jpg" alt="" width="46" height="46">' +
                "<b>Preta <i>Chik</i></b></div>" +
                '<h1 class="cx-titulo">Não consegui abrir a sua conta</h1>' +
                "<p class=\"cx-sub\">O servidor não respondeu agora. Tente de novo em instantes.</p>" +
                '<div class="cx-form__acoes" style="margin-top:0">' +
                  '<button class="bt bt--vazio bt--largo" type="button" id="btTentar">Tentar de novo</button>' +
                "</div>" +
              "</div></div>";
            var bt = document.querySelector("#btTentar");
            if (bt) bt.addEventListener("click", function () { location.reload(); });
            CONTA_UI.pintarIcones(R.conferindo);
          }
          return;
        }
        sairParaLogin();
      });
  }

  /* Depois da sessao confirmada: monta a tela na hora (com "carregando"
     em cada parte) e busca pedidos, atendimentos e enderecos REAIS em
     paralelo. Favoritos e sacola sao sincronizados por conta-sync.js.   */
  function carregar() {
    pintarQuem();
    aplicarRota(rotaDoHash());
    S.pedidos = null; S.atendimentos = null; S.enderecos = null;
    render();

    carregarPedidos();
    carregarAtendimentos();
    carregarEnderecos();

    if (typeof CONTA_SYNC !== "undefined" && CONTA_SYNC.iniciar) {
      CONTA_SYNC.iniciar({ aoSairDaSessao: sairParaLogin });
    }
  }

  return { iniciar: iniciar, carregar: carregar, estado: S };
})();
