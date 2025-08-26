const express = require("express");
const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ success: true, message: "Simple device routes are working!" });
});

router.get("/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Device routes health check", 
    timestamp: new Date().toISOString()
  });
});

module.exports = router;