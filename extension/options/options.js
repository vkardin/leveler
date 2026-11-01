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
  let undoAction = null;
  const action = (fn) => async () => { try { await fn(); } catch { msg(t('p_save_error'), true); } };
  function undoFor(values) {
    undoAction = async () => { await chrome.storage.sync.set(values); };
    $('#undoOptions').hidden = false;
  }
  $('#undoOptions').onclick = action(async () => { if (undoAction) await undoAction(); undoAction = null; $('#undoOptions').hidden = true; });
  $('#siteSearch').oninput = () => render();

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
    if (p) { const next = PR.normalizeProfile(all.def || PR.DEFAULT_PROFILE); next.preset = id; next.params = PR.presetParams(p.params, next.params); chrome.storage.sync.set({ def: next }).catch(() => msg(t('p_save_error'), true)); }
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
        undoFor({ presets });
        chrome.storage.sync.set({ presets: presets.filter((x) => x.id !== p.id) }).catch(() => msg(t('p_save_error'), true));
      }));
    }
    $('#presetsEmpty').hidden = presets.length > 0;

    const sites = Object.keys(all).filter((k) => k.startsWith('s:')).sort();
    const us = $('#sites');
    us.textContent = '';
    const search = $('#siteSearch').value.trim().toLowerCase();
    for (const k of sites.filter((k) => k.slice(2).includes(search))) {
      const pr = PR.normalizeProfile(all[k]);
      const row = item(k.slice(2), presetLabel(pr.preset) + ' · ' + pr.speed + '×', action(async () => {
        const before = all[k]; undoFor({ [k]: before }); await chrome.storage.sync.remove(k);
      }), t('o_reset'));
      const edit = document.createElement('button'); edit.textContent = t('o_edit_site');
      edit.onclick = () => {
        const old = row.querySelector('form'); if (old) { old.remove(); return; }
        const form = document.createElement('form'); form.className = 'site-editor';
        const field = (text, input) => { const label = document.createElement('label'); const span = document.createElement('span'); span.textContent = text; label.append(span, input); form.append(label); return input; };
        const preset = document.createElement('select');
        for (const p of [...PR.BUILTIN, ...PR.normalizePresets(all.presets)]) preset.append(new Option(p.id.startsWith('b:') ? t(p.name) : p.name, p.id));
        if (![...preset.options].some((o) => o.value === pr.preset)) preset.prepend(new Option(t('p_own_settings'), ''));
        preset.value = pr.preset || ''; field(t('p_preset'), preset);
        const speed = document.createElement('input'); speed.type = 'number'; speed.min = .25; speed.max = 4; speed.step = .05; speed.value = pr.speed; field(t('p_speed'), speed);
        const volume = document.createElement('input'); volume.type = 'number'; volume.min = 0; volume.max = 400; volume.step = 5; volume.value = pr.params.volume; field(t('p_volume'), volume);
        const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = pr.audioEnabled; field(t('p_site_enabled'), enabled);
        const save = document.createElement('button'); save.type = 'submit'; save.className = 'btn primary'; save.textContent = t('o_save_site'); form.append(save);
        form.onsubmit = (e) => {
          e.preventDefault();
          action(async () => {
            const next = PR.normalizeProfile(pr), selected = PR.builtin(preset.value) || PR.normalizePresets(all.presets).find((p) => p.id === preset.value);
            if (preset.value !== (pr.preset || '') && selected) { next.params = PR.presetParams(selected.params, pr.params); next.preset = selected.id; }
            next.params.volume = +volume.value; next.speed = +speed.value; next.audioEnabled = enabled.checked;
            undoFor({ [k]: all[k] }); await chrome.storage.sync.set({ [k]: PR.normalizeProfile(next) });
          })();
        };
        const host = document.createElement('input'); host.type = 'text'; host.placeholder = 'example.com'; field(t('o_copy_host'), host);
        const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn'; copy.textContent = t('o_copy_site');
        copy.onclick = action(async () => {
          const target = LV.normHost(host.value.trim());
          if (!PR.isHost(target) || target === k.slice(2)) { host.setCustomValidity(t('o_host_invalid')); host.reportValidity(); return; }
          const key = PR.siteKey(target);
          if (all[key] && !confirm(t('o_replace_site', target))) return;
          const previous = all[key];
          undoAction = () => previous ? chrome.storage.sync.set({ [key]: previous }) : chrome.storage.sync.remove(key); $('#undoOptions').hidden = false;
          await chrome.storage.sync.set({ [key]: pr });
        }); host.oninput = () => host.setCustomValidity(''); form.append(copy);
        row.append(form); preset.focus();
      };
      row.append(edit); us.append(row);
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
      if (!confirm(t('o_import_confirm'))) return;
      const previous = Object.fromEntries(old.map((k) => [k, all[k]]));
      for (const k of ['enabled', 'liveCatchup', 'focusMode', 'focusDuck']) if (k in all) previous[k] = all[k];
      const added = Object.keys(data).filter((k) => !(k in all));
      await chrome.storage.sync.set(data);
      await chrome.storage.sync.remove(old.filter((k) => !(k in data)));
      undoAction = async () => { await chrome.storage.sync.set(previous); await chrome.storage.sync.remove(added); }; $('#undoOptions').hidden = false;
      const sites = Object.keys(data).filter((k) => k.startsWith('s:')).length;
      msg(t('o_imported', data.presets.length, sites));
    } catch (err) {
      msg(t(err && err.message === 'too-new' ? 'o_import_new' : 'o_import_bad'), true);
    }
  });

  $('#resetSites').addEventListener('click', action(async () => {
    const keys = Object.keys(all).filter((k) => k.startsWith('s:'));
    undoFor(Object.fromEntries(keys.map((k) => [k, all[k]])));
    await chrome.storage.sync.remove(keys);
  }));

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
