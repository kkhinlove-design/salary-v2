import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/app/api/payroll/calculate/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(failedTable, missingMonth=false){
  let writes=0;
  const data={payroll_months:missingMonth?null:{id:'검증월'},payroll_details:[{employee_id:'검증직원'}],project_assignments:[],personal_deductions:[],projects:[]};
  const exports={};
  const client={from:table=>{
    const result=()=>({data:table===failedTable?null:data[table],error:table===failedTable?{message:'합성 조회 실패'}:null});
    const chain={select:()=>chain,eq:()=>chain,single:async()=>result(),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject),delete:()=>{writes++;throw new Error('쓰기 도달');}};
    return chain;
  }};
  vm.runInNewContext(js,{exports,require:name=>name==='next/server'?{NextResponse:Response}:name==='@/lib/supabase-server'?{getServiceClient:()=>client}:{}});
  return {post:exports.POST,writes:()=>writes};
}
for(const table of ['payroll_months','payroll_details','project_assignments','personal_deductions','projects']){
  test(`${table} 조회 실패 시 기존 데이터를 변경하지 않는다`,async()=>{
    const app=setup(table);
    let response;
    try{response=await app.post({json:async()=>({monthId:'검증월'})});}catch{}
    assert.equal(app.writes(),0);
    assert.equal(response?.status,500);
    assert.doesNotMatch(JSON.stringify(await response.json()),/합성 조회 실패/);
  });
}
test('조회는 성공했지만 월이 없으면 기존 404 동작을 유지한다',async()=>{
  const app=setup(null,true);
  const response=await app.post({json:async()=>({monthId:'없는월'})});
  assert.equal(response.status,404);
  assert.equal(app.writes(),0);
});
