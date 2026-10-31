import { ALL_EMOTES, CATALOG_INFO, pingById } from './pings.js'
import { hasIcon, iconMarkup } from './ping-assets.js'
import {
  DAILY_QUESTS, MILESTONE_QUESTS, EMOTE_COST, LEVEL_XP, STARTER_IDS,
  dayKey, usableWheel, canEquip, ownedEmote, equipEmote, unlockEmote, openChest, claimChest, questProgress,
} from './progression.js'

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const chestArt = `<svg viewBox="0 0 200 170" aria-hidden="true"><defs><linearGradient id="chest-gold" x2="1" y2="1"><stop stop-color="#f4d492"/><stop offset="1" stop-color="#805a25"/></linearGradient></defs><path d="M34 62 64 29h78l26 33v69l-68 27-66-27Z" fill="#122b3b" stroke="url(#chest-gold)" stroke-width="4"/><path d="m34 62 66 26 68-26M100 88v70M64 29l36 24 42-24M100 53v35" fill="none" stroke="#c6a363" stroke-width="4"/><path d="m100 71 17 24-17 25-17-25Z" fill="#51d8e5" stroke="#d8fbff" stroke-width="2"/><path d="m49 82 31 12v26l-31-12m71-14 31-12v26l-31 12" fill="#183e51" stroke="#6f8d94" stroke-width="2"/></svg>`

export function mountLoot({ store, onOpen = () => {}, onClose = () => {} }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'loot'
  dialog.setAttribute('aria-labelledby', 'loot-title')
  dialog.innerHTML = `
    <header class="loot-header">
      <div class="loot-heading"><span class="loot-eyebrow">PDF PING WHEEL / 阅读峡谷</span><h1 id="loot-title">战利品</h1></div>
      <div class="loot-wallet" id="loot-wallet"></div>
      <button id="loot-close" class="loot-close" aria-label="关闭战利品，返回阅读">返回阅读 <kbd>Esc</kbd></button>
    </header>
    <nav class="loot-tabs" aria-label="战利品功能">
      <button data-tab="collection" aria-current="page">表情藏品</button>
      <button data-tab="workshop">研究宝箱 <span id="chest-badge"></span></button>
      <button data-tab="quests">阅读任务</button>
      <span>让每一次认真阅读，都有所收获。</span>
    </nav>
    <div class="loot-body">
      <aside class="loot-loadout">
        <div class="section-kicker">EMOTE LOADOUT</div><h2>我的表情轮盘</h2>
        <p class="loot-muted">选择一个位置，再装备喜欢的表情。<br>也可以把表情卡拖到轮盘上。</p>
        <div id="loadout-wheel" class="loadout-wheel" aria-label="九格表情轮盘"></div>
        <p id="slot-label" class="slot-label"></p>
        <button id="reset-wheel" class="quiet-button">恢复初始配置</button>
        <section id="emote-detail" class="emote-detail" aria-live="polite"></section>
      </aside>
      <section class="loot-content">
        <div id="collection-pane">
          <div class="collection-heading"><div><span class="section-kicker">YOUR COLLECTION</span><h2>把心情带进文献</h2></div><span id="collection-count"></span></div>
          <div class="collection-tools">
            <label class="loot-search"><span class="sr-only">搜索表情</span><input id="emote-search" type="search" placeholder="搜索中文、英文名称或编号…" autocomplete="off"></label>
            <label><span class="sr-only">收藏状态</span><select id="emote-filter"><option value="all">全部表情</option><option value="owned">已拥有</option><option value="locked">未解锁</option><option value="favorites">已收藏</option><option value="equipped">已装备</option></select></label>
            <label><span class="sr-only">表情来源</span><select id="emote-origin"><option value="all">全部系列</option><option value="LOL">英雄联盟</option><option value="TFT">云顶之弈</option></select></label>
          </div>
          <p id="catalog-note" class="loot-muted"></p>
          <div id="emote-grid" class="emote-grid" aria-label="表情藏品"></div>
          <div class="collection-pagination"><button id="emotes-prev">上一页</button><span id="emotes-page" aria-live="polite"></span><button id="emotes-next">下一页</button></div>
        </div>
        <div id="workshop-pane" hidden></div>
        <div id="quests-pane" hidden></div>
      </section>
    </div>
    <footer class="loot-footer">
      <label class="mode-switch"><input id="free-mode" type="checkbox"> 自由模式 <span>全部表情可装备，保留任务进度</span></label>
      <div><button id="export-profile" class="quiet-button">导出存档</button><button id="import-profile" class="quiet-button">导入存档</button></div>
      <input id="profile-file" type="file" accept="application/json,.json" hidden>
    </footer>`
  document.body.append(dialog)
  const toast = document.createElement('output')
  toast.id = 'loot-toast'; toast.setAttribute('role', 'status'); toast.hidden = true
  document.body.append(toast)
  const $ = id => dialog.querySelector(`#${id}`)
  let tab = 'collection', slot = 0, selected = STARTER_IDS[0], page = 0, toastTimer, opener
  let shownDay = dayKey(), busy = false
  const pageSize = 40

  function notify(message) {
    toast.textContent = message; toast.hidden = false
    // A dialog is in the top layer. Its notification must be in that layer too.
    if (dialog.open) dialog.append(toast); else document.body.append(toast)
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true }, 4500)
  }
  async function act(action, success) {
    if (busy) return
    busy = true
    try { const result = await store.mutate(action); render(); if (success) notify(success); return result }
    catch (error) { notify(error.message || '操作未保存，请重试') }
    finally { busy = false }
  }
  function slotName(index) { return index === 0 ? '中心位 · 轻点 T' : `外圈 ${index} · 按住 T 选择` }
  function renderWheel() {
    const wheel = usableWheel(store.get())
    $('loadout-wheel').innerHTML = `<div class="loadout-orbit"></div>` + wheel.map((id, index) => {
      const angle = ((index - 1 + 0.5) / 8) * Math.PI * 2
      const x = index ? 50 + 38 * Math.sin(angle) : 50, y = index ? 50 - 38 * Math.cos(angle) : 50
      return `<button class="loadout-slot ${slot === index ? 'is-active' : ''}" data-slot="${index}" style="left:${x}%;top:${y}%" aria-pressed="${slot === index}" title="${esc(slotName(index))}：${esc(pingById(id).label)}" aria-label="${esc(slotName(index))}：${esc(pingById(id).label)}">${iconMarkup(pingById(id), 44)}<span>${index || 'T'}</span></button>`
    }).join('')
    $('slot-label').textContent = `正在配置：${slotName(slot)}`
  }
  function renderDetail() {
    const p = store.get(), emote = pingById(selected), unlocked = ownedEmote(p, selected)
    const available = hasIcon(selected) || STARTER_IDS.includes(selected)
    const usable = canEquip(p, selected)
    const equipped = usableWheel(p)[slot] === selected
    $('emote-detail').innerHTML = `
      <div class="detail-header"><div class="detail-art">${iconMarkup(emote, 60)}</div><div><h3>${esc(emote.label)}</h3>
      <p class="loot-muted">${esc(emote.englishName || '')} · #${emote.riotId || ''}</p></div></div>
      <button data-action="favorite" class="quiet-button">${p.favorites.includes(selected) ? '★ 已收藏' : '☆ 加入收藏'}</button>
      <p class="ownership">${unlocked ? '已永久解锁' : p.mode === 'free' ? '自由模式 · 可直接装备' : `未解锁 · ${EMOTE_COST} 研究精粹`}</p>
      ${available ? '' : '<p class="asset-missing">本地未安装此图片，请安装完整素材版。</p>'}
      ${usable ? `<button class="gold-button detail-equip" data-action="equip" ${equipped || !available ? 'disabled' : ''}>${equipped ? '已装备在此位置' : `装备到${slot ? `外圈 ${slot}` : '中心位'}`}</button>`
        : `<button class="gold-button detail-equip" data-action="unlock" ${p.essence < EMOTE_COST || !available ? 'disabled' : ''}>${EMOTE_COST} 精粹 · 解锁并装备</button><button class="quiet-button" data-action="tasks">去完成阅读任务 →</button>`}
      <p class="loot-muted detail-hint">配置会自动保存；替换表情不影响 PDF 中已有的标注。</p>`
  }
  function renderCollection() {
    const p = store.get(), search = $('emote-search').value.trim().toLocaleLowerCase()
    const filter = $('emote-filter').value, origin = $('emote-origin').value
    const owned = new Set(p.owned), favorite = new Set(p.favorites), wheel = new Set(usableWheel(p))
    const matches = ALL_EMOTES.filter(e => {
      if (origin !== 'all' && e.collection !== origin) return false
      if (filter === 'owned' && !owned.has(e.id) || filter === 'locked' && owned.has(e.id) || filter === 'favorites' && !favorite.has(e.id) || filter === 'equipped' && !wheel.has(e.id)) return false
      return !search || `${e.label} ${e.englishName} ${e.riotId}`.toLocaleLowerCase().includes(search)
    })
    const pages = Math.max(1, Math.ceil(matches.length / pageSize)); page = Math.min(page, pages - 1)
    $('collection-count').textContent = `已拥有 ${ALL_EMOTES.filter(e => owned.has(e.id)).length} / ${ALL_EMOTES.length}`
    $('catalog-note').textContent = `表情库更新于 ${CATALOG_INFO.updatedAt} · ${matches.length} 个结果${p.mode === 'free' ? ' · 自由模式已开启' : ''}`
    $('emote-grid').innerHTML = matches.slice(page * pageSize, (page + 1) * pageSize).map(e => `
      <button class="emote-card ${selected === e.id ? 'is-selected' : ''} ${owned.has(e.id) || p.mode === 'free' ? '' : 'is-locked'}" data-emote="${e.id}" draggable="${canEquip(p, e.id) && (hasIcon(e.id) || STARTER_IDS.includes(e.id))}" aria-pressed="${selected === e.id}" title="${esc(e.label)} · ${owned.has(e.id) ? '已拥有' : p.mode === 'free' ? '自由装备' : '未解锁'}">
        <span class="emote-card-art">${iconMarkup(e, 72)}</span><span class="emote-card-name">${esc(e.label)}</span>
        <span class="emote-card-state">${wheel.has(e.id) ? '已装备' : owned.has(e.id) ? '已拥有' : p.mode === 'free' ? '自由装备' : '◇ 100'}${favorite.has(e.id) ? ' · ★' : ''}</span>
      </button>`).join('') || '<div class="collection-empty"><h3>没有找到表情</h3><p>换个关键词，或调整收藏状态和系列筛选。</p></div>'
    $('emotes-page').textContent = `${page + 1} / ${pages}`
    $('emotes-prev').disabled = page === 0; $('emotes-next').disabled = page >= pages - 1
  }
  function renderWorkshop() {
    const p = store.get()
    $('workshop-pane').innerHTML = `<div class="section-kicker">RESEARCH LOOT</div><h2>你的努力，值得开箱庆祝</h2>
      <p class="loot-muted">任务奖励直接到账。每升一级，再获得一个研究宝箱。</p>
      ${p.pending.length ? `<section class="reward-reveal"><span class="section-kicker">选择你的战利品</span><h3>把最喜欢的那一个，带回藏品库</h3><p class="loot-muted">${p.pending.length} 选 1 · 关闭界面后仍会保留本次结果</p><div class="reward-choices">${p.pending.map(id => `<button class="reward-choice" data-reward="${id}"><span>${iconMarkup(pingById(id), 120)}</span><strong>${esc(pingById(id).label)}</strong><small>永久解锁 · 点击领取</small></button>`).join('')}</div></section>`
        : `<section class="chest-display"><div class="chest-art">${chestArt}</div><span class="section-kicker">研究宝箱 × ${p.chests}</span><h3>读过的每一页，都在积累</h3><p>开启后，从三个未拥有的表情中选择一个永久解锁。</p><button class="gold-button" id="open-chest" ${p.chests < 1 || ALL_EMOTES.every(e => p.owned.includes(e.id)) ? 'disabled' : ''}>开启研究宝箱</button></section>`}
      <div class="loot-rules"><div><h3>自由选择</h3><p>每个未拥有的表情等概率进入候选；不足三个时展示全部剩余表情。也可用 100 精粹直接兑换。</p></div><div><h3>始终属于你</h3><p>没有付费开箱，也没有限时到期。中断几天阅读，不会扣除经验或收回藏品。</p></div></div>`
  }
  function renderQuests() {
    const p = store.get(), key = dayKey(), day = p.days[key]
    const card = q => {
      const progress = questProgress(p, q, key)
      const rewards = [`${q.xp} XP`, q.essence ? `${q.essence} 精粹` : '', q.chests ? `${q.chests} 宝箱` : ''].filter(Boolean).join(' + ')
      return `<article class="quest-card ${progress.claimed ? 'is-complete' : ''}"><div class="quest-symbol">${progress.claimed ? '✓' : '◇'}</div><div class="quest-copy"><h3>${q.title}</h3><p>${q.description}</p><progress max="${q.goal}" value="${progress.value}" aria-label="${q.title}"></progress><div class="quest-bottom"><span>${Math.floor(progress.value)} / ${q.goal}</span><span>${rewards}</span><strong>${progress.claimed ? '奖励已到账' : '进行中'}</strong></div></div></article>`
    }
    $('quests-pane').innerHTML = `<div class="section-kicker">YOUR NEXT OBJECTIVE</div><h2>今天，向理解更进一步</h2>
      <div class="reading-stats"><div><strong>${Math.floor((day?.ms || 0) / 60000)}<small> 分钟</small></strong><span>今日有效阅读</span></div><div><strong>${p.noteHashes.length}<small> 条</small></strong><span>累计有效笔记</span></div><div><strong>${p.activeDays.length}<small> 天</small></strong><span>累计阅读日</span></div></div>
      <h3 class="quest-group-title">每日任务 <span>${key} · 本地时间零点更新</span></h3><div class="quest-grid">${DAILY_QUESTS.map(card).join('')}</div>
      <h3 class="quest-group-title">成长里程碑 <span>长期有效，无需连续签到</span></h3><div class="quest-grid">${MILESTONE_QUESTS.map(card).join('')}</div>
      <details class="quest-explanation"><summary>哪些阅读行为会被计入？</summary><p>打开 PDF 后，仅在阅读窗口位于前台、页面可见且最近 2 分钟有鼠标、滚动或键盘操作时计时。查看战利品、离开窗口、电脑休眠不计时。进度约每 5 秒更新。</p><p>标记必须是本次新建、保存时仍存在的标记；同一文献同一页每天只计一次。笔记需至少 12 个非空白字符且有 4 种不同字符；同文献相同内容、重复保存和重新打开不会反复增加笔记数。字数规则只用于计数，不代表内容质量。</p><p>每 200 XP 升一级并获得 1 个研究宝箱。存档保存在本机浏览器，不连接 Riot 账号。文件名、笔记正文和 PDF 不会存入任务存档或上传。换设备前可导出存档。</p></details>`
  }
  function render() {
    dialog.dataset.tab = tab
    const p = store.get()
    const level = 1 + Math.floor(p.xp / LEVEL_XP)
    $('loot-wallet').innerHTML = `<div class="reader-level"><b>${level}</b><span>阅读等级<progress max="${LEVEL_XP}" value="${p.xp % LEVEL_XP}" aria-label="等级经验"></progress><small>${p.xp % LEVEL_XP} / ${LEVEL_XP} XP</small></span></div><div class="wallet-currency"><strong>◆ ${p.essence}</strong><span>研究精粹</span></div><div class="wallet-currency"><strong>◇ ${p.chests}</strong><span>研究宝箱</span></div>`
    $('chest-badge').textContent = p.pending.length ? '待领取' : p.chests || ''
    $('free-mode').checked = p.mode === 'free'
    renderWheel(); renderDetail()
    for (const name of ['collection', 'workshop', 'quests']) $(`${name}-pane`).hidden = name !== tab
    for (const button of dialog.querySelectorAll('[data-tab]')) {
      if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current')
    }
    if (tab === 'collection') renderCollection()
    if (tab === 'workshop') renderWorkshop()
    if (tab === 'quests') renderQuests()
    shownDay = dayKey()
  }
  const switchTab = name => { tab = name; render(); dialog.querySelector('.loot-content').scrollTop = 0 }
  dialog.addEventListener('click', async event => {
    const target = event.target.closest('button'); if (!target) return
    if (target.dataset.tab) switchTab(target.dataset.tab)
    if (target.dataset.slot !== undefined) { slot = Number(target.dataset.slot); renderWheel(); renderDetail() }
    if (target.dataset.emote) { selected = target.dataset.emote; renderDetail(); renderCollection() }
    if (target.dataset.reward) {
      const id = target.dataset.reward
      const result = await act(p => { claimChest(p, id); return true }, `已解锁「${pingById(id).label}」，可装备到轮盘`)
      if (result) { selected = id; switchTab('collection') }
    }
    if (target.id === 'open-chest') await act(p => openChest(p))
    if (target.dataset.action === 'tasks') switchTab('quests')
    if (target.dataset.action === 'favorite') await act(p => { p.favorites = p.favorites.includes(selected) ? p.favorites.filter(id => id !== selected) : [...p.favorites, selected] })
    if (target.dataset.action === 'equip' || target.dataset.action === 'unlock') {
      await act(p => { if (!canEquip(p, selected)) unlockEmote(p, selected); equipEmote(p, selected, slot) }, '已装备，轮盘配置已保存')
    }
  })
  dialog.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-emote]')
    if (!card || !canEquip(store.get(), card.dataset.emote)) { event.preventDefault(); return }
    event.dataTransfer.setData('application/x-pdf-emote', card.dataset.emote)
    event.dataTransfer.effectAllowed = 'copy'
  })
  dialog.addEventListener('dragover', event => { if (event.target.closest('[data-slot]')) event.preventDefault() })
  dialog.addEventListener('drop', event => {
    const button = event.target.closest('[data-slot]'); if (!button) return
    event.preventDefault()
    const id = event.dataTransfer.getData('application/x-pdf-emote')
    if (!canEquip(store.get(), id) || !(hasIcon(id) || STARTER_IDS.includes(id))) return
    slot = Number(button.dataset.slot); selected = id
    act(p => equipEmote(p, id, slot), '已装备，轮盘配置已保存')
  })
  $('loot-close').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => { document.body.append(toast); onClose(); opener?.focus() })
  $('reset-wheel').addEventListener('click', () => act(p => { p.wheel = [...STARTER_IDS] }, '已恢复初始轮盘'))
  $('emote-search').addEventListener('input', () => { page = 0; renderCollection() })
  for (const id of ['emote-filter', 'emote-origin']) $(id).addEventListener('change', () => { page = 0; renderCollection() })
  $('emotes-prev').addEventListener('click', () => { page--; renderCollection() })
  $('emotes-next').addEventListener('click', () => { page++; renderCollection() })
  $('free-mode').addEventListener('change', () => act(p => { p.mode = $('free-mode').checked ? 'free' : 'quest'; p.wheel = usableWheel(p) }, '模式已更新；任务进度和已拥有的藏品会保留'))
  $('export-profile').addEventListener('click', () => {
    try {
      const url = URL.createObjectURL(new Blob([store.export()], { type: 'application/json' }))
      const a = document.createElement('a'); a.href = url; a.download = `阅读峡谷存档-${dayKey()}.json`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { notify(error.message) }
  })
  $('import-profile').addEventListener('click', () => $('profile-file').click())
  $('profile-file').addEventListener('change', async () => {
    const file = $('profile-file').files[0]; $('profile-file').value = ''; if (!file) return
    try {
      if (file.size > 5_000_000) throw new Error('存档文件过大')
      const raw = JSON.parse(await file.text())
      if (!confirm('导入将替换当前设备上的战利品存档。建议先导出当前存档。继续导入？')) return
      await store.restore(raw); render(); notify('存档已导入')
    } catch (error) { notify(`导入失败：${error.message}`) }
  })
  setInterval(() => { if (dialog.open && dayKey() !== shownDay) render() }, 10000)
  return {
    open(name = 'collection') { if (dialog.open) return; opener = document.activeElement; onOpen(); tab = name; render(); dialog.showModal() },
    isOpen: () => dialog.open,
    refresh() { if (dialog.open) render() },
    notify,
  }
}
