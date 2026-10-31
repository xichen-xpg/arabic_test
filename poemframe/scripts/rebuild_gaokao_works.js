import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const worksDir = path.join(repoRoot, "materials", "works");

const sourceUrls = {
  gaokao64: "https://app.gaokaozhitongche.com/news/6237",
  lawool: "https://lawool.com/data/poems.json"
};

const works = [
  ["劝学", "荀子", ["劝学"]],
  ["逍遥游", "庄子", ["逍遥游"]],
  ["师说", "韩愈", ["师说"]],
  ["阿房宫赋", "杜牧", ["阿房宫赋"]],
  ["赤壁赋", "苏轼", ["赤壁赋"]],
  ["氓", "《诗经》", ["卫风氓", "氓"]],
  ["离骚", "屈原", ["离骚"]],
  ["蜀道难", "李白", ["蜀道难"]],
  ["登高", "杜甫", ["登高"]],
  ["琵琶行", "白居易", ["琵琶行", "琵琶行并序"]],
  ["锦瑟", "李商隐", ["锦瑟"]],
  ["虞美人", "李煜", ["虞美人", "虞美人春花秋月何时了"]],
  ["念奴娇·赤壁怀古", "苏轼", ["念奴娇赤壁怀古"]],
  ["永遇乐·京口北固亭怀古", "辛弃疾", ["永遇乐京口北固亭怀古"]],
  ["关雎", "《诗经》", ["关雎"]],
  ["蒹葭", "《诗经》", ["蒹葭"]],
  ["早春呈水部张十八员外", "韩愈", ["早春呈水部张十八员外"]],
  ["观沧海", "曹操", ["观沧海"]],
  ["饮酒", "陶渊明", ["饮酒"]],
  ["木兰诗", "佚名", ["木兰诗"]],
  ["送杜少府之任蜀州", "王勃", ["送杜少府之任蜀川", "送杜少府之任蜀州"]],
  ["登幽州台歌", "陈子昂", ["登幽州台歌"]],
  ["次北固山下", "王湾", ["次北固山下"]],
  ["使至塞上", "王维", ["使至塞上"]],
  ["闻王昌龄左迁龙标遥有此寄", "李白", ["闻王昌龄左迁龙标遥有此寄"]],
  ["行路难", "李白", ["行路难"]],
  ["观刈麦", "白居易", ["观刈麦"]],
  ["望岳", "杜甫", ["望岳"]],
  ["春望", "杜甫", ["春望"]],
  ["茅屋为秋风所破歌", "杜甫", ["茅屋为秋风所破歌"]],
  ["白雪歌送武判官归京", "岑参", ["白雪歌送武判官归京", "白雪歌迭武判官归京"]],
  ["酬乐天扬州初逢席上见赠", "刘禹锡", ["酬乐天扬州初逢席上见赠"]],
  ["卖炭翁", "白居易", ["卖炭翁"]],
  ["钱塘湖春行", "白居易", ["钱塘湖春行"]],
  ["雁门太守行", "李贺", ["雁门太守行"]],
  ["赤壁", "杜牧", ["赤壁"]],
  ["泊秦淮", "杜牧", ["泊秦淮"]],
  ["夜雨寄北", "李商隐", ["夜雨寄北"]],
  ["无题", "李商隐", ["无题"]],
  ["相见欢", "李煜", ["相见欢"]],
  ["渔家傲·秋思", "范仲淹", ["渔家傲", "渔家傲秋思"]],
  ["浣溪沙", "晏殊", ["浣溪沙"]],
  ["登飞来峰", "王安石", ["登飞来峰"]],
  ["江城子·密州出猎", "苏轼", ["江城子密州出猎"]],
  ["水调歌头", "苏轼", ["水调歌头"]],
  ["游山西村", "陆游", ["游山西村"]],
  ["南乡子·登京口北固亭有怀", "辛弃疾", ["南乡子登京口北固亭有怀"]],
  ["破阵子·为陈同甫赋壮词以寄之", "辛弃疾", ["破阵子"]],
  ["过零丁洋", "文天祥", ["过零丁洋"]],
  ["天净沙·秋思", "马致远", ["天净沙秋思"]],
  ["山坡羊·潼关怀古", "张养浩", ["山坡羊潼关怀古"]],
  ["己亥杂诗", "龚自珍", ["己亥杂诗"]],
  ["满江红", "秋瑾", ["满江红"]],
  ["《论语》十二则", "孔子弟子及再传弟子", ["论语十二章", "论语十二则", "孔子语录"]],
  ["曹刿论战", "左丘明", ["曹刿论战"]],
  ["鱼我所欲也", "孟子", ["鱼我所欲也"]],
  ["河中石兽", "纪昀", ["河中石兽"]],
  ["生于忧患，死于安乐", "孟子", ["生于忧患死于安乐"]],
  ["得道多助，失道寡助", "孟子", ["得道多助失道寡助"]],
  ["《列子》一则", "列子", ["列子一则", "伯牙善鼓琴"]],
  ["邹忌讽齐王纳谏", "《战国策》", ["邹忌讽齐王纳谏"]],
  ["出师表", "诸葛亮", ["出师表"]],
  ["桃花源记", "陶渊明", ["桃花源记"]],
  ["答谢中书书", "陶弘景", ["答谢中书书"]],
  ["三峡", "郦道元", ["三峡"]],
  ["马说", "韩愈", ["马说"]],
  ["陋室铭", "刘禹锡", ["陋室铭"]],
  ["小石潭记", "柳宗元", ["小石潭记"]],
  ["岳阳楼记", "范仲淹", ["岳阳楼记"]],
  ["醉翁亭记", "欧阳修", ["醉翁亭记"]],
  ["爱莲说", "周敦颐", ["爱莲说"]],
  ["记承天寺夜游", "苏轼", ["记承天寺夜游"]],
  ["送东阳马生序", "宋濂", ["送东阳马生序"]],
  ["湖心亭看雪", "张岱", ["湖心亭看雪"]],
  ["富贵不能淫", "孟子", ["富贵不能淫"]]
];

const supplementalTexts = new Map(
  [
    ["《论语》十二则", [
      "子曰：“学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？”",
      "曾子曰：“吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？”",
      "子曰：“吾十有五而志于学，三十而立，四十而不惑，五十而知天命，六十而耳顺，七十而从心所欲，不逾矩。”",
      "子曰：“温故而知新，可以为师矣。”",
      "子曰：“学而不思则罔，思而不学则殆。”",
      "子曰：“贤哉，回也！一箪食，一瓢饮，在陋巷，人不堪其忧，回也不改其乐。贤哉，回也！”",
      "子曰：“知之者不如好之者，好之者不如乐之者。”",
      "子曰：“饭疏食饮水，曲肱而枕之，乐亦在其中矣。不义而富且贵，于我如浮云。”",
      "子曰：“三人行，必有我师焉。择其善者而从之，其不善者而改之。”",
      "子在川上曰：“逝者如斯夫，不舍昼夜。”",
      "子曰：“三军可夺帅也，匹夫不可夺志也。”",
      "子夏曰：“博学而笃志，切问而近思，仁在其中矣。”"
    ]],
    ["木兰诗", [
      "唧唧复唧唧，木兰当户织。不闻机杼声，唯闻女叹息。",
      "问女何所思，问女何所忆。女亦无所思，女亦无所忆。",
      "昨夜见军帖，可汗大点兵，军书十二卷，卷卷有爷名。",
      "阿爷无大儿，木兰无长兄，愿为市鞍马，从此替爷征。",
      "",
      "东市买骏马，西市买鞍鞯，南市买辔头，北市买长鞭。",
      "旦辞爷娘去，暮宿黄河边，不闻爷娘唤女声，但闻黄河流水鸣溅溅。",
      "旦辞黄河去，暮至黑山头，不闻爷娘唤女声，但闻燕山胡骑鸣啾啾。",
      "",
      "万里赴戎机，关山度若飞。",
      "朔气传金柝，寒光照铁衣。",
      "将军百战死，壮士十年归。",
      "",
      "归来见天子，天子坐明堂。",
      "策勋十二转，赏赐百千强。",
      "可汗问所欲，木兰不用尚书郎，愿驰千里足，送儿还故乡。",
      "",
      "爷娘闻女来，出郭相扶将；阿姊闻妹来，当户理红妆；小弟闻姊来，磨刀霍霍向猪羊。",
      "开我东阁门，坐我西阁床。",
      "脱我战时袍，著我旧时裳。",
      "当窗理云鬓，对镜帖花黄。",
      "出门看火伴，火伴皆惊忙：同行十二年，不知木兰是女郎。",
      "",
      "雄兔脚扑朔，雌兔眼迷离。",
      "双兔傍地走，安能辨我是雄雌？"
    ]],
    ["登幽州台歌", [
      "前不见古人，后不见来者。",
      "念天地之悠悠，独怆然而涕下。"
    ]],
    ["卖炭翁", [
      "卖炭翁，伐薪烧炭南山中。",
      "满面尘灰烟火色，两鬓苍苍十指黑。",
      "卖炭得钱何所营？身上衣裳口中食。",
      "可怜身上衣正单，心忧炭贱愿天寒。",
      "夜来城外一尺雪，晓驾炭车辗冰辙。",
      "牛困人饥日已高，市南门外泥中歇。",
      "",
      "翩翩两骑来是谁？黄衣使者白衫儿。",
      "手把文书口称敕，回车叱牛牵向北。",
      "一车炭，千余斤，宫使驱将惜不得。",
      "半匹红纱一丈绫，系向牛头充炭直。"
    ]],
    ["南乡子·登京口北固亭有怀", [
      "何处望神州？满眼风光北固楼。",
      "千古兴亡多少事？悠悠。不尽长江滚滚流。",
      "",
      "年少万兜鍪，坐断东南战未休。",
      "天下英雄谁敌手？曹刘。生子当如孙仲谋。"
    ]],
    ["满江红", [
      "小住京华，早又是中秋佳节。",
      "为篱下黄花开遍，秋容如拭。",
      "四面歌残终破楚，八年风味徒思浙。",
      "苦将侬强派作蛾眉，殊未屑！",
      "",
      "身不得，男儿列，心却比，男儿烈。",
      "算平生肝胆，因人常热。",
      "俗子胸襟谁识我？英雄末路当磨折。",
      "莽红尘何处觅知音？青衫湿！"
    ]],
    ["河中石兽", [
      "沧州南一寺临河干，山门圮于河，二石兽并沉焉。",
      "阅十余岁，僧募金重修，求二石兽于水中，竟不可得，以为顺流下矣。",
      "棹数小舟，曳铁钯，寻十余里无迹。",
      "",
      "一讲学家设帐寺中，闻之笑曰：“尔辈不能究物理。是非木杮，岂能为暴涨携之去？乃石性坚重，沙性松浮，湮于沙上，渐沉渐深耳。沿河求之，不亦颠乎？”",
      "众服为确论。",
      "",
      "一老河兵闻之，又笑曰：“凡河中失石，当求之于上流。盖石性坚重，沙性松浮，水不能冲石，其反激之力，必于石下迎水处啮沙为坎穴，渐激渐深，至石之半，石必倒掷坎穴中。如是再啮，石又再转。转转不已，遂反溯流逆上矣。求之下流，固颠；求之地中，不更颠乎？”",
      "如其言，果得于数里外。",
      "然则天下之事，但知其一，不知其二者多矣，可据理臆断欤？"
    ]],
    ["得道多助，失道寡助", [
      "天时不如地利，地利不如人和。",
      "三里之城，七里之郭，环而攻之而不胜。",
      "夫环而攻之，必有得天时者矣；然而不胜者，是天时不如地利也。",
      "",
      "城非不高也，池非不深也，兵革非不坚利也，米粟非不多也；委而去之，是地利不如人和也。",
      "",
      "故曰：域民不以封疆之界，固国不以山溪之险，威天下不以兵革之利。",
      "得道者多助，失道者寡助。",
      "寡助之至，亲戚畔之；多助之至，天下顺之。",
      "以天下之所顺，攻亲戚之所畔，故君子有不战，战必胜矣。"
    ]],
    ["《列子》一则", [
      "伯牙善鼓琴，钟子期善听。",
      "伯牙鼓琴，志在高山，钟子期曰：“善哉，峨峨兮若泰山！”",
      "志在流水，钟子期曰：“善哉，洋洋兮若江河！”",
      "伯牙所念，钟子期必得之。",
      "",
      "伯牙游于泰山之阴，卒逢暴雨，止于岩下；心悲，乃援琴而鼓之。",
      "初为霖雨之操，更造崩山之音。",
      "曲每奏，钟子期辄穷其趣。",
      "伯牙乃舍琴而叹曰：“善哉，善哉，子之听夫！志想象犹吾心也。吾于何逃声哉？”"
    ]],
    ["答谢中书书", [
      "山川之美，古来共谈。",
      "高峰入云，清流见底。",
      "两岸石壁，五色交辉。",
      "青林翠竹，四时俱备。",
      "晓雾将歇，猿鸟乱鸣；夕日欲颓，沉鳞竞跃。",
      "实是欲界之仙都。",
      "自康乐以来，未复有能与其奇者。"
    ]],
    ["湖心亭看雪", [
      "崇祯五年十二月，余住西湖。",
      "大雪三日，湖中人鸟声俱绝。",
      "是日更定矣，余拏一小舟，拥毳衣炉火，独往湖心亭看雪。",
      "雾凇沆砀，天与云与山与水，上下一白。",
      "湖上影子，惟长堤一痕、湖心亭一点、与余舟一芥、舟中人两三粒而已。",
      "",
      "到亭上，有两人铺毡对坐，一童子烧酒炉正沸。",
      "见余，大喜曰：“湖中焉得更有此人！”",
      "拉余同饮。余强饮三大白而别。",
      "问其姓氏，是金陵人，客此。",
      "及下船，舟子喃喃曰：“莫说相公痴，更有痴似相公者！”"
    ]],
    ["富贵不能淫", [
      "景春曰：“公孙衍、张仪岂不诚大丈夫哉？一怒而诸侯惧，安居而天下熄。”",
      "",
      "孟子曰：“是焉得为大丈夫乎？子未学礼乎？",
      "丈夫之冠也，父命之；女子之嫁也，母命之，往送之门，戒之曰：‘往之女家，必敬必戒，无违夫子！’",
      "以顺为正者，妾妇之道也。",
      "居天下之广居，立天下之正位，行天下之大道。",
      "得志，与民由之；不得志，独行其道。",
      "富贵不能淫，贫贱不能移，威武不能屈。此之谓大丈夫。”"
    ]]
  ]
);

function normalizeTitle(value) {
  return value
    .replace(/[《》〈〉]/g, "")
    .replace(/[·?？\s（）()，,。:：、\-—]/g, "")
    .replace(/其[一二三四五六七八九十]/g, "")
    .replace(/节选|并序|春花秋月何时了|大江东去|千古江山|秋思|密州出猎|为陈同甫赋壮词以寄之/g, "")
    .trim();
}

function safeFileName(title) {
  return title.replace(/[《》<>:"/\\|?*\u0000-\u001f]/g, "").trim();
}

function displayTitle(title) {
  return title.replace(/[《》]/g, "").trim();
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function cleanText(value) {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[（(][a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɡǹń\s]+[）)]/g, "")
    .replace(/登录高考直通车APP[\s\S]*$/g, "")
    .replace(/查看完整试题答案[\s\S]*$/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toLines(value) {
  return cleanText(value)
    .split("\n")
    .flatMap((line) => splitLongLine(line.trim()))
    .filter((line, index, lines) => line || lines[index - 1]);
}

function splitLongLine(line) {
  if (!line) return [""];
  if (line.length <= 90) return [line];
  return line
    .replace(/([。！？；])\s*/g, "$1\n")
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseGaokao64(text) {
  const sections = new Map();
  const cleaned = cleanText(text);
  const entryPattern = /(?:^|\n)\s*\d+[、.]\s*(.{1,50}?）)([\s\S]*?)(?=\n\s*\d+[、.]|\n二、高中课程标准|\n登录高考直通车APP|$)/g;
  let match;

  while ((match = entryPattern.exec(cleaned))) {
    const heading = match[1].trim();
    const body = match[2]
      .replace(/^《[^》]+》/, "")
      .trim();
    sections.set(normalizeTitle(heading), body);
  }
  return sections;
}

function parseLawool(items) {
  const sections = new Map();
  for (const item of items) {
    const original = item?.content?.original_text;
    if (!original) continue;
    sections.set(normalizeTitle(item.title), original);
    sections.set(normalizeTitle(item.content.title), original);
  }
  return sections;
}

function pickText(work, sources) {
  const [title, , aliases] = work;
  const candidates = [title, ...aliases].map(normalizeTitle);

  if (supplementalTexts.has(title)) {
    return supplementalTexts.get(title);
  }

  for (const key of candidates) {
    if (sources.gaokao64.has(key)) return toLines(sources.gaokao64.get(key));
  }

  for (const [key, value] of sources.gaokao64) {
    if (candidates.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
      return toLines(value);
    }
  }

  for (const key of candidates) {
    if (sources.lawool.has(key)) return toLines(sources.lawool.get(key));
  }

  for (const [key, value] of sources.lawool) {
    if (candidates.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
      return toLines(value);
    }
  }

  return null;
}

async function fetchUtf8(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

const [gaokao64Html, lawoolJson] = await Promise.all([
  fetchUtf8(sourceUrls.gaokao64),
  fetchUtf8(sourceUrls.lawool)
]);

const sources = {
  gaokao64: parseGaokao64(htmlToText(gaokao64Html)),
  lawool: parseLawool(JSON.parse(lawoolJson))
};

const missing = [];
await fs.mkdir(worksDir, { recursive: true });

for (const [index, work] of works.entries()) {
  const [rawTitle, author] = work;
  const title = displayTitle(rawTitle);
  const fullText = pickText(work, sources);
  if (!fullText?.length) {
    missing.push(title);
    continue;
  }

  const material = { title, author, fullText };
  const fileName = `${String(index + 1).padStart(3, "0")}.${safeFileName(title)}.js`;
  const content = `const work = ${JSON.stringify(material, null, 2)};\n\nexport default work;\n`;
  await fs.writeFile(path.join(worksDir, fileName), content, "utf8");
}

if (missing.length) {
  throw new Error(`Missing fullText for: ${missing.join(", ")}`);
}

console.log(`Wrote ${works.length} work files.`);
