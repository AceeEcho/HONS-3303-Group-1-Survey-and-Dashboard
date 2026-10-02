export class HttpError extends Error { constructor(status,message,details) { super(message); this.status=status; this.details=details; } }
export const types = ['shorttext','multiplechoice','checkbox','rating'];
export function validateDefinition(input, publishing=false) {
 if (!input || typeof input!=='object' || Array.isArray(input)) throw new HttpError(400,'Invalid survey.');
 const str=(v,max,name)=>{if(typeof v!=='string'||v.length>max)throw new HttpError(400,`${name} must be text of at most ${max} characters.`);return v.trim();};
 const out={title:str(input.title,160,'Title'),description:str(input.description,3000,'Description'),consent:str(input.consent,3000,'Consent statement'),questions:[]};
 if(!Array.isArray(input.questions)||input.questions.length>80) throw new HttpError(400,'Use up to 80 questions.');
 if(publishing&&(!out.title||!input.questions.length))throw new HttpError(400,'Add a title and at least one question before publishing.');
 const ids=new Set();
 for(const q of input.questions){
  if(!q||typeof q!=='object'||!/^[a-zA-Z0-9_-]{1,64}$/.test(q.id)||ids.has(q.id))throw new HttpError(400,'Question IDs must be unique.');
  ids.add(q.id);
  if(!types.includes(q.type)||typeof q.required!=='boolean')throw new HttpError(400,'Invalid question type or requirement.');
  const next={id:q.id,type:q.type,required:q.required,label:str(q.label,500,'Question'),help:str(q.help??'',1000,'Question help')};
  if(publishing&&!next.label)throw new HttpError(400,'Every question needs a label.');
  if(['multiplechoice','checkbox'].includes(q.type)){
   if(!Array.isArray(q.options)||q.options.length>30)throw new HttpError(400,'Use up to 30 choices.');
   next.options=q.options.map(o=>str(o,200,'Choice'));
   if(publishing&&(next.options.length<2||next.options.some(o=>!o)||new Set(next.options).size!==next.options.length))throw new HttpError(400,'Choice questions need at least two distinct, non-empty choices.');
  }
  if(q.type==='rating'){
   next.max=Number(q.max); if(!Number.isInteger(next.max)||next.max<3||next.max>10)throw new HttpError(400,'Rating scales must end from 3 to 10.');
   next.minLabel=str(q.minLabel??'',80,'Low label'); next.maxLabel=str(q.maxLabel??'',80,'High label');
  }
  out.questions.push(next);
 }
 return out;
}
export function validateAnswers(definition,input,consented){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'Answers must be an object.');
 if(definition.consent&&consented!==true)throw new HttpError(400,'Please agree to the study consent statement.');
 const errors={},answers={};
 if(Object.keys(input).some(id=>!definition.questions.some(q=>q.id===id)))throw new HttpError(400,'An answer does not belong to this survey version.');
 for(const q of definition.questions){
  let v=input[q.id];const empty=v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length)||(typeof v==='string'&&!v.trim());
  if(empty){if(q.required)errors[q.id]='Please answer this question.';else answers[q.id]=q.type==='checkbox'?[]:null;continue;}
  if(q.type==='shorttext'){if(typeof v!=='string'||v.length>4000)errors[q.id]='Use no more than 4,000 characters.';else answers[q.id]=v.trim();}
  if(q.type==='multiplechoice'){if(typeof v!=='string'||!q.options.includes(v))errors[q.id]='Choose one of the listed options.';else answers[q.id]=v;}
  if(q.type==='checkbox'){if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!q.options.includes(x))||new Set(v).size!==v.length)errors[q.id]='Choose from the listed options.';else answers[q.id]=q.options.filter(x=>v.includes(x));}
  if(q.type==='rating'){if(!Number.isInteger(v)||v<1||v>q.max)errors[q.id]='Choose a rating on this scale.';else answers[q.id]=v;}
 }
 if(Object.keys(errors).length)throw new HttpError(400,'Check the highlighted answers.',errors);
 return answers;
}
export function csvCell(value){
 let s=value==null?'':Array.isArray(value)?value.join(' | '):String(value);
 if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function csvRows(record){
 const def=JSON.parse(record.definition_json),answers=JSON.parse(record.answers_json);
 return def.questions.map((q,i)=>[record.id,record.submitted_at,record.number,def.title,i+1,q.id,q.label,q.type,q.required?'yes':'no',answers[q.id]].map(csvCell).join(',')+'\r\n').join('');
}
