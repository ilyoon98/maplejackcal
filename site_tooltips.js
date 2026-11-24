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
  function text(tag, className, content) {
    var node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    return node;
  }
  // data-tooltip-items: [{name, note, value, image, tags}] JSON. 파티원처럼 사람·항목 목록을 카드로 보여준다.
  function items(raw) {
    var list;
    try { list = JSON.parse(raw || '[]'); } catch (e) { return; }
    if (!Array.isArray(list) || !list.length) return;
    var box = document.createElement('ul');
    box.className = 'site-tooltip-items';
    list.slice(0, 12).forEach(function (item) {
      if (!item || typeof item.name !== 'string') return;
      var row = document.createElement('li'), avatar = document.createElement('span'), body = document.createElement('span'), head = document.createElement('span');
      row.className = 'site-tooltip-item';
      avatar.className = 'site-tooltip-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = Array.from(item.name)[0] || '';
      if (typeof item.image === 'string' && /^https:\/\//.test(item.image)) {
        var img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('load', function () { avatar.classList.add('has-image'); });
        img.src = item.image;
        avatar.appendChild(img);
      }
      body.className = 'site-tooltip-item-body';
      head.className = 'site-tooltip-item-head';
      head.appendChild(text('strong', 'site-tooltip-item-name', item.name));
      (Array.isArray(item.tags) ? item.tags : []).forEach(function (tag) {
        if (typeof tag === 'string' && tag) head.appendChild(text('span', 'site-tooltip-item-tag', tag));
      });
      body.appendChild(head);
      if (typeof item.note === 'string' && item.note) body.appendChild(text('span', 'site-tooltip-item-note', item.note));
      row.append(avatar, body);
      if (typeof item.value === 'string' && item.value) row.appendChild(text('span', 'site-tooltip-item-value', item.value));
      box.appendChild(row);
    });
    if (box.childElementCount) tip.appendChild(box);
  }
  function show(source) {
    hide();
    if (!source || !source.isConnected || source === dismissed) return;
    active = source;
    tip.replaceChildren();
    line('strong', 'site-tooltip-name', source.dataset.tooltip);
    line('span', 'site-tooltip-value', source.dataset.tooltipValue);
    items(source.dataset.tooltipItems);
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
