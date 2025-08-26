const express = require("express");
const {body, validationResult} = require("express-validator");
const {
  deviceOperationRateLimiter,
  deviceRegistrationRateLimiter,
} = require("../middleware/security");
const {
  authenticateUser,
  sanitizeDeviceInfo,
  logDeviceOperation,
} = require("../middleware/deviceAuth");
const {
  createUserDevice,
  getUserDevices,
  updateDeviceLastUsed,
} = require("../config/deviceDatabase");
const {
  generateDeviceId,
  autoDetectDevice,
  mergeDeviceInfo,
  validateDeviceInfo,
} = require("../utils/deviceDetection");

const router = express.Router();

const getClientIP = (req) => {
  return req.headers["x-forwarded-for"] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.headers["x-real-ip"] ||
         "127.0.0.1";
};

/**
 * Auto-register device on login/signup
 * This endpoint automatically detects device info and registers the device
 */
router.post("/auto-register-device", [
  deviceRegistrationRateLimiter,
  authenticateUser,
  sanitizeDeviceInfo,
  logDeviceOperation("auto_device_register"),
  body("device_info").optional().isObject(),
  body("force_new_device").optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const user_id = req.user.uid; // Get from authenticated user
    const {device_info: clientDeviceInfo, force_new_device = false} = req.body;
    const ipAddress = getClientIP(req);

    // Auto-detect device information from request
    const detectedDeviceInfo = autoDetectDevice(req);
    
    // Merge client-provided info with detected info
    const deviceInfo = mergeDeviceInfo(clientDeviceInfo, detectedDeviceInfo);
    
    // Validate merged device info
    const validation = validateDeviceInfo(deviceInfo);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid device information",
        errors: validation.errors,
      });
    }

    // Generate unique device ID
    const device_id = generateDeviceId(deviceInfo);

    // Check existing devices for this user
    const existingDevices = await getUserDevices(user_id);
    
    // Check if user already has a device of this type
    const mobileDevices = existingDevices.filter(d => d.device_type === 'mobile' || d.device_type === 'tablet');
    const desktopDevices = existingDevices.filter(d => d.device_type === 'desktop');
    const isNewDeviceMobile = deviceInfo.device_type === 'mobile' || deviceInfo.device_type === 'tablet';
    
    // If this is a new device and user already has this device type, handle accordingly
    if (!force_new_device) {
      if (isNewDeviceMobile && mobileDevices.length > 0) {
        // Update existing mobile device instead of creating new one
        const existingDevice = mobileDevices[0];
        await updateDeviceLastUsed(user_id, existingDevice.device_id, ipAddress);
        
        return res.json({
          success: true,
          message: "Existing mobile device updated",
          data: {
            device_id: existingDevice.device_id,
            device_name: existingDevice.device_name,
            device_type: existingDevice.device_type,
            is_new_device: false,
            is_primary_device: existingDevice.is_primary,
            last_used: new Date().toISOString(),
          },
        });
      }
      
      if (!isNewDeviceMobile && desktopDevices.length > 0) {
        // Update existing desktop device instead of creating new one
        const existingDevice = desktopDevices[0];
        await updateDeviceLastUsed(user_id, existingDevice.device_id, ipAddress);
        
        return res.json({
          success: true,
          message: "Existing desktop device updated",
          data: {
            device_id: existingDevice.device_id,
            device_name: existingDevice.device_name,
            device_type: existingDevice.device_type,
            is_new_device: false,
            is_primary_device: existingDevice.is_primary,
            last_used: new Date().toISOString(),
          },
        });
      }
    }

    // Create new device if no conflict or force_new_device is true
    const newDeviceData = await createUserDevice(user_id, device_id, deviceInfo, ipAddress);

    return res.status(201).json({
      success: true,
      message: "Device registered successfully",
      data: {
        device_id: newDeviceData.device_id,
        device_name: newDeviceData.device_name,
        device_type: newDeviceData.device_type,
        is_new_device: true,
        is_primary_device: newDeviceData.is_primary,
        registered_at: newDeviceData.registered_at.toDate().toISOString(),
        detected_info: detectedDeviceInfo,
        final_info: deviceInfo,
      },
    });
  } catch (error) {
    console.error("Auto device registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device registration",
      error: error.message,
    });
  }
});

/**
 * Simple device check endpoint for login
 * This just checks if user has any devices and creates one if not
 */
router.post("/ensure-device", [
  deviceOperationRateLimiter,
  authenticateUser,
  logDeviceOperation("ensure_device"),
  body("device_info").optional().isObject(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const user_id = req.user.uid;
    const {device_info: clientDeviceInfo} = req.body;
    const ipAddress = getClientIP(req);

    // Check if user has any devices
    const existingDevices = await getUserDevices(user_id);
    
    if (existingDevices.length > 0) {
      // User has devices, update the primary one
      const primaryDevice = existingDevices.find(d => d.is_primary) || existingDevices[0];
      await updateDeviceLastUsed(user_id, primaryDevice.device_id, ipAddress);
      
      return res.json({
        success: true,
        message: "Device found and updated",
        data: {
          device_id: primaryDevice.device_id,
          device_name: primaryDevice.device_name,
          has_devices: true,
          total_devices: existingDevices.length,
        },
      });
    }

    // No devices found, create one automatically
    const detectedDeviceInfo = autoDetectDevice(req);
    const deviceInfo = mergeDeviceInfo(clientDeviceInfo, detectedDeviceInfo);
    const device_id = generateDeviceId(deviceInfo);

    const newDeviceData = await createUserDevice(user_id, device_id, deviceInfo, ipAddress);

    return res.status(201).json({
      success: true,
      message: "First device created automatically",
      data: {
        device_id: newDeviceData.device_id,
        device_name: newDeviceData.device_name,
        has_devices: true,
        total_devices: 1,
        is_primary_device: true,
        created_at: newDeviceData.registered_at.toDate().toISOString(),
      },
    });
  } catch (error) {
    console.error("Ensure device error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device check",
      error: error.message,
    });
  }
});

/**
 * Get device detection info without saving
 * Useful for debugging what device info would be detected
 */
router.get("/detect-device", [
  deviceOperationRateLimiter,
  authenticateUser,
  logDeviceOperation("detect_device"),
], async (req, res) => {
  try {
    const detectedInfo = autoDetectDevice(req);
    
    return res.json({
      success: true,
      message: "Device information detected",
      data: {
        detected_device_info: detectedInfo,
        user_agent: req.headers['user-agent'],
        ip_address: getClientIP(req),
        headers: {
          'accept-language': req.headers['accept-language'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
        },
      },
    });
  } catch (error) {
    console.error("Device detection error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device detection",
      error: error.message,
    });
  }
});

module.exports = router;