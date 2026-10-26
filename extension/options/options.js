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

  function render() {
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
      const old = Object.keys(all).filter((k) => k.startsWith('s:') || k === 'presets' || k === 'def');
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
