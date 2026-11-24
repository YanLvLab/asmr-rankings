// Stable channel IDs curated for the female-led listening category.
// The platform APIs do not expose creator gender. Unknown channels stay unlabelled.
// New videos from these IDs inherit the label automatically.
const FEMALE_LED_IDS = {
  youtube: new Set([
    'UCD_wbYHQeVbx_utWokhFdEw', // Jocie B ASMR
    'UCmZb4LwQRhEzZX5Uqpcqziw', // Coromo Sara. ASMR
    'UCAtFkapSeoEGPxm5bC3tvaw', // ASMR PPOMO
    'UC6gLlIAnzg7eJ8VuXDCZ_vg', // Gentle Whispering ASMR
    'UCxw_JBZaRWtL6JKvyxdUx5g', // Celaine's ASMR
    'UCDH70xAv1bBeaCt5Cc7a96A', // ASMR Bakery
    'UCQe2Y7V-C9bNMAcCJCBvzQQ', // Latte ASMR
    'UCFmL725KKPx2URVPvH3Gp8w', // ASMR Glow
    'UCJyZfWrqaGX4nwXGKOEdM6Q', // Nanou ASMR
    'UCpoV0ZE0-D4cmkeuFxaSzMw', // Joyceful Tingles
    'UCftD_LCuDAwlPipnM6Uikqw', // Moonlight Cottage ASMR
    'UCXTAGLo2UWlOwNMpbEkyBOw', // Whispering Willow ASMR
    'UCgUBjMqA_IZQVFdEElvPHDA', // Luna Bloom ASMR
    'UCcDB-dzjhlZLMmJVL6eVTYQ', // Ana Aster ASMR
    'UCR3m5LGZuqORVdUZ1KaieYg', // Karuna Satori ASMR
    'UCT-0BP5tI1Dzc49_8TYgPYw', // Batala's ASMR
    'UC_ARaeDGHVLAqi6whEWQRTg', // Ozley ASMR
    'UC2nyigZS5YNDrCu_pih809w', // WhispersRed ASMR
    'UCXHIwO5ze7cKuqgs5u8XQUQ', // Angelic Lofi ASMR
    'UCRz3cGfqeMPSHMBN6CxKQ9w', // ASMR Cham
    'UCFsmoWCbExiMFwkKaVmEyvg', // Rapunzel ASMR
    'UCdvYSTbhmzWgWyfGnhet03Q', // Diddly ASMR
    'UCrxcXof70PR7U-8iSnVY8mg', // Kaitlyn Fall Asmr
    'UCzPW2uxfH6QOFYDaDJFWMAA', // ALB in whisperland ASMR
    'UCBsVm9XFIPhnyerJiSlCv5g', // cait ASMR
    'UCjdrWVupyh91KleqCSuXgzQ', // Nefertiti ASMR
    'UCDwR_uew-XkbO0RjUAgrUug', // Sarah Lavender ASMR
    'UC7wT_mqUvCHEIWm1cuw_T1Q', // Bluewhisper
    'UCfg27yDA92WI1YsJNS3OLTQ', // Cherie Lorraine ASMR
    'UCBlFGjzJltu27T2osSMU6ag', // Simply Kel
    'UC6t5_BHeMjMTZF-67Tc1aEg', // ASMR Belle
    'UCvqzioHYJNDMclUJBVXV-7g', // SleepyMaimy
    'UC9yxsCVXisGo6_kLbZixmWg', // King Caitlin ASMR
    'UC_n9r4yRVXusIa6Cabl4wDw', // ASMR_Divinity
    'UC5smpi-a8gH6FOCvC3hCXGg', // Indian ASMR Bhumika
    'UCq4SxeS6WxeeyxlXMEUIpYg', // MaeveASMR
    'UCxVy6w2y7XIn3HzG4feDLWw', // The ASMR Psychologist
    'UC3ji9FB5-cxhgbK86pzJ_uQ', // Aviva Sofia ASMR
    'UCPCju5TA11PlMkhc74pqe4A', // ASMR Fleur
    'UCdWWgW0ksGxBxIB3liEyw7Q', // DizzyKitten ASMR
    'UCwLt7f-9Zi1SB2TeABeYjXQ', // EmilyCTaylor ASMR
    'UCpkQm9ZhCoNn6HIPcdWPE9Q', // opal's ASMR
    'UCqj8_jkIiKdYcmjayHNYNmQ', // Grace John ASMR
    'UCgY_10CZLYT-Z-QFsmt6t-A', // Caitlyn ASMR
    'UCwqBbG4EWR-GP6jFlcZZN3A', // Luna_ASMRtist
    'UCylkbI1HNj_WZTOKBCJTy8w', // ASMR Eira
  ]),
  bilibili: new Set([
    '921044', // 是Sumimi呀
    '1367633', // ASMR-Misa喵老师
    '171331609', // YUE的晚安陪伴
    '670363050', // 清水芽衣
    '28278764', // 织月黛黛
    '5651823', // 嘉儿哄睡屋
    '1836747262', // 劳拉的枕头
    '176647698', // JYsASMR
    '1686198949', // 小奈别失眠
    '33623955', // 桥桥Erio
    '689904', // 展展展不开
    '621124274', // 茜茜助眠屋
    '1660069605', // 月亮不装睡_助眠
    '335999707', // 琴音澪
  ]),
}

const SELF_DESCRIPTION = /(?:女性主理|女声主播|女主播|小姐姐助眠|female[- ]led asmr|woman[- ]led asmr)/iu

export function femaleLedProfile(platform, creatorId, creatorName = '') {
  if (FEMALE_LED_IDS[platform]?.has(String(creatorId))) return 'curated-channel'
  if (SELF_DESCRIPTION.test(creatorName)) return 'channel-self-description'
  return null
}

export function annotateHostProfiles(data) {
  for (const platform of ['youtube', 'bilibili']) {
    for (const creator of data.creators?.[platform] || []) {
      creator.femaleHostEvidence = femaleLedProfile(platform, creator.id, creator.name)
      creator.femaleHost = Boolean(creator.femaleHostEvidence)
    }
    const byId = new Map((data.creators?.[platform] || []).map((creator) => [String(creator.id), creator]))
    for (const video of data.videos?.[platform] || []) {
      const creator = byId.get(String(video.creatorId))
      video.femaleHost = creator?.femaleHost || false
    }
  }
  return data
}
