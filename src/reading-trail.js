// The trail is a view of already-credited reading time. There is no second reward ledger.
export const LAMP_MS = 10 * 60 * 1000
const ROUTES = [
  {
    name: '萤溪谷', colors: ['#102b38', '#294950', '#34616a'],
    stops: ['溪岸渡口', '松间哨站', '旧石桥', '观星营地'],
    entries: ['河面映出了渡口的灯。', '松针之间，有了第二点暖光。', '石桥上的路已经看得清了。', '站在营地，可以望见来时的四盏灯。'],
  },
  {
    name: '薄雾山径', colors: ['#223043', '#41495a', '#54696b'],
    stops: ['雾谷入口', '杉木坡', '云间栈道', '听雨亭'],
    entries: ['晨雾里出现了一块路牌。', '坡上的灯照亮了一片杉林。', '栈道从云雾里显出了轮廓。', '雨落在亭檐上，这段山路已走完。'],
  },
  {
    name: '星落原野', colors: ['#20243f', '#393956', '#3f5969'],
    stops: ['月牙湖', '风铃林', '星影桥', '望月台'],
    entries: ['月牙湖边亮起了一盏灯。', '一阵风吹过林间的风铃。', '桥下的水面接住了星光。', '望月台的灯亮了，整条小径尽收眼底。'],
  },
]

export function readingTrail(totalMs, requestedChapter) {
  const time = Number.isFinite(totalMs) ? Math.max(0, Math.min(totalMs, Number.MAX_SAFE_INTEGER)) : 0
  const lights = Math.floor(time / LAMP_MS)
  const chapterLength = ROUTES[0].stops.length
  const currentChapter = Math.floor(lights / chapterLength)
  const chapter = Number.isInteger(requestedChapter) ? Math.max(0, Math.min(requestedChapter, currentChapter)) : currentChapter
  const route = ROUTES[chapter % ROUTES.length]
  const currentRoute = ROUTES[currentChapter % ROUTES.length]
  return {
    lights, chapter, currentChapter, route,
    litHere: Math.min(chapterLength, lights - chapter * chapterLength),
    nextStop: currentRoute.stops[lights % chapterLength],
    progressMs: time % LAMP_MS,
  }
}

const WAYPOINTS = [[92, 124], [286, 85], [484, 115], [680, 71]]
const START = [22, 152]
const STAR_POSITIONS = [[120, 23], [149, 16], [175, 31], [251, 12], [280, 22], [358, 17], [393, 30], [440, 14], [493, 27], [617, 16], [671, 23], [741, 12]]

function trees(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="#142f37" stroke="#799690" stroke-opacity=".25"><path d="M0 0l-9 16h5l-9 14H13L4 16h5z"/><path d="M17 7l-7 13h4l-7 11h20l-7-11h4z"/></g>`
}

function lantern([x, y], lit, next) {
  const color = lit ? '#f4cf85' : next ? '#91c9c7' : '#637f88'
  return `<g transform="translate(${x} ${y})" class="trail-lamp${lit ? ' is-lit' : ''}">
    ${lit ? '<circle cy="-17" r="42" fill="url(#trail-glow)"/>' : ''}
    <ellipse cy="4" rx="15" ry="4" fill="#0b1c28"/><path d="M-7 2h14M0 2v-12" stroke="${color}" stroke-width="3"/>
    <path d="M-7-23l7-6 7 6-2 12-5 3-5-3Z" fill="${lit ? '#c29153' : '#152a39'}" stroke="${color}" stroke-width="1.8"/>
    <path d="M0-21l3 5-3 4-3-4Z" fill="${color}"/><path d="M-9-23H9" stroke="${color}" stroke-width="2"/>
  </g>`
}

function trailScene(trail, resolved) {
  const { route, litHere, progressMs } = trail
  const path = [START, ...WAYPOINTS].map(point => point.join(',')).join(' ')
  const fraction = progressMs / LAMP_MS
  const previous = litHere ? WAYPOINTS[litHere - 1] : START
  const next = WAYPOINTS[litHere] || previous
  const traveler = previous.map((coordinate, index) => coordinate + (next[index] - coordinate) * fraction)
  const traveled = [START, ...WAYPOINTS.slice(0, litHere), traveler].map(point => point.join(',')).join(' ')
  const stars = STAR_POSITIONS.slice(0, resolved).map(([x, y]) => `<path data-insight-star="" transform="translate(${x} ${y})" d="M0-4 1-1 4 0 1 1 0 4-1 1-4 0-1-1Z" fill="#c6e5df"/>`).join('')
  return `<svg class="trail-scene" viewBox="0 0 780 176" role="img" aria-label="${route.name}，四处地标中已有 ${litHere} 处点亮，累计解决 ${resolved} 个疑问">
    <defs><linearGradient id="trail-sky" x2="0" y2="1"><stop stop-color="${route.colors[0]}"/><stop offset="1" stop-color="${route.colors[1]}"/></linearGradient><radialGradient id="trail-glow"><stop stop-color="#ffd786" stop-opacity=".5"/><stop offset="1" stop-color="#ffd786" stop-opacity="0"/></radialGradient></defs>
    <rect width="780" height="176" fill="url(#trail-sky)"/>
    <g fill="#c7d5c8" opacity=".65"><circle cx="72" cy="30" r="1.5"/><circle cx="200" cy="17" r="1"/><circle cx="317" cy="36" r="1.5"/><circle cx="536" cy="21" r="1"/><circle cx="636" cy="29" r="1.3"/><circle cx="719" cy="20" r="1"/></g>
    <circle cx="579" cy="34" r="14" fill="#d6d0aa" opacity=".68"/><circle cx="585" cy="30" r="13" fill="${route.colors[0]}"/>
    ${stars}
    <path d="M0 83l85-41 46 19 94-38 92 47 91-24 70 25 89-20 76 17 82-39 55 19v128H0Z" fill="${route.colors[1]}"/>
    <path d="M0 102q90-45 175-8t164-4 157 2 152-8 132-13v105H0Z" fill="${route.colors[2]}"/>
    <path d="M0 128q120-36 202-11t176-5 148 11 163-20 91-8v81H0Z" fill="#16383f"/>
    <path d="M138 176q97-35 185-25t113-10q37-16 129-9-34-17-79-20 88-7 112 18t-85 26-70 20Z" fill="#4b7d83" opacity=".75"/>
    ${trees(171, 82, .65)}${trees(346, 67, .82)}${trees(393, 91, .48)}${trees(600, 63, .65)}${trees(742, 75, 1.1)}
    <polyline points="${path}" fill="none" stroke="#a8b5a5" stroke-width="2" stroke-dasharray="4 7" opacity=".75"/>
    <polyline points="${traveled}" fill="none" stroke="#e5c282" stroke-width="2.5" stroke-linejoin="round"/>
    ${WAYPOINTS.map((point, index) => lantern(point, index < litHere, index === litHere)).join('')}
    <g transform="translate(${traveler[0] + 8} ${traveler[1] + 5})" aria-hidden="true"><ellipse cy="3" rx="7" ry="2.5" fill="#10222b"/><circle cy="-7" r="3.3" fill="#f2d2a3"/><path d="M0-5l-6 8h10z" fill="#ba7658"/><path d="M3-3l5 2" stroke="#d3b98b" stroke-width="1.7"/></g>
  </svg>`
}

export function renderTrailCard(totalMs, requestedChapter, resolved = 0) {
  const trail = readingTrail(totalMs, requestedChapter)
  const { lights, route, chapter, litHere, currentChapter } = trail
  const entry = litHere ? route.entries[litHere - 1] : '小路从这里开始。'
  const journal = litHere > 1
    ? `<details class="trail-journal"><summary>${entry}<small>沿途手记 · ${litHere} 则</small></summary><ul>${route.entries.slice(0, litHere).map((line, index) => `<li><strong>${route.stops[index]}</strong> ${line}</li>`).join('')}</ul></details>`
    : `<p class="trail-entry">${entry}</p>`
  const stops = route.stops.map((name, index) => {
    const state = index < litHere ? '已点亮' : index === litHere ? '在路上' : '待探索'
    return `<li data-trail-state="${state}"><strong>${name}</strong><span>${state}</span></li>`
  }).join('')
  return `<section id="trail-card" class="trail-card" aria-label="峡谷巡灯地图">
    <header class="trail-head"><div><span class="section-kicker">峡谷巡灯 · 第 ${chapter + 1} 程</span><h2>${route.name}</h2></div><div class="trail-totals"><span class="trail-total">共点亮 <strong>${lights}</strong> 盏</span><span title="天空展示前 ${STAR_POSITIONS.length} 颗疑问星，数字记录全部已解决疑问">已解疑问 ${resolved} 个</span></div></header>
    ${trailScene(trail, resolved)}<ol class="trail-stops">${stops}</ol>${journal}
    <footer class="trail-foot"><span>累计阅读 10 分钟点一盏灯。保存已解决的问号，夜空也会添星。</span>
      ${currentChapter > 0 ? `<div class="trail-nav"><button type="button" data-trail-chapter="${chapter - 1}" ${chapter === 0 ? 'disabled' : ''} aria-label="查看上一程">← 上一程</button><button type="button" data-trail-chapter="${chapter + 1}" ${chapter === currentChapter ? 'disabled' : ''} aria-label="查看下一程">下一程 →</button></div>` : ''}
    </footer></section>`
}
