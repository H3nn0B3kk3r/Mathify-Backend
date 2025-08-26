const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const createUserDevice = async (userId, deviceId, deviceInfo, ipAddress) => {
  try {
    const deviceRef = db.collection("user_devices").doc(`${userId}_${deviceId}`);

    // Check existing devices to determine if this should be primary for its type
    const existingDevices = await getUserDevices(userId);
    const isMobileDevice = deviceInfo.device_type === 'mobile' || deviceInfo.device_type === 'tablet';
    const sameTypeDevices = existingDevices.filter(d => {
      const deviceIsMobile = d.device_type === 'mobile' || d.device_type === 'tablet';
      return isMobileDevice === deviceIsMobile;
    });

    const deviceData = {
      user_id: userId,
      device_id: deviceId,
      device_name: deviceInfo.device_name,
      device_type: deviceInfo.device_type,
      os_version: deviceInfo.os_version,
      app_version: deviceInfo.app_version,
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      screen_resolution: deviceInfo.screen_resolution,
      timezone: deviceInfo.timezone,
      locale: deviceInfo.locale,
      registered_at: admin.firestore.Timestamp.now(),
      last_used: admin.firestore.Timestamp.now(),
      is_primary: sameTypeDevices.length === 0, // Primary if first of its type
      ip_address: ipAddress,
    };

    await deviceRef.set(deviceData);
    return deviceData;
  } catch (error) {
    console.error("Failed to create user device:", error);
    throw error;
  }
};

const getUserDevices = async (userId) => {
  try {
    const devicesSnapshot = await db.collection("user_devices")
        .where("user_id", "==", userId)
        .get();

    return devicesSnapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error("Failed to get user devices:", error);
    throw error;
  }
};

const getDeviceById = async (userId, deviceId) => {
  try {
    const deviceRef = db.collection("user_devices").doc(`${userId}_${deviceId}`);
    const deviceDoc = await deviceRef.get();

    return deviceDoc.exists ? deviceDoc.data() : null;
  } catch (error) {
    console.error("Failed to get device by ID:", error);
    throw error;
  }
};

const updateDeviceLastUsed = async (userId, deviceId, ipAddress) => {
  try {
    const deviceRef = db.collection("user_devices").doc(`${userId}_${deviceId}`);

    await deviceRef.update({
      last_used: admin.firestore.Timestamp.now(),
      ip_address: ipAddress,
    });

    return true;
  } catch (error) {
    console.error("Failed to update device last used:", error);
    throw error;
  }
};

const removeUserDevice = async (userId, deviceId, reason, ipAddress) => {
  try {
    const deviceRef = db.collection("user_devices").doc(`${userId}_${deviceId}`);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      throw new Error("Device not found");
    }

    const deviceData = deviceDoc.data();

    const removalRef = db.collection("device_removals").doc();
    const removalData = {
      user_id: userId,
      device_id: deviceId,
      device_name: deviceData.device_name,
      removed_at: admin.firestore.Timestamp.now(),
      reason: reason,
      ip_address: ipAddress,
      quota_used: true,
    };

    await db.runTransaction(async (transaction) => {
      transaction.delete(deviceRef);
      transaction.set(removalRef, removalData);
    });

    return {deviceData, removalData};
  } catch (error) {
    console.error("Failed to remove user device:", error);
    throw error;
  }
};

const getDeviceRemovalQuota = async (userId) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const removalsSnapshot = await db.collection("device_removals")
        .where("user_id", "==", userId)
        .where("removed_at", ">=", admin.firestore.Timestamp.fromDate(currentMonthStart))
        .where("quota_used", "==", true)
        .get();

    const freeRemovalsUsed = removalsSnapshot.size;
    const freeRemovalsLimit = 1;
    const canRemoveFree = freeRemovalsUsed < freeRemovalsLimit;

    return {
      free_removals_used: freeRemovalsUsed,
      free_removals_limit: freeRemovalsLimit,
      next_free_removal_date: nextMonthStart.toISOString(),
      can_remove_free: canRemoveFree,
      premium_removals_available: false,
    };
  } catch (error) {
    console.error("Failed to get device removal quota:", error);
    throw error;
  }
};

const createDeviceSwitch = async (
    userId, fromDeviceId, toDeviceId, switchType, deviceInfo, ipAddress) => {
  try {
    const switchRef = db.collection("device_switches").doc();
    const switchData = {
      user_id: userId,
      from_device_id: fromDeviceId || null,
      to_device_id: toDeviceId,
      switch_type: switchType,
      switched_at: admin.firestore.Timestamp.now(),
      ip_address: ipAddress,
      device_info: deviceInfo,
    };

    await switchRef.set(switchData);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthSwitchesSnapshot = await db.collection("device_switches")
        .where("user_id", "==", userId)
        .where("switched_at", ">=", admin.firestore.Timestamp.fromDate(currentMonthStart))
        .get();

    const switchCountThisMonth = monthSwitchesSnapshot.size;
    const suspiciousActivity = switchCountThisMonth > 5;

    return {
      switch_id: switchRef.id,
      recorded_at: switchData.switched_at,
      switch_count_this_month: switchCountThisMonth,
      suspicious_activity: suspiciousActivity,
    };
  } catch (error) {
    console.error("Failed to create device switch:", error);
    throw error;
  }
};

const getDeviceSwitchHistory = async (userId, limit = 10) => {
  try {
    const switchesSnapshot = await db.collection("device_switches")
        .where("user_id", "==", userId)
        .orderBy("switched_at", "desc")
        .limit(limit)
        .get();

    const switches = switchesSnapshot.docs.map((doc) => ({
      switch_id: doc.id,
      ...doc.data(),
      switched_at: doc.data().switched_at.toDate().toISOString(),
    }));

    const totalSwitchesSnapshot = await db.collection("device_switches")
        .where("user_id", "==", userId)
        .get();

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthSwitchesSnapshot = await db.collection("device_switches")
        .where("user_id", "==", userId)
        .where("switched_at", ">=", admin.firestore.Timestamp.fromDate(currentMonthStart))
        .get();

    const thisMonthSwitches = monthSwitchesSnapshot.size;
    const suspiciousPatterns = [];

    if (thisMonthSwitches > 5) {
      suspiciousPatterns.push({
        type: "excessive_switching",
        description: `${thisMonthSwitches} device switches this month (threshold: 5)`,
        severity: "high",
      });
    }

    const recentSwitches = switches.filter((s) =>
      new Date(s.switched_at) > new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    if (recentSwitches.length > 3) {
      suspiciousPatterns.push({
        type: "rapid_switching",
        description: `${recentSwitches.length} switches in last 24 hours`,
        severity: "medium",
      });
    }

    return {
      switches,
      total_switches: totalSwitchesSnapshot.size,
      this_month_switches: thisMonthSwitches,
      suspicious_patterns: suspiciousPatterns,
    };
  } catch (error) {
    console.error("Failed to get device switch history:", error);
    throw error;
  }
};

const replaceUserDevice = async (userId, oldDeviceId, newDeviceId, deviceInfo, ipAddress) => {
  try {
    return await db.runTransaction(async (transaction) => {
      const oldDeviceRef = db.collection("user_devices").doc(`${userId}_${oldDeviceId}`);
      const newDeviceRef = db.collection("user_devices").doc(`${userId}_${newDeviceId}`);

      const oldDeviceDoc = await transaction.get(oldDeviceRef);
      let replacedDevice = null;

      if (oldDeviceDoc.exists) {
        replacedDevice = oldDeviceDoc.data();
        transaction.delete(oldDeviceRef);
      }

      const newDeviceData = {
        user_id: userId,
        device_id: newDeviceId,
        device_name: deviceInfo.device_name,
        device_type: deviceInfo.device_type,
        os_version: deviceInfo.os_version,
        app_version: deviceInfo.app_version,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        screen_resolution: deviceInfo.screen_resolution,
        timezone: deviceInfo.timezone,
        locale: deviceInfo.locale,
        registered_at: admin.firestore.Timestamp.now(),
        last_used: admin.firestore.Timestamp.now(),
        is_primary: true, // Replacement device becomes primary for its type
        ip_address: ipAddress,
      };

      transaction.set(newDeviceRef, newDeviceData);

      return {newDeviceData, replacedDevice};
    });
  } catch (error) {
    console.error("Failed to replace user device:", error);
    throw error;
  }
};

module.exports = {
  createUserDevice,
  getUserDevices,
  getDeviceById,
  updateDeviceLastUsed,
  removeUserDevice,
  getDeviceRemovalQuota,
  createDeviceSwitch,
  getDeviceSwitchHistory,
  replaceUserDevice,
};
