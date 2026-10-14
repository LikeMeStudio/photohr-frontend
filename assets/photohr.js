/* Shared origin and bounded network handling for the existing static pages. */
(function (root) {
  'use strict';
  const legacy = 'https://fotohr-server-production.up.railway.app';
  const oldSite = 'https://likemestudio.github.io/photohr-frontend';
  const regional = root.location.hostname === 'hr.likeme.studio';
  const routed = regional || root.location.hostname === 'likemestudio.github.io';
  const base = root.location.hostname === 'localhost' ? 'http://localhost:3001' : routed ? 'https://hr.likeme.studio' : legacy;
  const nativeFetch = root.fetch.bind(root);
  function normalize(value) {
    if (typeof value === 'string' && routed) {
      if (value.startsWith(legacy + '/uploads/')) return base + value.slice(legacy.length);
      if (regional && value.startsWith(oldSite + '/')) return root.location.origin + value.slice(oldSite.length);
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) value[key] = normalize(value[key]);
    }
    return value;
  }
  async function boundedFetch(input, options = {}) {
    const url = new URL(input, root.location.href);
    const isLogin = url.pathname === '/api/auth/login';
    const controller = new AbortController();
    const abort = () => controller.abort();
    const parentSignal = options.signal;
    if (parentSignal) {
      if (parentSignal.aborted) abort();
      else parentSignal.addEventListener('abort', abort, {once:true});
    }
    const timer = setTimeout(abort, isLogin ? 20000 : 65000);
    try {
      const response = await nativeFetch(input, {...options, signal:controller.signal});
      // Keep the deadline active until the body arrives, not just response headers.
      let body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      if ((headers.get('content-type') || '').includes('application/json') && body.byteLength) {
        try { body = JSON.stringify(normalize(JSON.parse(new TextDecoder().decode(body)))); } catch (_) {}
      }
      headers.delete('content-length'); headers.delete('content-encoding');
      return new Response([204,205,304].includes(response.status) ? null : body,
        {status:response.status, statusText:response.statusText, headers});
    } catch (error) {
      if (parentSignal && parentSignal.aborted) throw error;
      const writing = !['GET','HEAD'].includes((options.method || 'GET').toUpperCase());
      throw new Error(isLogin ? 'Не удалось связаться с сервером. Проверьте интернет и попробуйте войти ещё раз.' :
        writing ? 'Ответ сервера не получен. Обновите страницу и проверьте результат перед повторным сохранением.' :
          'Сервер не ответил. Проверьте интернет и обновите страницу.');
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener('abort', abort);
    }
  }
  function beginGoogleFlow() {
    const bytes = root.crypto.getRandomValues(new Uint8Array(32));
    const nonce = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    root.localStorage.setItem('fhr_google_flow', JSON.stringify({nonce,created:Date.now()}));
    return nonce;
  }
  function acceptGoogleReturn(params) {
    try {
      const flow = JSON.parse(root.localStorage.getItem('fhr_google_flow') || 'null');
      if (!flow || params.get('state') !== flow.nonce || Date.now() - flow.created > 600000) return false;
      const encoded = params.get('id_token').split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const claims = JSON.parse(root.atob(encoded));
      if (claims.nonce !== flow.nonce) return false;
      root.localStorage.removeItem('fhr_google_flow');
      return true;
    } catch (_) { return false; }
  }
  function takePasswordReset() {
    const url=new URL(root.location.href);
    const token=new URLSearchParams(url.hash.slice(1)).get('reset') || url.searchParams.get('reset');
    if (!token) return null;
    root.history.replaceState({}, '', url.pathname);
    return token;
  }
  function passwordError(password, confirmation) {
    if (!password || !confirmation) return 'Заполните оба поля.';
    if (Array.from(password).length < 8) return 'Пароль должен содержать минимум 8 символов.';
    if (new TextEncoder().encode(password).length > 72) return 'Пароль слишком длинный. Сократите его.';
    if (password !== confirmation) return 'Пароли не совпадают.';
    return null;
  }
  const passwordControls = [];
  function hidePasswords() {
    passwordControls.forEach(setVisible => setVisible(false));
  }
  function addPasswordControls() {
    const doc = root.document;
    const fields = doc.querySelectorAll('input[type="password"][data-password-toggle]');
    if (!fields.length) return;
    const style = doc.createElement('style');
    style.textContent = `
      .photohr-password-field{position:relative;width:100%}
      .photohr-password-field>input{padding-right:48px!important;min-height:44px}
      .photohr-password-toggle{position:absolute;right:0;top:0;width:44px;height:100%;min-height:44px;padding:10px;border:0;border-radius:10px;background:transparent;color:var(--text2,#9090a8);cursor:pointer;display:flex;align-items:center;justify-content:center}
      .photohr-password-toggle:hover,.photohr-password-toggle[aria-pressed="true"]{color:var(--accent2,#9b8dff)}
      .photohr-password-toggle:focus-visible{outline:2px solid var(--accent,#7c6cff);outline-offset:-3px}
      .photohr-password-toggle svg{width:22px;height:22px;pointer-events:none}
      .photohr-password-field>input::-ms-reveal{display:none}
    `;
    doc.head.appendChild(style);
    const eye = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
    const eyeOff = '<path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.2 6.2A21 21 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
    fields.forEach(input => {
      const wrapper = doc.createElement('div');
      wrapper.className = 'photohr-password-field';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('autocorrect', 'off');
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'photohr-password-toggle';
      button.setAttribute('aria-controls', input.id);
      const setVisible = visible => {
        input.type = visible ? 'text' : 'password';
        const label = visible ? 'Скрыть пароль' : 'Показать пароль';
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(visible));
        button.title = label;
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (visible ? eyeOff : eye) + '</svg>';
      };
      button.addEventListener('click', () => setVisible(input.type === 'password'));
      setVisible(false);
      passwordControls.push(setVisible);
      wrapper.appendChild(button);
    });
  }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', addPasswordControls, {once:true});
    else addPasswordControls();
    root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) hidePasswords(); });
    root.addEventListener('pagehide', hidePasswords);
  }
  let refreshQueue=Promise.resolve();
  async function coordinatedFetch(input, options={}) {
    const url=new URL(input,root.location.href);
    if(url.origin!==new URL(base).origin || url.pathname!=='/api/auth/refresh' || options.method!=='POST')
      return boundedFetch(input,options);
    let requested;
    try {requested=JSON.parse(options.body).refreshToken;} catch (_) {return boundedFetch(input,options);}
    const rotate=async()=>{
      const stored=root.localStorage.getItem('fhr_refresh');
      const access=root.localStorage.getItem('fhr_access');
      if(stored && access && stored!==requested) {
        // Another tab already rotated this session; use its fresh pair instead of the spent token.
        const me=await boundedFetch(base+'/api/auth/me',{headers:{Authorization:'Bearer '+access}});
        if(me.ok) return new Response(JSON.stringify({accessToken:access,refreshToken:stored,user:await me.json()}),
          {headers:{'content-type':'application/json'}});
      }
      const response=await boundedFetch(input,{...options,body:JSON.stringify({refreshToken:stored || requested})});
      if(response.ok) {
        const data=await response.clone().json();
        if(typeof data.accessToken==='string' && typeof data.refreshToken==='string') {
          root.localStorage.setItem('fhr_access',data.accessToken);
          root.localStorage.setItem('fhr_refresh',data.refreshToken);
        }
      }
      return response;
    };
    if(root.navigator?.locks) return root.navigator.locks.request('photohr-session-refresh',rotate);
    // Older browsers still serialize requests from this page; modern browsers coordinate all tabs/iframes.
    const pending=refreshQueue.then(rotate,rotate);refreshQueue=pending.catch(()=>{});return pending;
  }
  root.PhotoHR = {API:base + '/api',
    GOOGLE_CLIENT_ID:regional ? '705997696891-9ba7pculn78efl1acfbt4mgal5ea1lan.apps.googleusercontent.com' : '598896213103-dajskj7fv9odkt6maaupr87u55qf39lj.apps.googleusercontent.com', FRONTEND_URL:regional ? root.location.origin : root.location.hostname === 'localhost' ? root.location.origin : oldSite,
    fetch:coordinatedFetch, normalize, beginGoogleFlow, acceptGoogleReturn, takePasswordReset, passwordError, hidePasswords};
})(window);
