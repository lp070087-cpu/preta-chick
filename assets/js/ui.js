/* ==========================================================================
   ui.js — casca comum da apresentacao
   cabecalho, faixa, gavetas (menu e sacola), busca, rapida, toasts,
   revelacao no scroll, cartao de produto.
   Depende de dados.js.
   ========================================================================== */

const LB = (function () {

  /* ------------------------------------------------------------- ICONES */
  const ICO = {
    busca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    conta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    coracao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.4l8.8-8.7a5 5 0 0 0 0-7.1z"/></svg>',
    sacola: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z"/><path d="M4 6h16"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
    fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    setaEsq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M19 12H5M11 18 5 12l6-6"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 0 1 0 16.4 8.1 8.1 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.1 4c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.3 3.9 2.1.9 2.6.7 3 .7.5 0 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.2-.4-.3l-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.7-1a6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4z"/></svg>',
    caminhao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    troca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18 2v5h-5M6 22v-5h5"/></svg>',
    presente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8S9.5 3 7 4.2 8 8 12 8s5-2.6 2.5-3.8S12 8 12 8z"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    cartao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>',
    pino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.8"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4.5" width="20" height="15" rx="2.5"/><path d="m3 7 9 6 9-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>',
    lixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    caixa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    documento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M9 13h6M9 17h4"/></svg>',
    sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.1"/></svg>'
  };

  /* ---------------------------------------------------------------- NAV */
  const NAV = [
    { txt: "Início",     href: "index.html" },
    { txt: "Novidades",  href: "loja.html?cat=novidades", marca: true },
    { txt: "Roupas",     href: "loja.html", painel: true },
    { txt: "Conjuntos",  href: "loja.html?cat=conjuntos-praia" },
    { txt: "Biquínis",   href: "loja.html?cat=biquinis" },
    { txt: "Promoções",  href: "loja.html?cat=promocoes" }
  ];

  const PAINEL = [
    { titulo: "Por peça", itens: [
      { txt: "Biquínis", href: "loja.html?cat=biquinis" },
      { txt: "Conjuntos", href: "loja.html?cat=conjuntos-praia" },
      { txt: "Blusas e tops", href: "loja.html?cat=tops-praia" },
      { txt: "Calças", href: "loja.html?cat=maios" },
      { txt: "Saias e shorts", href: "loja.html?cat=saidas-praia" }
    ]},
    { titulo: "Por ocasião", itens: [
      { txt: "Dia a dia", href: "loja.html" },
      { txt: "Festa", href: "loja.html" },
      { txt: "Verão", href: "loja.html" },
      { txt: "Trabalho", href: "loja.html" }
    ]},
    { titulo: "Destaques", itens: [
      { txt: "Lançamentos", href: "loja.html?cat=novidades" },
      { txt: "Mais desejadas", href: "loja.html" },
      { txt: "Promoções", href: "loja.html?cat=promocoes" },
      { txt: "Presentes e brindes", href: "sobre.html#brindes" }
    ]},
    { titulo: "A loja", itens: [
      { txt: "Sobre a Preta Chik", href: "sobre.html" },
      { txt: "Instagram", href: "https://www.instagram.com/pretachik_modapraiaa/", fora: true },
      { txt: "Trocas e devoluções", href: "trocas.html" },
      { txt: "Minha conta", href: "login.html" }
    ]}
  ];

  /* ------------------------------------------------------------ ESTADO */
  const CHAVE_CARRINHO = "labelle_carrinho_v1";
  const CHAVE_FAVORITOS = "labelle_favoritos_v1";

  function ler(chave, padrao) {
    try {
      const v = window.localStorage.getItem(chave);
      return v ? JSON.parse(v) : padrao;
    } catch (e) { return padrao; }
  }
  function gravar(chave, valor) {
    try { window.localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* segue sem persistir */ }
  }

  const estado = {
    carrinho: ler(CHAVE_CARRINHO, []),
    favoritos: ler(CHAVE_FAVORITOS, []),
    pagina: "home",
    frete: null
  };

  /* -------------------------------------------------------------- UTIL */
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function todos(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function um(sel, raiz) { return (raiz || document).querySelector(sel); }

  function escapa(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /* ------------------------------------------------------------ TOASTS */
  function toast(msg, linkTxt, linkHref) {
    let caixa = um(".toasts");
    if (!caixa) { caixa = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(caixa); }
    const t = el('<div class="toast">' + ICO.check + '<span>' + escapa(msg) + '</span>' +
      (linkTxt ? '<a href="' + linkHref + '">' + escapa(linkTxt) + '</a>' : '') + '</div>');
    caixa.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("entrou"); });
    setTimeout(function () {
      t.classList.remove("entrou");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 500);
    }, 3800);
  }

  /* ------------------------------------------------------------ FAVORITOS */
  function ehFavorito(id) { return estado.favoritos.indexOf(id) > -1; }
  function alternarFavorito(id, botao) {
    const i = estado.favoritos.indexOf(id);
    if (i > -1) { estado.favoritos.splice(i, 1); toast("Removido dos favoritos"); }
    else { estado.favoritos.push(id); toast("Salvo nos favoritos", "Ver favoritos", "conta.html#favoritos"); }
    gravar(CHAVE_FAVORITOS, estado.favoritos);
    todos('[data-fav="' + id + '"]').forEach(function (b) {
      b.classList.toggle("ativo", ehFavorito(id));
      b.setAttribute("aria-pressed", ehFavorito(id) ? "true" : "false");
    });
    atualizarContadores();
    document.dispatchEvent(new CustomEvent("lb:favoritos"));
  }

  /* -------------------------------------------------------------- SACOLA */
  function chaveItem(id, cor, tam) { return id + "|" + cor + "|" + tam; }

  function adicionar(id, cor, tam, qtd) {
    const p = buscaProduto(id);
    if (!p) return;
    qtd = qtd || 1;
    const k = chaveItem(id, cor || p.cor, tam || "M");
    let achou = null;
    for (let i = 0; i < estado.carrinho.length; i++) if (estado.carrinho[i].k === k) achou = estado.carrinho[i];
    if (achou) achou.qtd += qtd;
    else estado.carrinho.push({ k: k, id: id, cor: cor || p.cor, tam: tam || "M", qtd: qtd });
    gravar(CHAVE_CARRINHO, estado.carrinho);
    atualizarContadores();
    desenharGaveta();
    toast(p.nome + " foi para a sacola", "Ver sacola", "#");
    const cont = um(".icone-bt__cont--sacola");
    if (cont) { cont.classList.remove("pulsa"); void cont.offsetWidth; cont.classList.add("pulsa"); }
    document.dispatchEvent(new CustomEvent("lb:carrinho"));
  }

  function remover(k) {
    estado.carrinho = estado.carrinho.filter(function (it) { return it.k !== k; });
    gravar(CHAVE_CARRINHO, estado.carrinho);
    atualizarContadores(); desenharGaveta();
    document.dispatchEvent(new CustomEvent("lb:carrinho"));
  }

  function mudarQtd(k, delta) {
    estado.carrinho.forEach(function (it) {
      if (it.k === k) { it.qtd = Math.max(1, Math.min(9, it.qtd + delta)); }
    });
    gravar(CHAVE_CARRINHO, estado.carrinho);
    atualizarContadores(); desenharGaveta();
    document.dispatchEvent(new CustomEvent("lb:carrinho"));
  }

  function qtdTotal() {
    return estado.carrinho.reduce(function (s, it) { return s + it.qtd; }, 0);
  }

  function atualizarContadores() {
    const n = qtdTotal();
    todos(".icone-bt__cont--sacola").forEach(function (c) {
      c.textContent = n;
      c.classList.toggle("oculto", n === 0);
    });
    const f = estado.favoritos.length;
    todos(".icone-bt__cont--favoritos").forEach(function (c) {
      c.textContent = f;
      c.classList.toggle("oculto", f === 0);
    });
    const fv = um("[data-conta-favoritos]");
    if (fv) fv.textContent = f;
  }

  /* ------------------------------------------------- CABECALHO E FAIXA */
  function cabecalhoHTML() {
    const linkNav = NAV.map(function (n) {
      return '<li><a class="nav__lk" href="' + n.href + '"' +
        (n.painel ? ' data-abre-painel="1" aria-expanded="false"' : "") +
        '>' + (n.marca ? "<em>" + n.txt + "</em>" : n.txt) + '</a></li>';
    }).join("");

    return '' +
    '<div class="faixa">' +
      '<div class="envelope faixa__dentro">' +
        '<div class="faixa__club">' +
          '<span>' + ICO.caminhao + ' Enviamos para todo o Brasil</span>' +
          '<span>' + ICO.troca + ' 7 dias para troca nas compras on-line</span>' +
          '<span>' + ICO.presente + ' Brindes especiais a cada compra</span>' +
        '</div>' +
        '<div class="faixa__dir">' +
          '<a href="https://www.instagram.com/pretachik_modapraiaa/" target="_blank" rel="noopener">@pretachik_modapraiaa</a>' +
          '<a href="trocas.html">Trocas e devoluções</a>' +
          '<a href="login.html">Minha conta</a>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<header class="cabecalho" id="cabecalho">' +
      '<div class="envelope cabecalho__dentro">' +
        '<nav class="nav" aria-label="Menu principal"><ul style="display:flex;gap:inherit;align-items:center">' + linkNav + '</ul></nav>' +
        '<button class="icone-bt hamb" id="btMenu" aria-label="Abrir menu" aria-expanded="false" aria-controls="gmenu">' + ICO.menu + '</button>' +
        '<a class="marca" href="index.html" aria-label="Preta Chik Moda Praia — página inicial">' +
          '<span class="marca__disco"><img src="assets/img/logo/preta-chik.jpg" alt="Preta Chik Moda Praia" width="80" height="80"></span>' +
          '<span class="marca__nome"><b>Preta <i>Chik</i></b><small>Moda Praia</small></span>' +
        '</a>' +
        '<div class="acoes">' +
          '<button class="icone-bt" id="btBusca" aria-label="Buscar produtos">' + ICO.busca + '</button>' +
          '<a class="icone-bt so-grande" href="login.html" aria-label="Minha conta">' + ICO.conta + '</a>' +
          '<a class="icone-bt so-grande" href="conta.html#favoritos" aria-label="Favoritos">' + ICO.coracao +
            '<span class="icone-bt__cont icone-bt__cont--favoritos oculto">0</span></a>' +
          '<a class="icone-bt" id="btSacola" href="sacola.html" aria-label="Abrir sacola">' + ICO.sacola +
            '<span class="icone-bt__cont icone-bt__cont--sacola oculto">0</span></a>' +
        '</div>' +
      '</div>' +
    '</header>' +

    '<div class="painel" id="painel" aria-hidden="true">' +
      '<div class="envelope painel__dentro">' +
        PAINEL.map(function (c) {
          return '<div class="painel__col"><h4>' + c.titulo + '</h4><ul>' +
            c.itens.map(function (i) {
              return '<li><a href="' + i.href + '"' + (i.fora ? ' target="_blank" rel="noopener"' : '') + '>' + i.txt + '</a></li>';
            }).join("") + '</ul></div>';
        }).join("") +
        '<figure class="painel__destaque"><img src="assets/img/cat/cat-lancamentos.jpg" alt="Novidades da Preta Chik" loading="lazy" width="760" height="1010">' +
        '<figcaption>Recém-chegadas na arara</figcaption></figure>' +
      '</div>' +
    '</div>';
  }

  /* --------------------------------------------------- GAVETA DA SACOLA */
  function desenharGaveta() {
    const corpo = um("#sacolaCorpo");
    const pe = um("#sacolaPe");
    if (!corpo) return;
    const n = qtdTotal();
    const titulo = um("#sacolaTitulo");
    if (titulo) titulo.textContent = "Sacola (" + n + ")";

    if (!estado.carrinho.length) {
      corpo.innerHTML = '<div class="carrinho__vazio">' + ICO.sacola +
        '<b>Sua sacola está vazia</b>' +
        '<p class="texto-peq">As peças que você escolher aparecem aqui.</p>' +
        '<a class="bt bt--rosa bt--pequeno" href="loja.html">Ver novidades</a></div>';
      if (pe) pe.innerHTML = '';
      return;
    }

    corpo.innerHTML = '<div class="itens">' + estado.carrinho.map(function (it) {
      const p = buscaProduto(it.id);
      if (!p) return "";
      return '<div class="item">' +
        '<div class="item__foto"><div class="midia"><img src="' + img("card", p.id + "-a") + '" alt="' + escapa(p.nome) + '" loading="lazy" width="720" height="900"></div></div>' +
        '<div class="item__corpo">' +
          '<h3><a href="produto.html?id=' + p.id + '">' + escapa(p.nome) + '</a></h3>' +
          '<p class="item__atrib">' + escapa(it.cor) + ' · Tam. ' + escapa(it.tam) + '</p>' +
          '<div class="item__linha">' +
            '<span class="passo">' +
              '<button type="button" data-qtd="-1" data-k="' + escapa(it.k) + '" aria-label="Diminuir">−</button>' +
              '<span aria-live="polite">' + it.qtd + '</span>' +
              '<button type="button" data-qtd="1" data-k="' + escapa(it.k) + '" aria-label="Aumentar">+</button>' +
            '</span>' +
            '<button class="item__remover" type="button" data-remover="' + escapa(it.k) + '">Remover</button>' +
          '</div>' +
        '</div>' +
        '<div class="item__preco">' + precoHTML() + '</div>' +
      '</div>';
    }).join("") + '</div>';

    if (pe) {
      pe.innerHTML = '<p class="texto-peq" style="margin-bottom:.9rem">O valor final da sua sacola é confirmado pela loja pelo WhatsApp, junto com o frete.</p>' +
        '<a class="bt bt--rosa bt--largo" href="sacola.html">Finalizar compra</a>' +
        '<a class="bt bt--vazio bt--largo" href="loja.html">Continuar comprando</a>';
    }
  }

  /* ----------------------------------------------------- GAVETAS/MODAIS */
  function montarGavetas() {
    const menu = el('' +
      '<aside class="gmenu" id="gmenu" aria-hidden="true" aria-label="Menu">' +
        '<div class="gmenu__dentro">' +
          '<div class="gmenu__topo">' +
            '<span class="em em--claro">Preta Chik Moda Praia</span>' +
            '<button class="icone-bt" data-fecha="gmenu" aria-label="Fechar menu">' + ICO.fechar + '</button>' +
          '</div>' +
          '<ul class="gmenu__lista">' +
            NAV.map(function (n) { return '<li><a href="' + n.href + '">' + n.txt + ' ' + ICO.seta + '</a></li>'; }).join("") +
            '<li><a href="loja.html?cat=promocoes">Promoções ' + ICO.seta + '</a></li>' +
            '<li><a href="trocas.html">Trocas e devoluções ' + ICO.seta + '</a></li>' +
            '<li><a href="sobre.html">Sobre a loja ' + ICO.seta + '</a></li>' +
          '</ul>' +
          '<div class="gmenu__pe">' +
            '<a class="bt bt--rosa bt--largo" href="login.html">Minha conta</a>' +
            '<a class="bt bt--linha-clara bt--largo" href="conta.html#favoritos">Favoritos</a>' +
          '</div>' +
          '<div class="gmenu__info">' +
            LOJA.endereco + '<br>' +
            '<a href="' + LOJA.whatsapp + '" target="_blank" rel="noopener">Falar com a loja no WhatsApp</a>' +
          '</div>' +
        '</div>' +
      '</aside>');

    const sacola = el('' +
      '<aside class="gaveta" id="sacola" aria-hidden="true" aria-label="Sacola">' +
        '<div class="gaveta__topo">' +
          '<div><span class="em">Sua compra</span><h3 id="sacolaTitulo">Sacola (0)</h3></div>' +
          '<button class="icone-bt" data-fecha="sacola" aria-label="Fechar sacola">' + ICO.fechar + '</button>' +
        '</div>' +
        '<div class="gaveta__corpo" id="sacolaCorpo"></div>' +
        '<div class="gaveta__pe" id="sacolaPe"></div>' +
      '</aside>');

    const busca = el('' +
      '<div class="busca" id="busca" role="dialog" aria-modal="true" aria-label="Buscar produtos">' +
        '<div class="busca__topo">' +
          '<span class="em">Buscar na Preta Chik</span>' +
          '<button class="icone-bt" data-fecha="busca" aria-label="Fechar busca">' + ICO.fechar + '</button>' +
        '</div>' +
        '<div class="busca__dentro">' +
          '<div class="busca__campo">' +
            '<input type="search" id="buscaCampo" placeholder="O que você procura?" autocomplete="off" aria-label="Buscar produtos">' +
            '<button type="button" aria-label="Buscar">' + ICO.busca + '</button>' +
          '</div>' +
          '<div class="busca__sug">' +
            '<h4>Mais buscados</h4>' +
            '<div class="busca__chips">' +
              ["Vestido", "Conjunto", "Branco", "Verão", "Festa", "Lançamentos"].map(function (t) {
                return '<button class="chip" type="button" data-chip="' + t + '">' + t + '</button>';
              }).join("") +
            '</div>' +
          '</div>' +
          '<div class="busca__resultado" id="buscaResultado"></div>' +
        '</div>' +
      '</div>');

    const rapida = el('' +
      '<div class="rapida" id="rapida" role="dialog" aria-modal="true" aria-label="Ver rápido">' +
        '<div class="rapida__caixa" id="rapidaCaixa"></div>' +
      '</div>');

    const fundo = el('<div class="fundo" id="fundo"></div>');

    document.body.appendChild(menu);
    document.body.appendChild(sacola);
    document.body.appendChild(fundo);
    document.body.appendChild(busca);
    document.body.appendChild(rapida);

    return { menu: menu, sacola: sacola, busca: busca, rapida: rapida, fundo: fundo };
  }

  let refs = null;
  let ultimoFoco = null;

  function abrir(qual) {
    ultimoFoco = document.activeElement;
    refs.fundo.classList.add("aberto");
    document.body.classList.add("travado");
    const alvo = refs[qual];
    alvo.classList.add(qual === "menu" ? "aberto" : "aberta");
    alvo.setAttribute("aria-hidden", "false");
    if (qual === "menu") { const b = um("#btMenu"); if (b) b.setAttribute("aria-expanded", "true"); }
    if (qual === "sacola") desenharGaveta();
    if (qual === "busca") setTimeout(function () { const c = um("#buscaCampo"); if (c) c.focus(); }, 120);
    const foco = um("[data-fecha='" + qual + "']");
    if (foco && qual !== "busca") setTimeout(function () { foco.focus(); }, 320);
    document.addEventListener("keydown", teclaEsc);
  }

  function fecharTudo() {
    if (!refs) return;
    ["menu", "sacola", "busca", "rapida"].forEach(function (k) {
      refs[k].classList.remove("aberto", "aberta");
      refs[k].setAttribute("aria-hidden", "true");
    });
    refs.fundo.classList.remove("aberto");
    document.body.classList.remove("travado");
    const b = um("#btMenu"); if (b) b.setAttribute("aria-expanded", "false");
    const h = um("#btMenu"); if (h) h.classList.remove("ativo");
    document.removeEventListener("keydown", teclaEsc);
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  function teclaEsc(e) { if (e.key === "Escape") fecharTudo(); }

  /* ------------------------------------------------------- BUSCA (filtro) */
  function normaliza(t) {
    return String(t).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function buscar(termo) {
    const q = normaliza(termo.trim());
    if (!q) return [];
    return PRODUTOS.filter(function (p) {
      return normaliza(p.nome).indexOf(q) > -1 || normaliza(p.cat).indexOf(q) > -1 || normaliza(p.cor).indexOf(q) > -1;
    }).slice(0, 6);
  }

  function desenharBusca(termo) {
    const alvo = um("#buscaResultado");
    if (!alvo) return;
    if (!termo.trim()) { alvo.innerHTML = ""; return; }
    const achados = buscar(termo);
    if (!achados.length) {
      alvo.innerHTML = '<p class="busca__vazio">Nenhuma peça encontrada para &ldquo;' + escapa(termo) + '&rdquo;. Fale com a loja pelo WhatsApp que a gente procura pra você.</p>';
      return;
    }
    alvo.innerHTML = achados.map(function (p) {
      return '<a class="busca__item" href="produto.html?id=' + p.id + '">' +
        '<span class="midia"><img src="' + img("card", p.id + "-a") + '" alt="" loading="lazy" width="720" height="900"></span>' +
        '<span><b>' + escapa(p.nome) + '</b><span>' + escapa(p.cor) + ' · ' + escapa(p.cat) + '</span></span>' +
        '</a>';
    }).join("");
  }

  /* --------------------------------------------------------- RAPIDA */
  function abrirRapida(id) {
    const p = buscaProduto(id);
    if (!p) return;
    const caixa = um("#rapidaCaixa");
    caixa.innerHTML = '' +
      '<button class="icone-bt rapida__fechar" data-fecha="rapida" aria-label="Fechar">' + ICO.fechar + '</button>' +
      '<div class="rapida__foto"><div class="midia"><img src="' + img("card", p.id + "-a") + '" alt="' + escapa(p.nome) + '" width="720" height="900"></div></div>' +
      '<div class="rapida__info">' +
        '<span class="em em--rosa">' + escapa(p.cat) + '</span>' +
        '<h3 style="margin-top:.5rem">' + escapa(p.nome) + '</h3>' +
        '<p class="texto-peq" style="margin-bottom:1rem">Cor ' + escapa(p.cor) + ' · ' + TAMANHOS.join(" · ") + '</p>' +
        '<div class="prod__preco" style="padding-block:.9rem;margin-bottom:1.1rem">' + precoHTML() +
          '<span class="nota">O valor e as formas de pagamento são informados pela loja.</span></div>' +
        '<div class="prod__grupo"><span class="rotulo">Tamanho</span><div class="tamanhos" data-tams="' + p.id + '">' +
          TAMANHOS.map(function (t) {
            const off = (INDISPONIVEIS[p.id] || []).indexOf(t) > -1;
            return '<button type="button" data-tam="' + t + '"' + (off ? " disabled" : "") + (t === "M" && !off ? ' class="on"' : "") + '>' + t + '</button>';
          }).join("") +
        '</div></div>' +
        '<button class="bt bt--rosa bt--largo" type="button" data-add="' + p.id + '">Adicionar à sacola</button>' +
        '<a class="bt bt--vazio bt--largo" href="produto.html?id=' + p.id + '" style="margin-top:.5rem">Ver página da peça</a>' +
      '</div>';
    abrir("rapida");
  }

  /* ------------------------------------------------- CARTÃO DE PRODUTO */
  function cartaoHTML(p, atraso) {
    const favorito = ehFavorito(p.id);
    const badge = p.badges.length
      ? '<div class="cartao__selos">' + p.badges.map(function (b) {
          return '<span class="selo' + (b === "Novo" ? " selo--rosa" : "") + '">' + b + '</span>';
        }).join("") + '</div>'
      : "";
    return '' +
    '<article class="cartao rev" data-id="' + p.id + '" style="--atraso:' + (atraso || 0) + 'ms">' +
      '<div class="cartao__midia">' +
        '<img class="cartao__a" src="' + img("card", p.id + "-a") + '" alt="' + escapa(p.nome) + ' — ' + escapa(p.cor) + '" loading="lazy" width="720" height="900">' +
        '<img class="cartao__b" src="' + img("card", p.id + "-b") + '" alt="" aria-hidden="true" loading="lazy" width="720" height="900">' +
        '<span class="cartao__brilho" aria-hidden="true"></span>' +
        badge +
        '<button class="cartao__fav' + (favorito ? " ativo" : "") + '" type="button" data-fav="' + p.id + '" aria-pressed="' + (favorito ? "true" : "false") + '" aria-label="Favoritar ' + escapa(p.nome) + '">' + ICO.coracao + '</button>' +
        '<button class="cartao__ver" type="button" data-quick="' + p.id + '">Ver rápido</button>' +
      '</div>' +
      '<div class="cartao__txt">' +
        '<span class="cartao__cat">' + escapa(p.cat) + '</span>' +
        '<h3 class="cartao__nome"><a href="produto.html?id=' + p.id + '">' + escapa(p.nome) + '</a></h3>' +
        '<div class="cartao__preco">' + precoHTML() + '</div>' +
        '<div class="cartao__cores" aria-hidden="true">' + p.cores.map(function (c) {
          return '<i style="background:' + c + '"></i>';
        }).join("") + '</div>' +
      '</div>' +
    '</article>';
  }

  function desenharCartoes(seletor, lista) {
    const alvo = typeof seletor === "string" ? um(seletor) : seletor;
    if (!alvo) return;
    alvo.innerHTML = lista.map(function (p, i) { return cartaoHTML(p, Math.min(i, 5) * 70); }).join("");
    observar(alvo);
  }

  /* -------------------------------------------------------------- RODAPE */
  function rodapeHTML() {
    return '' +
    '<footer class="rodape">' +
      '<div class="envelope">' +
        '<div class="rodape__grade">' +
          '<div>' +
            '<div class="rodape__marca">' +
              '<span class="marca__disco"><img src="assets/img/logo/preta-chik.jpg" alt="Preta Chik Moda Praia" width="80" height="80" loading="lazy"></span>' +
              '<span><b>Preta <i>Chik</i></b><small>Moda Praia</small></span>' +
            '</div>' +
            '<p>' + escapa(LOJA.bio) + '. Boutique de moda feminina em ' + escapa(LOJA.cidade) + ', enviando para todo o Brasil.</p>' +
            '<div class="rodape__selos">' +
              '<span>' + ICO.escudo + ' Compra segura</span>' +
              '<span>' + ICO.caminhao + ' Todo o Brasil</span>' +
              '<span>' + ICO.troca + ' Troca em 7 dias</span>' +
            '</div>' +
            '<div class="rodape__sociais">' +
              '<a href="' + LOJA.instagramUrl + '" target="_blank" rel="noopener" aria-label="Instagram da Preta Chik">' + ICO.instagram + '</a>' +
              '<a href="' + LOJA.whatsapp + '" target="_blank" rel="noopener" aria-label="WhatsApp da Preta Chik">' + ICO.zap + '</a>' +
            '</div>' +
          '</div>' +
          '<div><h4>Comprar</h4><ul>' +
            '<li><a href="loja.html?cat=novidades">Novidades</a></li>' +
            '<li><a href="loja.html?cat=biquinis">Biquínis</a></li>' +
            '<li><a href="loja.html?cat=conjuntos-praia">Conjuntos Praia</a></li>' +
            '<li><a href="loja.html?cat=tops-praia">Tops de Praia</a></li>' +
            '<li><a href="loja.html?cat=maios">Maiôs</a></li>' +
            '<li><a href="loja.html?cat=promocoes">Promoções</a></li>' +
          '</ul></div>' +
          '<div><h4>Ajuda</h4><ul>' +
            '<li><a href="trocas.html">Trocas e devoluções</a></li>' +
            '<li><a href="trocas.html#prazo">Prazos de troca</a></li>' +
            '<li><a href="sacola.html">Entrega e frete</a></li>' +
            '<li><a href="conta.html#pedidos">Meus pedidos</a></li>' +
            '<li><a href="conta.html#pedidos">Rastrear pedido</a></li>' +
            '<li><a href="sobre.html#contato">Falar com a loja</a></li>' +
          '</ul></div>' +
          '<div><h4>A loja</h4><ul class="rodape__contato">' +
            '<li>' + ICO.pino + '<span>' + escapa(LOJA.endereco) + '<br>' + escapa(LOJA.cidade) + '</span></li>' +
            '<li>' + ICO.zap + '<a href="' + LOJA.whatsapp + '" target="_blank" rel="noopener">Atendimento pelo WhatsApp</a></li>' +
            '<li>' + ICO.instagram + '<a href="' + LOJA.instagramUrl + '" target="_blank" rel="noopener">@' + escapa(LOJA.instagram) + '</a></li>' +
            '<li>' + ICO.conta + '<span>Representante autorizada<br>' + escapa(LOJA.representante) + '</span></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="rodape__base">' +
          '<p>© ' + new Date().getFullYear() + ' Preta Chik Moda Praia. Todos os direitos reservados.</p>' +
          '<nav>' +
            '<a href="trocas.html">Trocas e devoluções</a>' +
            '<a href="sobre.html#contato">Atendimento</a>' +
            '<a href="sobre.html">Sobre</a>' +
          '</nav>' +
        '</div>' +
      '</div>' +
    '</footer>' +
    '<a class="zap" href="' + LOJA.whatsapp + '" target="_blank" rel="noopener" aria-label="Falar com a Preta Chik no WhatsApp">' + ICO.zap + '<span>Falar com a loja</span></a>';
  }

  /* --------------------------------------------------------- REVELACAO */
  let observador = null;
  function observar(raiz) {
    const alvos = todos(".rev, .midia-rev, .sobe-linha", raiz);
    if (!("IntersectionObserver" in window)) {
      alvos.forEach(function (a) { a.classList.add("visivel"); });
      return;
    }
    if (!observador) {
      observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("visivel"); observador.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    }
    alvos.forEach(function (a) { if (!a.classList.contains("visivel")) observador.observe(a); });
  }

  /* ------------------------------------------------------------- INICIO */
  function iniciar(opcoes) {
    const cfg = opcoes || {};
    estado.pagina = cfg.pagina || "home";

    // casca
    const topo = um("[data-shell-topo]");
    if (topo) topo.innerHTML = cabecalhoHTML();
    const pe = um("[data-shell-pe]");
    if (pe) pe.innerHTML = rodapeHTML();

    // marca o item de menu atual
    const caminho = location.pathname.split("/").pop() || "index.html";
    const params = new URLSearchParams(location.search);
    todos(".nav__lk").forEach(function (a) {
      const href = a.getAttribute("href") || "";
      const [arq, qs] = href.split("?");
      if (arq !== caminho) return;
      if (qs) {
        const cat = new URLSearchParams(qs).get("cat");
        if (cat && cat === params.get("cat")) a.setAttribute("aria-current", "page");
      } else if (!params.get("cat") && caminho !== "index.html") {
        a.setAttribute("aria-current", "page");
      }
    });

    refs = montarGavetas();
    atualizarContadores();
    desenharGaveta();

    // gavetas
    const bm = um("#btMenu");
    if (bm) bm.addEventListener("click", function () {
      if (refs.menu.classList.contains("aberto")) fecharTudo();
      else { bm.classList.add("ativo"); abrir("menu"); }
    });
    const bs = um("#btSacola");
    // href="sacola.html": sem JS o link leva a pagina da sacola (alcancavel);
    // com JS, preventDefault mantem a gaveta lateral, que nao recarrega a pagina.
    if (bs) bs.addEventListener("click", function (e) {
      if (bs.tagName === "A") e.preventDefault();
      abrir("sacola");
    });
    const bb = um("#btBusca");
    if (bb) bb.addEventListener("click", function () { abrir("busca"); });

    document.addEventListener("click", function (e) {
      const fecha = e.target.closest("[data-fecha]");
      if (fecha) { e.preventDefault(); fecharTudo(); }
      if (e.target === refs.fundo) fecharTudo();

      const fav = e.target.closest("[data-fav]");
      if (fav) { e.preventDefault(); alternarFavorito(fav.getAttribute("data-fav"), fav); }

      const quick = e.target.closest("[data-quick]");
      if (quick) { e.preventDefault(); abrirRapida(quick.getAttribute("data-quick")); }

      const add = e.target.closest("[data-add]");
      if (add) {
        e.preventDefault();
        const id = add.getAttribute("data-add");
        const caixaTam = um('[data-tams="' + id + '"]');
        const on = caixaTam ? um("button.on", caixaTam) : null;
        adicionar(id, null, on ? on.getAttribute("data-tam") : "M", 1);
      }

      const tam = e.target.closest("[data-tam]");
      if (tam && !tam.disabled) {
        const grupo = tam.parentNode;
        todos("button", grupo).forEach(function (b) { b.classList.remove("on"); });
        tam.classList.add("on");
      }

      const qtd = e.target.closest("[data-qtd]");
      if (qtd) { e.preventDefault(); mudarQtd(qtd.getAttribute("data-k"), parseInt(qtd.getAttribute("data-qtd"), 10)); }

      const rem = e.target.closest("[data-remover]");
      if (rem) { e.preventDefault(); remover(rem.getAttribute("data-remover")); }

      const chip = e.target.closest("[data-chip]");
      if (chip) {
        const campo = um("#buscaCampo");
        if (campo) { campo.value = chip.getAttribute("data-chip"); desenharBusca(campo.value); campo.focus(); }
      }

      const ac = e.target.closest(".acordeao__bt");
      if (ac) {
        const item = ac.parentNode;
        const painel = um(".acordeao__painel", item);
        const aberto = item.classList.contains("aberto");
        const pai = item.closest(".acordeao");
        if (pai && !pai.hasAttribute("data-multiplo")) {
          todos(".acordeao__item.aberto", pai).forEach(function (o) {
            o.classList.remove("aberto");
            um(".acordeao__painel", o).style.height = "0px";
            um(".acordeao__bt", o).setAttribute("aria-expanded", "false");
          });
        }
        if (aberto) { item.classList.remove("aberto"); painel.style.height = "0px"; ac.setAttribute("aria-expanded", "false"); }
        else { item.classList.add("aberto"); painel.style.height = painel.scrollHeight + "px"; ac.setAttribute("aria-expanded", "true"); }
      }
    });

    // busca ao digitar
    const campo = um("#buscaCampo");
    if (campo) {
      let t = null;
      campo.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () { desenharBusca(campo.value); }, 140);
      });
      campo.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); const r = buscar(campo.value); if (r.length) location.href = "produto.html?id=" + r[0].id; }
      });
    }

    // cabecalho ao rolar
    const cab = um("#cabecalho");
    let ultimo = 0;
    function aoRolar() {
      const y = window.scrollY || 0;
      if (cab) cab.classList.toggle("rolou", y > 12);
      if (Math.abs(y - ultimo) > 6) { pausarCorre(); ultimo = y; }
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    aoRolar();

    // painel do menu
    const painel = um("#painel");
    if (painel && cab) {
      const gatilhos = todos("[data-abre-painel]");
      gatilhos.forEach(function (g) {
        g.addEventListener("mouseenter", function () {
          painel.classList.add("aberto");
          painel.setAttribute("aria-hidden", "false");
          g.setAttribute("aria-expanded", "true");
        });
      });
      cab.addEventListener("mouseleave", function () {
        painel.classList.remove("aberto");
        painel.setAttribute("aria-hidden", "true");
        gatilhos.forEach(function (g) { g.setAttribute("aria-expanded", "false"); });
      });
      painel.addEventListener("mouseenter", function () { painel.classList.add("aberto"); });
    }

    // newsletter
    todos("[data-news]").forEach(function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        const c = um("input", f);
        if (!c || !c.value.trim() || c.value.indexOf("@") < 0) {
          toast("Confira o seu e-mail, por favor");
          if (c) c.focus();
          return;
        }
        const ok = um(".news__ok");
        if (ok) ok.classList.add("visivel");
        f.classList.add("oculto");
        toast("Pronto! Você vai receber as novidades");
      });
    });

    observar();

    // revelar o que ja esta na tela no primeiro quadro
    requestAnimationFrame(function () {
      todos(".rev, .midia-rev, .sobe-linha").forEach(function (a) {
        const r = a.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.94) a.classList.add("visivel");
      });
    });

    document.dispatchEvent(new CustomEvent("lb:pronto"));
  }

  /* pausa o marquee durante a rolagem (evita animacao brigando com o scroll) */
  function pausarCorre() {
    todos(".faixa-corre__trilho").forEach(function (t) {
      if (t.dataset.pausado) return;
      t.dataset.pausado = "1";
      t.style.animationPlayState = "paused";
      setTimeout(function () { t.style.animationPlayState = "running"; delete t.dataset.pausado; }, 320);
    });
  }

  /* ------------------------------------------------------------- EXPORTA */
  return {
    ICO: ICO, NAV: NAV, LOJA: LOJA,
    iniciar: iniciar, observar: observar, toast: toast,
    cartao: cartaoHTML, desenharCartoes: desenharCartoes,
    adicionar: adicionar, remover: remover, mudarQtd: mudarQtd,
    alternarFavorito: alternarFavorito, ehFavorito: ehFavorito,
    estado: estado, escapa: escapa, img: img, precoHTML: precoHTML,
    desenharGaveta: desenharGaveta, atualizarContadores: atualizarContadores,
    abrirRapida: abrirRapida, buscar: buscar, aberto: function () { return !!(refs && refs.fundo.classList.contains("aberto")); }
  };
})();


