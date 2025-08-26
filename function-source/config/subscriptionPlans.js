const subscriptionPlans = {
  "novice": {
    planCode: "PLN_vl8h7zg3xkkp9bu",
    name: "Novice",
    amount: 15000, // R150 in kobo
    maxGrades: 1,
    features: ["1 grade access", "5 offline downloads", "10 image analyses", "AI Tutor", "Focus Mode"],
  },
  "expert": {
    planCode: "PLN_isphhseejsfdbwg",
    name: "Expert",
    amount: 20000, // R200 in kobo
    maxGrades: 2,
    features: ["2 grades access", "10 offline downloads", "15 image analyses", "AI Tutor", "Focus Mode"],
  },
  "master": {
    planCode: "PLN_tkcww6ocmby2s6l",
    name: "Master",
    amount: 30000, // R300 in kobo
    maxGrades: 5,
    features: ["All grades", "15 offline downloads", "20 image analyses", "AI Tutor overlay", "Focus Mode"],
  },
};

const getPlanByCode = (planCode) => {
  return Object.values(subscriptionPlans).find((plan) => plan.planCode === planCode);
};

const getPlanByName = (planName) => {
  const normalizedName = planName.toLowerCase();
  return subscriptionPlans[normalizedName];
};

const isValidPlan = (planCode) => {
  return Object.values(subscriptionPlans).some((plan) => plan.planCode === planCode);
};

module.exports = {
  subscriptionPlans,
  getPlanByCode,
  getPlanByName,
  isValidPlan,
};
