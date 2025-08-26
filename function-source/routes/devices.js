const express = require("express");
const {body, param, validationResult} = require("express-validator");
const {
  deviceOperationRateLimiter,
  deviceRegistrationRateLimiter,
  deviceRemovalRateLimiter,
} = require("../middleware/security");
const {
  authenticateUser,
  validateUserAccess,
  sanitizeDeviceInfo,
  logDeviceOperation,
} = require("../middleware/deviceAuth");
const {
  createUserDevice,
  getUserDevices,
  getDeviceById,
  updateDeviceLastUsed,
  removeUserDevice,
  getDeviceRemovalQuota,
  createDeviceSwitch,
  getDeviceSwitchHistory,
  replaceUserDevice,
} = require("../config/deviceDatabase");

const router = express.Router();

// Simple test endpoint without middleware
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Device routes are working!" });
});

const getClientIP = (req) => {
  return req.headers["x-forwarded-for"] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.headers["x-real-ip"] ||
         "127.0.0.1";
};

const deviceInfoValidation = [
  body("device_info.device_name").notEmpty().isLength({max: 100}).trim(),
  body("device_info.device_type").isIn(["mobile", "tablet", "desktop"]),
  body("device_info.os_version").notEmpty().isLength({max: 50}).trim(),
  body("device_info.app_version").notEmpty().isLength({max: 20}).trim(),
  body("device_info.manufacturer").notEmpty().isLength({max: 50}).trim(),
  body("device_info.model").notEmpty().isLength({max: 100}).trim(),
  body("device_info.screen_resolution").optional().isLength({max: 20}).trim(),
  body("device_info.timezone").optional().isLength({max: 50}).trim(),
  body("device_info.locale").optional().isLength({max: 10}).trim(),
];

router.post("/verify", [
  deviceOperationRateLimiter,
  authenticateUser,
  sanitizeDeviceInfo,
  validateUserAccess,
  logDeviceOperation("device_verify"),
  body("user_id").notEmpty().isLength({max: 50}).trim().escape(),
  body("device_id").notEmpty().isLength({max: 100}).trim().escape(),
  ...deviceInfoValidation,
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

    const {user_id, device_id, device_info} = req.body;
    const ipAddress = getClientIP(req);

    const existingDevice = await getDeviceById(user_id, device_id);
    const allUserDevices = await getUserDevices(user_id);

    if (existingDevice) {
      await updateDeviceLastUsed(user_id, device_id, ipAddress);

      return res.json({
        success: true,
        message: "Device verified successfully",
        data: {
          is_verified: true,
          is_primary_device: existingDevice.is_primary,
          device_name: existingDevice.device_name,
          registered_at: existingDevice.registered_at.toDate().toISOString(),
          last_used: existingDevice.last_used.toDate().toISOString(),
          requires_approval: false,
          conflict_device: null,
        },
      });
    }

    // Check for device type conflicts (allow 1 mobile + 1 desktop)
    const mobileDevices = allUserDevices.filter(d => d.device_type === 'mobile' || d.device_type === 'tablet');
    const desktopDevices = allUserDevices.filter(d => d.device_type === 'desktop');
    const newDeviceIsMobile = device_info.device_type === 'mobile' || device_info.device_type === 'tablet';
    
    if (newDeviceIsMobile && mobileDevices.length > 0) {
      const conflictDevice = mobileDevices[0];
      return res.json({
        success: true,
        message: "Mobile device verification required - existing mobile device found",
        data: {
          is_verified: false,
          is_primary_device: false,
          device_name: device_info.device_name,
          registered_at: null,
          last_used: null,
          requires_approval: true,
          conflict_device: {
            device_id: conflictDevice.device_id,
            device_name: conflictDevice.device_name,
            last_used: conflictDevice.last_used.toDate().toISOString(),
          },
        },
      });
    }
    
    if (!newDeviceIsMobile && desktopDevices.length > 0) {
      const conflictDevice = desktopDevices[0];
      return res.json({
        success: true,
        message: "Desktop device verification required - existing desktop device found",
        data: {
          is_verified: false,
          is_primary_device: false,
          device_name: device_info.device_name,
          registered_at: null,
          last_used: null,
          requires_approval: true,
          conflict_device: {
            device_id: conflictDevice.device_id,
            device_name: conflictDevice.device_name,
            last_used: conflictDevice.last_used.toDate().toISOString(),
          },
        },
      });
    }

    return res.json({
      success: true,
      message: "New device can be registered",
      data: {
        is_verified: false,
        is_primary_device: false,
        device_name: device_info.device_name,
        registered_at: null,
        last_used: null,
        requires_approval: false,
        conflict_device: null,
      },
    });
  } catch (error) {
    console.error("Device verification error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device verification",
    });
  }
});

router.post("/register", [
  deviceRegistrationRateLimiter,
  authenticateUser,
  sanitizeDeviceInfo,
  validateUserAccess,
  logDeviceOperation("device_register"),
  body("user_id").notEmpty().isLength({max: 50}).trim().escape(),
  body("device_id").notEmpty().isLength({max: 100}).trim().escape(),
  body("force_replace").optional().isBoolean(),
  ...deviceInfoValidation,
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

    const {user_id, device_id, device_info, force_replace = false} = req.body;
    const ipAddress = getClientIP(req);

    const existingDevices = await getUserDevices(user_id);

    // Check device type limits (1 mobile + 1 desktop allowed)
    const mobileDevices = existingDevices.filter(d => d.device_type === 'mobile' || d.device_type === 'tablet');
    const desktopDevices = existingDevices.filter(d => d.device_type === 'desktop');
    const newDeviceIsMobile = device_info.device_type === 'mobile' || device_info.device_type === 'tablet';
    
    const hasConflict = newDeviceIsMobile ? mobileDevices.length > 0 : desktopDevices.length > 0;
    
    if (hasConflict && !force_replace) {
      const conflictDevice = newDeviceIsMobile ? mobileDevices[0] : desktopDevices[0];
      return res.status(409).json({
        success: false,
        message: `User already has a registered ${newDeviceIsMobile ? 'mobile' : 'desktop'} device. Use force_replace=true to replace it.`,
        data: {
          conflict_device: {
            device_id: conflictDevice.device_id,
            device_name: conflictDevice.device_name,
            last_used: conflictDevice.last_used.toDate().toISOString(),
          },
        },
      });
    }

    let replacedDevice = null;
    let newDeviceData;

    if (hasConflict && force_replace) {
      const oldDevice = newDeviceIsMobile ? mobileDevices[0] : desktopDevices[0];
      const result = await replaceUserDevice(
          user_id, oldDevice.device_id, device_id, device_info, ipAddress);
      newDeviceData = result.newDeviceData;
      replacedDevice = result.replacedDevice;

      await createDeviceSwitch(
          user_id,
          oldDevice.device_id,
          device_id,
          "replacement",
          device_info,
          ipAddress,
      );
    } else {
      newDeviceData = await createUserDevice(user_id, device_id, device_info, ipAddress);

      await createDeviceSwitch(
          user_id,
          null,
          device_id,
          "login",
          device_info,
          ipAddress,
      );
    }

    return res.status(201).json({
      success: true,
      message: force_replace ? "Device replaced successfully" : "Device registered successfully",
      data: {
        device_id: newDeviceData.device_id,
        device_name: newDeviceData.device_name,
        registered_at: newDeviceData.registered_at.toDate().toISOString(),
        is_primary_device: newDeviceData.is_primary,
        replaced_device: replacedDevice ? {
          device_id: replacedDevice.device_id,
          device_name: replacedDevice.device_name,
          last_used: replacedDevice.last_used.toDate().toISOString(),
        } : null,
      },
    });
  } catch (error) {
    console.error("Device registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device registration",
    });
  }
});

router.post("/remove", [
  deviceRemovalRateLimiter,
  authenticateUser,
  validateUserAccess,
  logDeviceOperation("device_remove"),
  body("user_id").notEmpty().isLength({max: 50}).trim().escape(),
  body("device_id").optional().isLength({max: 100}).trim().escape(),
  body("reason").notEmpty().isLength({max: 200}).trim().escape(),
  body("use_free_quota").optional().isBoolean(),
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

    const {user_id, device_id, reason, use_free_quota = true} = req.body;
    const ipAddress = getClientIP(req);

    const userDevices = await getUserDevices(user_id);

    if (userDevices.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No devices found for user",
      });
    }

    let deviceToRemove;
    if (device_id) {
      deviceToRemove = await getDeviceById(user_id, device_id);
      if (!deviceToRemove) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }
    } else {
      deviceToRemove = userDevices[0];
    }

    if (use_free_quota) {
      const quota = await getDeviceRemovalQuota(user_id);
      if (!quota.can_remove_free) {
        return res.status(429).json({
          success: false,
          message: "Free removal quota exceeded. Next free removal available on " +
              quota.next_free_removal_date,
          data: {
            quota_exceeded: true,
            next_free_removal_date: quota.next_free_removal_date,
            free_removals_used: quota.free_removals_used,
          },
        });
      }
    }

    const result = await removeUserDevice(user_id, deviceToRemove.device_id, reason, ipAddress);
    const updatedQuota = await getDeviceRemovalQuota(user_id);

    return res.json({
      success: true,
      message: "Device removed successfully",
      data: {
        removed_device_id: result.deviceData.device_id,
        removed_device_name: result.deviceData.device_name,
        quota_used: use_free_quota,
        remaining_free_removals: updatedQuota.free_removals_limit -
            updatedQuota.free_removals_used,
        next_free_removal_date: updatedQuota.next_free_removal_date,
      },
    });
  } catch (error) {
    console.error("Device removal error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device removal",
    });
  }
});

router.get("/info/:userId", [
  deviceOperationRateLimiter,
  authenticateUser,
  validateUserAccess,
  logDeviceOperation("device_info"),
  param("userId").notEmpty().isLength({max: 50}).trim().escape(),
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

    const {userId} = req.params;
    const devices = await getUserDevices(userId);

    const formattedDevices = devices.map((device) => ({
      device_id: device.device_id,
      device_name: device.device_name,
      device_type: device.device_type,
      os_version: device.os_version,
      manufacturer: device.manufacturer,
      model: device.model,
      registered_at: device.registered_at.toDate().toISOString(),
      last_used: device.last_used.toDate().toISOString(),
      is_primary: device.is_primary,
    }));

    const currentDevice = formattedDevices.find((d) => d.is_primary) || formattedDevices[0] || null;

    return res.json({
      success: true,
      message: "Device info retrieved successfully",
      data: {
        current_device: currentDevice,
        all_devices: formattedDevices,
        device_limit: 2,
        mobile_device_limit: 1,
        desktop_device_limit: 1,
        can_add_mobile_device: devices.filter(d => d.device_type === 'mobile' || d.device_type === 'tablet').length === 0,
        can_add_desktop_device: devices.filter(d => d.device_type === 'desktop').length === 0,
        can_add_device: devices.length < 2,
      },
    });
  } catch (error) {
    console.error("Get device info error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while retrieving device info",
    });
  }
});

router.get("/removal-quota/:userId", [
  deviceOperationRateLimiter,
  authenticateUser,
  validateUserAccess,
  logDeviceOperation("device_quota"),
  param("userId").notEmpty().isLength({max: 50}).trim().escape(),
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

    const {userId} = req.params;
    const quota = await getDeviceRemovalQuota(userId);

    return res.json({
      success: true,
      message: "Removal quota retrieved successfully",
      data: quota,
    });
  } catch (error) {
    console.error("Get removal quota error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while retrieving removal quota",
    });
  }
});

router.post("/switch-tracking", [
  deviceOperationRateLimiter,
  authenticateUser,
  sanitizeDeviceInfo,
  validateUserAccess,
  logDeviceOperation("device_switch"),
  body("user_id").notEmpty().isLength({max: 50}).trim().escape(),
  body("from_device_id").optional().isLength({max: 100}).trim().escape(),
  body("to_device_id").notEmpty().isLength({max: 100}).trim().escape(),
  body("switch_type").isIn(["login", "forced_switch", "replacement"]),
  ...deviceInfoValidation,
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

    const {user_id, from_device_id, to_device_id, switch_type, device_info} = req.body;
    const ipAddress = getClientIP(req);

    const switchData = await createDeviceSwitch(
        user_id,
        from_device_id,
        to_device_id,
        switch_type,
        device_info,
        ipAddress,
    );

    return res.status(201).json({
      success: true,
      message: "Device switch tracked successfully",
      data: switchData,
    });
  } catch (error) {
    console.error("Device switch tracking error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during device switch tracking",
    });
  }
});

router.get("/switch-history/:userId", [
  deviceOperationRateLimiter,
  authenticateUser,
  validateUserAccess,
  logDeviceOperation("device_history"),
  param("userId").notEmpty().isLength({max: 50}).trim().escape(),
  param("limit").optional().isInt({min: 1, max: 50}),
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

    const {userId} = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const historyData = await getDeviceSwitchHistory(userId, limit);

    return res.json({
      success: true,
      message: "Switch history retrieved successfully",
      data: historyData,
    });
  } catch (error) {
    console.error("Get switch history error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while retrieving switch history",
    });
  }
});

module.exports = router;
