const {body, validationResult} = require("express-validator");

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

const validateInitializeSubscription = [
  body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
  body("plan_name")
      .isIn(["novice", "expert", "master"])
      .withMessage("Plan name must be novice, expert, or master"),
  body("user_id")
      .notEmpty()
      .isLength({min: 1, max: 128})
      .withMessage("User ID is required and must be valid"),
  body("customer_name")
      .optional()
      .isLength({min: 1, max: 100})
      .withMessage("Customer name must be between 1-100 characters"),
  handleValidationErrors,
];

const validateVerifyPayment = [
  body("reference")
      .notEmpty()
      .isAlphanumeric()
      .withMessage("Payment reference is required and must be alphanumeric"),
  body("user_id")
      .notEmpty()
      .isLength({min: 1, max: 128})
      .withMessage("User ID is required"),
  handleValidationErrors,
];

const validateWebhook = [
  body("event")
      .notEmpty()
      .withMessage("Event is required"),
  body("data")
      .isObject()
      .withMessage("Data must be an object"),
  handleValidationErrors,
];

const validateCancelSubscription = [
  body("user_id")
      .notEmpty()
      .isLength({min: 1, max: 128})
      .withMessage("User ID is required"),
  body("subscription_code")
      .notEmpty()
      .isLength({min: 1, max: 50})
      .withMessage("Subscription code is required"),
  body("token")
      .optional()
      .isLength({min: 1, max: 100})
      .withMessage("Token must be valid if provided"),
  handleValidationErrors,
];

module.exports = {
  validateInitializeSubscription,
  validateVerifyPayment,
  validateWebhook,
  validateCancelSubscription,
};
