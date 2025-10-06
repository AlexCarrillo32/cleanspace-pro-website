#!/usr/bin/env node

import { EvaluationService } from "../src/services/EvaluationService.js";
import dotenv from "dotenv";

dotenv.config();

const command = process.argv[2];
const args = process.argv.slice(3);

const evalService = new EvaluationService();

async function main() {
  try {
    switch (command) {
      case "seed":
        console.log("🌱 Seeding evaluation test cases...\n");
        await evalService.seedTestCases();
        console.log("\n✅ Test cases seeded successfully!");
        break;

      case "eval":
        const variant = args[0] || "baseline";
        const experimentName = args[1] || `offline_eval_${Date.now()}`;
        console.log(
          `\n🧪 Running offline evaluation for variant: ${variant}\n`,
        );
        const result = await evalService.runOfflineEvaluation(
          variant,
          experimentName,
        );
        console.log("\n📊 Evaluation Report:\n");
        console.log(JSON.stringify(result, null, 2));
        break;

      case "ab-test":
        const variantA = args[0] || "baseline";
        const variantB = args[1] || "professional";
        const abTestName = args[2] || `ab_test_${Date.now()}`;
        const abResult = await evalService.runABTest(
          variantA,
          variantB,
          abTestName,
        );
        console.log("\n📊 A/B Test Complete!\n");
        console.log(JSON.stringify(abResult, null, 2));
        break;

      case "help":
      default:
        console.log(`
🧪 CleanSpace Pro - AI Agent Evaluation Tool

Usage:
  node scripts/evaluate.js <command> [args]

Commands:
  seed                          Seed evaluation test cases into database
  eval <variant> [experiment]   Run offline evaluation for a variant
                               Variants: baseline, professional, casual
  ab-test <variantA> <variantB> [experiment]
                               Run A/B test between two variants

Examples:
  node scripts/evaluate.js seed
  node scripts/evaluate.js eval baseline
  node scripts/evaluate.js eval professional my_experiment
  node scripts/evaluate.js ab-test baseline professional
  node scripts/evaluate.js ab-test baseline casual pricing_test

Environment:
  GROQ_API_KEY must be set in .env file

For more info, see the docs or run with 'help'
        `);
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
