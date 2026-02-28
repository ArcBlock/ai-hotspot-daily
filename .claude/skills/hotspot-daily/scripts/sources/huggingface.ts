import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const HF_API = "https://huggingface.co/api/models";

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/huggingface.json";
  const limit = parseInt(args.limit || "20", 10);

  const errors: string[] = [];
  const items: SourceItem[] = [];

  try {
    const url = `${HF_API}?sort=trendingScore&direction=-1&limit=${limit * 2}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HuggingFace API error: ${res.status}`);

    const models: any[] = await res.json();

    for (const model of models) {
      if (model.private) continue;
      if (items.length >= limit) break;

      items.push({
        id: `hf-${model.modelId}`,
        title: model.modelId,
        url: `https://huggingface.co/${model.modelId}`,
        source: "huggingface",
        category: "release",
        score: model.likes,
        publishedAt: model.lastModified || model.createdAt,
        extra: {
          downloads: model.downloads,
          pipelineTag: model.pipeline_tag,
          library: model.library_name,
          tags: (model.tags || []).slice(0, 10),
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch HuggingFace: ${err}`);
  }

  const output = createSourceOutput("huggingface", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} trending models from HuggingFace`);
}

main();
