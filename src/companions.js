// Layers are views of the reader's existing, credited activity. Switching a companion never awards XP.
export const COMPANIONS = {
  smolder: {
    name: '小火龙', fullName: '小火龙 · 斯莫德', unit: '龙之研习',
    rule: '每累计有效阅读 5 分钟，获得 1 层龙之研习。',
    forms: [[0, '龙蛋'], [1, '破壳'], [5, '展翼'], [15, '吐焰']],
  },
  sol: {
    name: '龙王', fullName: '铸星龙王 · 奥瑞利安·索尔', unit: '星尘',
    rule: '每累计有效阅读 10 分钟获得 1 层星尘。首次在一篇文献的新页面保存标记，另得 1 层。',
    forms: [[0, '星种'], [1, '初星'], [6, '星轨'], [18, '星冠']],
  },
  harvest: {
    name: '黑暗收割', fullName: '黑暗收割', unit: '灵魂',
    rule: '写下问号的疑问和理解，标为已解决并保存 PDF。每个不同的问号收获 1 层灵魂。',
    forms: [[0, '余烬'], [1, '魂火'], [3, '双焰'], [8, '幽冠']],
  },
}

export function companionId(id) {
  return typeof id === 'string' && Object.hasOwn(COMPANIONS, id) ? id : 'lantern'
}

export function companionState(profile, choice = profile.companion) {
  const id = companionId(choice)
  if (id === 'lantern') return null
  const spec = COMPANIONS[id]
  let layers
  if (id === 'smolder') layers = Math.floor(profile.totalMs / 300000)
  else if (id === 'harvest') layers = profile.reviewReceipts.length
  else {
    const pages = new Set()
    for (const day of Object.values(profile.days)) for (const page of day.pages) pages.add(page)
    layers = Math.floor(profile.totalMs / 600000) + pages.size
  }
  const stage = spec.forms.findLastIndex(([threshold]) => layers >= threshold)
  return { ...spec, id, layers, stage, form: spec.forms[stage][1], next: spec.forms[stage + 1] }
}
