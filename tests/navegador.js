// Teste de ponta a ponta no Chrome sem janela (tamanho de celular): node tests/navegador.js <pasta-dos-prints> [url]
// Sem url, sobe um servidor local; com url (ex.: o GitHub Pages), testa o site publicado.
// Sobe um servidor local, usa o protocolo de depuração do Chrome (WebSocket nativo do Node 22+) e confere as telas.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const PRINTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "trocado-"));
const PORTA = 8811, DEPURA = 9333;
const URL_APP = process.argv[3] || "http://127.0.0.1:" + PORTA + "/";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(fs.existsSync);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, texto) => { console.log((cond ? "PASS " : "FAIL ") + texto); if (!cond) falhas++; };

async function main() {
  const servidor = process.argv[3] ? { kill() {} } : spawn("python", ["-m", "http.server", String(PORTA), "--bind", "127.0.0.1"], { cwd: RAIZ, stdio: "ignore" });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "trocado-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + DEPURA, "--user-data-dir=" + perfil,
    "--window-size=412,915", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  try {
    await espera(2500);
    const alvos = await (await fetch("http://127.0.0.1:" + DEPURA + "/json")).json();
    const ws = new WebSocket(alvos.find((a) => a.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    let n = 0;
    const pendentes = {}, erros = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pendentes[m.id]) { pendentes[m.id](m); delete pendentes[m.id]; }
      if (m.method === "Runtime.exceptionThrown") erros.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") erros.push(m.params.args.map((a) => a.value || a.description).join(" "));
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error") erros.push(m.params.entry.text);
    });
    const cdp = (method, params) => new Promise((r) => { const id = ++n; pendentes[id] = r; ws.send(JSON.stringify({ id, method, params })); });
    const js = async (expr) => {
      const r = await cdp("Runtime.evaluate", { expression: "(async () => {" + expr + "})()", awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    const print = async (nome) => {
      const r = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(PRINTS, nome + ".png"), Buffer.from(r.result.data, "base64"));
    };
    await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Page.enable"); await cdp("Network.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
    await cdp("Page.navigate", { url: URL_APP });
    await espera(1500);

    // ajudantes dentro da página
    await js(`
      window.T = {
        txt: () => document.querySelector("main").innerText,
        set: (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); },
        clicar: (texto, raiz) => { const b = [...(raiz || document).querySelectorAll("button, a, label")].find((x) => x.innerText.trim() === texto && x.offsetParent !== null); if (!b) throw new Error("sem botão " + texto); b.click(); },
        ficha: (raiz, texto) => { const l = [...raiz.querySelectorAll("label.ficha")].find((x) => x.innerText.trim() === texto); l.querySelector("input").click(); },
        espera: (ms) => new Promise((r) => setTimeout(r, ms)),
      };`);
    ok((await js("return document.title")).startsWith("Início"), "abre no Início");
    ok((await js("return T.txt()")).includes("Bem-vindo ao Trocado"), "boas-vindas no primeiro uso");
    await print("1-inicio-vazio");

    // saldo da conta do banco pela tela de Ajustes
    await js(`location.hash = "ajustes"; await T.espera(400);
      [...document.querySelectorAll("#v-ajustes .texto-botao")].find((b) => b.innerText.includes("Conta do banco")).click(); await T.espera(200);
      const f = document.querySelector("#folha-corpo form"); T.set(f.querySelectorAll("input[type=text]")[1], "1.000,00");
      f.querySelector("button[type=submit]").click(); await T.espera(300);`);
    await js(`location.hash = "inicio"; await T.espera(400);`);
    ok((await js("return T.txt()")).includes("R$ 1.000,00"), "saldo digitado vira o total");

    // gasto, entrada e entre contas
    await js(`location.hash = "lancar"; await T.espera(400);
      const f = document.querySelector("#v-lancar form");
      T.set(f.querySelector("input[inputmode=decimal]"), "15,50"); T.set(f.querySelectorAll("input[type=text]")[1], "Pastel");
      T.ficha(f, "Dinheiro"); f.querySelector("button[type=submit]").click(); await T.espera(300);
      T.ficha(f, "Entrada"); await T.espera(50); T.set(f.querySelector("input[inputmode=decimal]"), "749");
      T.ficha(f, "Conta do banco"); f.querySelector("button[type=submit]").click(); await T.espera(300);
      T.ficha(f, "Entre contas"); await T.espera(50); T.set(f.querySelector("input[inputmode=decimal]"), "50");
      f.querySelector("button[type=submit]").click(); await T.espera(300);`);
    ok((await js("return D.lancamentos.length")) === 3, "3 lançamentos salvos");
    ok((await js("return JSON.parse(localStorage.getItem('trocado')).lancamentos.length")) === 3, "guardado no aparelho");
    await print("2-lancar");
    ok(!(await js("return document.body.innerText")).includes("false"), "nenhum \"false\" escrito na tela (Lançar)");
    await js(`T.ficha(document.querySelector("#v-lancar form"), "Gasto"); const f = document.querySelector("#v-lancar form");
      f.querySelector("button[type=submit]").click(); await T.espera(100);`);
    ok((await js(`return document.querySelector("#v-lancar .erro").innerText`)).includes("valor"), "valor vazio é recusado com aviso");

    await js(`location.hash = "inicio"; await T.espera(400);`);
    const inicio = await js("return T.txt()");
    ok(inicio.includes("R$ 1.733,50"), "total = 1000 + 749 - 15,50");
    ok(inicio.includes("Gastei") && inicio.includes("R$ 15,50"), "mês mostra o gasto");
    await print("3-inicio");

    // conta a pagar e "Paguei"
    await js(`location.hash = "contas"; await T.espera(400); T.clicar("Nova conta a pagar"); await T.espera(200);
      const f = document.querySelector("#folha-corpo form"); const ins = f.querySelectorAll("input");
      T.set(ins[0], "Internet"); T.set(ins[1], "99,90"); T.set(ins[2], "1"); f.querySelector("button[type=submit]").click(); await T.espera(300);`);
    ok((await js("return T.txt()")).includes("Internet"), "conta a pagar cadastrada");
    await js(`T.clicar("Paguei"); await T.espera(300);`);
    ok((await js("return D.lancamentos.some((l) => l.descricao === 'Internet' && l.valor === 9990)")), "Paguei lança o gasto");
    await print("4-contas");

    // extrato e busca
    await js(`location.hash = "extrato"; await T.espera(400); T.set(document.getElementById("busca"), "pastel"); await T.espera(100);`);
    ok((await js("return document.getElementById('ext-lista').innerText")).includes("1 encontrado"), "busca acha o pastel");
    await js(`T.set(document.getElementById("busca"), ""); await T.espera(100);`);
    await print("5-extrato");
    ok(!(await js("return document.body.innerText")).includes("false"), "nenhum \"false\" escrito na tela (Extrato)");

    // corrigir e apagar com desfazer
    await js(`[...document.querySelectorAll("#ext-lista .texto-botao")].find((b) => b.innerText.includes("Pastel")).click(); await T.espera(200);
      T.clicar("Apagar", document.getElementById("folha-corpo")); await T.espera(200);
      document.getElementById("confirmar-sim").click(); await T.espera(300);`);
    ok((await js("return D.lancamentos.some((l) => l.descricao === 'Pastel')")) === false, "apagar remove");
    await js(`T.clicar("Desfazer"); await T.espera(200);`);
    ok((await js("return D.lancamentos.some((l) => l.descricao === 'Pastel')")), "desfazer devolve");

    // tema escuro e ajustes
    await js(`location.hash = "ajustes"; await T.espera(400); T.ficha(document.getElementById("v-ajustes"), "Escuro"); await T.espera(200);`);
    ok((await js("return document.documentElement.dataset.theme")) === "dark", "tema escuro");
    await print("6-ajustes-escuro");
    await js(`location.hash = "inicio"; await T.espera(400);`);
    await print("7-inicio-escuro");

    // offline: o service worker guarda tudo
    ok(await js("const r = await navigator.serviceWorker.ready; return !!r.active"), "service worker ativo");
    await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp("Page.reload", { ignoreCache: false });
    await espera(1500);
    ok((await js("return document.title")).includes("Início"), "abre sem internet");
    ok((await js("return document.querySelector('main').innerText")).includes("R$ 1.633,60"), "dados continuam depois de recarregar offline");

    ok(erros.length === 0, "sem erro no console" + (erros.length ? ": " + erros.join(" | ") : ""));
    console.log("prints em " + PRINTS);
  } finally {
    chrome.kill();
    servidor.kill();
  }
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
