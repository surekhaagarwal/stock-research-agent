const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the dashboard's actual private, pure parser without importing React
// or adding exports/refactoring application code just to test this mapping.
const source = ts.createSourceFile(
  "equity-dashboard.tsx",
  readFileSync(require.resolve("../components/equity-dashboard.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const helpers = new Set([
  "RECOGNIZED_COMPANIES",
  "escapeRegExp",
  "companyPattern",
  "extractUppercaseTickers",
  "extractComparisonTickers",
]);
const statements = source.statements.filter((statement) => {
  if (ts.isFunctionDeclaration(statement)) {
    return helpers.has(statement.name?.text);
  }
  return ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      (declaration) => ts.isIdentifier(declaration.name) && helpers.has(declaration.name.text),
    );
});
assert.equal(statements.length, helpers.size, "All production parser helpers must be present");
const { outputText } = ts.transpileModule(
  statements.map((statement) => statement.getText(source)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS } },
);
const parse = vm.runInNewContext(`${outputText}\nextractComparisonTickers;`);
const extractComparisonTickers = (message, history = []) =>
  JSON.parse(JSON.stringify(parse(message, history)));

for (const prompt of ["Compare Microsoft and Amazon", "Compare MSFT and AMZN"]) {
  test(prompt, () => {
    assert.deepEqual(extractComparisonTickers(prompt), {
      pairs: [{ ticker_a: "MSFT", ticker_b: "AMZN" }],
      truncated: false,
    });
  });
}

test("company names remain case-insensitive", () => {
  assert.deepEqual(extractComparisonTickers("compare microsoft and amazon"), {
    pairs: [{ ticker_a: "MSFT", ticker_b: "AMZN" }],
    truncated: false,
  });
});

test("existing mappings still produce every unique company pair", () => {
  assert.deepEqual(extractComparisonTickers("Compare Microsoft, Apple and Nvidia"), {
    pairs: [
      { ticker_a: "MSFT", ticker_b: "AAPL" },
      { ticker_a: "MSFT", ticker_b: "NVDA" },
      { ticker_a: "AAPL", ticker_b: "NVDA" },
    ],
    truncated: false,
  });
});

test("Amazon participates in multi-company comparisons without duplicate pairs", () => {
  assert.deepEqual(extractComparisonTickers("Compare Microsoft, Amazon, AMZN and Pfizer"), {
    pairs: [
      { ticker_a: "MSFT", ticker_b: "AMZN" },
      { ticker_a: "MSFT", ticker_b: "PFE" },
      { ticker_a: "AMZN", ticker_b: "PFE" },
    ],
    truncated: false,
  });
});

test("follow-up comparisons retain companies from prior user messages", () => {
  assert.deepEqual(extractComparisonTickers("Compare it with Amazon", ["Research Microsoft"]), {
    pairs: [{ ticker_a: "AMZN", ticker_b: "MSFT" }],
    truncated: false,
  });
});

test("the five-company limit remains in place", () => {
  const result = extractComparisonTickers("Compare Microsoft, Amazon, Apple, Nvidia, Pfizer and Merck");
  assert.equal(result.truncated, true);
  assert.equal(result.pairs.length, 10);
  assert.equal(new Set(result.pairs.flatMap(({ ticker_a, ticker_b }) => [ticker_a, ticker_b])).size, 5);
});
