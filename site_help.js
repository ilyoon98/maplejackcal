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
    button.append(image, make('span', 'ux-guide-image-label', '이미지 확대 보기'));
    const error = () => {
      button.disabled = true;
      button.classList.add('ux-guide-image-error');
      button.querySelector('.ux-guide-image-label').textContent = '이미지를 불러오지 못했습니다. 설명을 확인하세요.';
    };
    image.addEventListener('error', error);
    if (image.complete && !image.naturalWidth) error();
    button.addEventListener('click', () => {
      imageViewer();
      imageOpener = button;
      viewerTitle.textContent = image.alt || '도움말 이미지';
      viewerCaption.textContent = caption || '사용 방법을 설명하는 예시 화면입니다.';
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
    if (!item.image) return null;
    const fig = make('figure', 'ux-guide-figure');
    const image = make('img');
    image.src = item.image;
    image.alt = item.alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    if (item.width && item.height) { image.width = item.width; image.height = item.height; }
    fig.append(image);
    if (item.caption) fig.append(make('figcaption', '', item.caption));
    enableImage(image, item.caption);
    return fig;
  }

  window.SiteHelp = {
    has(page) { return !!window.SiteHelpData?.[page]; },
    render(help, head, page) {
      const data = window.SiteHelpData?.[page];
      if (data) {
        const oldSections = Array.from(help.children).filter(node => node !== head);
        const intro = make('section', 'ux-guide-intro');
        intro.append(make('h3', '', data.title), make('p', '', data.intro));
        intro.append(make('p', 'ux-guide-example-note', '캡처는 사용 방법을 설명하는 예시입니다. 이미지를 누르면 크게 볼 수 있습니다.'));
        const steps = make('section', 'ux-help-section ux-guide-section');
        steps.id = 'uxGuideSteps';
        steps.append(make('h3', '', '따라 해 보기'));
        const list = make('ol', 'ux-guide-steps');
        list.setAttribute('role', 'list');
        data.steps.forEach((step, index) => {
          const row = make('li', 'ux-guide-step');
          const heading = make('h4');
          const number = make('span', 'ux-guide-step-number', String(index + 1));
          number.setAttribute('aria-hidden', 'true');
          heading.append(number, document.createTextNode(step.title));
          row.append(heading, make('p', '', step.text));
          const picture = figure(step);
          if (picture) row.append(picture);
          list.append(row);
        });
        steps.append(list);
        const result = make('section', 'ux-help-section ux-guide-result');
        result.id = 'uxGuideResult';
        result.append(make('h3', '', data.result.title || '결과 읽는 법'), make('p', '', data.result.text));
        const resultPicture = figure(data.result);
        if (resultPicture) result.append(resultPicture);
        const details = make('details', 'ux-guide-details');
        details.append(make('summary', '', '계산 기준과 알아둘 점'));
        if (data.notes?.length) {
          const notes = make('ul');
          data.notes.forEach(note => notes.append(make('li', '', note)));
          details.append(notes);
        }
        details.append(...oldSections);
        help.append(intro, steps, result, details);
        if (data.links?.length) {
          const related = make('section', 'ux-help-section ux-guide-related');
          related.append(make('h3', '', '함께 보는 도움말'));
          data.links.forEach(link => {
            const anchor = make('a', '', link.label);
            anchor.href = link.href;
            related.append(anchor);
          });
          help.append(related);
        }
      }
      // The original shared-rates walkthrough also gets accessible image enlargement.
      help.querySelectorAll('.shared-capture-steps img').forEach(image => enableImage(image));
    }
  };
})();
