// ASA TUK project submission handler
(function(){
  const init = () => {
    const form = document.getElementById('project-submission-form');
    const client = window.supabase.createClient(window.ASATUK_SUPABASE.url, window.ASATUK_SUPABASE.publishableKey);
    if (!form) return;
    const dialog = document.getElementById('project-submit-dialog');
    const open = document.getElementById('project-open-form');
    const close = document.getElementById('project-close-form');
    const coverInput = document.getElementById('project-cover-input');
    const coverDrop = document.getElementById('project-cover-drop');
    const coverPreview = document.getElementById('project-cover-preview');
    const filesInput = document.getElementById('project-attachments-input');
    const drop = document.getElementById('project-attachments-drop');
    const fileList = document.getElementById('project-attachment-list');
    const fileCount = document.getElementById('project-file-count');
    const message = document.getElementById('project-submit-message');
    const submit = form.querySelector('[type="submit"]');
    let cover = null, files = [], busy = false;
    const image = f => ['image/jpeg','image/png','image/webp'].includes(f.type) || /\.(jpg|jpeg|png|webp)$/i.test(f.name);
    const fmt = n => n < 1048576 ? Math.ceil(n/1024)+' KB' : (n/1048576).toFixed(1)+' MB';
    const say = s => { message.textContent = s; };
    open.addEventListener('click', () => dialog.showModal());
    close.addEventListener('click', () => { if (!busy) dialog.close(); });
    function renderCover(){
      coverPreview.replaceChildren();
      if(!cover){coverPreview.hidden=true;coverDrop.hidden=false;coverInput.required=true;return;}
      coverPreview.hidden=false;coverDrop.hidden=true;coverInput.required=false;
      const img=document.createElement('img');img.src=URL.createObjectURL(cover);img.alt='Cover photo preview';
      const info=document.createElement('span');info.textContent=cover.name+' · '+fmt(cover.size);
      const replace=document.createElement('label');replace.htmlFor='project-cover-input';replace.className='btn project-file-button';replace.textContent='Replace photo';
      const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove';
      remove.addEventListener('click',()=>{cover=null;coverInput.value='';renderCover();});
      coverPreview.append(img,info,replace,remove);
    }
    coverInput.addEventListener('change',()=>{
      const f=coverInput.files[0];if(!f)return;
      if(!image(f)||f.size>10485760){say('Choose JPG, PNG or WebP up to 10 MB.');coverInput.value='';return;}
      cover=f;renderCover();say('Cover photo selected.');
    });

    function renderFiles(){
      fileList.replaceChildren();
      fileCount.textContent=files.length+' / 20 files · '+fmt(files.reduce((n,f)=>n+f.size,0));
      files.forEach((f,i)=>{
        const row=document.createElement('div');row.className='project-attachment-item';
        if(image(f)){const img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt='';row.append(img);}
        const info=document.createElement('span');info.textContent=f.name+' · '+fmt(f.size);
        const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove';
        remove.addEventListener('click',()=>{files.splice(i,1);renderFiles();});
        row.append(info,remove);fileList.append(row);
      });
    }
    function addFiles(incoming){
      for(const f of incoming){
        if(!(image(f)||f.type==='application/pdf'||/\.pdf$/i.test(f.name)){say('Only PDF, JPG, PNG and WebP files are accepted.');continue;}
        if(f.size>20971520){say(f.name+' exceeds 20 MB.');continue;}
        if(files.length>=20){say('Maximum 20 attachments.');break;}
        if(files.reduce((n,x)=>n+x.size,0)+f.size>104857600){say('Attachments are limited to 100 MB total.');break;}
        if(!files.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))files.push(f);
      }
      renderFiles();filesInput.value='';
    }
    filesInput.addEventListener('change',()=>addFiles(Array.from(filesInput.files)));
    document.getElementById('project-add-files').addEventListener('click',()=>filesInput.click());
    ['dragenter','dragover'].forEach(ev=>{
      drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('is-dragging');});
      coverDrop.addEventListener(ev,e=>{e.preventDefault();coverDrop.classList.add('is-dragging');});
    });
    ['dragleave','drop'].forEach(ev=>{
      drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('is-dragging');});
      coverDrop.addEventListener(ev,e=>{e.preventDefault();coverDrop.classList.remove('is-dragging');});
    });
    drop.addEventListener('drop',e=>addFiles(Array.from(e.dataTransfer.files)));
    coverDrop.addEventListener('drop',e=>{
      const f=e.dataTransfer.files[0];if(!f)return;
      if(!image(f)||f.size>10485760){say('Choose JPG, PNG or WebP up to 10 MB.');return;}
      cover=f;renderCover();say('Cover photo selected.');
    });
    async function upload(file,path){
      if(!client)throw new Error('Supabase client is unavailable.');
      const result=await client.storage.from('project-submissions').upload(path,file,{upsert:false,contentType:file.type});
      if(result.error)throw result.error;
      return {name:file.name,size:file.size,type:file.type,path:result.data.path,url:client.storage.from('project-submissions').getPublicUrl(result.data.path).data.publicUrl};
    }

    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;
      if(!cover){say('A cover photo is required.');return;}
      if(!form.reportValidity())return;
      if(!client){say('Connection error. Refresh and try again.');return;}
      busy=true;submit.disabled=true;close.disabled=true;let uploaded=[];
      try{
        const fd=new FormData(form),v=n=>String(fd.get(n)||'').trim();
        const key=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
        say('Uploading cover photo…');
        const cm=await upload(cover,'incoming/'+key+'/cover-'+cover.name.replace(/[^a-zA-Z0-9._-]/g,'_'));
        uploaded.push(cm.path);const attachments=[];
        for(let i=0;i<files.length;i++){
          say('Uploading attachment '+(i+1)+' of '+files.length+'…');
          const m=await upload(files[i],'incoming/'+key+'/file-'+i+'-'+files[i].name.replace(/[^a-zA-Z0-9._-]/g,'_'));
          uploaded.push(m.path);attachments.push(m);
        }
        say('Saving submission…');
        const result=await client.from('project_submissions').insert({
          title:v('title'),summary:v('summary'),description:v('description'),category:v('category'),
          cover_image_url:cm.url,cover_photo_url:cm.url,project_url:'',attachment_files:attachments,
          submitter_name:v('submitter_name'),submitter_email:v('submitter_email'),programme:v('programme'),
          status:'pending',admin_notes:'',reviewed_by:null,reviewed_at:null
        });
        if(result.error)throw result.error;
        form.reset();cover=null;files=[];renderCover();renderFiles();dialog.close();
        const notice=document.createElement('p');notice.className='project-submit-success';notice.setAttribute('role','status');
        notice.textContent='Project submitted successfully. Your files are saved and ASA TUK will review it before publication.';
        document.querySelector('.project-submit-intro').append(notice);
      }catch(err){
        say('Submission failed: '+(err.message||'Please try again.'));
        for(const path of uploaded){try{await client.storage.from('project-submissions').remove([path]);}catch(cleanupError){console.warn(cleanupError);}}
      }finally{busy=false;submit.disabled=false;close.disabled=false;}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
