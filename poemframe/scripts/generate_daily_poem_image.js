import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import poemSchedule from "../../games/poem-schedule.js";
import { gaokaoWorks } from "../materials/gaokao_works.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const apiKey = process.env.OPENAI_API_KEY;

const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const generationSize = process.env.OPENAI_IMAGE_SIZE ?? "1280x768";
const requestTimeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? 5 * 60 * 1000);
const dailyOutputFile = path.join(repoRoot, "每日古诗词.png");

const gaokaoPoems = gaokaoWorks;

function getArgValue(name) {
  const prefix = `${name}=`;
  const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) return inlineArg.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1];

  return null;
}

function getPositionalWorks() {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

function normalizeLookupValue(value) {
  return value.replace(/\s+/g, "").replace(/[《》]/g, "").toLowerCase();
}

function findPoemByName(name) {
  const normalizedName = normalizeLookupValue(name);
  const poem = gaokaoPoems.find((candidate) => {
    const title = normalizeLookupValue(candidate.title);
    const sourceFile = normalizeLookupValue(candidate.sourceFile ?? "");
    return title === normalizedName || sourceFile === normalizedName || sourceFile.endsWith(`${normalizedName}.js`);
  });

  if (!poem) {
    throw new Error(`Could not find poem: ${name}`);
  }

  return poem;
}

const todayKey = poemSchedule.today();
const poemIndex = poemSchedule.indexForDate(todayKey, gaokaoPoems.length);
const requestedWorks = (process.env.POEM_WORKS ?? getArgValue("--work") ?? getPositionalWorks().join(","))
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const selectedPoems = requestedWorks.length > 0 ? requestedWorks.map(findPoemByName) : [gaokaoPoems[poemIndex]];
const shouldWriteDailyOutput =
  requestedWorks.length === 0 || process.env.UPDATE_DAILY_OUTPUT === "1" || process.argv.includes("--update-daily");

function getPoemOutputFile(selectedPoem) {
  const sourceTitle = selectedPoem.sourceFile
    ?.replace(/\.js$/i, "")
    .replace(/^\d+[a-z]*\./i, "")
    .trim();
  const outputTitle = sourceTitle || selectedPoem.title;
  const safeTitle = outputTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
  return path.join(repoRoot, `${safeTitle}.png`);
}

function createPrompt(selectedPoem) {
  if (!Array.isArray(selectedPoem.fullText) || selectedPoem.fullText.length === 0) {
    throw new Error(`Poem ${selectedPoem.title} is missing fullText.`);
  }

  const poemText = selectedPoem.fullText
    .map((line) => (line.trim() ? `  ${line}` : ""))
    .join("\n");

  return `
帮我给这首古诗文生成一张 800x480 的白底水墨风设计感海报。整体避免极细线条。标题竖排。必需包含译文，译文长度不超过 60 个汉字。若版面拥挤，可使用上下排版，上面是诗名和正文，下面是译文。

标题：《${selectedPoem.title}》
作者：${selectedPoem.author}
正文：
${poemText}
`;
}

if (process.argv.includes("--dry-run") || process.env.DRY_RUN === "1") {
  for (const selectedPoem of selectedPoems) {
    console.log(`Selected: ${selectedPoem.title} / ${selectedPoem.author}`);
    if (shouldWriteDailyOutput) console.log(`Daily output: ${dailyOutputFile}`);
    console.log(`Poem output: ${getPoemOutputFile(selectedPoem)}`);
    console.log(createPrompt(selectedPoem).trim());
    console.log("\n---\n");
  }
  process.exit(0);
}

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required.");
}

const { default: sharp } = await import("sharp");

for (const selectedPoem of selectedPoems) {
  const prompt = createPrompt(selectedPoem);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      prompt,
      size: generationSize,
      n: 1
    })
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI image generation failed for ${selectedPoem.title}: ${response.status} ${body}`);
  }

  const result = await response.json();
  const imageBase64 = result?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`OpenAI image generation response for ${selectedPoem.title} did not include data[0].b64_json.`);
  }

  const imageBuffer = Buffer.from(imageBase64, "base64");
  const posterBuffer = await sharp(imageBuffer)
    .resize(800, 480, {
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();

  if (shouldWriteDailyOutput) {
    await fs.writeFile(dailyOutputFile, posterBuffer);
    await fs.writeFile(path.join(repoRoot, "daily-poem.json"), JSON.stringify({
      date: todayKey, generatedAt: new Date().toISOString(), title: selectedPoem.title, author: selectedPoem.author,
      fullText: selectedPoem.fullText, image: path.basename(dailyOutputFile)
    }, null, 2) + "\n");
    console.log(`Generated ${dailyOutputFile}`);
  }

  const poemOutputFile = getPoemOutputFile(selectedPoem);
  await fs.writeFile(poemOutputFile, posterBuffer);
  console.log(`Generated ${poemOutputFile}`);
}
