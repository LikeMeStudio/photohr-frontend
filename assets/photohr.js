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
  root.PhotoHR = {API:base + '/api',
    GOOGLE_CLIENT_ID:regional ? '705997696891-9ba7pculn78efl1acfbt4mgal5ea1lan.apps.googleusercontent.com' : '598896213103-dajskj7fv9odkt6maaupr87u55qf39lj.apps.googleusercontent.com', FRONTEND_URL:regional ? root.location.origin : root.location.hostname === 'localhost' ? root.location.origin : oldSite,
    fetch:boundedFetch, normalize, beginGoogleFlow, acceptGoogleReturn};
})(window);
