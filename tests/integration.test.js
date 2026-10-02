import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
let mf,db;
const base='http://localhost';
const request=(path,method='GET',payload,auth=true,extra={})=>mf.dispatchFetch(base+path,{method,headers:{...(auth?{Cookie:'fieldwork_local=creator'}:{}),...(method==='GET'?{}:{Origin:base,'Content-Type':'application/json','X-Survey-Request':'1'}),...extra},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
const asJson=async(...args)=>{const r=await request(...args);return [r,await r.json()];};
before(async()=>{const bundle=await build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'esm',platform:'browser'});mf=new Miniflare(convertV4MiniflareOptions({name:'survey',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',bindings:{APP_MODE:'local',ENVIRONMENT:'development'},d1Databases:{DB:'test-survey'}}));db=await mf.getD1Database('DB');const sql=await readFile('migrations/0001_initial.sql','utf8');const triggers=sql.match(/CREATE TRIGGER[\s\S]*?END;/g)||[];const statements=[...sql.replace(/CREATE TRIGGER[\s\S]*?END;/g,'').split(';').filter(s=>s.trim()),...triggers];for(const s of statements)await db.prepare(s).run();});
after(async()=>{await mf?.dispose();});
test('D1 lifecycle, snapshots, idempotent writes, export and authorization',async()=>{
 let [r,s]=await asJson('/api/public/survey');assert.equal(s.status,'draft');
 for(const p of ['/api/admin/survey','/api/admin/responses','/api/admin/export.csv']){r=await request(p,'GET',undefined,false);assert.ok(r.status>=400);}
 r=await request('/api/admin/survey','PUT',{expected_version:0,draft:{}},true,{Origin:'https://evil.example'});assert.equal(r.status,403);
 r=await request('/api/admin/publish','POST',{expected_version:0});assert.equal(r.status,400);
 const draft={title:'Integration-only fixture',description:'Not a real study',consent:'',questions:[{id:'q1',type:'shorttext',label:'Original question',required:true,help:''},{id:'q2',type:'multiplechoice',label:'Choice',required:true,help:'',options:['Alpha','Beta']},{id:'q3',type:'checkbox',label:'Multiple',required:false,help:'',options:['Alpha','Beta']},{id:'q4',type:'rating',label:'Rating',required:true,help:'',max:5,minLabel:'Low',maxLabel:'High'}]};
 [r,s]=await asJson('/api/admin/survey','PUT',{expected_version:0,draft});assert.equal(r.status,200);assert.equal(s.draft_version,1);
 r=await request('/api/admin/survey','PUT',{expected_version:0,draft});assert.equal(r.status,409);
 [r,s]=await asJson('/api/admin/publish','POST',{expected_version:1});assert.equal(r.status,201);const v1=s.published_id;assert.equal(s.versions[0].number,1);
 const publicData=await (await request('/api/public/survey')).json();assert.equal(publicData.definition.questions[0].label,'Original question');assert.equal(publicData.response_count,undefined);assert.equal(publicData.user,undefined);
 const submission={id:crypto.randomUUID(),revision_id:v1,answers:{q1:'=SUM(1)',q2:'Alpha',q3:['Beta'],q4:4}};
 r=await request('/api/public/responses','POST',{...submission,answers:{q1:'',q2:'Unknown',q4:9}},false);assert.equal(r.status,400);
 r=await request('/api/public/responses','POST',submission,false);assert.equal(r.status,201);r=await request('/api/public/responses','POST',submission,false);assert.equal(r.status,200);
 r=await request('/api/public/responses','POST',{...submission,answers:{...submission.answers,q1:'different'}},false);assert.equal(r.status,409);
 const revised=structuredClone(draft);revised.questions[0].label='Revised question';revised.questions.reverse();revised.questions[0].required=false;
 [r,s]=await asJson('/api/admin/survey','PUT',{expected_version:s.draft_version,draft:revised});assert.equal(r.status,200);
 [r,s]=await asJson('/api/admin/publish','POST',{expected_version:s.draft_version});assert.equal(s.versions[0].number,2);assert.notEqual(s.published_id,v1);
 [r,s]=await asJson('/api/admin/responses');assert.equal(s.responses.length,1);assert.equal(s.responses[0].definition.questions[0].label,'Original question');assert.equal(s.responses[0].number,1);assert.equal(s.responses[0].answers.q1,'=SUM(1)');
 const csv=await (await request('/api/admin/export.csv')).text();assert.match(csv,/Original question/);assert.match(csv,/'=SUM\(1\)/);assert.equal(csv.includes('Revised question'),false);
 await assert.rejects(()=>db.prepare('UPDATE revisions SET definition_json=? WHERE id=?').bind('{}',v1).run(),/immutable/);await assert.rejects(()=>db.prepare('DELETE FROM revisions WHERE id=?').bind(v1).run(),/immutable/);
 // A participant already holding v1 may complete it after v2 is published.
 r=await request('/api/public/responses','POST',{...submission,id:crypto.randomUUID()},false);assert.equal(r.status,201);
 r=await request('/api/admin/collection','POST',{accepting:false});assert.equal(r.status,200);
 r=await request('/api/public/responses','POST',{...submission,id:crypto.randomUUID()},false);assert.equal(r.status,409);
 assert.equal((await (await request('/api/public/survey')).json()).status,'paused');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM responses').first()).n,2);
 // Public response reads never exist, regardless of a known response ID.
 for(const path of ['/api/public/responses','/api/public/responses/'+submission.id,'/api/responses'])assert.equal((await request(path,'GET',undefined,false)).status,404);
});
