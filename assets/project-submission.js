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
