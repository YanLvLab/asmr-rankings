const POSITIVE_SIGNALS = [
  [/(助眠|入睡|睡眠|失眠|晚安|催眠)/iu, 5, '明确助眠意图'],
  [/(sleep|insomnia|bedtime|fall asleep|deep sleep)/iu, 5, '明确睡眠意图'],
  [/(无人声|无说话|no talking|耳语|轻语|whisper)/iu, 3, '低刺激声音形式'],
  [/(掏耳|采耳|耳部|ear cleaning|ear massage|ear to ear)/iu, 2, '耳部触发音'],
  [/(敲击|触发音|摩擦音|刷麦|口腔音|tapping|trigger|scratching|brushing|mouth sounds?)/iu, 2, '典型 ASMR 触发'],
  [/(放松|解压|舒缓|治愈|relax|calm|soothing|tingles?)/iu, 2, '放松用途'],
  [/(角色扮演|情景模拟|roleplay|personal attention)/iu, 1, '沉浸式角色扮演'],
]

const HARD_REJECT = [
  [/(\breaction\b|\breacts? to\b|反应视频|看.*反应)/iu, '反应类内容'],
  [/(\breview\b|\bunboxing\b|测评|评测|开箱)/iu, '测评或开箱内容'],
  [/(\bparody\b|\bmeme\b|搞笑|恶搞|整活)/iu, '恶搞娱乐内容'],
  [/(\bchallenge\b|挑战|忍笑)/iu, '挑战类内容'],
  [/(\bexplained\b|科普|原理|为什么|教程|教学)/iu, '讨论或教学内容'],
  [/(\bgameplay\b|\bgaming\b|游戏实况|解说)/iu, '游戏或解说内容'],
  [/(\bshorts?\b|短视频|片段|高能剪辑|混剪|\bcut\b)/iu, '短片或剪辑内容'],
  [/(搬运|转载|合集搬运|去人声版|爱豆助眠|疯荐)/iu, '疑似二次搬运内容'],
  [/(舔耳|舌技|色气|福利|哥哥|主人|女友|男友|辣妹|深夜.*护士|舒服到发抖|sexy|sensual)/iu, '疑似擦边或高刺激内容'],
  [/(幼女|未成年|萝莉|小老婆|耳舐|耳舔|耳吻|耳責め|耳キス|ear\s?lick(?:ing)?|ear\s?kiss(?:ing)?|妩媚|腿软|えち|えっち)/iu, '成人暗示或未成年人相关内容'],
  [/(末日|囤货|庇护所|生存挑战)/iu, '剧情或生存内容而非助眠'],
  [/(音乐视频|music video|mv\b|舞蹈|dance cover)/iu, '音乐或舞蹈内容'],
  [/(吃播|咀嚼|美食|食谱|食音|甜品|甜点|零食|蛋糕|巧克力|马卡龙|大福|芋泥|泡面|火锅|做饭|烹饪|鸡汤|炒饭|汤面|mukbang|eating sounds?|cooking|recipe)/iu, '美食或吃播内容'],
  [/(商品链接|下单|购买|优惠券|带货|睡眠呼吸机|重力眼罩)/iu, '商品或广告内容'],
  [/(切皂|切金属|切玻璃|切植物|海绵|史莱姆|slime|soap cutting)/iu, '解压展示而非助眠内容'],
]

const CATEGORY_RULES = [
  ['无人声', /(无人声|无说话|no talking)/iu],
  ['耳语', /(耳语|轻语|whisper)/iu],
  ['敲击', /(敲击|tapping)/iu],
  ['掏耳', /(掏耳|采耳|ear cleaning|ear massage)/iu],
  ['角色扮演', /(角色扮演|情景模拟|roleplay|personal attention)/iu],
  ['口腔音', /(口腔音|mouth sounds?)/iu],
  ['刷麦', /(刷麦|mic brushing|brushing)/iu],
  ['环境音', /(雨声|白噪音|环境音|rain sounds?|white noise|ambient)/iu],
]

export function stripMarkup(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseClockDuration(value = '') {
  const parts = String(value).split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

export function parseIsoDuration(value = '') {
  const match = String(value).match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i)
  if (!match) return 0
  return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0)
}

export function hardRejectReasons(candidate) {
  const title = stripMarkup(candidate.title)
  const description = stripMarkup(candidate.description)
  const tags = Array.isArray(candidate.tags) ? candidate.tags.join(' ') : String(candidate.tags || '')
  const creatorName = stripMarkup(candidate.creatorName)
  const rejectText = `${title} ${tags}`
  const durationSeconds = Number(candidate.durationSeconds || 0)
  const rejects = []
  for (const [pattern, label] of HARD_REJECT) {
    if (pattern.test(rejectText)) rejects.push(label)
  }
  if (/(收藏|搬运|转载|疯荐|助眠合集|reupload|archive)/iu.test(creatorName)) {
    rejects.push('疑似聚合或搬运账号')
  }
  if (candidate.platform === 'bilibili' && /(?:youtube\.com\/watch\?|youtu\.be\/)[\w?=&-]+/iu.test(description)) {
    rejects.push('简介标注 YouTube 原视频，疑似转载')
  }
  if (durationSeconds < 180) rejects.push('时长不足 3 分钟')
  return [...new Set(rejects)]
}

export function screenCandidate(candidate) {
  const title = stripMarkup(candidate.title)
  const description = stripMarkup(candidate.description)
  const tags = Array.isArray(candidate.tags) ? candidate.tags.join(' ') : String(candidate.tags || '')
  const creatorName = stripMarkup(candidate.creatorName)
  const text = `${title} ${description} ${tags}`
  const durationSeconds = Number(candidate.durationSeconds || 0)
  const reasons = []
  const rejects = hardRejectReasons(candidate)
  let score = 0

  if (!/asmr/iu.test(text)) rejects.push('缺少 ASMR 主体标识')
  else score += 2

  if (durationSeconds >= 1200) {
    score += 2
    reasons.push('适合长时间收听')
  } else if (durationSeconds >= 180) {
    score += 1
    reasons.push('达到 3 分钟收录门槛')
  }

  for (const [pattern, weight, label] of POSITIVE_SIGNALS) {
    if (pattern.test(text)) {
      score += weight
      reasons.push(label)
    }
  }

  const hasExplicitSleepIntent = POSITIVE_SIGNALS[0][0].test(text) || POSITIVE_SIGNALS[1][0].test(text)
  if (!hasExplicitSleepIntent) rejects.push('没有明确的睡眠或助眠意图')

  const categories = CATEGORY_RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  if (categories.length === 0) categories.push('综合触发')

  const approved = rejects.length === 0 && score >= 9
  return {
    approved,
    confidence: Math.max(0, Math.min(99, 48 + score * 4 - rejects.length * 15)),
    categories,
    reasons: approved ? [...new Set(reasons)].slice(0, 4) : [...new Set(rejects)],
  }
}
