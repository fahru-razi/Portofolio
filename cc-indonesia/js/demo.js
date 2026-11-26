const tabs=[...document.querySelectorAll('[role=tab]')],f=document.getElementById('f'),m=document.getElementById('main');
const go=t=>{tabs.forEach(x=>x.setAttribute('aria-selected',x===t));f.src=t.dataset.src;m.className=t.dataset.m==='1'?'m':''};
tabs.forEach((t,i)=>{t.addEventListener('click',()=>go(t));t.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const n=tabs[(i+1)%2];n.focus();go(n)}})});
