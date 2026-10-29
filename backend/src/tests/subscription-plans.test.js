
import { describe, expect, it } from "vitest";

import {
  SUBSCRIPTION_PLANS,
  getSubscriptionPlan,
} from "../config/subscription-plans.js";

describe("subscription plan catalogue", () => {
  it("contains six configured plans", () => {
    expect(Object.keys(SUBSCRIPTION_PLANS)).toHaveLength(6);
  });

  it("uses integer paise amounts", () => {
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
      expect(Number.isSafeInteger(plan.amountPaise)).toBe(true);
      expect(plan.amountPaise).toBeGreaterThan(0);
      expect(plan.currency).toBe("INR");
    }
  });

  it("returns null for an unknown plan", () => {
    expect(getSubscriptionPlan("unknown_plan")).toBeNull();
  });

  it("does not expose mutable plan configuration", () => {
    expect(Object.isFrozen(SUBSCRIPTION_PLANS)).toBe(true);

    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
      expect(Object.isFrozen(plan)).toBe(true);
    }
  });
});
