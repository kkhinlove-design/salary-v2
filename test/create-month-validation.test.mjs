import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/app/api/payroll/create-month/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
function setup() {
  let queries = 0;
  const exports = {};
  const client = {from: () => {
    queries++;
    const chain = {select: () => chain, eq: () => chain, limit: async () => ({data: [{id: '합성월'}]})};
    return chain;
  }};
  const context = vm.createContext({exports, require: name => {
    if (name === 'next/server') return {NextResponse: Response};
    if (name === '@/lib/supabase-server') return {getServiceClient: () => client};
    return {};
  }});
  vm.runInContext(js, context);
  return {post: exports.POST, queries: () => queries};
}
for (const yearMonth of ['2026-00', '2026-13', '0000-01', ['2026-09']]) {
  test(`존재하지 않는 월/잘못된 타입을 저장 전에 거절: ${JSON.stringify(yearMonth)}`, async () => {
    const app = setup();
    const response = await app.post({json: async () => ({yearMonth})});
    assert.equal(response.status, 400);
    assert.equal(app.queries(), 0);
  });
}
for (const baseWorkDays of [0, -1, 32, 1.5, null, '30']) {
  test(`잘못된 기준일수를 저장 전에 거절: ${JSON.stringify(baseWorkDays)}`, async () => {
    const app = setup();
    const response = await app.post({json: async () => ({yearMonth: '2026-09', baseWorkDays})});
    assert.equal(response.status, 400);
    assert.equal(app.queries(), 0);
  });
}
test('JSON 파싱 실패와 null 요청을 400으로 처리한다', async () => {
  for (const json of [async () => {throw new SyntaxError('합성 JSON 오류');}, async () => null]) {
    const app = setup();
    assert.equal((await app.post({json})).status, 400);
    assert.equal(app.queries(), 0);
  }
});
test('정상 월과 1·30·31일 및 기본값은 기존 중복월 검사로 진행한다', async () => {
  for (const baseWorkDays of [undefined, 1, 30, 31]) {
    const app = setup();
    const response = await app.post({json: async () => ({yearMonth: '2026-09', baseWorkDays})});
    assert.equal(response.status, 409);
    assert.equal(app.queries(), 1);
  }
});
