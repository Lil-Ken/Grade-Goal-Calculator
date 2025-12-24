document.addEventListener('DOMContentLoaded', async ()=>{
  const placeholder = document.getElementById('site-header-placeholder');
  if (!placeholder) return;

  try{
    const res = await fetch('/partial/header.html', {cache:'no-store'});
    if (!res.ok) throw new Error('Header not found');
    const html = await res.text();
    placeholder.innerHTML = html;

    // Set active nav item based on path
    const nav = placeholder.querySelector('.site-nav');
    if (nav){
      const path = location.pathname.replace(/\/$/, '');
      nav.querySelectorAll('a').forEach(a=>{
        const href = a.getAttribute('href').replace(/\/$/, '');
        a.classList.toggle('active', href === path);
      });
    }
  }catch(err){
    // silently fail; keep nothing so pages still work
    console.warn('Failed to include header:', err);
  }
});