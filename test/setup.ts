import { afterAll, afterEach, beforeAll } from "vitest";
import { resetDemoMarket } from "../src/mocks/handlers";
import { server } from "../src/mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetDemoMarket();
});
afterAll(() => server.close());
