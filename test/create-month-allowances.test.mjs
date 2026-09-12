import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/app/api/payroll/create-month/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
async function create(allowances){
 const writes=[];let months=0;const taxable=[];
 const client={from:table=>{
  let writing=false;
  const data=table==='payroll_months'?(++months===1?[]:[{id:'이전월'}]):table==='employees'?[{id:'합성직원',annual_salary:3000000}]:table==='payroll_details'?[{employee_id:'합성직원',...allowances}]:[];
  const chain={select:()=>chain,eq:()=>chain,lt:()=>chain,order:()=>chain,limit:()=>chain,single:()=>chain,
   insert:rows=>{writing=true;writes.push({table,rows});return chain;},update:()=>{writing=true;return chain;},
   then:(resolve,reject)=>Promise.resolve({data:writing?{id:'새월'}:data,error:null}).then(resolve,reject)};
  return chain;
 }};
 const exports={};
 vm.runInNewContext(js,{exports,require:name=>{
  if(name==='next/server')return {NextResponse:Response};
  if(name==='@/lib/supabase-server')return {getServiceClient:()=>client};
  if(name==='@/lib/insurance-rates')return {calculateInsurance:base=>{taxable.push(base);return {personal:{subtotal:0},employer:{subtotal:0}};},calculateRetirement:()=>0};
  if(name==='@/lib/tax-table')return {parseDependents:()=>1,lookupIncomeTax:()=>0,calculateResidentTax:()=>0};
  return {};
 }});
 const response=await exports.POST({json:async()=>({yearMonth:'2026-09'})});
 assert.equal(response.status,200);
 return {row:writes.find(w=>w.table==='payroll_details').rows[0],taxable};
}
test('전월 교통비와 식비 0원을 보존하고 과세기준을 유지한다',async()=>{
 const {row,taxable}=await create({transport:0,meal:0});
 assert.equal(row.transport,0);assert.equal(row.meal,0);assert.equal(row.nontax_subtotal,0);
 assert.equal(row.base_pay,3000000);assert.equal(taxable[0],3000000);
});
test('전월 수당이 누락되거나 null일 때만 기존 기본금액을 사용한다',async()=>{
 for(const allowances of [{},{transport:null,meal:null}]){
  const {row}=await create(allowances);
  assert.equal(row.transport,200000);assert.equal(row.meal,200000);
 }
});
test('전월의 다른 교통비와 식비는 그대로 복제한다',async()=>{
 const {row,taxable}=await create({transport:100000,meal:150000});
 assert.equal(row.transport,100000);assert.equal(row.meal,150000);
 assert.equal(taxable[0],2750000);
});
