// Shared tooltips for data-tooltip triggers, including dynamically rendered controls.
(function () {
  'use strict';
  var tip = document.createElement('div');
  tip.id = 'siteTooltip';
  tip.className = 'site-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  var active = null, described = null, hovered = null, focused = null, dismissed = null;

  function trigger(target) {
    return target && target.closest ? target.closest('[data-tooltip]') : null;
  }
  function hide() {
    if (described) {
      var ids = (described.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== tip.id; });
      if (ids.length) described.setAttribute('aria-describedby', ids.join(' '));
      else described.removeAttribute('aria-describedby');
    }
    active = described = null;
    tip.hidden = true;
  }
  function line(tag, className, content) {
    if (!content) return;
    var node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    tip.appendChild(node);
  }
  function portraits(content) {
    if (!content) return;
    var entries;
    try { entries = JSON.parse(content); } catch (e) { return; }
    if (!Array.isArray(entries) || !entries.length) return;
    var list = document.createElement('ul');
    list.className = 'site-tooltip-portraits';
    list.setAttribute('role', 'list');
    list.style.setProperty('--portrait-columns', Math.min(3, entries.length));
    entries.forEach(function (entry) {
      var item = document.createElement('li');
      var frame = document.createElement('span');
      var name = document.createElement('span');
      frame.className = 'site-tooltip-portrait-frame';
      name.className = 'site-tooltip-portrait-name';
      name.textContent = entry.name;
      if (entry.image) {
        var img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', function () { img.remove(); });
        img.src = entry.image;
        frame.appendChild(img);
      }
      item.append(frame, name);
      list.appendChild(item);
    });
    tip.appendChild(list);
  }
  function show(source) {
    hide();
    if (!source || !source.isConnected || source === dismissed) return;
    active = source;
    tip.replaceChildren();
    line('strong', 'site-tooltip-name', source.dataset.tooltip);
    line('span', 'site-tooltip-value', source.dataset.tooltipValue);
    portraits(source.dataset.tooltipPortraits);
    line('span', 'site-tooltip-note', source.dataset.tooltipNote);
    described = source.querySelector('input,button,a,[tabindex]') || source;
    var ids = (described.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    ids.push(tip.id);
    described.setAttribute('aria-describedby', ids.join(' '));
    tip.style.visibility = 'hidden';
    tip.hidden = false;
    var box = source.getBoundingClientRect(), pad = 10, gap = 12;
    var width = tip.offsetWidth, height = tip.offsetHeight;
    var left = Math.max(pad, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - pad));
    var top = box.top - height - gap;
    var below = top < pad;
    if (below) top = box.bottom + gap;
    top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.dataset.placement = below ? 'below' : 'above';
    // 툴팁이 화면 가장자리에서 옮겨져도 꼬리는 아이콘 중심을 가리킨다.
    tip.style.setProperty('--tooltip-tail-x', Math.max(18, Math.min(box.left + box.width / 2 - left, width - 18)) + 'px');
    tip.style.visibility = '';
  }
  function refresh() { show(hovered || focused); }
  function reset() { hovered = focused = dismissed = null; hide(); }
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType === 'touch') return;
    var source = trigger(e.target);
    if (source === hovered) return;
    hovered = source;
    dismissed = null;
    refresh();
  });
  document.addEventListener('pointerout', function (e) {
    if (hovered && (!e.relatedTarget || !hovered.contains(e.relatedTarget))) {
      hovered = null;
      refresh();
    }
  });
  document.addEventListener('focusin', function (e) { focused = trigger(e.target); dismissed = null; refresh(); });
  document.addEventListener('focusout', function (e) { focused = trigger(e.relatedTarget); refresh(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { dismissed = active; hide(); }
  });
  document.addEventListener('pointerdown', reset);
  document.addEventListener('scroll', reset, true);
  window.addEventListener('resize', reset);
  window.addEventListener('blur', reset);
  new MutationObserver(function () {
    if (active && !active.isConnected) reset();
  }).observe(document.body, { childList: true, subtree: true });
})();
