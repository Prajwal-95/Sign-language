// WCAG contrast verification for the new warm palette.
// Run: node contrast-check.mjs

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lin = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const lum = (h) => {
  const [r, g, b] = hex(h)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const P = {
  ivory: '#FFF5ED',
  peach: '#FBE8DC',
  blush: '#F7E1D5',
  cream: '#FFFAF6',
  nude: '#F3D5C5',
  beige: '#EBD5C8',
  beigeDeep: '#D9BCA9',
  ink: '#292321',
  ink2: '#6D5D56',
  inkMutedSpec: '#88766D',
  inkMuted: '#7A6960', // muted text is restricted to cream/ivory surfaces
  brand600: '#05634D',
  brand500: '#078B68',
  teal600: '#0A6A65',
  violet600: '#6143C9',
  coral700: '#A02F19',
  warn: '#8A4E08',
  danger: '#A81E16',
  ok: '#05634D',
  controlBorder: '#AE8B72',
}

const surfaces = ['cream', 'ivory', 'peach', 'blush', 'nude']
const text = [
  ['ink', 'ink', 4.5],
  ['ink2', 'ink2', 4.5],
  ['inkMuted', 'muted', 4.5],
  ['brand600', 'brand600', 4.5],
  ['teal600', 'teal600', 4.5],
  ['violet600', 'violet600', 4.5],
  ['coral700', 'coral700', 4.5],
  ['warn', 'warn', 4.5],
  ['danger', 'danger', 4.5],
]

let fails = 0
console.log('TEXT vs SURFACE (need >= 4.5 for normal text)\n')
console.log('NOTE: muted is only ever placed on cream/ivory; ink/ink2 everywhere.\n')
for (const [key, name, min] of text) {
  const applicable = name === 'muted' ? ['cream', 'ivory'] : surfaces
  const row = surfaces.map((s) => `${s}:${ratio(P[key], P[s]).toFixed(2)}`)
  const worst = Math.min(...applicable.map((s) => ratio(P[key], P[s])))
  const ok = worst >= min
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(9)} ${row.join('  ')}   worst=${worst.toFixed(2)}`)
}

console.log('\nSPEC MUTED #88766D vs surfaces (for comparison)')
for (const s of surfaces) {
  const r = ratio(P.inkMutedSpec, P[s])
  console.log(`      ${s.padEnd(7)} ${r.toFixed(2)} ${r >= 4.5 ? 'AA' : 'below AA'}`)
}

console.log('\nBUTTON LABELS (white text on gradient stops, need >= 4.5)\n')
const buttons = [
  ['primary', ['#0A8071', '#078269', '#055E4C']],
  ['violet', ['#7A5BEE', '#6A48D6', '#583AAE']],
  ['coral (dark text)', ['#FF9D8B', '#FF8371', '#F26A57'], '#4A1710'],
  ['danger', ['#D03A2E', '#BB241B', '#A31A12']],
  ['secondary (ink text)', ['#FFFAF6', '#FBF3EC'], '#292321'],
]
for (const [name, stops, fg = '#FFFFFF'] of buttons) {
  const row = stops.map((s) => ratio(s, fg))
  const worst = Math.min(...row)
  const ok = worst >= 4.5
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${row.map((r) => r.toFixed(2)).join('  ')}   worst=${worst.toFixed(2)}`)
}

console.log('\nCALLOUT TEXT (need >= 4.5)\n')
const callouts = [
  ['info', '#4A3268', '#F4EFF7'],
  ['warn', '#7A4405', '#FDF0E3'],
  ['danger', '#8C2F1C', '#FCEDE8'],
  ['ok', '#1F5A44', '#EFF6F1'],
]
for (const [name, fg, bg] of callouts) {
  const r = ratio(fg, bg)
  const ok = r >= 4.5
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(8)} ${r.toFixed(2)}  (${fg} on ${bg})`)
}

console.log('\nPILL TEXT (need >= 4.5)\n')
const pills = [
  ['ok pill', '#1F5A44', '#EFF6F1'],
  ['warn pill', '#7A4405', '#FDF0E3'],
  ['danger pill', '#8C2F1C', '#FCEDE8'],
  ['info pill', '#4A3268', '#F4EFF7'],
  ['neutral pill', '#292321', '#FFFAF6'],
]
for (const [name, fg, bg] of pills) {
  const r = ratio(fg, bg)
  const ok = r >= 4.5
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} ${r.toFixed(2)}`)
}

console.log('\nNON-TEXT / UI (need >= 3.0 for borders, icons, meter fills)\n')
const ui = [
  ['brand500 on ivory', '#078B68', '#FFF5ED', 3],
  ['card border on cream', '#EBD5C8', '#FFFAF6', 1.2],
  ['card border on peach band', '#EBD5C8', '#FBE8DC', 1.2],
  ['control border on cream', '#AE8B72', '#FFFAF6', 3],
  ['camera frame vs ivory', '#241C18', '#FFF5ED', 3],
  ['beigeDeep rail vs cream', '#D9BCA9', '#FFFAF6', 1.2],
]
for (const [name, fg, bg, min] of ui) {
  const r = ratio(fg, bg)
  const ok = r >= min
  if (!ok && min >= 3) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} ${r.toFixed(2)} (min ${min})`)
}

console.log(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`)