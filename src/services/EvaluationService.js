import { getDatabase } from "../database/init.js";
import { SchedulingAgent } from "./SchedulingAgent.js";

const EVALUATION_TEST_CASES = [
  {
    name: "Valid Appointment Request",
    description:
      "Customer provides all information and requests valid time slot",
    category: "happy_path",
    testCase: JSON.stringify({
      messages: [
        "Hi, I need a cleaning service",
        "My name is John Smith, phone is 5551234567",
        "I need a deep clean for my 3-bedroom house",
        "How about next Monday at 2pm?",
      ],
    }),
    expectedOutcome: JSON.stringify({
      shouldBook: true,
      hasName: true,
      hasPhone: true,
      hasServiceType: true,
      hasDate: true,
      hasTime: true,
      withinBusinessHours: true,
    }),
  },
  {
    name: "Conflicting Time Request",
    description: "Customer requests time slot that is already booked",
    category: "conflict",
    testCase: JSON.stringify({
      messages: [
        "I want to book a cleaning",
        "Sarah Johnson, 5559876543",
        "Regular residential cleaning",
        "Do you have availability Monday at 10am?",
      ],
      setupConflict: {
        date: "next Monday",
        time: "10:00 AM",
      },
    }),
    expectedOutcome: JSON.stringify({
      shouldBook: false,
      offersAlternatives: true,
      explainsConflict: true,
    }),
  },
  {
    name: "Out of Business Hours",
    description: "Customer requests appointment outside business hours",
    category: "edge_case",
    testCase: JSON.stringify({
      messages: [
        "Can I get a quote?",
        "Mike Chen, 5552468135",
        "Office cleaning for small business",
        "Can you come Sunday at 8pm?",
      ],
    }),
    expectedOutcome: JSON.stringify({
      shouldBook: false,
      explainsBusinessHours: true,
      offersValidTimes: true,
      remainsPolite: true,
    }),
  },
  {
    name: "Incomplete Information",
    description: "Customer provides partial information",
    category: "clarification",
    testCase: JSON.stringify({
      messages: ["I need cleaning", "Tomorrow at 3"],
    }),
    expectedOutcome: JSON.stringify({
      shouldBook: false,
      asksForName: true,
      asksForPhone: true,
      asksForServiceType: true,
      clarifiesTomorrow: true,
    }),
  },
  {
    name: "Same Day Request",
    description: "Customer requests same-day service",
    category: "edge_case",
    testCase: JSON.stringify({
      messages: [
        "Emergency! Can you clean today?",
        "Lisa Anderson, 5553216549",
        "Move-out cleaning, 2-bedroom apartment",
        "Any time this afternoon works",
      ],
    }),
    expectedOutcome: JSON.stringify({
      handlesSameDayRequest: true,
      checksAvailability: true,
      setsExpectations: true,
    }),
  },
  {
    name: "Price Inquiry",
    description: "Customer asks about pricing before booking",
    category: "information",
    testCase: JSON.stringify({
      messages: ["How much do you charge?", "For a 3-bedroom house deep clean"],
    }),
    expectedOutcome: JSON.stringify({
      providesEstimateRange: true,
      offersFreQuote: true,
      continuesConversation: true,
    }),
  },
  {
    name: "Cancellation Request",
    description: "Customer wants to cancel existing appointment",
    category: "modification",
    testCase: JSON.stringify({
      messages: [
        "I need to cancel my appointment",
        "Name is Tom Wilson, it was scheduled for Friday at 2pm",
      ],
    }),
    expectedOutcome: JSON.stringify({
      handlesCancellation: true,
      asksForConfirmation: true,
      remainsHelpful: true,
      offersRescheduling: true,
    }),
  },
  {
    name: "Multiple Service Types",
    description: "Customer asks about multiple services",
    category: "complex",
    testCase: JSON.stringify({
      messages: [
        "Do you do both carpet and window cleaning?",
        "I need both for my house",
        "Emily Rodriguez, 5557891234",
        "Next week sometime",
      ],
    }),
    expectedOutcome: JSON.stringify({
      handlesMultipleServices: true,
      schedulesAppropriately: true,
      estimatesTime: true,
    }),
  },
  {
    name: "Vague Request",
    description: "Customer message is unclear or vague",
    category: "clarification",
    testCase: JSON.stringify({
      messages: ["Help", "Place is messy"],
    }),
    expectedOutcome: JSON.stringify({
      asksOpenEndedQuestions: true,
      guidesConversation: true,
      staysPatient: true,
    }),
  },
  {
    name: "Commercial Client",
    description: "Large commercial cleaning request",
    category: "complex",
    testCase: JSON.stringify({
      messages: [
        "We need regular commercial cleaning",
        "Office building, 5000 sq ft",
        "David Park from ABC Corp, 5554567890",
        "Need weekly service, evenings preferred",
      ],
    }),
    expectedOutcome: JSON.stringify({
      handlesCommercial: true,
      understandsRecurring: true,
      schedulesAppropriately: true,
      collectsCompanyInfo: true,
    }),
  },
];

export class EvaluationService {
  async seedTestCases() {
    const db = getDatabase();

    for (const testCase of EVALUATION_TEST_CASES) {
      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO evaluation_sets (name, description, test_case, expected_outcome, category)
          VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            testCase.name,
            testCase.description,
            testCase.testCase,
            testCase.expectedOutcome,
            testCase.category,
          ],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          },
        );

        stmt.finalize();
      });
    }

    console.log(
      `✅ Seeded ${EVALUATION_TEST_CASES.length} evaluation test cases`,
    );
  }

  async runOfflineEvaluation(
    variant = "baseline",
    experimentName = "offline_eval",
  ) {
    const db = getDatabase();

    // Get all test cases
    const testCases = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM evaluation_sets", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`\n🧪 Running offline evaluation for variant: ${variant}`);
    console.log(`📝 Test cases: ${testCases.length}\n`);

    const results = [];

    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}...`);

      const startTime = Date.now();
      const agent = new SchedulingAgent(variant);

      try {
        // Start conversation
        const sessionId = `eval-${Date.now()}`;
        const conversation = await agent.startConversation(sessionId);

        const messages = JSON.parse(testCase.test_case).messages;
        let lastResponse;
        let totalTokens = 0;
        let totalCost = 0;

        // Simulate conversation
        for (const message of messages) {
          lastResponse = await agent.chat(conversation.conversationId, message);
          totalTokens += lastResponse.metadata.tokens;
          totalCost += lastResponse.metadata.cost;
        }

        const responseTime = Date.now() - startTime;
        const expectedOutcome = JSON.parse(testCase.expected_outcome);

        // Evaluate response (simple heuristic)
        const evaluationScore = this.evaluateResponse(
          lastResponse,
          expectedOutcome,
          testCase.category,
        );

        // Log result
        await new Promise((resolve, reject) => {
          const stmt = db.prepare(`
            INSERT INTO experiment_results (
              experiment_name, variant, test_case_id, success,
              response_time_ms, tokens_used, cost_usd, evaluation_score, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            [
              experimentName,
              variant,
              testCase.id,
              evaluationScore >= 0.7 ? 1 : 0,
              responseTime,
              totalTokens,
              totalCost,
              evaluationScore,
              JSON.stringify(lastResponse),
            ],
            function (err) {
              if (err) reject(err);
              else resolve();
            },
          );

          stmt.finalize();
        });

        results.push({
          testCase: testCase.name,
          category: testCase.category,
          success: evaluationScore >= 0.7,
          score: evaluationScore,
          responseTime,
          tokens: totalTokens,
          cost: totalCost,
        });

        console.log(
          `  ✓ Score: ${(evaluationScore * 100).toFixed(0)}% | Tokens: ${totalTokens} | Cost: $${totalCost.toFixed(6)}\n`,
        );
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}\n`);

        await new Promise((resolve, reject) => {
          const stmt = db.prepare(`
            INSERT INTO experiment_results (
              experiment_name, variant, test_case_id, success,
              error_message, response_time_ms
            ) VALUES (?, ?, ?, 0, ?, ?)
          `);

          stmt.run(
            [
              experimentName,
              variant,
              testCase.id,
              error.message,
              Date.now() - startTime,
            ],
            function (err) {
              if (err) reject(err);
              else resolve();
            },
          );

          stmt.finalize();
        });

        results.push({
          testCase: testCase.name,
          category: testCase.category,
          success: false,
          error: error.message,
        });
      }
    }

    return this.generateReport(results, variant);
  }

  evaluateResponse(response, expectedOutcome, _category) {
    let score = 0;
    const checks = Object.keys(expectedOutcome);

    // Simple heuristic evaluation
    const message = response.message.toLowerCase();

    checks.forEach((check) => {
      const expected = expectedOutcome[check];

      if (check === "shouldBook" && expected === true) {
        if (response.action === "book_appointment") score += 0.3;
      } else if (check === "shouldBook" && expected === false) {
        if (response.action !== "book_appointment") score += 0.3;
      } else if (check === "hasName" && expected === true) {
        if (response.extractedData?.name) score += 0.1;
      } else if (check === "hasPhone" && expected === true) {
        if (response.extractedData?.phone) score += 0.1;
      } else if (check === "offersAlternatives" && expected === true) {
        if (message.includes("alternative") || message.includes("another time"))
          score += 0.2;
      } else if (check === "remainsPolite" && expected === true) {
        if (
          message.includes("thank") ||
          message.includes("please") ||
          message.includes("happy")
        )
          score += 0.1;
      } else if (check === "asksFor" && expected === true) {
        if (message.includes("?")) score += 0.1;
      }
    });

    return Math.min(score, 1.0);
  }

  generateReport(results, variant) {
    const totalTests = results.length;
    const successfulTests = results.filter((r) => r.success).length;
    const totalTokens = results.reduce((sum, r) => sum + (r.tokens || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgResponseTime =
      results.reduce((sum, r) => sum + (r.responseTime || 0), 0) / totalTests;
    const avgScore =
      results.reduce((sum, r) => sum + (r.score || 0), 0) / totalTests;

    const report = {
      variant,
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        successfulTests,
        successRate: (successfulTests / totalTests) * 100,
        averageScore: avgScore * 100,
        totalTokens,
        totalCost,
        avgResponseTime,
      },
      byCategory: {},
      results,
    };

    // Group by category
    results.forEach((result) => {
      if (!report.byCategory[result.category]) {
        report.byCategory[result.category] = {
          total: 0,
          successful: 0,
          avgScore: 0,
        };
      }

      report.byCategory[result.category].total++;
      if (result.success) report.byCategory[result.category].successful++;
      report.byCategory[result.category].avgScore += result.score || 0;
    });

    // Calculate category averages
    Object.keys(report.byCategory).forEach((category) => {
      const cat = report.byCategory[category];
      cat.successRate = (cat.successful / cat.total) * 100;
      cat.avgScore = (cat.avgScore / cat.total) * 100;
    });

    return report;
  }

  async runABTest(
    variantA = "baseline",
    variantB = "professional",
    experimentName = "ab_test",
  ) {
    console.log(`\n🔬 Running A/B Test: ${variantA} vs ${variantB}\n`);

    const resultA = await this.runOfflineEvaluation(
      variantA,
      `${experimentName}_${variantA}`,
    );
    const resultB = await this.runOfflineEvaluation(
      variantB,
      `${experimentName}_${variantB}`,
    );

    console.log("\n📊 A/B Test Results:\n");
    console.log(`Variant A (${variantA}):`);
    console.log(`  Success Rate: ${resultA.summary.successRate.toFixed(1)}%`);
    console.log(`  Avg Score: ${resultA.summary.averageScore.toFixed(1)}%`);
    console.log(`  Total Cost: $${resultA.summary.totalCost.toFixed(6)}`);
    console.log(
      `  Avg Response Time: ${resultA.summary.avgResponseTime.toFixed(0)}ms\n`,
    );

    console.log(`Variant B (${variantB}):`);
    console.log(`  Success Rate: ${resultB.summary.successRate.toFixed(1)}%`);
    console.log(`  Avg Score: ${resultB.summary.averageScore.toFixed(1)}%`);
    console.log(`  Total Cost: $${resultB.summary.totalCost.toFixed(6)}`);
    console.log(
      `  Avg Response Time: ${resultB.summary.avgResponseTime.toFixed(0)}ms\n`,
    );

    const winner =
      resultA.summary.averageScore > resultB.summary.averageScore
        ? variantA
        : variantB;
    const improvement = Math.abs(
      resultA.summary.averageScore - resultB.summary.averageScore,
    );

    console.log(
      `🏆 Winner: ${winner} (+${improvement.toFixed(1)}% score improvement)\n`,
    );

    return {
      variantA: resultA,
      variantB: resultB,
      winner,
      improvement,
    };
  }
}
