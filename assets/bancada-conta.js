/* ==========================================================================
   bancada-conta.js — prova que a AREA DA CLIENTE roda de verdade
   --------------------------------------------------------------------------
   `node --check` prova sintaxe. `bancada.js` prova dados, links e CSS. Nenhum
   dos dois prova que conta.html ABRE, que a tela decide certo com sessao e
   sem sessao, nem que o nome mostrado vem do SERVIDOR e nao do mock.

   Esta bancada executa o codigo REAL (conta-app.js + conta-ui.js +
   conta-api.js + conta-mock.js) dentro de um mini-DOM em Node, sobre o
   conta.html REAL, e afirma sobre o que sobra na tela.

   SEM NAVEGADOR E SEM REDE: por isso o `fetch` e trocado por um dublê de
   /api. O que se prova aqui e o COMPORTAMENTO DO FRONTEND diante de cada
   resposta do servidor — nao o servidor, que tem a propria bancada
   (bancada-auth.js) e, no fim, o banco de verdade.

   Uso:  node assets/bancada-conta.js
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

/* Um erro dentro de `.then()` vira promessa rejeitada e DESAPARECE: a
   bancada seguiria verde ou com falhas sem sentido, e o defeito real
   ficaria escondido. Aqui ele vira FALHA com o stack.                    */
process.on("unhandledRejection", (e) => {
  falhas++;
  console.log("  FALHA  promessa rejeitada sem tratamento:\n         " +
    String((e && e.stack) || e).split("\n").slice(0, 4).join("\n         "));
});

/* =====================================================================
   MINI-DOM
   ---------------------------------------------------------------------
   Cinco armadilhas conhecidas fazem uma bancada deste tipo MENTIR. Todas
   estao tratadas abaixo, e cada uma tem o seu comentario no lugar.

   1. `value` que nao cai para o atributo
   2. `classList` que nao reflete em `className`
   3. `querySelector` composto devolvendo vazio (e `.forEach` sobre vazio
      passando sempre)
   4. seletor com acento cortado por `\w`
   5. `body` sem `classList` — a tela derruba o proprio script
   ===================================================================== */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"]);

class No {
  constructor(tag, attrs, doc) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = attrs || {};
    this.childNodes = [];
    this.parentNode = null;
    this._texto = "";
    this.donocDocument = doc;
    this._listeners = {};
  }

  get children() { return this.childNodes.filter((n) => n instanceof No); }
  get classList() {
    const self = this;
    const lista = () => String(self.attrs["class"] || "").split(/\s+/).filter(Boolean);
    const grava = (l) => { self.attrs["class"] = l.join(" "); };
    return {
      contains: (c) => lista().indexOf(c) > -1,
      add: (...cs) => { const l = lista(); cs.forEach((c) => { if (l.indexOf(c) === -1) l.push(c); }); grava(l); },
      remove: (...cs) => { grava(lista().filter((c) => cs.indexOf(c) === -1)); },
      toggle: (c, forca) => {
        const tem = lista().indexOf(c) > -1;
        const deve = forca === undefined ? !tem : !!forca;
        if (deve && !tem) grava(lista().concat([c]));
        else if (!deve && tem) grava(lista().filter((x) => x !== c));
        return deve;
      },
    };
  }
  /* ARMADILHA 7: `className` era so GETTER. O codigo cria o botao do olho
     com `bt.className = "olho-bt"` (conta-ui.js) e o mini-DOM quebrava ali —
     o `arranque` da pagina morria e NENHUM campo era preenchido depois.
     Um DOM de mentira que quebra no codigo certo faz a bancada acusar o
     inocente. Precisava tambem do setter.                               */
  get className() { return String(this.attrs["class"] || ""); }
  set className(v) { this.attrs["class"] = String(v); }
  /* ARMADILHA 1: o valor do input precisa cair para o ATTRIBUTE.
     Sem isto, `input.value` e sempre "" e toda prova de formulario passa
     sem olhar nada. Em Node BAIXO o atributo `value` escreve no construtor:
     em cima, nao — e por isso a queda para o atributo e obrigatoria.

     ARMADILHA 1b (a que enganava): a guarda era `if ("value" in this)`.
     Como este proprio getter vive no PROTOTIPO, `"value" in this` e SEMPRE
     verdadeiro — entao o getter devolvia `this.__valor`, que ninguem tinha
     escrito, e todo `input.value` saia `undefined`. Um `undefined` silencioso
     e pior que um erro: prova que compara valor PASSA sem comparar nada
     (`undefined !== "lixo"` da verdadeiro). A guarda certa pergunta se
     ESCREVERAM no campo, com hasOwnProperty sobre o __valor.             */
  get value() {
    if (Object.prototype.hasOwnProperty.call(this, "__valor")) return this.__valor;
    if (this.tagName === "TEXTAREA") return this._texto;
    return this.attrs.value !== undefined ? this.attrs.value : "";
  }
  set value(v) {
    Object.defineProperty(this, "__valor", { value: String(v), writable: true, configurable: true, enumerable: false });
  }
  get dataset() {
    const self = this;
    const alvo = this.attrs;
    return new Proxy({}, {
      get: (_, k) => {
        const chave = "data-" + String(k).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        return alvo[chave];
      },
      set: (_, k, v) => {
        const chave = "data-" + String(k).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        alvo[chave] = String(v);
        return true;
      },
    });
  }
  getAttribute(n) { return this.attrs[n] !== undefined ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  /* ARMADILHA GRAVE: guardar o HTML como UMA string nao e suficiente.
     As telas montam o conteudo com `caixa.innerHTML = h` e depois as provas
     procuram DENTRO do que foi montado (`#formDados`, `[name=email]`).
     Com o HTML guardado como texto puro, NADA dentro da secao existia: toda
     prova de secao passaria decorativa. Por isso o innerHTML e PARSEADO em
     filhos de verdade.                                                     */
  set innerHTML(v) {
    this._texto = String(v);
    this.childNodes = [];
    if (!this._texto.trim()) return;
    const mini = parsear(this._texto);
    mini.raiz.childNodes.forEach((n) => { n.parentNode = this; this.childNodes.push(n); });
  }
  get innerHTML() { return this._texto; }
  get textContent() {
    if (!this.childNodes.length) return this._texto;
    return this.childNodes
      .map((n) => (n instanceof No ? n.textContent : (n.texto || "")))
      .join("");
  }
  set textContent(v) { this._texto = String(v); this.childNodes = []; }
  appendChild(n) { n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n) { this.childNodes = this.childNodes.filter((x) => x !== n); return n; }
  insertBefore(n, ref) {
    const i = this.childNodes.indexOf(ref);
    n.parentNode = this;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  cloneNode() { return this; }
  /* ARMADILHA 4: nome de classe/seletor com ACENTO. `[\w-]` corta no "e" e
     o seletor vira outro, que nunca casa. Aqui o nome e lido por negacao de
     delimitador, entao `#carrinhoPé` e `carrinho__pé` funcionam.          */
  _casaSimples(sel) {
    sel = String(sel).trim();
    if (!sel) return false;
    /* ARMADILHA: `.` dentro de um VALOR entre aspas nao e classe.
       Em `a[href="login.html"]` o `.html` era lido como classe, exigia
       classList.contains("html") e o seletor nunca casava — a prova A8
       reprovava o HTML certo. Aqui o valor entre aspas e neutralizado
       antes de procurar classe e id.                                     */
    const semValores = sel.replace(/\[[^\]]*\]/g, "[]");
    const reId = /^#([^.#\[\]:>+~\s]+)/;
    const reClasse = /\.([^.#\[\]:>+~\s]+)/g;
    /* O valor do atributo pode vir SEM aspas — e neste projeto vem:
       `[name=email]`, `[data-editar]`. A versao anterior so aceitava
       `="valor"`, entao `[name=email]` nao conferia nada e casava com o
       PRIMEIRO elemento da pagina. A prova "o e-mail e somente leitura"
       chegou a ler o input errado por causa disso.                       */
    const reAttr = /\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g;
    let m = semValores.match(reId);
    if (m && this.attrs.id !== m[1]) return false;
    for (const c of semValores.matchAll(reClasse)) {
      if (!this.classList.contains(c[1])) return false;
    }
    for (const a of sel.matchAll(reAttr)) {
      const nome = a[1];
      const valor = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4];
      const v = this.attrs[nome];
      if (valor === undefined) { if (v === undefined) return false; }
      else if (v !== valor) return false;
    }
    /* nome de TAG: so quando o seletor E um nome de tag, sem # . ou [ */
    if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(sel) && this.tagName !== sel.toUpperCase()) return false;
    return true;
  }
  _casa(sel) {
    /* ARMADILHA 3: seletor composto (`a b`, `.a.b`, `a b c`) precisa
       funcionar. Se devolvesse vazio, `forEach` sobre vazio passaria sempre
       e a prova ficaria decorativa. Aqui resolvemos por espaco da direita
       para a esquerda, e classe composta por todos os `.x` no mesmo no.  */
    const partes = String(sel).trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return false;
    const ultima = partes[partes.length - 1];
    if (!this._casaSimples(ultima)) return false;
    let atual = this.parentNode;
    for (let i = partes.length - 2; i >= 0; i--) {
      let achou = false;
      while (atual) {
        if (atual._casaSimples(partes[i])) { achou = true; atual = atual.parentNode; break; }
        atual = atual.parentNode;
      }
      if (!achou) return false;
    }
    return true;
  }
  _percorrer(fn) {
    for (const f of this.children) { fn(f); f._percorrer(fn); }
  }
  querySelectorAll(sel) {
    /* aceita lista separada por virgula (usada em focarPrimeiroErro) */
    const sels = String(sel).split(",").map((s) => s.trim()).filter(Boolean);
    const achados = [];
    this._percorrer((n) => {
      if (sels.some((s) => n._casa(s))) achados.push(n);
    });
    return achados;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) {
    let n = this;
    while (n) { if (n._casa(sel)) return n; n = n.parentNode; }
    return null;
  }
  matches(sel) { return this._casa(sel); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) {
    this._listeners[t] = (this._listeners[t] || []).filter((f) => f !== fn);
  }
  dispatch(t, ev) {
    const e = ev || {};
    e.target = e.target || this;
    e.currentTarget = this;
    e.preventDefault = e.preventDefault || (() => { e.defaultPrevented = true; });
    e.stopPropagation = e.stopPropagation || (() => { e.propagacaoParada = true; });
    (this._listeners[t] || []).forEach((f) => f.call(this, e));
    /* sobe para o pai, como no navegador — o submit do form depende disso */
    if (!e.propagacaoParada && this.parentNode && this.parentNode.dispatch) {
      this.parentNode.dispatch(t, e);
    }
    return e;
  }
  focus() { this.focado = true; }
  blur() { this.focado = false; }
  setSelectionRange() {}
  scrollIntoView() {}
  reset() {
    this.querySelectorAll("input, textarea").forEach((i) => { i.value = ""; });
  }
  get style() { return new Proxy(this.attrs, { get: (t, k) => t["style-" + String(k)] || "", set: (t, k, v) => { t["style-" + String(k)] = v; return true; } }); }
}

/* ---------------------------------------------------------------- parser
   Suficiente para o HTML deste projeto: tags, atributos entre aspas,
   comentarios, texto solto e VOID. Sem truque de regex magica alem disso. */
function parsear(fonte) {
  const html = fonte;
  const raizFalsa = new No("__doc__", {}, null);
  const pilha = [raizFalsa];
  let i = 0;
  const reTag = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[a-zA-Z][^>]*>/g;
  let m;
  while ((m = reTag.exec(html))) {
    const bruto = m[0];
    const texto = html.slice(i, m.index);
    if (texto.trim()) pilha[pilha.length - 1].childNodes.push({ texto, parentNode: pilha[pilha.length - 1] });
    i = m.index + bruto.length;

    if (bruto.startsWith("<!--") || bruto.startsWith("<!")) continue;
    const fecha = bruto.startsWith("</");
    const nome = (bruto.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/) || [])[1];
    if (!nome) continue;

    if (fecha) {
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].tagName === nome.toUpperCase()) { pilha.length = k; break; }
      }
      continue;
    }

    const no = new No(nome, {}, null);
    const reAttr = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    const dentro = bruto.slice(1 + nome.length, bruto.length - 1);
    let a;
    while ((a = reAttr.exec(dentro))) {
      const chave = a[1];
      const valor = a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : a[5] !== undefined ? a[5] : "";
      no.attrs[chave] = valor === undefined ? "" : valor;
    }
    pilha[pilha.length - 1].childNodes.push(no);
    no.parentNode = pilha[pilha.length - 1];
    if (!VOID.has(nome.toLowerCase()) && !bruto.endsWith("/>")) pilha.push(no);
  }
  const resto = html.slice(i);
  if (resto.trim()) pilha[pilha.length - 1].childNodes.push({ texto: resto });

  /* acha <html>, <head>, <body> de verdade */
  const achar = (t) => { let r = null; raizFalsa._percorrer((n) => { if (!r && n.tagName === t) r = n; }); return r; };
  const noHtml = achar("HTML") || raizFalsa;
  const head = achar("HEAD") || raizFalsa;
  const body = achar("BODY") || raizFalsa;

  /* O `document` de verdade: um objeto com busca, criacao de no e os
     atalhos que o site usa (documentElement, body, head). Sem isto,
     `document.querySelector` nao existe e o ui.js quebra na primeira linha. */
  const doc = {
    raiz: raizFalsa, html: noHtml, head: head, body: body,
    documentElement: noHtml,
    /* documentos comecam no <html>: buscar daqui alcanca head e body */
    querySelector: (s) => noHtml.querySelector(s),
    querySelectorAll: (s) => noHtml.querySelectorAll(s),
    getElementById: (id) => noHtml.querySelector("#" + id),
    createElement: (t) => {
      const no = new No(t, {}, null);
      /* <template>: o site monta trechos com
         `t.innerHTML = html; return t.content.firstElementChild`.
         Sem `content` com filhos de verdade, o ui.js quebra ao montar a
         gaveta. O conteudo e parseado ao escrever o innerHTML.           */
      if (String(t).toLowerCase() === "template") {
        no.content = { firstElementChild: null, childNodes: [] };
        Object.defineProperty(no, "innerHTML", {
          configurable: true,
          get() { return this._texto; },
          set(v) {
            this._texto = String(v);
            const frag = new No("__frag__", {}, null);
            frag.innerHTML = String(v);
            /* o parser do fragmento nao ve tags fora do par: reusa parsear */
            const mini = parsear(String(v) + "\u0000");
            const primeiros = mini.html.children.length ? mini.html.children : mini.raiz.children;
            frag.childNodes = primeiros.length ? primeiros : frag.childNodes;
            frag.childNodes.forEach((f) => { f.parentNode = frag; });
            this.content.firstElementChild = frag.childNodes.filter((f) => f instanceof No)[0] || null;
            this.content.childNodes = frag.childNodes;
          },
        });
      }
      return no;
    },
    createTextNode: (t) => ({ texto: String(t), parentNode: null }),
    addEventListener: (t, fn) => { (doc.__ouvintes[t] = doc.__ouvintes[t] || []).push(fn); },
    removeEventListener: () => {},
    dispatchEvent: (ev) => {
      const t = (ev && ev.type) || String(ev);
      (doc.__ouvintes[t] || []).forEach((f) => f(ev));
      return true;
    },
    readyState: "complete",
    __ouvintes: {},
  };
  body.parentNode = body.parentNode || html;
  return doc;
}

/* ---------------------------------------------------- scripts da pagina
   LE DA PAGINA, nao de uma lista escrita a mao. Foi uma lista fixa que
   deixou conta-app.js de fora das outras provas por uma rodada inteira. */
function scriptsDaPagina(html) {
  const urls = [];
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)) urls.push(m[1]);
  const inline = [];
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) inline.push(m[1]);
  return { urls, inline };
}

/* --------------------------------------------------------------- fetch
   Duble de /api. Cada prova escolhe o que o servidor responde. Ver a
   limitacao declarada no fim do arquivo: isto prova o FRONTEND.          */
function criarFetch(respostas) {
  const chamadas = [];
  function fetch(url, init) {
    const chave = String(url);
    chamadas.push({ url: chave, init: init || {} });
    const r = respostas[chave];
    if (r === undefined) {
      return Promise.reject(new TypeError("bancada: nenhuma resposta preparada para " + chave));
    }
    const status = r.status || 200;
    const corpo = JSON.stringify(r.corpo === undefined ? {} : r.corpo);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(corpo),
    });
  }
  fetch.chamadas = chamadas;
  return fetch;
}

/* ------------------------------------------------------ montar a pagina */
/* `mexer` e opcional: recebe o texto do HTML e devolve outro. Serve para o
   CONTROLE NEGATIVO — sabotar a pagina e exigir que a prova acuse. Sem ele
   a bancada so sabe dizer "passou", nunca "sabe reprovar".               */
function abrirPagina(pagina, respostas, mexer) {
  const html = mexer ? mexer(ler(pagina)) : ler(pagina);
  const doc = parsear(html);
  const { urls, inline } = scriptsDaPagina(html);

  const registro = [];
  const janela = {};
  janela.window = janela;
  janela.document = doc;
  janela.location = {
    /* A pagina vem por parametro: a bancada abre conta.html E login.html. */
    href: pagina, pathname: "/" + pagina, hash: "", search: "", origin: "https://exemplo.test",
    reload: () => { janela.location.__recarregou = true; },
    /* location.replace: usado pelo portao de sessao (conta-sessao.js). Sem
       ele o mini-DOM quebraria no codigo CERTO e acusaria o inocente. Aqui
       ele muda o href como no navegador — a prova le `location.href`.     */
    replace: (destino) => { janela.location.__troca = destino; janela.location.href = destino; janela.location.pathname = "/" + destino; },
  };
  janela.navigator = { userAgent: "bancada" };
  janela.console = console;
  /* RELOGIO REAL. O portao de sessao usa um limite de 6s (setTimeout). Com
     o duble de timer, `clearTimeout` nao cancelava nada e o limite podia
     disparar DEPOIS do veredito — um falso "livre" cravado no meio da
     prova. Com timer de verdade, cancelar cancela e o limite e medido.   */
  janela.setTimeout = (f, ms) => setTimeout(f, ms);
  janela.clearTimeout = (t) => clearTimeout(t);
  /* pede o proximo quadro: chama na hora, para nada ficar pendente */
  janela.requestAnimationFrame = (f) => { try { f(0); } catch (e) { /* segue */ } return 0; };
  janela.cancelAnimationFrame = () => {};
  janela.scrollTo = () => {};
  janela.confirm = () => true;
  janela.alert = () => {};
  /* ARMADILHA 5: body/classe/estilo — a tela mexe em document.body.classList
     e em documentElement; sem isto o proprio script quebra na primeira linha. */
  janela.fetch = criarFetch(respostas);
  /* builtins que o site usa (o contexto do vm nao herda tudo do Node) */
  ["Promise", "Math", "JSON", "Date", "Object", "Array", "String", "Number",
    "Boolean", "Error", "RegExp", "TypeError", "Set", "Map", "Symbol",
    "URLSearchParams", "encodeURIComponent", "decodeURIComponent", "CustomEvent",
    "clearInterval", "setInterval"].forEach((n) => {
    /* so copia o que EXISTE: sem a guarda, um nome ausente no Node
       (`requestAnimationFrame`) sobrescreveria o duble com undefined — foi
       exatamente o que aconteceu, e o erro apontava para o ui.js.        */
    if (globalThis[n] !== undefined) janela[n] = globalThis[n];
  });
  janela.isNaN = isNaN;
  janela.parseInt = parseInt;
  janela.parseFloat = parseFloat;
  /* o site mede caixas ao revelar elementos na rolagem */
  No.prototype.getBoundingClientRect = function () {
    return { top: 100, left: 0, right: 100, bottom: 200, width: 100, height: 100, x: 0, y: 100 };
  };
  janela.getComputedStyle = () => ({ getPropertyValue: () => "" });
  janela.matchMedia = () => ({ matches: false, addEventListener: () => {}, addListener: () => {} });
  janela.innerWidth = 1280;
  janela.innerHeight = 800;
  janela.devicePixelRatio = 1;
  janela.scrollY = 0;
  janela.history = { replaceState: () => {}, pushState: () => {} };
  /* ARMADILHA: IntersectionObserver nao pode existir como `undefined`.
     `"IntersectionObserver" in window` fica true e o codigo que faz
     `new IntersectionObserver(...)` quebra. Aqui ele existe e funciona. */
  janela.IntersectionObserver = function (cb) {
    this.observe = () => {};
    this.unobserve = () => {};
    this.disconnect = () => {};
    this.takeRecords = () => [];
    this.__cb = cb;
  };
  /* localStorage existe? Nao neste projeto para autenticacao — e a bancada
     prova isso. Se ele aparecer no fluxo de sessao, a prova H acusa.     */
  const memoriaLocal = {};
  janela.localStorage = {
    getItem: (k) => (k in memoriaLocal ? memoriaLocal[k] : null),
    setItem: (k, v) => { memoriaLocal[k] = String(v); },
    removeItem: (k) => { delete memoriaLocal[k]; },
    clear: () => { Object.keys(memoriaLocal).forEach((k) => delete memoriaLocal[k]); },
    __chaves: () => Object.keys(memoriaLocal),
  };
  janela.__memoriaLocal = memoriaLocal;
  janela.__ouvintes = {};
  janela.addEventListener = (t, fn) => { (janela.__ouvintes[t] = janela.__ouvintes[t] || []).push(fn); };
  janela.removeEventListener = () => {};
  janela.dispatchEvent = (t) => { (janela.__ouvintes[t] || []).forEach((f) => f({ type: t })); };

  const dirBase = "assets/js/";
  urls.forEach((u) => { janela.__urlAtual = u; });
  const ctx = vm.createContext(janela);

  /* ARMADILHA 6 (a que mais engana): se um script da pagina LANCAR, o
     `abrirConta` inteiro morre no meio. As provas seguintes ou somem, ou
     medem uma pagina que nunca arrancou — e a bancada parece calma. Um
     defeito assim ja passou por aqui: o arranque quebrou, a leitura das
     secoes nao aconteceu, e mesmo assim tudo saiu verde. Por isso o erro
     nao sobe em silencio: vira FALHA com o stack inteiro, e a pagina e
     mesmo assim devolvida no estado em que parou, para o defeito aparecer
     medido em vez de mascarado.                                          */
  const tropecos = [];
  const rodar = (codigo, nome) => {
    try {
      vm.runInContext(codigo, ctx, { filename: nome });
    } catch (e) {
      tropecos.push({ arquivo: nome, erro: String((e && e.stack) || e) });
    }
  };

  /* 1) scripts inline que vem ANTES dos externos (ex.: o que marca o <html>).
     O ULTIMO inline e o arranque da pagina: ele so pode rodar depois que os
     arquivos externos existirem, senao `LB is not defined`.               */
  inline.slice(0, -1).forEach((codigo, i) => rodar(codigo, "inline-" + i));
  /* 2) scripts externos, na ordem em que a pagina os carrega */
  urls.forEach((u) => {
    const rel = u.startsWith("assets/") ? u : dirBase + u;
    rodar(ler(rel), rel);
  });
  /* 3) o script de arranque da pagina (o ultimo inline) */
  rodar(inline[inline.length - 1], "arranque");

  if (tropecos.length) {
    tropecos.forEach((t) => {
      falhas++;
      console.log("  FALHA  o script da pagina lancou e a pagina NAO terminou de arrancar" +
        "\n         arquivo: " + t.arquivo +
        "\n         " + t.erro.split("\n").slice(0, 5).join("\n         "));
    });
  }

  return { doc, janela, ctx, tropecos };
}

function abrirConta(respostas) { return abrirPagina("conta.html", respostas); }

/* espera as Promises pendentes assentarem (fetch duble resolve na hora) */
function assentar() {
  return new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));
}

const NOME_SERVIDOR = "Joana Ribeiro Lima";
const CLIENTE_SERVIDOR = {
  id: "11111111-2222-3333-4444-555555555555",
  nome: NOME_SERVIDOR,
  email: "joana.ribeiro@exemplo.com",
  whatsapp: "(81) 98888-7777",
  nascimento: "1990-02-20",
  desde: "2026-09-01T12:00:00.000Z",
};

(async function principal() {

  /* =================================================================== A */
  secoes("A. SEM SESSAO a area nao abre");
  {
    const { doc, janela } = abrirConta({
      "/api/auth/me": { status: 401, corpo: { erro: "A sua sessão expirou. Entre de novo, por favor." } },
    });
    await assentar();
    const painel = doc.body.querySelector("#areaConta");
    const semSessao = doc.body.querySelector("#semSessao");
    const conferindo = doc.body.querySelector("#conferindo");
    ok(painel && painel.classList.contains("oculto"), "1. #painel continua escondido");
    ok(semSessao && !semSessao.classList.contains("oculto"), "2. o convite para entrar aparece");
    ok(conferindo && conferindo.classList.contains("oculto"), "3. o 'conferindo' some");
    ok(!doc.body.classList.contains("tem-conta"), "4. body nao ganha tem-conta");
    ok(janela.CONTA_APP.estado.entrou === false, "5. estado.entrou continua false");
    ok(janela.CONTA_APP.estado.cliente === null, "6. nenhum cliente foi carregado");
    /* a tela NAO pode ter montado a area: nem cabecalho, nem menu */
    const caixa = doc.body.querySelector("#painelConta");
    ok(caixa && caixa.innerHTML === "", "7. nada foi montado dentro de #painelConta");
    /* o convite leva para o login de verdade */
    const irLogin = semSessao.querySelector('a[href="login.html"]');
    ok(!!irLogin, "8. o convite tem link para login.html");
  }

  /* =================================================================== B */
  secoes("B. COM SESSAO a area abre e o nome vem do SERVIDOR");
  {
    const { doc, janela } = abrirConta({
      "/api/auth/me": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      "/api/pedidos": { status: 200, corpo: {} },
    });
    await assentar();
    const painel = doc.body.querySelector("#areaConta");
    ok(painel && !painel.classList.contains("oculto"), "1. #painel aparece");
    ok(doc.body.classList.contains("tem-conta"), "2. body ganha tem-conta (a faixa de aviso)");
    ok(janela.CONTA_APP.estado.entrou === true, "3. estado.entrou = true");

    const texto = doc.body.querySelector("#painelConta").textContent;
    /* O cabecalho cumprimenta pelo PRIMEIRO nome ("Olá, Joana"). A prova
       tem de cobrar o que a tela faz, nao o que eu esperava que fizesse. */
    ok(texto.indexOf("Olá, Joana") > -1,
      "4. o cabecalho cumprimenta com o primeiro nome do SERVIDOR",
      "procurando: 'Olá, Joana' no texto da visao geral");
    /* CONTRASTE: o nome do CLIENTE do mock nao pode aparecer. Sem esta
       segunda metade, a prova passaria mesmo se a tela mostrasse o mock.
       (O mock ainda aparece nos ENDERECOS, como destinatario de exemplo —
       isso e dado de demonstracao declarado, e a prova 5b cobre.)        */
    ok(texto.indexOf(NOME_SERVIDOR) === -1 && texto.indexOf("Maria Geovana") === -1,
      "5. na visao geral nao ha nome de cliente do mock",
      "achou 'Maria Geovana' no cabecalho");
    /* o menu lateral e o lugar onde o cliente REAL aparece inteiro */
    const quem = doc.body.querySelector(".conta__quem");
    ok(quem && quem.textContent.indexOf(NOME_SERVIDOR) > -1,
      "6. o menu lateral mostra o nome completo do servidor");
    ok(quem && quem.textContent.indexOf("joana.ribeiro@exemplo.com") > -1,
      "7. o menu lateral mostra o e-mail do servidor");
    ok(quem && quem.textContent.indexOf("maria@exemplo.com") === -1,
      "8. o e-mail do MOCK nao aparece em lugar nenhum");

    /* 5b: o nome do mock PODE aparecer — mas so como destinatario de
       endereco de exemplo, junto da faixa que diz que e exemplo.         */
    /* A frase e QUEBRADA no fonte por causa da largura da linha, entao
       `textContent` tem "são de\nverdade" e o indexOf cru FALHA — foi o que
       aconteceu na primeira rodada. Comparar por espaco normalizado e a
       unica forma de a prova medir a frase, e nao a formatacao do arquivo. */
    /* Pedidos e endereços agora vêm de /api/conta (reais). A antiga faixa
       "são de exemplo" saiu junto com o mock — e nada demonstrativo pode
       aparecer no lugar dela.                                              */
    const textoTela = doc.body.textContent.replace(/\s+/g, " ");
    ok(!doc.body.querySelector(".cx-faixa-aviso") && textoTela.indexOf("de exemplo") === -1,
      "9. nenhuma faixa ou texto de 'dados de exemplo' na área da cliente");
    ok(textoTela.indexOf("LB-24960") === -1 && textoTela.indexOf("DEMO") === -1,
      "10. nenhum pedido ou rastreio fictício do antigo mock aparece");
  }

  /* =================================================================== C */
  secoes("C. A TELA NAO ABRE SEM O SERVIDOR CONFIRMAR");
  {
    /* /me responde 503: nao da para saber quem e. Nao pode abrir a area
       (inventar acesso) nem afirmar que a pessoa nao esta conectada.     */
    const { doc } = abrirConta({
      "/api/auth/me": { status: 503, corpo: { erro: "Não consegui falar com o servidor agora." } },
    });
    await assentar();
    const painel = doc.body.querySelector("#areaConta");
    ok(painel && painel.classList.contains("oculto"), "1. com 503 a area NAO abre");
    ok(!doc.body.classList.contains("tem-conta"), "2. com 503 o body nao ganha tem-conta");
    const conferindo = doc.body.querySelector("#conferindo");
    ok(conferindo && conferindo.textContent.indexOf("Tentar de novo") > -1,
      "3. a tela oferece tentar de novo em vez de sumir");
  }

  /* =================================================================== D */
  secoes("D. A PORTA FALSA NAO EXISTE MAIS");
  {
    const html = ler("conta.html");
    ok(html.indexOf("btDemo") === -1, "1. nao existe mais botao 'Ver a area da cliente'");
    ok(html.indexOf("Demonstração visual") === -1, "2. nao existe mais o aviso 'Demonstração visual'");
    ok(html.indexOf("sairDemo") === -1, "3. nao existe mais 'Sair do modo demonstracao'");
    /* e o codigo nao pode mais ter o interruptor */
    const app = ler("assets/js/conta-app.js");
    ok(app.indexOf("btDemo") === -1, "4. conta-app.js nao tem o interruptor de demonstracao");
    ok(app.indexOf("S.demo") === -1, "5. conta-app.js nao tem mais o estado demo");
    ok(app.indexOf("em-demo") === -1, "6. conta-app.js nao usa mais a classe em-demo");
  }

  /* =================================================================== E */
  secoes("E. MEUS DADOS: o e-mail nao e editavel e o servidor manda");
  {
    const { doc, janela } = abrirConta({
      "/api/auth/me": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      "/api/cliente": {
        status: 200, corpo: { ok: true, cliente: Object.assign({}, CLIENTE_SERVIDOR, { nome: "Joana Ribeiro" }) },
      },
    });
    await assentar();
    /* NAVEGAR PELO CAMINHO REAL. Antes eu escrevia em estado.secao e chamava
       carregar() — mas carregar() le a secao do HASH e sobrescreve o que eu
       escrevi. A tela renderizava "visao" e a prova "a secao foi montada"
       reprovava um codigo certo. Aqui a aba e acionada como a pessoa aciona. */
    const abaDados = doc.body.querySelector('button[data-aba="dados"]');
    ok(!!abaDados, "0. a aba Meus dados existe no menu");
    abaDados.dispatch("click");
    await assentar();

    const form = doc.body.querySelector("#formDados");
    ok(!!form, "1. a secao Meus dados foi montada");
    const email = form.querySelector("[name=email]");
    ok(!!email, "2. o campo de e-mail existe");
    ok(email.getAttribute("readonly") !== null, "3. o e-mail e somente leitura");
    ok(email.value === "joana.ribeiro@exemplo.com", "4. o e-mail mostrado e o do servidor");

    /* O ENVIO REAL: preenche os campos e DISPARA o submit do formulario.
       Antes a prova chamava CONTA_API.pedir() na mao e olhava o corpo — isso
       provava a API, nao o formulario. Agora quem monta o corpo e o proprio
       submitDados, e o que a prova mede e o que a TELA mandou.            */
    const enviados = [];
    const fabrica = criarFetch({
      "/api/cliente": {
        status: 200, corpo: { ok: true, cliente: Object.assign({}, CLIENTE_SERVIDOR, { nome: "Joana Ribeiro" }) },
      },
    });
    janela.fetch = function (url, init) {
      if ((init && init.method) === "PATCH") enviados.push(String(init.body || ""));
      return fabrica(url, init);
    };
    form.querySelector("[name=nome]").value = "Joana Ribeiro";
    form.querySelector("[name=whatsapp]").value = "81988887777";
    form.querySelector("[name=nascimento]").value = "1990-02-20";
    form.dispatch("submit");
    await assentar();

    ok(enviados.length === 1, "5. o submit mandou um unico PATCH /api/cliente",
      "enviados=" + enviados.length);
    const corpo = enviados[0] || "";
    ok(corpo.indexOf("email") === -1, "6. o envio de dados NAO leva o e-mail", corpo);
    ok(corpo.indexOf("\"id\"") === -1, "7. o envio de dados NAO leva id", corpo);
    /* e o e-mail continua intocado na tela: o servidor e quem manda nele */
    ok(form.querySelector("[name=email]").value === "joana.ribeiro@exemplo.com",
      "8. o e-mail segue o do servidor depois de salvar");
  }


  /* =================================================================== F */
  secoes("F. SAIR DA CONTA apaga a sessao no servidor");
  {
    const { doc, janela } = abrirConta({
      "/api/auth/me": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      "/api/pedidos": { status: 200, corpo: {} },
      "/api/auth/logout": { status: 200, corpo: { ok: true } },
    });
    await assentar();
    ok(janela.CONTA_APP.estado.entrou === true, "1. entrou antes de sair");

    const antes = janela.fetch.chamadas.slice();
    janela.CONTA_APP.estado.secao = "seguranca";
    janela.CONTA_APP.carregar();
    await assentar();
    /* aperta o botao de sair que a propria tela montou */
    const botao = doc.body.querySelector("#sair");
    ok(!!botao, "2. o botao de sair da conta existe no menu");
    botao.dispatch("click");
    await assentar();

    const chamouLogout = janela.fetch.chamadas.slice(antes.length)
      .some((c) => c.url.indexOf("/api/auth/logout") > -1 && (c.init.method || "GET") === "POST");
    ok(chamouLogout, "3. o POST /api/auth/logout foi chamado");
    ok(janela.CONTA_APP.estado.entrou === false, "4. estado.entrou volta a false");
    ok(janela.CONTA_APP.estado.cliente === null, "5. o cliente e descartado");
    const painel = doc.body.querySelector("#areaConta");
    ok(painel.classList.contains("oculto"), "6. a area some da tela");
    ok(!doc.body.classList.contains("tem-conta"), "7. a faixa de aviso some junto");
  }

  /* =================================================================== G */
  secoes("G. NAVEGACAO POR HASH NAO ABRE NADA SEM SESSAO");
  {
    const { janela } = abrirConta({
      "/api/auth/me": { status: 401, corpo: { erro: "entre de novo" } },
      "/api/pedidos": { status: 200, corpo: {} },
    });
    await assentar();
    /* sem sessao, mudar o hash nao pode montar secao nenhuma */
    const antes = janela.CONTA_APP.estado.secao;
    janela.location.hash = "#seguranca";
    janela.dispatchEvent("hashchange");
    await assentar();
    ok(janela.CONTA_APP.estado.secao === antes,
      "1. sem sessao, #seguranca nao troca a secao",
      "antes=" + antes + " depois=" + janela.CONTA_APP.estado.secao);
    ok(janela.CONTA_APP.estado.entrou === false, "2. segue sem entrar");
  }

  /* =================================================================== H */
  secoes("H. CONTROLE NEGATIVO — o instrumento precisa saber reprovar");
  {
    /* H1: se a tela usasse o mock para o cliente, a prova B teria de
       quebrar. Aqui plantamos o mock como fonte e conferimos que a
       verificacao "o nome do servidor aparece" REPROVA.                 */
    const { doc, janela } = abrirConta({
      "/api/auth/me": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      "/api/pedidos": { status: 200, corpo: {} },
    });
    await assentar();
    janela.CONTA_APP.estado.secao = "dados";
    janela.CONTA_APP.carregar();
    await assentar();
    /* sujeira controlada: troca o cliente da tela pelo do mock */
    janela.CONTA_APP.estado.cliente = { nome: "Maria Geovana", email: "maria@exemplo.com", whatsapp: "(81) 90000-0000", nascimento: "1996-04-12", desde: "2025-11-03" };
    janela.CONTA_APP.carregar();
    await assentar();
    const texto = doc.body.querySelector("#painelConta").textContent;
    const verifica = (t) => t.indexOf(NOME_SERVIDOR) > -1 && t.indexOf("Maria Geovana") === -1;
    ok(!verifica(texto),
      "1. controle: com o mock no lugar, a prova B REPROVARIA",
      "a conferencia devolveu falso, como devia");

    /* H2: o detector de "porta falsa" precisa achar o botao, se ele voltar */
    const htmlCru = ler("conta.html");
    const detectaPorta = (t) => t.indexOf("btDemo") > -1;
    ok(!detectaPorta(htmlCru), "2. controle: hoje a porta falsa nao esta no HTML");
    ok(detectaPorta('<button id="btDemo">'), "3. controle: o detector ACHA o botao se ele voltar");

    /* H3: o detector de 401 precisa distinguir 401 de 200 */
    const { doc: docOk } = abrirConta({
      "/api/auth/me": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      "/api/pedidos": { status: 200, corpo: {} },
    });
    await assentar();
    const { doc: docErro } = abrirConta({
      "/api/auth/me": { status: 401, corpo: { erro: "x" } },
      "/api/pedidos": { status: 200, corpo: {} },
    });
    await assentar();
    const abriuOk = !docOk.body.querySelector("#areaConta").classList.contains("oculto");
    const abriuErro = !docErro.body.querySelector("#areaConta").classList.contains("oculto");
    ok(abriuOk !== abriuErro,
      "4. controle: a bancada DISTINGUE 200 de 401 (nao passa nos dois)",
      "200 abriu=" + abriuOk + " / 401 abriu=" + abriuErro);
  }

  /* =================================================================== I */
  secoes("I. NAO EXISTE id REPETIDO — o defeito que deixava a area invisivel");
  {
    /* DEFEITO REAL, achado por ESTA bancada e nao pelas outras: o ui.js
       injeta o mega-menu com id="painel" na casca do topo, e o conta.html
       tambem tinha uma secao id="painel". Com dois ids iguais, o
       `document.querySelector("#painel")` do conta-app.js devolvia o
       MEGA-MENU (vem antes no documento), entao "abrir a area" mexia no
       elemento errado e a area da cliente nunca aparecia — nem no modo
       demonstracao antigo, nem agora. HTML invalido, e o navegador nao
       avisa: escolhe um e segue.

       A bancada de classes nao ve isso: id nao e classe. Por isso a prova
       mora aqui, onde a pagina INTEIRA (casca injetada + pagina) e montada. */
    const { doc } = abrirConta({
      "/api/auth/me": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      "/api/pedidos": { status: 200, corpo: {} },
    });
    await assentar();

    const conta = new Map();
    doc.body.querySelectorAll("[id]").forEach((n) => {
      const id = n.getAttribute("id");
      conta.set(id, (conta.get(id) || 0) + 1);
    });
    const repetidos = [...conta.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    ok(repetidos.length === 0,
      "1. nenhum id aparece duas vezes na pagina montada",
      "repetidos: " + (repetidos.join(", ") || "nenhum"));

    /* CONTROLE NEGATIVO: se o id repetido voltar, esta prova tem de ACUSAR.
       Plantamos um segundo "painel" no proprio DOM e conferimos que a
       contagem REPROVA — sem isto, uma prova de "nenhum repetido" pode
       estar cega e ainda assim parecer verde.                            */
    const planta = doc.createElement("div");
    planta.setAttribute("id", "painel");
    doc.body.appendChild(planta);
    const conta2 = new Map();
    doc.body.querySelectorAll("[id]").forEach((n) => {
      const id = n.getAttribute("id");
      conta2.set(id, (conta2.get(id) || 0) + 1);
    });
    const repetidos2 = [...conta2.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    ok(repetidos2.indexOf("painel") > -1,
      "2. controle: com um id repetido plantado, a prova ACUSA",
      "repetidos: " + repetidos2.join(", "));

    /* e o id que o codigo procura tem de ser o MESMO que a pagina declara */
    const app = ler("assets/js/conta-app.js");
    const html = ler("conta.html");
    const busca = (app.match(/querySelector\("#(areaConta|painel)"\)/) || [])[1];
    ok(busca === "areaConta",
      "3. conta-app.js procura #areaConta (e nao #painel, que e do mega-menu)",
      "achou: #" + busca);
    /* O id tem de estar FORA de comentario. O conta.html explica o defeito
       num comentario escrevendo `id="painel"` — procurar a string crua no
       arquivo acusaria esse proprio comentario (foi o que aconteceu). A
       prova tira os comentarios antes de olhar.                         */
    const semComentario = html.replace(/<!--[\s\S]*?-->/g, "");
    const declaraPainel = /<[a-zA-Z][^>]*\sid="painel"/.test(semComentario);
    const declaraConta = /<[a-zA-Z][^>]*\sid="areaConta"/.test(semComentario);
    ok(declaraConta && !declaraPainel,
      "4. conta.html declara #areaConta e nao declara #painel (fora de comentario)",
      "areaConta=" + declaraConta + " painel=" + declaraPainel);
  }

  /* =================================================================== J */
  secoes("J. LOGIN e CADASTRO (paginas reais, enviando de verdade)");
  {
    /* Estas duas paginas tem script proprio (inline), e ate agora so a
       bancada do SERVIDOR olhava o que elas pedem. Aqui as PAGINAS REAIS
       sao abertas e o formulario e enviado como a pessoa envia — o que se
       prova e o que a tela faz, nao o que a API faz.                      */

    /* ---- J1: login valido -> o navegador vai para conta.html ---------- */
    {
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/login": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      });
      await assentar();
      const form = doc.body.querySelector("#formLogin");
      ok(!!form, "1. o formulario de login existe");
      form.querySelector("[name=email]").value = "joana.ribeiro@exemplo.com";
      form.querySelector("[name=senha]").value = "SenhaBoa2024";
      form.dispatch("submit");
      await assentar();
      const chamou = janela.fetch.chamadas.some((c) => c.url === "/api/auth/login" && c.init.method === "POST");
      ok(chamou, "2. o login valido chama POST /api/auth/login");
      ok(janela.location.href === "conta.html",
        "3. com a sessao criada, a pagina vai para conta.html",
        "href = " + janela.location.href);
      const corpo = JSON.stringify((janela.fetch.chamadas.find((c) => c.url === "/api/auth/login") || {}).init || {});
      ok(corpo.indexOf("SenhaBoa2024") > -1 && corpo.indexOf("manter") > -1,
        "4. a senha e o 'Manter conectado' vao no corpo do POST");
    }

    /* ---- J2: senha errada -> fica na pagina e NAO cria sessao --------- */
    {
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/login": { status: 401, corpo: { erro: "E-mail ou senha incorretos." } },
      });
      await assentar();
      const form = doc.body.querySelector("#formLogin");
      form.querySelector("[name=email]").value = "joana.ribeiro@exemplo.com";
      form.querySelector("[name=senha]").value = "SenhaErrada999";
      form.dispatch("submit");
      await assentar();
      ok(janela.location.href === "login.html",
        "5. com senha errada, a pagina NAO vai para a area", "href = " + janela.location.href);
      const sist = doc.body.querySelector("#sistema");
      ok(sist && !sist.classList.contains("oculto") && /incorretos/i.test(sist.textContent),
        "6. a mensagem generica aparece na tela", sist ? sist.textContent.slice(0, 70) : "sem #sistema");
      ok(!janela.localStorage.__chaves().length,
        "7. nada foi guardado no localStorage depois da tentativa");
    }

    /* ---- J3: campos invalidos -> nem chega no servidor ---------------- */
    {
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/login": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      });
      await assentar();
      const form = doc.body.querySelector("#formLogin");
      form.querySelector("[name=email]").value = "isso-nao-e-email";
      form.querySelector("[name=senha]").value = "123";
      form.dispatch("submit");
      await assentar();
      /* Conta so o que o FORMULARIO manda. O portao de sessao faz um GET
         /api/auth/me ao abrir a pagina — isso e legitimo e nao e o que esta
         prova mede. Medir "nenhuma chamada" acusaria o inocente.          */
      const envios = janela.fetch.chamadas.filter((c) => (c.init.method || "GET").toUpperCase() === "POST");
      ok(envios.length === 0,
        "8. campo invalido barra ANTES de enviar ao servidor",
        "POSTs = " + envios.length + " | todas: " + janela.fetch.chamadas.map((c) => c.url).join(", "));
      ok(janela.location.href === "login.html", "9. e a pagina nao sai do lugar");
    }

    /* ---- J4: cadastro valido -> cria conta e ja entra ----------------- */
    {
      const { doc, janela } = abrirPagina("cadastro.html", {
        "/api/auth/cadastro": { status: 201, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      });
      await assentar();
      const form = doc.body.querySelector("#formCadastro");
      ok(!!form, "10. o formulario de cadastro existe");
      const so = (n) => form.querySelector("[name=" + n + "]");
      so("nome").value = "Joana Ribeiro Lima";
      so("email").value = "joana.ribeiro@exemplo.com";
      so("whatsapp").value = "81988887777";
      so("senha").value = "SenhaBoa2024";
      so("senha2").value = "SenhaBoa2024";
      const aceite = form.querySelector('input[type="checkbox"]');
      if (aceite) aceite.checked = true;
      form.dispatch("submit");
      await assentar();
      const chamadas = janela.fetch.chamadas.map((c) => c.url);
      ok(chamadas.indexOf("/api/auth/cadastro") > -1,
        "11. o cadastro valido chama POST /api/auth/cadastro", chamadas.join(", "));
      ok(janela.location.href === "conta.html",
        "12. ao criar a conta, a pagina entra na area", "href = " + janela.location.href);
    }

    /* ---- J5: e-mail duplicado -> mensagem amigavel, sem entrar -------- */
    {
      const { doc, janela } = abrirPagina("cadastro.html", {
        "/api/auth/cadastro": { status: 409, corpo: { erro: "Já existe uma conta com este e-mail. Tente entrar." } },
      });
      await assentar();
      const form = doc.body.querySelector("#formCadastro");
      const so = (n) => form.querySelector("[name=" + n + "]");
      so("nome").value = "Joana Ribeiro Lima";
      so("email").value = "joana.ribeiro@exemplo.com";
      so("whatsapp").value = "81988887777";
      so("senha").value = "SenhaBoa2024";
      so("senha2").value = "SenhaBoa2024";
      const aceite = form.querySelector('input[type="checkbox"]');
      if (aceite) aceite.checked = true;
      form.dispatch("submit");
      await assentar();
      ok(janela.location.href === "cadastro.html",
        "13. e-mail duplicado NAO entra na area", "href = " + janela.location.href);
      const errado = doc.body.querySelector("[name=email]");
      ok(errado && /já existe|existe uma conta/i.test(
        (errado.getAttribute("data-erro") || "") + " " + (errado.parentNode ? errado.parentNode.textContent : "")),
        "14. o e-mail duplicado recebe a mensagem amigavel no proprio campo");
    }
  }

  /* =================================================================== K */
  secao("K. PERSISTENCIA: 'Minha conta' com sessao viva nao pede senha (TESTE A-E)");
  {
    /* O DEFEITO: todo link "Minha conta" do site aponta para login.html, e
       a pagina mostrava o formulario SEMPRE — mesmo com sessao viva. Quem
       estava conectada clicava e caia no login de novo (caso D + E do
       diagnostico). O portao conta-sessao.js pergunta ao servidor antes.
       Aqui se prova o COMPORTAMENTO, com a pagina real montada.          */

    /* ---- K1 = TESTE A: sessao viva -> vai para conta.html sem pedir senha */
    {
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/me": { status: 200, corpo: { ok: true, autenticado: true, cliente: CLIENTE_SERVIDOR } },
      });
      await assentar();
      ok(janela.location.href === "conta.html",
        "1. TESTE A — com sessao viva, login.html vai direto para conta.html",
        "href = " + janela.location.href);
      ok(janela.location.__troca === "conta.html",
        "2. TESTE A — a ida e por location.replace (o 'voltar' nao traz o formulario de volta)");
      const meus = janela.fetch.chamadas.filter((c) => c.url === "/api/auth/me");
      ok(meus.length === 1, "3. TESTE A — perguntou ao SERVIDOR uma vez quem esta conectado",
        "GET /api/auth/me = " + meus.length);
      ok((meus[0].init.credentials || "") === "same-origin",
        "4. TESTE A — a pergunta leva o cookie (credentials: same-origin)");
      const envios = janela.fetch.chamadas.filter((c) => (c.init.method || "GET").toUpperCase() === "POST");
      ok(envios.length === 0, "5. TESTE A — NENHUM login foi enviado: nao pediu senha");
      /* o formulario nao pode ter sido lido nem preenchido por ninguem */
      ok(doc.body.querySelector("#formLogin") !== null,
        "6. TESTE A — o formulario existe no arquivo, so nao chega a ser usado");
      /* a classe anti-piscada sai do documento no desfecho */
      const raiz = doc.documentElement || doc.body.parentNode;
      ok(!raiz.classList.contains("sessao-conferindo"),
        "7. TESTE A — a classe anti-piscada sai (a tela nao fica escondida)");
      ok(janela.CONTA_SESSAO.estado() === "indo", "8. TESTE A — o portao registra estado 'indo'");
    }

    /* ---- K2 = TESTE A (a volta pela loja): 'Minha conta' nao reaparece ---- */
    {
      /* A pessoa: entrou, foi para conta.html, clicou "Voltar para a loja",
         e clicou em "Minha conta". O link leva a login.html — e o portao
         tem de resolver de novo. Duas aberturas seguidas provam que nao ha
         memoria escondida no navegador decidindo: o SERVIDOR decide.      */
      const resp = {
        "/api/auth/me": { status: 200, corpo: { ok: true, autenticado: true, cliente: CLIENTE_SERVIDOR } },
      };
      const a = abrirPagina("login.html", resp); await assentar();
      const b = abrirPagina("login.html", resp); await assentar();
      ok(a.janela.location.href === "conta.html" && b.janela.location.href === "conta.html",
        "9. TESTE A — ida e volta pela loja: 'Minha conta' cai em conta.html nas duas vezes",
        "1a = " + a.janela.location.href + " | 2a = " + b.janela.location.href);
      /* nenhum token foi guardado: quem lembra a pessoa e o cookie, no servidor */
      ok(!a.janela.localStorage.__chaves().length && !b.janela.localStorage.__chaves().length,
        "10. TESTE A — nada em localStorage (o servidor e a unica fonte)");
    }

    /* ---- K3 = TESTE B: recarregar a area continua conectada ------------- */
    {
      /* Recarregar = montar a pagina de novo com a mesma resposta do
         servidor. A sessao nao e consumida no primeiro uso.               */
      const resp = { "/api/auth/me": { status: 200, corpo: { ok: true, autenticado: true, cliente: CLIENTE_SERVIDOR } } };
      const p1 = abrirConta(resp); await assentar();
      const p2 = abrirConta(resp); await assentar();
      ok(p1.janela.CONTA_APP.estado.entrou === true && p2.janela.CONTA_APP.estado.entrou === true,
        "11. TESTE B — recarregar a area: continua conectada nas duas vezes");
      ok(!p1.doc.body.querySelector("#areaConta").classList.contains("oculto") &&
         !p2.doc.body.querySelector("#areaConta").classList.contains("oculto"),
        "12. TESTE B — a area aparece nas duas vezes (a sessao nao 'gasta')");
      /* e o portao, na pagina de acesso, tambem continua levando para a area */
      const g = abrirPagina("login.html", resp); await assentar();
      ok(g.janela.location.href === "conta.html",
        "13. TESTE B — depois de recarregar, 'Minha conta' ainda vai para conta.html",
        "href = " + g.janela.location.href);
    }

    /* ---- K4 = TESTE C: formato do cookie persistente -------------------- */
    {
      /* Nao basta LER o fonte: aqui o proprio serializador de cookie do
         servidor e EXECUTADO, e a data de expiracao que o login realmente
         grava e transformada em Max-Age. O que se mede e o numero de
         segundos que o NAVEGADOR vai guardar — e se ele cobre 30 dias.    */
      const RAIZ_SERVIDOR = path.join(RAIZ, "api", "_lib", "sessao.js");
      const S = require(RAIZ_SERVIDOR);
      ok(S.DIAS_PERSISTENTE === 30, "14. TESTE C — o servidor declara 30 dias",
        "DIAS_PERSISTENTE = " + S.DIAS_PERSISTENTE);
      ok(S.HORAS_PADRAO === 12, "15. TESTE C — sem 'Manter conectado' sao 12 horas",
        "HORAS_PADRAO = " + S.HORAS_PADRAO);

      /* 1) com "Manter conectado": a expiracao que o login grava */
      const agora = Date.now();
      const expPersistente = new Date(agora + S.DIAS_PERSISTENTE * 86400000).toISOString();
      const cP = S.serializarCookie("token-de-teste", expPersistente, true);
      const mP = /Max-Age=(\d+)/.exec(cP);
      ok(!!mP, "16. TESTE C — com 'Manter conectado' o cookie sai com Max-Age");
      const segundos = mP ? Number(mP[1]) : 0;
      const diasReais = segundos / 86400;
      ok(Math.abs(diasReais - 30) <= 0.01,
        "17. TESTE C — o Max-Age vale 30 dias de verdade (2592000 s)",
        "Max-Age=" + segundos + " s = " + diasReais.toFixed(2) + " dias");
      ok(/HttpOnly/.test(cP) && /SameSite=Lax/.test(cP) && /Path=\//.test(cP),
        "18. TESTE C — HttpOnly + SameSite=Lax + Path=/ no cookie persistente", cP);

      /* 2) SEM "Manter conectado": nenhum Max-Age -> morre ao fechar */
      const cS = S.serializarCookie("token-de-teste", new Date(agora + 12 * 3600000).toISOString(), false);
      ok(!/Max-Age/.test(cS),
        "19. TESTE C — sem 'Manter conectado' NAO ha Max-Age (sessao do navegador)", cS);

      /* 3) Secure: ligado em producao, desligado em desenvolvimento */
      const antes = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      ok(/; Secure/.test(S.serializarCookie("t", expPersistente, true)),
        "20. TESTE C — em producao (Vercel) o cookie leva Secure");
      process.env.NODE_ENV = "development";
      ok(!/Secure/.test(S.serializarCookie("t", expPersistente, true)),
        "21. TESTE C — em desenvolvimento nao leva Secure (http local)");
      if (antes === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = antes;

      /* 4) logout: o cookie sai expirado */
      ok(/Max-Age=0/.test(S.cookieDeSaida()),
        "22. TESTE C — o logout manda Max-Age=0 (o navegador apaga o cookie)", S.cookieDeSaida());
    }

    /* ---- K5 = TESTE D: sair da conta derruba a sessao de verdade -------- */
    {
      /* Depois de "Sair da conta", abrir login.html tem de mostrar o
         formulario DE NOVO — e nao ir para conta.html. A bancada da area
         prova que o sair chama o servidor; aqui se prova o EFEITO na
         proxima visita a pagina de acesso.                                */
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/me": { status: 401, corpo: { erro: "A sua sessão expirou. Entre de novo, por favor." } },
      });
      await assentar();
      ok(janela.location.href === "login.html",
        "23. TESTE D — sem sessao, login.html NAO redireciona (mostra o formulario)",
        "href = " + janela.location.href);
      ok(janela.CONTA_SESSAO.estado() === "livre", "24. TESTE D — o portao libera a pagina");
      const raiz = doc.documentElement || doc.body.parentNode;
      ok(!raiz.classList.contains("sessao-conferindo"),
        "25. TESTE D — a tela nunca fica presa escondida");
      ok(doc.body.querySelector("#formLogin") !== null,
        "26. TESTE D — o formulario esta la, pronto para o novo login");
    }

    /* ---- K6 = TESTE E: quem nao tem sessao consegue entrar ------------- */
    {
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/me": { status: 401, corpo: { erro: "A sua sessão expirou. Entre de novo, por favor." } },
        "/api/auth/login": { status: 200, corpo: { ok: true, cliente: CLIENTE_SERVIDOR } },
      });
      await assentar();
      const form = doc.body.querySelector("#formLogin");
      form.querySelector("[name=email]").value = "joana.ribeiro@exemplo.com";
      form.querySelector("[name=senha]").value = "SenhaBoa2024";
      form.querySelector("[name=manter]").checked = true;
      form.dispatch("submit");
      await assentar();
      ok(janela.location.href === "conta.html",
        "27. TESTE E — sem sessao, o login normal funciona e entra na area",
        "href = " + janela.location.href);
      const corpo = JSON.stringify((janela.fetch.chamadas.find((c) => c.url === "/api/auth/login") || {}).init || {});
      ok(corpo.indexOf("SenhaBoa2024") > -1,
        "28. TESTE E — a senha foi no corpo do POST (nao na URL)");
      ok(corpo.indexOf("manter") > -1,
        "29. TESTE E — 'Manter conectado' marcado vai junto para o servidor");
      ok(janela.localStorage.__chaves().length === 0,
        "30. TESTE E — a senha NAO foi guardada no navegador");
    }

    /* ---- K7: servidor fora do ar NAO pode virar 'deslogado' ------------ */
    {
      const { doc, janela } = abrirPagina("login.html", {
        "/api/auth/me": { status: 503, corpo: { erro: "Não foi possível falar com o banco agora." } },
      });
      await assentar();
      ok(janela.location.href === "login.html",
        "31. servidor com problema NAO manda para conta.html");
      ok(doc.body.querySelector("#formLogin") !== null,
        "32. servidor com problema mostra o formulario (unica tela possivel)");
      /* o ponto que importa: nada foi APAGADO. O portao nao chama /sair,
         nao limpa cookie, nao grava nada. Quando o banco voltar, a sessao
         continua viva no servidor.                                       */
      const mutantes = janela.fetch.chamadas.filter((c) => /sair|logout|redefinir/.test(c.url));
      ok(mutantes.length === 0, "33. servidor com problema NAO derruba a sessao de ninguem");
      const raiz = doc.documentElement || doc.body.parentNode;
      ok(!raiz.classList.contains("sessao-conferindo"),
        "34. servidor com problema nao deixa a tela presa escondida");
    }

    /* ---- K8 = CONTROLE NEGATIVO: o instrumento sabe reprovar ----------- */
    {
      /* Primeiro, a pagina de verdade: o portao esta la.                    */
      const original = ler("login.html");
      ok(original.indexOf("CONTA_SESSAO.conferir()") > -1,
        "35. CONTROLE — login.html chama o portao");
      /* Agora o MESMO aparato, com a chamada do portao arrancada. Se a
         prova continuar verde, ela nao esta medindo o portao — e as provas
         acima nao valeriam nada.                                            */
      const sabotada = abrirPagina("login.html", {
        "/api/auth/me": { status: 200, corpo: { ok: true, autenticado: true, cliente: CLIENTE_SERVIDOR } },
      }, (h) => h.replace("CONTA_SESSAO.conferir();", ";"));
      await assentar();
      ok(sabotada.janela.location.href === "login.html",
        "36. CONTROLE NEGATIVO — SEM o portao, login.html NAO sai do lugar",
        "href = " + sabotada.janela.location.href);
      /* ui.js busca o catálogo público (/api/loja/catalogo) em toda página;
         isso não é pergunta de sessão. Conta-se só o que fala de sessão.   */
      const deSessao = sabotada.janela.fetch.chamadas.filter((c) => /\/api\/(auth|cliente|conta)/.test(c.url));
      ok(deSessao.length === 0,
        "37. CONTROLE NEGATIVO — SEM o portao, ninguem pergunta ao servidor quem esta conectado",
        "chamadas de sessao = " + deSessao.length);

      /* E se conta-sessao.js nem CARREGAR? A classe anti-piscada ficaria
         presa e o formulario nunca apareceria — pior do que o defeito
         original. A rede de seguranca tira a classe. Prova-se sabotando o
         carregamento do arquivo.                                          */
      const semArquivo = abrirPagina("login.html", {}, (h) =>
        h.replace('<script src="assets/js/conta-sessao.js"></script>', ""));
      await assentar();
      const raizS = semArquivo.doc.documentElement || semArquivo.doc.body.parentNode;
      ok(semArquivo.janela.CONTA_SESSAO === undefined,
        "38. CONTROLE NEGATIVO — com o arquivo ausente, CONTA_SESSAO nao existe");
      /* A classe e ADICIONADA pela linha inline do <head>. Sem esta prova,
         "a classe nao esta la" poderia significar so que ela nunca chegou a
         ser posta — e a prova de baixo passaria por motivo errado.        */
      ok(ler("login.html").indexOf('className += " sessao-conferindo"') > -1,
        "39. a classe anti-piscada E adicionada pela pagina (a ausencia de baixo e remocao, nao omissao)");
      ok(!raizS.classList.contains("sessao-conferindo"),
        "40. REDE DE SEGURANCA — sem o arquivo, a classe foi REMOVIDA (a tela nao fica presa)");
      ok(semArquivo.doc.body.querySelector("#formLogin") !== null,
        "41. REDE DE SEGURANCA — o formulario aparece (a pagina nao fica em branco)");
    }
  }

  console.log("\n" + "=".repeat(52));
  console.log(falhas === 0
    ? "APROVADO — " + provas + " provas, 0 falhas"
    : "REPROVADO — " + provas + " provas, " + falhas + " falha(s)");
  console.log("=".repeat(52));
  console.log("\nLIMITE DECLARADO: esta bancada prova o FRONTEND diante de respostas");
  console.log("de um duble de /api. Ela NAO prova que o servidor responde assim: isso");
  console.log("e o que fazem bancada-auth.js (com banco dublê) e, no fim, o Neon real.");

  process.exit(falhas === 0 ? 0 : 1);
})();

function secoes(t) { console.log("\n== " + t + " =="); }
