(function(){
  if(document.querySelector('.ak-action-overlay')) return;
  const badge=document.createElement('div');badge.className='ak-module-corner';badge.innerHTML='<img src="../../assets/akatsuki-logo.png" alt=""><span>AKATSUKI MODULE</span>';document.body.appendChild(badge);
  const overlay=document.createElement('div');overlay.className='ak-action-overlay';overlay.innerHTML='<div class="ak-action-core"><div class="ak-action-ring"></div><div class="ak-action-cloud"></div><span>Activating module</span></div>';document.body.appendChild(overlay);
  let timer;
  function flash(){clearTimeout(timer);overlay.classList.add('show');timer=setTimeout(()=>overlay.classList.remove('show'),620)}
  document.addEventListener('click',e=>{const el=e.target.closest('button,.button,[role="button"],input[type="file"]+label');if(!el)return;if(el.id==='themeToggle'||el.id==='soundToggle'||el.closest('.icon-button'))return;flash()},true);
})();
