/* ==========================================================================
   conta-mock.js — DADOS DE DEMONSTRACAO DA AREA DO CLIENTE
   --------------------------------------------------------------------------
   ESTE ARQUIVO E A UNICA FRONTEIRA ENTRE A INTERFACE E O BACKEND FUTURO.

   REGRAS DESTE ARQUIVO (importantes):

   1. Nada aqui e real. E uma maquete de dados para a interface poder ser
      vista e aprovada antes de existir servidor.

   2. NAO existe preco nos materiais da propria Preta Chik (ver ANALISE.md).
      Por isso nenhum valor em reais foi inventado. No lugar de preco, o
      pedido carrega `valorSobConsulta: true`, e a interface escreve
      "Valor sob consulta" — exatamente o mesmo criterio que o site publico
      ja usa. Quando a loja informar os precos reais, basta preencher
      `preco` em cada item e o resumo passa a somar sozinho.

   3. NENHUMA senha, token ou dado sensivel mora aqui. A senha nunca e
      armazenada em lugar nenhum: nem aqui, nem em localStorage.

   4. Para ligar no backend de verdade, troque SOMENTE o objeto CONTA_API
      no fim do arquivo por chamadas HTTP. O resto da interface nao muda,
      porque ela conversa apenas com esses metodos.

   CONTRATO DO BACKEND FUTURO (o que cada metodo vira):
     CONTA_API.cliente()                  -> GET  /api/cliente
     CONTA_API.atualizarCliente(dados)    -> PATCH /api/cliente
     CONTA_API.trocarSenha({atual, nova}) -> POST /api/cliente/senha
     CONTA_API.pedidos()                  -> GET  /api/pedidos
     CONTA_API.pedido(id)                 -> GET  /api/pedidos/:id
     CONTA_API.enderecos()                -> GET  /api/enderecos
     CONTA_API.salvarEndereco(end)        -> POST /api/enderecos  (ou PATCH /:id)
     CONTA_API.excluirEndereco(id)        -> DELETE /api/enderecos/:id
     CONTA_API.definirPrincipal(id)       -> PATCH /api/enderecos/:id/principal
     CONTA_API.sessao()                   -> GET  /api/sessao
     CONTA_API.entrar(email, senha)       -> POST /api/sessao
     CONTA_API.sair()                     -> DELETE /api/sessao
   ========================================================================== */

var CONTA_MOCK = (function () {

  "use strict";

  /* ------------------------------------------------------------- CLIENTE */
  var CLIENTE = {
    nome: "Maria Geovana",
    email: "maria@exemplo.com",
    whatsapp: "(81) 90000-0000",
    nascimento: "1996-04-12",
    desde: "2025-11-03"
  };

  /* ----------------------------------------------------------- ENDERECOS
     `principal` e um unico por cliente — a interface garante isso.        */
  var ENDERECOS = [
    {
      id: "e1",
      rotulo: "Casa",
      destinatario: "Maria Geovana",
      cep: "53000-000",
      rua: "Rua das Flores",
      numero: "120",
      complemento: "Apto 302",
      bairro: "Centro",
      cidade: "Olinda",
      uf: "PE",
      principal: true
    },
    {
      id: "e2",
      rotulo: "Trabalho",
      destinatario: "Maria Geovana",
      cep: "52000-000",
      rua: "Av. Exemplo",
      numero: "900",
      complemento: "Sala 4",
      bairro: "Casa Amarela",
      cidade: "Recife",
      uf: "PE",
      principal: false
    }
  ];

  /* ------------------------------------------------------------- PEDIDOS
     `etapa` e o indice da linha do tempo (ver ETAPAS abaixo).
     `status` e o nome publico do estado — os seis estados pedidos pela
     loja estao todos representados nestes quatro pedidos de exemplo.      */
  var ETAPAS = [
    { chave: "recebido",  nome: "Pedido recebido" },
    { chave: "pago",      nome: "Pagamento confirmado" },
    { chave: "separando", nome: "Preparando pedido" },
    { chave: "enviado",   nome: "Enviado" },
    { chave: "entregue",  nome: "Entregue" }
  ];

  /* os seis status que a interface precisa estar preparada para mostrar */
  var STATUS = {
    recebido:  { nome: "Pedido recebido",     tipo: "andamento" },
    pago:      { nome: "Pagamento confirmado", tipo: "andamento" },
    separando: { nome: "Em separação",        tipo: "andamento" },
    enviado:   { nome: "Enviado",             tipo: "andamento" },
    entregue:  { nome: "Entregue",            tipo: "ok" },
    cancelado: { nome: "Cancelado",           tipo: "cancelado" }
  };

  var PEDIDOS = [
    {
      id: "LB-24960",
      data: "2026-09-22",
      etapa: 1,
      status: "pago",
      valorSobConsulta: true, /* ver regra 2 no topo: nao ha preco real */
      pagamento: "Pix",
      frete: "Transportadora",
      prazo: "3 a 7 dias uteis",
      enderecoId: "e1",
      itens: [
        { produtoId: "p03", nome: "Vestido Curto Plissado", foto: "card/p03-a", tam: "M", qtd: 1 },
        { produtoId: "p13", nome: "Short Jeans Branco",     foto: "card/p13-a", tam: "P", qtd: 1 }
      ]
    },
    {
      id: "LB-24817",
      data: "2026-09-12",
      etapa: 3,
      status: "enviado",
      valorSobConsulta: true,
      pagamento: "Cartao de credito",
      frete: "Transportadora",
      prazo: "Entregue em ate 2 dias",
      rastreio: "LB24817BR0001DEMO",
      enderecoId: "e2",
      itens: [
        { produtoId: "p05", nome: "Conjunto Ombro Unico",     foto: "card/p05-a", tam: "M", qtd: 1 },
        { produtoId: "p08", nome: "Conjunto Alfaiataria Leve", foto: "card/p08-a", tam: "G", qtd: 1 },
        { produtoId: "p01", nome: "Top Halter Canelado",       foto: "card/p01-a", tam: "P", qtd: 2 }
      ]
    },
    {
      id: "LB-24702",
      data: "2026-08-30",
      etapa: 4,
      status: "entregue",
      valorSobConsulta: true,
      pagamento: "Dinheiro na entrega local",
      frete: "Entrega local",
      prazo: "Combinada direto com a loja",
      enderecoId: "e1",
      itens: [
        { produtoId: "p09", nome: "Vestido Longo com Fenda", foto: "card/p09-a", tam: "M", qtd: 1 }
      ]
    },
    {
      id: "LB-24588",
      data: "2026-08-14",
      etapa: 0,
      status: "cancelado",
      valorSobConsulta: true,
      pagamento: "Pix",
      frete: "Transportadora",
      prazo: "—",
      enderecoId: "e1",
      itens: [
        { produtoId: "p11", nome: "Vestido Longo Fluido", foto: "card/p11-a", tam: "G", qtd: 1 }
      ]
    }
  ];

  /* ---------------------------------------------------------------- API
     Tudo devolve Promise, para a interface ja ser escrita no ritmo
     assincrono do backend real. Trocar o corpo destes metodos por fetch()
     e a unica alteracao necessaria para sair do mock.                     */
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function resp(x) { return Promise.resolve(copia(x)); }

  /* espelho em memoria — some ao recarregar a pagina, de proposito:
     nada de dado de demonstracao grudando no navegador do usuario.        */
  var memoria = {
    cliente: copia(CLIENTE),
    enderecos: copia(ENDERECOS),
    pedidos: copia(PEDIDOS)
  };

  var CONTA_API = {

    ehMock: function () { return true; },

    sessao: function () { return resp({ autenticado: false }); },

    entrar: function () {
      /* NAO existe login real nesta fase. Devolve erro explicito para a
         interface mostrar o aviso de demonstracao em vez de fingir acesso. */
      return Promise.reject({ codigo: "sem-backend" });
    },

    sair: function () { return resp({ ok: true }); },

    /* O cadastro recebe nome, e-mail e WhatsApp — NUNCA a senha.
       Devolve erro ate existir backend de verdade, em vez de fingir sucesso. */
    criarConta: function () {
      return Promise.reject({ codigo: "sem-backend" });
    },

    cliente: function () { return resp(memoria.cliente); },

    atualizarCliente: function (dados) {
      for (var k in dados) if (dados.hasOwnProperty(k)) memoria.cliente[k] = dados[k];
      return resp(memoria.cliente);
    },

    trocarSenha: function (dados) {
      /* valida formato, jamais guarda a senha */
      if (!dados || !dados.nova || dados.nova.length < 6) {
        return Promise.reject({ codigo: "senha-curta" });
      }
      return Promise.resolve({ ok: true, aviso: "sem-backend" });
    },

    pedidos: function () { return resp(memoria.pedidos); },

    pedido: function (id) {
      var achou = null;
      memoria.pedidos.forEach(function (p) { if (p.id === id) achou = p; });
      return achou ? resp(achou) : Promise.reject({ codigo: "nao-encontrado" });
    },

    enderecos: function () { return resp(memoria.enderecos); },

    salvarEndereco: function (endereco) {
      if (endereco.id) {
        memoria.enderecos = memoria.enderecos.map(function (e) {
          return e.id === endereco.id ? copia(endereco) : e;
        });
      } else {
        endereco.id = "e" + (memoria.enderecos.length + 1) + "-" + Date.now().toString(36);
        memoria.enderecos.push(copia(endereco));
      }
      if (endereco.principal) return CONTA_API.definirPrincipal(endereco.id);
      return resp(memoria.enderecos);
    },

    excluirEndereco: function (id) {
      memoria.enderecos = memoria.enderecos.filter(function (e) { return e.id !== id; });
      /* um cliente nunca fica sem endereco principal */
      if (memoria.enderecos.length && !memoria.enderecos.some(function (e) { return e.principal; })) {
        memoria.enderecos[0].principal = true;
      }
      return resp(memoria.enderecos);
    },

    definirPrincipal: function (id) {
      memoria.enderecos.forEach(function (e) { e.principal = (e.id === id); });
      return resp(memoria.enderecos);
    },

    /* ---- leitura pura, sem ida ao servidor ---- */
    etapas: function () { return copia(ETAPAS); },
    status: function (chave) { return copia(STATUS[chave] || { nome: chave, tipo: "" }); },
    listaStatus: function () { return copia(STATUS); }
  };

  return { API: CONTA_API, ETAPAS: ETAPAS, STATUS: STATUS };
})();
