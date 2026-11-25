// Trocado: as 5 telas (Início, Extrato, Contas a pagar, Lançar, Ajustes). Depende de util.js e base.js.
"use strict";

const ROTULO_TIPO = { gasto: "Gasto", entrada: "Entrada", transferencia: "Entre contas" };
const hoje = () => hojeLocal(new Date());
const catsDo = (tipo) => D.categorias.filter((c) => c.tipo === tipo);

function ficha(nome, valor, rotulo, marcada, aoMudar) {
  return h("label", { class: "ficha" },
    h("input", { type: "radio", name: nome, value: valor, checked: marcada, onchange: aoMudar }), h("span", null, rotulo));
}
const fichas = (nome, itens, marcado, aoMudar) =>
  h("div", { class: "fichas" }, itens.map((i) => ficha(nome, i.id, i.nome, i.id === marcado, aoMudar)));
const marcado = (raiz, nome) => (raiz.querySelector('input[name="' + nome + '"]:checked') || {}).value;
const campo = (rotulo, input) => h("label", { class: "campo" }, rotulo, input);
function erroForm(raiz, texto) {
  const p = raiz.querySelector(".erro");
  p.textContent = texto || "";
  p.hidden = !texto;
  return !texto;
}

function baixar(nome, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = h("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- lançamento: o mesmo formulário para lançar e para corrigir ----------
function textoValor(l) {
  if (l.tipo === "entrada") return "+" + brl(l.valor);
  if (l.tipo === "gasto") return "-" + brl(l.valor);
  return brl(l.valor);
}
function linhaLanc(l) {
  const sub = l.tipo === "transferencia"
    ? nomeConta(l.conta) + " → " + nomeConta(l.paraConta)
    : nomeCat(l.categoria) + " · " + nomeConta(l.conta);
  return h("div", { class: "item" },
    h("button", { type: "button", class: "texto-botao t", onclick: () => editarLancamento(l) },
      h("strong", null, l.descricao), h("div", { class: "suave" }, sub + " · " + ddmm(l.data))),
    h("div", { class: "v num" + (l.tipo === "gasto" ? "" : l.tipo === "entrada" ? " entrada" : " suave") }, textoValor(l)),
    h("span"));
}

function formLancamento(l, aoSalvar) {
  const novo = !l;
  let tipo = l ? l.tipo : "gasto";
  const val = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0,00", value: l ? paraTexto(l.valor) : "" });
  const data = h("input", { type: "date", value: l ? l.data : hoje(), max: "2100-12-31" });
  const desc = h("input", { type: "text", maxlength: 80, autocomplete: "off", placeholder: "Ex.: mercado, uber, salário", value: l ? l.descricao : "" });
  const partes = h("div", { class: "pilha" });
  const ultima = lerLS("ultimaConta", null);
  const contaPadrao = (l && l.conta) || (contaPorId(ultima) ? ultima : D.contas[0] && D.contas[0].id);

  function desenharPartes() {
    const cats = catsDo(tipo);
    const catAtual = l && l.tipo === tipo ? l.categoria : null;
    const contas = D.contas.map((c) => ({ id: c.id, nome: c.nome }));
    partes.replaceChildren(...[
      tipo !== "transferencia" && h("fieldset", { class: "campo" }, h("legend", null, "Categoria"),
        fichas("cat", cats, catAtual || (cats[0] && cats[0].id))),
      h("fieldset", { class: "campo" }, h("legend", null, tipo === "entrada" ? "Entrou em" : tipo === "gasto" ? "Saiu de" : "Tirei de"),
        fichas("conta", contas, contaPadrao)),
      tipo === "transferencia" && h("fieldset", { class: "campo" }, h("legend", null, "Coloquei em"),
        fichas("para", contas, (l && l.paraConta) || (contas.find((c) => c.id !== contaPadrao) || {}).id)),
    ].filter(Boolean));   // replaceChildren escreveria "false" na tela
  }

  const form = h("form", { class: "pilha", novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const valor = lerCentavos(val.value);
    if (valor == null) return erroForm(form, "Digite o valor, por exemplo 15,50."), val.focus();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.value)) return erroForm(form, "Escolha a data.");
    const conta = marcado(form, "conta"), para = marcado(form, "para"), cat = marcado(form, "cat");
    if (!conta) return erroForm(form, "Escolha a conta.");
    if (tipo === "transferencia" && (!para || para === conta)) return erroForm(form, "Escolha duas contas diferentes.");
    if (tipo !== "transferencia" && !cat) return erroForm(form, "Escolha a categoria.");
    erroForm(form, null);
    const dados = {
      tipo, valor, data: data.value, conta,
      descricao: desc.value.trim() || (tipo === "transferencia" ? "Entre contas" : nomeCat(cat)),
      categoria: tipo === "transferencia" ? undefined : cat,
      paraConta: tipo === "transferencia" ? para : undefined,
    };
    gravarLS("ultimaConta", conta);
    aoSalvar(dados);
  } },
    h("div", { class: "fichas", role: "radiogroup", "aria-label": "Tipo" },
      ["gasto", "entrada", "transferencia"].map((t) => ficha("tipo", t, ROTULO_TIPO[t], t === tipo, () => { tipo = t; desenharPartes(); }))),
    h("div", { class: "dois" }, campo("Valor (R$)", val), campo("Data", data)),
    campo("Descrição", desc),
    partes,
    h("p", { class: "erro", role: "alert", hidden: true }),
    h("button", { class: "primario", type: "submit" }, novo ? "Salvar" : "Salvar mudanças"));
  desenharPartes();
  form.limpar = () => { val.value = ""; desc.value = ""; val.focus(); };
  return form;
}

function editarLancamento(l) {
  const form = formLancamento(l, (dados) => {
    mudar(() => Object.assign(l, dados));
    fecharFolha();
    toast("Corrigido.");
  });
  abrirFolha("Corrigir lançamento", form,
    h("div", { class: "acoes" }, h("button", { class: "perigo", type: "button", onclick: async () => {
      if (!(await confirmar("Apagar «" + l.descricao + "» de " + brl(l.valor) + "?", "Apagar"))) return;
      const i = D.lancamentos.indexOf(l);
      mudar(() => D.lancamentos.splice(i, 1));
      fecharFolha();
      toast("Apagado.", { rotulo: "Desfazer", fazer: () => mudar(() => D.lancamentos.splice(i, 0, l)) });
    } }, "Apagar")));
}

// ---------- Início ----------
function linhaSaldo(s) {
  return h("div", { class: "item" },
    h("button", { type: "button", class: "texto-botao t", onclick: () => editarConta(contaPorId(s.id)) },
      h("strong", null, s.nome), h("div", { class: "suave" }, TIPOS_CONTA[s.tipo])),
    h("div", { class: "v num" + (s.saldo < 0 ? " negativo" : "") }, brl(s.saldo)), h("span"));
}
function barraLimite(c) {
  const pct = Math.min(100, Math.round((c.gasto * 100) / c.limite));
  const passou = c.gasto > c.limite;
  return h("div", { class: "cat fixa" },
    h("div", { class: "cat-topo" }, h("strong", null, c.nome),
      h("span", { class: "num" + (passou ? " negativo" : "") }, brl(c.gasto) + " de " + brl(c.limite))),
    h("span", { class: "barra-prog" + (passou ? " passou" : pct >= 80 ? " quase" : "") }, h("i", { style: "width:" + pct + "%" })));
}
function linhaVenc(v) {
  const sinal = v.atrasada ? badge("danger", "Atrasada") : v.pagaEsteMes ? badge("success", "Paga este mês") : null;
  return h("div", { class: "item" + (v.atrasada ? " atrasada" : "") },
    h("button", { type: "button", class: "texto-botao t", onclick: () => editarAPagar(D.aPagar.find((c) => c.id === v.id)) },
      h("strong", null, v.nome), h("div", { class: "suave" }, "Vence " + ddmm(v.data)), sinal),
    h("div", { class: "v num" }, brl(v.valor)),
    v.pagaEsteMes && v.mes !== hoje().slice(0, 7)
      ? h("span")
      : h("button", { class: "secundario pequeno", type: "button", onclick: () => paguei(v) }, "Paguei"));
}
function paguei(v) {
  const l = mudar(() => pagar(D, v.id, v.mes, hoje(), novoId(), Date.now()));
  if (!l) return;
  toast(v.nome + " paga. Entrou no extrato.", { rotulo: "Desfazer", fazer: () => mudar(() => {
    D.lancamentos = D.lancamentos.filter((x) => x.id !== l.id);
    const c = D.aPagar.find((x) => x.id === v.id);
    if (c) c.pagas = c.pagas.filter((m) => m !== v.mes);
  }) });
}

function renderInicio() {
  const s = saldos(D), dia = hoje(), r = resumoMes(D, dia.slice(0, 7));
  const limite = hojeLocal(new Date(Date.now() + 30 * 864e5));
  const pagar_ = vencimentos(D, dia).filter((v) => !v.pagaEsteMes && v.data <= limite);
  const comLimite = r.porCategoria.filter((c) => c.limite > 0);
  const semNada = D.lancamentos.length === 0;
  const ultimo = D.ajustes.ultimoBackup;
  const pedirBackup = D.lancamentos.length >= 20 && (!ultimo || Date.now() - ultimo > 30 * 864e5);
  $("v-inicio").replaceChildren(h("div", { class: "pilha" }, ...[
    semNada && cartao("Bem-vindo ao Trocado",
      h("p", null, "Anote o que entra e o que sai e veja para onde vai o seu dinheiro. Tudo fica só neste aparelho."),
      h("div", { class: "acoes" },
        h("button", { class: "secundario", type: "button", onclick: () => ir("ajustes") }, "Dizer quanto tenho"),
        h("button", { class: "primario", type: "button", onclick: () => ir("lancar") }, "Lançar o primeiro"))),
    pedidoInstalar && !instalado() && cartao(null, h("div", { class: "cartao-topo" },
      h("strong", null, "Instale o Trocado no seu celular"),
      h("button", { class: "primario pequeno", type: "button", onclick: instalar }, "Instalar"))),
    h("div", { class: "cartao total-cartao" },
      h("span", { class: "rotulo" }, "Quanto eu tenho"),
      h("span", { class: "metric num" + (s.total < 0 ? " negativo" : "") }, brl(s.total))),
    cartao("Onde está", s.linhas.map(linhaSaldo)),
    h("div", { class: "cartao" },
      h("div", { class: "cartao-topo" }, h("h2", null, nomeMes(dia.slice(0, 7))),
        h("button", { type: "button", class: "link", onclick: () => { E.mes = dia.slice(0, 7); ir("extrato"); } }, "Ver extrato")),
      [["Entrou", r.entradas], ["Gastei", r.gastos], ["Sobrou", r.sobra]].map(([rot, v]) =>
        h("div", { class: "item" }, h("div", { class: "t" }, h("strong", null, rot)),
          h("div", { class: "v num" + (v < 0 ? " negativo" : "") }, brl(v)), h("span"))),
      comLimite.length > 0 && h("div", null, comLimite.map(barraLimite))),
    pagar_.length > 0 && cartao("Para pagar", pagar_.map(linhaVenc)),
    pedirBackup && h("p", { class: "suave" }, "Faz tempo que você não guarda uma cópia dos seus dados. ",
      h("button", { class: "link", type: "button", onclick: baixarBackup }, "Baixar backup agora")),
  ].filter(Boolean)));
}

// ---------- Extrato ----------
function montarExtrato(sec) {
  const busca = h("input", { id: "busca", type: "search", placeholder: "Buscar (texto ou valor)", autocomplete: "off",
    oninput: () => { E.busca = busca.value; desenharLista(); } });
  sec.append(h("div", { id: "ext-mes" }), h("label", { class: "busca-campo" }, h("span", { class: "sr" }, "Buscar"), busca),
    h("div", { id: "ext-lista", class: "pilha", style: "margin-top:16px" }));
}
function desenharLista() {
  const r = resumoMes(D, E.mes), lista = buscar(r.lista, E.busca, D), onde = paraOndeFoi(r.porCategoria);
  $("ext-lista").replaceChildren(...[
    cartao(null, h("div", { class: "dois" },
      h("div", null, h("span", { class: "rotulo" }, "Entrou"), h("div", { class: "metric num" }, brl(r.entradas))),
      h("div", null, h("span", { class: "rotulo" }, "Gastei"), h("div", { class: "metric num" }, brl(r.gastos))))),
    onde.length > 0 && !E.busca && cartao("Para onde foi", onde.map((c) => h("div", { class: "cat fixa" },
      h("div", { class: "cat-topo" }, h("strong", null, c.nome), h("span", { class: "num" }, brl(c.gasto) + " · " + c.pct + "%")),
      h("span", { class: "barra-prog neutra" }, h("i", { style: "width:" + c.pct + "%" }))))),
    cartao(E.busca ? lista.length + " encontrado(s)" : "Lançamentos",
      lista.length ? lista.map(linhaLanc) : blocoVazio(E.busca ? "Nada com essa busca neste mês." : "Nada lançado neste mês.",
        !E.busca && { rotulo: "Lançar", fazer: () => ir("lancar") }),
      r.lista.length > 0 && h("div", { class: "acoes" }, h("button", { class: "secundario pequeno", type: "button",
        onclick: () => baixar("trocado-" + E.mes + ".csv", "﻿" + csv(D, r.lista), "text/csv;charset=utf-8") }, "Baixar planilha do mês"))),
  ].filter(Boolean));
}
function renderExtrato() {
  const sec = $("v-extrato");
  if (!sec.firstChild) montarExtrato(sec);
  $("ext-mes").replaceChildren(seletorMes());
  desenharLista();
}

// ---------- Contas a pagar ----------
function formAPagar(c, aoSalvar) {
  const nome = h("input", { type: "text", maxlength: 60, placeholder: "Ex.: aluguel, internet, luz", value: c ? c.nome : "" });
  const val = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", value: c ? paraTexto(c.valor) : "" });
  const dia = h("input", { type: "number", min: 1, max: 31, inputmode: "numeric", placeholder: "10", value: c ? c.dia : "" });
  const cats = catsDo("gasto");
  const form = h("form", { class: "pilha", novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const valor = lerCentavos(val.value), d = Number(dia.value);
    if (!nome.value.trim()) return erroForm(form, "Dê um nome para a conta.");
    if (valor == null) return erroForm(form, "Digite o valor, por exemplo 99,90.");
    if (!(Number.isInteger(d) && d >= 1 && d <= 31)) return erroForm(form, "O dia do vencimento vai de 1 a 31.");
    aoSalvar({ nome: nome.value.trim(), valor, dia: d, conta: marcado(form, "conta"), categoria: marcado(form, "cat") });
  } },
    campo("Nome", nome),
    h("div", { class: "dois" }, campo("Valor (R$)", val), campo("Vence todo dia", dia)),
    h("fieldset", { class: "campo" }, h("legend", null, "Paga com"), fichas("conta", D.contas, c ? c.conta : (D.contas.find((x) => x.tipo === "corrente") || D.contas[0]).id)),
    h("fieldset", { class: "campo" }, h("legend", null, "Categoria"),
      fichas("cat", cats, c ? c.categoria : (cats.find((x) => x.nome === "Contas") || cats[0]).id)),
    h("p", { class: "erro", role: "alert", hidden: true }),
    h("button", { class: "primario", type: "submit" }, "Salvar"));
  return form;
}
function novaAPagar() {
  abrirFolha("Nova conta a pagar", formAPagar(null, (dados) => {
    mudar(() => D.aPagar.push({ id: novoId(), pagas: [], ...dados }));
    fecharFolha();
    toast("Conta salva. O app avisa quando vencer.");
  }));
}
function editarAPagar(c) {
  if (!c) return;
  abrirFolha("Conta a pagar", formAPagar(c, (dados) => {
    mudar(() => Object.assign(c, dados));
    fecharFolha();
    toast("Conta atualizada.");
  }), h("div", { class: "acoes" }, h("button", { class: "perigo", type: "button", onclick: async () => {
    if (!(await confirmar("Apagar a conta «" + c.nome + "»? O que já foi pago continua no extrato.", "Apagar"))) return;
    mudar(() => { D.aPagar = D.aPagar.filter((x) => x !== c); });
    fecharFolha();
  } }, "Apagar")));
}
function renderContas() {
  const v = vencimentos(D, hoje());
  const total = v.filter((x) => !x.pagaEsteMes).reduce((t, x) => t + x.valor, 0);
  $("v-contas").replaceChildren(h("div", { class: "pilha" },
    v.length > 0 && cartao(null, h("span", { class: "rotulo" }, "Falta pagar este mês"), h("div", { class: "metric num" }, brl(total))),
    cartao("Contas do mês", v.length ? v.map(linhaVenc)
      : blocoVazio("Cadastre aluguel, internet, luz... O Trocado mostra o que vence e, no \"Paguei\", já lança o gasto."),
    h("div", { class: "acoes" }, h("button", { class: "primario", type: "button", onclick: novaAPagar }, "Nova conta a pagar")))));
}

// ---------- Lançar ----------
let assinaturaLancar = "";
function renderLancar() {
  const sec = $("v-lancar");
  const assinatura = JSON.stringify([D.contas.map((c) => c.id + c.nome), D.categorias.map((c) => c.id + c.nome + c.tipo)]);
  if (assinatura !== assinaturaLancar || !sec.firstChild) {   // só refaz o formulário se contas/categorias mudaram
    assinaturaLancar = assinatura;
    const form = formLancamento(null, (dados) => {
      const l = { id: novoId(), criado: Date.now(), ...dados };
      mudar(() => D.lancamentos.push(l));
      form.limpar();
      toast(ROTULO_TIPO[l.tipo] + " de " + brl(l.valor) + " salvo.", { rotulo: "Desfazer", fazer: () => mudar(() => {
        D.lancamentos = D.lancamentos.filter((x) => x !== l);
      }) });
    });
    sec.replaceChildren(h("div", { class: "grade-lancar" }, cartao(null, form), h("div", { id: "lancar-ultimos" })));
  }
  const ultimos = D.lancamentos.slice().sort((a, b) => (b.criado || 0) - (a.criado || 0)).slice(0, 6);
  $("lancar-ultimos").replaceChildren(ultimos.length ? cartao("Últimos lançados", ultimos.map(linhaLanc)) : "");
}

// ---------- Ajustes ----------
function formConta(c) {
  const atual = c ? saldos(D).linhas.find((s) => s.id === c.id).saldo : 0;
  const nome = h("input", { type: "text", maxlength: 40, placeholder: "Ex.: Nubank, Carteira", value: c ? c.nome : "" });
  const saldo = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", value: paraTexto(atual) });
  const form = h("form", { class: "pilha", novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const quer = lerCentavos(saldo.value, true);
    if (!nome.value.trim()) return erroForm(form, "Dê um nome para a conta.");
    if (quer == null) return erroForm(form, "Saldo inválido. Use, por exemplo, 250,00 ou -80,00.");
    const tipo = marcado(form, "tipo");
    mudar(() => {
      if (c) {
        c.nome = nome.value.trim();
        c.tipo = tipo;
        c.saldoInicial = (c.saldoInicial || 0) + (quer - atual);   // o saldo de hoje vira o digitado
      } else {
        D.contas.push({ id: novoId(), nome: nome.value.trim(), tipo, saldoInicial: quer });
      }
    });
    fecharFolha();
    toast("Conta salva.");
  } },
    campo("Nome", nome),
    h("fieldset", { class: "campo" }, h("legend", null, "Tipo"),
      fichas("tipo", Object.entries(TIPOS_CONTA).map(([id, n]) => ({ id, nome: n })), c ? c.tipo : "corrente")),
    campo("Quanto tem agora (R$)", saldo),
    h("p", { class: "suave" }, "Cartão de crédito: digite a fatura em aberto com sinal de menos (ex.: -350,00)."),
    h("p", { class: "erro", role: "alert", hidden: true }),
    h("button", { class: "primario", type: "submit" }, "Salvar"));
  return form;
}
function editarConta(c) {
  const usada = c && (D.lancamentos.some((l) => l.conta === c.id || l.paraConta === c.id) || D.aPagar.some((a) => a.conta === c.id));
  abrirFolha(c ? c.nome : "Nova conta", formConta(c), c && h("div", { class: "acoes" },
    h("button", { class: "perigo", type: "button", onclick: async () => {
      if (usada) return toast("Essa conta tem lançamentos. Apague ou mude os lançamentos antes.");
      if (D.contas.length === 1) return toast("Precisa ficar pelo menos uma conta.");
      if (!(await confirmar("Apagar a conta «" + c.nome + "»?", "Apagar"))) return;
      mudar(() => { D.contas = D.contas.filter((x) => x !== c); });
      fecharFolha();
    } }, "Apagar conta")));
}

function editarCategoria(c, tipoNovo) {
  const tipo = c ? c.tipo : tipoNovo;
  const nome = h("input", { type: "text", maxlength: 30, value: c ? c.nome : "" });
  const lim = h("input", { type: "text", inputmode: "decimal", placeholder: "Sem limite", value: c && c.limite ? paraTexto(c.limite) : "" });
  const form = h("form", { class: "pilha", novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const limite = lim.value.trim() ? lerCentavos(lim.value) : 0;
    if (!nome.value.trim()) return erroForm(form, "Dê um nome para a categoria.");
    if (limite == null) return erroForm(form, "Limite inválido. Deixe vazio para não ter limite.");
    mudar(() => {
      if (c) Object.assign(c, { nome: nome.value.trim(), limite });
      else D.categorias.push({ id: novoId(), nome: nome.value.trim(), tipo, limite });
    });
    fecharFolha();
  } },
    campo("Nome", nome),
    tipo === "gasto" && campo("Limite por mês (R$, opcional)", lim),
    h("p", { class: "erro", role: "alert", hidden: true }),
    h("button", { class: "primario", type: "submit" }, "Salvar"));
  abrirFolha(c ? "Categoria" : tipo === "gasto" ? "Nova categoria de gasto" : "Nova categoria de entrada", form,
    c && h("div", { class: "acoes" }, h("button", { class: "perigo", type: "button", onclick: async () => {
      const outras = catsDo(c.tipo).filter((x) => x !== c);
      if (!outras.length) return toast("Precisa ficar pelo menos uma categoria desse tipo.");
      const destino = outras.find((x) => semAcento(x.nome).startsWith("outr")) || outras[0];
      if (!(await confirmar("Apagar «" + c.nome + "»? Os lançamentos dela vão para «" + destino.nome + "».", "Apagar"))) return;
      mudar(() => {
        for (const x of D.lancamentos.concat(D.aPagar)) if (x.categoria === c.id) x.categoria = destino.id;
        D.categorias = D.categorias.filter((x) => x !== c);
      });
      fecharFolha();
    } }, "Apagar categoria")));
}

function baixarBackup() {
  mudar(() => { D.ajustes.ultimoBackup = Date.now(); });
  baixar("trocado-backup-" + hoje() + ".json", JSON.stringify({ app: "trocado", versao: 1, criado: new Date().toISOString(), estado: D }), "application/json");
  toast("Backup baixado. Guarde o arquivo no Drive ou mande para você mesmo.");
}
function importarBackup() {
  const input = h("input", { type: "file", accept: ".json,application/json", onchange: () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast("Arquivo grande demais para ser um backup do Trocado.");
    const leitor = new FileReader();
    leitor.onload = async () => {
      let novo;
      try { novo = validarBackup(JSON.parse(leitor.result)); } catch (e) { return toast(e instanceof SyntaxError ? "Esse arquivo não é um backup do Trocado." : e.message); }
      if (!(await confirmar("Trocar os dados deste aparelho pelos do backup (" + novo.lancamentos.length + " lançamentos)?", "Trocar"))) return;
      D = novo;
      salvar();
      renderAtual();
      toast("Backup importado.");
    };
    leitor.readAsText(f);
  } });
  input.click();
}
async function apagarTudo() {
  if (!(await confirmar("Apagar TODOS os dados deste aparelho? Não tem volta (a não ser por um backup).", "Apagar tudo"))) return;
  D = estadoInicial();
  salvar();
  renderAtual();
  toast("Tudo apagado. O app começou do zero.");
}

function renderAjustes() {
  const s = saldos(D);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const linhaCat = (c) => h("div", { class: "item" },
    h("button", { type: "button", class: "texto-botao t", onclick: () => editarCategoria(c) },
      h("strong", null, c.nome), c.limite > 0 && h("div", { class: "suave" }, "Limite " + brl(c.limite) + " por mês")),
    h("span"), h("span"));
  $("v-ajustes").replaceChildren(h("div", { class: "pilha" },
    cartao("Contas e saldos", s.linhas.map(linhaSaldo),
      h("div", { class: "acoes" }, h("button", { class: "secundario", type: "button", onclick: () => editarConta(null) }, "Nova conta"))),
    cartao("Categorias de gasto", catsDo("gasto").map(linhaCat),
      h("p", { class: "suave" }, "Toque numa categoria para dar um limite por mês: o Início mostra a barra."),
      h("div", { class: "acoes" }, h("button", { class: "secundario", type: "button", onclick: () => editarCategoria(null, "gasto") }, "Nova categoria"))),
    cartao("Categorias de entrada", catsDo("entrada").map(linhaCat),
      h("div", { class: "acoes" }, h("button", { class: "secundario", type: "button", onclick: () => editarCategoria(null, "entrada") }, "Nova categoria"))),
    cartao("Aparência", fichas("tema", [{ id: "auto", nome: "Automático" }, { id: "claro", nome: "Claro" }, { id: "escuro", nome: "Escuro" }],
      temaAtual(), (ev) => aplicarTema(ev.target.value))),
    cartao("Instalar no celular",
      instalado() ? h("p", null, badge("success", "Instalado"), " O Trocado abre pelo ícone, até sem internet.")
        : pedidoInstalar ? h("button", { class: "primario", type: "button", onclick: instalar }, "Instalar o app")
          : h("p", { class: "suave" }, ios ? "No iPhone: toque em Compartilhar e depois em \"Adicionar à Tela de Início\"."
            : "No menu do navegador (⋮), toque em \"Instalar app\" ou \"Adicionar à tela inicial\".")),
    cartao("Seus dados",
      h("p", null, "Tudo fica só neste aparelho: o Trocado não tem servidor e ninguém mais vê os seus números. Se trocar de celular ou limpar o navegador, só volta com um backup."),
      h("div", { class: "acoes" },
        h("button", { class: "primario", type: "button", onclick: baixarBackup }, "Baixar backup"),
        h("button", { class: "secundario", type: "button", onclick: importarBackup }, "Importar backup"),
        h("button", { class: "secundario", type: "button",
          onclick: () => baixar("trocado-tudo.csv", "﻿" + csv(D, D.lancamentos.slice().sort((a, b) => (a.data < b.data ? -1 : 1))), "text/csv;charset=utf-8") }, "Baixar planilha"),
        h("button", { class: "perigo", type: "button", onclick: apagarTudo }, "Apagar tudo"))),
    h("p", { class: "suave" }, "Trocado 1.0 · grátis e sem anúncios · ", h("a", { href: "privacidade.html" }, "Privacidade"))));
}

registrarTela("inicio", { titulo: "Início", icone: "painel", barra: true, render: renderInicio });
registrarTela("extrato", { titulo: "Extrato", icone: "lista", barra: true, render: renderExtrato });
registrarTela("contas", { titulo: "A pagar", icone: "calendario", barra: true, render: renderContas });
registrarTela("lancar", { titulo: "Lançar", icone: "lancar", barra: true, render: renderLancar });
registrarTela("ajustes", { titulo: "Ajustes", icone: "ajustes", barra: true, render: renderAjustes });
