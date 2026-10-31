import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const worksDir = path.resolve("materials", "works");

const phraseReplacements = [
  ["虽有槁暴", "虽又槁曝"],
  ["輮以为轮", "煣以为轮"],
  ["輮使之然也", "煣使之然也"],
  ["则知明而行无过矣", "则智明而行无过矣"],
  ["君子生非异也", "君子性非异也"],
  ["不亦说乎", "不亦悦乎"],
  ["犹可说也", "犹可脱也"],
  ["不可说也", "不可脱也"],
  ["故患有所不辟也", "故患有所不避也"],
  ["则凡可以辟患者何不为也", "则凡可以避患者何不为也"],
  ["可以辟患", "可以避患"],
  ["万钟则不辩礼义而受之", "万钟则不辨礼义而受之"],
  ["亲戚畔之", "亲戚叛之"],
  ["曾益其所不能", "增益其所不能"],
  ["衡于虑", "横于虑"],
  ["无法家拂士", "无法家弼士"],
  ["便要还家", "便邀还家"],
  ["百废具兴", "百废俱兴"],
  ["属予作文以记之", "嘱予作文以记之"],
  ["同舍生皆被绮绣", "同舍生皆披绮绣"],
  ["诲女知之乎", "诲汝知之乎"]
];

const charReplacements = new Map([
  ["於", "于"],
  ["為", "为"],
  ["爲", "为"],
  ["與", "与"],
  ["說", "说"],
  ["説", "说"],
  ["餘", "余"],
  ["謂", "谓"],
  ["謫", "谪"],
  ["謹", "谨"],
  ["辭", "辞"],
  ["辯", "辩"],
  ["辨", "辨"],
  ["徧", "遍"],
  ["闕", "阙"],
  ["雖", "虽"],
  ["復", "复"],
  ["歸", "归"],
  ["樂", "乐"],
  ["觀", "观"],
  ["處", "处"],
  ["臺", "台"],
  ["臺", "台"],
  ["樓", "楼"],
  ["國", "国"],
  ["風", "风"],
  ["雲", "云"],
  ["龍", "龙"],
  ["馬", "马"],
  ["魚", "鱼"],
  ["鳥", "鸟"],
  ["萬", "万"],
  ["兩", "两"],
  ["無", "无"],
  ["長", "长"],
  ["門", "门"],
  ["聞", "闻"],
  ["間", "间"],
  ["難", "难"],
  ["書", "书"],
  ["學", "学"],
  ["詩", "诗"],
  ["師", "师"]
]);

const stanzaSizes = new Map([
  ["氓", 6],
  ["关雎", 4],
  ["蒹葭", 4],
  ["木兰诗", 6],
  ["卖炭翁", 8],
  ["琵琶行", 8],
  ["离骚", 8]
]);

const ciTitles = new Set([
  "虞美人",
  "念奴娇·赤壁怀古",
  "永遇乐·京口北固亭怀古",
  "相见欢",
  "渔家傲·秋思",
  "浣溪沙",
  "江城子·密州出猎",
  "水调歌头",
  "南乡子·登京口北固亭有怀",
  "破阵子·为陈同甫赋壮词以寄之",
  "天净沙·秋思",
  "山坡羊·潼关怀古",
  "满江红"
]);

const proseTitles = new Set([
  "劝学",
  "逍遥游",
  "师说",
  "阿房宫赋",
  "赤壁赋",
  "论语十二则",
  "曹刿论战",
  "鱼我所欲也",
  "河中石兽",
  "生于忧患，死于安乐",
  "得道多助，失道寡助",
  "列子一则",
  "邹忌讽齐王纳谏",
  "出师表",
  "桃花源记",
  "答谢中书书",
  "三峡",
  "马说",
  "陋室铭",
  "小石潭记",
  "岳阳楼记",
  "醉翁亭记",
  "爱莲说",
  "记承天寺夜游",
  "送东阳马生序",
  "湖心亭看雪",
  "富贵不能淫"
]);

function normalizeText(text) {
  let normalized = text
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ?([，。！？；：、]) ?/g, "$1")
    .replace(/ ?([“”‘’]) ?/g, "$1")
    .replace(/,/g, "，")
    .trim();

  for (const [from, to] of phraseReplacements) {
    normalized = normalized.split(from).join(to);
  }

  normalized = [...normalized].map((char) => charReplacements.get(char) ?? char).join("");

  return normalized;
}

function splitLine(line) {
  const parts = normalizeText(line)
    .split(/\s+/)
    .flatMap((part) => {
      if (part.length <= 58) return [part];
      return part
        .replace(/([。！？；])(?=.)/g, "$1\n")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    });
  return parts.length ? parts : [""];
}

function insertGroupedBreaks(lines, size) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    result.push(lines[index]);
    if ((index + 1) % size === 0 && index !== lines.length - 1) result.push("");
  }
  return result;
}

function segmentFullText(title, rawLines) {
  const lines = rawLines.flatMap(splitLine).filter((line) => line !== "");
  if (lines.length <= 1) return lines;

  if (stanzaSizes.has(title)) {
    return insertGroupedBreaks(lines, stanzaSizes.get(title));
  }

  if (ciTitles.has(title)) {
    if (lines.length <= 4) return insertGroupedBreaks(lines, 2);
    return insertGroupedBreaks(lines, Math.ceil(lines.length / 2));
  }

  if (proseTitles.has(title)) {
    if (title === "论语十二则") return insertGroupedBreaks(lines, 3);
    if (title === "三峡" || title === "陋室铭" || title === "爱莲说" || title === "答谢中书书") {
      return insertGroupedBreaks(lines, 3);
    }
    return insertGroupedBreaks(lines, 5);
  }

  if (lines.length === 4) return lines;
  if (lines.length === 8) return insertGroupedBreaks(lines, 4);
  if (lines.length > 8) return insertGroupedBreaks(lines, 4);
  return lines;
}

const files = (await fs.readdir(worksDir)).filter((file) => file.endsWith(".js")).sort();

for (const file of files) {
  const filePath = path.join(worksDir, file);
  const work = (await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`)).default;
  const normalizedWork = {
    ...work,
    title: normalizeText(work.title),
    author: normalizeText(work.author),
    fullText: segmentFullText(normalizeText(work.title), work.fullText)
  };

  const content = `const work = ${JSON.stringify(normalizedWork, null, 2)};\n\nexport default work;\n`;
  await fs.writeFile(filePath, content, "utf8");
}

console.log(`Normalized ${files.length} work files.`);
