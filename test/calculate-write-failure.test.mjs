import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/app/api/payroll/calculate/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
async function run(failedStep){
 const writes=[];const data={payroll_months:{id:'합성월'},payroll_details:[{employee_id:'합성',base_pay:100,position_allowance:0,monthly_salary:100,pay_total:100,overtime_pay:0}],project_assignments:[{employee_id:'합성',project_id:'사업',participation_rate:100,work_days:31}],personal_deductions:[],projects:[]};
 const client={from:table=>{
  let step;
  const chain={select:()=>chain,eq:()=>chain,single:()=>chain,
   delete:()=>{step='delete:'+table;writes.push(step);return chain;},insert:()=>{step='insert:'+table;writes.push(step);return chain;},update:()=>{step='summary';writes.push(step);return chain;},
   then:(resolve,reject)=>Promise.resolve({data:step?null:data[table],error:step===failedStep?{message:'합성 상세'}:null}).then(resolve,reject)};return chain;
 }};
 const exports={};
 vm.runInNewContext(js,{exports,require:name=>{
  if(name==='next/server')return {NextResponse:Response};
  if(name==='@/lib/supabase-server')return {getServiceClient:()=>client};
  if(name==='@/lib/insurance-rates')return {calculateInsurance:()=>{if(failedStep==='calculate')throw new Error('합성 계산 오류');return {personal:{subtotal:0},employer:{subtotal:0}};},calculateRetirement:()=>0};
  if(name==='@/lib/tax-table')return {parseDependents:()=>1,lookupIncomeTax:()=>0,calculateResidentTax:()=>0};
  return {distributeEmployee:()=>[{projectId:'사업',salaryAmount:100}]};
 }});
 const response=await exports.POST({json:async()=>({monthId:'합성월'})});return {response,writes};
}
for(const action of ['delete','insert'])for(const table of ['personal_deductions','employer_contributions','project_assignments','project_expenditures'])test(`${action}:${table} 오류 시 후속 변경 없이 실패 응답`,async()=>{
 const step=action+':'+table;const {response,writes}=await run(step);
 assert.equal(response.status,500);assert.equal(writes.at(-1),step);assert.doesNotMatch(JSON.stringify(await response.json()),/합성 상세/);
});
test('총괄 갱신 실패를 완료로 보고하지 않는다',async()=>{const {response}=await run('summary');assert.equal(response.status,500);});
test('계산 실패는 기존 데이터 삭제 이전에 중단한다',async()=>{const {response,writes}=await run('calculate');assert.equal(response.status,500);assert.equal(writes.length,0);});
test('정상 재계산 완료 응답 유지',async()=>{const {response}=await run('없음');assert.equal(response.status,200);assert.equal((await response.json()).success,true);});
