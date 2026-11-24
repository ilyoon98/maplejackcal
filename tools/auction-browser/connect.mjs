import { readSold } from './sales.mjs';

const form = document.querySelector('form');
const input = form.querySelector('input');
const status = document.querySelector('[role="status"]');
const disconnect = document.getElementById('disconnect');
const endpoint = 'http://127.0.0.1:8765/api/local-auction/bridge';
const encoder = new TextEncoder();
let connection;

async function readAuction(job, signal) {
  const hasAccess = await chrome.permissions.contains({ origins: ['https://api.mskr.nexon.com/*'] });
  if (!hasAccess) {
    throw Object.assign(new Error('LOCAL_AUCTION_UPSTREAM'), {
      detail: '계정 조회 · Chrome에서 옥션 API 사이트 접근이 허용되지 않음'
    });
  }
  return readSold(job, { signal });
}

function bytes(hex) {
  return Uint8Array.from(hex.match(/../g), part => parseInt(part, 16));
}

async function exchange(key, result, signal) {
  const nonce = crypto.randomUUID();
  const body = JSON.stringify({ nonce, at: Date.now(), result });
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('request\n' + body));
  const hex = Array.from(new Uint8Array(signature), part => part.toString(16).padStart(2, '0')).join('');
  const readResponse = async task => {
    try { return await task(); }
    catch (error) {
      if (signal.aborted || !['TypeError', 'TimeoutError'].includes(error.name)) throw error;
      throw Object.assign(new Error('로컬 계산기에 연결할 수 없습니다. 로컬 계산기가 실행 중인지 확인하고 다시 연결하세요.'), { retryable: true });
    }
  };
  const response = await readResponse(() => fetch(endpoint, {
    method: 'POST', body, credentials: 'omit', redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'X-Auction-Signature': hex },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
  }));
  const responseSignature = response.headers.get('X-Auction-Signature');
  if (!response.ok || !/^[a-f0-9]{64}$/.test(responseSignature || '')) throw new Error('연결 키와 로컬 계산기를 확인하세요.');
  const text = await readResponse(() => response.text());
  if (!await crypto.subtle.verify('HMAC', key, bytes(responseSignature), encoder.encode(`response\n${nonce}\n${text}`))) {
    throw new Error('로컬 계산기를 인증하지 못했습니다.');
  }
  return JSON.parse(text);
}

async function exchangeWithRetry(key, result, signal) {
  for (const delay of [1000, 2000, 4000, 0]) {
    signal.throwIfAborted();
    try { return await exchange(key, result, signal); }
    catch (error) {
      if (!error.retryable || !delay) throw error;
      status.textContent = '로컬 계산기에 다시 연결하는 중입니다…';
      const wait = AbortSignal.any([signal, AbortSignal.timeout(delay)]);
      if (!wait.aborted) await new Promise(resolve => wait.addEventListener('abort', resolve, { once: true }));
    }
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (connection) return;
  const controller = new AbortController();
  connection = controller;
  disconnect.disabled = false;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = input.disabled = true;
  try {
    const key = await crypto.subtle.importKey('raw', bytes(input.value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    input.value = '';
    let result;
    let lastResult = '';
    while (!controller.signal.aborted) {
      const { job } = await exchangeWithRetry(key, result, controller.signal);
      result = undefined;
      status.textContent = job ? `${job.world} 판매완료 내역을 조회하는 중입니다.`
        : `연결됨. ${lastResult || '로컬 계산기에서 옥션 시세 수집을 누르세요.'}`;
      if (job) {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(100000)]);
        result = await readAuction(job, signal)
          .then(feed => ({ id: job.id, feed }))
          .catch(error => {
            lastResult = `마지막 조회 실패. ${error.detail || error.message}`;
            return { id: job.id, error: error.message, detail: error.detail };
          });
        if (result.feed) lastResult = `${job.world} 판매완료 내역을 로컬 계산기에 보냈습니다.`;
        status.textContent = lastResult;
      }
    }
  } catch (error) {
    status.textContent = controller.signal.aborted ? '연결을 끊었습니다.' : error.message;
  } finally {
    connection = null;
    disconnect.disabled = true;
    submit.disabled = input.disabled = false;
  }
});

disconnect.addEventListener('click', () => connection?.abort());
