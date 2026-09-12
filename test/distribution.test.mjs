import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/distribution.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { distributeEmployee } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const pay = {
  monthlySalary: 100, basePay: 100, positionAllowance: 0, transport: 0, meal: 0,
  childcare: 0, overtimePay: 10, scienceFund: 1, insurancePersonal: 7,
  incomeTax: 2, residentTax: 1, insuranceEmployer: 8, retirementPension: 10,
};
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);

test("3개 사업 배분 후 급여와 퇴직연금 총액을 보존한다", () => {
  const rows = distributeEmployee(pay, [1, 2, 3].map(i => ({ projectId: `검증${i}`, participationRate: 1 / 3, workDays: 31 })));
  assert.equal(sum(rows, "salaryAmount"), 100);
  assert.equal(sum(rows, "employerRetirement"), 10);
  assert.equal(sum(rows, "overtimeAmount"), 10);
  assert.equal(sum(rows, "netPay"), 99);
  assert.equal(sum(rows, "totalCost"), 128);
});

test("일할 계산 총액을 보존하며 참여일 0인 사업에는 잔액을 주지 않는다", () => {
  const rows = distributeEmployee(pay, [
    { projectId: "미참여", participationRate: 0.5, workDays: 0 },
    { projectId: "참여1", participationRate: 0.25, workDays: 15 },
    { projectId: "참여2", participationRate: 0.25, workDays: 15 },
  ], 30);
  assert.equal(sum(rows, "salaryAmount"), 25);
  assert.equal(rows[0].salaryAmount, 0);
  assert.equal(sum(rows, "employerRetirement"), 3);
  assert.equal(rows[0].employerRetirement, 0);
  assert.deepEqual(distributeEmployee(pay, []), []);
});
