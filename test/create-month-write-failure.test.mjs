import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/app/api/payroll/create-month/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
async function run(failedStep,throws=false){
 const writes=[];let months=0;
 const client={from:table=>{
  let step=null;
  const data=table==='payroll_months'?(++months===1?[]:[{id:'합성이전월'}]):table==='employees'?[{id:'합성직원',annual_salary:3000000}]:table==='project_assignments'?[{employee_id:'합성직원',project_id:'합성사업'}]:[];
  const chain={select:()=>chain,eq:()=>chain,lt:()=>chain,order:()=>chain,limit:()=>chain,single:()=>chain,
   insert:()=>{step=table;writes.push(step);return chain;},update:()=>{step='summary';writes.push(step);return chain;},
   then:(resolve,reject)=>{if(step===failedStep&&throws)return Promise.reject(new Error('합성 내부 상세')).then(resolve,reject);return Promise.resolve({data:step?{id:'합성새월'}:data,error:step===failedStep?{message:'합성 내부 상세'}:null}).then(resolve,reject);}};
  return chain;
 }};
 const exports={};
 vm.runInNewContext(js,{exports,console:{error:()=>{}},require:name=>{
  if(name==='next/server')return {NextResponse:Response};
  if(name==='@/lib/supabase-server')return {getServiceClient:()=>client};
  if(name==='@/lib/insurance-rates')return {calculateInsurance:()=>({personal:{subtotal:0},employer:{subtotal:0}}),calculateRetirement:()=>0};
  if(name==='@/lib/tax-table')return {parseDependents:()=>1,lookupIncomeTax:()=>0,calculateResidentTax:()=>0};
  return {distributeEmployee:()=>[{projectId:'합성사업',salaryAmount:3000000}]};
 }});
 const response=await exports.POST({json:async()=>({yearMonth:'2026-09'})});
 return {response,writes};
}
for(const step of ['payroll_details','personal_deductions','employer_contributions','project_assignments','project_expenditures','summary'])test(`${step} 저장 실패는 후속 저장 없이 실패로 보고한다`,async()=>{
 const {response,writes}=await run(step);
 assert.equal(response.status,500);assert.equal(writes.at(-1),step);
 const body=await response.json();assert.notEqual(body.success,true);assert.equal(body.monthId,'합성새월');assert.doesNotMatch(JSON.stringify(body),/합성 내부 상세/);
});
test('저장 네트워크 예외도 부분 저장 안내로 반환한다',async()=>{
 const {response,writes}=await run('personal_deductions',true);
 assert.equal(response.status,500);assert.equal(writes.at(-1),'personal_deductions');
});
test('모든 저장이 성공하면 기존 생성 완료 응답을 유지한다',async()=>{
 const {response}=await run('없음');assert.equal(response.status,200);assert.equal((await response.json()).success,true);
});
