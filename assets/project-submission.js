// ASA TUK project submission handler
(function(){
  const init = () => {
    const form = document.getElementById('project-submission-form');
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
      const client=window.supabase;
      if(!client)throw new Error('Supabase client is unavailable.');
      const result=await client.storage.from('project-submissions').upload(path,file,{upsert:false,contentType:file.type});
      if(result.error)throw result.error;
      return {name:file.name,size:file.size,type:file.type,path:result.data.path,url:client.storage.from('project-submissions').getPublicUrl(result.data.path).data.publicUrl};
    }
