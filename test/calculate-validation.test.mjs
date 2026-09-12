import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/app/api/payroll/calculate/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(){
 let clients=0;const exports={};
 const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:null,error:null})};
 vm.runInNewContext(js,{exports,require:name=>name==='next/server'?{NextResponse:Response}:name==='@/lib/supabase-server'?{getServiceClient:()=>{clients++;return {from:()=>chain};}}:{}});
 return {post:exports.POST,clients:()=>clients};
}
for(const body of [null,[],{}, {monthId:3},{monthId:['합성']},{monthId:{}},{monthId:'  '}])test(`잘못된 재계산 입력은 DB 접근 전400: ${JSON.stringify(body)}`,async()=>{
 const app=setup();const response=await app.post({json:async()=>body});assert.equal(response.status,400);assert.equal(app.clients(),0);
});
test('깨진 JSON 요청도400으로 반환한다',async()=>{
 const app=setup();const response=await app.post({json:async()=>{throw new SyntaxError('합성 JSON 오류');}});assert.equal(response.status,400);assert.equal(app.clients(),0);
});
test('정상 문자열 월ID는 기존 월 조회로 진행한다',async()=>{
 const app=setup();const response=await app.post({json:async()=>({monthId:'합성월'})});assert.equal(response.status,404);assert.equal(app.clients(),1);
});
