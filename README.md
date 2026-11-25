# Trocado · finanças simples

App de finanças pessoais **grátis, sem anúncios e sem conta**: anote o que entra e o que sai, veja para onde vai o
dinheiro, controle as contas a pagar e o limite de cada categoria. Tudo fica **só no aparelho** de quem usa.

**Usar:** abra o link no celular e toque em **Instalar** (Android/PC) ou em Compartilhar → **Adicionar à Tela de
Início** (iPhone). Depois de instalado, funciona sem internet.

## O que tem
- **Início:** quanto você tem no total, onde está (cada conta), o mês (entrou, gastei, sobrou), limites por categoria e
  o que vence nos próximos 30 dias.
- **Extrato:** mês a mês, busca por texto ou valor, "para onde foi" e planilha do mês.
- **A pagar:** contas fixas com dia de vencimento; o "Paguei" já lança o gasto.
- **Lançar:** gasto, entrada ou entre contas (transferência), com desfazer.
- **Ajustes:** contas e saldos, categorias e limites, tema claro/escuro, backup (baixar e importar), planilha e apagar tudo.

## Como é feito
HTML, CSS e JavaScript puros, sem biblioteca e sem servidor (`index.html`, `util.js`, `base.js`, `telas.js`). O
`sw.js` guarda o app para abrir offline. Dinheiro sempre em centavos inteiros. Ideias de produto vindas da análise do
site público de um app do mesmo ramo (separar vitrine e app, tema sem piscar, segurança de borda), sem copiar nome,
marca nem código de ninguém.

## Testes
```
node --test tests/util.test.js   # regras de dinheiro (util.js)
node tests/navegador.js          # ponta a ponta no Chrome sem janela, tamanho de celular, inclusive offline
```

## Publicar uma versão nova
1. Trocar `NOME` em `sw.js` (ex.: `trocado-v2`) para os aparelhos baixarem a versão nova.
2. `git push`: o GitHub Pages publica sozinho.

## Gerar o app Android (Play Store ou APK)
Em https://www.pwabuilder.com, colar o link publicado → **Package for stores** → **Android**. Sai um `.aab` (Play
Store) e um `.apk` (instalar direto), com a chave de assinatura: **guardar a chave**, sem ela não dá para atualizar o
app na loja.

Licença: MIT. Fonte Inter: SIL Open Font License.
