/* Shared ASA TUK sign-in experience: password visibility and access-denied messaging.
   Supabase sessions remain intact when a user visits a workspace they are not assigned to. */
(()=> {
  const eye = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.8 15.8 0 0 1-3 3.9"/><path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 4-.8"/></svg>';
  function setupPasswordToggles(){
    document.querySelectorAll('input[type="password"]').forEach((input)=>{
      if(input.dataset.eyeToggleReady) return;
      input.dataset.eyeToggleReady='true';
      const wrap=document.createElement('span');
      wrap.style.cssText='display:flex;align-items:center;position:relative;width:100%;min-width:0';
      input.parentNode.insertBefore(wrap,input);
      wrap.appendChild(input);
      input.style.width='100%';
      input.style.minWidth='0';
      input.style.paddingRight='48px';
      const button=document.createElement('button');
      button.type='button';
      button.className='password-visibility-toggle';
      button.innerHTML=eye;
      button.setAttribute('aria-label','Show password');
      button.setAttribute('aria-pressed','false');
      button.title='Show password';
      button.style.cssText='position:absolute;right:7px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:7px;background:transparent;color:inherit;opacity:.75;cursor:pointer';
      button.addEventListener('click',()=>{
        const show=input.type==='password';
        input.type=show?'text':'password';
        button.innerHTML=show?eyeOff:eye;
        button.setAttribute('aria-label',show?'Hide password':'Show password');
        button.setAttribute('aria-pressed',String(show));
        button.title=show?'Hide password':'Show password';
        input.focus({preventScroll:true});
      });
      wrap.appendChild(button);
    });
  }
  function showDenied({rootId='login',formId='login-form',messageId='login-msg',message='You are signed in, but this account is not assigned to this workspace.',links=[],retry=null,signOut=true}={}){
    const root=document.getElementById(rootId),form=document.getElementById(formId),msg=document.getElementById(messageId);
    if(form) form.hidden=true;
    const forgot=document.getElementById('forgot');if(forgot)forgot.hidden=true;
    if(msg){msg.textContent=message;msg.setAttribute('role','status');msg.style.cssText+=';padding:12px 14px;border-radius:9px;background:var(--soft,#f4e6de);line-height:1.5'}
    if(!root)return;
    let panel=root.querySelector('.auth-denied-links');
    if(!panel){panel=document.createElement('div');panel.className='auth-denied-links';panel.style.cssText='display:flex;flex-wrap:wrap;gap:10px;margin-top:14px';root.appendChild(panel)}
    panel.innerHTML=links.map(x=>'<a href="'+String(x.href).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'" style="display:inline-block;padding:9px 12px;border:1px solid var(--line,#ddd);border-radius:8px;text-decoration:none;color:inherit;font-weight:650">'+String(x.label).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+' ↗</a>').join('');
    /* A denied user must always have a way out: sign out (this browser only) or retry the check. */
    const addAction=(label,handler)=>{const b=document.createElement('button');b.type='button';b.className='auth-denied-action';b.textContent=label;b.style.cssText='padding:9px 12px;border:1px solid var(--line,#ddd);border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer';b.addEventListener('click',async()=>{b.disabled=true;try{await handler()}finally{b.disabled=false}});panel.appendChild(b)};
    if(typeof retry==='function')addAction('Try again',retry);
    if(signOut!==false&&window.ASATUKAuth)addAction('Sign out',async()=>{await window.ASATUKAuth.signOut();location.reload()});
  }
  document.addEventListener('DOMContentLoaded',setupPasswordToggles);
  window.ASATUKAuthUI={setupPasswordToggles,showDenied};
})();