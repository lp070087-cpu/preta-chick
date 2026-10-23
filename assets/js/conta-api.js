/* ==========================================================================
   conta-api.js — ponte entre a interface e o servidor
   --------------------------------------------------------------------------
   ESTE ARQUIVO SUBSTITUI O CONTA_MOCK PARA TUDO QUE É AUTENTICAÇÃO.

   Antes, a interface conversava com CONTA_MOCK. Agora ela conversa com
   CONTA_API, que fala HTTP com as funções serverless em /api.

   DUAS SEPARAÇÕES QUE IMPORTAM:

   1. AUTENTICAÇÃO e DADOS PESSOAIS são REAIS. Vêm do servidor, com sessão
      em cookie HttpOnly. Nada de senha no navegador, nada em localStorage.
      O JavaScript da página NÃO tem acesso ao token da sessão — é o
      navegador que guarda e envia o cookie sozinho.

   2. PEDIDOS, ATENDIMENTOS, ENDEREÇOS, FAVORITOS e SACOLA também são
      REAIS: vêm de /api/conta/* (namespace LOJA, no fim do arquivo), com
      a mesma sessão. Não há mais dado de demonstração na área da cliente.

   POR QUE O COOKIE VAI COM credentials: "same-origin"
   Sem isso, o navegador não envia o cookie de sessão e toda chamada voltaria
   401. "same-origin" (e não "include") é o suficiente porque a API mora no
   mesmo domínio do site — e é mais restritivo, o que é correto.
   ========================================================================== */

var CONTA_API = (function () {
  "use strict";

  var BASE = "/api";

  /* Erro de rede/servidor com uma mensagem que a interface pode mostrar. */
  function Falha(mensagem, campo, status) {
    var e = new Error(mensagem);
    e.campo = campo || null;
    e.status = status || 0;
    e.ehFalhaApi = true;
    return e;
  }

  /* ------------------------------------------------------------ pedido
     Devolve SEMPRE uma Promise. Nunca lança de forma síncrona, para quem
     chama poder usar .then().catch() sem try/catch em volta.            */
  function pedir(caminho, opcoes) {
    var cfg = opcoes || {};
    return new Promise(function (resolve, reject) {
      var init = {
        method: cfg.metodo || "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      };
      if (cfg.corpo !== undefined) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(cfg.corpo);
      }

      fetch(BASE + caminho, init)
        .then(function (r) {
          /* Lê o corpo mesmo em erro: a API sempre manda { erro }. */
          return r.text().then(function (texto) {
            var dados = {};
            try { dados = texto ? JSON.parse(texto) : {}; } catch (e) { dados = {}; }

            if (r.ok) return resolve({ status: r.status, dados: dados });

            var msg = dados.erro || "Não foi possível concluir agora.";
            reject(Falha(msg, dados.campo, r.status));
          });
        })
        .catch(function () {
          /* Só cai aqui quando o fetch em si falhou: sem rede, ou a API não
             respondeu. A mensagem é honesta sobre isso.                  */
          reject(Falha("Não consegui falar com o servidor. Confira a sua conexão e tente de novo."));
        });
    });
  }

  /* ================================================== AUTENTICAÇÃO (real) */
  var AUTH = {
    /* Cria a conta e já abre a sessão. */
    criarConta: function (dados) {
      return pedir("/auth/cadastro", {
        metodo: "POST",
        corpo: {
          nome: dados.nome,
          email: dados.email,
          whatsapp: dados.whatsapp,
          senha: dados.senha,
          confirmar: dados.confirmar,
          aceite: dados.aceite
        }
      }).then(function (r) { return r.dados.cliente; });
    },

    entrar: function (email, senha, manter) {
      return pedir("/auth/login", {
        metodo: "POST",
        corpo: { email: email, senha: senha, manter: !!manter }
      }).then(function (r) { return r.dados.cliente; });
    },

    sair: function () {
      return pedir("/auth/logout", { metodo: "POST" }).then(function () { return true; });
    },

    /* Quem está conectado agora. 401 -> rejeita com status 401. */
    eu: function () {
      return pedir("/auth/me").then(function (r) { return r.dados.cliente; });
    },

    /* Recuperação de senha: o servidor responde sempre a mesma coisa. */
    recuperar: function (email) {
      return pedir("/auth/recuperar", { metodo: "POST", corpo: { email: email } })
        .then(function (r) { return r.dados; });
    },

    redefinir: function (token, nova, confirmar) {
      return pedir("/auth/redefinir", {
        metodo: "POST",
        corpo: { token: token, nova: nova, confirmar: confirmar }
      }).then(function (r) { return r.dados; });
    }
  };

  /* ================================================ DADOS PESSOAIS (real) */
  var CONTA = {
    cliente: function () {
      return pedir("/cliente").then(function (r) { return r.dados.cliente; });
    },
    /* Só nome, WhatsApp e nascimento. O e-mail é somente leitura nesta fase. */
    atualizarCliente: function (dados) {
      return pedir("/cliente", {
        metodo: "PATCH",
        corpo: {
          nome: dados.nome,
          whatsapp: dados.whatsapp,
          nascimento: dados.nascimento
        }
      }).then(function (r) { return r.dados.cliente; });
    },
    trocarSenha: function (dados) {
      return pedir("/cliente/senha", {
        metodo: "POST",
        corpo: { atual: dados.atual, nova: dados.nova, confirmar: dados.confirmar }
      }).then(function (r) { return r.dados; });
    }
  };

  /* ============================== LOJA: pedidos, atendimentos, endereços,
     favoritos e sacola (REAL, /api/conta/*)
     Tudo aqui exige a sessão (cookie HttpOnly). 401 = sessão caiu.
     Dinheiro vem em centavos inteiros ou null ("sob consulta") — a
     interface nunca inventa valor. O antigo CONTA_API.DEMO (mock) saiu:
     nada de demonstração aparece mais na área da cliente.               */
  function listaEnderecos(r) { return (r.dados && r.dados.enderecos) || []; }
  function corpoEndereco(e) {
    return {
      apelido: e.apelido, destinatario: e.destinatario, cep: e.cep, rua: e.rua,
      numero: e.numero, complemento: e.complemento, bairro: e.bairro,
      cidade: e.cidade, uf: e.uf
    };
  }
  function rotaEndereco(id) { return "/conta/enderecos/" + encodeURIComponent(id); }

  var LOJA = {
    pedidos: function () {
      return pedir("/conta/pedidos").then(function (r) {
        return { pedidos: r.dados.pedidos || [], status: r.dados.status || {} };
      });
    },
    pedido: function (codigo) {
      return pedir("/conta/pedidos/" + encodeURIComponent(codigo)).then(function (r) {
        return { pedido: r.dados.pedido, historico: r.dados.historico || [] };
      });
    },
    atendimentos: function () {
      return pedir("/conta/atendimentos").then(function (r) {
        return { atendimentos: r.dados.atendimentos || [], status: r.dados.status || {} };
      });
    },
    enderecos: function () { return pedir("/conta/enderecos").then(listaEnderecos); },
    criarEndereco: function (e) {
      return pedir("/conta/enderecos", { metodo: "POST", corpo: corpoEndereco(e) }).then(listaEnderecos);
    },
    atualizarEndereco: function (id, e) {
      return pedir(rotaEndereco(id), { metodo: "PUT", corpo: corpoEndereco(e) }).then(listaEnderecos);
    },
    definirPrincipal: function (id) {
      return pedir(rotaEndereco(id) + "/principal", { metodo: "POST" }).then(listaEnderecos);
    },
    excluirEndereco: function (id) {
      return pedir(rotaEndereco(id), { metodo: "DELETE" }).then(listaEnderecos);
    },
    favoritos: function () {
      return pedir("/conta/favoritos").then(function (r) { return r.dados.ids || []; });
    },
    salvarFavoritos: function (ids) {
      return pedir("/conta/favoritos", { metodo: "PUT", corpo: { ids: ids } })
        .then(function (r) { return r.dados.ids || []; });
    },
    carrinho: function () {
      return pedir("/conta/carrinho").then(function (r) { return r.dados.itens || []; });
    },
    salvarCarrinho: function (itens) {
      return pedir("/conta/carrinho", { metodo: "PUT", corpo: { itens: itens } })
        .then(function (r) { return r.dados.itens || []; });
    }
  };

  return { AUTH: AUTH, CONTA: CONTA, LOJA: LOJA, pedir: pedir };
})();
