(() => {
  const LV = self.LV;
  const PR = self.LV_PRESETS;
  const t = self.lvT;
  const $ = (s) => document.querySelector(s);
  const CACHE_KEY = 'unsupportedHosts';

  self.lvApplyI18n();
  document.title = t('o_title');

  let all = {};
  let cache = {};

  const presetLabel = (id) => {
    const b = PR.builtin(id);
    if (b) return t(b.name);
    const u = PR.normalizePresets(all.presets).find((p) => p.id === id);
    return u ? u.name : t('p_own_settings');
  };

  function item(name, meta, onRemove, removeLabel) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><span class="meta"></span><button type="button"></button>';
    li.querySelector('.name').textContent = name;
    li.querySelector('.meta').textContent = meta;
    const b = li.querySelector('button');
    b.textContent = removeLabel || t('p_delete');
    b.addEventListener('click', onRemove);
    return li;
  }

  // ── общие настройки ──
  function renderGeneral() {
    $('#optEnabled').checked = all.enabled !== false;
    $('#optLive').checked = LV.normalize(all).liveCatchup;
    const sel = $('#optDefault');
    sel.textContent = '';
    for (const p of PR.BUILTIN) sel.appendChild(new Option(t(p.name), p.id));
    for (const p of PR.normalizePresets(all.presets)) sel.appendChild(new Option(p.name, p.id));
    const def = PR.normalizeProfile(all.def || PR.DEFAULT_PROFILE);
    if (!def.preset || ![...sel.options].some((o) => o.value === def.preset)) {
      sel.insertBefore(new Option(t('p_own_settings'), ''), sel.firstChild);
      sel.value = '';
    } else sel.value = def.preset;
    const step = $('#optStep');
    if (!step.options.length) for (const s of PR.KEY_STEPS) step.appendChild(new Option(s + '×', s));
    step.value = PR.normalizeKeys(all.keys).step;
  }
  $('#optEnabled').addEventListener('change', (e) => chrome.storage.sync.set({ enabled: e.target.checked }));
  $('#optLive').addEventListener('change', (e) => chrome.storage.sync.set({ liveCatchup: e.target.checked }));
  $('#optDefault').addEventListener('change', (e) => {
    const id = e.target.value;
    const p = PR.builtin(id) || PR.normalizePresets(all.presets).find((x) => x.id === id);
    if (p) chrome.storage.sync.set({ def: { preset: id, params: p.params, speed: 1 } });
  });
  $('#optStep').addEventListener('change', (e) => {
    chrome.storage.sync.set({ keys: Object.assign(PR.normalizeKeys(all.keys), { step: +e.target.value }) });
  });

  // ── AudioFocus: фоновые вкладки ──
  const FOCUS_LABELS = { off: 'o_focus_off', pause: 'o_focus_pause', duck: 'o_focus_duck_mode' };
  function renderFocus() {
    const st = LV.normalize(all);
    const mode = $('#optFocus');
    if (!mode.options.length) for (const m of LV.FOCUS_MODES) mode.appendChild(new Option(t(FOCUS_LABELS[m]), m));
    mode.value = st.focusMode;
    const duck = $('#optDuck');
    if (!duck.options.length) for (const d of LV.FOCUS_DUCKS) duck.appendChild(new Option(Math.round(d * 100) + '%', d));
    duck.value = st.focusDuck;
    $('#optDuckRow').hidden = st.focusMode !== 'duck';
  }
  $('#optFocus').addEventListener('change', (e) => chrome.storage.sync.set({ focusMode: e.target.value }));
  $('#optDuck').addEventListener('change', (e) => chrome.storage.sync.set({ focusDuck: +e.target.value }));

  function render() {
    renderGeneral();
    renderFocus();
    renderKeys();
    const presets = PR.normalizePresets(all.presets);
    const ul = $('#presets');
    ul.textContent = '';
    for (const p of presets) {
      ul.appendChild(item(p.name, '', () => {
        chrome.storage.sync.set({ presets: presets.filter((x) => x.id !== p.id) });
      }));
    }
    $('#presetsEmpty').hidden = presets.length > 0;

    const sites = Object.keys(all).filter((k) => k.startsWith('s:')).sort();
    const us = $('#sites');
    us.textContent = '';
    for (const k of sites) {
      const pr = PR.normalizeProfile(all[k]);
      us.appendChild(item(k.slice(2), presetLabel(pr.preset) + ' · ' + pr.speed + '×',
        () => chrome.storage.sync.remove(k), t('o_reset')));
    }
    $('#sitesEmpty').hidden = sites.length > 0;
    $('#resetSites').hidden = sites.length === 0;

    const hosts = Object.keys(cache).sort();
    const uu = $('#unsupported');
    uu.textContent = '';
    for (const h of hosts) {
      uu.appendChild(item(h, '', () => {
        const next = Object.assign({}, cache);
        delete next[h];
        chrome.storage.local.set({ [CACHE_KEY]: next });
      }, t('o_forget')));
    }
    $('#unsupportedEmpty').hidden = hosts.length > 0;
  }

  // ── горячие клавиши: поле ловит нажатую клавишу ──
  const KEY_LABELS = { slower: 'o_key_slower', faster: 'o_key_faster', reset: 'o_key_reset' };
  const keyName = (k) => (k === ' ' ? 'Space' : k);
  function renderKeys() {
    const keys = PR.normalizeKeys(all.keys);
    const box = $('#keys');
    if (!box.children.length) {
      for (const name in KEY_LABELS) {
        const l = document.createElement('label');
        l.innerHTML = '<span></span><input type="text" readonly>';
        l.querySelector('span').textContent = t(KEY_LABELS[name]);
        const input = l.querySelector('input');
        input.dataset.key = name;
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') return;
          e.preventDefault();
          if (['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(e.key)) return;
          chrome.storage.sync.set({ keys: Object.assign(PR.normalizeKeys(all.keys), { [name]: e.key }) });
        });
        box.appendChild(l);
      }
    }
    for (const input of box.querySelectorAll('input')) input.value = keyName(keys[input.dataset.key]);
  }
  $('#resetKeys').addEventListener('click', () => chrome.storage.sync.remove('keys'));

  const msg = (text, err) => {
    const m = $('#backupMsg');
    m.textContent = text;
    m.classList.toggle('err', !!err);
  };

  $('#export').addEventListener('click', () => {
    const data = PR.exportData(all);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leveler-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg(t('o_exported'));
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 512 * 1024) throw new Error('too-big');
      const data = PR.importData(JSON.parse(await file.text()));
      // резервная копия заменяет пресеты, профиль по умолчанию и настройки сайтов целиком
      const old = Object.keys(all).filter((k) => k.startsWith('s:') || k === 'presets' || k === 'def' || k === 'keys');
      await chrome.storage.sync.remove(old);
      await chrome.storage.sync.set(data);
      const sites = Object.keys(data).filter((k) => k.startsWith('s:')).length;
      msg(t('o_imported', data.presets.length, sites));
    } catch (err) {
      msg(t(err && err.message === 'too-new' ? 'o_import_new' : 'o_import_bad'), true);
    }
  });

  $('#resetSites').addEventListener('click', () => {
    chrome.storage.sync.remove(Object.keys(all).filter((k) => k.startsWith('s:')));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      for (const k in changes) {
        if (changes[k].newValue === undefined) delete all[k];
        else all[k] = changes[k].newValue;
      }
    } else if (area === 'local' && changes[CACHE_KEY]) cache = changes[CACHE_KEY].newValue || {};
    render();
  });

  chrome.storage.sync.get(null, (r) => {
    all = r || {};
    chrome.storage.local.get(CACHE_KEY, (l) => {
      cache = (l && l[CACHE_KEY]) || {};
      render();
    });
  });
})();
