/**
 * Wall-clock budget for one tool call. /mcp is public and unauthenticated; the defence against
 * being used as a free ODE solver is not a distributed rate limiter (serverless has no shared
 * state) but a hard cap on what a single request may cost. Long-running kernel loops accept a
 * `checkpoint` callback and call it regularly; the tool layer hands them one that throws
 * BudgetExceeded once the deadline has passed, and turns that into a readable isError result.
 */
export class BudgetExceeded extends Error {
  constructor(
    readonly budgetMs: number,
    readonly elapsedMs: number,
  ) {
    super(`computation budget of ${budgetMs} ms exceeded after ${Math.round(elapsedMs)} ms`);
    this.name = "BudgetExceeded";
  }
}

/** Returns a checkpoint function that throws BudgetExceeded once `budgetMs` have elapsed. */
export function makeCheckpoint(budgetMs: number, now: () => number = () => performance.now()): () => void {
  const start = now();
  const deadline = start + budgetMs;
  return () => {
    const t = now();
    if (t > deadline) throw new BudgetExceeded(budgetMs, t - start);
  };
}
