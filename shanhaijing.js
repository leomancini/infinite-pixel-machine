// Creatures from the Classic of Mountains and Seas (山海经). Descriptions
// follow the text's own terse style: body, features, voice, and what the
// creature portends. Each has keywords: when one of them turns up in today's
// context (the weather, a holiday, a historical event, a bloom, the hour of
// day), that creature is offered to the model as a possible subject. With
// ?types=creature the display asks for one every turn instead, at random.
export const SHANHAIJING = [
  { name: "Jiuweihu", chinese: "九尾狐", about: "nine-tailed fox of Qingqiu Mountain; cries like an infant", keywords: ["fox", "infant", "baby"] },
  { name: "Dijiang", chinese: "帝江", about: "yellow sack-like bird with six legs and four wings and no face; knows how to sing and dance", keywords: ["sing", "song", "dance", "dancing", "music"] },
  { name: "Jingwei", chinese: "精卫", about: "small bird with a patterned head, white beak and red feet; carries twigs and pebbles to fill up the sea", keywords: ["sea", "ocean", "pebble", "twig", "beach", "coast"] },
  { name: "Kuafu", chinese: "夸父", about: "giant who chased the sun, drank rivers dry, and whose staff became a peach grove", keywords: ["sun", "peach", "giant", "marathon", "running"] },
  { name: "Zhulong", chinese: "烛龙", about: "red serpent with a human face; day comes when it opens its eyes and night when it closes them", keywords: ["dawn", "dusk", "sunrise", "sunset", "daybreak", "eclipse"] },
  { name: "Xiangliu", chinese: "相柳", about: "nine-headed snake whose nine heads graze nine mountains; wherever it rests becomes marsh", keywords: ["marsh", "swamp", "wetland"] },
  { name: "Bifang", chinese: "毕方", about: "one-legged bird like a crane with red markings on blue-green feathers and a white beak; brings strange fire", keywords: ["fire", "wildfire", "crane", "flame", "bonfire"] },
  { name: "Fenghuang", chinese: "凤凰", about: "five-colored phoenix of Danxue Mountain; its appearance means peace under heaven", keywords: ["phoenix", "peace", "rainbow"] },
  { name: "Lushu", chinese: "鹿蜀", about: "horse-like beast with a white head, tiger stripes and a red tail; sings like a person", keywords: ["zebra", "stripe", "striped"] },
  { name: "Xuangui", chinese: "旋龟", about: "turtle with a bird's head and a snake's tail; sounds like wood being split", keywords: ["turtle", "tortoise", "lumber", "woodcutter"] },
  { name: "Lu", chinese: "鯥", about: "fish shaped like an ox with a snake tail and wings under its ribs; lows like an ox and sleeps through winter", keywords: ["winter", "hibernate", "hibernation", "snow"] },
  { name: "Boyi", chinese: "猼訑", about: "sheep with nine tails, four ears, and eyes on its back; wearing its hide makes you fearless", keywords: ["sheep", "fearless", "courage", "brave", "bravery"] },
  { name: "Xingxing", chinese: "狌狌", about: "ape with white ears that walks upright; knows the names of people", keywords: ["ape", "name day", "roll call"] },
  { name: "Chiru", chinese: "赤鱬", about: "fish with a human face; sounds like a mandarin duck; eating it prevents scabies", keywords: ["mandarin duck", "scabies", "skin"] },
  { name: "Gudiao", chinese: "蛊雕", about: "eagle-like bird with a single horn; cries like an infant", keywords: ["eagle", "horn"] },
  { name: "Lili", chinese: "狸力", about: "pig with chicken feet; barks like a dog; appears where there will be digging", keywords: ["chicken", "dig", "digging", "excavation", "archaeology"] },
  { name: "Changyou", chinese: "长右", about: "monkey with four ears; its appearance means floods", keywords: ["flood", "flooding", "rain", "rainy", "storm", "monkey"] },
  { name: "Quru", chinese: "瞿如", about: "bird with a white head, three legs and a human face; calls its own name", keywords: [] },
  { name: "Yingzhao", chinese: "英招", about: "horse-bodied guardian with a human face, tiger stripes and bird wings; patrols the four seas", keywords: ["patrol", "guard", "guardian", "sailor", "navy"] },
  { name: "Luwu", chinese: "陆吾", about: "guardian of Kunlun with a tiger body, nine tails, a human face and tiger claws", keywords: ["kunlun", "mountain", "mountaineer"] },
  { name: "Qinyuan", chinese: "钦原", about: "bird like a bee and as big as a mandarin duck; its sting withers trees and birds", keywords: ["bee", "honey", "sting", "wasp"] },
  { name: "Tiangou", chinese: "天狗", about: "fox-like beast with a white head; its call sounds like a cat and it wards off evil", keywords: ["cat", "moon", "eclipse", "evil"] },
  { name: "Huan", chinese: "讙", about: "wildcat with one eye and three tails; can mimic a hundred sounds and wards off ill omens", keywords: ["mimic", "impression", "voice", "luck", "lucky"] },
  { name: "Wenyaoyu", chinese: "文鳐鱼", about: "fish with bird wings and blue markings and a white head and red beak; flies at night and its appearance means a rich harvest", keywords: ["harvest", "flying fish"] },
  { name: "Heluoyu", chinese: "何罗鱼", about: "fish with one head and ten bodies; barks like a dog", keywords: ["ten", "decade"] },
  { name: "Zouwu", chinese: "驺吾", about: "tiger-sized beast in five colors with a tail longer than its body; travels a thousand li in a day", keywords: ["speed", "travel", "journey", "race", "racing"] },
  { name: "Kui", chinese: "夔", about: "one-legged ox-like beast, gray-blue and hornless; it glows like sun and moon and its voice is thunder", keywords: ["thunder", "thunderstorm", "lightning", "drum"] },
  { name: "Yinglong", chinese: "应龙", about: "winged dragon who carved river channels with its tail to help Yu tame the floods", keywords: ["dragon", "river", "canal", "dam", "flood"] },
  { name: "Xiwangmu", chinese: "西王母", about: "Queen Mother of the West with a leopard's tail and tiger's teeth, wearing a jade headdress; whistles well", keywords: ["jade", "queen", "whistle", "mother"] },
  { name: "Sanzuwu", chinese: "三足乌", about: "three-legged crow that lives in the sun", keywords: ["sun", "sunny", "crow", "raven", "solstice", "clear"] },
  { name: "Manman", chinese: "蛮蛮", about: "duck-like bird with one wing and one eye; two must join to fly; its appearance means floods", keywords: ["pair", "couple", "twin", "love", "valentine", "wing"] },
  { name: "Mingshe", chinese: "鸣蛇", about: "snake with four wings; sounds like stone chimes; its appearance means drought", keywords: ["drought", "dry", "chime", "bell"] },
  { name: "Dangkang", chinese: "当康", about: "tusked pig that calls its own name; appears when the harvest will be good", keywords: ["harvest", "thanksgiving", "boar", "tusk", "crop", "farm", "farmer"] },
  { name: "Chenghuang", chinese: "乘黄", about: "fox-like beast with horns on its back; whoever rides it lives two thousand years", keywords: ["longevity", "long life", "birthday", "immortal"] },
  { name: "Huanshu", chinese: "䑏疏", about: "horse with one horn; keeps fire away", keywords: ["unicorn", "firefighter", "fire safety"] },
  { name: "Mengji", chinese: "孟极", about: "leopard with a patterned forehead and white body; good at hiding and calls its own name", keywords: ["leopard", "hide", "hiding", "hide-and-seek", "camouflage"] },
  { name: "Youyan", chinese: "幽鴳", about: "monkey-like beast with a patterned body; laughs when it sees a person and sleeps when it sees one too", keywords: ["laugh", "laughter", "joke", "comedy", "nap", "sleep"] },
  { name: "Zuzi", chinese: "足訾", about: "ape with a mane, ox tail, patterned forelegs and horse hooves; calls its own name", keywords: ["mane", "hoof", "hooves"] },
  { name: "Zhuhuai", chinese: "诸怀", about: "ox with four horns, human eyes and pig ears; sounds like a wild goose", keywords: ["goose", "geese", "cow", "cattle"] },
  { name: "Bingfeng", chinese: "并封", about: "black pig with a head at each end", keywords: ["pig", "hog", "two-headed"] },
  { name: "Bibi", chinese: "獙獙", about: "fox with wings; sounds like a wild goose; its appearance means drought", keywords: ["fox", "goose", "drought"] },
  { name: "Qiuyu", chinese: "犰狳", about: "rabbit-like beast with a bird's beak, owl eyes and snake tail; plays dead when it sees people", keywords: ["rabbit", "bunny", "owl", "armadillo", "play dead"] },
  { name: "Zhuru", chinese: "朱獳", about: "fox with fish fins; calls its own name; its appearance means fear in the land", keywords: ["fear", "scary", "spooky", "halloween", "fin"] },
  { name: "Youyou", chinese: "峳峳", about: "horse-like beast with sheep eyes, four horns and an ox tail; barks like a dog", keywords: ["sheep", "ram", "bark"] },
  { name: "Heyu", chinese: "合窳", about: "yellow pig with a human face and red tail; cries like an infant and eats snakes", keywords: ["pig", "snake", "infant"] },
  { name: "Feiyi", chinese: "肥遗", about: "snake with one head and two bodies; its appearance means great drought", keywords: ["drought", "dry", "snake"] },
  { name: "Zhujian", chinese: "诸犍", about: "leopard-like beast with a long tail, human head and ox ears and one eye; carries its tail in its mouth when it walks", keywords: ["leopard", "one eye", "cyclops"] },
  { name: "Shanhui", chinese: "山𤟤", about: "dog-like beast with a human face; good at throwing things and laughs when it sees people; moves like the wind", keywords: ["wind", "windy", "gust", "breeze", "throw", "throwing"] },
  { name: "Jiaochong", chinese: "骄虫", about: "god with a human face and two heads who rules over stinging insects", keywords: ["insect", "bug", "mosquito", "sting", "wasp"] },
  { name: "Taotie", chinese: "饕餮", about: "sheep-bodied beast with a human face, eyes under its armpits, tiger teeth and human hands; greedy and gluttonous", keywords: ["greed", "greedy", "gluttony", "glutton", "feast", "eat", "eating", "food", "hungry", "thanksgiving", "buffet"] },
  { name: "Qiongqi", chinese: "穷奇", about: "ox-like beast with hedgehog bristles, or a winged tiger; its voice is like a howling dog", keywords: ["hedgehog", "howl", "howling"] },
  { name: "Rushou", chinese: "蓐收", about: "god of autumn and the west with a human face, tiger claws and white fur, carrying an axe", keywords: ["autumn", "axe", "west"] },
  { name: "Gouwang", chinese: "句芒", about: "god of spring and the east with a bird's body and human face, riding two dragons", keywords: ["spring", "east", "sprout", "seed"] },
  { name: "Nüwa", chinese: "女娲", about: "serpent-bodied creator who patched the sky with five-colored stones", keywords: ["sky", "stone", "creation", "repair", "mend", "patch"] },
];

export function randomCreature() {
  return SHANHAIJING[Math.floor(Math.random() * SHANHAIJING.length)];
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Which creatures fit today. `facts` is a list of { label, text } describing
// the day, e.g. { label: 'the holiday "National Fox Day"', text: "National Fox
// Day - ..." }. Returns each matching creature with a `why` naming the keyword
// and the fact it matched, so the reason is visible in logs and in the prompt.
export function relevantCreatures(facts) {
  const out = [];
  for (const creature of SHANHAIJING) {
    for (const kw of creature.keywords) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}(e?s)?\\b`, "i");
      const fact = facts.find((f) => re.test(f.text));
      if (fact) {
        out.push({ ...creature, why: `"${kw}" matches ${fact.label}` });
        break;
      }
    }
  }
  return out;
}
