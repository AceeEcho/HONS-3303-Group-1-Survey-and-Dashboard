import {createRemoteJWKSet,jwtVerify} from 'jose';
import {HttpError} from './model.js';
const keysets=new Map();
export function isLocal(request,env){return env.APP_MODE==='local'&&env.ENVIRONMENT==='development'&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);}
export async function authorize(request,env,keyResolver){
 if(isLocal(request,env)&&request.headers.get('Cookie')?.split(';').some(x=>x.trim()==='fieldwork_local=creator'))return {email:'local preview',local:true};
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN||'')||!env.ACCESS_AUD||!env.ADMIN_EMAILS?.trim())throw new HttpError(503,'Creator sign-in has not been configured.');
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token)throw new HttpError(401,'Sign in to the private creator studio.');
 const issuer=`https://${env.ACCESS_TEAM_DOMAIN}`;
 let keys=keyResolver;
 if(!keys){if(!keysets.has(issuer))keysets.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));keys=keysets.get(issuer);}
 let payload;try{({payload}=await jwtVerify(token,keys,{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']}));}catch{throw new HttpError(401,'Your sign-in could not be verified. Sign in again.');}
 const allowed=env.ADMIN_EMAILS.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 if(typeof payload.email!=='string'||!allowed.includes(payload.email.toLowerCase()))throw new HttpError(403,'This account does not have creator access.');
 return {email:payload.email,local:false};
}
