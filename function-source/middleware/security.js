const rateLimit = require("express-rate-limit");

const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, message = "Too many requests") => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

const paymentRateLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    10, // 10 requests per window
    "Too many payment requests. Please try again later.",
);

const webhookRateLimiter = createRateLimiter(
    1 * 60 * 1000, // 1 minute
    100, // 100 requests per minute
    "Too many webhook requests.",
);

const deviceOperationRateLimiter = createRateLimiter(
    1 * 60 * 1000, // 1 minute
    10, // 10 device operations per minute
    "Too many device operations. Please try again later.",
);

const deviceRegistrationRateLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    3, // 3 registrations per 15 minutes
    "Too many device registration attempts. Please try again later.",
);

const deviceRemovalRateLimiter = createRateLimiter(
    60 * 60 * 1000, // 1 hour
    5, // 5 removals per hour
    "Too many device removal attempts. Please try again later.",
);

const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers["x-paystack-signature"];

  if (!signature) {
    return res.status(400).json({
      success: false,
      message: "Missing webhook signature",
    });
  }

  const {verifyWebhookSignature: verifySignature} = require("../config/paystack");

  if (!verifySignature(req.body, signature)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  next();
};

module.exports = {
  paymentRateLimiter,
  webhookRateLimiter,
  deviceOperationRateLimiter,
  deviceRegistrationRateLimiter,
  deviceRemovalRateLimiter,
  verifyWebhookSignature,
};
