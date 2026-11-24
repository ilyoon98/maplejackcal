/* Illustrated help uses the existing dialog; it never changes calculator state. */
(function () {
  'use strict';
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  let viewer, viewerImage, viewerTitle, viewerCaption, viewerSize, viewerStatus, imageOpener;

  function imageViewer() {
    if (viewer) return viewer;
    viewer = make('dialog', 'ux-help-image');
    viewer.id = 'uxHelpImage';
    viewer.setAttribute('aria-labelledby', 'uxHelpImageTitle');
    const head = make('div', 'ux-help-image-head');
    viewerTitle = make('h2', '', '도움말 이미지');
    viewerTitle.id = 'uxHelpImageTitle';
    const actions = make('div', 'ux-help-image-actions');
    viewerSize = make('button', 'ux-button', '원본 크기');
    viewerSize.type = 'button';
    viewerSize.setAttribute('aria-pressed', 'false');
    viewerSize.addEventListener('click', () => {
      const original = viewer.classList.toggle('ux-help-image-original');
      viewerSize.setAttribute('aria-pressed', String(original));
      viewerSize.textContent = original ? '화면에 맞추기' : '원본 크기';
    });
    const close = make('button', 'ux-button', '닫기 ✕');
    close.type = 'button';
    close.setAttribute('aria-label', '확대 이미지 닫기');
    close.addEventListener('click', () => viewer.close());
    actions.append(viewerSize, close);
    head.append(viewerTitle, actions);
    const stage = make('div', 'ux-help-image-stage');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', '확대 이미지, 방향키로 스크롤');
    viewerImage = make('img');
    viewerStatus = make('p', 'ux-help-image-status');
    viewerStatus.setAttribute('role', 'status');
    viewerImage.addEventListener('load', () => {
      viewerStatus.hidden = true;
      viewerImage.hidden = false;
      viewerSize.disabled = false;
    });
    viewerImage.addEventListener('error', () => {
      viewerImage.hidden = true;
      viewerStatus.hidden = false;
      viewerStatus.textContent = '이미지를 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.';
      viewerSize.disabled = true;
    });
    stage.append(viewerStatus, viewerImage);
    viewerCaption = make('p', 'ux-help-image-caption');
    viewer.append(head, stage, viewerCaption);
    viewer.addEventListener('close', () => {
      if (imageOpener?.isConnected) imageOpener.focus({ preventScroll: true });
    });
    viewer.addEventListener('cancel', event => event.stopPropagation());
    viewer.addEventListener('click', event => {
      if (event.target !== viewer) return;
      const box = viewer.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) viewer.close();
    });
    document.body.append(viewer);
    return viewer;
  }

  function enableImage(image, caption) {
    if (image.closest('button,a')) return;
    const button = make('button', 'ux-guide-image-button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', (image.alt || '도움말 이미지') + ' 확대 보기');
    image.before(button);
    const zoom = make('span', 'ux-guide-image-icon');
    zoom.setAttribute('aria-hidden', 'true');
    const status = make('span', 'ux-guide-image-status');
    status.hidden = true;
    button.append(image, zoom, status);
    const error = () => {
      button.disabled = true;
      button.classList.add('ux-guide-image-error');
      zoom.hidden = true;
      status.hidden = false;
      status.textContent = '이미지를 불러오지 못했습니다.';
    };
    image.addEventListener('error', error);
    if (image.complete && !image.naturalWidth) error();
    button.addEventListener('click', () => {
      imageViewer();
      imageOpener = button;
      viewerTitle.textContent = image.alt || '도움말 이미지';
      viewerCaption.textContent = caption;
      viewerStatus.hidden = false;
      viewerStatus.textContent = '이미지 불러오는 중…';
      viewerImage.hidden = false;
      viewerSize.disabled = true;
      viewerImage.src = image.currentSrc || image.src;
      viewerImage.alt = image.alt;
      viewer.classList.remove('ux-help-image-original');
      viewerSize.textContent = '원본 크기';
      viewerSize.setAttribute('aria-pressed', 'false');
      viewer.showModal();
      viewer.querySelector('[aria-label="확대 이미지 닫기"]').focus();
    });
  }

  function figure(item) {
    const fig = make('figure', 'ux-guide-figure');
    const image = make('img');
    image.src = item.image;
    image.alt = item.alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    if (item.width && item.height) { image.width = item.width; image.height = item.height; }
    fig.append(image);
    fig.append(make('figcaption', '', item.text));
    enableImage(image, item.text);
    return fig;
  }

  function stepList(steps, id) {
    const list = make('ol', 'ux-guide-steps');
    if (id) list.id = id;
    list.setAttribute('role', 'list');
    steps.forEach((step, index) => {
      const row = make('li', 'ux-guide-step');
      row.append(make('h3', 'ux-guide-step-title', (index + 1) + '단계 ' + step.title), figure(step));
      list.append(row);
    });
    return list;
  }

  function renderTabs(help, guides, id) {
    const tablist = make('div', 'ux-guide-tabs');
    tablist.id = id || 'uxGuideTabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', '도움말 항목');
    help.append(tablist);
    const tabs = guides.map((guide, index) => {
      const button = make('button', 'ux-button', guide.label);
      const panel = make('div');
      button.type = 'button';
      button.id = 'uxHelpTab-' + (index + 1);
      button.setAttribute('role', 'tab');
      panel.id = button.id + '-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panel.tabIndex = 0;
      button.setAttribute('aria-controls', panel.id);
      panel.append(stepList(guide.steps));
      tablist.append(button);
      help.append(panel);
      return { button, panel };
    });

    function select(index) {
      tabs.forEach(({ button, panel }, current) => {
        const active = current === index;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        panel.hidden = !active;
      });
    }

    tabs.forEach(({ button }, index) => {
      button.addEventListener('click', () => select(index));
      button.addEventListener('keydown', event => {
        let next;
        switch (event.key) {
          case 'ArrowRight': next = (index + 1) % tabs.length; break;
          case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break;
          case 'Home': next = 0; break;
          case 'End': next = tabs.length - 1; break;
          default: return;
        }
        event.preventDefault();
        select(next);
        tabs[next].button.focus();
      });
    });
    select(0);
  }

  window.SiteHelp = {
    has(page) { return !!window.SiteHelpData?.[page]; },
    render(help, head, page) {
      const data = window.SiteHelpData?.[page];
      if (!data) return;
      const oldSections = Array.from(help.children).filter(node => node !== head);
      if (data.tabs) renderTabs(help, data.tabs, data.sectionId);
      else help.append(stepList(data.steps, data.sectionId || 'uxGuideSteps'));
      const details = make('details', 'ux-guide-details');
      details.append(make('summary', '', '계산 기준과 알아둘 점'));
      if (data.notes?.length) {
        const notes = make('ul');
        data.notes.forEach(note => notes.append(make('li', '', note)));
        details.append(notes);
      }
      details.append(...oldSections);
      if (data.links?.length) {
        const related = make('ul', 'ux-guide-related');
        data.links.forEach(link => {
          const anchor = make('a', '', link.label);
          anchor.href = link.href;
          const item = make('li');
          item.append(anchor);
          related.append(item);
        });
        details.append(related);
      }
      if (details.children.length > 1) help.append(details);
    }
  };
})();
