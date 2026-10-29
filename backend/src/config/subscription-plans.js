
export const SUBSCRIPTION_PLANS = Object.freeze({
  pro_monthly: Object.freeze({
    id: "pro_monthly",
    tier: "pro",
    name: "PRO Monthly",
    durationMonths: 1,
    amountPaise: 49999,
    currency: "INR",
  }),

  pro_quarterly: Object.freeze({
    id: "pro_quarterly",
    tier: "pro",
    name: "PRO Quarterly",
    durationMonths: 3,
    amountPaise: 139999,
    currency: "INR",
  }),

  pro_semiannual: Object.freeze({
    id: "pro_semiannual",
    tier: "pro",
    name: "PRO Semiannual",
    durationMonths: 6,
    amountPaise: 259999,
    currency: "INR",
  }),

  pro_annual: Object.freeze({
    id: "pro_annual",
    tier: "pro",
    name: "PRO Annual",
    durationMonths: 12,
    amountPaise: 499999,
    currency: "INR",
  }),

  enterprise_semiannual: Object.freeze({
    id: "enterprise_semiannual",
    tier: "enterprise",
    name: "Enterprise Semiannual",
    durationMonths: 6,
    amountPaise: 559999,
    currency: "INR",
  }),

  enterprise_annual: Object.freeze({
    id: "enterprise_annual",
    tier: "enterprise",
    name: "Enterprise Annual",
    durationMonths: 12,
    amountPaise: 799999,
    currency: "INR",
  }),
});

export function getSubscriptionPlan(planId) {
  return SUBSCRIPTION_PLANS[planId] ?? null;
}
