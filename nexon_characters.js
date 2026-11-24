// 넥슨 Open API의 계정 캐릭터 목록을 여러 계산기에서 함께 쓰는 선택기.
// 계정이 여러 개면 캐릭터를 모두 합치고, 최고 레벨 캐릭터의 월드를 기본으로 선택한다.
(function (root) {
  'use strict';

  var MIN_LEVEL = 260;
  var WORLD_ICON_FILES = {
    '노바':'노바.webp', '레드':'레드.webp', '루나':'루나.webp', '베라':'베라.webp',
    '스카니아':'스카니아.webp', '아케인':'아케인.webp', '에오스':'에오스.webp',
    '엘리시움':'엘리시움.webp', '오로라':'오로라.webp', '유니온':'유니온.webp',
    '이노시스':'이노시스.webp', '제니스':'제니스.webp', '챌린저스':'챌린저스.webp',
    '크로아':'크로아.webp', '헬리오스':'헬리오스.webp'
  };

  function text(value) { return String(value == null ? '' : value).trim(); }
  function level(value) { var n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }

  function normalize(data) {
    var characters = [];
    var accounts = data && Array.isArray(data.account_list) ? data.account_list : [];
    accounts.forEach(function (account) {
      var list = account && Array.isArray(account.character_list) ? account.character_list : [];
      list.forEach(function (raw) {
        var character = {
          accountId: text(account.account_id),
          ocid: text(raw && raw.ocid),
          name: text(raw && raw.character_name),
          world: text(raw && raw.world_name),
          characterClass: text(raw && raw.character_class),
          level: level(raw && raw.character_level)
        };
        if (character.name && character.world) characters.push(character);
      });
    });
    characters.sort(function (a, b) {
      return b.level - a.level || a.world.localeCompare(b.world, 'ko') || a.name.localeCompare(b.name, 'ko');
    });
    return characters;
  }

  // ── 내가 쓰는 계정 ─────────────────────────────────────────
  // 친구 계정처럼 내 API 키로는 목록에 나오지 않는 계정을 이 브라우저에서 내 캐릭터로 취급한다.
  // 공용 환산 배율의 계정 관리에서 켜고 끄며, 계정의 캐릭터 정보(이름·서버·레벨·직업)만 저장한다.
  var EXTRA_KEY = 'nexonCharacters.extraAccounts.v1';
  var EXTRA_EVENT = 'nexon-extra-accounts-changed';
  function readExtraAccounts() {
    try {
      var saved = JSON.parse(root.localStorage.getItem(EXTRA_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(function (a) { return a && typeof a.id === 'string' && Array.isArray(a.characters); }).slice(0, 50) : [];
    } catch (e) { return []; }
  }
  function writeExtraAccounts(list) {
    try { root.localStorage.setItem(EXTRA_KEY, JSON.stringify(list)); } catch (e) { return false; }
    try { root.dispatchEvent(new Event(EXTRA_EVENT)); } catch (e) {}
    return true;
  }
  function cleanExtraAccount(account) {
    return {
      id: text(account.id).slice(0, 80), label: text(account.label).slice(0, 40),
      characters: (account.characters || []).slice(0, 200).map(function (c) {
        return { name: text(c.name).slice(0, 30), world: text(c.world).slice(0, 30), characterClass: text(c.characterClass || c.job).slice(0, 50), level: level(c.level) };
      }).filter(function (c) { return c.name; })
    };
  }
  function isExtraAccount(id) { return readExtraAccounts().some(function (a) { return a.id === id; }); }
  // account를 넘기면 켜거나 정보를 갱신하고, null이면 끈다.
  function setExtraAccount(id, account) {
    var list = readExtraAccounts().filter(function (a) { return a.id !== id; });
    if (account) list.push(cleanExtraAccount(Object.assign({}, account, { id: id })));
    return writeExtraAccounts(list);
  }
  // 저장해 둔 계정 정보를 공용 계정 목록의 최신 소속·레벨로 맞춘다. 공용 목록에서 사라진 계정은 그대로 둔다.
  function refreshExtraAccounts(latest) {
    var list = readExtraAccounts(), changed = false;
    var next = list.map(function (a) {
      var fresh = latest.find(function (g) { return g.id === a.id; });
      if (!fresh) return a;
      var clean = cleanExtraAccount(Object.assign({}, fresh, { id: a.id }));
      if (JSON.stringify(clean) !== JSON.stringify(a)) changed = true;
      return clean;
    });
    if (changed) writeExtraAccounts(next);
    return changed;
  }
  function extraCharacters() {
    var seen = Object.create(null), out = [];
    readExtraAccounts().forEach(function (account) {
      account.characters.forEach(function (c) {
        if (seen[c.name]) return;
        seen[c.name] = true;
        out.push({ accountId: 'extra:' + account.id, accountLabel: account.label, ocid: '', name: c.name, world: c.world || '서버 미확인', characterClass: c.characterClass, level: c.level, extra: true });
      });
    });
    return out;
  }
  function extraNames() { return extraCharacters().map(function (c) { return c.name; }); }
  // API 계정 캐릭터와 내가 쓰는 계정 캐릭터를 합친다. 같은 이름이면 API 쪽을 쓴다.
  function mergeExtra(characters) {
    var names = Object.create(null);
    characters.forEach(function (c) { names[c.name] = true; });
    return characters.concat(extraCharacters().filter(function (c) { return !names[c.name]; })).sort(function (a, b) {
      return b.level - a.level || a.world.localeCompare(b.world, 'ko') || a.name.localeCompare(b.name, 'ko');
    });
  }
  function listed(character, minLevel) { return character.level >= minLevel || (character.extra && !character.level); }
  function pickKey(character) { return character.ocid || 'extra:' + character.name; }

  function worlds(characters, minLevel) {
    var seen = Object.create(null), out = [];
    characters.forEach(function (character) {
      if (!listed(character, minLevel) || seen[character.world]) return;
      seen[character.world] = true;
      out.push(character.world);
    });
    return out.sort(function (a, b) {
      var aTop = characters.find(function (character) { return character.world === a; });
      var bTop = characters.find(function (character) { return character.world === b; });
      return (bTop ? bTop.level : 0) - (aTop ? aTop.level : 0) || a.localeCompare(b, 'ko');
    });
  }

  function choose(characters, selectedWorld, minLevel) {
    return characters.filter(function (character) {
      return character.world === selectedWorld && listed(character, minLevel);
    });
  }

  function worldIconPath(world) {
    var name = text(world).replace(/^챌린저스\s*[1-4]$/, '챌린저스');
    var file = WORLD_ICON_FILES[name];
    return file ? 'icons/server/' + file : '';
  }

  function characterOptionText(character) {
    var name = text(character && character.name);
    var characterLevel = level(character && character.level);
    return name + (characterLevel ? ' · Lv.' + characterLevel : '');
  }

  function create(tag, className, label) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (label != null) node.textContent = label;
    return node;
  }

  async function fetchCharacters(options = {}) {
    if (!root.NexonKey || !root.NexonKey.has()) throw new Error('API_KEY_REQUIRED');
    const client = options.key
      ? new root.NexonApi((...args) => root.fetch(...args), () => options.key)
      : root.NexonApi.browser;
    return normalize(await client.get('/character/list', undefined, { signal: options.signal }));
  }

  function mount(options) {
    options = options || {};
    var host = typeof options.host === 'string' ? document.querySelector(options.host) : options.host;
    var input = typeof options.input === 'string' ? document.querySelector(options.input) : options.input;
    var minLevel = Number(options.minLevel) || MIN_LEVEL;
    if (!host || !input) return null;

    host.textContent = '';
    host.classList.add('nx-character-picker');
    var modeBar = create('div', 'nx-character-mode-bar');
    var manualButton = create('button', 'nx-character-mode');
    manualButton.type = 'button';
    manualButton.setAttribute('role', 'switch');
    manualButton.setAttribute('aria-checked', 'false');
    manualButton.setAttribute('aria-label', '직접 검색 사용');
    var modeSwitch = create('span', 'switch-track');
    modeSwitch.setAttribute('aria-hidden', 'true');
    modeSwitch.appendChild(create('span', 'switch-thumb nx-mode-thumb'));
    var modeStatus = create('span', 'switch-state', '꺼짐');
    modeStatus.setAttribute('aria-hidden', 'true');
    manualButton.append(modeSwitch, create('span', 'nx-mode-label', '직접 검색'), modeStatus);
    modeBar.appendChild(manualButton);
    var fields = create('div', 'nx-character-fields');
    var worldLabel = create('label', 'nx-character-field');
    var worldCaption = create('span', '', '서버');
    var worldControl = create('span', 'nx-world-control');
    var worldIcon = create('img', 'nx-world-icon');
    worldIcon.alt = '';
    worldIcon.hidden = true;
    var worldSelect = create('select', 'nx-world-select');
    worldSelect.setAttribute('aria-label', '서버 선택');
    worldControl.append(worldIcon, worldSelect);
    worldLabel.append(worldCaption, worldControl);
    var characterLabel = create('label', 'nx-character-field nx-character-main');
    var characterCaption = create('span', '', '내 캐릭터');
    var characterSelect = create('select', 'nx-character-select');
    characterSelect.setAttribute('aria-label', '내 캐릭터 선택');
    characterLabel.append(characterCaption, characterSelect);
    fields.append(worldLabel, characterLabel);
    var note = create('p', 'nx-character-note', '계정 캐릭터를 불러오는 중…');
    note.setAttribute('aria-live', 'polite');
    host.append(modeBar, fields, note);

    var all = [], manual = false, pendingSelection = null;
    function setNote(message) {
      note.textContent = message || '';
      note.hidden = !message;
    }
    function setManual(next, focus, skipSelection) {
      var wasManual = manual;
      manual = !!next;
      host.classList.toggle('is-manual', manual);
      input.hidden = !manual;
      manualButton.setAttribute('aria-checked', manual ? 'true' : 'false');
      modeStatus.textContent = manual ? '켜짐' : '꺼짐';
      if (typeof options.onModeChange === 'function') options.onModeChange(manual);
      if (manual) {
        input.removeAttribute('data-account-ocid');
        input.removeAttribute('data-account-world');
        if (focus) { input.value = ''; input.focus(); }
        setNote('내 계정이 아닌 캐릭터 이름도 직접 검색할 수 있습니다.');
      } else if (wasManual && !skipSelection) {
        applySelection();
      }
    }

    function applySelection(notify) {
      var selected = all.find(function (character) { return pickKey(character) === characterSelect.value; });
      if (!selected) return;
      input.value = selected.name;
      // 내가 쓰는 계정 캐릭터는 OCID를 모르므로 이름으로 조회하게 둔다.
      if (selected.ocid) input.dataset.accountOcid = selected.ocid; else input.removeAttribute('data-account-ocid');
      input.dataset.accountWorld = selected.world;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setNote('');
      if (notify !== false && typeof options.onSelect === 'function') options.onSelect(selected);
    }

    function renderCharacters(preferredOcid, skipSelection, notify) {
      var iconPath = worldIconPath(worldSelect.value);
      worldIcon.hidden = !iconPath;
      worldIcon.removeAttribute('src');
      if (iconPath) worldIcon.src = iconPath;
      worldControl.classList.toggle('has-icon', !!iconPath);
      var list = choose(all, worldSelect.value, minLevel);
      characterSelect.textContent = '';
      list.forEach(function (character) {
        var option = create('option', '', characterOptionText(character) + (character.extra ? ' · ' + (character.accountLabel || '추가한 계정') : ''));
        option.value = pickKey(character);
        option.title = character.world + ' · Lv.' + character.level + ' · ' + character.characterClass + (character.extra ? ' · 내가 쓰는 계정' : '');
        characterSelect.appendChild(option);
      });
      if (preferredOcid && list.some(function (character) { return pickKey(character) === preferredOcid; })) characterSelect.value = preferredOcid;
      characterSelect.disabled = !list.length;
      if (list.length) { if (!skipSelection) applySelection(notify); }
      else setNote('이 서버에는 레벨 ' + minLevel + ' 이상 캐릭터가 없습니다.');
    }

    function findCharacter(target) {
      return all.find(function (character) {
        if (!listed(character, minLevel)) return false;
        if (target.ocid && character.ocid) return character.ocid === target.ocid;
        return character.name === target.name && (!target.world || character.world === target.world);
      });
    }
    function selectCharacter(target, selectionOptions) {
      target = typeof target === 'string' ? {name:target} : target || {};
      pendingSelection = {name:text(target.name), world:text(target.world), ocid:text(target.ocid), notify:!(selectionOptions && selectionOptions.notify === false)};
      var selected = findCharacter(pendingSelection);
      input.removeAttribute('data-account-ocid');
      input.removeAttribute('data-account-world');
      if (selected) {
        worldSelect.value = selected.world;
        setManual(false, false, true);
        renderCharacters(pickKey(selected), false, pendingSelection.notify);
        pendingSelection = null;
        return true;
      }
      // 계정 목록이 아직 로딩 중이거나 계정 밖 캐릭터라면 선택한 이름을 직접 검색 칸에 표시한다.
      setManual(true, false);
      input.value = pendingSelection.name;
      return false;
    }

    function renderList(characters) {
      all = characters;
      var wanted = pendingSelection || {name:text(input.value), world:text(input.dataset.accountWorld)};
      pendingSelection = null;
      var availableWorlds = worlds(all, minLevel);
      worldSelect.textContent = '';
      availableWorlds.forEach(function (world) {
        var count = choose(all, world, minLevel).length;
        var option = create('option', '', world + ' · ' + count + '명');
        option.value = world;
        worldSelect.appendChild(option);
      });
      if (!availableWorlds.length) {
        worldSelect.disabled = true;
        characterSelect.disabled = true;
        setManual(true, false);
        setNote('계정에 레벨 ' + minLevel + ' 이상 캐릭터가 없어 직접 검색으로 전환했습니다.');
        return;
      }
      worldSelect.disabled = false;
      var highest = all[0];
      var preferred = findCharacter(wanted);
      if ((wanted.name || wanted.ocid) && !preferred) {
        worldSelect.value = highest && availableWorlds.indexOf(highest.world) >= 0 ? highest.world : availableWorlds[0];
        renderCharacters(highest && pickKey(highest), true);
        setManual(true, false);
        input.value = wanted.name;
        return;
      }
      var selected = preferred || highest;
      worldSelect.value = selected && availableWorlds.indexOf(selected.world) >= 0 ? selected.world : availableWorlds[0];
      setManual(false, false, true);
      renderCharacters(selected && pickKey(selected), false, wanted.notify);
    }

    function describe(error) {
      if (error && error.message === 'API_KEY_REQUIRED') return 'API 키를 등록하면 계정 캐릭터가 여기에 표시됩니다.';
      if (error && error.code === 'OPENAPI00005') return 'API 키가 유효하지 않아 계정 캐릭터를 불러오지 못했습니다.';
      if (error && error.code === 'OPENAPI00002') return '이 API 키로 계정 캐릭터 목록을 조회할 권한이 없습니다.';
      return '계정 캐릭터를 불러오지 못했습니다. 다른 캐릭터 검색은 계속 사용할 수 있습니다.';
    }

    function reload() {
      worldSelect.disabled = true;
      characterSelect.disabled = true;
      setNote('계정 캐릭터를 불러오는 중…');
      return fetchCharacters().then(function (list) { renderList(mergeExtra(list)); }).catch(function (error) {
        // API 키가 없거나 실패해도 내가 쓰는 계정 캐릭터는 고를 수 있게 한다.
        var extras = mergeExtra([]);
        if (extras.length) {
          renderList(extras);
          setNote(error && error.message === 'API_KEY_REQUIRED' ? '내가 쓰는 계정 캐릭터만 표시합니다. API 키를 등록하면 내 계정 캐릭터도 함께 나옵니다.' : describe(error) + ' 내가 쓰는 계정 캐릭터만 표시합니다.');
          return;
        }
        setNote(describe(error));
        setManual(true, false);
      });
    }

    worldSelect.addEventListener('change', function () { pendingSelection = null; renderCharacters(); });
    characterSelect.addEventListener('change', function () { pendingSelection = null; applySelection(); });
    manualButton.addEventListener('click', function () { pendingSelection = null; setManual(!manual, !manual); });
    root.addEventListener('storage', function (event) {
      if ((root.NexonKey && event.key === root.NexonKey.STORAGE_KEY) || event.key === EXTRA_KEY) reload();
    });
    root.addEventListener(EXTRA_EVENT, function () { reload(); });
    var ready = reload();
    return { reload: reload, setManual: setManual, selectCharacter: selectCharacter, ready: ready };
  }

  root.NexonCharacters = {
    get API_URL() { return root.NexonApi.url('/character/list'); },
    MIN_LEVEL: MIN_LEVEL,
    WORLD_ICON_FILES: WORLD_ICON_FILES,
    normalize: normalize,
    worlds: worlds,
    choose: choose,
    worldIconPath: worldIconPath,
    characterOptionText: characterOptionText,
    fetch: fetchCharacters,
    mount: mount,
    EXTRA_KEY: EXTRA_KEY,
    EXTRA_EVENT: EXTRA_EVENT,
    extraAccounts: readExtraAccounts,
    isExtraAccount: isExtraAccount,
    setExtraAccount: setExtraAccount,
    refreshExtraAccounts: refreshExtraAccounts,
    extraCharacters: extraCharacters,
    extraNames: extraNames,
    mergeExtra: mergeExtra
  };
})(typeof window !== 'undefined' ? window : globalThis);
