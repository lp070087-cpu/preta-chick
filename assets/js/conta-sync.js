/* ==========================================================================
   conta-sync.js — favoritos e sacola salvos na conta (só em conta.html)
   --------------------------------------------------------------------------
   O site guarda favoritos e sacola no navegador (localStorage, via LB em
   ui.js). Quando a cliente entra na conta, este arquivo:

   1. busca o que está salvo no servidor (GET /api/conta/favoritos e
      /api/conta/carrinho);
   2. junta com o que está no navegador — favoritos: união; sacola: uma
      linha por chave k = id|cor|tam, ficando com a MAIOR quantidade;
   3. grava a junção nos dois lados (PUT no servidor + localStorage) e
      redesenha contadores e gaveta;
   4. passa a ouvir "lb:favoritos" e "lb:carrinho" e manda cada mudança
      ao servidor (com um pequeno atraso para juntar cliques seguidos).

   Só começa depois que conta-app.js confirmou a sessão (/api/auth/me).
   Falha de rede aqui NUNCA quebra a página: o navegador continua sendo a
   fonte local, e a próxima mudança tenta de novo.
   ========================================================================== */

var CONTA_SYNC = (function () {
  "use strict";

  var CHAVE_CARRINHO = "labelle_carrinho_v1";
  var CHAVE_FAVORITOS = "labelle_favoritos_v1";
  var ATRASO = 600;

  var ativo = false;
  var pronto = false;        /* true depois da junção inicial */
  var pendente = { fav: false, car: false };
  var timers = { fav: 0, car: 0 };

  function temLB() { return typeof LB !== "undefined" && LB && LB.estado; }
  function api() { return CONTA_API.LOJA; }

  function gravar(chave, valor) {
    try { window.localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem storage: segue */ }
  }

  /* troca o conteúdo do array SEM trocar a referência (ui.js pode ter
     guardado o array em algum lugar).                                    */
  function substituir(arr, novo) {
    arr.length = 0;
    Array.prototype.push.apply(arr, novo);
    return arr;
  }

  function redesenhar() {
    if (typeof LB.atualizarContadores === "function") LB.atualizarContadores();
    if (typeof LB.desenharGaveta === "function") LB.desenharGaveta();
  }

  function mesmoConjunto(a, b) {
    if (a.length !== b.length) return false;
    var m = {};
    a.forEach(function (x) { m[x] = 1; });
    return b.every(function (x) { return m[x] === 1; });
  }

  /* ----------------------------------------------------------- favoritos */
  function juntarFavoritos(doServidor) {
    var local = Array.isArray(LB.estado.favoritos) ? LB.estado.favoritos : (LB.estado.favoritos = []);
    var uniao = local.slice();
    (doServidor || []).forEach(function (id) {
      if (id && uniao.indexOf(id) < 0) uniao.push(id);
    });
    substituir(local, uniao);
    gravar(CHAVE_FAVORITOS, uniao);

    /* corações já desenhados na página acompanham a lista nova */
    Array.prototype.forEach.call(document.querySelectorAll("[data-fav]"), function (b) {
      var on = uniao.indexOf(b.getAttribute("data-fav")) > -1;
      b.classList.toggle("ativo", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });

    if (!mesmoConjunto(uniao, doServidor || [])) return api().salvarFavoritos(uniao);
    return null;
  }

  /* -------------------------------------------------------------- sacola */
  function chave(i) { return i.k || (i.id + "|" + i.cor + "|" + i.tam); }

  function limpaItem(i) {
    return { k: chave(i), id: i.id, cor: i.cor, tam: i.tam, qtd: Math.max(1, parseInt(i.qtd, 10) || 1) };
  }

  function itensDoNavegador() {
    return (Array.isArray(LB.estado.carrinho) ? LB.estado.carrinho : [])
      .filter(function (i) { return i && i.id && i.tam; })
      .map(limpaItem);
  }

  function juntarCarrinho(doServidor) {
    var local = Array.isArray(LB.estado.carrinho) ? LB.estado.carrinho : (LB.estado.carrinho = []);
    var porChave = {};
    var ordem = [];
    function soma(i) {
      if (!i || !i.id || !i.tam) return;
      var it = limpaItem(i);
      if (porChave[it.k]) porChave[it.k].qtd = Math.max(porChave[it.k].qtd, it.qtd);
      else { porChave[it.k] = it; ordem.push(it.k); }
    }
    local.forEach(soma);
    (doServidor || []).forEach(soma);
    var juntos = ordem.map(function (k) { return porChave[k]; });

    substituir(local, juntos);
    gravar(CHAVE_CARRINHO, juntos);

    var srv = (doServidor || []).map(function (i) { return chave(i) + "#" + i.qtd; });
    var nos = juntos.map(function (i) { return i.k + "#" + i.qtd; });
    if (!mesmoConjunto(srv, nos)) return api().salvarCarrinho(juntos);
    return null;
  }

  /* ------------------------------------------------- envio das mudanças */
  function enviar(qual) {
    if (!ativo) return;
    var p = qual === "fav"
      ? api().salvarFavoritos((LB.estado.favoritos || []).slice())
      : api().salvarCarrinho(itensDoNavegador());
    p["catch"](tratarFalha);
  }

  function agendar(qual) {
    if (!ativo) return;
    if (!pronto) { pendente[qual] = true; return; }
    clearTimeout(timers[qual]);
    timers[qual] = setTimeout(function () { enviar(qual); }, ATRASO);
  }

  function aoMudarFavoritos() { agendar("fav"); }
  function aoMudarCarrinho() { agendar("car"); }

  function tratarFalha(falha) {
    /* sessão caiu: para de sincronizar. Quem leva para o login é a
       própria área da cliente, na próxima chamada dela.                 */
    if (falha && falha.status === 401) parar();
  }

  /* -------------------------------------------------------------- início */
  function iniciar() {
    if (ativo || !temLB() || typeof CONTA_API === "undefined" || !CONTA_API.LOJA) return Promise.resolve(false);
    ativo = true;
    pronto = false;

    document.addEventListener("lb:favoritos", aoMudarFavoritos);
    document.addEventListener("lb:carrinho", aoMudarCarrinho);

    var fav = api().favoritos().then(juntarFavoritos)["catch"](tratarFalha);
    var car = api().carrinho().then(juntarCarrinho)["catch"](tratarFalha);

    return Promise.all([fav, car]).then(function () {
      if (!ativo) return false;
      redesenhar();
      pronto = true;
      if (pendente.fav) { pendente.fav = false; agendar("fav"); }
      if (pendente.car) { pendente.car = false; agendar("car"); }
      document.dispatchEvent(new CustomEvent("conta:sincronizado"));
      return true;
    });
  }

  function parar() {
    ativo = false;
    pronto = false;
    clearTimeout(timers.fav);
    clearTimeout(timers.car);
    document.removeEventListener("lb:favoritos", aoMudarFavoritos);
    document.removeEventListener("lb:carrinho", aoMudarCarrinho);
  }

  return { iniciar: iniciar, parar: parar };
})();
