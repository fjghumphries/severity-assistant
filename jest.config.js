/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/ui"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // Deliberately NOT `ui/tsconfig.json` -- that config targets the browser bundle
        // (module: ESNext, moduleResolution: bundler) which ts-jest cannot run directly under
        // Jest's CommonJS test runtime. This is a self-contained override for the compiler's
        // pure-function unit tests only; it does not affect `npm run build`.
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          jsx: "react",
          strictNullChecks: true,
          target: "es2020",
          types: ["node", "jest"],
        },
      },
    ],
  },
};
