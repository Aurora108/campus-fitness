// Cloudflare Worker: GitHub OAuth 和私有仓库记录同步。
const GITHUB = 'https://api.github.com';
const utf8 = new TextEncoder();
const decode = new TextDecoder();
const allowMethods = 'GET, PUT, OPTIONS';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers}});
}
function b64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(s) {
  const t = s.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(t + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0));
}
function site(env) { return new URL(env.SITE_URL); }
function cors(env) { return {'Access-Control-Allow-Origin': site(env).origin, 'Access-Control-Allow-Methods': allowMethods, 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Vary':'Origin'}; }
function authHeaders(token) {return {Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'campus-fitness-sync'};}
async function github(url, token, options={}) {return fetch(url,{...options,headers:{...authHeaders(token),...(options.headers||{})}});}
async function cipherKey(env) {
  const raw = unb64(env.SESSION_KEY);
  if(raw.length!==32) throw new Error('SESSION_KEY 必须是 32 字节的 base64url 字符串');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(env, value) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const out=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(env),utf8.encode(JSON.stringify(value)));
  return b64(iv)+'.'+b64(new Uint8Array(out));
}
async function unseal(env, input) {
  try {
    if(!input || input.length>8192) return null;
    const [a,b,...rest]=input.split('.'); if(rest.length || !a || !b) return null;
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(a)},await cipherKey(env),unb64(b));
    const value=JSON.parse(decode.decode(plaintext));
    return value.exp>Date.now() && value.login===env.GITHUB_OWNER ? value : null;
  } catch {return null;}
}
function validData(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) || !value.days || !Array.isArray(value.measurements)) return false;
  if(typeof value.days!=='object' || Array.isArray(value.days) || Object.keys(value.days).length>2000 || value.measurements.length>2000) return false;
  const date=/^\d{4}-\d{2}-\d{2}$/;
  const ids=new Set(['squat','bridge','push','bird','dead','breath','swim','walkl','walkd']);
  for(const [day,items] of Object.entries(value.days)) {
    if(!date.test(day) || !items || typeof items!=='object' || Array.isArray(items)) return false;
    if(Object.entries(items).some(([id,done])=>!ids.has(id)||typeof done!=='boolean')) return false;
  }
  return value.measurements.every(m=>m && date.test(m.date) && Number.isFinite(m.weight) && m.weight>=35 && m.weight<=200 && (m.waist===null || (Number.isFinite(m.waist)&&m.waist>=40&&m.waist<=160)));
}
function redirect(url, cookie) {const h={'Cache-Control':'no-store',Location:url}; if(cookie) h['Set-Cookie']=cookie; return new Response(null,{status:302,headers:h});}
export default {async fetch(request, env) {
  try {
    const url=new URL(request.url), path=url.pathname, siteURL=site(env);
    const origin=request.headers.get('Origin');
    if(path.startsWith('/api/')) {
      const headers=cors(env);
      if(origin && origin!==siteURL.origin) return json({error:'来源不允许'},403);
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
      if(!['GET','PUT'].includes(request.method)) return json({error:'方法不允许'},405,headers);
      const bearer=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      const session=await unseal(env,bearer);
      if(!session) return json({error:'请重新登录 GitHub'},401,headers);
      if(path==='/api/status' && request.method==='GET') return json({login:session.login},200,headers);
      if(path!=='/api/data') return json({error:'不存在的地址'},404,headers);
      const repo=`${GITHUB}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.DATA_REPO)}/contents/records.json`;
      if(request.method==='GET') {
        const r=await github(repo,session.token);
        if(r.status===404) return json({data:{days:{},measurements:[]},sha:null,empty:true},200,headers);
        if(!r.ok) return json({error:'读取数据仓库失败，请检查仓库名及授权',github_status:r.status},r.status===401?401:502,headers);
        const file=await r.json();
        return json({data:JSON.parse(decode.decode(unb64(file.content.replace(/\s/g,'')))),sha:file.sha,empty:false},200,headers);
      }
      if(origin!==siteURL.origin) return json({error:'来源不允许'},403,headers);
      if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'需要 JSON'},415,headers);
      if(Number(request.headers.get('Content-Length'))>200000) return json({error:'记录过大'},413,headers);
      const input=await request.text(); if(input.length>200000) return json({error:'记录过大'},413,headers);
      let body; try {body=JSON.parse(input);} catch{return json({error:'JSON 格式错误'},400,headers);}
      if(!validData(body.data) || (body.sha!==null && typeof body.sha!=='string')) return json({error:'记录格式不正确'},400,headers);
      const email=`${env.GITHUB_USER_ID}+${env.GITHUB_OWNER}@users.noreply.github.com`;
      const encoded= b64(utf8.encode(JSON.stringify(body.data,null,2))).replace(/-/g,'+').replace(/_/g,'/');
      const content=encoded+'='.repeat((4-encoded.length%4)%4);
      const payload={message:'Save fitness check-in records',content,branch:'main',author:{name:env.GITHUB_OWNER,email},committer:{name:env.GITHUB_OWNER,email}};
      if(body.sha) payload.sha=body.sha;
      const r=await github(repo,session.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(r.status===409 || r.status===422) return json({error:'仓库数据已变化，请重新读取后再保存',conflict:true},409,headers);
      if(!r.ok) return json({error:'写入仓库失败，请检查权限和仓库',github_status:r.status},502,headers);
      return json({sha:(await r.json()).content.sha},200,headers);
    }
    if(path==='/auth/start') {
      if(!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_KEY) return json({error:'服务端密钥尚未配置'},503);
      const state=b64(crypto.getRandomValues(new Uint8Array(24)));
      const authorize=new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id',env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri',url.origin+'/auth/callback');
      authorize.searchParams.set('scope','repo');
      authorize.searchParams.set('state',state);
      return redirect(authorize.toString(),`fitness_state=${state}; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    }
    if(path==='/auth/callback') {
      const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)fitness_state=([^;]+)/)?.[1];
      const clear='fitness_state=; Path=/auth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
      if(!cookie || cookie!==url.searchParams.get('state') || !url.searchParams.get('code')) return redirect(env.SITE_URL+'#sync_error=state',clear);
      const r=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json','User-Agent':'campus-fitness-sync'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:url.origin+'/auth/callback'})});
      const grant=await r.json();
      if(!grant.access_token) return redirect(env.SITE_URL+'#sync_error=oauth',clear);
      const user=await github(GITHUB+'/user',grant.access_token);
      if(!user.ok || (await user.json()).login!==env.GITHUB_OWNER) return redirect(env.SITE_URL+'#sync_error=account',clear);
      const session=await seal(env,{token:grant.access_token,login:env.GITHUB_OWNER,exp:Date.now()+30*24*3600*1000});
      return redirect(env.SITE_URL+'#fitness_session='+encodeURIComponent(session),clear);
    }
    return json({error:'不存在的地址'},404);
  } catch(error) {console.error(error);return json({error:'服务暂时不可用，请稍后重试'},500);}
}};
