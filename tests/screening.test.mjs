import test from 'node:test'
import assert from 'node:assert/strict'
import { parseClockDuration, parseIsoDuration, screenCandidate, stripMarkup } from '../scripts/screening.mjs'

test('accepts an explicit long-form sleep ASMR video', () => {
  const result = screenCandidate({
    title: 'ASMR 无人声助眠｜轻柔敲击与刷麦，陪你入睡',
    description: '适合失眠的夜晚，持续舒缓触发音。',
    tags: 'asmr,助眠,无人声,敲击',
    durationSeconds: 3600,
  })
  assert.equal(result.approved, true)
  assert.ok(result.categories.includes('无人声'))
})

test('rejects a reaction video despite the ASMR tag', () => {
  const result = screenCandidate({
    title: '第一次看 ASMR 助眠视频的反应 challenge',
    description: '搞笑 reaction',
    tags: 'asmr,助眠',
    durationSeconds: 1800,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('反应') || reason.includes('挑战')))
})

test('rejects tag stuffing without sleep intent', () => {
  const result = screenCandidate({
    title: 'ASMR 键盘开箱测评',
    description: '新键盘声音展示',
    tags: 'asmr',
    durationSeconds: 1800,
  })
  assert.equal(result.approved, false)
})

test('rejects videos under three minutes', () => {
  const result = screenCandidate({
    title: 'ASMR 无人声助眠敲击',
    description: '帮助放松入睡',
    tags: 'asmr,助眠,睡眠',
    durationSeconds: 179,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('3 分钟')))
})

test('rejects suggestive high-stimulation content', () => {
  const result = screenCandidate({
    title: 'ASMR 助眠 舒服到发抖的舔耳福利',
    description: '哥哥晚安，长时间放松内容',
    tags: 'asmr,助眠,睡眠',
    durationSeconds: 3600,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('擦边')))
})

test('rejects newly observed suggestive and unrelated search results', () => {
  for (const title of [
    'ASMR 打劫幼女反被吸到腿软，睡前故事',
    '极寒末日来临前躲进超市庇护所｜ASMR 助眠',
  ]) {
    assert.equal(screenCandidate({ title, tags: 'asmr,助眠', durationSeconds: 1800 }).approved, false)
  }
})

test('rejects likely republishing channels', () => {
  const result = screenCandidate({
    title: 'ASMR 无人声助眠，放松入睡',
    description: '长时间耳语和敲击触发',
    tags: 'asmr,助眠,睡眠',
    creatorName: 'YouTube助眠收藏馆',
    durationSeconds: 3600,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('搬运')))
})

test('rejects a Bilibili video that links to its YouTube source', () => {
  const result = screenCandidate({
    platform: 'bilibili',
    title: 'ASMR 无人声助眠，轻柔敲击让你放松入睡',
    description: '原视频 https://www.youtube.com/watch?v=ABC123xyz',
    tags: 'asmr,助眠,睡眠',
    creatorName: '睡前好声音',
    durationSeconds: 3600,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('YouTube 原视频')))
})

test('rejects food videos that stuff ASMR sleep keywords', () => {
  const result = screenCandidate({
    title: 'ASMR 助眠 中式蔬菜炒饭 cooking sounds',
    description: '睡前美食食谱',
    tags: 'asmr,助眠,睡眠',
    durationSeconds: 900,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('美食')))
})

test('rejects dessert eating sounds despite sleep wording', () => {
  const result = screenCandidate({
    title: 'ASMR 助眠 甜品食音纯享｜抹茶生巧和马卡龙',
    description: '治愈轻语，陪你入睡',
    tags: 'asmr,助眠,睡眠',
    durationSeconds: 1200,
  })
  assert.equal(result.approved, false)
  assert.ok(result.reasons.some((reason) => reason.includes('美食')))
})

test('parses platform durations', () => {
  assert.equal(parseClockDuration('1:02:03'), 3723)
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723)
  assert.equal(stripMarkup('<em>ASMR</em>  助眠'), 'ASMR 助眠')
})
