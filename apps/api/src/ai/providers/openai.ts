import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { ExtractionResultSchema, type ExtractionResult } from "@tixly/shared";
import { env } from "../../lib/env.js";
import {
  CLARIFICATION_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  buildClarificationUserPrompt,
  buildExtractionUserPrompt,
} from "../prompts.js";
import type { ClarificationInput, ExtractionInput, LLMProvider } from "./llm.js";

const ClarificationReplySchema = z.object({ reply: z.string() });

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey = env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    this.client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  }

  async extractTicket(input: ExtractionInput): Promise<ExtractionResult> {
    const userContent = buildExtractionUserPrompt(input);

    const run = async (): Promise<ExtractionResult> => {
      const response = await this.client.responses.parse(
        {
          model: env.OPENAI_MODEL,
          input: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          text: {
            format: zodTextFormat(ExtractionResultSchema, "ticket_extraction"),
          },
        },
        { signal: input.signal },
      );

      const parsed = response.output_parsed;
      if (!parsed) {
        throw new Error("Model returned empty structured output");
      }
      return ExtractionResultSchema.parse(parsed);
    };

    try {
      return await run();
    } catch (err) {
      if (input.signal?.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        err instanceof Error &&
        (err.name === "AbortError" || /aborted|abort/i.test(msg))
      ) {
        throw err;
      }

      if (/api key|401|403|429|invalid_api_key|insufficient/i.test(msg)) {
        throw err;
      }
      console.warn("OpenAI extract failed, retrying once:", err);
      return await run();
    }
  }

  async phraseClarification(input: ClarificationInput): Promise<string> {
    const response = await this.client.responses.parse(
      {
        model: env.OPENAI_MODEL,
        input: [
          { role: "system", content: CLARIFICATION_SYSTEM_PROMPT },
          { role: "user", content: buildClarificationUserPrompt(input) },
        ],
        text: {
          format: zodTextFormat(ClarificationReplySchema, "clarification_reply"),
        },
      },
      { signal: input.signal },
    );
    const reply = response.output_parsed?.reply?.trim();
    if (!reply) throw new Error("Model returned an empty clarification");
    return reply;
  }
}
