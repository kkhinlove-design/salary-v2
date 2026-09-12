import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/app/api/payroll/create-month/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
function setup(failedRead, noPrevious = false) {
  const writes = [];
  let monthReads = 0;
  const exports = {};
  const client = {from: table => {
    let writing = false;
    const key = table === 'payroll_months' ? (++monthReads === 1 ? 'existing' : 'previous') : table;
    const result = () => writing ? {data: {id: '합성새월'}, error: null} : {
      data: key === failedRead ? null : key === 'previous' && !noPrevious ? [{id: '합성이전월'}] : key === 'employees' && failedRead ? [{id: '합성직원'}] : [],
      error: key === failedRead ? {message: '합성 내부 오류 상세'} : null,
    };
    const chain = {
      select: () => chain, eq: () => chain, lt: () => chain, order: () => chain, limit: () => chain,
      single: () => chain,
      insert: rows => {writing = true; writes.push({table, rows}); return chain;},
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  }};
  vm.runInNewContext(js, {exports, require: name => name === 'next/server' ? {NextResponse: Response} : name === '@/lib/supabase-server' ? {getServiceClient: () => client} : {}});
  return {post: () => exports.POST({json: async () => ({yearMonth: '2026-09'})}), writes};
}
for (const key of ['existing', 'previous', 'employees', 'payroll_details', 'project_assignments', 'projects']) {
  test(`${key} 조회 실패 시 새 월과 급여 데이터를 생성하지 않는다`, async () => {
    const app = setup(key);
    const response = await app.post();
    assert.equal(app.writes.length, 0);
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(await response.json()), /합성 내부 오류 상세/);
  });
}
for (const noPrevious of [true, false]) {
  test(`직원 없는 정상 월 생성 유지: 전월 ${noPrevious ? '없음' : '있음'}`, async () => {
    const app = setup(null, noPrevious);
    const response = await app.post();
    assert.equal(response.status, 200);
    assert.equal(app.writes.length, 1);
    assert.equal(app.writes[0].table, 'payroll_months');
    assert.equal((await response.json()).employees, 0);
  });
}
