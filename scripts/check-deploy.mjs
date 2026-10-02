import {readFile} from 'node:fs/promises';
const publicConfig=JSON.parse(await readFile('wrangler.public.jsonc','utf8'));
const adminConfig=JSON.parse(await readFile('wrangler.admin.jsonc','utf8'));
const problems=[];
for(const [name,c]of [['public',publicConfig],['admin',adminConfig]]){
 if(c.vars.APP_MODE!==name||c.vars.ENVIRONMENT!=='production')problems.push(`${name}: production mode is required`);
 if(!/^[0-9a-f-]{36}$/i.test(c.d1_databases?.[0]?.database_id||''))problems.push(`${name}: set the real D1 database ID`);
 if(c.assets?.run_worker_first!==true)problems.push(`${name}: run_worker_first must remain true`);
}
if(publicConfig.d1_databases[0].database_id!==adminConfig.d1_databases[0].database_id)problems.push('Both Workers must bind the same D1 database');
if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(adminConfig.vars.ACCESS_TEAM_DOMAIN)||/REPLACE/i.test(adminConfig.vars.ACCESS_TEAM_DOMAIN))problems.push('Set your Cloudflare Access team domain');
if(!adminConfig.vars.ACCESS_AUD||/REPLACE/i.test(adminConfig.vars.ACCESS_AUD))problems.push('Set the creator Access application audience');
if(!adminConfig.vars.ADMIN_EMAILS?.trim())problems.push('Set the exact approved creator email(s)');
try{const url=new URL(adminConfig.vars.PUBLIC_SURVEY_URL);if(url.protocol!=='https:'||/REPLACE/i.test(url.hostname))throw 0;}catch{problems.push('Set the real HTTPS public survey URL');}
if(problems.length){console.error('Deployment is not configured yet:\n- '+problems.join('\n- '));process.exit(1);}
console.log('Configuration checks passed. Verify Cloudflare Access policy and current account limits before deploying.');
