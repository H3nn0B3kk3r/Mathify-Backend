const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-paystack-signature"],
  credentials: false,
};

app.use(cors(corsOptions));
app.use(morgan("combined"));

app.use("/paystack-webhook", require("./routes/webhooks"));

app.use(express.json({limit: "10mb"}));
app.use(express.urlencoded({extended: true, limit: "10mb"}));

// Auth/Device auto-registration routes (must come first)
app.use("/api/auth", require("./routes/auth"));

// Device management routes (must come first to avoid conflicts) 
app.use("/api/device", require("./routes/devices"));

// Payment routes 
app.use("/", require("./routes/payments"));

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Mathify Paystack Backend is running on Firebase Functions",
    timestamp: new Date().toISOString(),
    environment: "production",
    version: "1.0.5",
    project: "mathify-b05be",
  });
});

app.get("/api/device-test", (req, res) => {
  res.json({
    success: true,
    message: "Direct device route test works!",
    timestamp: new Date().toISOString(),
  });
});

// Test device detection without auth
app.get("/test-device-detection", (req, res) => {
  const { autoDetectDevice } = require("./utils/deviceDetection");
  
  try {
    const detectedInfo = autoDetectDevice(req);
    
    return res.json({
      success: true,
      message: "Device detection test (no auth required)",
      data: {
        detected_device_info: detectedInfo,
        user_agent: req.headers['user-agent'],
        ip_address: req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown",
        headers: {
          'accept-language': req.headers['accept-language'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
        },
      },
    });
  } catch (error) {
    console.error("Device detection test error:", error);
    res.status(500).json({
      success: false,
      message: "Device detection test failed",
      error: error.message,
    });
  }
});

app.get("/plans", (req, res) => {
  const {subscriptionPlans} = require("./config/subscriptionPlans");

  const publicPlans = Object.keys(subscriptionPlans).map((key) => ({
    name: subscriptionPlans[key].name,
    amount: subscriptionPlans[key].amount,
    maxGrades: subscriptionPlans[key].maxGrades,
    features: subscriptionPlans[key].features,
  }));

  res.json({
    success: true,
    message: "Available subscription plans",
    data: publicPlans,
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

exports.api = functions.runWith({
  timeoutSeconds: 300,
  memory: "512MB",
}).https.onRequest(app);
