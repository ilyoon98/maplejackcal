(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SundayMapleEvent = api;
  if (root.document) api.init(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var API_URL = 'https://open.api.nexon.com/maplestory/v1/notice-event';
  var DETAIL_API_URL = 'https://open.api.nexon.com/maplestory/v1/notice-event/detail';
  var STORAGE_KEY = 'sundayMapleEventV2';
  var POPUP_HIDDEN_DATE_KEY = 'sundayMaplePopupHiddenDateV1';
  var KEY_STORAGE = 'nxopen_api_key';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  var FRIDAY = 5;
  var REFRESH_UTC_HOUR = 1; // 금요일 10:30 KST
  var REFRESH_UTC_MINUTE = 30;
  var RETRY_MS = 30 * 60 * 1000;
  // 금요일 10:30:00부터 일요일 23:59:59.999(KST)까지 노출한다.
  var DISPLAY_DURATION_MS = 2 * DAY_MS + (13 * 60 + 30) * 60 * 1000 - 1;

  function latestRefreshAt(nowValue) {
    var now = typeof nowValue === 'number' ? nowValue : Number(nowValue || Date.now());
    var kst = new Date(now + KST_OFFSET_MS);
    var daysSinceFriday = (kst.getUTCDay() - FRIDAY + 7) % 7;
    var refresh = Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate() - daysSinceFriday,
      REFRESH_UTC_HOUR,
      REFRESH_UTC_MINUTE
    );
    if (refresh > now) refresh -= 7 * DAY_MS;
    return refresh;
  }

  function nextRefreshAt(nowValue) {
    return latestRefreshAt(nowValue) + 7 * DAY_MS;
  }

  function displayEndsAt(refreshAt) {
    return refreshAt + DISPLAY_DURATION_MS;
  }

  function isWithinDisplayWindow(nowValue) {
    var now = typeof nowValue === 'number' ? nowValue : Number(nowValue || Date.now());
    var refreshAt = latestRefreshAt(now);
    return now >= refreshAt && now <= displayEndsAt(refreshAt);
  }

  function kstDateKey(nowValue) {
    var now = typeof nowValue === 'number' ? nowValue : Number(nowValue || Date.now());
    var kst = new Date(now + KST_OFFSET_MS);
    return [
      kst.getUTCFullYear(),
      String(kst.getUTCMonth() + 1).padStart(2, '0'),
      String(kst.getUTCDate()).padStart(2, '0')
    ].join('-');
  }

  function isSundayTitle(title) {
    return /^(?:썬데이|선데이)\s*메이플$/.test(String(title || '').trim());
  }

  function selectEvent(events, refreshAt, nowValue) {
    var now = typeof nowValue === 'number' ? nowValue : Number(nowValue || Date.now());
    var latestStart = refreshAt + 4 * DAY_MS;
    return (Array.isArray(events) ? events : [])
      .filter(function (event) {
        var start = Date.parse(event && event.date_event_start);
        var end = Date.parse(event && event.date_event_end);
        return isSundayTitle(event && event.title) && Number.isFinite(start) && Number.isFinite(end) &&
          start >= refreshAt && start < latestStart && end >= start && now <= displayEndsAt(refreshAt);
      })
      .sort(function (a, b) {
        return Date.parse(a.date_event_start) - Date.parse(b.date_event_start);
      })[0] || null;
  }

  function safeImageUrl(value) {
    var url;
    try { url = new URL(String(value || '').replaceAll('&amp;', '&')); } catch (err) { return ''; }
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'nexon.com' && !url.hostname.endsWith('.nexon.com')) return '';
    return url.href;
  }

  function extractImageUrls(contents) {
    var urls = [];
    var seen = new Set();
    var pattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
    var match;
    while ((match = pattern.exec(String(contents || '')))) {
      var url = safeImageUrl(match[2]);
      if (url && !seen.has(url)) { seen.add(url); urls.push(url); }
    }
    return urls;
  }

  function safeEvent(event) {
    if (!event) return null;
    var noticeId = Number(event.notice_id);
    var url;
    try { url = new URL(event.url); } catch (err) { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'maplestory.nexon.com' || !url.pathname.startsWith('/News/Event/')) return null;
    return {
      title: String(event.title || '썬데이 메이플'),
      url: url.href,
      notice_id: Number.isFinite(noticeId) ? noticeId : null,
      date_event_start: String(event.date_event_start || ''),
      date_event_end: String(event.date_event_end || ''),
      image_urls: (Array.isArray(event.image_urls) ? event.image_urls : []).map(safeImageUrl).filter(Boolean)
    };
  }

  function readJson(storage) {
    try { return JSON.parse(storage.getItem(STORAGE_KEY) || 'null'); }
    catch (err) { return null; }
  }

  function writeJson(storage, value) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); }
    catch (err) {}
  }

  function readApiKey(win) {
    try {
      if (win.NexonKey && typeof win.NexonKey.get === 'function') return win.NexonKey.get().trim();
      return (win.localStorage.getItem(KEY_STORAGE) || '').trim();
    } catch (err) { return ''; }
  }

  function createButton(win) {
    var existing = win.document.getElementById('sundayMapleEvent');
    if (existing) return existing;
    var link = win.document.createElement('a');
    link.id = 'sundayMapleEvent';
    link.className = 'sunday-event-fab';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.hidden = true;
    link.innerHTML = '<span class="sunday-event-icon" aria-hidden="true"><img src="icons/home/단풍잎.webp" alt="" width="26" height="26" style="image-rendering:pixelated"></span>' +
      '<span class="sunday-event-copy"><strong>썬데이 메이플</strong><small></small></span>';
    win.document.body.appendChild(link);
    return link;
  }

  function createDialog(win) {
    var existing = win.document.getElementById('sundayMapleDialog');
    if (existing) return existing;
    var dialog = win.document.createElement('dialog');
    dialog.id = 'sundayMapleDialog';
    dialog.className = 'sunday-event-dialog';
    dialog.setAttribute('aria-labelledby', 'sundayMapleDialogTitle');
    dialog.innerHTML = '<header><div><span>WEEKEND EVENT</span><h2 id="sundayMapleDialogTitle">썬데이 메이플</h2><p></p></div>' +
      '<button type="button" class="sunday-dialog-close" aria-label="팝업 닫기">✕</button></header>' +
      '<div class="sunday-dialog-images"></div>' +
      '<footer><button type="button" class="sunday-dialog-today">오늘 하루 안 보기</button>' +
      '<button type="button" class="sunday-dialog-dismiss">닫기</button></footer>';
    dialog.querySelector('.sunday-dialog-close').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('.sunday-dialog-dismiss').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('.sunday-dialog-today').addEventListener('click', function () {
      try { win.localStorage.setItem(POPUP_HIDDEN_DATE_KEY, kstDateKey(Date.now())); } catch (err) {}
      dialog.close();
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    win.document.body.appendChild(dialog);
    return dialog;
  }

  function openDialog(win, event) {
    if (!event) return;
    var dialog = createDialog(win);
    var start = new Date(event.date_event_start);
    var dateLabel = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short'
    }).format(start);
    dialog.querySelector('h2').textContent = event.title;
    dialog.querySelector('header p').textContent = dateLabel + ' 진행';
    var images = dialog.querySelector('.sunday-dialog-images');
    images.replaceChildren();
    if (event.image_urls && event.image_urls.length) {
      event.image_urls.forEach(function (url, index) {
        var image = win.document.createElement('img');
        image.src = url;
        image.alt = event.title + ' 공식 안내 이미지' + (event.image_urls.length > 1 ? ' ' + (index + 1) : '');
        image.loading = index ? 'lazy' : 'eager';
        images.appendChild(image);
      });
    } else {
      var empty = win.document.createElement('p');
      empty.className = 'sunday-dialog-empty';
      empty.textContent = '공식 이미지를 불러오지 못했습니다. 아래 링크에서 공지를 확인할 수 있어요.';
      images.appendChild(empty);
    }
    dialog.showModal();
  }

  function render(win, event, nowValue) {
    var button = createButton(win);
    var now = typeof nowValue === 'number' ? nowValue : Number(nowValue || Date.now());
    if (!event || !isWithinDisplayWindow(now)) {
      button.hidden = true;
      button.removeAttribute('href');
      return;
    }
    var start = new Date(event.date_event_start);
    var dateLabel = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short'
    }).format(start);
    button.href = event.url;
    button.querySelector('small').textContent = dateLabel + ' 공식 공지';
    button.setAttribute('aria-label', event.title + ' ' + dateLabel + ' 공식 공지 열기');
    button.hidden = false;
  }

  function init(win) {
    var retryTimer = null;
    var weeklyTimer = null;
    var hideTimer = null;
    var inFlight = false;
    var autoOpened = false;

    function isPopupHiddenToday(nowValue) {
      try { return win.localStorage.getItem(POPUP_HIDDEN_DATE_KEY) === kstDateKey(nowValue); }
      catch (err) { return false; }
    }

    function present(event, nowValue) {
      render(win, event, nowValue);
      if (!event || !isWithinDisplayWindow(nowValue) || autoOpened || isPopupHiddenToday(nowValue)) return;
      autoOpened = true;
      openDialog(win, event);
    }

    function scheduleAt(timestamp, callback, kind) {
      var delay = Math.max(0, timestamp - Date.now());
      var timer = win.setTimeout(callback, Math.min(delay, 2147483647));
      if (kind === 'retry') retryTimer = timer;
      else weeklyTimer = timer;
    }

    function scheduleNextWeekly() {
      if (weeklyTimer) win.clearTimeout(weeklyTimer);
      var target = nextRefreshAt(Date.now());
      scheduleAt(target, function () {
        check(true);
        scheduleNextWeekly();
      }, 'weekly');
    }

    function scheduleWindowEnd(bucket) {
      if (hideTimer) win.clearTimeout(hideTimer);
      var hideAt = displayEndsAt(bucket) + 1;
      if (hideAt > Date.now()) hideTimer = win.setTimeout(function () { check(false); }, hideAt - Date.now());
    }

    async function addDetail(event, apiKey) {
      if (!event || !event.notice_id) return event;
      var detailUrl = DETAIL_API_URL + '?notice_id=' + encodeURIComponent(event.notice_id);
      var response = await win.fetch(detailUrl, { headers: { 'x-nxopen-api-key': apiKey } });
      if (!response.ok) throw new Error('Nexon detail API ' + response.status);
      var detail = await response.json();
      event.image_urls = extractImageUrls(detail.contents);
      return event;
    }

    async function check(force) {
      if (inFlight) return;
      var now = Date.now();
      var bucket = latestRefreshAt(now);
      var cached = readJson(win.localStorage);
      if (!force && cached && cached.refreshAt === bucket) {
        present(cached.event || null, now);
        scheduleWindowEnd(bucket);
        if (cached.retryAt && cached.retryAt > now) {
          if (retryTimer) win.clearTimeout(retryTimer);
          scheduleAt(cached.retryAt, function () { check(true); }, 'retry');
          return;
        }
        if (cached.status === 'ready') return;
      }

      var apiKey = readApiKey(win);
      if (!apiKey) {
        present(null, now);
        return;
      }

      inFlight = true;
      try {
        var response = await win.fetch(API_URL, { headers: { 'x-nxopen-api-key': apiKey } });
        if (!response.ok) throw new Error('Nexon API ' + response.status);
        var data = await response.json();
        var event = safeEvent(selectEvent(data.event_notice, bucket, Date.now()));
        var detailFailed = false;
        if (event) {
          try { await addDetail(event, apiKey); }
          catch (detailError) { detailFailed = true; }
        }
        var value = event
          ? { refreshAt: bucket, status: detailFailed ? 'retry' : 'ready', event: event, checkedAt: Date.now(), retryAt: detailFailed ? Date.now() + RETRY_MS : null }
          : { refreshAt: bucket, status: 'retry', event: null, checkedAt: Date.now(), retryAt: Date.now() + RETRY_MS };
        writeJson(win.localStorage, value);
        present(event, Date.now());
        scheduleWindowEnd(bucket);
        if (value.retryAt) scheduleAt(value.retryAt, function () { check(true); }, 'retry');
      } catch (err) {
        var failed = { refreshAt: bucket, status: 'retry', event: null, checkedAt: Date.now(), retryAt: Date.now() + RETRY_MS };
        writeJson(win.localStorage, failed);
        present(null, Date.now());
        scheduleAt(failed.retryAt, function () { check(true); }, 'retry');
      } finally {
        inFlight = false;
      }
    }

    function start() {
      createButton(win);
      createDialog(win);
      check(false);
      scheduleNextWeekly();
      win.addEventListener('focus', function () { check(false); });
      win.addEventListener('nexon-key-changed', function () { check(true); });
      win.document.addEventListener('visibilitychange', function () {
        if (!win.document.hidden) check(false);
      });
    }

    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  return {
    init: init,
    latestRefreshAt: latestRefreshAt,
    nextRefreshAt: nextRefreshAt,
    displayEndsAt: displayEndsAt,
    isWithinDisplayWindow: isWithinDisplayWindow,
    kstDateKey: kstDateKey,
    isSundayTitle: isSundayTitle,
    selectEvent: selectEvent,
    safeEvent: safeEvent,
    safeImageUrl: safeImageUrl,
    extractImageUrls: extractImageUrls
  };
});
