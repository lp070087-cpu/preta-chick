/* ==========================================================================
   dados.js — fonte unica de verdade da apresentacao
   --------------------------------------------------------------------------
   REGRA DESTE ARQUIVO:
   tudo que esta em LOJA veio dos materiais da propria Preta Chik
   (prints do perfil e dos destaques em /imagens pra informaçoes).
   Nada aqui foi inventado. Precos NAO existem nos materiais da loja,
   por isso nenhum produto recebe valor: a apresentacao usa
   "valor sob consulta" em vez de falsificar informacao comercial.
   ========================================================================== */

/* ---------------------------------------------------------------- LOJA */
const LOJA = {
  nome: "Preta Chik Moda Praia",
  nomeCurto: "Preta Chik",
  assinatura: "Preta Chik Moda Praia",
  instagram: "pretachik_modapraiaa",
  instagramUrl: "https://www.instagram.com/pretachik_modapraiaa/",
  seguidores: "379 mil",
  publicacoes: "7.975",
  bio: "Sua melhor versão começa no verão",
  identidade: "Vestuário (marca)",
  cidade: "SÓ VEREJO",
  representante: "@mariagueixa",
  endereco: "Estrada de Águas Compridas, 395",
  whatsapp: "https://wa.me/5581984023286",
  destaques: [
    { nome: "Envios",      icone: "logo/icon-envios"   },
    { nome: "Feedback",    icone: "logo/icon-feedback" },
    { nome: "Blogueirinhas", icone: null               },
    { nome: "Clientes",    icone: "logo/icon-clientes" },
    { nome: "Para todo BR", icone: "logo/icon-brasil"  }
  ]
};

/* --------------------------------------------------- POLITICA DE TROCAS
   Texto exatamente como esta no material enviado pela loja
   ("VAMOS TIRAR AS DÚVIDAS?"). Nenhum prazo foi alterado.
   ---------------------------------------------------------------- */
const TROCAS = [
  {
    id: "posso-trocar",
    titulo: "1. Posso trocar?",
    paragrafos: [
      "Sim! É necessário apresentar a nota fiscal ou comprovante de compra, o produto deve estar em perfeitas condições, com etiqueta e dentro do prazo de troca."
    ]
  },
  {
    id: "prazo",
    titulo: "2. Qual o prazo de troca?",
    blocos: [
      {
        titulo: "Para compras on-line",
        texto: "Oferecemos 7 dias corridos, desde que o produto esteja em perfeito estado e acompanhado da etiqueta original."
      },
      {
        titulo: "Para compras presenciais",
        texto: "Oferecemos 3 dias corridos, desde que o produto esteja em perfeito estado e acompanhado da etiqueta original."
      }
    ]
  },
  {
    id: "nao-trocamos",
    titulo: "Quais peças não trocamos?",
    paragrafos: ["Não realizamos troca de peças:"],
    lista: ["Brancas", "Rendas", "Delicadas", "Tricô", "Promocionais", "Acessórios", "Bolsas"]
  }
];

/* ---------------------------------------------------------------- REELS
   Links reais enviados pela loja em "link de rels.txt".
   Nenhum link ficticio foi criado. O titulo descreve o conteudo
   do destaque, nao um titulo oficial de post.
   ---------------------------------------------------------------- */
const REELS = [
  { url: "https://www.instagram.com/p/Dc2B878tsQ9/", img: "reel/r01", titulo: "Look do dia",     tag: "Novidades" },
  { url: "https://www.instagram.com/reel/DcE6C9ypXfI/", img: "reel/r02", titulo: "Prova de looks",  tag: "Loja" },
  { url: "https://www.instagram.com/reel/DIoO3JVRPew/", img: "reel/r03", titulo: "Novo na arara",   tag: "Chegou" },
  { url: "https://www.instagram.com/reel/DYrnd-tJKaz/", img: "reel/r04", titulo: "Combinação",      tag: "Monte seu look" },
  { url: "https://www.instagram.com/reel/DItnCnnxt6C/", img: "reel/r05", titulo: "Direto da loja",  tag: "Bastidores" }
];

/* ------------------------------------------------------------- CATEGORIAS */
/* Na vitrine, "Lançamentos" e "Promoções" sao VITRINES, nao categorias de peca:
   um vestido novo aparece na vitrine E em Vestidos. Por isso a contagem anunciada
   aqui usa o MESMO criterio da pagina da loja (todas as vitrines somadas), senao a
   home diria um numero e a loja mostraria outro. */
const CATEGORIAS = [
  { nome: "Biquínis",  qtd: 7, img: "cat/cat-vestidos",   href: "loja.html?cat=biquinis"  },
  { nome: "Conjuntos Praia", qtd: 3, img: "cat/cat-conjuntos",  href: "loja.html?cat=conjuntos-praia-praia" },
  { nome: "Tops de Praia",    qtd: 4, img: "cat/cat-blusas",     href: "loja.html?cat=tops-praia"    },
  { nome: "Maiôs",    qtd: 1, img: "cat/cat-calcas",     href: "loja.html?cat=maios"    },
  { nome: "Saídas de Praia", qtd: 1, img: "cat/cat-saias", href: "loja.html?cat=saidas-praia"     },
  { nome: "Novidades", qtd: 7, img: "cat/cat-lancamentos", href: "loja.html?cat=novidades" }
];

/* --------------------------------------------------------------- PRODUTOS
   Os nomes descrevem a peca que aparece na foto correspondente
   (analise foto a foto — ver ANALISE.md). Nao existe preco nos
   materiais da loja: por isso "sob consulta" em vez de valor.
   ---------------------------------------------------------------- */
const PRODUTOS = [
  { id: "p01", nome: "Top Halter Canelado",        cat: "tops-praia",    cats: ["tops-praia","novidades"],  cor: "Branco",      cores: ["#f6f4f1","#ff65c3","#0f1116"], badges: ["Novo"] },
  { id: "p02", nome: "Bustie Estruturado",         cat: "tops-praia",    cats: ["tops-praia","novidades"],  cor: "Branco",      cores: ["#f6f4f1","#d9c9b8"],            badges: ["Novo"] },
  { id: "p03", nome: "Vestido Curto Plissado",     cat: "biquinis",  cats: ["biquinis","promocoes"],  cor: "Rosa claro",  cores: ["#f4cdd9","#0f1116","#e6e2dc"],  badges: ["Novo"] },
  { id: "p04", nome: "Vestido Preto Drapeado",     cat: "biquinis",  cats: ["biquinis","novidades"],cor: "Preto",       cores: ["#141419","#7a3b2e"],            badges: [] },
  { id: "p05", nome: "Conjunto Ombro Único",       cat: "conjuntos-praia", cats: ["conjuntos-praia","novidades"],cor: "Verde limão", cores: ["#d8e86a","#f6f4f1"],           badges: ["Novo"] },
  { id: "p06", nome: "Top Caramelo",               cat: "tops-praia",    cats: ["tops-praia"],                cor: "Caramelo",    cores: ["#b57a4a","#0f1116"],            badges: [] },
  { id: "p07", nome: "Vestido Longo Ondulado",     cat: "biquinis",  cats: ["biquinis","promocoes"],  cor: "Verde água",  cores: ["#9fd8cf","#f6f4f1"],            badges: [] },
  { id: "p08", nome: "Conjunto Alfaiataria Leve",  cat: "conjuntos-praia", cats: ["conjuntos-praia","novidades"],cor: "Laranja",     cores: ["#ef8a4d","#f6f4f1"],           badges: ["Novo"] },
  { id: "p09", nome: "Vestido Longo com Fenda",    cat: "biquinis",  cats: ["biquinis","novidades"],cor: "Sortido",     cores: ["#f6f4f1","#f4cdd9","#141419"],  badges: ["Novo"] },
  { id: "p10", nome: "Vestido Curto Midi",         cat: "biquinis",  cats: ["biquinis","promocoes"],  cor: "Laranja",     cores: ["#ef7a3c","#f6f4f1"],            badges: [] },
  { id: "p11", nome: "Vestido Longo Fluido",       cat: "biquinis",  cats: ["biquinis"],              cor: "Azul",        cores: ["#8fb6d9","#f6f4f1"],            badges: [] },
  { id: "p12", nome: "Bustie com Amarração",       cat: "tops-praia",    cats: ["tops-praia","promocoes"],    cor: "Branco",      cores: ["#f6f4f1","#c9d3e0"],            badges: [] },
  /* p13..p16 foram refeitos: o nome de cada um descreve a peca que esta na foto
     principal (a foto do cartao). Um produto chamado "Short Alfaiataria" com foto
     de vestido branco seria informacao inventada. */
  { id: "p13", nome: "Short Jeans Branco",         cat: "saidas-praia",     cats: ["saidas-praia","novidades"],   cor: "Branco",      cores: ["#eeebe6","#f2b8cd"],            badges: [] },
  { id: "p14", nome: "Calça Jeans Wide Leg",       cat: "maios",    cats: ["maios"],                cor: "Jeans",       cores: ["#7d97b5","#f2b8cd"],            badges: [] },
  { id: "p15", nome: "Conjunto Calça Branca",      cat: "conjuntos-praia", cats: ["conjuntos-praia"],             cor: "Azul e branco", cores: ["#8fb6d9","#f6f4f1"],          badges: [] },
  { id: "p16", nome: "Vestido Curto Laranja",      cat: "biquinis",  cats: ["biquinis","promocoes"],  cor: "Laranja",     cores: ["#ef8a4d","#f0e59a"],            badges: [] }
];

/* -------------------------------------------------------- TAMANHOS / CORES */
const TAMANHOS = ["PP", "P", "M", "G", "GG"];
const INDISPONIVEIS = { p04: ["PP"], p11: ["GG"], p16: ["PP", "G"] };

/* ---------------------------------------------------------- FORMAS DE PAGAMENTO
   Nao ha informacao de parcelamento nos materiais da loja:
   a apresentacao nao cria parcelas nem juros.
   ---------------------------------------------------------------- */
const PAGAMENTOS = [
  "Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro na entrega local"
];

/* ------------------------------------------------------- AJUDA AO RENDER */
const BASE_IMG = "assets/img/";

function img(pasta, nome, ext) {
  return BASE_IMG + pasta + "/" + nome + "." + (ext || (pasta === "card" ? "jpg" : "webp"));
}
function buscaProduto(id) {
  for (let i = 0; i < PRODUTOS.length; i++) if (PRODUTOS[i].id === id) return PRODUTOS[i];
  return null;
}
function porCategoria(cat) {
  if (!cat || cat === "todos") return PRODUTOS.slice();
  return PRODUTOS.filter(function (p) { return p.cats.indexOf(cat) > -1; });
}
function precoHTML() {
  return '<span class="consulta">Valor sob consulta</span>';
}
