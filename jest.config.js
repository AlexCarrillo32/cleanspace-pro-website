export default {
  testEnvironment: "node",
  transform: {},
  testMatch: ["**/*.test.js"],
  collectCoverageFrom: ["src/**/*.js", "!src/**/*.test.js", "!src/server.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
};
