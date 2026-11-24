(function (root) {
  'use strict';

  const baseUrl = 'https://open.api.nexon.com/maplestory/v1';

  class NexonApi {
    #fetch;
    #getKey;

    constructor(fetchImpl, getKey) {
      this.#fetch = fetchImpl;
      this.#getKey = getKey;
    }

    static url(path, params) {
      const query = new URLSearchParams(params).toString();
      return baseUrl + path + (query ? '?' + query : '');
    }

    async get(path, params, { signal, cache, strictJson = false } = {}) {
      const key = this.#getKey();
      if (!key) throw new Error('API_KEY_REQUIRED');
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const response = await this.#fetch(NexonApi.url(path, params), {
        headers: { 'x-nxopen-api-key': key }, signal, cache
      });
      let body = null;
      try {
        body = await response.json();
      } catch (error) {
        if (signal?.aborted || (response.ok && strictJson)) throw error;
      }
      if (response.ok) return body;

      throw new NexonApiError(response, body?.error);
    }
  }

  class NexonApiError extends Error {
    constructor(response, detail) {
      super(detail?.message || 'HTTP ' + response.status);
      this.name = 'NexonApiError';
      this.code = detail?.name || '';
      this.status = response.status;
      const retryAfter = response.headers?.get('Retry-After');
      if (retryAfter) {
        const delay = /^\d+(\.\d+)?$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(delay)) this.retryAfterMs = Math.max(0, delay);
      }
    }

    get rateLimited() {
      return this.status === 429 || this.code === 'OPENAPI00007';
    }
  }

  NexonApi.Error = NexonApiError;
  NexonApi.browser = new NexonApi((...args) => root.fetch(...args), () => root.NexonKey?.get());

  if (typeof module === 'object' && module.exports) module.exports = NexonApi;
  else root.NexonApi = NexonApi;
})(globalThis);
