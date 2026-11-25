// node --test tests/util.test.js  (roda o util.js de verdade num vm, como a página usa)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "util.js"), "utf8") + "\n;Object.assign(this, {lerValor, lerCentavos, brl, estadoInicial, saldos, resumoMes, paraOndeFoi, buscar, vencimentos, pagar, csv, validarBackup, somaMes, diasNoMes});", ctx);
const U = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x));

function base() {
  const e = U.estadoInicial();
  e.contas[1].saldoInicial = 100000; // R$ 1.000 no banco
  e.lancamentos.push(
    { id: "1", tipo: "gasto", valor: 1550, data: "2026-11-03", descricao: "Pastel", categoria: "g0", conta: "c-carteira" },
    { id: "2", tipo: "entrada", valor: 74900, data: "2026-11-05", descricao: "Salário", categoria: "e0", conta: "c-banco" },
    { id: "3", tipo: "transferencia", valor: 5000, data: "2026-11-06", descricao: "Saque", conta: "c-banco", paraConta: "c-carteira" },
    { id: "4", tipo: "gasto", valor: 3000, data: "2026-10-30", descricao: "Uber", categoria: "g1", conta: "c-banco" },
  );
  return e;
}

test("valores digitados viram centavos", () => {
  assert.equal(U.lerCentavos("15,50"), 1550);
  assert.equal(U.lerCentavos("1.234,56"), 123456);
  assert.equal(U.lerCentavos("0,1"), 10);
  assert.equal(U.lerCentavos("abc"), null);
  assert.equal(U.lerCentavos("0"), null);
  assert.equal(U.lerCentavos("0", true), 0);
  assert.equal(U.lerCentavos("-250,00", true), -25000);
  assert.equal(U.brl(123450), "R$ 1.234,50");
  assert.equal(U.brl(-5), "-R$ 0,05");
});

test("saldos: entrada, gasto e entre contas; total não muda com transferência", () => {
  const s = U.saldos(base());
  assert.deepEqual(plain(s.linhas.map((l) => l.saldo)), [-1550 + 5000, 100000 + 74900 - 5000 - 3000]);
  assert.equal(s.total, 100000 + 74900 - 1550 - 3000);
});

test("resumo do mês ignora outros meses e transferências", () => {
  const r = U.resumoMes(base(), "2026-11");
  assert.equal(r.entradas, 74900);
  assert.equal(r.gastos, 1550);
  assert.equal(r.sobra, 74900 - 1550);
  assert.equal(r.lista.length, 3);
  assert.equal(r.lista[0].id, "3"); // mais novo primeiro
  const onde = U.paraOndeFoi(r.porCategoria);
  assert.deepEqual(plain(onde.map((c) => [c.nome, c.pct])), [["Comida", 100]]);
});

test("busca por texto sem acento, categoria e valor exato", () => {
  const e = base();
  assert.equal(U.buscar(e.lancamentos, "salario", e).length, 1);
  assert.equal(U.buscar(e.lancamentos, "transporte", e)[0].id, "4");
  assert.equal(U.buscar(e.lancamentos, "15,50", e)[0].id, "1");
  assert.equal(U.buscar(e.lancamentos, "", e).length, 4);
});

test("vencimentos: atrasada, paga vai para o mês seguinte, dia 31 em fevereiro", () => {
  const e = base();
  e.aPagar.push({ id: "a", nome: "Internet", valor: 9990, dia: 10, conta: "c-banco", categoria: "g6", pagas: [] });
  e.aPagar.push({ id: "b", nome: "Aluguel", valor: 50000, dia: 31, conta: "c-banco", categoria: "g5", pagas: [] });
  let v = U.vencimentos(e, "2026-11-20");
  assert.deepEqual(plain(v.map((x) => [x.id, x.data, x.atrasada])), [["a", "2026-11-10", true], ["b", "2026-11-30", false]]);
  const l = U.pagar(e, "a", "2026-11", "2026-11-20", "p1", 1);
  assert.equal(l.valor, 9990);
  assert.equal(U.pagar(e, "a", "2026-11", "2026-11-20", "p2", 2), null); // não paga duas vezes
  v = U.vencimentos(e, "2026-11-20");
  assert.equal(v.find((x) => x.id === "a").data, "2026-12-10");
  assert.equal(U.vencimentos(e, "2027-02-01").find((x) => x.id === "b").data, "2027-02-28");
  assert.equal(U.diasNoMes("2028-02"), 29);
});

test("planilha: ; e proteção contra fórmula", () => {
  const e = base();
  e.lancamentos[0].descricao = "=HYPERLINK(1)";
  const t = U.csv(e, e.lancamentos).split("\r\n");
  assert.equal(t[0], "Data;Tipo;Descrição;Categoria;Conta;Valor");
  assert.equal(t[1], "03/11/2026;Gasto;'=HYPERLINK(1);Comida;Dinheiro;-15,50");
  assert.equal(t[3], "06/11/2026;Entre contas;Saque;;Conta do banco → Dinheiro;50,00");
});

test("backup: aceita o certo e recusa o estragado", () => {
  const e = base();
  assert.equal(U.validarBackup({ app: "trocado", estado: e }).lancamentos.length, 4);
  assert.throws(() => U.validarBackup({ app: "outro", estado: e }), /não é um backup/);
  const ruim = plain(e);
  ruim.lancamentos[0].valor = 15.5;
  assert.throws(() => U.validarBackup({ app: "trocado", estado: ruim }), /lançamento/);
  const semConta = plain(e);
  semConta.lancamentos[0].conta = "nada";
  assert.throws(() => U.validarBackup({ app: "trocado", estado: semConta }), /lançamento/);
});
