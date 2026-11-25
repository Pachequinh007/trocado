// Trocado: funções puras (script clássico, sem export; o teste roda o mesmo arquivo num vm do Node).
// Dinheiro sempre em CENTAVOS inteiros (somar 0,1 + 0,2 em reais dá 0,30000000000000004).
"use strict";

const TIPOS_CONTA = { corrente: "Conta corrente", poupanca: "Poupança", carteira: "Dinheiro", cartao: "Cartão de crédito" };

// "15,5" -> 15.5 · "1.234,56" -> 1234.56 · "80.50" -> 80.5 · "1.234" -> 1234. Não número ou <= 0 -> null.
function lerValor(texto) {
  let t = String(texto == null ? "" : texto).replace(/R\$|\s/gi, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else {
    const i = t.lastIndexOf(".");
    // ponto final seguido de 1 ou 2 dígitos é o decimal; senão os pontos são milhar
    t = i >= 0 && /^\d{1,2}$/.test(t.slice(i + 1)) ? t.slice(0, i).replace(/\./g, "") + t.slice(i) : t.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}
// Texto digitado -> centavos (null se inválido). Aceita "-" na frente quando negativo é permitido (saldo inicial).
function lerCentavos(texto, aceitaZeroENegativo) {
  const t = String(texto == null ? "" : texto).trim();
  if (aceitaZeroENegativo) {
    const neg = t.startsWith("-"), resto = neg ? t.slice(1) : t;
    if (/^\s*0*([.,]0*)?\s*$/.test(resto)) return 0;
    const v = lerValor(resto);
    return v == null ? null : (neg ? -1 : 1) * Math.round(v * 100);
  }
  const v = lerValor(t);
  return v == null ? null : Math.round(v * 100);
}

// Data local AAAA-MM-DD (nunca toISOString: depois das 21h no Brasil ele já viraria o dia seguinte).
function hojeLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// 123450 -> "R$ 1.234,50" (sem Intl, igual em qualquer aparelho).
function brl(centavos) {
  const c = Math.abs(Math.round(centavos)), neg = centavos < 0 && c > 0;
  const inteiro = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+$)/g, ".");
  return (neg ? "-" : "") + "R$ " + inteiro + "," + String(c % 100).padStart(2, "0");
}
const paraTexto = (centavos) => (centavos / 100).toFixed(2).replace(".", ",");

function semAcento(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const dataBr = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const diasNoMes = (mes) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
function somaMes(m, n) {
  const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1 + n;
  return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0");
}

// ---------- estado ----------
function estadoInicial() {
  const gasto = ["Comida", "Transporte", "Lazer", "Compras", "Saúde", "Casa", "Contas", "Outros"];
  const entrada = ["Salário", "Vendas", "Outras entradas"];
  return {
    versao: 1,
    contas: [
      { id: "c-carteira", nome: "Dinheiro", tipo: "carteira", saldoInicial: 0 },
      { id: "c-banco", nome: "Conta do banco", tipo: "corrente", saldoInicial: 0 },
    ],
    categorias: [
      ...gasto.map((nome, i) => ({ id: "g" + i, nome, tipo: "gasto", limite: 0 })),
      ...entrada.map((nome, i) => ({ id: "e" + i, nome, tipo: "entrada", limite: 0 })),
    ],
    lancamentos: [],
    aPagar: [],
    ajustes: { ultimoBackup: null },
  };
}

// Efeito de um lançamento no saldo de uma conta (centavos).
function efeito(l, contaId) {
  if (l.tipo === "entrada") return l.conta === contaId ? l.valor : 0;
  if (l.tipo === "gasto") return l.conta === contaId ? -l.valor : 0;
  if (l.tipo === "transferencia") return (l.paraConta === contaId ? l.valor : 0) - (l.conta === contaId ? l.valor : 0);
  return 0;
}
// Saldo de cada conta e o total (cartão de crédito fica negativo quando há fatura a pagar).
function saldos(estado) {
  const linhas = estado.contas.map((c) => ({
    id: c.id, nome: c.nome, tipo: c.tipo,
    saldo: estado.lancamentos.reduce((s, l) => s + efeito(l, c.id), c.saldoInicial || 0),
  }));
  return { linhas, total: linhas.reduce((t, l) => t + l.saldo, 0) };
}

const doMesDe = (estado, mes) => estado.lancamentos.filter((l) => l.data.slice(0, 7) === mes);
const porData = (a, b) => (a.data === b.data ? (b.criado || 0) - (a.criado || 0) : a.data < b.data ? 1 : -1);

// Entrou, gastou, sobrou e "para onde foi" (só gastos; entre contas não conta), com o limite de cada categoria.
function resumoMes(estado, mes) {
  const doMes = doMesDe(estado, mes);
  const entradas = doMes.filter((l) => l.tipo === "entrada").reduce((t, l) => t + l.valor, 0);
  const gastos = doMes.filter((l) => l.tipo === "gasto").reduce((t, l) => t + l.valor, 0);
  const porCategoria = estado.categorias.filter((c) => c.tipo === "gasto").map((c) => ({
    id: c.id, nome: c.nome, limite: c.limite || 0,
    gasto: doMes.filter((l) => l.tipo === "gasto" && l.categoria === c.id).reduce((t, l) => t + l.valor, 0),
  }));
  return { mes, entradas, gastos, sobra: entradas - gastos, porCategoria, lista: doMes.slice().sort(porData) };
}

// Categorias com gasto, da maior para a menor, com a % inteira sobre o total gasto.
function paraOndeFoi(porCategoria) {
  const com = porCategoria.filter((c) => c.gasto > 0), total = com.reduce((t, c) => t + c.gasto, 0);
  return com.sort((a, b) => b.gasto - a.gasto).map((c) => ({ ...c, pct: Math.round((c.gasto * 100) / total) }));
}

// Busca do extrato: descrição, categoria ou conta (sem acento), ou o valor exato ("30" acha R$ 30,00).
function buscar(lista, texto, estado) {
  const busca = semAcento((texto || "").trim());
  if (!busca) return lista;
  const centavos = lerCentavos(busca);
  const nome = (arr, id) => (arr.find((x) => x.id === id) || {}).nome || "";
  return lista.filter((l) => semAcento([l.descricao, nome(estado.categorias, l.categoria), nome(estado.contas, l.conta)].join(" ")).includes(busca)
    || l.valor === centavos);
}

// Data da conta a pagar no mês (dia 31 em fevereiro vira o último dia).
const dataNoMes = (conta, mes) => mes + "-" + String(Math.min(conta.dia, diasNoMes(mes))).padStart(2, "0");

// Próximo vencimento de cada conta: a do mês atual se não foi paga; senão a do mês seguinte.
// Atrasada = venceu antes de hoje sem "Paguei". Ordenadas pela data.
function vencimentos(estado, hoje) {
  const mes = hoje.slice(0, 7);
  return estado.aPagar.map((c) => {
    const pagaEsteMes = (c.pagas || []).includes(mes);
    const ref = pagaEsteMes ? somaMes(mes, 1) : mes;
    const data = dataNoMes(c, ref);
    return { id: c.id, nome: c.nome, valor: c.valor, mes: ref, data, pagaEsteMes, atrasada: !pagaEsteMes && data < hoje };
  }).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

// "Paguei": vira um gasto no dia de hoje e marca o mês. Devolve o lançamento criado (ou null se já paga).
function pagar(estado, contaPagarId, mes, hoje, id, agora) {
  const c = estado.aPagar.find((x) => x.id === contaPagarId);
  if (!c || (c.pagas || []).includes(mes)) return null;
  c.pagas = (c.pagas || []).concat([mes]).slice(-24);
  const l = { id, tipo: "gasto", valor: c.valor, data: hoje, descricao: c.nome, categoria: c.categoria, conta: c.conta, criado: agora, deConta: c.id };
  estado.lancamentos.push(l);
  return l;
}

// Planilha com ";" (Excel em português). Texto que começa com = + - @ ganha ' na frente: não vira fórmula.
function csv(estado, lista) {
  const nome = (arr, id) => (arr.find((x) => x.id === id) || {}).nome || "";
  const cel = (v) => {
    let t = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const tipo = { gasto: "Gasto", entrada: "Entrada", transferencia: "Entre contas" };
  const linhas = lista.map((l) => [dataBr(l.data), tipo[l.tipo], l.descricao, nome(estado.categorias, l.categoria),
    nome(estado.contas, l.conta) + (l.paraConta ? " → " + nome(estado.contas, l.paraConta) : "")].map(cel)
    .concat([(l.tipo === "gasto" ? "-" : "") + paraTexto(l.valor)]).join(";"));   // o valor é nosso: número puro
  return ["Data;Tipo;Descrição;Categoria;Conta;Valor"].concat(linhas).join("\r\n");
}

// Backup lido de arquivo (dado de fora: confere tudo antes de trocar o que está no aparelho).
function validarBackup(obj) {
  const erro = (m) => { throw new Error("Arquivo de backup inválido: " + m + "."); };
  if (!obj || typeof obj !== "object" || obj.app !== "trocado" || !obj.estado) erro("não é um backup do Trocado");
  const e = obj.estado;
  for (const k of ["contas", "categorias", "lancamentos", "aPagar"]) if (!Array.isArray(e[k])) erro("falta " + k);
  const ids = (arr) => new Set(arr.map((x) => x.id));
  const contas = ids(e.contas), cats = ids(e.categorias);
  const inteiro = (n) => Number.isInteger(n);
  for (const c of e.contas) if (typeof c.id !== "string" || typeof c.nome !== "string" || !TIPOS_CONTA[c.tipo] || !inteiro(c.saldoInicial || 0)) erro("conta com problema");
  for (const c of e.categorias) if (typeof c.id !== "string" || typeof c.nome !== "string" || !["gasto", "entrada"].includes(c.tipo)) erro("categoria com problema");
  for (const l of e.lancamentos) {
    if (typeof l.id !== "string" || !["gasto", "entrada", "transferencia"].includes(l.tipo) || !inteiro(l.valor) || l.valor <= 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(l.data) || !contas.has(l.conta) || (l.tipo === "transferencia" ? !contas.has(l.paraConta) : !cats.has(l.categoria))) erro("lançamento com problema");
  }
  for (const c of e.aPagar) if (typeof c.id !== "string" || !inteiro(c.valor) || !(c.dia >= 1 && c.dia <= 31) || !contas.has(c.conta) || !cats.has(c.categoria)) erro("conta a pagar com problema");
  return { versao: 1, contas: e.contas, categorias: e.categorias, lancamentos: e.lancamentos, aPagar: e.aPagar, ajustes: e.ajustes || { ultimoBackup: null } };
}
