/* Flatpickr 4.6.13 integration. Calendar rendering and keyboard handling belong to the library. */
(function () {
  'use strict';
  if (!window.flatpickr) return; // Native date inputs remain usable if the library fails to load.
  const inputs = ['historyFrom', 'historyTo'].map(id => document.getElementById(id));
  const pickers = [];
  inputs.forEach(input => {
    if (!input) return;
    const picker = flatpickr(input, {
      locale: 'ko', dateFormat: 'Y-m-d', ariaDateFormat: 'Y년 m월 d일',
      minDate: input.min, maxDate: input.max, defaultDate: input.value,
      position: 'below left', disableMobile: true, clickOpens: false,
      onOpen: function (_, __, instance) {
        pickers.forEach(other => { if (other !== instance) other.close(); });
        instance.setDate(input.value, false);
        input.setAttribute('aria-expanded', 'true');
      },
      onClose: function () { input.setAttribute('aria-expanded', 'false'); }
    });
    picker.calendarContainer.id = input.id + 'Calendar';
    input.setAttribute('aria-controls', picker.calendarContainer.id);
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('click', () => picker.toggle());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation(); picker.toggle();
      }
    }, true);
    pickers.push(picker);
  });
  document.getElementById('historyPeriods').addEventListener('click', event => {
    if (!event.target.closest('button')) return;
    pickers.forEach(picker => { picker.setDate(picker.input.value, false); picker.close(); });
  });
})();
