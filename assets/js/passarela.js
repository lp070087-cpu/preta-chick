/* ==========================================================================
   passarela.js — banner "passarela de modelos" da home
   --------------------------------------------------------------------------
   Seis looks reais da Preta Chik (fotos com fundo removido). A modelo da
   frente fica à direita; as outras seguem em fila para a esquerda.
   - setas, teclado (← →), arrastar no celular;
   - clicar numa modelo de trás traz ela para a frente;
   - clicar na modelo da frente abre a peça;
   - prefers-reduced-motion: sem flutuar e sem transição.
   Depende de dados.js e ui.js (LB).

   Suavidade (principalmente no celular):
   - a posição de cada modelo vai em --pos e é aplicada via transform
     (passarela.css), sem animar "left" — nada de recalcular layout a cada
     quadro;
   - a modelo que sai da frente "pousa" do ponto em que estava flutuando,
     em vez de saltar de volta (era o tranco ao trocar);
   - nome e peças do look têm altura reservada pela maior das seis, para o
     conteúdo abaixo do banner não pular a cada troca;
   - as fotos das peças são pré-carregadas e reaproveitadas (sem piscar).
   ========================================================================== */

(function () {
  "use strict";

  var palco = document.querySelector("#palco");
  if (!palco) return;

  /* foto -> peça da loja: cada recorte vem da MESMA foto usada no cartão
     daquela peça (assets/img/preta-chik/modelo -> card/pNN-a|b).          */
  /* pe: linhas transparentes (de 1400) abaixo dos pés na foto — compensadas
     para todas pisarem na mesma linha e terem a mesma altura.            */
  var ALTURA_FOTO = 1400;
  var LOOKS = [
    { foto: "modelo-1", produto: "p04", larg: 478 },
    { foto: "modelo-2", produto: "p03", larg: 619 },
    { foto: "modelo-3", produto: "p06", larg: 543, pe: 41 },
    { foto: "modelo-4", produto: "p04", larg: 570 },
    { foto: "modelo-5", produto: "p03", larg: 584 },
    { foto: "modelo-6", produto: "p05", larg: 651 }
  ];
  /* posições de referência (slot 0 = frente) */
  var POS = [79, 58, 42, 29, 18, 8.5];
  /* celular: só 4 modelos visíveis, fila mais aberta para não se amontoar */
  var POS_CEL = [72, 46, 27, 11, 4, 0];
  var celular = window.matchMedia("(max-width: 560px)");
  var semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ESC = [1, .8, .67, .57, .5, .44];
  var DESF = [0, 0, .8, 1.8, 2.8, 3.8];
  var OPAC = [1, 1, .96, .86, .7, .55];
  var POUSO = ".9s cubic-bezier(.76, 0, .24, 1)";

  var N = LOOKS.length;
  var atual = 0;
  var frente = -1;
  var chegada = null;
  var iniciado = false;
  var els = [];

  var $nome = document.querySelector("#passarelaNome");
  var $contador = document.querySelector("#passarelaContador");
  var $corNome = document.querySelector("#passarelaCorNome");
  var $cores = document.querySelector("#passarelaCores");
  var $ver = document.querySelector("#passarelaVer");
  var $preco = document.querySelector("#passarelaPreco");
  var $aviso = document.querySelector("#passarelaAviso");
  var $pecas = document.querySelector("#passarelaPecas");

  function produto(i) { return buscaProduto(LOOKS[i].produto); }

  /* ------------------------------------------------------- montar */
  LOOKS.forEach(function (l, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "modelo";
    if (l.pe) {
      var util = ALTURA_FOTO - l.pe;
      b.style.setProperty("--img-h", (ALTURA_FOTO / util * 100) + "%");
      b.style.setProperty("--img-base", (-l.pe / util * 100) + "%");
    }
    b.innerHTML = '<span class="modelo__sombra" aria-hidden="true"></span>' +
      '<img class="modelo__img" src="assets/img/passarela/' + l.foto + '.webp" alt="" width="600" height="1400"' +
      (i < 3 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
    b.addEventListener("click", function () {
      if (arrastou) return;
      if (i === atual) location.href = "produto.html?id=" + produto(i).id;
      else ir(i);
    });
    palco.appendChild(b);
    els.push(b);
  });

  var segs = document.querySelector("#passarelaSegmentos");
  segs.innerHTML = LOOKS.map(function (l, i) {
    return '<button type="button" data-look="' + i + '" aria-label="Look ' + (i + 1) + '"></button>';
  }).join("");
  segs.addEventListener("click", function (e) {
    var b = e.target.closest("[data-look]");
    if (b) ir(parseInt(b.getAttribute("data-look"), 10));
  });

  /* peças do look: dois cartões fixos, só o conteúdo muda */
  var pecas = ["a", "b"].map(function () {
    var c = document.createElement("div");
    c.className = "passarela__peca";
    c.innerHTML = '<img src="" alt="" width="78" height="96" decoding="async">' +
      '<div><b></b><small></small><div class="passarela__peca-acoes"></div></div>';
    $pecas.appendChild(c);
    return {
      raiz: c,
      img: c.querySelector("img"),
      nome: c.querySelector("b"),
      info: c.querySelector("small"),
      acoes: c.querySelector(".passarela__peca-acoes")
    };
  });

  /* ------------------------------------------- a modelo que sai da frente */
  /* Sem isto, ao perder .modelo--frente a animação de flutuar é cortada e a
     foto salta até 10px de volta ao chão. Aqui ela parte do ponto exato em
     que estava e desce junto com a troca de posição.                       */
  function pousar(el) {
    if (semMovimento.matches) return;
    var partes = [el.querySelector(".modelo__img"), el.querySelector(".modelo__sombra")];
    var agora = partes.map(function (n) {
      var cs = getComputedStyle(n);
      return { t: cs.transform, o: cs.opacity };
    });
    el.classList.remove("modelo--frente");
    partes.forEach(function (n, k) {
      n.style.animation = "none";
      n.style.transition = "none";
      n.style.transform = agora[k].t === "none" ? "" : agora[k].t;
      n.style.opacity = agora[k].o;
    });
    void el.offsetWidth; // fixa o ponto de partida
    partes.forEach(function (n) {
      n.style.transition = "transform " + POUSO + ", opacity " + POUSO;
      n.style.transform = "";
      n.style.opacity = "";
      n.addEventListener("transitionend", function fim(e) {
        if (e.target !== n) return;
        n.removeEventListener("transitionend", fim);
        if (!el.classList.contains("modelo--frente")) limpar(n);
      });
    });
  }
  function limpar(n) {
    n.style.animation = n.style.transition = n.style.transform = n.style.opacity = "";
  }

  /* ------------------------------------------------------- pintar */
  /* foto mais larga que a caixa (ex.: modelo-6 no celular) não pode passar
     da borda direita do palco: puxa só o necessário para dentro.         */
  function posicao(i, slot, pos) {
    var x = pos[slot];
    var W = palco.clientWidth, H = els[i].offsetHeight;
    if (!W || !H) return x;
    var l = LOOKS[i], util = ALTURA_FOTO - (l.pe || 0);
    var meia = (H * ALTURA_FOTO / util) * (l.larg / ALTURA_FOTO) * ESC[slot] / 2;
    var limite = W - 6;
    var direita = x / 100 * W + meia;
    return direita > limite ? x - (direita - limite) / W * 100 : x;
  }

  function pintarModelos() {
    var pos = celular.matches ? POS_CEL : POS;
    els.forEach(function (el, i) {
      var slot = (i - atual + N) % N;
      var p = produto(i);
      el.style.setProperty("--pos", posicao(i, slot, pos));
      el.style.setProperty("--escala", ESC[slot]);
      el.style.setProperty("--desfoque", DESF[slot] + "px");
      el.style.setProperty("--opacidade", OPAC[slot]);
      el.style.setProperty("--z", 10 - slot);
      el.setAttribute("data-slot", slot);
      el.setAttribute("data-acao", "Ver a peça");
      el.setAttribute("aria-label", slot === 0
        ? "Look " + (i + 1) + ": " + p.nome + ". Abrir a peça"
        : "Trazer para a frente o look " + (i + 1) + ": " + p.nome);
      el.tabIndex = slot === 0 ? 0 : -1;
    });

    if (frente !== atual) {
      if (frente > -1 && els[frente].classList.contains("modelo--frente")) pousar(els[frente]);
      var nova = els[atual];
      [nova.querySelector(".modelo__img"), nova.querySelector(".modelo__sombra")].forEach(limpar);
      frente = atual;
      /* o flutuar só começa quando a modelo TERMINA de chegar à frente
         (antes ela já flutuava enquanto ainda andava na fila) */
      clearTimeout(chegada);
      if (semMovimento.matches || !iniciado) nova.classList.add("modelo--frente");
      else chegada = setTimeout(function () { if (frente === atual) els[atual].classList.add("modelo--frente"); }, 900);
    }
  }

  function pintarTextos(i) {
    var p = produto(i);
    $nome.textContent = p.nome;
    pintarLado(p);
  }

  function pintarLado(p) {
    pecas.forEach(function (c, j) {
      var src = fotoProduto(p, j === 0 ? "a" : "b");
      if (c.img.getAttribute("src") !== src) c.img.setAttribute("src", src);
      c.nome.textContent = j === 0 ? p.nome : "Outra foto da peça";
      c.info.innerHTML = LB.escapa(p.cor || "") + " · " + LB.precoHTML(p);
      var fav = LB.ehFavorito(p.id);
      c.acoes.innerHTML = j === 0
        ? '<button class="passarela__mini" type="button" data-quick="' + p.id + '">Escolher tamanho</button>' +
          '<a class="passarela__mini" href="produto.html?id=' + p.id + '">Detalhes</a>'
        : '<button class="passarela__mini" type="button" data-fav="' + p.id + '" aria-pressed="' + (fav ? "true" : "false") + '">' + (fav ? "Favorita ✓" : "Favoritar") + '</button>';
    });
  }

  function pintar() {
    pintarModelos();
    var p = produto(atual);
    pintarTextos(atual);
    $contador.textContent = String(atual + 1).padStart(2, "0") + " / " + String(N).padStart(2, "0");
    Array.prototype.forEach.call(segs.children, function (b, i) { b.setAttribute("aria-current", i === atual ? "true" : "false"); });
    $corNome.textContent = p.cor || "";
    $cores.innerHTML = (p.cores || []).slice(0, 4).map(function (c) {
      return '<i style="background:' + c + '"></i>';
    }).join("");
    $ver.href = "produto.html?id=" + p.id;
    $preco.textContent = temPreco(p) ? dinheiro(p.preco) : "Sob consulta";
    $aviso.textContent = "Look " + (atual + 1) + " de " + N + ": " + p.nome;
  }

  /* ------------------------------------------- alturas estáveis */
  /* Mede, antes de pintar a tela, a maior altura do nome e de cada cartão
     de peça entre os seis looks e reserva esse espaço: assim o que vem
     abaixo do banner não sobe e desce a cada troca.                       */
  function estabilizar() {
    var alvos = [$nome].concat(pecas.map(function (c) { return c.raiz; }));
    alvos.forEach(function (a) { a.style.minHeight = ""; });
    var maior = alvos.map(function () { return 0; });
    for (var i = 0; i < N; i++) {
      pintarTextos(i);
      alvos.forEach(function (a, k) { maior[k] = Math.max(maior[k], a.getBoundingClientRect().height); });
    }
    pintarTextos(atual);
    alvos.forEach(function (a, k) { if (maior[k]) a.style.minHeight = Math.ceil(maior[k]) + "px"; });
  }

  var larguraAntes = window.innerWidth, espera = null;
  window.addEventListener("resize", function () {
    if (window.innerWidth === larguraAntes) return; // barra do navegador do celular
    larguraAntes = window.innerWidth;
    clearTimeout(espera);
    espera = setTimeout(function () { pintarModelos(); estabilizar(); }, 150);
  }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(estabilizar);

  /* ------------------------------------------- pré-carregar */
  function preCarregar() {
    LOOKS.forEach(function (l, i) {
      var p = produto(i);
      ["a", "b"].forEach(function (f) { var im = new Image(); im.decoding = "async"; im.src = fotoProduto(p, f); });
    });
  }
  if ("requestIdleCallback" in window) requestIdleCallback(preCarregar, { timeout: 2500 });
  else setTimeout(preCarregar, 1200);

  /* ------------------------------------------- navegar */
  function ir(i) {
    i = (i + N) % N;
    if (i === atual) return;
    atual = i;
    pintar();
  }
  function passo(d) { ir(atual + d); }

  document.querySelector("#passarelaAnt").addEventListener("click", function () { passo(-1); });
  document.querySelector("#passarelaProx").addEventListener("click", function () { passo(1); });

  palco.addEventListener("keydown", function (e) {
    arrastou = false;
    if (e.key === "ArrowRight") { e.preventDefault(); passo(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); passo(-1); }
  });

  /* ------------------------------------------------- arrastar/deslizar */
  /* "arrastou" só é zerado no próximo toque: o clique sintético que alguns
     celulares disparam depois do deslize não abre a peça por engano.     */
  var x0 = null, y0 = 0, arrastou = false;
  palco.addEventListener("pointerdown", function (e) { x0 = e.clientX; y0 = e.clientY; arrastou = false; });
  palco.addEventListener("pointermove", function (e) {
    if (x0 !== null && Math.abs(e.clientX - x0) > 12 && Math.abs(e.clientX - x0) > Math.abs(e.clientY - y0)) arrastou = true;
  });
  palco.addEventListener("pointerup", function (e) {
    if (x0 === null) return;
    var d = e.clientX - x0; x0 = null;
    if (arrastou && Math.abs(d) > 50) passo(d < 0 ? 1 : -1);
  });
  palco.addEventListener("pointercancel", function () { x0 = null; arrastou = false; });

  function mudouTela() { pintarModelos(); estabilizar(); }
  if (celular.addEventListener) celular.addEventListener("change", mudouTela);
  else if (celular.addListener) celular.addListener(mudouTela);
  document.addEventListener("lb:catalogo", function () { pintar(); estabilizar(); });
  document.addEventListener("lb:favoritos", function () { pintarLado(produto(atual)); });

  pintar();
  estabilizar();
  iniciado = true;
})();
