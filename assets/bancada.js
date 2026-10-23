/* ==========================================================================
   bancada.js — prova automatica da apresentacao La Belle
   --------------------------------------------------------------------------
   Roda no Node, sem navegador. Confere:
     A. integridade dos dados (dados.js) contra o disco
     B. links internos e ancoras
     C. classes CSS usadas x classes CSS definidas
     D. CONTROLE NEGATIVO: planta defeitos de proposito e exige que o
        proprio instrumento os encontre. Sem isso, um instrumento quebrado
        passaria "tudo verde" para sempre.

   Uso:  node assets/bancada.js
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.dirname(__dirname);
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

let falhas = 0;
let provas = 0;

function ok(cond, rotulo, detalhe) {
  provas++;
  if (!cond) {
    falhas++;
    console.log("  FALHA  " + rotulo + (detalhe ? "\n         " + detalhe : ""));
  }
}
function secao(t) { console.log("\n== " + t + " =="); }

/* ------------------------------------------------------- listas de arquivos */
function listarHtml() {
  return fs.readdirSync(RAIZ).filter((f) => f.endsWith(".html"));
}
function existe(p) {
  return fs.existsSync(path.join(RAIZ, p));
}
/* Folhas de estilo que as PAGINAS realmente carregam.
   Antes esta lista era fixa em base/site/paginas: a folha nova (conta.css) ficou
   INVISIVEL para as provas de classe, e a bancada reprovava o site correto. A
   lista fixa volta a cegar a cada folha nova, entao aqui se descobre, nao se lista. */
function listarCss() {
  const set = new Set();
  listarHtml().forEach((arq) => {
    for (const m of ler(arq).matchAll(/href="(assets\/css\/[A-Za-z0-9._\-]+\.css)"/g)) set.add(m[1]);
  });
  return [...set].sort();
}
/* Mesmo remedio para os SCRIPTS, e pelo mesmo motivo. A lista estava fixa em
   ui.js + dados.js, entao conta-app.js, conta-ui.js, conta-api.js e
   conta-mock.js NUNCA eram varridos: qualquer classe inventada dentro deles
   passava sem prova. A lista volta a ser descoberta a partir das paginas. */
function listarJs() {
  const set = new Set();
  listarHtml().forEach((arq) => {
    for (const m of ler(arq).matchAll(/src="(assets\/js\/[A-Za-z0-9._\-]+\.js)"/g)) set.add(m[1]);
  });
  return [...set].sort();
}

/* Ganchos que so existem no JS, sem regra propria no CSS.
   `.cx-ic` nao tem seletor: ele e o involucro do icone, e quem define o
   tamanho e o container (.cx-atalho svg, .cx-voltar svg, .cx-bt-mini svg,
   .cx-aviso svg, .cx-cancelado svg). E a mesma categoria de `.on` e
   `.cartao__a`: classe de comportamento, nao de aparencia.
   A lista e CURTA e NOMEADA de proposito — um "ignorar tudo que so existe no
   JS" deixaria a prova C cega. O controle negativo D2b prova que ela
   continua estreita: uma classe inventada fora desta lista ainda reprova. */
const GANCHOS_JS = new Set(["cx-ic"]);

/* ========================================================== A. DADOS ====== */
secao("A. dados.js contra o disco");

const ctx = vm.createContext({});
const fonteDados = ler("assets/js/dados.js") +
  "\n;globalThis.__D = { LOJA, TROCAS, REELS, CATEGORIAS, PRODUTOS, TAMANHOS, INDISPONIVEIS, PAGAMENTOS, buscaProduto, porCategoria };";
vm.runInContext(fonteDados, ctx);
const D = ctx.__D;

ok(!!D, "dados.js carregou e exportou as constantes");
ok(Object.keys(D.PRODUTOS).length > 0, "existe pelo menos um produto");

/* A1 — toda peca tem sua foto principal e alternativa no disco */
D.PRODUTOS.forEach((p) => {
  ["a", "b"].forEach((suf) => {
    const rel = "assets/img/card/" + p.id + "-" + suf + ".webp";
    ok(existe(rel), "foto do produto " + p.id + "-" + suf + " existe", rel);
  });
});

/* A2 — a categoria principal esta dentro da lista de categorias */
D.PRODUTOS.forEach((p) => {
  ok(p.cats.indexOf(p.cat) > -1,
    "produto " + p.id + ": cat '" + p.cat + "' aparece em cats[]");
});

/* A3 — INDISPONIVEIS aponta para produtos que existem */
Object.keys(D.INDISPONIVEIS).forEach((id) => {
  ok(!!D.buscaProduto(id), "INDISPONIVEIS." + id + " corresponde a um produto real");
});

/* A4 — a contagem anunciada bate com o mesmo numero que a loja mostra ao abrir
   a categoria. A loja conta VITRINES: uma peca nova e em promocao aparece nas
   duas, e mesmo assim e UMA peca. A bancada usa a mesma regua da loja.html, senao
   home e loja discordariam para o usuario. */
function contagemDaLoja() {
  const c = { todos: D.PRODUTOS.length };
  D.PRODUTOS.forEach((p) => p.cats.forEach((k) => { c[k] = (c[k] || 0) + 1; }));
  return c;
}
const contagem = contagemDaLoja();
D.CATEGORIAS.forEach((c) => {
  const chave = c.href.split("cat=")[1];
  const n = contagem[chave] || 0;
  ok(n === c.qtd,
    "categoria '" + c.nome + "': qtd anunciada (" + c.qtd + ") == o que a loja mostra (" + n + ")");
});

/* A5 — nenhum preco inventado no catalogo.
   A regra do projeto e: sem preco nos materiais => sem preco no site. */
const camposProibidos = ["preco", "price", "valor", "valorDe", "de", "por", "parcela", "desconto"];
D.PRODUTOS.forEach((p) => {
  camposProibidos.forEach((c) => {
    ok(!(c in p), "produto " + p.id + " nao tem campo de preco '" + c + "'");
  });
  ok(!/R\$|\d+,\d{2}/.test(JSON.stringify(p)),
    "produto " + p.id + " nao contem valor monetario no proprio dado");
});

/* A6 — a politica de trocas preserva exatamente os prazos da loja */
const prazo = D.TROCAS.find((t) => t.id === "prazo");
ok(!!prazo, "a secao de prazo existe na politica");
const txtPrazo = JSON.stringify(prazo);
ok(/7 dias corridos/.test(txtPrazo), "prazo on-line = 7 dias corridos, como no material");
ok(/3 dias corridos/.test(txtPrazo), "prazo presencial = 3 dias corridos, como no material");

const naoTroca = D.TROCAS.find((t) => t.id === "nao-trocamos");
const esperadas = ["Brancas", "Rendas", "Delicadas", "Tricô", "Promocionais", "Acessórios", "Bolsas"];
ok(!!naoTroca, "a secao 'quais pecas nao trocamos' existe");
esperadas.forEach((e) => {
  ok(naoTroca && naoTroca.lista.indexOf(e) > -1, "lista de nao-troca inclui '" + e + "'");
});
ok(naoTroca && naoTroca.lista.length === esperadas.length,
  "lista de nao-troca tem exatamente " + esperadas.length + " itens");

/* A9 — a contagem escrita na home tem de bater com o catalogo.
   Antes esta prova nao existia: a home anunciava "Vestidos 4 pecas" enquanto a
   loja mostrava 8. Numero escrito a mao envelhece calado; agora ele e conferido. */
(function () {
  const html = ler("index.html");
  const bloco = html.split("<!-- ============================ CATEGORIAS")[1] || "";
  const achados = {};
  for (const m of bloco.matchAll(/href="loja\.html\?cat=([a-z-]+)"[\s\S]*?<span>(\d+)\s*pe(?:ça|ca)s?<\/span>/g)) {
    achados[m[1]] = parseInt(m[2], 10);
  }
  const vistos = Object.keys(achados);
  ok(vistos.length === 6, "a home anuncia as 6 categorias",
    "encontradas: " + vistos.join(", "));
  D.CATEGORIAS.forEach(function (c) {
    const chave = c.href.split("cat=")[1];
    ok(achados[chave] === c.qtd,
      "home: '" + chave + "' anuncia " + c.qtd + " e a home escreve " + achados[chave]);
  });
})();

/* A10 — TODA imagem citada existe no disco.
   Esta prova e a que faltava quando p13..p16 apareceram com foto quebrada: as
   provas antigas so olhavam card/<id>-a|b e reel/<id>.webp, entao uma imagem de
   categoria, de destaque ou escrita no HTML quebrada passava batido. */
(function () {
  const refs = new Set();

  // 1) caminho literal escrito em qualquer arquivo do projeto
  const arquivos = listarHtml().concat(["assets/js/ui.js", "assets/js/dados.js"], listarCss());
  arquivos.forEach((f) => {
    if (!existe(f)) return;
    // o parentese e obrigatorio: sem grupo, m[1] e undefined e a prova nao le nada
    for (const m of ler(f).matchAll(/(assets\/img\/[A-Za-z0-9_\-./]+\.webp)/g)) refs.add(m[1]);
  });

  // 2) caminhos montados por dados.js (o que a bancada antiga ja cobria)
  D.PRODUTOS.forEach((p) => {
    refs.add("assets/img/card/" + p.id + "-a.webp");
    refs.add("assets/img/card/" + p.id + "-b.webp");
  });
  D.REELS.forEach((r) => refs.add("assets/img/" + r.img + ".webp"));
  D.CATEGORIAS.forEach((c) => refs.add("assets/img/" + c.img + ".webp"));
  D.LOJA.destaques.forEach((d) => { if (d.icone) refs.add("assets/img/" + d.icone + ".webp"); });

  // 3) as da casca (ui.js) que nao vem de dados.js
  ["logo/labelle-avatar-sm.webp", "cat/cat-lancamentos.webp"].forEach((r) => refs.add("assets/img/" + r));

  const lista = [...refs].sort();
  ok(lista.length >= 45, "a varredura encontrou um conjunto plausivel de imagens",
    "encontradas: " + lista.length);
  lista.forEach((r) => ok(existe(r), "imagem citada existe: " + r));
})();

/* A7 — identidade da loja nao ficou vazia */
["nome", "instagram", "instagramUrl", "cidade", "endereco", "whatsapp", "bio"].forEach((c) => {
  ok(typeof D.LOJA[c] === "string" && D.LOJA[c].trim().length > 0,
    "LOJA." + c + " esta preenchido");
});

/* A8 — os links dos reels sao reais (dominio do Instagram), nao ficticios */
D.REELS.forEach((r, i) => {
  ok(/^https:\/\/www\.instagram\.com\/(p|reel)\//.test(r.url),
    "reel " + (i + 1) + ": link real do Instagram", r.url);
  ok(existe("assets/img/" + r.img + ".webp"), "reel " + (i + 1) + ": imagem existe");
});

/* ========================================================== B. LINKS ===== */
secao("B. links internos e ancoras");

/* B1 — todo href .html aponta para um arquivo que existe */
const alvosHtml = new Set();
listarHtml().forEach((arq) => {
  const txt = ler(arq);
  for (const m of txt.matchAll(/href="([a-z0-9\-]+\.html)(#[^"]*)?"/gi)) {
    alvosHtml.add(m[1]);
    ok(existe(m[1]), arq + " -> " + m[1] + " existe");
  }
});
/* O numero exato nao e uma meta: a prova util e que TODA pagina do projeto esteja
   alcancavel a partir de alguma outra. Exigir ">= 7" era um limite inventado que
   reprovava o site correto. */
/* admin.html é o painel interno da loja (exige login de equipe): o acesso
   público fica só pelo link do rodapé montado em ui.js, que esta varredura
   de HTML estático não enxerga. */
const paginas = listarHtml().filter((f) => f !== "404.html" && f !== "admin.html");
const citadas = new Set(alvosHtml);
citadas.add("index.html");
paginas.forEach(function (p) {
  ok(citadas.has(p), "a pagina " + p + " e alcancavel a partir de outra pagina");
});

/* B2 — toda ancora "#x" tem destino.
   O destino pode nascer de tres formas, e as tres contam:
     a) id escrito na propria pagina    -> id="x"
     b) secao montada por array em dados.js (trocas.html) -> id: "x"
     c) concatenacao no script          -> "'<section id=\"' + s.id + '\"' e s.id vem de (b)
   Por isso a busca olha a pagina alvo E os scripts que ela carrega: antes ela
   olhava so o HTML e reprovava ancora que existe de verdade. */
const SCRIPTS = ["assets/js/dados.js", "assets/js/ui.js"];
function idsPossiveis(alvo) {
  let texto = ler(alvo);
  SCRIPTS.forEach(function (s) { if (existe(s)) texto += "\n" + ler(s); });
  // tambem os scripts embutidos da propria pagina
  for (const b of ler(alvo).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) texto += "\n" + b[1];
  return texto;
}
function temDestino(alvo, id) {
  const corpus = idsPossiveis(alvo);
  return new RegExp('id="' + id + '"').test(corpus) ||
         new RegExp('id:\\s*"' + id + '"').test(corpus) ||
         new RegExp('"' + id + '"').test(corpus);
}
listarHtml().forEach((arq) => {
  const txt = ler(arq);
  for (const m of txt.matchAll(/href="([a-z0-9\-]+\.html)?#([a-zA-Z0-9\-_]+)"/g)) {
    const alvo = m[1] || arq;
    if (!existe(alvo)) continue;
    ok(temDestino(alvo, m[2]), arq + " -> " + alvo + "#" + m[2] + " tem destino com esse id");
  }
});

/* B3 — nenhuma ancora href="#" vazia (link que nao leva a lugar nenhum) */
listarHtml().forEach((arq) => {
  const txt = ler(arq);
  const vazias = [...txt.matchAll(/href="#"/g)].length;
  ok(vazias === 0, arq + " nao usa href=\"#\" solto", "encontrados: " + vazias);
});

/* ============================================================ C. CSS ===== */
secao("C. classes CSS usadas x definidas");

/* Um seletor de classe so conta quando aparece em posicao de CSS de verdade:
   inicio do seletor ou logo apos espaco, >, +, ~, ,, :, [ ou (.
   Sem esta trava, o detector colhia fragmentos de strings JS do tipo "', " ou
   "(b, " e acusava classe inexistente que ninguem escreveu. */
const RE_CLASSE_DEF = /(?:^|[\s,>+~\[:(])\.(-?[A-Za-z_][A-Za-z0-9_\-]*)/gm;

function cssDe(fonte) {
  // remove comentarios e o conteudo de url(...) / strings, onde "." nao e classe
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(["'])[^"']*\1/g, "");
}

/* Uma classe pode nao ter regra propria e mesmo assim estar VIVA: ela existe so
   como estado combinado (.filtros__lista button.on) ou como gancho do JS
   (.cartao__a). O detector precisa saber disso, senao reprova o site correto. */
const RE_QUALQUER_CLASSE = /\.(-?[A-Za-z_][A-Za-z0-9_\-]*)/g;
function classesCitadas() {
  const set = new Set();
  listarCss().forEach((f) => {
    for (const m of cssDe(ler(f)).matchAll(RE_QUALQUER_CLASSE)) set.add(m[1]);
  });
  listarHtml().forEach((arq) => {
    for (const b of ler(arq).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const m of cssDe(b[1]).matchAll(RE_QUALQUER_CLASSE)) set.add(m[1]);
    }
  });
  return set;
}

function classesDefinidas() {
  const set = new Set();
  listarCss().forEach((f) => {
    const css = cssDe(ler(f));
    for (const m of css.matchAll(RE_CLASSE_DEF)) set.add(m[1]);
  });
  // blocos <style> embutidos nas paginas (conta.html, sobre.html, ...) definem
  // classe de verdade: ignorar isso fazia a bancada acusar classe "sem definicao".
  listarHtml().forEach((arq) => {
    const txt = ler(arq);
    for (const bloco of txt.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const m of cssDe(bloco[1]).matchAll(RE_CLASSE_DEF)) set.add(m[1]);
    }
  });
  return set;
}

function classesUsadas() {
  const set = new Set();
  const arquivos = listarHtml().map((f) => f).concat(listarJs());
  arquivos.forEach((f) => {
    if (!existe(f)) return;
    const txt = ler(f);
    for (const m of txt.matchAll(/class="([^"]*)"/g)) {
      const bruto = m[1];
      /* Quando a classe e montada por concatenacao (class="etapa ' + cls + '" ou
         class="selo' + (x ? " selo--y" : "") + '"), o pedaco dinamico NAO e nome de
         classe e nao pode ser cobrado do CSS: 'cls' era acusado de inexistente por
         isso. Fica valendo so a parte literal anterior ao primeiro '+'.
         (Consequencia assumida: classe montada so por variavel nao e verificada.) */
      const literal = bruto.includes("+") ? bruto.split("+")[0] : bruto;
      literal.split(/\s+/).forEach((c) => {
        if (/^-?[A-Za-z_][A-Za-z0-9_\-]*$/.test(c)) set.add(c);
      });
    }
  });
  return set;
}

const definidas = classesDefinidas();
const citadasCss = classesCitadas();
const usadas = classesUsadas();
/* Reprovam apenas as classes que NAO aparecem em lugar nenhum do CSS — nem como
   regra propria, nem como estado combinado. Assim a prova continua capaz de achar
   uma classe inventada (ela nao esta em citadas), sem acusar '.on' de inexistente. */
const semDefinicao = [...usadas]
  .filter((c) => !citadasCss.has(c) && !GANCHOS_JS.has(c))
  .sort();

ok(semDefinicao.length === 0,
  "toda classe usada aparece em algum lugar do CSS",
  semDefinicao.length ? "sem definicao: " + semDefinicao.join(", ") : "");

/* A prova acima so vale se a varredura ALCANCAR a folha nova. Sem isto, tirar o
   conta.css da lista deixaria a bancada verde e cega. */
ok(listarCss().indexOf("assets/css/conta.css") > -1,
  "a varredura alcanca a folha nova (conta.css), e nao so as tres antigas",
  "varridas: " + listarCss().join(", "));
ok(listarCss().indexOf("assets/css/site.backup.css") === -1,
  "a varredura NAO varre a copia de seguranca (site.backup.css) que nenhuma pagina carrega");

/* A varredura de classes tem de alcancar os arquivos da area do cliente.
   ATENCAO ao que se mede aqui. Provar `listarJs().indexOf("conta-app.js")`
   nao prova nada: listarJs() e so um helper, e a prova C poderia continuar
   lendo a lista fixa enquanto esse teste ficasse verde. (Aconteceu: a
   primeira versao desta prova passou com a lista fixa de volta.)
   O que se mede e o conjunto REAL que a prova C usa: `usadas`. Se alguma
   classe que SO existe em conta-app.js nao estiver la, a varredura nao
   alcancou o arquivo — e ai a prova C esta cega para ele.                */
const SO_EM_CONTA_APP = [
  "cx-cabeca", "cx-grade", "cx-cartao", "cx-pedido", "cx-pedido__topo",
  "cx-item", "cx-endereco", "cx-bt-mini", "cx-form__grade", "cx-secao",
  "cx-linha__etapa", "cx-endereco--novo"
];
SO_EM_CONTA_APP.forEach(function (c) {
  ok(usadas.has(c),
    "a varredura de classes alcancou conta-app.js (achou ." + c + ")");
});
ok(listarJs().indexOf("assets/js/conta-app.js") > -1,
  "conta-app.js esta entre os scripts que as paginas carregam",
  "varridos: " + listarJs().join(", "));
/* bancada.js e bancada-auth.js NAO sao carregados por pagina nenhuma: sao
   instrumento, nao site. Se entrassem na lista, as classes escritas dentro
   das provas virariam "classe usada" e a prova C passaria a conferir a si
   mesma. */
ok(listarJs().indexOf("assets/bancada.js") === -1,
  "a varredura NAO inclui o proprio instrumento (bancada.js)");

/* Um gancho de JS so e dispensado se NAO tiver regra propria E se nenhum dos
   seus containers o dimensionar. Aqui: `.cx-ic` nao aparece em seletor
   nenhum do CSS (senao nem precisaria estar na lista). */
/* .cx-ic passou a ter regras (ícones dos avisos da área da cliente), então
   deixou de ser gancho dispensado e entra na conferência normal acima.    */
ok(definidas.has("cx-ic"), "cx-ic agora tem regra no CSS e é conferido como as demais classes");
/* E o tamanho dele vem do container, em cada lugar onde ele aparece. Se um
   container perder a regra que dimensiona o svg, ele deixa de ser meramente
   dispensavel e passa a ser defeito — esta prova avisa antes. */
["cx-atalho", "cx-voltar", "cx-bt-mini", "cx-aviso", "cx-cancelado"].forEach(function (cont) {
  const re = new RegExp("\\." + cont + "[^{}]*\\ssvg\\s*\\{");
  const css = listarCss().map((f) => cssDe(ler(f))).join("\n");
  ok(re.test(css),
    "o container ." + cont + " dimensiona o proprio svg (nao deixa o icone solto)");
});

/* ============================================== D. CONTROLE NEGATIVO ===== */
secao("D. controle negativo (o instrumento precisa saber reprovar)");

/* D1 — o detector de imagem quebrada precisa achar uma imagem inexistente.
   O id usado aqui nao pode existir no catalogo (p99 nao existe), senao o
   "controle negativo" provaria o contrario do que promete. */
const relFalso = "assets/img/card/produto-inexistente-a.webp";
ok(!existe(relFalso), "controle: a imagem falsa de fato nao existe no disco");
ok(!existe(relFalso), "controle: e o detector de imagem a reprovaria (mesma funcao 'existe')");

/* D2 — o detector de classe precisa achar uma classe inexistente.
   O controle roda o MESMO filtro da prova C, para provar que ele ainda reprova. */
const classeFalsa = "zzz-classe-que-nao-existe";
ok(!citadasCss.has(classeFalsa), "controle: classe falsa nao aparece em lugar nenhum do CSS");
const usadasComFalsa = new Set(usadas); usadasComFalsa.add(classeFalsa);
const detectadas = [...usadasComFalsa]
  .filter((c) => !citadasCss.has(c) && !GANCHOS_JS.has(c));
ok(detectadas.indexOf(classeFalsa) > -1,
  "controle: o detector de classe REPROVA a classe falsa",
  "detectadas: " + detectadas.join(", "));
// e tambem ACEITA uma classe que so existe como estado combinado
ok(citadasCss.has("on") && !definidas.has("on"),
  "controle: uma classe so de estado (.on) e aceita em vez de reprovada");

/* D2b — a lista de ganchos de JS precisa continuar ESTREITA.
   Um controle que provasse so "cx-ic e dispensado" nao provaria nada: ela
   poderia ter virado um "dispensa tudo". Aqui o MESMO filtro da prova C
   recebe uma classe inventada que nao esta em GANCHOS_JS e tem de reprovar.
   E o par: cx-ic passa, zzz-nao-passa.                            */
ok(GANCHOS_JS.has("cx-ic") && !GANCHOS_JS.has(classeFalsa),
  "controle: os ganchos de JS sao uma lista fechada, nao um 'dispensa tudo'");
const usadasComFalsa2 = new Set(usadas);
usadasComFalsa2.add(classeFalsa);
const detectadas2 = [...usadasComFalsa2]
  .filter((c) => !citadasCss.has(c) && !GANCHOS_JS.has(c));
ok(detectadas2.indexOf(classeFalsa) > -1,
  "controle: com a lista de ganchos aplicada, a classe falsa AINDA reprova");

/* D3 — o detector de ancora precisa achar uma ancora inexistente.
   Este controle usa a MESMA funcao da prova B2: se ele apenas olhasse o HTML cru,
   provaria que o HTML nao contem o id, e nao que o detector sabe reprovar. */
const idFalso = "ancora-que-nao-existe";
ok(!temDestino("index.html", idFalso),
  "controle: o detector de ancora REPROVA uma ancora inexistente");
ok(temDestino("trocas.html", "prazo"),
  "controle: o detector de ancora ACEITA uma ancora que existe (trocas.html#prazo)");

/* D4 — o detector de preco precisa achar um preco plantado */
const produtoComPreco = Object.assign({}, D.PRODUTOS[0], { preco: 199.9 });
const achouPreco = camposProibidos.some((c) => c in produtoComPreco) ||
                   /R\$|\d+,\d{2}/.test(JSON.stringify(produtoComPreco));
ok(achouPreco, "controle: o detector de preco REPROVA um produto com preco plantado");

/* ============================================================ RESUMO ===== */
console.log("\n" + "=".repeat(52));
console.log(falhas === 0
  ? "APROVADO — " + provas + " provas, 0 falhas"
  : "REPROVADO — " + provas + " provas, " + falhas + " falha(s)");
console.log("=".repeat(52));

process.exit(falhas === 0 ? 0 : 1);
