(() => {
  const api = (window.FITNESS_API_URL || '').replace(/\/$/, '');
  const ready = /^https:\/\/[^/]+\.workers\.dev$/.test(api) || /^https:\/\/[^/]+$/.test(api) && !api.includes('REPLACE_');
  const box = document.getElementById('syncbox');
  const sessionKey = 'campus-fit-github-session';
  const dirtyKey = 'campus-fit-dirty';
  let session = localStorage.getItem(sessionKey), sha = null, loaded = false, busy = false, queued = false, timer;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const callbackError = fragment.get('sync_error');
  if (fragment.has('fitness_session')) { session=fragment.get('fitness_session');localStorage.setItem(sessionKey,session); }
  if (fragment.has('fitness_session') || callbackError) history.replaceState(null,'',location.pathname+location.search);
  const login = () => { location.assign(api+'/auth/start'); };
  const message = (txt,buttons='') => { box.innerHTML='';const span=document.createElement('span');span.textContent=txt;box.append(span);for(const [label,fn] of buttons){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.addEventListener('click',fn);box.append(document.createElement('br'),b);} };
  const logout = () => {localStorage.removeItem(sessionKey);session=null;loaded=false;message('已退出 GitHub 同步。记录仍在当前浏览器。',[['重新登录',login]]);};
  const request = async (path,method='GET',body) => {
    const r=await fetch(api+path,{method,headers:{Authorization:'Bearer '+session,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    let value;try{value=await r.json();}catch{throw Error('服务端响应异常');}
    if(r.status===401){logout();throw Error('登录已过期，请重新登录');}
    if(!r.ok)throw Error(value.error || '同步失败');
    return value;
  };
  const hasData = value => Object.values(value.days||{}).some(day=>Object.values(day).some(Boolean)) || (value.measurements||[]).length>0;
  const merge = (remote,local,preferLocal) => {
    const days={...remote.days};
    for(const [date,items] of Object.entries(local.days||{})) days[date]=preferLocal?{...(days[date]||{}),...items}:{...items,...(days[date]||{})};
    const measurements=[...(remote.measurements||[])];
    for(const item of local.measurements||[])if(!measurements.some(x=>JSON.stringify(x)===JSON.stringify(item)))measurements.push(item);
    return {days,measurements};
  };
  async function pull() {
    if(!session)return;
    message('正在读取 GitHub 仓库中的记录…');
    const {data,sha:remoteSha}=await request('/api/data');
    sha=remoteSha;loaded=true;
    const local={days:db.days,measurements:db.measurements};
    const combined=merge(data,local,localStorage.getItem(dirtyKey)==='1');
    db.days=combined.days;db.measurements=combined.measurements;
    originalSave();render();
    if(JSON.stringify(combined)!==JSON.stringify(data) && hasData(combined)){
      localStorage.setItem(dirtyKey,'1');await push();
    }else {localStorage.removeItem(dirtyKey);message('已连接 GitHub；记录已从仓库读取。',[['立即同步',push],['退出登录',logout]]);}
  }
  async function push() {
    if(!session||!loaded){queued=true;return;}
    if(busy){queued=true;return;}
    busy=true;queued=false;
    const data={days:db.days,measurements:db.measurements};
    const snapshot=JSON.stringify(data);
    message('正在把记录保存到 GitHub…');
    try {
      const result=await request('/api/data','PUT',{data,sha});
      sha=result.sha;
      if(JSON.stringify({days:db.days,measurements:db.measurements})===snapshot)localStorage.removeItem(dirtyKey);
      else queued=true;
      message('记录已同步到 GitHub 私有仓库。',[['立即同步',push],['退出登录',logout]]);
    } catch(e) {message('同步失败：'+e.message+'。本机记录仍保留，请检查后重试。',[['重新读取并合并',pull],['重试同步',push]]);}
    finally {busy=false;if(queued){queued=false;setTimeout(push,350);}}
  }
  const originalSave=save;
  save=function(){originalSave();localStorage.setItem(dirtyKey,'1');if(session&&loaded){clearTimeout(timer);timer=setTimeout(push,800);}};
  if(!ready){message('GitHub 同步尚未配置，当前记录只保存在本机。');return;}
  if(callbackError)message('GitHub 授权未完成（'+callbackError+'），本机记录未受影响。',[['重新登录',login]]);
  else if(!session)message('当前记录保存在本机。登录后会同步到 GitHub 私有仓库。',[['登录 GitHub 开始同步',login]]);
  else pull().catch(e=>message('读取 GitHub 记录失败：'+e.message+'。本机记录仍保留。',[['重试',pull],['退出登录',logout]]));
})();
