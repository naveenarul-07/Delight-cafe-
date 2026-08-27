const API = (() => {
  if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
  if (typeof window === 'undefined') return '/api';
  const { protocol, hostname, port } = window.location;
  if (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    port &&
    port !== '8080' &&
    port !== ''
  ) {
    return `${protocol}//${hostname}:8080/api`;
  }
  return '/api';
})();

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch (_) {
    return {
      success: false,
      status: 0,
      message: 'Cannot reach API. Open http://localhost:8080 (run npm start).'
    };
  }

  let data = {};
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
  }

  if (!res.ok) {
    const fallback =
      res.status === 404
        ? `API not found (404) at ${API}${path}. Use http://localhost:8080 or redeploy Netlify Functions.`
        : data.message || `Request failed (${res.status})`;
    return {
      success: false,
      status: res.status,
      message: data.message || fallback
    };
  }

  return data;
}

export function formatRupee(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}
