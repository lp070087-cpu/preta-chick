/* ==========================================================================
   conta-sessao.js — PORTÃO DE SESSÃO das páginas de acesso
   --------------------------------------------------------------------------
   PROBLEMA QUE ESTE ARQUIVO RESOLVE

   login.html e cadastro.html mostravam o formulário SEMPRE. Se a pessoa já
   estava conectada (cookie persistente do "Manter conectado" ainda válido) e
   clicasse de novo em "Minha conta", ela caía no formulário e era obrigada a
   digitar e-mail e senha outra vez — mesmo com a sessão viva no servidor.

   O site inteiro aponta "Minha conta" para login.html. Fazer cada link
   decidir sozinho onde ir significaria espalhar verificação de sessão por
   várias páginas. Em vez disso, UMA porta de entrada verifica e encaminha.

   COMO FUNCIONA

   Ao abrir a página de acesso, perguntamos ao SERVIDOR quem está conectado:

     /api/auth/me responde 200  -> há sessão. Vai para conta.html.
     /api/auth/me responde 401  -> não há sessão. Mostra o formulário.
     /api/auth/me falha (5xx,
     rede caindo)               -> NÃO dá para saber. Mostra o formulário
                                   mesmo assim, e nunca apaga nada.

   POR QUE O ERRO DE SERVIDOR NÃO VIRA "DESLOGADO"

   Um banco fora do ar responde 503, não 401. Tratar 503 como "não está
   conectada" seria afirmar uma coisa que o servidor não disse. Aqui o
   formulário aparece — é a única tela que faz sentido oferecer nesse caso —
   mas a sessão no servidor fica intacta: quando o banco voltar, o próximo
   acesso entra direto. Nada é destruído por um tropeço do servidor.

   O QUE ESTE ARQUIVO NÃO FAZ (e nunca deve fazer)

   Não lê o cookie. Não guarda token. Não usa localStorage nem
   sessionStorage. O cookie é HttpOnly: o JavaScript da página não o vê, e
   quem responde quem é a pessoa é o SERVIDOR, em /api/auth/me. Guardar
   cópia do lado do navegador criaria a falsa impressão de proteção e uma
   segunda fonte da verdade para sair de sincronia.
   ========================================================================== */

var CONTA_SESSAO = (function () {
  "use strict";

  /* O "sair" de uma sessão viva NUNCA pode impedir a verificação — senão a
     pessoa ficaria presa na tela de login mesmo conectada. Por isso o
     bloqueio é limitado no tempo: se o servidor não responder, libera. */
  var LIMITE_MS = 6000;

  var estado = "conferindo"; /* conferindo | livre | indo */

  function liberar() {
    if (estado === "conferindo") estado = "livre";
    /* a classe some sempre que o estado deixa de ser "conferindo"; o
       formulário volta a aparecer do jeito que a página já desenha */
    document.documentElement.classList.remove("sessao-conferindo");
  }

  function irParaConta() {
    estado = "indo";
    document.documentElement.classList.remove("sessao-conferindo");
    /* replace (e não href): o "voltar" do navegador não deve trazer a pessoa
       de volta para o formulário de login recém-pulado */
    location.replace("conta.html");
  }

  /* `aoLiberar` é opcional: quem quiser reagir ao veredito (ex.: o cadastro
     já logado não deveria abrir o aceite dos termos) registra uma função. */
  function conferir(aoLiberar) {
    var respondeu = false;
    var encerrar = function (fn) {
      return function (arg) {
        /* primeira resposta vence: se o limite disparou antes, o que chegar
           depois é ignorado — assim o veredito não muda no meio do caminho */
        if (respondeu) return;
        respondeu = true;
        fn(arg);
      };
    };

    var deuCerto = encerrar(function (cliente) {
      /* `cliente` só existe quando o servidor confirmou a sessão. A tela
         pode usar (ex.: cumprimentar a cliente que está de passagem).     */
      irParaConta();
    });

    var deuErrado = encerrar(function (falha) {
      liberar();
      /* 401 = o servidor respondeu que não há sessão: é o caso normal de
         quem chega para entrar. Nenhuma ação extra é necessária.          */
      if (aoLiberar) aoLiberar(falha);
    });

    var estourou = setTimeout(function () {
      deuErrado(null);
    }, LIMITE_MS);

    CONTA_API.AUTH.eu()
      .then(function (cliente) {
        clearTimeout(estourou);
        deuCerto(cliente);
      })
      ["catch"](function (falha) {
        clearTimeout(estourou);
        deuErrado(falha);
      });
  }

  return { conferir: conferir, estado: function () { return estado; } };
})();
