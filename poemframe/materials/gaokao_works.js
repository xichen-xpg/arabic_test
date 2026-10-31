import fs from "node:fs/promises";
import vm from "node:vm";

// The website and poster generator use the same ordered collection.
const source = await fs.readFile(new URL("../../games/daily-poems.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
export const gaokaoWorks = context.window.dailyPoemWorks;
for (const work of gaokaoWorks) {
  const count = (work.fullText.join("").match(/\p{Script=Han}/gu) || []).length;
  if (!count || count > 60) throw new Error(`Work must contain 1-60 Han characters: ${work.title}`);
}
