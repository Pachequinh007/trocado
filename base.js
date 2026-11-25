// Trocado: casca, menu, dados no aparelho e componentes (vanilla, sem bibliotecas). Depende de util.js.
// Cada tela fica em telas.js e se registra com registrarTela.
"use strict";

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ORDEM = ["inicio", "extrato", "contas", "lancar", "ajustes"];
const COR_TEMA = { light: "#F5F7FA", dark: "#0B1019" };
const CHAVE = "trocado";

const $ = (id) => document.getElementById(id);
const E = { aba: null, mes: hojeLocal(new Date()).slice(0, 7), busca: "" };
const TELAS = {};

// ---------- DOM sem innerHTML: todo texto digitado entra como texto ----------
function h(tag, props, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...filhos.flat(Infinity).filter((f) => f != null && f !== false));
  return e;
}
function svg(tag, props, ...filhos) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(props || {})) e.setAttribute(k, v);
  e.append(...filhos.filter((f) => f != null));
  return e;
}

// Ícones de traço no estilo Lucide (herdam a cor do texto).
const ICONES = {
  painel: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  lista: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  lancar: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 8v8M8 12h8",
  ajustes: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  calendario: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
  tema: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 3v18",
  voltar: "M15 18l-6-6 6-6",
  avancar: "M9 18l6-6-6-6",
  menu: "M3 4h18v16H3zM9 4v16",
};
function icone(nome) {
  return svg("svg", { viewBox: "0 0 24 24", width: 20, height: 20, "aria-hidden": "true", class: "ico", fill: "none",
    stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" },
    svg("path", { d: ICONES[nome] || "" }));
}

// ---------- localStorage (pode estar bloqueado: o app avisa e segue na memória) ----------
function lerLS(chave, padrao) {
  try { const t = localStorage.getItem(chave); return t ? JSON.parse(t) : padrao; } catch (e) { return padrao; }
}
function gravarLS(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; }
}

// ---------- dados: tudo fica neste aparelho ----------
// Arquivo estragado nunca é apagado: vai para "trocado:estragado" e o app começa do zero com aviso.
function carregarDados() {
  let texto = null;
  try { texto = localStorage.getItem(CHAVE); } catch (e) { /* bloqueado */ }
  if (!texto) return estadoInicial();
  try {
    return validarBackup({ app: "trocado", estado: JSON.parse(texto) });
  } catch (e) {
    try { localStorage.setItem(CHAVE + ":estragado", texto); } catch (e2) { /* sem espaço */ }
    E.avisoDados = "Os dados guardados estavam com problema e foram separados. Se tiver um backup, importe em Ajustes.";
    return estadoInicial();
  }
}
let D = carregarDados();
function salvar() {
  if (gravarLS(CHAVE, D)) return true;
  toast("Não deu para guardar neste aparelho (armazenamento cheio ou bloqueado). Faça um backup em Ajustes.");
  return false;
}
// Toda mudança passa aqui: muda, guarda e redesenha.
function mudar(fn) {
  const r = fn(D);
  salvar();
  renderAtual();
  return r;
}
function novoId() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() : "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
const contaPorId = (id) => D.contas.find((c) => c.id === id);
const catPorId = (id) => D.categorias.find((c) => c.id === id);
const nomeConta = (id) => (contaPorId(id) || { nome: "?" }).nome;
const nomeCat = (id) => (catPorId(id) || { nome: "Sem categoria" }).nome;

// ---------- formatação ----------
const ddmm = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const nomeMes = (m) => { const n = NOMES_MES[Number(m.slice(5)) - 1]; return n[0].toUpperCase() + n.slice(1) + " de " + m.slice(0, 4); };

// ---------- componentes ----------
let tToast;
function toast(texto, acao) {
  const caixa = $("toasts");
  clearTimeout(tToast);
  const fechar = () => caixa.replaceChildren();
  caixa.replaceChildren(h("div", { class: "toast" }, h("span", null, texto),
    acao && h("button", { type: "button", class: "toast-acao", onclick: () => { fechar(); acao.fazer(); } }, acao.rotulo)));
  tToast = setTimeout(fechar, 5000);
}
function faixa(texto) {
  const f = $("faixa");
  f.hidden = !texto;
  f.textContent = texto || "";
}
const BADGE_SINAL = { success: "✓", warning: "!", danger: "✕", neutral: "•", info: "•" };
function badge(variante, texto) {
  return h("span", { class: "badge badge-" + variante }, h("span", { "aria-hidden": "true" }, BADGE_SINAL[variante]), texto);
}
function blocoVazio(texto, acao) {
  return h("div", { class: "vazio-bloco" }, h("p", null, texto),
    acao && h("button", { class: "secundario", type: "button", onclick: acao.fazer }, acao.rotulo));
}
const cartao = (titulo, ...filhos) => h("div", { class: "cartao" }, titulo && h("h2", null, titulo), ...filhos);

// Folha: de baixo no celular, painel lateral no PC. O "voltar" do Android, o Esc e o fundo fecham.
let focoAntes = null, vigia = null;
function abrirFolha(titulo, ...conteudo) {
  const folha = $("folha");
  if (folha.hidden) {
    focoAntes = document.activeElement;
    if ("CloseWatcher" in window) {
      vigia = new CloseWatcher();
      vigia.onclose = () => { vigia = null; fecharFolha(); };
    }
  }
  $("folha-titulo").textContent = titulo;
  $("folha-corpo").replaceChildren(...conteudo.flat().filter(Boolean));
  folha.hidden = false;
  $("folha-fundo").hidden = false;
  document.body.classList.add("com-folha");
  $("folha-fechar").focus();
  return $("folha-corpo");
}
function fecharFolha() {
  if ($("folha").hidden) return;
  if (vigia) { const v = vigia; vigia = null; v.destroy(); }
  $("folha").hidden = true;
  $("folha-fundo").hidden = true;
  document.body.classList.remove("com-folha");
  if (focoAntes && document.contains(focoAntes)) focoAntes.focus();
  focoAntes = null;
}
function confirmar(texto, rotuloAcao) {
  const d = $("confirmar");
  $("confirmar-texto").textContent = texto;
  $("confirmar-sim").textContent = rotuloAcao;
  return new Promise((resolver) => {
    const fim = (sim) => { d.removeEventListener("close", aoFechar); if (d.open) d.close(); resolver(sim); };
    const aoFechar = () => fim(d.returnValue === "sim");
    d.returnValue = "";
    d.addEventListener("close", aoFechar);
    d.showModal();
  });
}

// ---------- tema ----------
function aplicarTema(modo) {
  const raiz = document.documentElement, alvo = { claro: "light", escuro: "dark" }[modo];
  gravarLS("tema", alvo ? modo : "auto");
  if (alvo) raiz.dataset.theme = alvo; else delete raiz.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.content = alvo ? COR_TEMA[alvo] : COR_TEMA[m.media.includes("dark") ? "dark" : "light"];
  });
  document.querySelectorAll("[data-tema-atual]").forEach((e) => { e.textContent = nomeTema(); });
}
const temaAtual = () => { const t = lerLS("tema", "auto"); return ["claro", "escuro"].includes(t) ? t : "auto"; };
const nomeTema = () => ({ auto: "Tema automático", claro: "Tema claro", escuro: "Tema escuro" })[temaAtual()];
const trocarTema = () => aplicarTema({ auto: "claro", claro: "escuro", escuro: "auto" }[temaAtual()]);

// ---------- telas e menu ----------
function registrarTela(id, def) { TELAS[id] = def; }
const telasNaOrdem = () => ORDEM.filter((id) => TELAS[id]);

function ir(destino) {
  if (!TELAS[destino]) return;
  mostrar(destino);
  if (location.hash !== "#" + destino) location.hash = destino;
}
const MOVIMENTO_REDUZIDO = matchMedia("(prefers-reduced-motion: reduce)");

// Troca de tela girando como a face de um cubo (View Transitions); sem o recurso ou com "reduzir movimento", na hora.
function mostrar(id) {
  if (!TELAS[id]) id = "inicio";
  const de = E.aba;
  fecharFolha();
  E.aba = id;
  if (!de || de === id || !document.startViewTransition || MOVIMENTO_REDUZIDO.matches) {
    trocarTela(id);
    E.troca = Promise.resolve();
    return;
  }
  const raiz = document.documentElement;
  raiz.style.setProperty("--cubo-meio", $("conteudo").offsetWidth / 2 + "px");
  raiz.classList.toggle("cubo-volta", ORDEM.indexOf(id) < ORDEM.indexOf(de));
  E.troca = document.startViewTransition(() => trocarTela(id)).updateCallbackDone;
}
function trocarTela(id) {
  for (const t of telasNaOrdem()) $("v-" + t).hidden = t !== id;
  document.querySelectorAll("[data-destino]").forEach((a) => {
    if (a.dataset.destino === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("titulo").textContent = TELAS[id].titulo;
  document.title = TELAS[id].titulo + " · Trocado";
  window.scrollTo(0, 0);
  if (TELAS[id].aoAbrir) TELAS[id].aoAbrir();
  TELAS[id].render();
}
function renderAtual() { if (E.aba) TELAS[E.aba].render(); }

function itemMenu(id) {
  const t = TELAS[id];
  return h("a", { href: "#" + id, class: "menu-item", "data-destino": id },
    icone(t.icone), h("span", { class: "menu-rotulo" }, t.titulo));
}
function montarMenu() {
  $("menu").replaceChildren(
    h("div", { class: "marca-app" }, h("span", { class: "marca-letra", "aria-hidden": "true" }, "T"), h("span", { class: "marca-nome" }, "Trocado")),
    h("div", { class: "menu-meio" }, h("div", { class: "menu-grupo" }, telasNaOrdem().filter((id) => id !== "ajustes").map(itemMenu))),
    h("div", { class: "menu-pe" }, itemMenu("ajustes"),
      h("button", { type: "button", class: "menu-item", onclick: trocarTema }, icone("tema"),
        h("span", { class: "menu-rotulo", "data-tema-atual": "" }, nomeTema())),
      h("button", { type: "button", class: "menu-item so-pc", id: "btn-recolher", "aria-pressed": String(!!lerLS("menu-recolhido", false)),
        onclick: () => {
          const r = !lerLS("menu-recolhido", false);
          gravarLS("menu-recolhido", r);
          document.querySelector(".app").classList.toggle("recolhido", r);
          $("btn-recolher").setAttribute("aria-pressed", String(r));
        } }, icone("menu"), h("span", { class: "menu-rotulo" }, "Recolher menu"))));
  $("barra").replaceChildren(...telasNaOrdem().filter((id) => TELAS[id].barra).map(itemMenu));
}

// Seletor de mês do Extrato (não passa do mês atual).
function seletorMes() {
  const hoje = hojeLocal(new Date()).slice(0, 7);
  const mudarMes = (n) => { const m = somaMes(E.mes, n); E.mes = m > hoje ? hoje : m; renderAtual(); };
  return h("div", { class: "seletor-mes" },
    h("button", { class: "icone-botao", type: "button", "aria-label": "Mês anterior", onclick: () => mudarMes(-1) }, icone("voltar")),
    h("strong", { "aria-live": "polite" }, nomeMes(E.mes)),
    h("button", { class: "icone-botao", type: "button", "aria-label": "Próximo mês", disabled: E.mes >= hoje, onclick: () => mudarMes(1) }, icone("avancar")));
}

// ---------- instalar (Android/PC: o navegador oferece; iPhone: Compartilhar → Adicionar à Tela de Início) ----------
let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", (ev) => { ev.preventDefault(); pedidoInstalar = ev; renderAtual(); });
window.addEventListener("appinstalled", () => { pedidoInstalar = null; toast("App instalado! Ele abre pelo ícone, mesmo sem internet."); renderAtual(); });
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function instalar() {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice;
  pedidoInstalar = null;
  renderAtual();
}

// ---------- início ----------
function iniciar() {
  aplicarTema(temaAtual());
  if (lerLS("menu-recolhido", false)) document.querySelector(".app").classList.add("recolhido");
  $("conteudo").replaceChildren(...telasNaOrdem().map((id) => h("section", { id: "v-" + id, class: "tela", hidden: true, "aria-labelledby": "titulo" })));
  montarMenu();
  $("btn-novo").addEventListener("click", () => ir("lancar"));
  $("btn-ajustes").addEventListener("click", () => ir("ajustes"));
  $("folha-fechar").addEventListener("click", fecharFolha);
  $("folha-fundo").addEventListener("click", fecharFolha);
  if (!("CloseWatcher" in window)) {
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !$("folha").hidden && !$("confirmar").open) { ev.preventDefault(); fecharFolha(); }
    });
  }
  faixa(E.avisoDados);
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id !== E.aba) mostrar(id); });
  window.addEventListener("storage", (ev) => { if (ev.key === CHAVE) { D = carregarDados(); renderAtual(); } });   // outra aba mexeu
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { document.dispatchEvent(new Event("voltou")); renderAtual(); } });
  mostrar(location.hash.slice(1));
  // pede ao navegador para não apagar os dados quando faltar espaço
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
document.addEventListener("DOMContentLoaded", iniciar);
