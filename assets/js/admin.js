/* ==========================================================================
   assets/js/admin.js — painel da Preta Chik (proprietária e atendentes)
   --------------------------------------------------------------------------
   Fala SOMENTE com /api/admin/* (api/admin.js é o contrato). Nada de dado
   de demonstração: lista vazia mostra estado vazio honesto.

   Organização:
     1. constantes            7. dashboard          13. cupons
     2. utilidades            8. atendimento        14. entregas
     3. API                   9. pedidos            15. relatórios
     4. avisos/estados       10. produtos/categorias 16. configurações
     5. formulários/diálogo  11. estoque            17. equipe
     6. sessão/rotas         12. clientes/financeiro 18. início

   Dinheiro: sempre centavos inteiros. Texto de usuário: sempre esc().
   ========================================================================== */
(() => {
  "use strict";

  /* ============================================================ 1. constantes */
  const API = "/api/admin/";
  const TZ = "America/Recife";

  const STATUS_AT = {
    aguardando_atendimento: "Aguardando atendimento",
    em_atendimento: "Em atendimento",
    aguardando_confirmacao: "Aguardando confirmação",
    aguardando_pagamento: "Aguardando pagamento",
    pago: "Pago",
    em_separacao: "Em separação",
    enviado: "Enviado",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  const STATUS_PED = {
    aguardando_pagamento: "Aguardando pagamento",
    pago: "Pago",
    em_separacao: "Em separação",
    enviado: "Enviado",
    entregue: "Entregue",
    concluido: "Concluído",
    cancelado: "Cancelado",
    reembolsado: "Reembolsado",
  };
  const STATUS_PAG = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", estornado: "Estornado", cancelado: "Cancelado" };
  const METODOS = {
    pix: "Pix", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito",
    link: "Link de pagamento", dinheiro: "Dinheiro", transferencia: "Transferência",
  };
  const CANAIS = { site: "Site", atendimento: "Atendimento" };
  const TIPOS_FRETE = { melhorenvio: "Transportadora (Melhor Envio)", retirada: "Retirada na loja", local: "Entrega local", manual: "Frete combinado" };
  const PAPEIS = { proprietaria: "Proprietária", atendente: "Atendente" };
  const TIPOS_CUPOM = { percent: "Percentual", fixed: "Valor fixo", frete: "Frete grátis" };
  const EVENTOS = {
    criado: "Criado", status: "Status", itens: "Peças alteradas", valores: "Valores e entrega",
    nota: "Nota interna", assumido: "Atendimento assumido", pedido: "Pedido gerado",
    pagamento: "Pagamento registrado", envio: "Envio / rastreio", etiqueta: "Etiqueta gerada", frete: "Frete",
  };
  const TOM = {
    aguardando_atendimento: "alerta", em_atendimento: "rosa", aguardando_confirmacao: "alerta",
    aguardando_pagamento: "alerta", pago: "ok", em_separacao: "info", enviado: "info",
    entregue: "ok", concluido: "ok", cancelado: "neutro", reembolsado: "perigo",
  };
  const TOM_PAG = { pendente: "alerta", aprovado: "ok", recusado: "perigo", estornado: "perigo", cancelado: "neutro" };

  /* Estado da sessão. */
  const S = { equipe: null, permissoes: [], catalogo: null, categorias: null, focar: false };
  let geracao = 0; // muda a cada troca de tela: respostas atrasadas são descartadas
  let seq = 0;

  /* ============================================================ 2. utilidades */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const enc = encodeURIComponent;

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  /* null = sem preço cadastrado = "sob consulta" */
  function brl(c) { return c == null || c === "" || !isFinite(Number(c)) ? "sob consulta" : fmtBRL.format(Number(c) / 100); }
  /* somatórios: nulo conta como zero */
  function brl0(c) { return fmtBRL.format((Number(c) || 0) / 100); }
  function paraCampo(c) { return c == null || c === "" ? "" : (Number(c) / 100).toFixed(2).replace(".", ","); }
  /* "129,90" | "1.299,90" | "129.9" | "129" -> centavos; "" -> null; inválido -> NaN */
  function paraCentavos(v) {
    let s = String(v == null ? "" : v).trim().replace(/[R$\s]/g, "");
    if (!s) return null;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (!/^\d+(\.\d{1,2})?$/.test(s)) s = s.replace(/\./g, "");
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }

  const fDH = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fD = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const fISO = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  function dataHora(v) { if (!v) return "—"; const d = new Date(v); return isNaN(d) ? "—" : fDH.format(d); }
  function dataCurta(v) { if (!v) return "—"; const d = new Date(v); return isNaN(d) ? "—" : fD.format(d); }
  function isoRecife(v) { if (!v) return ""; const d = new Date(v); return isNaN(d) ? "" : fISO.format(d); }
  function hojeMais(dias) { return fISO.format(new Date(Date.now() + dias * 864e5)); }
  function diaBR(iso) { const p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || ""); }

  function digitos(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
  function fone(v) {
    const d = digitos(v);
    if (!d) return "—";
    const n = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
    if (n.length === 11) return "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
    if (n.length === 10) return "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6);
    return d;
  }
  function linkWa(v) { const d = digitos(v); return d.length < 10 ? "" : "https://wa.me/" + (d.length <= 11 ? "55" + d : d); }
  function cepFmt(v) { const d = digitos(v); return d.length === 8 ? d.slice(0, 5) + "-" + d.slice(5) : d; }
  function urlSegura(u) { return /^https:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function prazoTxt(p) {
    if (p == null || p === "") return "";
    return /^\d+$/.test(String(p)) ? p + (Number(p) === 1 ? " dia útil" : " dias úteis") : String(p);
  }
  function estoqueTxt(s) { return s == null ? "não controlado" : Number(s) === 0 ? "esgotado" : s + " em estoque"; }
  function rotStatus(s) { return STATUS_PED[s] || STATUS_AT[s] || s || "—"; }
  function plural(n, um, varios) { return n + " " + (Number(n) === 1 ? um : varios); }

  function tag(txt, tom) { return `<span class="tag tag--${tom || "neutro"}">${esc(txt)}</span>`; }
  const tagAt = (s) => tag(STATUS_AT[s] || s || "—", TOM[s]);
  const tagPed = (s) => tag(STATUS_PED[s] || s || "—", TOM[s]);
  const tagPag = (s) => tag("Pagamento " + String(STATUS_PAG[s] || s || "—").toLowerCase(), TOM_PAG[s]);

  function hashCom(base, q) {
    const p = new URLSearchParams();
    Object.keys(q || {}).forEach((k) => { if (q[k] !== "" && q[k] != null) p.set(k, q[k]); });
    const s = p.toString();
    return "#" + base + (s ? "?" + s : "");
  }
  function irPara(h) { if (location.hash === h) rotear(); else location.hash = h; }

  function opcoes(mapa, atual, vazioRot) {
    const lista = (vazioRot != null ? [["", vazioRot]] : []).concat(Object.keys(mapa).map((k) => [k, mapa[k]]));
    return lista.map((o) => `<option value="${esc(o[0])}"${String(o[0]) === String(atual == null ? "" : atual) ? " selected" : ""}>${esc(o[1])}</option>`).join("");
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
      const t = document.createElement("textarea");
      t.value = texto; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      (document.querySelector("dialog[open]") || document.body).appendChild(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (x) { ok = false; }
      t.remove();
      return ok;
    }
  }

  /* ============================================================ 3. API */
  function falha(msg, status, campo, dados) {
    const e = new Error(msg);
    e.status = status; e.campo = campo || null; e.dados = dados || null;
    return e;
  }
  const erroCampo = (msg, campo) => falha(msg, 400, campo);

  async function api(metodo, caminho, corpo, o) {
    o = o || {};
    const init = { method: metodo, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (corpo !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(corpo); }
    let r;
    try { r = await fetch(API + caminho, init); }
    catch (e) { throw falha("Sem conexão com o servidor. Confira a internet e tente de novo.", 0); }
    const txt = await r.text().catch(() => "");
    let d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; }
    if (r.ok && d && typeof d === "object") return d;
    let msg = d && d.erro;
    if (!msg) {
      msg = r.status === 404
        ? "A API do painel não respondeu (erro 404). Ela só funciona com o site publicado na Vercel (ou rodando com vercel dev)."
        : r.ok ? "O servidor devolveu uma resposta inesperada." : "O servidor respondeu com erro " + r.status + ".";
    }
    const e = falha(msg, r.status, d && d.campo, d);
    if (r.status === 401 && !o.semRedirecionar) sessaoExpirada(msg);
    throw e;
  }

  async function garantirCatalogo(forcar) {
    if (S.catalogo && !forcar) return S.catalogo;
    const d = await api("GET", "produtos");
    S.catalogo = d.produtos || [];
    return S.catalogo;
  }
  async function garantirCategorias(forcar) {
    if (S.categorias && !forcar) return S.categorias;
    const d = await api("GET", "categorias");
    S.categorias = d.categorias || [];
    return S.categorias;
  }

  /* ============================================================ 4. avisos e estados */
  function aviso(msg, tipo) {
    const urgente = tipo === "erro";
    const box = $(urgente ? "#avisos-urgente" : "#avisos-educado");
    const el = document.createElement("div");
    el.className = "aviso aviso--" + (tipo || "ok");
    el.innerHTML = `<p>${esc(msg)}</p><button type="button" class="aviso-fechar" aria-label="Fechar aviso">×</button>`;
    el.querySelector("button").addEventListener("click", () => el.remove());
    box.appendChild(el);
    setTimeout(() => el.remove(), urgente ? 10000 : 5000);
  }

  const carregando = (t) => `<div class="estado" role="status"><span class="girar" aria-hidden="true"></span><span>${esc(t || "Carregando…")}</span></div>`;
  const vazio = (t, extra) => `<div class="vazio"><p>${esc(t)}</p>${extra || ""}</div>`;

  /* Carrega dados para um bloco com estado de carregando / erro / tentar de novo. */
  function carregar(alvo, buscar, desenhar) {
    const g = geracao;
    alvo.innerHTML = carregando();
    alvo.setAttribute("aria-busy", "true");
    return Promise.resolve().then(buscar).then((d) => {
      if (g !== geracao || !alvo.isConnected) return;
      alvo.removeAttribute("aria-busy");
      desenhar(d, alvo);
    }).catch((e) => {
      if (g !== geracao || !alvo.isConnected) return;
      alvo.removeAttribute("aria-busy");
      if (e && e.status === 401) { alvo.innerHTML = ""; return; }
      if (!(e && "status" in e)) console.error(e);
      const restrito = e && e.status === 403;
      alvo.innerHTML = `<div class="erro-bloco" role="alert"><p><strong>${restrito ? "Acesso restrito." : "Não foi possível carregar."}</strong> ${esc(e && e.message)}</p>${restrito ? "" : '<button type="button" class="btn btn--vazio btn--peq">Tentar de novo</button>'}</div>`;
      const b = alvo.querySelector("button");
      if (b) b.addEventListener("click", () => carregar(alvo, buscar, desenhar));
    });
  }

  function cabecalho(titulo, sub, acoes) {
    return `<header class="pag-topo"><div><h1 class="pag-titulo">${esc(titulo)}</h1>${sub ? `<p class="pag-sub">${esc(sub)}</p>` : ""}</div>${acoes ? `<div class="pag-acoes">${acoes}</div>` : ""}</header>`;
  }

  function tabela(cols, linhas, legenda, cls) {
    return `<div class="tabela-envolve"><table class="tabela${cls ? " " + cls : ""}">${legenda ? `<caption class="so-leitor">${esc(legenda)}</caption>` : ""}<thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((cel, i) => `<td data-rotulo="${esc(cols[i])}">${cel == null || cel === "" ? "—" : cel}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function chips(rotulo, itens, atual, attr) {
    return `<div class="chips" role="group" aria-label="${esc(rotulo)}">${itens.map((i) => `<button type="button" class="chip" ${attr}="${esc(i[0])}" aria-pressed="${String(i[0]) === String(atual || "") ? "true" : "false"}">${esc(i[1])}</button>`).join("")}</div>`;
  }

  /* ============================================================ 5. formulários e diálogo */
  function campo(rot, nome, o) {
    o = o || {};
    const id = "c" + (++seq);
    const aj = o.ajuda ? `<p class="ajuda" id="${id}-a">${esc(o.ajuda)}</p>` : "";
    const attrs = `id="${id}" name="${esc(nome)}"${o.ajuda ? ` aria-describedby="${id}-a"` : ""}${o.req ? " required" : ""}${o.attrs ? " " + o.attrs : ""}`;
    const val = o.valor == null ? "" : o.valor;
    if (o.tipo === "checkbox") {
      return `<div class="campo campo--caixa${o.cls ? " " + o.cls : ""}"><label class="caixa" for="${id}"><input type="checkbox" ${attrs}${o.valor ? " checked" : ""}> <span>${esc(rot)}</span></label>${aj}</div>`;
    }
    let ctrl;
    if (o.tipo === "select") ctrl = `<select class="entrada" ${attrs}>${o.opcoes}</select>`;
    else if (o.tipo === "textarea") ctrl = `<textarea class="entrada" ${attrs} rows="${o.linhas || 3}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}>${esc(val)}</textarea>`;
    else ctrl = `<input class="entrada" type="${o.tipo || "text"}" ${attrs} value="${esc(val)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}>`;
    return `<div class="campo${o.cls ? " " + o.cls : ""}"><label class="rotulo" for="${id}">${esc(rot)}${o.req ? ' <span class="obrig" aria-hidden="true">*</span>' : ""}</label>${ctrl}${aj}</div>`;
  }
  /* Campo de dinheiro (texto com teclado decimal). */
  function campoReais(rot, nome, centavos, o) {
    o = o || {};
    return campo(rot, nome, Object.assign({}, o, { valor: o.texto != null ? o.texto : paraCampo(centavos), attrs: 'inputmode="decimal" autocomplete="off"' + (o.attrs ? " " + o.attrs : ""), ph: o.ph || "0,00" }));
  }

  function dadosForm(form) {
    const o = {};
    Array.from(form.elements).forEach((i) => {
      if (!i.name || i.disabled || i.type === "submit" || i.type === "button") return;
      if (i.type === "checkbox") o[i.name] = i.checked;
      else if (i.type === "radio") { if (i.checked) o[i.name] = i.value; }
      else o[i.name] = typeof i.value === "string" ? i.value.trim() : i.value;
    });
    return o;
  }

  function marcarCampo(c, msg) {
    if (!c.id) c.id = "c" + (++seq);
    const id = c.id + "-erro";
    c.classList.add("entrada--erro");
    c.setAttribute("aria-invalid", "true");
    const p = document.createElement("p");
    p.className = "erro-campo"; p.id = id; p.textContent = msg;
    (c.closest(".campo") || c.parentNode).appendChild(p);
    c.setAttribute("aria-describedby", ((c.getAttribute("aria-describedby") || "") + " " + id).trim());
  }
  function limparErros(form) {
    $$(".erro-campo", form).forEach((p) => p.remove());
    $$("[aria-invalid]", form).forEach((c) => {
      c.removeAttribute("aria-invalid");
      c.classList.remove("entrada--erro");
      const ids = (c.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && !/-erro$/.test(x));
      if (ids.length) c.setAttribute("aria-describedby", ids.join(" ")); else c.removeAttribute("aria-describedby");
    });
    const g = $(".erro-geral", form);
    if (g) { g.hidden = true; g.textContent = ""; }
  }
  function mostrarErro(form, e) {
    if (!e || e.cancelado || e.status === 401) return;
    if (!("status" in e)) console.error(e);
    const c = e.campo && form ? form.querySelector(`[name="${String(e.campo).replace(/["\\]/g, "")}"]`) : null;
    if (c) { marcarCampo(c, e.message); c.focus(); return; }
    const g = form && $(".erro-geral", form);
    if (g) { g.hidden = false; g.textContent = e.message; return; }
    aviso(e.message, "erro");
  }

  function aoEnviar(form, fn) {
    if (!form) return;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (form.dataset.ocupado) return;
      limparErros(form);
      const bt = form.querySelector('[type="submit"]');
      form.dataset.ocupado = "1";
      form.setAttribute("aria-busy", "true");
      if (bt) { bt.disabled = true; bt.classList.add("ocupado"); }
      try { await fn(dadosForm(form), form); }
      catch (e) { mostrarErro(form, e); }
      finally {
        delete form.dataset.ocupado;
        form.removeAttribute("aria-busy");
        if (bt && bt.isConnected) { bt.disabled = false; bt.classList.remove("ocupado"); }
      }
    });
  }

  /* Botão de ação simples: trava enquanto roda, erro vira aviso. */
  async function executar(bt, fn) {
    if (bt && bt.disabled) return;
    if (bt) { bt.disabled = true; bt.classList.add("ocupado"); }
    try { return await fn(); }
    catch (e) { if (e && !e.cancelado && e.status !== 401) { if (!("status" in e)) console.error(e); aviso(e.message, "erro"); } }
    finally { if (bt && bt.isConnected) { bt.disabled = false; bt.classList.remove("ocupado"); } }
  }

  /* Diálogo modal único. aoConfirmar(dados, corpo) -> Promise; erro aparece dentro do diálogo. */
  let dlg = null;
  function dialogo(o) {
    const el = $("#dialogo");
    if (el.open) el.close();
    dlg = { o, retorno: document.activeElement };
    const form = $("#dialogo-form");
    limparErros(form);
    $("#dialogo-titulo").textContent = o.titulo;
    $("#dialogo-corpo").innerHTML = o.corpo || "";
    const ok = $("#dialogo-ok");
    ok.textContent = o.ok || "Confirmar";
    ok.className = "btn" + (o.perigo ? " btn--perigo" : "");
    ok.hidden = !!o.somenteFechar;
    ok.disabled = false;
    $("#dialogo-cancelar").textContent = o.somenteFechar ? "Fechar" : "Cancelar";
    el.classList.toggle("dialogo--largo", !!o.largo);
    if (typeof el.showModal === "function") el.showModal(); else el.setAttribute("open", "");
    if (o.aoAbrir) o.aoAbrir($("#dialogo-corpo"));
    const primeiro = $("#dialogo-corpo").querySelector("input:not([type=hidden]):not([readonly]):not([type=radio]),select,textarea:not([readonly])");
    (primeiro || (o.somenteFechar ? $("#dialogo-cancelar") : ok)).focus();
  }
  function fecharDialogo() {
    const el = $("#dialogo");
    if (el.open) { if (typeof el.close === "function") el.close(); else el.removeAttribute("open"); }
  }
  function ligarDialogo() {
    const el = $("#dialogo"), form = $("#dialogo-form");
    $$("[data-fechar]", el).forEach((b) => b.addEventListener("click", fecharDialogo));
    el.addEventListener("close", () => {
      const r = dlg && dlg.retorno;
      dlg = null;
      $("#dialogo-corpo").innerHTML = "";
      if (r && r.isConnected && typeof r.focus === "function") r.focus();
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!dlg || form.dataset.ocupado) return;
      if (dlg.o.somenteFechar) { fecharDialogo(); return; }
      limparErros(form);
      const ok = $("#dialogo-ok");
      form.dataset.ocupado = "1"; ok.disabled = true; ok.classList.add("ocupado");
      const atual = dlg;
      try {
        if (atual.o.aoConfirmar) await atual.o.aoConfirmar(dadosForm(form), $("#dialogo-corpo"));
        if (dlg === atual) fecharDialogo();
      } catch (e) {
        if (dlg === atual) mostrarErro(form, e);
      } finally {
        delete form.dataset.ocupado; ok.disabled = false; ok.classList.remove("ocupado");
      }
    });
  }

  /* ============================================================ 6. sessão e rotas */
  function pode(rec) {
    const p = S.permissoes || [];
    if (p.indexOf("*") > -1 || p.indexOf(rec) > -1) return true;
    return rec === "produtos:ler" && p.indexOf("produtos") > -1;
  }
  const souDona = () => pode("*") || (S.permissoes || []).indexOf("*") > -1;

  const MODULOS = [
    { id: "dashboard", nome: "Dashboard", rec: "dashboard", tela: telaDashboard, ic: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" },
    { id: "atendimento", nome: "Atendimento", rec: "atendimento", tela: telaAtendimento, ic: "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-5A8 8 0 1 1 21 12z" },
    { id: "pedidos", nome: "Pedidos", rec: "pedidos", tela: telaPedidos, ic: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" },
    { id: "produtos", nome: "Produtos", rec: "produtos:ler", tela: telaProdutos, ic: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01" },
    { id: "categorias", nome: "Categorias", rec: "produtos:ler", tela: telaCategorias, ic: "M3 6h7l2 2h9v11H3z" },
    { id: "estoque", nome: "Estoque", rec: "estoque", tela: telaEstoque, ic: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" },
    { id: "clientes", nome: "Clientes", rec: "clientes", tela: telaClientes, ic: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
    { id: "financeiro", nome: "Financeiro", rec: "financeiro", tela: telaFinanceiro, ic: "M3 6h18v12H3zM3 10h18M7 15h4" },
    { id: "cupons", nome: "Cupons", rec: "cupons", tela: telaCupons, ic: "M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14 7v10" },
    { id: "entregas", nome: "Entregas", rec: "entregas", tela: telaEntregas, ic: "M1 6h13v10H1zM14 10h4l3 3v3h-7M5.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" },
    { id: "relatorios", nome: "Relatórios", rec: "relatorios", tela: telaRelatorios, ic: "M4 20V11M10 20V4M16 20v-7M22 20H2" },
    { id: "configuracoes", nome: "Configurações", rec: "config", tela: telaConfig, ic: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" },
    { id: "equipe", nome: "Equipe", rec: "equipe", tela: telaEquipe, ic: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
  ];

  function mostrarTela(qual) {
    $("#tela-carregando").hidden = qual !== "carregando";
    $("#tela-entrada").hidden = qual !== "entrada";
    $("#tela-painel").hidden = qual !== "painel";
  }

  function alertaEntrada(msg) {
    const a = $("#entrada-alerta");
    a.hidden = !msg;
    a.textContent = msg || "";
  }

  function mostrarLogin(msg) {
    mostrarTela("entrada");
    $("#form-login").hidden = false;
    $("#form-setup").hidden = true;
    $("#setup-desativado").hidden = true;
    alertaEntrada(msg || "");
    document.title = "Entrar · Painel Preta Chik";
  }

  function entrarNoPainel(d) {
    S.equipe = d.equipe;
    S.permissoes = d.permissoes || [];
    S.catalogo = null; S.categorias = null;
    $("#usuario-nome").textContent = S.equipe.nome || S.equipe.email || "";
    $("#usuario-papel").textContent = PAPEIS[S.equipe.papel] || S.equipe.papel || "";
    $("#menu-lista").innerHTML = MODULOS.filter((m) => pode(m.rec)).map((m) =>
      `<li><a href="#${m.id}" data-mod="${m.id}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${m.ic}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${esc(m.nome)}</span></a></li>`).join("");
    mostrarTela("painel");
    S.focar = false;
    rotear();
  }

  function sessaoExpirada(msg) {
    if (!S.equipe) return;
    S.equipe = null; S.permissoes = []; S.catalogo = null; S.categorias = null;
    geracao++;
    fecharDialogo();
    $("#conteudo").innerHTML = "";
    mostrarLogin(msg || "Sua sessão terminou. Entre de novo.");
  }

  async function verificarPrimeiroAcesso(silencioso) {
    try {
      const d = await api("GET", "configurar-inicial", undefined, { semRedirecionar: true });
      if (!d.precisa) return;
      $("#form-login").hidden = true;
      if (d.habilitado) { $("#form-setup").hidden = false; $("#setup-token").focus(); }
      else $("#setup-desativado").hidden = false;
    } catch (e) {
      if (!silencioso) alertaEntrada(e.message);
    }
  }

  function abrirMenu() {
    document.body.classList.add("menu-aberto");
    $("#bt-menu").setAttribute("aria-expanded", "true");
    $("#menu-fundo").hidden = false;
    const a = $("#menu-lista a[aria-current]") || $("#menu-lista a");
    if (a) a.focus();
  }
  function fecharMenu(devolverFoco) {
    if (!document.body.classList.contains("menu-aberto")) return;
    document.body.classList.remove("menu-aberto");
    $("#bt-menu").setAttribute("aria-expanded", "false");
    $("#menu-fundo").hidden = true;
    if (devolverFoco) $("#bt-menu").focus();
  }

  function rotear() {
    if (!S.equipe) return;
    const bruto = location.hash.replace(/^#\/?/, "");
    const i = bruto.indexOf("?");
    const caminho = i > -1 ? bruto.slice(0, i) : bruto;
    const busca = i > -1 ? bruto.slice(i + 1) : "";
    const partes = caminho.split("/").filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    const q = {};
    new URLSearchParams(busca).forEach((v, k) => { q[k] = v; });
    let mod = MODULOS.find((m) => m.id === partes[0]);
    if (!partes[0]) {
      mod = MODULOS.find((m) => pode(m.rec));
      if (mod) history.replaceState(null, "", "#" + mod.id);
    }
    geracao++;
    fecharMenu();
    fecharDialogo();
    const el = $("#conteudo");
    $$("#menu-lista a").forEach((a) => { if (mod && a.dataset.mod === mod.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (!mod) {
      el.innerHTML = cabecalho("Página não encontrada") + vazio("Este endereço não existe no painel.", '<a class="btn" href="#">Ir para o início</a>');
    } else if (!pode(mod.rec)) {
      el.innerHTML = cabecalho(mod.nome) + `<div class="erro-bloco" role="alert"><p><strong>Acesso restrito.</strong> Seu perfil (${esc(PAPEIS[S.equipe.papel] || S.equipe.papel)}) não tem acesso a esta área.</p></div>`;
    } else {
      document.title = mod.nome + " · Painel Preta Chik";
      el.innerHTML = "";
      try { mod.tela(el, partes.slice(1), q); }
      catch (e) { console.error(e); el.innerHTML = `<div class="erro-bloco" role="alert"><p>${esc(e.message)}</p></div>`; }
    }
    if (S.focar) el.focus({ preventScroll: true });
    S.focar = true;
    window.scrollTo(0, 0);
  }

  /* Linha do tempo de eventos (atendimento e pedido). */
  function descreverEvento(ev) {
    let d = ev.detail || {};
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = { texto: d }; } }
    const p = [];
    switch (ev.kind) {
      case "status":
        p.push((d.de ? rotStatus(d.de) + " → " : "") + rotStatus(d.para));
        if (d.motivo) p.push("Motivo: " + d.motivo);
        if (d.via) p.push("Via " + d.via);
        if (d.referencia) p.push("Referência: " + d.referencia);
        if (d.pagamento) p.push("Pagamento: " + d.pagamento);
        break;
      case "itens":
        if (Array.isArray(d.antes)) p.push("Antes: " + (d.antes.join(", ") || "—"));
        if (Array.isArray(d.depois)) p.push("Depois: " + (d.depois.join(", ") || "—"));
        if ("subtotal" in d) p.push("Subtotal: " + brl(d.subtotal));
        break;
      case "valores":
        p.push("Desconto: " + brl0(d.desconto) + (d.cupom ? " (cupom " + d.cupom + ")" : ""));
        p.push("Entrega: " + (d.entrega || "não definida") + (d.frete != null ? " · " + brl(d.frete) : ""));
        break;
      case "nota": p.push(d.texto || ""); break;
      case "assumido": p.push("Por " + (d.por || "—")); break;
      case "pedido": p.push("Pedido " + (d.pedido || "") + (d.total != null ? " · " + brl(d.total) : "")); break;
      case "criado":
        if (d.origem) p.push("Origem: " + d.origem);
        if (d.itens != null) p.push(plural(d.itens, "peça", "peças"));
        if (d.canal) p.push("Canal: " + (CANAIS[d.canal] || d.canal));
        if (d.atendimento) p.push("Atendimento " + d.atendimento);
        break;
      case "pagamento":
        p.push((METODOS[d.metodo] || d.metodo || "") + (d.valor != null ? " · " + brl(d.valor) : ""));
        if (d.referencia) p.push("Referência: " + d.referencia);
        if (d.totalPago != null) p.push("Total pago até aqui: " + brl(d.totalPago));
        if (d.manual) p.push("Registro manual da equipe");
        break;
      case "envio": if (d.rastreio) p.push("Rastreio: " + d.rastreio); break;
      case "etiqueta": if (d.etiquetaId) p.push("Etiqueta " + d.etiquetaId); break;
      default:
        Object.keys(d).forEach((k) => { const v = d[k]; if (v != null && typeof v !== "object") p.push(k + ": " + v); });
    }
    return { linhas: p, url: ev.kind === "etiqueta" ? urlSegura(d.urlImpressao) : "" };
  }
  function linhaTempo(eventos) {
    if (!eventos || !eventos.length) return vazio("Nenhum evento registrado ainda.");
    return `<ol class="tempo">${eventos.slice().reverse().map((ev) => {
      const r = descreverEvento(ev);
      return `<li class="tempo-item tempo-item--${esc(ev.kind)}"><p class="tempo-cab"><strong>${esc(EVENTOS[ev.kind] || ev.kind)}</strong> <time datetime="${esc(ev.created_at)}">${esc(dataHora(ev.created_at))}</time>${ev.staff_nome ? ` · ${esc(ev.staff_nome)}` : ""}</p>${r.linhas.filter(Boolean).map((l) => `<p class="tempo-txt">${esc(l)}</p>`).join("")}${r.url ? `<p><a href="${esc(r.url)}" target="_blank" rel="noopener">Imprimir etiqueta</a></p>` : ""}</li>`;
    }).join("")}</ol><p class="texto-peq">Mais recentes primeiro.</p>`;
  }

  /* ============================================================ 7. dashboard */
  function numCartao(rot, valor, href, cls, sub) {
    const dentro = `<span class="num-rot">${esc(rot)}</span><span class="num-valor">${esc(valor)}</span>${sub ? `<span class="num-sub">${esc(sub)}</span>` : ""}`;
    return href ? `<a class="num-cartao ${cls || ""}" href="${esc(href)}">${dentro}</a>` : `<div class="num-cartao ${cls || ""}">${dentro}</div>`;
  }

  function blocoIntegracoes(integ) {
    const pg = (integ && integ.pagamento) || {};
    const fr = (integ && integ.frete) || {};
    const me = fr.melhorEnvio || {};
    return `<ul class="lista-integ">
      <li><span class="integ-nome">Plataforma de pagamento</span>${pg.configurado ? tag("Ativa" + (pg.provedor ? " · " + pg.provedor : ""), "ok") : tag("não configurado", "alerta")}<p class="texto-peq">${esc(pg.observacao || "")}</p></li>
      <li><span class="integ-nome">Melhor Envio (frete e etiquetas)</span>${me.configurado ? tag("Configurado · " + (me.ambiente === "producao" ? "produção" : "sandbox (testes)"), "ok") : tag("não configurado", "alerta")}<p class="texto-peq">${me.configurado ? (me.webhookAssinado ? "Webhook com assinatura conferida." : "Webhook sem segredo (MELHORENVIO_WEBHOOK_SECRET não definido).") : "Sem token, o frete automático fica indisponível e o frete é combinado no atendimento."}</p></li>
      <li><span class="integ-nome">Correios direto</span>${tag("não configurado", "neutro")}<p class="texto-peq">${esc((fr.correiosDireto && fr.correiosDireto.observacao) || "")}</p></li>
    </ul>`;
  }

  function telaDashboard(el) {
    el.innerHTML = cabecalho("Dashboard", "Como a loja está agora") + '<div id="dash"></div>';
    carregar($("#dash", el), () => api("GET", "dashboard"), (d, alvo) => {
      const at = d.atendimentos || {}, pd = d.pedidos || {}, v = d.vendas || {};
      const fila = d.filaAtendimento || [], baixo = d.estoqueBaixo || [];
      const aguard = at.aguardando_atendimento || 0;
      alvo.innerHTML = `
        <section class="grade-num" aria-label="Atendimento e vendas">
          ${numCartao("Aguardando atendimento", aguard, pode("atendimento") ? "#atendimento?status=aguardando_atendimento" : "", aguard > 0 ? "num-cartao--destaque" : "")}
          ${numCartao("Em atendimento", at.em_atendimento || 0, pode("atendimento") ? "#atendimento?status=em_atendimento" : "")}
          ${numCartao("Vendas hoje", brl0(v.hoje), "")}
          ${numCartao("Últimos 7 dias", brl0(v.d7), "")}
          ${numCartao("Últimos 30 dias", brl0(v.d30), "", "", plural(v.pedidos30 || 0, "pedido pago", "pedidos pagos"))}
        </section>
        <p class="texto-peq nota-baixa">Vendas somam apenas pedidos com pagamento aprovado.</p>
        <div class="grade-2">
          <section class="cartao" aria-labelledby="h-fila">
            <div class="cartao-topo"><h2 id="h-fila">Fila de atendimento</h2>${pode("atendimento") ? '<a class="lk-sutil" href="#atendimento">Ver todos</a>' : ""}</div>
            ${fila.length ? `<ul class="lista-links">${fila.map((f) => `<li><a href="#atendimento/${enc(f.id)}"><span class="ll-tit"><strong>${esc(f.code)}</strong> · ${esc(f.name || "Sem nome")}</span><span class="ll-meta">${tagAt(f.status)} <span>${esc(dataHora(f.created_at))}</span> <span>${esc(brl(f.subtotal_cents))}</span></span></a></li>`).join("")}</ul>`
              : vazio("Ninguém aguardando. Quando uma cliente pedir atendimento pelo site, a solicitação aparece aqui.")}
          </section>
          <section class="cartao" aria-labelledby="h-ped">
            <div class="cartao-topo"><h2 id="h-ped">Pedidos por status</h2>${pode("pedidos") ? '<a class="lk-sutil" href="#pedidos">Ver pedidos</a>' : ""}</div>
            <ul class="lista-status">${Object.keys(STATUS_PED).map((k) => `<li>${pode("pedidos") ? `<a href="#pedidos?status=${k}">` : "<span>"}${tagPed(k)}<strong>${pd[k] || 0}</strong>${pode("pedidos") ? "</a>" : "</span>"}</li>`).join("")}</ul>
          </section>
          <section class="cartao" aria-labelledby="h-baixo">
            <div class="cartao-topo"><h2 id="h-baixo">Estoque baixo</h2>${pode("estoque") ? '<a class="lk-sutil" href="#estoque?filtro=baixo">Abrir estoque</a>' : ""}</div>
            ${baixo.length ? `<ul class="lista-simples">${baixo.map((b) => `<li><span>${esc(b.name)} · Tam. ${esc(b.size)}${b.color ? " · " + esc(b.color) : ""}</span>${Number(b.stock) === 0 ? tag("esgotado", "perigo") : tag(b.stock + " un.", "alerta")}</li>`).join("")}</ul>`
              : vazio("Nenhuma variação com estoque controlado em 2 unidades ou menos.")}
          </section>
          <section class="cartao" aria-labelledby="h-cad">
            <div class="cartao-topo"><h2 id="h-cad">Cadastro de produtos</h2></div>
            <ul class="lista-alertas">
              <li><strong>${d.produtosSemPreco || 0}</strong> <span>${(d.produtosSemPreco || 0) === 1 ? "produto ativo sem preço" : "produtos ativos sem preço"} — só podem ser vendidos pelo atendimento.</span> <a href="#produtos?filtro=sem-preco">Revisar</a></li>
              <li><strong>${d.produtosSemMedida || 0}</strong> <span>sem peso ou medidas — o frete automático não é calculado para eles.</span> <a href="#produtos?filtro=sem-medida">Revisar</a></li>
            </ul>
          </section>
          <section class="cartao cartao--largo" aria-labelledby="h-integ">
            <div class="cartao-topo"><h2 id="h-integ">Integrações</h2>${pode("config") ? '<a class="lk-sutil" href="#configuracoes">Configurações</a>' : ""}</div>
            ${blocoIntegracoes(d.integracoes)}
          </section>
        </div>`;
    });
  }

  /* ============================================================ 8. atendimento */
  function telaAtendimento(el, args, q) {
    if (args[0]) return detalheAtendimento(el, args[0]);
    const status = q.status || "", busca = q.q || "";
    el.innerHTML = cabecalho("Atendimento exclusivo", "Solicitações de clientes que preferem fechar a compra pelo WhatsApp") +
      `<div class="filtros">
        ${chips("Filtrar por status", [["", "Todos"]].concat(Object.keys(STATUS_AT).map((k) => [k, STATUS_AT[k]])), status, "data-status")}
        <form class="busca" role="search" id="busca-at">
          <label class="so-leitor" for="busca-at-q">Buscar atendimento</label>
          <input id="busca-at-q" class="entrada" type="search" name="q" value="${esc(busca)}" placeholder="Código, nome ou telefone">
          <button type="submit" class="btn btn--peq">Buscar</button>
        </form>
      </div>
      <div id="lista-at"></div>`;
    $$("[data-status]", el).forEach((b) => b.addEventListener("click", () => irPara(hashCom("atendimento", { status: b.dataset.status, q: busca }))));
    $("#busca-at", el).addEventListener("submit", (ev) => { ev.preventDefault(); irPara(hashCom("atendimento", { status, q: $("#busca-at-q").value.trim() })); });
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (busca) qs.set("q", busca);
    carregar($("#lista-at", el), () => api("GET", "atendimentos" + (qs.toString() ? "?" + qs : "")), (d, alvo) => {
      const l = d.atendimentos || [];
      if (!l.length) {
        alvo.innerHTML = vazio(status || busca ? "Nenhuma solicitação com esses filtros." : "Nenhuma solicitação de atendimento ainda. Elas chegam quando a cliente escolhe “atendimento exclusivo” na sacola do site.");
        return;
      }
      alvo.innerHTML = `<p class="texto-peq">${plural(l.length, "solicitação", "solicitações")}</p>` + tabela(
        ["Código", "Cliente", "Peças", "Subtotal", "Status", "Atendente", "Criado em", "Pedido"],
        l.map((a) => [
          `<a class="lk-forte" href="#atendimento/${enc(a.id)}">${esc(a.code)}</a>`,
          `${esc(a.name || "Sem nome")}<br><span class="texto-peq">${esc(fone(a.phone))}</span>`,
          esc(a.itens),
          esc(brl(a.subtotal_cents)),
          tagAt(a.status),
          esc(a.atendente || "—"),
          esc(dataHora(a.created_at)),
          a.order_code ? esc(a.order_code) : "—",
        ]), "Solicitações de atendimento");
    });
  }

  /* Estado da tela de detalhe do atendimento. */
  let AT = null;

  function detalheAtendimento(el, id) {
    AT = { id, dados: null, cotacao: null, edicao: null };
    el.innerHTML = `<p class="voltar"><a href="#atendimento">← Atendimentos</a></p><div id="at-det"></div>`;
    carregar($("#at-det", el), () => Promise.all([
      api("GET", "atendimentos/" + enc(id)),
      garantirCatalogo().catch(() => null),
    ]), (r, alvo) => { AT.dados = r[0]; desenharAt(alvo); });
  }

  function chaveLinha(l) { return [l.variant_id, l.qtd, l.preco_unit].join("|"); }

  function listaItens(itens, o) {
    o = o || {};
    if (!itens || !itens.length) return vazio("Nenhuma peça.");
    const orig = o.comparar ? new Set(o.comparar.map(chaveLinha)) : null;
    return `<ul class="itens">${itens.map((l) => {
      const est = o.estoque ? (l.estoqueAtual !== undefined ? l.estoqueAtual : l.estoque) : undefined;
      let estTxt = "";
      if (est !== undefined) {
        estTxt = est == null ? `<span class="item-est">Estoque não controlado — confirmado no atendimento</span>`
          : Number(est) < Number(l.qtd) ? `<span class="item-est item-est--alerta">Estoque agora: ${esc(est)} (menos que o pedido)</span>`
          : `<span class="item-est">Estoque agora: ${esc(est)}</span>`;
      }
      const mudou = orig && !orig.has(chaveLinha(l));
      return `<li class="item${mudou ? " item--mudou" : ""}">
        <div class="item-cab"><span class="item-nome">${esc(l.nome)}</span>${mudou ? tag("alterado", "rosa") : ""}</div>
        <div class="item-info">Tam. ${esc(l.tam)}${l.cor ? " · " + esc(l.cor) : ""} · ${esc(l.qtd)} × ${esc(brl(l.preco_unit))}</div>
        <div class="item-total">${l.preco_unit == null ? tag("sem valor", "alerta") : esc(brl(l.preco_unit * l.qtd))}</div>
        ${estTxt}
      </li>`;
    }).join("")}</ul>`;
  }

  function produtoPorId(pid) { return (S.catalogo || []).find((p) => p.id === pid) || null; }

  function iniciarEdicao() {
    const a = AT.dados.atendimento;
    AT.edicao = (a.items || []).map((l) => {
      const p = produtoPorId(l.product_id);
      const manual = l.preco_unit != null && (!p || l.preco_unit !== p.price_cents);
      return { pid: l.product_id, vid: l.variant_id, qtd: l.qtd, preco: manual ? paraCampo(l.preco_unit) : "", nome: l.nome };
    });
  }

  function opcoesVariantes(p, atual) {
    const vs = (p && p.variants) || [];
    return vs.filter((v) => v.active || v.id === atual).map((v) =>
      `<option value="${esc(v.id)}"${v.id === atual ? " selected" : ""}>${esc(v.size)}${v.color ? " · " + esc(v.color) : ""} — ${esc(estoqueTxt(v.stock))}${v.active ? "" : " (inativa)"}</option>`).join("");
  }

  function desenharEditor() {
    const wrap = $("#editor-wrap");
    if (!wrap) return;
    if (!S.catalogo) {
      wrap.innerHTML = `<div class="erro-bloco" role="alert"><p>Não consegui carregar o catálogo para editar as peças.</p><button type="button" class="btn btn--vazio btn--peq" id="bt-recat">Tentar de novo</button></div>`;
      $("#bt-recat").addEventListener("click", (ev) => executar(ev.currentTarget, async () => { await garantirCatalogo(true); iniciarEdicao(); desenharEditor(); }));
      return;
    }
    const ativos = S.catalogo.filter((p) => p.active);
    wrap.innerHTML = `<form id="form-itens" class="editor" novalidate>
      ${AT.edicao.length ? `<ol class="editor-linhas">${AT.edicao.map((l, i) => {
        const p = produtoPorId(l.pid);
        return `<li class="editor-linha">
          <p class="editor-nome">${esc(p ? p.name : l.nome || l.pid)} <span class="texto-peq">· tabela: ${esc(brl(p ? p.price_cents : null))}</span></p>
          <div class="editor-campos">
            ${campo("Tamanho e cor", "vid-" + i, { tipo: "select", opcoes: opcoesVariantes(p, l.vid) || '<option value="">Sem variações</option>', cls: "campo--var" })}
            ${campo("Qtd.", "qtd-" + i, { tipo: "number", valor: l.qtd, attrs: 'min="1" max="20" inputmode="numeric"', cls: "campo--qtd" })}
            ${campoReais("Valor unitário manual", "preco-" + i, null, { texto: l.preco, ph: p && p.price_cents != null ? paraCampo(p.price_cents) : "obrigatório", cls: "campo--preco" })}
            <button type="button" class="btn btn--vazio btn--peq" data-remover="${i}">Remover<span class="so-leitor"> ${esc(p ? p.name : "")}</span></button>
          </div>
        </li>`;
      }).join("")}</ol>` : vazio("O carrinho está vazio. Adicione pelo menos uma peça.")}
      <fieldset class="adicionar">
        <legend>Adicionar peça do catálogo</legend>
        <div class="editor-campos">
          ${campo("Peça", "add-prod", { tipo: "select", opcoes: '<option value="">Escolha…</option>' + ativos.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(brl(p.price_cents))}</option>`).join(""), cls: "campo--var" })}
          ${campo("Tamanho e cor", "add-var", { tipo: "select", opcoes: '<option value="">Escolha a peça primeiro</option>', cls: "campo--var" })}
          ${campo("Qtd.", "add-qtd", { tipo: "number", valor: 1, attrs: 'min="1" max="20" inputmode="numeric"', cls: "campo--qtd" })}
          <button type="button" class="btn btn--vazio btn--peq" id="bt-add">Adicionar</button>
        </div>
      </fieldset>
      <p class="texto-peq">O valor manual é opcional quando a peça tem preço de tabela. Peças sem preço precisam de valor manual antes de gerar o pedido.</p>
      <div class="linha-acoes">
        <button type="submit" class="btn">Salvar carrinho</button>
        <button type="button" class="btn btn--vazio" id="bt-descartar">Descartar alterações</button>
      </div>
    </form>`;
    const form = $("#form-itens");
    const selProd = form.querySelector('[name="add-prod"]'), selVar = form.querySelector('[name="add-var"]');
    selProd.addEventListener("change", () => {
      const p = produtoPorId(selProd.value);
      selVar.innerHTML = p ? (opcoesVariantes(p, null) || '<option value="">Sem variações ativas</option>') : '<option value="">Escolha a peça primeiro</option>';
    });
    $("#bt-add").addEventListener("click", () => {
      lerEditor();
      const p = produtoPorId(selProd.value);
      const vid = selVar.value;
      const qtd = parseInt(form.querySelector('[name="add-qtd"]').value, 10) || 1;
      if (!p) { aviso("Escolha a peça.", "erro"); selProd.focus(); return; }
      if (!vid) { aviso("Escolha o tamanho e a cor.", "erro"); selVar.focus(); return; }
      AT.edicao.push({ pid: p.id, vid, qtd: Math.max(1, Math.min(20, qtd)), preco: "", nome: p.name });
      desenharEditor();
      aviso(p.name + " adicionada ao carrinho (ainda não salvo).");
      const ultimo = $$("#form-itens .editor-linha select").pop();
      if (ultimo) ultimo.focus();
    });
    $$("[data-remover]", form).forEach((b) => b.addEventListener("click", () => {
      lerEditor();
      const i = Number(b.dataset.remover);
      const nome = AT.edicao[i] && (produtoPorId(AT.edicao[i].pid) || {}).name;
      AT.edicao.splice(i, 1);
      desenharEditor();
      aviso((nome || "Peça") + " removida do carrinho (ainda não salvo).");
      const f = $("#form-itens select, #form-itens button");
      if (f) f.focus();
    }));
    $("#bt-descartar").addEventListener("click", () => { AT.edicao = null; desenharAt($("#at-det")); });
    aoEnviar(form, async () => {
      lerEditor();
      if (!AT.edicao.length) throw falha("O carrinho precisa de pelo menos uma peça. Para desistir da venda, mude o status para Cancelado.", 400);
      const itens = AT.edicao.map((l, i) => {
        const p = produtoPorId(l.pid);
        const v = p && (p.variants || []).find((x) => x.id === l.vid);
        if (!v) throw erroCampo("Escolha o tamanho e a cor.", "vid-" + i);
        const qtd = parseInt(l.qtd, 10);
        if (!(qtd >= 1 && qtd <= 20)) throw erroCampo("Quantidade entre 1 e 20.", "qtd-" + i);
        const item = { id: l.pid, tam: v.size, cor: v.color, qtd };
        const preco = paraCentavos(l.preco);
        if (Number.isNaN(preco)) throw erroCampo("Valor inválido. Use o formato 129,90.", "preco-" + i);
        if (preco != null) item.preco_manual = preco;
        return item;
      });
      const r = await api("PUT", "atendimentos/" + enc(AT.id) + "/itens", { itens });
      AT.dados = r; AT.edicao = null; AT.cotacao = null;
      desenharAt($("#at-det"));
      aviso("Carrinho atualizado.");
    });
  }

  function lerEditor() {
    const form = $("#form-itens");
    if (!form || !AT.edicao) return;
    AT.edicao.forEach((l, i) => {
      const v = form.querySelector(`[name="vid-${i}"]`), q = form.querySelector(`[name="qtd-${i}"]`), p = form.querySelector(`[name="preco-${i}"]`);
      if (v) l.vid = v.value;
      if (q) l.qtd = q.value;
      if (p) l.preco = p.value;
    });
  }

  function desenharCotacao() {
    const c = AT.cotacao;
    if (!c) return "";
    const ops = c.opcoes || [];
    const auto = c.automatico || {};
    return `<form id="form-opcao" class="cotacao" novalidate>
      <fieldset>
        <legend>Opções para o CEP ${esc(cepFmt(c.cep))}</legend>
        ${auto.disponivel ? "" : `<p class="faixa faixa--info">Cálculo automático indisponível: ${esc(auto.motivo || "sem detalhes.")}</p>`}
        ${ops.length ? ops.map((o, i) => `<label class="opcao-frete"><input type="radio" name="opcao" value="${i}"${i === 0 ? " required" : ""}>
          <span><strong>${esc(o.nome)}</strong>${o.empresa && o.tipo === "melhorenvio" ? " · " + esc(o.empresa) : ""}<br>
          <span class="texto-peq">${o.preco == null ? "valor a combinar" : esc(brl(o.preco))}${o.prazo ? " · " + esc(prazoTxt(o.prazo)) : ""}${o.detalhe ? " · " + esc(o.detalhe) : ""}</span></span></label>`).join("")
          : vazio("Nenhuma opção de entrega disponível para este CEP. Use o frete manual abaixo.")}
        ${ops.length ? campoReais("Valor do frete, se a opção escolhida não tiver preço (R$)", "valorOpcao", null, {}) : ""}
      </fieldset>
      ${ops.length ? '<button type="submit" class="btn btn--peq">Usar esta entrega</button>' : ""}
    </form>`;
  }

  function desenharAt(alvo) {
    if (!alvo) return;
    const d = AT.dados, a = d.atendimento, t = d.total || {};
    const encerrado = a.status === "cancelado" || a.status === "concluido";
    const comPedido = !!a.order_id;
    const editavel = !encerrado && !comPedido;
    const env = a.shipping || null;
    const tipoEnvio = env && env.tipo;
    const meu = S.equipe && a.assigned_to === S.equipe.id;
    alvo.innerHTML = `
      <header class="det-topo">
        <div>
          <p class="em em--rosa">Atendimento exclusivo</p>
          <h1 class="det-titulo">${esc(a.code)}</h1>
          <p class="det-meta">${tagAt(a.status)} <span>Aberto em ${esc(dataHora(a.created_at))}</span> <span>Atendente: ${esc(a.atendente || "ninguém assumiu")}</span>${a.vendedor ? ` <span>Vendido por: ${esc(a.vendedor)}</span>` : ""}</p>
        </div>
        <div class="det-acoes">
          ${!encerrado && !meu ? '<button type="button" class="btn" data-acao="assumir">Assumir atendimento</button>' : ""}
          <button type="button" class="btn btn--vazio" data-acao="resumo">Resumo para WhatsApp</button>
          ${!encerrado ? '<button type="button" class="btn btn--vazio" data-acao="status">Mudar status</button>' : ""}
        </div>
      </header>
      ${comPedido ? `<div class="faixa faixa--ok">Pedido <a class="lk-forte" href="#pedidos/${enc(a.order_id)}">${esc(a.order_code || "gerado")}</a> gerado a partir deste atendimento. Pagamento, envio e status seguem pelo pedido.</div>` : ""}
      ${encerrado && !comPedido ? `<div class="faixa faixa--info">Atendimento encerrado (${esc(STATUS_AT[a.status])}). Não é mais possível editar.</div>` : ""}
      ${editavel && t.semPreco ? '<div class="faixa faixa--alerta">Há peças sem valor. Informe o valor manual delas no carrinho antes de gerar o pedido.</div>' : ""}
      <div class="det-grade">
        <div class="det-principal">
          <section class="cartao" aria-labelledby="h-carrinho">
            <div class="cartao-topo"><h2 id="h-carrinho">Carrinho</h2>${editavel && !AT.edicao ? '<button type="button" class="btn btn--peq" data-acao="editar">Editar peças</button>' : ""}</div>
            <div class="comparar">
              <div class="comparar-col">
                <h3 class="sub-tit">Como chegou do site</h3>
                ${listaItens(a.original_items)}
              </div>
              <div class="comparar-col comparar-col--atual">
                <h3 class="sub-tit">Carrinho atual</h3>
                ${AT.edicao ? '<div id="editor-wrap"></div>' : listaItens(a.items, { estoque: true, comparar: a.original_items })}
              </div>
            </div>
          </section>

          <section class="cartao" aria-labelledby="h-valores">
            <div class="cartao-topo"><h2 id="h-valores">Valores e entrega</h2></div>
            <dl class="totais">
              <div><dt>Subtotal</dt><dd>${t.semPreco ? "a definir (há peças sem valor)" : esc(brl(t.subtotal))}</dd></div>
              <div><dt>Desconto${a.coupon_code ? ` (cupom ${esc(a.coupon_code)})` : ""}</dt><dd>${t.desconto ? "− " + esc(brl0(t.desconto)) : esc(brl0(0))}</dd></div>
              <div><dt>Entrega${env ? ` · ${esc(env.nome || TIPOS_FRETE[env.tipo] || "")}${env.prazo ? " · " + esc(prazoTxt(env.prazo)) : ""}` : ""}</dt><dd>${a.shipping_cents == null ? "não definida" : esc(brl(a.shipping_cents))}</dd></div>
              <div class="totais-total"><dt>Total</dt><dd>${t.total == null ? "a definir" : esc(brl(t.total))}</dd></div>
            </dl>
            ${editavel ? `
              <div class="sub-grade">
                <form id="form-desconto" class="form-linha" novalidate>
                  ${campoReais("Desconto manual (R$)", "desconto", a.discount_cents || null)}
                  <button type="submit" class="btn btn--vazio btn--peq">Aplicar desconto</button>
                </form>
                <form id="form-cupom" class="form-linha" novalidate>
                  ${campo("Cupom", "cupom", { valor: a.coupon_code || "", attrs: 'autocapitalize="characters" autocomplete="off"' })}
                  <button type="submit" class="btn btn--vazio btn--peq">Aplicar cupom</button>
                  ${a.coupon_code ? '<button type="button" class="btn btn--vazio btn--peq" data-acao="remover-cupom">Remover cupom</button>' : ""}
                </form>
              </div>
              <h3 class="sub-tit">Entrega</h3>
              <form id="form-cotar" class="form-linha" novalidate>
                ${campo("CEP da cliente", "cep", { valor: cepFmt(a.cep), attrs: 'inputmode="numeric" autocomplete="postal-code" maxlength="9"' })}
                <button type="submit" class="btn btn--vazio btn--peq">Cotar frete</button>
              </form>
              <div id="cotacao-wrap">${desenharCotacao()}</div>
              <div class="linha-acoes">
                <button type="button" class="btn btn--vazio btn--peq" data-acao="retirada">Retirada na loja (R$ 0,00)</button>
              </div>
              <details class="detalhes">
                <summary>Frete combinado manualmente</summary>
                <form id="form-frete-manual" novalidate>
                  <div class="grade-campos">
                    ${campo("Tipo", "freteTipo", { tipo: "select", opcoes: opcoes({ local: "Entrega local", manual: "Outro (combinado)" }, tipoEnvio === "manual" ? "manual" : "local") })}
                    ${campo("Descrição", "freteDescricao", { valor: env && (env.tipo === "local" || env.tipo === "manual") ? env.nome : "Entrega local", req: true })}
                    ${campoReais("Valor (R$)", "frete", env && (env.tipo === "local" || env.tipo === "manual") ? a.shipping_cents : null, { req: true })}
                    ${campo("Prazo (opcional)", "prazo", { ph: "Ex.: hoje à tarde" })}
                  </div>
                  <button type="submit" class="btn btn--vazio btn--peq">Salvar frete</button>
                </form>
              </details>` : ""}
          </section>

          ${editavel ? `
          <section class="cartao" aria-labelledby="h-gerar">
            <div class="cartao-topo"><h2 id="h-gerar">Gerar pedido</h2></div>
            <p class="texto-peq">Confira peças, valores e entrega. Ao gerar, o estoque controlado é baixado e o pedido fica aguardando pagamento.</p>
            <form id="form-converter" novalidate>
              ${tipoEnvio === "retirada" ? '<p class="faixa faixa--info">Retirada na loja: endereço não é necessário.</p>' : `
              <fieldset class="grupo">
                <legend>Endereço de entrega</legend>
                <div class="grade-campos">
                  ${campo("CEP", "cep", { valor: cepFmt(a.cep), req: true, attrs: 'inputmode="numeric" autocomplete="postal-code" maxlength="9"' })}
                  ${campo("Rua", "rua", { req: true, attrs: 'autocomplete="address-line1"', cls: "campo--2" })}
                  ${campo("Número", "numero", { req: true })}
                  ${campo("Complemento", "complemento", {})}
                  ${campo("Bairro", "bairro", { req: true })}
                  ${campo("Cidade", "cidade", { req: true })}
                  ${campo("UF", "uf", { req: true, attrs: 'maxlength="2" autocapitalize="characters"' })}
                </div>
              </fieldset>`}
              ${campo("Forma de pagamento prevista (opcional)", "metodo", { tipo: "select", opcoes: opcoes(METODOS, "", "A definir") })}
              <button type="submit" class="btn">Gerar pedido</button>
            </form>
          </section>` : ""}
        </div>

        <aside class="det-lateral">
          <section class="cartao" aria-labelledby="h-cliente">
            <div class="cartao-topo"><h2 id="h-cliente">Cliente</h2></div>
            <dl class="dados">
              <div><dt>Nome</dt><dd>${esc(a.name || "—")}</dd></div>
              <div><dt>Telefone</dt><dd>${esc(fone(a.phone))}${linkWa(a.phone) ? ` · <a href="${esc(linkWa(a.phone))}" target="_blank" rel="noopener">abrir conversa</a>` : ""}</dd></div>
              <div><dt>E-mail</dt><dd>${esc(a.email || "—")}</dd></div>
              <div><dt>CEP informado</dt><dd>${esc(cepFmt(a.cep) || "—")}</dd></div>
            </dl>
            ${a.customer_id ? `<p class="faixa faixa--info">Conta no site: <strong>${esc(a.cliente_nome || "—")}</strong>${a.cliente_email ? " · " + esc(a.cliente_email) : ""}${a.cliente_whatsapp ? " · " + esc(fone(a.cliente_whatsapp)) : ""}${pode("clientes") ? ` · <a href="#clientes/${enc(a.customer_id)}">ver cliente</a>` : ""}</p>` : '<p class="texto-peq">Sem conta vinculada no site.</p>'}
            ${a.customer_note ? `<blockquote class="recado"><p class="sub-tit">Recado da cliente</p><p>${esc(a.customer_note)}</p></blockquote>` : ""}
            <details class="detalhes">
              <summary>Editar contato</summary>
              <form id="form-contato" novalidate>
                ${campo("Nome", "nome", { valor: a.name || "", req: true, attrs: 'autocomplete="off"' })}
                ${campo("Telefone com DDD", "fone", { valor: a.phone || "", req: true, attrs: 'inputmode="tel" autocomplete="off"' })}
                ${campo("E-mail", "email", { tipo: "email", valor: a.email || "", attrs: 'autocomplete="off"' })}
                <button type="submit" class="btn btn--vazio btn--peq">Salvar contato</button>
              </form>
            </details>
          </section>

          <section class="cartao" aria-labelledby="h-notas">
            <div class="cartao-topo"><h2 id="h-notas">Notas internas</h2></div>
            ${a.notes ? `<div class="notas">${esc(a.notes)}</div>` : '<p class="texto-peq">Nenhuma nota ainda. Notas são só para a equipe.</p>'}
            <form id="form-nota" novalidate>
              ${campo("Nova nota", "texto", { tipo: "textarea", linhas: 3, ph: "Ex.: cliente prefere entrega depois das 18h" })}
              <button type="submit" class="btn btn--vazio btn--peq">Adicionar nota</button>
            </form>
          </section>

          <section class="cartao" aria-labelledby="h-hist">
            <div class="cartao-topo"><h2 id="h-hist">Histórico</h2></div>
            ${linhaTempo(d.eventos)}
          </section>
        </aside>
      </div>`;

    if (AT.edicao) desenharEditor();
    ligarAt(alvo);
  }

  function ligarAt(alvo) {
    const a = AT.dados.atendimento;
    const base = "atendimentos/" + enc(AT.id);
    const aplicar = (r, msg) => { AT.dados = r; desenharAt($("#at-det")); if (msg) aviso(msg); };
    const bt = (acao) => $(`[data-acao="${acao}"]`, alvo);

    const assumir = bt("assumir");
    if (assumir) assumir.addEventListener("click", () => executar(assumir, async () => aplicar(await api("POST", base + "/assumir", {}), "Atendimento assumido por você.")));

    const editar = bt("editar");
    if (editar) editar.addEventListener("click", () => executar(editar, async () => {
      if (!S.catalogo) await garantirCatalogo(true).catch(() => null);
      iniciarEdicao();
      desenharAt($("#at-det"));
      const f = $("#form-itens select, #form-itens input");
      if (f) f.focus();
    }));

    const resumo = bt("resumo");
    resumo.addEventListener("click", () => executar(resumo, async () => {
      const r = await api("GET", base + "/resumo");
      const wa = urlSegura(r.whatsappUrl);
      dialogo({
        titulo: "Resumo para WhatsApp",
        somenteFechar: true,
        largo: true,
        corpo: `<label class="rotulo" for="resumo-txt">Texto do resumo</label>
          <textarea id="resumo-txt" class="entrada resumo-txt" rows="12" readonly>${esc(r.texto)}</textarea>
          <div class="linha-acoes">
            <button type="button" class="btn" id="bt-copiar">Copiar texto</button>
            ${wa ? `<a class="btn btn--rosa" href="${esc(wa)}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : '<span class="texto-peq">Sem telefone válido para abrir o WhatsApp.</span>'}
          </div>
          <p class="texto-peq" id="copiado" aria-live="polite"></p>`,
        aoAbrir: (corpo) => {
          $("#bt-copiar", corpo).addEventListener("click", async () => {
            const ok = await copiar(r.texto);
            $("#copiado", corpo).textContent = ok ? "Texto copiado." : "Não consegui copiar. Selecione o texto e copie manualmente.";
            if (!ok) { const t = $("#resumo-txt", corpo); t.focus(); t.select(); }
          });
        },
      });
    }));

    const st = bt("status");
    if (st) st.addEventListener("click", () => {
      const comPedido = !!a.order_id;
      const lista = comPedido ? { cancelado: STATUS_AT.cancelado } : STATUS_AT;
      dialogo({
        titulo: "Mudar status do atendimento",
        ok: "Mudar status",
        corpo: `<p>Status atual: ${tagAt(a.status)}</p>
          ${comPedido ? '<p class="faixa faixa--alerta">Este atendimento já tem pedido. Aqui só é possível cancelar — isso cancela também o pedido e devolve o estoque controlado. Para outros status, use a tela do pedido.</p>' : ""}
          ${campo("Novo status", "status", { tipo: "select", opcoes: opcoes(lista, comPedido ? "cancelado" : a.status) })}
          ${campo("Motivo (opcional)", "motivo", { tipo: "textarea", linhas: 2 })}`,
        aoConfirmar: async (dd) => {
          if (dd.status === a.status) throw erroCampo("Escolha um status diferente do atual.", "status");
          aplicar(await api("POST", base + "/status", { status: dd.status, motivo: dd.motivo }), "Status alterado para " + STATUS_AT[dd.status] + ".");
        },
      });
    });

    aoEnviar($("#form-desconto", alvo), async (dd) => {
      const v = paraCentavos(dd.desconto);
      if (Number.isNaN(v)) throw erroCampo("Valor inválido. Use o formato 10,00.", "desconto");
      aplicar(await api("PUT", base + "/valores", { desconto: v || 0 }), "Desconto aplicado.");
    });
    aoEnviar($("#form-cupom", alvo), async (dd) => {
      if (!dd.cupom) throw erroCampo("Digite o código do cupom.", "cupom");
      aplicar(await api("PUT", base + "/valores", { cupom: dd.cupom.toUpperCase() }), "Cupom aplicado.");
    });
    const rc = bt("remover-cupom");
    if (rc) rc.addEventListener("click", () => executar(rc, async () => aplicar(await api("PUT", base + "/valores", { cupom: "" }), "Cupom removido. O desconto do cupom continua até você alterar o desconto manual.")));

    aoEnviar($("#form-cotar", alvo), async (dd) => {
      if (digitos(dd.cep).length !== 8) throw erroCampo("CEP com 8 números.", "cep");
      const r = await api("POST", base + "/frete", { cep: digitos(dd.cep) });
      AT.cotacao = r.cotacao;
      const w = $("#cotacao-wrap");
      w.innerHTML = desenharCotacao();
      ligarCotacao();
      const p = $("#form-opcao input[type=radio]") || $("#form-opcao");
      if (p) p.focus();
    });
    ligarCotacao();

    const ret = bt("retirada");
    if (ret) ret.addEventListener("click", () => executar(ret, async () => aplicar(await api("PUT", base + "/valores", {
      frete: 0, freteTipo: "retirada", freteDescricao: "Retirada na loja", freteId: "retirada",
    }), "Entrega definida: retirada na loja.")));

    aoEnviar($("#form-frete-manual", alvo), async (dd) => {
      const v = paraCentavos(dd.frete);
      if (v == null || Number.isNaN(v)) throw erroCampo("Informe o valor do frete (pode ser 0,00).", "frete");
      if (!dd.freteDescricao) throw erroCampo("Descreva a entrega.", "freteDescricao");
      aplicar(await api("PUT", base + "/valores", {
        frete: v, freteTipo: dd.freteTipo, freteDescricao: dd.freteDescricao, freteId: dd.freteTipo, prazo: dd.prazo || null,
      }), "Frete salvo.");
    });

    aoEnviar($("#form-converter", alvo), async (dd) => {
      const tipo = a.shipping && a.shipping.tipo;
      const tot = AT.dados.total || {};
      if (tot.semPreco) throw falha("Defina o valor de todas as peças antes de gerar o pedido.", 409);
      if (a.shipping_cents == null) throw falha("Defina a entrega antes (cotação, frete manual ou retirada na loja).", 409);
      const corpo = {};
      if (dd.metodo) corpo.metodo = dd.metodo;
      if (tipo !== "retirada") {
        const end = { cep: digitos(dd.cep), rua: dd.rua, numero: dd.numero, complemento: dd.complemento, bairro: dd.bairro, cidade: dd.cidade, uf: (dd.uf || "").toUpperCase() };
        if (end.cep.length !== 8) throw erroCampo("CEP com 8 números.", "cep");
        ["rua", "numero", "bairro", "cidade"].forEach((k) => { if (!end[k]) throw erroCampo("Campo obrigatório.", k); });
        if (!/^[A-Z]{2}$/.test(end.uf)) throw erroCampo("UF com 2 letras.", "uf");
        corpo.endereco = end;
      }
      dialogo({
        titulo: "Gerar pedido?",
        ok: "Gerar pedido",
        corpo: `<p>Será criado um pedido de <strong>${esc(brl(tot.total))}</strong> para <strong>${esc(a.name || "a cliente")}</strong>, aguardando pagamento.</p>
          <p class="texto-peq">O estoque controlado das peças é baixado agora. Depois disso, alterações são feitas pelo pedido.</p>`,
        aoConfirmar: async () => {
          const r = await api("POST", base + "/converter", corpo);
          AT.dados = r;
          desenharAt($("#at-det"));
          aviso("Pedido " + (r.pedidoCodigo || "") + " gerado.");
          const lk = $(`#at-det a[href="#pedidos/${enc(r.pedidoId)}"]`);
          if (lk) lk.focus();
        },
      });
    });

    aoEnviar($("#form-contato", alvo), async (dd) => {
      if (dd.nome.length < 3) throw erroCampo("Informe o nome completo.", "nome");
      if (digitos(dd.fone).length < 10) throw erroCampo("Telefone com DDD.", "fone");
      aplicar(await api("POST", base + "/contato", { nome: dd.nome, fone: dd.fone, email: dd.email }), "Contato atualizado.");
    });
    aoEnviar($("#form-nota", alvo), async (dd) => {
      if (!dd.texto) throw erroCampo("Escreva a nota.", "texto");
      aplicar(await api("POST", base + "/nota", { texto: dd.texto }), "Nota adicionada.");
    });
  }

  function ligarCotacao() {
    const form = $("#form-opcao");
    if (!form) return;
    aoEnviar(form, async (dd) => {
      const ops = (AT.cotacao && AT.cotacao.opcoes) || [];
      const o = ops[Number(dd.opcao)];
      if (!o) throw erroCampo("Escolha uma opção de entrega.", "opcao");
      let preco = o.preco;
      if (preco == null) {
        preco = paraCentavos(dd.valorOpcao);
        if (preco == null || Number.isNaN(preco)) throw erroCampo("Esta opção não tem preço automático: informe o valor combinado.", "valorOpcao");
      }
      const r = await api("PUT", "atendimentos/" + enc(AT.id) + "/valores", {
        frete: preco, freteTipo: o.tipo, freteDescricao: (o.nome + (o.empresa && o.tipo === "melhorenvio" ? " — " + o.empresa : "")).slice(0, 120),
        freteId: o.id, servicoId: o.servicoId || null, prazo: o.prazo || null,
      });
      AT.dados = r;
      desenharAt($("#at-det"));
      aviso("Entrega definida: " + o.nome + ".");
    });
  }

  /* ============================================================ 9. pedidos */
  function telaPedidos(el, args, q) {
    if (args[0]) return detalhePedido(el, args[0]);
    const f = { status: q.status || "", canal: q.canal || "", q: q.q || "" };
    el.innerHTML = cabecalho("Pedidos", "Pedidos do site e do atendimento") +
      `<form class="filtros filtros--form" id="filtro-ped" role="search">
        ${campo("Status", "status", { tipo: "select", opcoes: opcoes(STATUS_PED, f.status, "Todos") })}
        ${campo("Canal", "canal", { tipo: "select", opcoes: opcoes(CANAIS, f.canal, "Todos") })}
        ${campo("Buscar", "q", { tipo: "search", valor: f.q, ph: "Código, nome ou telefone" })}
        <button type="submit" class="btn btn--peq">Filtrar</button>
      </form>
      <div id="lista-ped"></div>`;
    $("#filtro-ped", el).addEventListener("submit", (ev) => { ev.preventDefault(); irPara(hashCom("pedidos", dadosForm(ev.currentTarget))); });
    const qs = new URLSearchParams();
    Object.keys(f).forEach((k) => { if (f[k]) qs.set(k, f[k]); });
    carregar($("#lista-ped", el), () => api("GET", "pedidos" + (qs.toString() ? "?" + qs : "")), (d, alvo) => {
      const l = d.pedidos || [];
      if (!l.length) { alvo.innerHTML = vazio(f.status || f.canal || f.q ? "Nenhum pedido com esses filtros." : "Nenhum pedido ainda."); return; }
      alvo.innerHTML = `<p class="texto-peq">${plural(l.length, "pedido", "pedidos")}</p>` + tabela(
        ["Código", "Cliente", "Canal", "Status", "Pagamento", "Total", "Entrega", "Vendido por", "Criado em"],
        l.map((o) => [
          `<a class="lk-forte" href="#pedidos/${enc(o.id)}">${esc(o.code)}</a>`,
          `${esc(o.name)}<br><span class="texto-peq">${esc(fone(o.phone))}</span>`,
          esc(CANAIS[o.channel] || o.channel),
          tagPed(o.status),
          tag(STATUS_PAG[o.payment_status] || o.payment_status, TOM_PAG[o.payment_status]),
          esc(brl0(o.total_cents)),
          esc(o.entrega || "—") + (o.tracking_code ? `<br><span class="texto-peq">${esc(o.tracking_code)}</span>` : ""),
          esc(o.vendedor || (o.channel === "site" ? "Site" : "—")),
          esc(dataHora(o.created_at)),
        ]), "Pedidos");
    });
  }

  function detalhePedido(el, id) {
    el.innerHTML = `<p class="voltar"><a href="#pedidos">← Pedidos</a></p><div id="ped-det"></div>`;
    const extra = { etiqueta: null, rastreio: null };
    const base = "pedidos/" + enc(id);

    const desenhar = (d) => {
      const alvo = $("#ped-det");
      if (!alvo) return;
      const o = d.pedido, tx = d.transacoes || [], at = d.atendimento;
      const env = o.shipping || null;
      const end = o.address || null;
      const pago = tx.filter((x) => x.status === "aprovado").reduce((s, x) => s + (x.amount_cents || 0), 0);
      const resta = Math.max(0, (o.total_cents || 0) - pago);
      const cancelado = o.status === "cancelado" || o.status === "reembolsado";
      const aprovado = o.payment_status === "aprovado";
      const me = env && env.tipo === "melhorenvio";
      alvo.innerHTML = `
        <header class="det-topo">
          <div>
            <p class="em em--rosa">Pedido · ${esc(CANAIS[o.channel] || o.channel)}</p>
            <h1 class="det-titulo">${esc(o.code)}</h1>
            <p class="det-meta">${tagPed(o.status)} ${tagPag(o.payment_status)} <span>Criado em ${esc(dataHora(o.created_at))}</span><span>Vendido por: ${esc(o.vendedor || (o.channel === "site" ? "site (sem atendente)" : "—"))}</span></p>
          </div>
          <div class="det-acoes">
            <button type="button" class="btn btn--vazio" data-acao="status">Mudar status</button>
          </div>
        </header>
        ${at ? `<div class="faixa faixa--info">Originado do atendimento ${pode("atendimento") ? `<a class="lk-forte" href="#atendimento/${enc(at.id)}">${esc(at.code)}</a>` : esc(at.code)} (${esc(STATUS_AT[at.status] || at.status)}).</div>` : ""}
        ${extra.etiqueta ? `<div class="faixa faixa--ok">Etiqueta ${esc(extra.etiqueta.etiquetaId || "")} gerada.${urlSegura(extra.etiqueta.urlImpressao) ? ` <a class="lk-forte" href="${esc(urlSegura(extra.etiqueta.urlImpressao))}" target="_blank" rel="noopener">Imprimir etiqueta</a>` : " O Melhor Envio não devolveu link de impressão; abra pelo painel do Melhor Envio."}</div>` : ""}
        ${extra.rastreio ? `<div class="faixa faixa--info">Rastreio no Melhor Envio: ${esc(extra.rastreio.status || "sem status")}${extra.rastreio.codigo ? " · código " + esc(extra.rastreio.codigo) : ""}.</div>` : ""}
        <div class="det-grade">
          <div class="det-principal">
            <section class="cartao" aria-labelledby="h-itens">
              <div class="cartao-topo"><h2 id="h-itens">Peças</h2></div>
              ${tabela(["Peça", "Tam.", "Cor", "Qtd.", "Unitário", "Total"], (o.items || []).map((l) => [
                esc(l.nome), esc(l.tam), esc(l.cor || "—"), esc(l.qtd), esc(brl(l.preco_unit)), esc(brl(l.total != null ? l.total : (l.preco_unit != null ? l.preco_unit * l.qtd : null))),
              ]), "Peças do pedido")}
              <dl class="totais">
                <div><dt>Subtotal</dt><dd>${esc(brl0(o.subtotal_cents))}</dd></div>
                <div><dt>Desconto${o.coupon_code ? ` (cupom ${esc(o.coupon_code)})` : ""}</dt><dd>${o.discount_cents ? "− " : ""}${esc(brl0(o.discount_cents))}</dd></div>
                <div><dt>Entrega</dt><dd>${esc(brl0(o.shipping_cents))}</dd></div>
                <div class="totais-total"><dt>Total</dt><dd>${esc(brl0(o.total_cents))}</dd></div>
              </dl>
            </section>

            <section class="cartao" aria-labelledby="h-pag">
              <div class="cartao-topo"><h2 id="h-pag">Pagamento</h2></div>
              <dl class="dados dados--2">
                <div><dt>Situação</dt><dd>${tag(STATUS_PAG[o.payment_status] || o.payment_status, TOM_PAG[o.payment_status])}</dd></div>
                <div><dt>Forma</dt><dd>${esc(METODOS[o.payment_method] || o.payment_method || "a definir")}</dd></div>
                <div><dt>Recebido</dt><dd>${esc(brl0(pago))}${!aprovado && resta ? ` · falta ${esc(brl0(resta))}` : ""}</dd></div>
                <div><dt>Pago em</dt><dd>${esc(dataHora(o.paid_at))}</dd></div>
                ${o.payment_provider ? `<div><dt>Plataforma</dt><dd>${esc(o.payment_provider)}${o.payment_ref ? " · " + esc(o.payment_ref) : ""}</dd></div>` : ""}
                ${urlSegura(o.payment_link) ? `<div><dt>Link</dt><dd><a href="${esc(urlSegura(o.payment_link))}" target="_blank" rel="noopener">abrir link de pagamento</a></dd></div>` : ""}
              </dl>
              ${!cancelado ? `<div class="linha-acoes">
                ${!aprovado ? '<button type="button" class="btn" data-acao="pagamento">Registrar pagamento recebido</button>' : ""}
                ${!aprovado ? '<button type="button" class="btn btn--vazio" data-acao="link">Gerar link de pagamento</button>' : ""}
                ${aprovado && pode("financeiro") ? '<button type="button" class="btn btn--vazio btn--perigo-txt" data-acao="reembolso">Registrar reembolso</button>' : ""}
              </div>` : ""}
              <h3 class="sub-tit">Transações</h3>
              ${tx.length ? tabela(["Data", "Forma", "Plataforma", "Situação", "Valor", "Referência", "Por", "Observação"], tx.map((x) => [
                esc(dataHora(x.created_at)), esc(METODOS[x.method] || x.method || "—"), esc(x.provider), tag(STATUS_PAG[x.status] || x.status, TOM_PAG[x.status]),
                esc(brl0(x.amount_cents)), `<span class="quebra">${esc(x.provider_ref)}</span>`, esc(x.staff_nome || "—"), esc(x.note || "—"),
              ]), "Transações de pagamento") : vazio("Nenhuma transação registrada.")}
            </section>

            <section class="cartao" aria-labelledby="h-envio">
              <div class="cartao-topo"><h2 id="h-envio">Entrega</h2></div>
              <dl class="dados dados--2">
                <div><dt>Modalidade</dt><dd>${env ? esc(env.nome || TIPOS_FRETE[env.tipo] || env.tipo) + (env.prazo ? " · " + esc(prazoTxt(env.prazo)) : "") : "não definida"}</dd></div>
                <div><dt>Tipo</dt><dd>${env ? esc(TIPOS_FRETE[env.tipo] || env.tipo || "—") : "—"}</dd></div>
                <div><dt>Rastreio</dt><dd>${o.tracking_code ? esc(o.tracking_code) + (urlSegura(o.tracking_url) ? ` · <a href="${esc(urlSegura(o.tracking_url))}" target="_blank" rel="noopener">acompanhar</a>` : "") : "—"}</dd></div>
                <div><dt>Etiqueta Melhor Envio</dt><dd>${esc(o.shipping_label_id || "—")}</dd></div>
                <div><dt>Enviado em</dt><dd>${esc(dataHora(o.shipped_at))}</dd></div>
              </dl>
              ${me && !cancelado ? `<div class="linha-acoes">
                ${!o.shipping_label_id ? `<button type="button" class="btn btn--vazio" data-acao="etiqueta"${aprovado ? "" : ' aria-describedby="etq-aj"'}>Gerar etiqueta (Melhor Envio)</button>${aprovado ? "" : '<span class="texto-peq" id="etq-aj">A etiqueta só pode ser gerada depois do pagamento aprovado.</span>'}` : '<button type="button" class="btn btn--vazio" data-acao="rastrear">Atualizar rastreio</button>'}
              </div>` : ""}
              ${!cancelado ? `<form id="form-rastreio" class="form-linha" novalidate>
                ${campo("Código de rastreio", "codigo", { valor: o.tracking_code || "", attrs: 'autocapitalize="characters" autocomplete="off"' })}
                ${campo("Link de rastreio (opcional)", "url", { tipo: "url", valor: o.tracking_url || "", ph: "https://" })}
                <button type="submit" class="btn btn--vazio btn--peq">Salvar rastreio</button>
              </form>
              <p class="texto-peq">Com pagamento aprovado e pedido pago/em separação, salvar o rastreio marca o pedido como enviado.</p>` : ""}
            </section>
          </div>

          <aside class="det-lateral">
            <section class="cartao" aria-labelledby="h-cli">
              <div class="cartao-topo"><h2 id="h-cli">Cliente</h2></div>
              <dl class="dados">
                <div><dt>Nome</dt><dd>${esc(o.name)}</dd></div>
                <div><dt>Telefone</dt><dd>${esc(fone(o.phone))}${linkWa(o.phone) ? ` · <a href="${esc(linkWa(o.phone))}" target="_blank" rel="noopener">abrir conversa</a>` : ""}</dd></div>
                <div><dt>E-mail</dt><dd>${esc(o.email || "—")}</dd></div>
                <div><dt>Endereço</dt><dd>${end ? `${esc(end.rua)}, ${esc(end.numero)}${end.complemento ? " — " + esc(end.complemento) : ""}<br>${esc(end.bairro)} · ${esc(end.cidade)}/${esc(end.uf)}<br>CEP ${esc(cepFmt(end.cep))}` : (env && env.tipo === "retirada" ? "Retirada na loja" : "—")}</dd></div>
              </dl>
              ${o.customer_id && pode("clientes") ? `<p><a href="#clientes/${enc(o.customer_id)}">Ver cliente</a></p>` : ""}
            </section>
            <section class="cartao" aria-labelledby="h-notas-p">
              <div class="cartao-topo"><h2 id="h-notas-p">Notas internas</h2></div>
              ${o.notes ? `<div class="notas">${esc(o.notes)}</div>` : ""}
              <form id="form-nota-ped" novalidate>
                ${campo("Nova nota", "texto", { tipo: "textarea", linhas: 3 })}
                <button type="submit" class="btn btn--vazio btn--peq">Adicionar nota</button>
              </form>
            </section>
            <section class="cartao" aria-labelledby="h-hist-p">
              <div class="cartao-topo"><h2 id="h-hist-p">Histórico</h2></div>
              ${linhaTempo(d.eventos)}
            </section>
          </aside>
        </div>`;

      const bt = (acao) => $(`[data-acao="${acao}"]`, alvo);
      const aplicar = (r, msg) => { extra.etiqueta = r.etiqueta || null; extra.rastreio = r.rastreio || null; desenhar(r); if (msg) aviso(msg); };

      bt("status").addEventListener("click", () => dialogo({
        titulo: "Mudar status do pedido",
        ok: "Mudar status",
        corpo: `<p>Status atual: ${tagPed(o.status)} ${tagPag(o.payment_status)}</p>
          <p class="texto-peq">Pago, em separação, enviado, entregue e concluído exigem pagamento aprovado. Cancelar devolve o estoque controlado.${o.service_request_id ? " O atendimento de origem acompanha a mudança." : ""}</p>
          ${campo("Novo status", "status", { tipo: "select", opcoes: opcoes(STATUS_PED, o.status) })}
          ${campo("Motivo (opcional)", "motivo", { tipo: "textarea", linhas: 2 })}`,
        perigo: false,
        aoConfirmar: async (dd) => {
          if (dd.status === o.status) throw erroCampo("Escolha um status diferente do atual.", "status");
          if (dd.status === "reembolsado" && !pode("financeiro")) throw erroCampo("Reembolso é registrado pela proprietária.", "status");
          aplicar(await api("POST", base + "/status", { status: dd.status, motivo: dd.motivo }), "Status alterado para " + STATUS_PED[dd.status] + ".");
        },
      }));

      const pg = bt("pagamento");
      if (pg) pg.addEventListener("click", () => dialogo({
        titulo: "Registrar pagamento recebido",
        ok: "Registrar pagamento",
        corpo: `<div class="faixa faixa--alerta"><p><strong>Use só para dinheiro que JÁ ENTROU na conta da loja</strong> e foi conferido na plataforma de pagamento (Pix recebido, maquininha, link pago, dinheiro em mãos).</p><p>Este registro não cobra a cliente. Quando a soma registrada alcança o total, o pedido passa a “Pago”.</p></div>
          ${campo("Forma recebida", "metodo", { tipo: "select", opcoes: opcoes(METODOS, "", "Escolha…"), req: true })}
          ${campoReais("Valor recebido (R$)", "valor", resta || o.total_cents, { req: true })}
          ${campo("Referência conferível", "referencia", { req: true, ajuda: "ID do Pix, NSU da maquininha ou código da transação na plataforma.", attrs: 'autocomplete="off"' })}
          ${campo("Observação (opcional)", "observacao", { tipo: "textarea", linhas: 2 })}`,
        aoConfirmar: async (dd) => {
          if (!dd.metodo) throw erroCampo("Escolha a forma de pagamento recebida.", "metodo");
          const v = paraCentavos(dd.valor);
          if (!v || Number.isNaN(v)) throw erroCampo("Informe o valor recebido.", "valor");
          if (!dd.referencia) throw erroCampo("Informe uma referência conferível.", "referencia");
          aplicar(await api("POST", base + "/pagamento", { metodo: dd.metodo, valor: v, referencia: dd.referencia, observacao: dd.observacao }), "Pagamento registrado.");
        },
      }));

      const lk = bt("link");
      if (lk) lk.addEventListener("click", () => executar(lk, async () => aplicar(await api("POST", base + "/link-pagamento", {}), "Link de pagamento gerado.")));

      const rb = bt("reembolso");
      if (rb) rb.addEventListener("click", () => dialogo({
        titulo: "Registrar reembolso",
        ok: "Registrar reembolso",
        perigo: true,
        corpo: `<p class="faixa faixa--alerta">O pedido será marcado como reembolsado (${esc(brl0(o.total_cents))}) e o estoque controlado volta. Sem plataforma integrada, faça a devolução primeiro na plataforma da loja e informe aqui a referência dela.</p>
          ${campo("Referência da devolução", "referencia", { req: !o.payment_provider || o.payment_provider === "manual", attrs: 'autocomplete="off"' })}
          ${campo("Observação (opcional)", "observacao", { tipo: "textarea", linhas: 2 })}`,
        aoConfirmar: async (dd) => aplicar(await api("POST", base + "/reembolso", { referencia: dd.referencia, observacao: dd.observacao }), "Reembolso registrado."),
      }));

      const et = bt("etiqueta");
      if (et) et.addEventListener("click", () => dialogo({
        titulo: "Gerar etiqueta no Melhor Envio",
        ok: "Gerar etiqueta",
        corpo: `<p>A etiqueta é comprada no Melhor Envio (o valor é debitado do saldo da conta da loja lá), gerada e liberada para impressão.</p><p class="texto-peq">Serviço: ${esc(env && env.nome)}. Precisa dos dados do remetente em Configurações e de peso/medidas nas peças.</p>`,
        aoConfirmar: async () => aplicar(await api("POST", base + "/etiqueta", {}), "Etiqueta gerada."),
      }));

      const rs = bt("rastrear");
      if (rs) rs.addEventListener("click", () => executar(rs, async () => {
        const r = await api("POST", base + "/rastrear", {});
        aplicar(r, r.rastreio ? "Rastreio atualizado." : "O Melhor Envio ainda não tem informação de rastreio.");
      }));

      aoEnviar($("#form-rastreio", alvo), async (dd) => {
        if (!dd.codigo) throw erroCampo("Informe o código de rastreio.", "codigo");
        if (dd.url && !/^https?:\/\//i.test(dd.url)) throw erroCampo("O link precisa começar com https://", "url");
        aplicar(await api("POST", base + "/rastreio", { codigo: dd.codigo, url: dd.url }), "Rastreio salvo.");
      });
      aoEnviar($("#form-nota-ped", alvo), async (dd) => {
        if (!dd.texto) throw erroCampo("Escreva a nota.", "texto");
        aplicar(await api("POST", base + "/nota", { texto: dd.texto }), "Nota adicionada.");
      });
    };

    carregar($("#ped-det", el), () => api("GET", base), (d) => desenhar(d));
  }

  /* ============================================================ 10. produtos e categorias */
  function semMedida(p) { return !p.weight_g || !p.height_cm || !p.width_cm || !p.length_cm; }
  function fotoProduto(p) { return (p.images && p.images[0]) || "assets/img/card/" + p.id + "-a.jpg"; }
  function resumoEstoque(p) {
    const vs = (p.variants || []).filter((v) => v.active);
    if (!vs.length) return "sem variações ativas";
    const ctrl = vs.filter((v) => v.stock != null);
    const total = ctrl.reduce((s, v) => s + Number(v.stock), 0);
    const partes = [];
    if (ctrl.length) partes.push(plural(total, "un.", "un.") + " em " + plural(ctrl.length, "variação", "variações"));
    if (vs.length - ctrl.length) partes.push(plural(vs.length - ctrl.length, "não controlada", "não controladas"));
    return partes.join(" · ");
  }
  function nomeCategoria(slug) { const c = (S.categorias || []).find((x) => x.slug === slug); return c ? c.name : slug || "—"; }

  function telaProdutos(el, args, q) {
    if (args[0]) return formProduto(el, args[0]);
    const filtro = q.filtro || "", busca = q.q || "";
    el.innerHTML = cabecalho("Produtos", "Catálogo, preços, medidas e variações", pode("produtos") ? '<a class="btn" href="#produtos/novo">Novo produto</a>' : "") +
      `<div class="filtros">
        ${chips("Filtrar produtos", [["", "Todos"], ["sem-preco", "Sem preço"], ["sem-medida", "Sem peso/medidas"], ["inativos", "Inativos"]], filtro, "data-filtro")}
        <form class="busca" role="search" id="busca-prod">
          <label class="so-leitor" for="busca-prod-q">Buscar produto</label>
          <input id="busca-prod-q" class="entrada" type="search" value="${esc(busca)}" placeholder="Nome ou código">
          <button type="submit" class="btn btn--peq">Buscar</button>
        </form>
      </div>
      ${pode("produtos") ? "" : '<p class="faixa faixa--info">Seu perfil pode consultar o catálogo. Alterações são feitas pela proprietária.</p>'}
      <div id="lista-prod"></div>`;
    $$("[data-filtro]", el).forEach((b) => b.addEventListener("click", () => irPara(hashCom("produtos", { filtro: b.dataset.filtro, q: busca }))));
    $("#busca-prod", el).addEventListener("submit", (ev) => { ev.preventDefault(); irPara(hashCom("produtos", { filtro, q: $("#busca-prod-q").value.trim() })); });
    carregar($("#lista-prod", el), () => Promise.all([garantirCatalogo(true), garantirCategorias().catch(() => [])]), (r, alvo) => {
      let l = r[0];
      const total = l.length;
      if (filtro === "sem-preco") l = l.filter((p) => p.price_cents == null);
      if (filtro === "sem-medida") l = l.filter(semMedida);
      if (filtro === "inativos") l = l.filter((p) => !p.active);
      if (busca) { const b = busca.toLowerCase(); l = l.filter((p) => (p.name + " " + p.id).toLowerCase().indexOf(b) > -1); }
      if (!total) { alvo.innerHTML = vazio("Nenhum produto cadastrado.", pode("produtos") ? '<a class="btn" href="#produtos/novo">Cadastrar o primeiro</a>' : ""); return; }
      if (!l.length) { alvo.innerHTML = vazio("Nenhum produto com esse filtro."); return; }
      alvo.innerHTML = `<p class="texto-peq">${plural(l.length, "produto", "produtos")}</p>` + tabela(
        ["Foto", "Produto", "Categoria", "Preço", "Estoque", "Situação", ""],
        l.map((p) => [
          `<img class="miniatura" src="${esc(fotoProduto(p))}" alt="" width="48" height="60" loading="lazy">`,
          `<a class="lk-forte" href="#produtos/${enc(p.id)}">${esc(p.name)}</a><br><span class="texto-peq">${esc(p.id)}${p.color_name ? " · " + esc(p.color_name) : ""}</span>`,
          esc(nomeCategoria(p.category)),
          p.price_cents == null ? tag("sem preço", "alerta") : esc(brl(p.price_cents)) + (p.compare_cents ? `<br><s class="texto-peq">${esc(brl(p.compare_cents))}</s>` : ""),
          esc(resumoEstoque(p)),
          (p.active ? tag("ativo", "ok") : tag("inativo", "neutro")) + (semMedida(p) ? " " + tag("sem peso/medidas", "alerta") : ""),
          `<a class="btn btn--vazio btn--peq" href="#produtos/${enc(p.id)}">${pode("produtos") ? "Editar" : "Ver"}<span class="so-leitor"> ${esc(p.name)}</span></a>`,
        ]), "Produtos", "tabela--produtos");
    });
  }

  function formProduto(el, id) {
    const novo = id === "novo";
    if (novo && !pode("produtos")) {
      el.innerHTML = cabecalho("Novo produto") + '<div class="erro-bloco" role="alert"><p><strong>Acesso restrito.</strong> Só a proprietária cadastra produtos.</p></div>';
      return;
    }
    el.innerHTML = `<p class="voltar"><a href="#produtos">← Produtos</a></p><div id="prod-form"></div>`;
    carregar($("#prod-form", el), () => Promise.all([garantirCatalogo(!S.catalogo), garantirCategorias(true)]), (r, alvo) => {
      const p = novo ? { id: "", name: "", category: "", categories: [], color_name: "", colors: [], badges: [], description: "", images: [], price_cents: null, compare_cents: null, weight_g: null, height_cm: null, width_cm: null, length_cm: null, active: true, position: 0, variants: [] }
        : r[0].find((x) => x.id === id);
      if (!p) { alvo.innerHTML = vazio("Produto não encontrado.", '<a class="btn btn--vazio" href="#produtos">Voltar</a>'); return; }
      desenharProduto(alvo, p, novo, r[1]);
    });
  }

  function desenharProduto(alvo, p, novo, cats) {
    const edita = pode("produtos");
    const catOps = '<option value="">Escolha…</option>' + cats.map((c) => `<option value="${esc(c.slug)}"${c.slug === p.category ? " selected" : ""}>${esc(c.name)}${c.active ? "" : " (inativa)"}</option>`).join("");
    alvo.innerHTML = `
      <header class="det-topo">
        <div class="prod-cab">
          ${novo ? "" : `<img class="miniatura miniatura--g" src="${esc(fotoProduto(p))}" alt="" width="72" height="90">`}
          <div>
            <p class="em em--rosa">${novo ? "Cadastro" : "Produto " + esc(p.id)}</p>
            <h1 class="det-titulo">${novo ? "Novo produto" : esc(p.name)}</h1>
            ${novo ? "" : `<p class="det-meta">${p.active ? tag("ativo", "ok") : tag("inativo", "neutro")} ${p.price_cents == null ? tag("sem preço", "alerta") : tag(brl(p.price_cents), "rosa")} ${semMedida(p) ? tag("sem peso/medidas", "alerta") : ""}</p>`}
          </div>
        </div>
      </header>
      ${edita ? "" : '<p class="faixa faixa--info">Somente consulta: seu perfil não altera produtos.</p>'}
      <form id="form-produto" class="cartao" novalidate>
        <fieldset ${edita ? "" : "disabled"} class="sem-borda">
          <legend class="so-leitor">Dados do produto</legend>
          <h2 class="sub-tit">Identificação</h2>
          <div class="grade-campos">
            ${campo("Nome", "nome", { valor: p.name, req: true, cls: "campo--2" })}
            ${campo("Categoria principal", "categoria", { tipo: "select", opcoes: catOps, req: true })}
            ${campo("Posição na vitrine", "posicao", { tipo: "number", valor: p.position || 0, attrs: 'min="0" inputmode="numeric"' })}
            ${campo("Cor (nome)", "cor", { valor: p.color_name || "", ph: "Ex.: Preto" })}
            ${campo("Cores (hexadecimal, separadas por vírgula)", "cores", { valor: (p.colors || []).join(", "), ph: "#000000, #ff65c3", ajuda: "Bolinhas de cor do cartão na loja." })}
            ${campo("Selos (separados por vírgula)", "selos", { valor: (p.badges || []).join(", "), ph: "Novidade, Mais vendido" })}
            ${campo("Produto ativo na loja", "ativo", { tipo: "checkbox", valor: p.active })}
          </div>
          <fieldset class="grupo">
            <legend>Aparece também nas categorias</legend>
            <div class="caixas">${cats.map((c) => `<label class="caixa"><input type="checkbox" name="cat-${esc(c.slug)}" data-cat="${esc(c.slug)}"${(p.categories || []).indexOf(c.slug) > -1 ? " checked" : ""}> <span>${esc(c.name)}</span></label>`).join("") || '<span class="texto-peq">Nenhuma categoria cadastrada.</span>'}</div>
          </fieldset>
          ${campo("Descrição", "descricao", { tipo: "textarea", linhas: 4, valor: p.description || "" })}

          <h2 class="sub-tit">Preço</h2>
          <div class="grade-campos">
            ${campoReais("Preço (R$)", "preco", p.price_cents, { ph: "vazio = sob consulta", ajuda: "Sem preço, a peça só é vendida pelo atendimento." })}
            ${campoReais("Preço “de” (R$, opcional)", "precoDe", p.compare_cents, { ph: "riscado na loja" })}
          </div>

          <h2 class="sub-tit">Embalagem (para o frete)</h2>
          <div class="grade-campos">
            ${campo("Peso (gramas)", "peso", { valor: p.weight_g || "", attrs: 'inputmode="numeric"' })}
            ${campo("Altura (cm)", "altura", { valor: p.height_cm || "", attrs: 'inputmode="decimal"' })}
            ${campo("Largura (cm)", "largura", { valor: p.width_cm || "", attrs: 'inputmode="decimal"' })}
            ${campo("Comprimento (cm)", "comprimento", { valor: p.length_cm || "", attrs: 'inputmode="decimal"' })}
          </div>
          <p class="texto-peq">Use as medidas reais da peça embalada. Sem elas, o frete automático não é calculado.</p>

          <h2 class="sub-tit">Fotos</h2>
          ${campo("Endereços das imagens (uma por linha)", "imagens", { tipo: "textarea", linhas: 3, valor: (p.images || []).join("\n"), ajuda: "Precisam começar com https:// ou assets/. Vazio = fotos padrão do site (assets/img/card/" + (p.id || "<código>") + "-a.jpg)." })}
          ${novo ? campo("Tamanhos iniciais (separados por vírgula)", "tamanhos", { valor: "PP, P, M, G, GG", ajuda: "Cria uma variação por tamanho, com estoque não controlado." }) : ""}
        </fieldset>
        ${edita ? `<div class="linha-acoes"><button type="submit" class="btn">${novo ? "Cadastrar produto" : "Salvar alterações"}</button></div>` : ""}
      </form>
      ${novo ? "" : '<section class="cartao" aria-labelledby="h-var"><div class="cartao-topo"><h2 id="h-var">Variações (tamanho e cor)</h2></div><div id="variantes"></div></section>'}`;

    if (!novo) desenharVariantes(p);
    if (!edita) return;
    aoEnviar($("#form-produto", alvo), async (dd, form) => {
      if (dd.nome.length < 3) throw erroCampo("Nome muito curto.", "nome");
      if (!dd.categoria) throw erroCampo("Escolha a categoria.", "categoria");
      const preco = paraCentavos(dd.preco), precoDe = paraCentavos(dd.precoDe);
      if (Number.isNaN(preco)) throw erroCampo("Preço inválido. Use o formato 129,90.", "preco");
      if (Number.isNaN(precoDe)) throw erroCampo("Preço inválido. Use o formato 159,90.", "precoDe");
      const cores = dd.cores.split(",").map((s) => s.trim()).filter(Boolean);
      if (cores.some((c) => !/^#[0-9a-f]{3,8}$/i.test(c))) throw erroCampo("Use cores em hexadecimal, ex.: #000000.", "cores");
      const imagens = dd.imagens.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      if (imagens.some((u) => !/^(https:\/\/|assets\/)/.test(u))) throw erroCampo("Cada imagem precisa começar com https:// ou assets/.", "imagens");
      for (const k of ["peso", "altura", "largura", "comprimento"]) {
        if (dd[k] && !(parseFloat(dd[k].replace(",", ".")) > 0)) throw erroCampo("Número maior que zero (ou deixe vazio).", k);
      }
      const categorias = $$("[data-cat]", form).filter((i) => i.checked).map((i) => i.dataset.cat);
      if (categorias.indexOf(dd.categoria) < 0) categorias.unshift(dd.categoria);
      const corpo = {
        nome: dd.nome, categoria: dd.categoria, categorias, cor: dd.cor, cores, selos: dd.selos.split(",").map((s) => s.trim()).filter(Boolean),
        descricao: dd.descricao, preco, precoDe, peso: dd.peso, altura: dd.altura, largura: dd.largura, comprimento: dd.comprimento,
        ativo: dd.ativo, posicao: dd.posicao || 0, imagens,
      };
      if (novo) {
        corpo.tamanhos = (dd.tamanhos || "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        const r = await api("POST", "produtos", corpo);
        S.catalogo = null;
        aviso("Produto cadastrado (" + r.id + ").");
        irPara("#produtos/" + enc(r.id));
      } else {
        const r = await api("PUT", "produtos/" + enc(p.id), corpo);
        if (r.produto && S.catalogo) S.catalogo = S.catalogo.map((x) => (x.id === p.id ? r.produto : x));
        aviso("Produto salvo.");
        desenharProduto(alvo, r.produto || p, false, cats);
      }
    });
  }

  function desenharVariantes(p) {
    const box = $("#variantes");
    if (!box) return;
    const edita = pode("produtos");
    const vs = p.variants || [];
    box.innerHTML = (vs.length ? tabela(["Tamanho", "Cor", "SKU", "Estoque", "Situação", ""], vs.map((v) => [
      `<strong>${esc(v.size)}</strong>`,
      esc(v.color || "—"),
      edita ? `<label class="so-leitor" for="sku-${esc(v.id)}">SKU de ${esc(v.size)} ${esc(v.color)}</label><input id="sku-${esc(v.id)}" class="entrada entrada--peq" value="${esc(v.sku || "")}" data-sku="${esc(v.id)}" autocomplete="off">` : esc(v.sku || "—"),
      v.stock == null ? '<span class="texto-peq">não controlado — confirmado no atendimento</span>' : esc(v.stock),
      v.active ? tag("ativa", "ok") : tag("inativa", "neutro"),
      edita ? `<div class="linha-acoes linha-acoes--justa"><button type="button" class="btn btn--vazio btn--peq" data-salvar-sku="${esc(v.id)}">Salvar SKU</button><button type="button" class="btn btn--vazio btn--peq" data-ativar="${esc(v.id)}" data-valor="${v.active ? "0" : "1"}">${v.active ? "Desativar" : "Ativar"}</button></div>` : "",
    ]), "Variações do produto") : vazio("Nenhuma variação. Sem variações, a peça não pode ser escolhida na loja."))
      + (pode("estoque") ? '<p class="texto-peq">Quantidades são ajustadas em <a href="#estoque">Estoque</a>, com registro do motivo.</p>' : "")
      + (edita ? `<form id="form-variante" class="cartao-interno" novalidate>
        <h3 class="sub-tit">Adicionar variação</h3>
        <div class="grade-campos">
          ${campo("Tamanho", "tamanho", { req: true, ph: "Ex.: M", attrs: 'maxlength="6" autocapitalize="characters"' })}
          ${campo("Cor", "cor", { valor: p.color_name || "", ph: "Ex.: Preto" })}
          ${campo("SKU (opcional)", "sku", { attrs: 'autocomplete="off"' })}
          ${campo("Estoque inicial", "estoque", { tipo: "number", attrs: 'min="0" inputmode="numeric"', ajuda: "Vazio = não controlado (confirmado no atendimento)." })}
        </div>
        <button type="submit" class="btn btn--vazio btn--peq">Adicionar variação</button>
      </form>` : "");
    if (!edita) return;
    const recarregar = async (msg) => {
      const cat = await garantirCatalogo(true);
      const np = cat.find((x) => x.id === p.id) || p;
      p.variants = np.variants;
      desenharVariantes(np);
      if (msg) aviso(msg);
    };
    $$("[data-salvar-sku]", box).forEach((b) => b.addEventListener("click", () => executar(b, async () => {
      const inp = box.querySelector(`[data-sku="${b.dataset.salvarSku}"]`);
      await api("PUT", "variantes/" + enc(b.dataset.salvarSku), { sku: inp.value.trim() });
      await recarregar("SKU salvo.");
    })));
    $$("[data-ativar]", box).forEach((b) => b.addEventListener("click", () => executar(b, async () => {
      await api("PUT", "variantes/" + enc(b.dataset.ativar), { ativo: b.dataset.valor === "1" });
      await recarregar(b.dataset.valor === "1" ? "Variação ativada." : "Variação desativada.");
    })));
    aoEnviar($("#form-variante", box), async (dd) => {
      if (!dd.tamanho) throw erroCampo("Informe o tamanho.", "tamanho");
      if (dd.estoque !== "" && !(parseInt(dd.estoque, 10) >= 0)) throw erroCampo("Estoque inválido.", "estoque");
      if ((p.variants || []).some((v) => v.size === dd.tamanho.toUpperCase() && (v.color || "") === dd.cor)) throw erroCampo("Já existe uma variação com este tamanho e cor.", "tamanho");
      const r = await api("POST", "produtos/" + enc(p.id) + "/variantes", { tamanho: dd.tamanho, cor: dd.cor, sku: dd.sku, estoque: dd.estoque });
      if (r.produto) { p.variants = r.produto.variants; S.catalogo = null; desenharVariantes(r.produto); aviso("Variação adicionada."); }
      else await recarregar("Variação adicionada.");
    });
  }

  function telaCategorias(el) {
    const edita = pode("produtos");
    el.innerHTML = cabecalho("Categorias", "Organização da vitrine da loja") + '<div id="cats"></div>';
    const desenhar = (cats, alvo) => {
      S.categorias = cats;
      alvo.innerHTML = (cats.length ? `<ul class="lista-cats">${cats.map((c, i) => `
        <li class="cartao cat-linha">
          <form data-slug="${esc(c.slug)}" novalidate>
            <fieldset ${edita ? "" : "disabled"} class="sem-borda">
              <legend class="so-leitor">Categoria ${esc(c.name)}</legend>
              <div class="grade-campos grade-campos--cat">
                ${campo("Nome", "nome", { valor: c.name, req: true })}
                <div class="campo"><span class="rotulo">Endereço (slug)</span><span class="slug">${esc(c.slug)}</span></div>
                ${campo("Posição", "posicao", { tipo: "number", valor: c.position, attrs: 'min="0" max="999" inputmode="numeric"' })}
                ${campo("Vitrine (Novidades, Promoções…)", "vitrine", { tipo: "checkbox", valor: c.is_showcase })}
                ${campo("Ativa", "ativo", { tipo: "checkbox", valor: c.active })}
                ${edita ? `<div class="campo campo--acao"><button type="submit" class="btn btn--vazio btn--peq">Salvar<span class="so-leitor"> ${esc(c.name)}</span></button></div>` : ""}
              </div>
            </fieldset>
          </form>
        </li>`).join("")}</ul>` : vazio("Nenhuma categoria cadastrada."))
        + (edita ? `<form id="form-nova-cat" class="cartao" novalidate>
          <h2 class="sub-tit">Nova categoria</h2>
          <div class="grade-campos">
            ${campo("Nome", "nome", { req: true })}
            ${campo("Slug (opcional)", "slug", { ph: "gerado a partir do nome", attrs: 'autocomplete="off"' })}
            ${campo("Posição", "posicao", { tipo: "number", valor: (cats.length + 1), attrs: 'min="0" max="999"' })}
            ${campo("Vitrine", "vitrine", { tipo: "checkbox", valor: false })}
          </div>
          <button type="submit" class="btn">Criar categoria</button>
        </form>` : '<p class="faixa faixa--info">Somente consulta: seu perfil não altera categorias.</p>');
      if (!edita) return;
      $$("form[data-slug]", alvo).forEach((f) => aoEnviar(f, async (dd) => {
        if (dd.nome.length < 2) throw erroCampo("Nome muito curto.", "nome");
        const r = await api("PUT", "categorias/" + enc(f.dataset.slug), { nome: dd.nome, posicao: dd.posicao, vitrine: dd.vitrine, ativo: dd.ativo });
        desenhar(r.categorias || [], alvo);
        aviso("Categoria salva.");
      }));
      aoEnviar($("#form-nova-cat", alvo), async (dd) => {
        if (dd.nome.length < 2) throw erroCampo("Nome muito curto.", "nome");
        if (dd.slug && !/^[a-z0-9-]{2,40}$/.test(dd.slug)) throw erroCampo("Slug: letras minúsculas, números e hífen.", "slug");
        if (cats.some((c) => c.slug === dd.slug)) throw erroCampo("Já existe uma categoria com este slug.", "slug");
        const r = await api("POST", "categorias", { nome: dd.nome, slug: dd.slug, posicao: dd.posicao, vitrine: dd.vitrine });
        desenhar(r.categorias || [], alvo);
        aviso("Categoria criada.");
      });
    };
    carregar($("#cats", el), () => garantirCategorias(true), desenhar);
  }

  /* ============================================================ 11. estoque */
  function telaEstoque(el, args, q) {
    const aba = args[0] === "movimentos" ? "movimentos" : "variacoes";
    el.innerHTML = cabecalho("Estoque", "Quantidades por variação, com histórico de cada mudança") +
      `<nav class="abas" aria-label="Seções do estoque"><a href="#estoque" ${aba === "variacoes" ? 'aria-current="page"' : ""}>Variações</a><a href="#estoque/movimentos" ${aba === "movimentos" ? 'aria-current="page"' : ""}>Movimentações</a></nav>
      <div id="estoque-corpo"></div>`;
    const corpo = $("#estoque-corpo", el);
    if (aba === "movimentos") {
      carregar(corpo, () => api("GET", "estoque/movimentos"), (d, alvo) => {
        const l = d.movimentos || [];
        alvo.innerHTML = l.length ? `<p class="texto-peq">Últimas ${l.length} movimentações.</p>` + tabela(["Data", "Peça", "Variação", "Mudança", "Motivo", "Referência", "Observação", "Por"], l.map((m) => [
          esc(dataHora(m.created_at)), esc(m.produto), esc(m.size) + (m.color ? " · " + esc(m.color) : ""),
          `<strong class="${m.delta > 0 ? "delta-mais" : m.delta < 0 ? "delta-menos" : ""}">${m.delta > 0 ? "+" : ""}${esc(m.delta)}</strong>`,
          esc(m.reason), esc([m.ref_type, m.ref_id].filter(Boolean).join(" ")), esc(m.note || "—"), esc(m.staff_nome || "—"),
        ]), "Movimentações de estoque") : vazio("Nenhuma movimentação registrada ainda.");
      });
      return;
    }
    const filtro = q.filtro || "", busca = q.q || "";
    corpo.innerHTML = `<div class="filtros">
        ${chips("Filtrar variações", [["", "Todas"], ["baixo", "Baixo (até 2)"], ["nao", "Não controladas"], ["inativas", "Inativas"]], filtro, "data-filtro")}
        <form class="busca" role="search" id="busca-est">
          <label class="so-leitor" for="busca-est-q">Buscar peça</label>
          <input id="busca-est-q" class="entrada" type="search" value="${esc(busca)}" placeholder="Peça, tamanho ou SKU">
          <button type="submit" class="btn btn--peq">Buscar</button>
        </form>
      </div><div id="lista-est"></div>`;
    $$("[data-filtro]", corpo).forEach((b) => b.addEventListener("click", () => irPara(hashCom("estoque", { filtro: b.dataset.filtro, q: busca }))));
    $("#busca-est", corpo).addEventListener("submit", (ev) => { ev.preventDefault(); irPara(hashCom("estoque", { filtro, q: $("#busca-est-q").value.trim() })); });
    let todas = [];
    const desenhar = (alvo) => {
      let l = todas;
      if (filtro === "baixo") l = l.filter((v) => v.stock != null && v.stock <= 2 && v.active);
      if (filtro === "nao") l = l.filter((v) => v.stock == null);
      if (filtro === "inativas") l = l.filter((v) => !v.active || !v.produto_ativo);
      if (busca) { const b = busca.toLowerCase(); l = l.filter((v) => [v.produto, v.size, v.color, v.sku].join(" ").toLowerCase().indexOf(b) > -1); }
      if (!todas.length) { alvo.innerHTML = vazio("Nenhuma variação cadastrada."); return; }
      if (!l.length) { alvo.innerHTML = vazio("Nenhuma variação com esse filtro."); return; }
      alvo.innerHTML = `<p class="texto-peq">${plural(l.length, "variação", "variações")}</p>` + tabela(["Peça", "Tamanho", "Cor", "SKU", "Estoque", "Situação", ""], l.map((v) => [
        esc(v.produto), `<strong>${esc(v.size)}</strong>`, esc(v.color || "—"), esc(v.sku || "—"),
        v.stock == null ? '<span class="texto-peq">não controlado — confirmado no atendimento</span>' : (Number(v.stock) <= 2 ? tag(v.stock === 0 ? "esgotado" : v.stock + " un.", v.stock === 0 ? "perigo" : "alerta") : `<strong>${esc(v.stock)}</strong>`),
        (v.active ? "" : tag("variação inativa", "neutro") + " ") + (v.produto_ativo ? "" : tag("produto inativo", "neutro")) || tag("ativa", "ok"),
        `<button type="button" class="btn btn--vazio btn--peq" data-ajustar="${esc(v.id)}">Ajustar<span class="so-leitor"> ${esc(v.produto)} ${esc(v.size)}</span></button>`,
      ]), "Estoque por variação");
      $$("[data-ajustar]", alvo).forEach((b) => b.addEventListener("click", () => ajustar(todas.find((v) => v.id === b.dataset.ajustar), alvo)));
    };
    const ajustar = (v, alvo) => dialogo({
      titulo: "Ajustar estoque",
      ok: "Salvar",
      corpo: `<p><strong>${esc(v.produto)}</strong> · Tam. ${esc(v.size)}${v.color ? " · " + esc(v.color) : ""}<br>Estoque atual: ${v.stock == null ? "não controlado" : esc(v.stock)}</p>
        <fieldset class="grupo">
          <legend>O que fazer</legend>
          <label class="caixa"><input type="radio" name="modo" value="ajuste" checked> <span>Entrada ou saída (+/−)</span></label>
          <label class="caixa"><input type="radio" name="modo" value="definir"> <span>Definir a quantidade contada</span></label>
          <label class="caixa"><input type="radio" name="modo" value="nao_controlar"> <span>Deixar de controlar (confirmado no atendimento)</span></label>
        </fieldset>
        <div id="campo-valor">${campo("Quantidade", "valor", { tipo: "number", attrs: 'inputmode="numeric" step="1"', ajuda: "Positivo para entrada, negativo para saída. Ex.: -2" })}</div>
        ${campo("Motivo", "motivo", { ph: "Ex.: reposição, defeito, contagem mensal" })}`,
      aoAbrir: (c) => {
        const ajuda = $("#campo-valor .ajuda", c), box = $("#campo-valor", c);
        $$('input[name="modo"]', c).forEach((r) => r.addEventListener("change", () => {
          box.hidden = r.value === "nao_controlar" && r.checked;
          if (r.checked && r.value === "ajuste") ajuda.textContent = "Positivo para entrada, negativo para saída. Ex.: -2";
          if (r.checked && r.value === "definir") ajuda.textContent = "Quantidade física contada agora (0 ou mais).";
        }));
      },
      aoConfirmar: async (dd) => {
        const corpoReq = { modo: dd.modo, motivo: dd.motivo };
        if (dd.modo !== "nao_controlar") {
          const n = parseInt(dd.valor, 10);
          if (!/^-?\d+$/.test(dd.valor || "")) throw erroCampo("Informe um número inteiro.", "valor");
          if (dd.modo === "ajuste" && n === 0) throw erroCampo("Informe quanto entra (+) ou sai (−).", "valor");
          if (dd.modo === "definir" && n < 0) throw erroCampo("A contagem não pode ser negativa.", "valor");
          if (dd.modo === "ajuste" && (v.stock || 0) + n < 0) throw erroCampo("O estoque não pode ficar negativo.", "valor");
          corpoReq.valor = n;
        }
        const r = await api("POST", "estoque/" + enc(v.id), corpoReq);
        v.stock = r.estoque === undefined ? v.stock : r.estoque;
        S.catalogo = null;
        desenhar(alvo);
        aviso("Estoque atualizado: " + v.produto + " " + v.size + " → " + (v.stock == null ? "não controlado" : v.stock) + ".");
      },
    });
    carregar($("#lista-est", corpo), () => api("GET", "estoque"), (d, alvo) => { todas = d.variantes || []; desenhar(alvo); });
  }

  /* ============================================================ 12. clientes e financeiro */
  function telaClientes(el, args, q) {
    if (args[0]) return detalheCliente(el, args[0]);
    const busca = q.q || "";
    el.innerHTML = cabecalho("Clientes", "Contas criadas no site") +
      `<div class="filtros"><form class="busca" role="search" id="busca-cli">
        <label class="so-leitor" for="busca-cli-q">Buscar cliente</label>
        <input id="busca-cli-q" class="entrada" type="search" value="${esc(busca)}" placeholder="Nome, e-mail ou WhatsApp">
        <button type="submit" class="btn btn--peq">Buscar</button>
      </form></div><div id="lista-cli"></div>`;
    $("#busca-cli", el).addEventListener("submit", (ev) => { ev.preventDefault(); irPara(hashCom("clientes", { q: $("#busca-cli-q").value.trim() })); });
    carregar($("#lista-cli", el), () => api("GET", "clientes" + (busca ? "?q=" + enc(busca) : "")), (d, alvo) => {
      const l = d.clientes || [];
      if (!l.length) { alvo.innerHTML = vazio(busca ? "Nenhuma cliente encontrada." : "Nenhuma cliente com conta no site ainda."); return; }
      alvo.innerHTML = `<p class="texto-peq">${plural(l.length, "cliente", "clientes")}</p>` + tabela(["Cliente", "WhatsApp", "Pedidos", "Atendimentos", "Total pago", "Desde"], l.map((c) => [
        `<a class="lk-forte" href="#clientes/${enc(c.id)}">${esc(c.name)}</a><br><span class="texto-peq">${esc(c.email)}</span>`,
        esc(fone(c.whatsapp)), esc(c.pedidos), esc(c.atendimentos), esc(brl0(c.gasto)), esc(dataCurta(c.criado)),
      ]), "Clientes");
    });
  }

  function detalheCliente(el, id) {
    el.innerHTML = `<p class="voltar"><a href="#clientes">← Clientes</a></p><div id="cli-det"></div>`;
    carregar($("#cli-det", el), () => api("GET", "clientes/" + enc(id)), (d, alvo) => {
      const c = d.cliente, ped = d.pedidos || [], ats = d.atendimentos || [], ends = d.enderecos || [];
      alvo.innerHTML = `
        <header class="det-topo"><div><p class="em em--rosa">Cliente</p><h1 class="det-titulo">${esc(c.name)}</h1><p class="det-meta"><span>Conta criada em ${esc(dataCurta(c.criado))}</span></p></div></header>
        <div class="det-grade">
          <div class="det-principal">
            <section class="cartao" aria-labelledby="h-cp"><div class="cartao-topo"><h2 id="h-cp">Pedidos</h2></div>
              ${ped.length ? tabela(["Código", "Status", "Pagamento", "Total", "Data"], ped.map((o) => [
                pode("pedidos") ? `<a class="lk-forte" href="#pedidos/${enc(o.id)}">${esc(o.code)}</a>` : esc(o.code), tagPed(o.status),
                tag(STATUS_PAG[o.payment_status] || o.payment_status, TOM_PAG[o.payment_status]), esc(brl0(o.total_cents)), esc(dataHora(o.created_at)),
              ]), "Pedidos da cliente") : vazio("Nenhum pedido.")}
            </section>
            <section class="cartao" aria-labelledby="h-ca"><div class="cartao-topo"><h2 id="h-ca">Atendimentos</h2></div>
              ${ats.length ? tabela(["Código", "Status", "Data"], ats.map((s) => [
                pode("atendimento") ? `<a class="lk-forte" href="#atendimento/${enc(s.id)}">${esc(s.code)}</a>` : esc(s.code), tagAt(s.status), esc(dataHora(s.created_at)),
              ]), "Atendimentos da cliente") : vazio("Nenhum atendimento.")}
            </section>
          </div>
          <aside class="det-lateral">
            <section class="cartao" aria-labelledby="h-cd"><div class="cartao-topo"><h2 id="h-cd">Contato</h2></div>
              <dl class="dados">
                <div><dt>E-mail</dt><dd>${esc(c.email || "—")}</dd></div>
                <div><dt>WhatsApp</dt><dd>${esc(fone(c.whatsapp))}${linkWa(c.whatsapp) ? ` · <a href="${esc(linkWa(c.whatsapp))}" target="_blank" rel="noopener">abrir conversa</a>` : ""}</dd></div>
                <div><dt>Nascimento</dt><dd>${c.birth_date ? esc(diaBR(String(c.birth_date).slice(0, 10))) : "—"}</dd></div>
              </dl>
            </section>
            <section class="cartao" aria-labelledby="h-ce"><div class="cartao-topo"><h2 id="h-ce">Endereços</h2></div>
              ${ends.length ? `<ul class="lista-simples lista-simples--bloco">${ends.map((e) => `<li><p><strong>${esc(e.label)}</strong>${e.is_default ? " " + tag("principal", "rosa") : ""}</p><p>${esc(e.recipient)}<br>${esc(e.street)}, ${esc(e.number)}${e.complement ? " — " + esc(e.complement) : ""}<br>${esc(e.district)} · ${esc(e.city)}/${esc(e.uf)} · CEP ${esc(cepFmt(e.cep))}</p></li>`).join("")}</ul>` : vazio("Nenhum endereço salvo.")}
            </section>
          </aside>
        </div>`;
    });
  }

  function formPeriodo(id, de, ate) {
    return `<form class="filtros filtros--form" id="${id}">
      ${campo("De", "de", { tipo: "date", valor: de, req: true })}
      ${campo("Até", "ate", { tipo: "date", valor: ate, req: true })}
      <button type="submit" class="btn btn--peq">Aplicar período</button>
    </form>`;
  }
  function lerPeriodo(q) {
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
    return { de: ok(q.de) ? q.de : hojeMais(-29), ate: ok(q.ate) ? q.ate : hojeMais(0) };
  }

  function telaFinanceiro(el, args, q) {
    const p = lerPeriodo(q);
    el.innerHTML = cabecalho("Financeiro", "Recebimentos e transações do período") + formPeriodo("per-fin", p.de, p.ate) + '<div id="fin"></div>';
    $("#per-fin", el).addEventListener("submit", (ev) => {
      ev.preventDefault();
      const dd = dadosForm(ev.currentTarget);
      if (dd.de > dd.ate) { aviso("A data inicial precisa ser antes da final.", "erro"); return; }
      irPara(hashCom("financeiro", dd));
    });
    carregar($("#fin", el), () => api("GET", "financeiro?de=" + p.de + "&ate=" + p.ate), (d, alvo) => {
      const r = d.resumo || {}, met = d.porMetodo || [], tx = d.transacoes || [], prov = d.provedor || {};
      alvo.innerHTML = `
        <section class="grade-num" aria-label="Resumo do período">
          ${numCartao("Recebido", brl0(r.recebido), "", "num-cartao--ok")}
          ${numCartao("A receber", brl0(r.a_receber), "")}
          ${numCartao("Estornado", brl0(r.estornado), "")}
          ${numCartao("Descontos concedidos", brl0(r.descontos), "")}
          ${numCartao("Fretes cobrados", brl0(r.fretes), "")}
        </section>
        <p class="texto-peq nota-baixa">Resumo por pedidos criados entre ${esc(diaBR(p.de))} e ${esc(diaBR(p.ate))}, conforme a situação de pagamento atual.</p>
        <p class="faixa faixa--info"><strong>Plataforma de pagamento:</strong> ${prov.configurado ? "ativa" + (prov.provedor ? " (" + esc(prov.provedor) + ")" : "") : "não configurado"}. ${esc(prov.observacao || "")}</p>
        <div class="grade-2">
          <section class="cartao" aria-labelledby="h-met"><div class="cartao-topo"><h2 id="h-met">Por forma de pagamento</h2></div>
            ${met.length ? tabela(["Forma", "Plataforma", "Transações", "Total"], met.map((m) => [esc(METODOS[m.metodo] || m.metodo), esc(m.provider), esc(m.n), esc(brl0(m.total))]), "Recebimentos por forma") : vazio("Nenhum pagamento aprovado no período.")}
          </section>
        </div>
        <section class="cartao" aria-labelledby="h-tx"><div class="cartao-topo"><h2 id="h-tx">Transações</h2></div>
          ${tx.length ? tabela(["Data", "Pedido", "Forma", "Plataforma", "Situação", "Valor", "Referência", "Por", "Observação"], tx.map((x) => [
            esc(dataHora(x.created_at)), x.pedido ? (pode("pedidos") && x.order_id ? `<a class="lk-forte" href="#pedidos/${enc(x.order_id)}">${esc(x.pedido)}</a>` : esc(x.pedido)) : "—",
            esc(METODOS[x.method] || x.method || "—"), esc(x.provider), tag(STATUS_PAG[x.status] || x.status, TOM_PAG[x.status]),
            esc(brl0(x.amount_cents)), `<span class="quebra">${esc(x.provider_ref)}</span>`, esc(x.staff_nome || "—"), esc(x.note || "—"),
          ]), "Transações do período") : vazio("Nenhuma transação no período.")}
        </section>`;
    });
  }

  /* ============================================================ 13. cupons */
  function valorCupom(c) { return c.kind === "percent" ? c.value + "%" : c.kind === "fixed" ? brl0(c.value) : "Frete grátis"; }

  function telaCupons(el) {
    el.innerHTML = cabecalho("Cupons", "Descontos para o site e para o atendimento", '<button type="button" class="btn" id="bt-novo-cupom">Novo cupom</button>') + '<div id="cupons"></div>';
    let lista = [];
    const alvo = $("#cupons", el);
    const desenhar = () => {
      if (!lista.length) { alvo.innerHTML = vazio("Nenhum cupom criado."); return; }
      const agora = Date.now();
      alvo.innerHTML = tabela(["Código", "Tipo", "Valor", "Mínimo", "Usos", "Validade", "Situação", ""], lista.map((c) => {
        const expirado = c.ends_at && new Date(c.ends_at).getTime() < agora;
        const esgotado = c.max_uses != null && c.uses >= c.max_uses;
        return [
          `<strong>${esc(c.code)}</strong>`, esc(TIPOS_CUPOM[c.kind] || c.kind), esc(valorCupom(c)), c.min_cents ? esc(brl0(c.min_cents)) : "—",
          esc(c.uses) + (c.max_uses != null ? " / " + esc(c.max_uses) : ""),
          (c.starts_at ? "de " + esc(dataCurta(c.starts_at)) + " " : "") + (c.ends_at ? "até " + esc(dataCurta(c.ends_at)) : (c.starts_at ? "" : "sem prazo")),
          !c.active ? tag("inativo", "neutro") : expirado ? tag("expirado", "alerta") : esgotado ? tag("esgotado", "alerta") : tag("ativo", "ok"),
          `<div class="linha-acoes linha-acoes--justa"><button type="button" class="btn btn--vazio btn--peq" data-editar="${esc(c.code)}">Editar<span class="so-leitor"> ${esc(c.code)}</span></button><button type="button" class="btn btn--vazio btn--peq" data-alternar="${esc(c.code)}">${c.active ? "Desativar" : "Reativar"}<span class="so-leitor"> ${esc(c.code)}</span></button></div>`,
        ];
      }), "Cupons");
      $$("[data-editar]", alvo).forEach((b) => b.addEventListener("click", () => formCupom(lista.find((c) => c.code === b.dataset.editar))));
      $$("[data-alternar]", alvo).forEach((b) => b.addEventListener("click", () => {
        const c = lista.find((x) => x.code === b.dataset.alternar);
        dialogo({
          titulo: (c.active ? "Desativar" : "Reativar") + " cupom " + c.code + "?",
          ok: c.active ? "Desativar" : "Reativar",
          perigo: c.active,
          corpo: `<p>${c.active ? "O cupom deixa de ser aceito no site e no atendimento. O histórico de uso é mantido (cupons não são apagados)." : "O cupom volta a ser aceito, respeitando validade e limite de usos."}</p>`,
          aoConfirmar: async () => {
            const r = await api("PUT", "cupons/" + enc(c.code), {
              codigo: c.code, tipo: c.kind, valor: c.value, minimo: c.min_cents, maxUsos: c.max_uses, inicio: c.starts_at, fim: c.ends_at, ativo: !c.active,
            });
            lista = r.cupons || []; desenhar();
            aviso("Cupom " + c.code + (c.active ? " desativado." : " reativado."));
          },
        });
      }));
    };
    const formCupom = (c) => {
      const novo = !c;
      c = c || { code: "", kind: "percent", value: "", min_cents: 0, max_uses: null, starts_at: null, ends_at: null, active: true };
      dialogo({
        titulo: novo ? "Novo cupom" : "Editar cupom " + c.code,
        ok: novo ? "Criar cupom" : "Salvar",
        corpo: `<div class="grade-campos">
          ${campo("Código", "codigo", { valor: c.code, req: true, attrs: (novo ? "" : "readonly ") + 'autocapitalize="characters" autocomplete="off" maxlength="40"', ajuda: novo ? "3 a 40 letras, números, _ ou -." : "O código não muda." })}
          ${campo("Tipo", "tipo", { tipo: "select", opcoes: opcoes(TIPOS_CUPOM, c.kind) })}
          <div id="cupom-valor">${campo(c.kind === "fixed" ? "Valor do desconto (R$)" : "Percentual (%)", "valor", { valor: c.kind === "fixed" ? paraCampo(c.value) : c.value, req: true, attrs: 'inputmode="decimal"' })}</div>
          ${campoReais("Compra mínima (R$, opcional)", "minimo", c.min_cents || null)}
          ${campo("Limite de usos (opcional)", "maxUsos", { tipo: "number", valor: c.max_uses == null ? "" : c.max_uses, attrs: 'min="1" inputmode="numeric"' })}
          ${campo("Começa em (opcional)", "inicio", { tipo: "date", valor: isoRecife(c.starts_at) })}
          ${campo("Termina em (opcional)", "fim", { tipo: "date", valor: isoRecife(c.ends_at) })}
          ${campo("Ativo", "ativo", { tipo: "checkbox", valor: c.active })}
        </div>
        <p class="texto-peq">Cupom de frete grátis é aplicado no checkout do site; no atendimento, ajuste o frete manualmente.</p>`,
        aoAbrir: (corpo) => {
          const sel = corpo.querySelector('[name="tipo"]'), box = $("#cupom-valor", corpo);
          const atualizar = () => {
            box.hidden = sel.value === "frete";
            const rot = box.querySelector("label");
            rot.childNodes[0].textContent = sel.value === "fixed" ? "Valor do desconto (R$)" : "Percentual (%)";
          };
          sel.addEventListener("change", atualizar); atualizar();
        },
        aoConfirmar: async (dd) => {
          const codigo = (dd.codigo || "").toUpperCase().replace(/\s+/g, "");
          if (!/^[A-Z0-9_-]{3,40}$/.test(codigo)) throw erroCampo("Código: 3 a 40 letras, números, _ ou -.", "codigo");
          let valor = 0;
          if (dd.tipo === "percent") { valor = parseInt(dd.valor, 10); if (!(valor >= 1 && valor <= 100)) throw erroCampo("Percentual entre 1 e 100.", "valor"); }
          if (dd.tipo === "fixed") { valor = paraCentavos(dd.valor); if (!valor || Number.isNaN(valor)) throw erroCampo("Informe o valor do desconto.", "valor"); }
          const minimo = paraCentavos(dd.minimo);
          if (Number.isNaN(minimo)) throw erroCampo("Valor inválido.", "minimo");
          if (dd.inicio && dd.fim && dd.inicio > dd.fim) throw erroCampo("O fim precisa ser depois do início.", "fim");
          const r = await api(novo ? "POST" : "PUT", novo ? "cupons" : "cupons/" + enc(c.code), {
            codigo, tipo: dd.tipo, valor, minimo: minimo || 0, maxUsos: dd.maxUsos || null,
            inicio: dd.inicio ? dd.inicio + "T00:00:00-03:00" : null, fim: dd.fim ? dd.fim + "T23:59:59-03:00" : null, ativo: dd.ativo,
          });
          lista = r.cupons || []; desenhar();
          aviso(novo ? "Cupom " + codigo + " criado." : "Cupom salvo.");
        },
      });
    };
    $("#bt-novo-cupom", el).addEventListener("click", () => formCupom(null));
    carregar(alvo, () => api("GET", "cupons"), (d) => { lista = d.cupons || []; desenhar(); });
  }

  /* ============================================================ 14. entregas */
  function telaEntregas(el) {
    el.innerHTML = cabecalho("Entregas", "Pedidos pagos para separar e enviar, e pedidos do atendimento aguardando pagamento") + '<div id="entregas"></div>';
    const alvo = $("#entregas", el);
    const buscar = () => api("GET", "entregas");
    const desenhar = (d) => {
      const l = d.entregas || [], me = (d.frete && d.frete.melhorEnvio) || {};
      alvo.innerHTML = `<p class="faixa ${me.configurado ? "faixa--ok" : "faixa--alerta"}">Melhor Envio: ${me.configurado ? "configurado (" + (me.ambiente === "producao" ? "produção" : "sandbox — etiquetas de teste") + ")" : "não configurado — etiquetas automáticas indisponíveis; informe o rastreio manualmente no pedido"}.</p>`
        + (l.length ? tabela(["Pedido", "Cliente", "Destino", "Entrega", "Status", "Pagamento", "Rastreio", "Ações"], l.map((o) => {
          const env = o.shipping || {};
          const podeEtiqueta = env.tipo === "melhorenvio" && o.payment_status === "aprovado" && !o.shipping_label_id;
          return [
            `<a class="lk-forte" href="#pedidos/${enc(o.id)}">${esc(o.code)}</a><br><span class="texto-peq">${esc(dataCurta(o.created_at))}</span>`,
            esc(o.name), o.cidade ? esc(o.cidade) + "/" + esc(o.uf) : (env.tipo === "retirada" ? "Retirada" : "—"),
            esc(env.nome || TIPOS_FRETE[env.tipo] || "—"), tagPed(o.status), tag(STATUS_PAG[o.payment_status] || o.payment_status, TOM_PAG[o.payment_status]),
            esc(o.tracking_code || "—") + (o.shipping_label_id ? `<br><span class="texto-peq">Etiqueta ${esc(o.shipping_label_id)}</span>` : ""),
            `<div class="linha-acoes linha-acoes--justa">${podeEtiqueta ? `<button type="button" class="btn btn--peq" data-etiqueta="${esc(o.id)}" data-codigo="${esc(o.code)}">Gerar etiqueta<span class="so-leitor"> do pedido ${esc(o.code)}</span></button>` : ""}<a class="btn btn--vazio btn--peq" href="#pedidos/${enc(o.id)}">Abrir pedido<span class="so-leitor"> ${esc(o.code)}</span></a></div>`,
          ];
        }), "Pedidos para entrega") : vazio("Nenhum pedido aguardando envio."));
      $$("[data-etiqueta]", alvo).forEach((b) => b.addEventListener("click", () => dialogo({
        titulo: "Gerar etiqueta do pedido " + b.dataset.codigo + "?",
        ok: "Gerar etiqueta",
        corpo: "<p>A etiqueta é comprada no Melhor Envio (debita o saldo da conta da loja lá), gerada e liberada para impressão.</p>",
        aoConfirmar: async () => {
          const r = await api("POST", "pedidos/" + enc(b.dataset.etiqueta) + "/etiqueta", {});
          const url = urlSegura(r.etiqueta && r.etiqueta.urlImpressao);
          carregar(alvo, buscar, (d2) => {
            desenhar(d2);
            alvo.insertAdjacentHTML("afterbegin", `<p class="faixa faixa--ok">Etiqueta do pedido ${esc(b.dataset.codigo)} gerada.${url ? ` <a class="lk-forte" href="${esc(url)}" target="_blank" rel="noopener">Imprimir etiqueta</a>` : ""}</p>`);
          });
        },
      })));
    };
    carregar(alvo, buscar, desenhar);
  }

  /* ============================================================ 15. relatórios */
  function diasEntre(de, ate) {
    const a = de.split("-").map(Number), b = ate.split("-").map(Number);
    let t = Date.UTC(a[0], a[1] - 1, a[2]);
    const fim = Date.UTC(b[0], b[1] - 1, b[2]);
    const out = [];
    while (t <= fim && out.length < 400) { out.push(new Date(t).toISOString().slice(0, 10)); t += 864e5; }
    return out;
  }

  function graficoDias(de, ate, porDia) {
    const mapa = {};
    porDia.forEach((r) => { mapa[r.dia] = r; });
    const dias = diasEntre(de, ate).map((dia) => ({ dia, total: mapa[dia] ? mapa[dia].total || 0 : 0, pedidos: mapa[dia] ? mapa[dia].pedidos || 0 : 0 }));
    if (!dias.length) return "";
    const max = Math.max(1, ...dias.map((d) => d.total));
    const soma = dias.reduce((s, d) => s + d.total, 0);
    const W = dias.length * 10, H = 100;
    const barras = dias.map((d, i) => {
      const h = d.total ? Math.max(1.5, (d.total / max) * (H - 4)) : 0.8;
      return `<rect x="${(i * 10 + 1.5).toFixed(1)}" y="${(H - h).toFixed(1)}" width="7" height="${h.toFixed(1)}" class="${d.total ? "barra" : "barra barra--zero"}"><title>${esc(diaBR(d.dia))}: ${esc(brl0(d.total))} · ${esc(plural(d.pedidos, "pedido", "pedidos"))}</title></rect>`;
    }).join("");
    return `<figure class="grafico">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfico de vendas por dia de ${esc(diaBR(de))} a ${esc(diaBR(ate))}. Total ${esc(brl0(soma))}; maior dia ${esc(brl0(max === 1 && !soma ? 0 : max))}. Os valores estão na tabela abaixo.">${barras}</svg>
      <figcaption class="grafico-eixo"><span>${esc(diaBR(de))}</span><span>Maior dia: ${esc(brl0(max === 1 && !soma ? 0 : max))}</span><span>${esc(diaBR(ate))}</span></figcaption>
    </figure>`;
  }

  function csv(linhas) {
    const cel = (c) => {
      let s = String(c == null ? "" : c);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return "\ufeff" + linhas.map((l) => l.map(cel).join(";")).join("\r\n");
  }
  const reaisCsv = (c) => ((Number(c) || 0) / 100).toFixed(2).replace(".", ",");

  function telaRelatorios(el, args, q) {
    const p = lerPeriodo(q);
    el.innerHTML = cabecalho("Relatórios", "Vendas pagas no período (por data de pagamento)") + formPeriodo("per-rel", p.de, p.ate) + '<div id="rel"></div>';
    $("#per-rel", el).addEventListener("submit", (ev) => {
      ev.preventDefault();
      const dd = dadosForm(ev.currentTarget);
      if (dd.de > dd.ate) { aviso("A data inicial precisa ser antes da final.", "erro"); return; }
      irPara(hashCom("relatorios", dd));
    });
    carregar($("#rel", el), () => api("GET", "relatorios?de=" + p.de + "&ate=" + p.ate), (d, alvo) => {
      const dia = d.porDia || [], prod = d.porProduto || [], canal = d.porCanal || [], vend = d.porVendedor || [];
      const total = dia.reduce((s, r) => s + (r.total || 0), 0), pedidos = dia.reduce((s, r) => s + (r.pedidos || 0), 0);
      alvo.innerHTML = `
        <section class="grade-num" aria-label="Totais do período">
          ${numCartao("Vendido", brl0(total), "", "num-cartao--ok")}
          ${numCartao("Pedidos pagos", pedidos, "")}
          ${numCartao("Ticket médio", pedidos ? brl0(Math.round(total / pedidos)) : brl0(0), "")}
        </section>
        <div class="linha-acoes"><button type="button" class="btn btn--vazio" id="bt-csv">Exportar CSV</button></div>
        <section class="cartao" aria-labelledby="h-dia"><div class="cartao-topo"><h2 id="h-dia">Vendas por dia</h2></div>
          ${dia.length ? graficoDias(p.de, p.ate, dia) + `<details class="detalhes"><summary>Ver dados em tabela</summary>${tabela(["Dia", "Pedidos", "Total"], dia.map((r) => [esc(diaBR(r.dia)), esc(r.pedidos), esc(brl0(r.total))]), "Vendas por dia")}</details>` : vazio("Nenhuma venda paga no período.")}
        </section>
        <div class="grade-2">
          <section class="cartao" aria-labelledby="h-canal"><div class="cartao-topo"><h2 id="h-canal">Por canal</h2></div>
            ${canal.length ? tabela(["Canal", "Pedidos", "Total"], canal.map((r) => [esc(CANAIS[r.channel] || r.channel), esc(r.pedidos), esc(brl0(r.total))]), "Vendas por canal") : vazio("Sem vendas no período.")}
          </section>
          <section class="cartao" aria-labelledby="h-vend"><div class="cartao-topo"><h2 id="h-vend">Por vendedora</h2></div>
            ${vend.length ? tabela(["Quem vendeu", "Pedidos", "Total"], vend.map((r) => [esc(r.vendedor), esc(r.pedidos), esc(brl0(r.total))]), "Vendas por vendedora") : vazio("Sem vendas no período.")}
          </section>
        </div>
        <section class="cartao" aria-labelledby="h-prod"><div class="cartao-topo"><h2 id="h-prod">Por produto</h2></div>
          ${prod.length ? tabela(["Produto", "Código", "Peças", "Total"], prod.map((r) => [esc(r.nome), esc(r.id), esc(r.qtd), esc(brl0(r.total))]), "Vendas por produto") : vazio("Sem vendas no período.")}
        </section>`;
      $("#bt-csv", alvo).addEventListener("click", () => {
        const linhas = [["Relatório de vendas Preta Chik", diaBR(p.de) + " a " + diaBR(p.ate)], [],
          ["Vendas por dia"], ["Dia", "Pedidos", "Total (R$)"]].concat(dia.map((r) => [diaBR(r.dia), r.pedidos, reaisCsv(r.total)]),
          [[], ["Por canal"], ["Canal", "Pedidos", "Total (R$)"]], canal.map((r) => [CANAIS[r.channel] || r.channel, r.pedidos, reaisCsv(r.total)]),
          [[], ["Por vendedora"], ["Quem vendeu", "Pedidos", "Total (R$)"]], vend.map((r) => [r.vendedor, r.pedidos, reaisCsv(r.total)]),
          [[], ["Por produto"], ["Produto", "Código", "Peças", "Total (R$)"]], prod.map((r) => [r.nome, r.id, r.qtd, reaisCsv(r.total)]));
        const blob = new Blob([csv(linhas)], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "relatorio-preta-chik-" + p.de + "-a-" + p.ate + ".csv";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        aviso("CSV gerado.");
      });
    });
  }

  /* ============================================================ 16. configurações */
  const VARIAVEIS = [
    ["MELHORENVIO_TOKEN", "Token do Melhor Envio (painel ME → Integrações). Liga a cotação automática e as etiquetas.", (i) => (i.frete.melhorEnvio || {}).configurado ? "definida" : "não definida"],
    ["MELHORENVIO_AMBIENTE", "“sandbox” (testes, padrão) ou “producao”.", (i) => "em uso: " + ((i.frete.melhorEnvio || {}).ambiente === "producao" ? "produção" : "sandbox")],
    ["MELHORENVIO_WEBHOOK_SECRET", "Segredo do aplicativo ME, para conferir a assinatura das notificações de envio.", (i) => (i.frete.melhorEnvio || {}).webhookAssinado ? "definida" : "não definida"],
    ["FRETE_CEP_ORIGEM", "CEP de onde as peças saem. Alternativa: o campo “CEP de origem” acima.", () => "o painel não consegue ler"],
    ["PAGAMENTO_PROVEDOR", "Nome da plataforma de pagamento da loja (exige adaptador implementado).", (i) => i.pagamento.provedor ? "definida: " + i.pagamento.provedor : "não definida"],
    ["ADMIN_SETUP_TOKEN", "Código do primeiro acesso (criar a conta da proprietária). Pode ser removido depois.", () => "o painel não consegue ler"],
    ["MELHORENVIO_CONTATO", "Opcional: e-mail técnico exigido pelo Melhor Envio.", () => "o painel não consegue ler"],
    ["MELHORENVIO_SERVICOS", "Opcional: ids de serviços ME permitidos (ex.: 1,2).", () => "o painel não consegue ler"],
  ];

  function telaConfig(el) {
    el.innerHTML = cabecalho("Configurações", "Dados da loja, frete, remetente e integrações") + '<div id="cfg"></div>';
    carregar($("#cfg", el), () => api("GET", "config"), (d, alvo) => {
      const aj = d.ajustes || {}, loja = aj.loja || {}, fr = aj.frete || {}, rem = aj.remetente || {};
      const integ = d.integracoes || { pagamento: {}, frete: {} };
      integ.pagamento = integ.pagamento || {}; integ.frete = integ.frete || {};
      alvo.innerHTML = `
        <div class="grade-2">
          <form id="cfg-loja" class="cartao" novalidate>
            <h2 class="sub-tit">Loja</h2>
            ${campo("Nome da loja", "nome", { valor: loja.nome || "" })}
            ${campo("WhatsApp do atendimento", "whatsapp", { valor: loja.whatsapp || "", attrs: 'inputmode="tel"', ajuda: "Com DDI e DDD, só números. Ex.: 5581999999999. É para este número que o site manda as solicitações." })}
            ${campo("Instagram", "instagram", { valor: loja.instagram || "", ph: "@pretachik" })}
            <button type="submit" class="btn">Salvar loja</button>
          </form>
          <form id="cfg-frete" class="cartao" novalidate>
            <h2 class="sub-tit">Frete</h2>
            ${campo("CEP de origem (de onde as peças saem)", "cep_origem", { valor: cepFmt(fr.cep_origem || ""), attrs: 'inputmode="numeric" maxlength="9"' })}
            ${campo("Oferecer retirada na loja", "retirada_na_loja", { tipo: "checkbox", valor: fr.retirada_na_loja !== false })}
            ${campo("Oferecer entrega local (valor combinado no WhatsApp)", "entrega_local", { tipo: "checkbox", valor: fr.entrega_local !== false })}
            <button type="submit" class="btn">Salvar frete</button>
          </form>
        </div>
        <form id="cfg-rem" class="cartao" novalidate>
          <h2 class="sub-tit">Remetente (para etiquetas do Melhor Envio)</h2>
          <p class="texto-peq">Obrigatório para gerar etiquetas: nome, CPF/CNPJ e endereço completo da loja.</p>
          <div class="grade-campos">
            ${campo("Nome ou razão social", "nome", { valor: rem.nome || "", cls: "campo--2" })}
            ${campo("CPF ou CNPJ", "documento", { valor: rem.documento || "", attrs: 'inputmode="numeric" autocomplete="off"' })}
            ${campo("Telefone", "telefone", { valor: rem.telefone || "", attrs: 'inputmode="tel"' })}
            ${campo("E-mail", "email", { tipo: "email", valor: rem.email || "" })}
            ${campo("CEP", "cep", { valor: cepFmt(rem.cep || ""), attrs: 'inputmode="numeric" maxlength="9"' })}
            ${campo("Rua", "rua", { valor: rem.rua || "", cls: "campo--2" })}
            ${campo("Número", "numero", { valor: rem.numero || "" })}
            ${campo("Complemento", "complemento", { valor: rem.complemento || "" })}
            ${campo("Bairro", "bairro", { valor: rem.bairro || "" })}
            ${campo("Cidade", "cidade", { valor: rem.cidade || "" })}
            ${campo("UF", "uf", { valor: rem.uf || "", attrs: 'maxlength="2" autocapitalize="characters"' })}
          </div>
          <button type="submit" class="btn">Salvar remetente</button>
        </form>
        <section class="cartao" aria-labelledby="h-integ-cfg">
          <h2 class="sub-tit" id="h-integ-cfg">Integrações (somente leitura)</h2>
          ${blocoIntegracoes(integ)}
          <h3 class="sub-tit">Variáveis de ambiente na Vercel</h3>
          <p class="texto-peq">São definidas em Vercel → Settings → Environment Variables. Valores secretos nunca aparecem no painel.</p>
          ${tabela(["Variável", "Para que serve", "Situação"], VARIAVEIS.map((v) => [`<code>${esc(v[0])}</code>`, esc(v[1]), esc(v[2](integ))]), "Variáveis de ambiente")}
        </section>`;

      aoEnviar($("#cfg-loja", alvo), async (dd) => {
        const corpo = { nome: dd.nome, instagram: dd.instagram };
        if (dd.whatsapp) {
          if (!/^\d{12,13}$/.test(digitos(dd.whatsapp))) throw erroCampo("WhatsApp com DDI e DDD, só números (ex.: 5581999999999).", "whatsapp");
          corpo.whatsapp = digitos(dd.whatsapp);
        }
        await api("PUT", "config/loja", corpo);
        aviso("Dados da loja salvos.");
      });
      aoEnviar($("#cfg-frete", alvo), async (dd) => {
        if (dd.cep_origem && digitos(dd.cep_origem).length !== 8) throw erroCampo("CEP com 8 números.", "cep_origem");
        await api("PUT", "config/frete", { cep_origem: digitos(dd.cep_origem), retirada_na_loja: dd.retirada_na_loja, entrega_local: dd.entrega_local });
        aviso("Ajustes de frete salvos.");
      });
      aoEnviar($("#cfg-rem", alvo), async (dd) => {
        const doc = digitos(dd.documento);
        if (doc && doc.length !== 11 && doc.length !== 14) throw erroCampo("CPF (11 números) ou CNPJ (14 números).", "documento");
        if (dd.cep && digitos(dd.cep).length !== 8) throw erroCampo("CEP com 8 números.", "cep");
        if (dd.uf && !/^[A-Za-z]{2}$/.test(dd.uf)) throw erroCampo("UF com 2 letras.", "uf");
        if (dd.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dd.email)) throw erroCampo("E-mail inválido.", "email");
        await api("PUT", "config/remetente", Object.assign({}, dd, { documento: doc, cep: digitos(dd.cep), uf: (dd.uf || "").toUpperCase() }));
        aviso("Dados do remetente salvos.");
      });
    });
  }

  /* ============================================================ 17. equipe */
  function telaEquipe(el) {
    el.innerHTML = cabecalho("Equipe", "Quem acessa o painel") + '<div id="equipe"></div>';
    const alvo = $("#equipe", el);
    const senhaOk = (s) => s.length >= 10 && /[A-Za-z]/.test(s) && /\d/.test(s);
    const desenhar = (lista) => {
      alvo.innerHTML = (lista.length ? `<ul class="lista-equipe">${lista.map((m) => {
        const eu = S.equipe && m.id === S.equipe.id;
        return `<li class="cartao membro">
          <div class="membro-cab"><p><strong>${esc(m.nome)}</strong>${eu ? " " + tag("você", "rosa") : ""} ${m.ativo ? tag("ativo", "ok") : tag("inativo", "neutro")}</p><p class="texto-peq">${esc(m.email)} · desde ${esc(dataCurta(m.desde))}</p></div>
          <form data-membro="${esc(m.id)}" class="form-linha" novalidate>
            ${campo("Papel", "papel", { tipo: "select", opcoes: opcoes(PAPEIS, m.papel), attrs: eu ? "disabled" : "" })}
            ${campo("Acesso ativo", "ativo", { tipo: "checkbox", valor: m.ativo, attrs: eu ? "disabled" : "" })}
            ${eu ? '<p class="texto-peq">Você não pode rebaixar ou desativar a sua própria conta.</p>' : `<button type="submit" class="btn btn--vazio btn--peq">Salvar<span class="so-leitor"> ${esc(m.nome)}</span></button>`}
            <button type="button" class="btn btn--vazio btn--peq" data-senha="${esc(m.id)}">Redefinir senha<span class="so-leitor"> de ${esc(m.nome)}</span></button>
          </form>
        </li>`;
      }).join("")}</ul>` : vazio("Nenhuma pessoa na equipe."))
        + `<form id="form-membro" class="cartao" novalidate>
          <h2 class="sub-tit">Adicionar pessoa</h2>
          <div class="grade-campos">
            ${campo("Nome", "nome", { req: true, attrs: 'autocomplete="off"' })}
            ${campo("E-mail", "email", { tipo: "email", req: true, attrs: 'autocomplete="off"' })}
            ${campo("Papel", "papel", { tipo: "select", opcoes: opcoes(PAPEIS, "atendente") })}
            ${campo("Senha inicial", "senha", { tipo: "password", req: true, attrs: 'autocomplete="new-password"', ajuda: "10+ caracteres, com letras e números. Passe para a pessoa por um canal seguro." })}
          </div>
          <p class="texto-peq">Atendente acessa: dashboard, atendimento, pedidos, estoque, clientes, entregas e consulta de produtos. Proprietária acessa tudo.</p>
          <button type="submit" class="btn">Adicionar</button>
        </form>`;
      $$("form[data-membro]", alvo).forEach((f) => aoEnviar(f, async (dd) => {
        const m = lista.find((x) => x.id === f.dataset.membro);
        const r = await api("PUT", "equipe/" + enc(m.id), { papel: dd.papel, ativo: dd.ativo });
        desenhar(r.equipe || []);
        aviso("Acesso de " + m.nome + " atualizado.");
      }));
      $$("[data-senha]", alvo).forEach((b) => b.addEventListener("click", () => {
        const m = lista.find((x) => x.id === b.dataset.senha);
        dialogo({
          titulo: "Redefinir senha de " + m.nome,
          ok: "Redefinir senha",
          corpo: `${campo("Nova senha", "senha", { tipo: "password", req: true, attrs: 'autocomplete="new-password"', ajuda: "10+ caracteres, com letras e números." })}
            <p class="texto-peq">As sessões abertas de ${esc(m.nome)} são encerradas.</p>`,
          aoConfirmar: async (dd) => {
            if (!senhaOk(dd.senha || "")) throw erroCampo("Senha: 10+ caracteres, com letras e números.", "senha");
            const r = await api("PUT", "equipe/" + enc(m.id), { senha: dd.senha });
            desenhar(r.equipe || []);
            aviso("Senha de " + m.nome + " redefinida.");
          },
        });
      }));
      aoEnviar($("#form-membro", alvo), async (dd) => {
        if (dd.nome.length < 3) throw erroCampo("Informe o nome.", "nome");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dd.email)) throw erroCampo("E-mail inválido.", "email");
        if (!senhaOk(dd.senha)) throw erroCampo("Senha inicial: 10+ caracteres, com letras e números.", "senha");
        const r = await api("POST", "equipe", dd);
        desenhar(r.equipe || []);
        aviso(dd.nome + " adicionada à equipe.");
      });
    };
    carregar(alvo, () => api("GET", "equipe"), (d) => desenhar(d.equipe || []));
  }

  /* ============================================================ 18. início */
  function ligarEntrada() {
    aoEnviar($("#form-login"), async (dd) => {
      alertaEntrada("");
      if (!dd.email) throw erroCampo("Informe o e-mail.", "email");
      if (!dd.senha) throw erroCampo("Informe a senha.", "senha");
      const d = await api("POST", "entrar", { email: dd.email, senha: dd.senha }, { semRedirecionar: true });
      $("#login-senha").value = "";
      entrarNoPainel(d);
    });
    aoEnviar($("#form-setup"), async (dd) => {
      alertaEntrada("");
      if (!dd.token) throw erroCampo("Informe o código de configuração.", "token");
      if (dd.nome.length < 3) throw erroCampo("Informe o nome.", "nome");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dd.email)) throw erroCampo("E-mail inválido.", "email");
      if (!(dd.senha.length >= 10 && /[A-Za-z]/.test(dd.senha) && /\d/.test(dd.senha))) throw erroCampo("A senha precisa de 10+ caracteres, com letras e números.", "senha");
      await api("POST", "configurar-inicial", { token: dd.token, nome: dd.nome, email: dd.email, senha: dd.senha }, { semRedirecionar: true });
      $("#form-setup").reset();
      mostrarLogin("");
      $("#login-email").value = dd.email;
      aviso("Conta da proprietária criada. Entre com seu e-mail e senha.");
      $("#login-senha").focus();
    });
    $$("[data-ver-senha]").forEach((b) => b.addEventListener("click", () => {
      const i = document.getElementById(b.dataset.verSenha);
      const ver = i.type === "password";
      i.type = ver ? "text" : "password";
      b.textContent = ver ? "Ocultar" : "Mostrar";
      b.setAttribute("aria-pressed", ver ? "true" : "false");
    }));
  }

  function ligarPainel() {
    $("#bt-menu").addEventListener("click", () => (document.body.classList.contains("menu-aberto") ? fecharMenu(true) : abrirMenu()));
    $("#menu-fundo").addEventListener("click", () => fecharMenu(true));
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && document.body.classList.contains("menu-aberto")) fecharMenu(true); });
    $("#bt-sair").addEventListener("click", (ev) => executar(ev.currentTarget, async () => {
      try { await api("POST", "sair", {}, { semRedirecionar: true }); } catch (e) { /* sai localmente mesmo assim */ }
      S.equipe = null; S.permissoes = []; S.catalogo = null; S.categorias = null;
      geracao++;
      $("#conteudo").innerHTML = "";
      mostrarLogin("");
      aviso("Você saiu do painel.");
      $("#login-email").focus();
    }));
    document.querySelector("[data-pular]").addEventListener("click", (ev) => {
      ev.preventDefault();
      const alvo = !$("#tela-painel").hidden ? $("#conteudo") : $("#tela-entrada input:not([hidden])");
      if (alvo) alvo.focus();
    });
    /* Foto de produto ausente: troca por um fundo neutro em vez de ícone quebrado. */
    document.addEventListener("error", (ev) => {
      const t = ev.target;
      if (t && t.tagName === "IMG" && t.classList.contains("miniatura") && !t.classList.contains("sem-foto")) {
        t.classList.add("sem-foto");
        t.removeAttribute("src");
      }
    }, true);
    window.addEventListener("hashchange", rotear);
  }

  async function iniciar() {
    ligarDialogo();
    ligarEntrada();
    ligarPainel();
    try {
      const d = await api("GET", "eu", undefined, { semRedirecionar: true });
      entrarNoPainel(d);
    } catch (e) {
      mostrarLogin("");
      if (e.status === 401) await verificarPrimeiroAcesso(false);
      else {
        alertaEntrada("Não consegui falar com o servidor do painel. " + e.message);
        await verificarPrimeiroAcesso(true);
      }
      if (!$("#form-login").hidden) $("#login-email").focus();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
