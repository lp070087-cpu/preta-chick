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
   ========================================================================== */

(function () {
  "use strict";

  var palco = document.querySelector("#palco");
  if (!palco) return;

  /* foto -> peça da loja (a foto é a mesma do cartão daquela peça) */
  var LOOKS = [
    { foto: "modelo-1", produto: "p02" },
    { foto: "modelo-2", produto: "p03" },
    { foto: "modelo-3", produto: "p01" },
    { foto: "modelo-4", produto: "p06" },
    { foto: "modelo-5", produto: "p04" },
    { foto: "modelo-6", produto: "p05" }
  ];
  /* posições de referência (slot 0 = frente) */
  var POS = [79, 58, 42, 29, 18, 8.5];
  var ESC = [1, .8, .67, .57, .5, .44];
  var DESF = [0, 0, .8, 1.8, 2.8, 3.8];
  var OPAC = [1, 1, .96, .86, .7, .55];

  var N = LOOKS.length;
  var atual = 0;
  var els = [];

  function produto(i) { return buscaProduto(LOOKS[i].produto); }

  /* ------------------------------------------------------- montar */
  LOOKS.forEach(function (l, i) {
    var p = produto(i);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "modelo";
    b.innerHTML = '<span class="modelo__sombra" aria-hidden="true"></span>' +
      '<img class="modelo__img" src="assets/img/passarela/' + l.foto + '.webp" alt="" width="600" height="1400"' +
      (i < 3 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
    b.addEventListener("click", function () {
      if (arrastou) return;
      if (i === atual) location.href = "produto.html?id=" + p.id;
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

  /* ------------------------------------------------------- pintar */
  function pintar() {
    els.forEach(function (el, i) {
      var slot = (i - atual + N) % N;
      var p = produto(i);
      el.style.left = POS[slot] + "%";
      el.style.setProperty("--escala", ESC[slot]);
      el.style.setProperty("--desfoque", DESF[slot] + "px");
      el.style.setProperty("--opacidade", OPAC[slot]);
      el.style.setProperty("--z", 10 - slot);
      el.setAttribute("data-slot", slot);
      el.classList.toggle("modelo--frente", slot === 0);
      el.setAttribute("data-acao", "Ver a peça");
      el.setAttribute("aria-label", slot === 0
        ? "Look " + (i + 1) + ": " + p.nome + ". Abrir a peça"
        : "Trazer para a frente o look " + (i + 1) + ": " + p.nome);
      el.tabIndex = slot === 0 ? 0 : -1;
    });

    var p = produto(atual);
    document.querySelector("#passarelaNome").textContent = p.nome;
    document.querySelector("#passarelaContador").textContent = String(atual + 1).padStart(2, "0") + " / " + String(N).padStart(2, "0");
    Array.prototype.forEach.call(segs.children, function (b, i) { b.setAttribute("aria-current", i === atual ? "true" : "false"); });
    document.querySelector("#passarelaCorNome").textContent = p.cor || "";
    document.querySelector("#passarelaCores").innerHTML = (p.cores || []).slice(0, 4).map(function (c) {
      return '<i style="background:' + c + '"></i>';
    }).join("");
    var ver = document.querySelector("#passarelaVer");
    ver.href = "produto.html?id=" + p.id;
    document.querySelector("#passarelaPreco").textContent = temPreco(p) ? dinheiro(p.preco) : "Sob consulta";
    document.querySelector("#passarelaAviso").textContent = "Look " + (atual + 1) + " de " + N + ": " + p.nome;
    pintarLado(p);
  }

  function pintarLado(p) {
    var lado = document.querySelector("#passarelaPecas");
    lado.innerHTML = ["a", "b"].map(function (f, j) {
      return '<div class="passarela__peca">' +
        '<img src="' + fotoProduto(p, f) + '" alt="" loading="lazy" width="78" height="96">' +
        '<div><b>' + LB.escapa(j === 0 ? p.nome : "Outra foto da peça") + '</b>' +
        '<small>' + LB.escapa(p.cor || "") + ' · ' + LB.precoHTML(p) + '</small>' +
        '<div class="passarela__peca-acoes">' +
          (j === 0
            ? '<button class="passarela__mini" type="button" data-quick="' + p.id + '">Escolher tamanho</button>' +
              '<a class="passarela__mini" href="produto.html?id=' + p.id + '">Detalhes</a>'
            : '<button class="passarela__mini" type="button" data-fav="' + p.id + '" aria-pressed="' + (LB.ehFavorito(p.id) ? "true" : "false") + '">' + (LB.ehFavorito(p.id) ? "Favorita ✓" : "Favoritar") + '</button>') +
        '</div></div></div>';
    }).join("");
  }

  function ir(i) { atual = (i + N) % N; pintar(); }
  function passo(d) { ir(atual + d); }

  document.querySelector("#passarelaAnt").addEventListener("click", function () { passo(-1); });
  document.querySelector("#passarelaProx").addEventListener("click", function () { passo(1); });

  palco.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); passo(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); passo(-1); }
  });

  /* ------------------------------------------------- arrastar/deslizar */
  var x0 = null, arrastou = false;
  palco.addEventListener("pointerdown", function (e) { x0 = e.clientX; arrastou = false; });
  palco.addEventListener("pointermove", function (e) { if (x0 !== null && Math.abs(e.clientX - x0) > 12) arrastou = true; });
  palco.addEventListener("pointerup", function (e) {
    if (x0 === null) return;
    var d = e.clientX - x0; x0 = null;
    if (Math.abs(d) > 50) passo(d < 0 ? 1 : -1);
    setTimeout(function () { arrastou = false; }, 0);
  });
  palco.addEventListener("pointercancel", function () { x0 = null; arrastou = false; });

  document.addEventListener("lb:catalogo", pintar);
  document.addEventListener("lb:favoritos", function () { pintarLado(produto(atual)); });
  pintar();
})();
