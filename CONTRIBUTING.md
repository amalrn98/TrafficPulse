# Contributing to TrafficPulse

Thank you for your interest in contributing to **TrafficPulse**! We are building the open-source standard for web traffic classification in the agentic era.

## Code of Conduct
We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please be respectful and constructive in discussions and reviews.

## Getting Started

1. **Fork the Repository**:
   Fork [TrafficPulse on GitHub](https://github.com/mythicavalon/TrafficPulse) and clone your fork locally.

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Package Builds**:
   ```bash
   npm run build --workspace=@trafficpulse/classifier
   npm run build --workspace=@trafficpulse/tracker
   npm run build --workspace=@trafficpulse/middleware
   ```

4. **Run Tests**:
   ```bash
   npm run test --workspace=@trafficpulse/classifier
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

## Adding New Bot Signatures

If you discover a new AI crawler, search engine, or autonomous agent:
1. Navigate to [`packages/classifier/src/signatures.ts`](packages/classifier/src/signatures.ts).
2. Add the regex rule, category, actor family, and intent profile.
3. Add a corresponding test case in [`packages/classifier/tests/classifier.test.ts`](packages/classifier/tests/classifier.test.ts).
4. Run `npm test` to ensure all tests pass.

## Pull Request Guidelines

- Create a feature branch (`git checkout -b feat/new-agent-detector`).
- Follow standard conventional commits (`feat: ...`, `fix: ...`, `docs: ...`).
- Ensure all tests pass and code compiles with zero TypeScript errors.
- Open a PR against the `main` branch.
