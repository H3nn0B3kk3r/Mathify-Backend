const admin = require("firebase-admin");

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required",
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

const validateUserAccess = (req, res, next) => {
  try {
    const userIdFromBody = req.body.user_id;
    const userIdFromParams = req.params.userId;
    const targetUserId = userIdFromBody || userIdFromParams;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (req.user.uid !== targetUserId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Cannot access other users' device data",
      });
    }

    next();
  } catch (error) {
    console.error("User access validation error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during access validation",
    });
  }
};

const sanitizeDeviceInfo = (req, res, next) => {
  try {
    if (req.body.device_info) {
      const deviceInfo = req.body.device_info;

      const sanitizedDeviceInfo = {
        device_name: String(deviceInfo.device_name || "").substring(0, 100),
        device_type: ["mobile", "tablet", "desktop"].includes(deviceInfo.device_type) ?
            deviceInfo.device_type : "mobile",
        os_version: String(deviceInfo.os_version || "").substring(0, 50),
        app_version: String(deviceInfo.app_version || "").substring(0, 20),
        manufacturer: String(deviceInfo.manufacturer || "").substring(0, 50),
        model: String(deviceInfo.model || "").substring(0, 100),
        screen_resolution: String(deviceInfo.screen_resolution || "")
            .substring(0, 20),
        timezone: String(deviceInfo.timezone || "").substring(0, 50),
        locale: String(deviceInfo.locale || "").substring(0, 10),
      };

      req.body.device_info = sanitizedDeviceInfo;
    }

    next();
  } catch (error) {
    console.error("Device info sanitization error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during input sanitization",
    });
  }
};

const logDeviceOperation = (operation) => {
  return (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.json;

    res.json = function(data) {
      const duration = Date.now() - startTime;
      const logData = {
        timestamp: new Date().toISOString(),
        operation,
        user_id: req.body.user_id || req.params.userId,
        device_id: req.body.device_id || req.body.to_device_id,
        ip_address: req.headers["x-forwarded-for"] ||
            req.connection.remoteAddress,
        user_agent: req.headers["user-agent"],
        success: data.success,
        duration: `${duration}ms`,
        status_code: res.statusCode,
      };

      console.log("Device Operation Log:", JSON.stringify(logData));

      return originalSend.call(this, data);
    };

    next();
  };
};

module.exports = {
  authenticateUser,
  validateUserAccess,
  sanitizeDeviceInfo,
  logDeviceOperation,
};
