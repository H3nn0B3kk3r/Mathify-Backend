const crypto = require('crypto');

/**
 * Generate a unique device ID based on device characteristics
 * @param {Object} deviceInfo - Device information from client
 * @returns {string} - Unique device ID
 */
const generateDeviceId = (deviceInfo) => {
  // Create a unique identifier based on device characteristics
  const identifier = `${deviceInfo.manufacturer || 'unknown'}-${deviceInfo.model || 'unknown'}-${deviceInfo.os_version || 'unknown'}-${deviceInfo.device_name || 'unknown'}`;
  
  // Add some randomness to ensure uniqueness
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(7);
  
  // Create hash for consistent length and format
  const hash = crypto.createHash('sha256').update(`${identifier}-${timestamp}-${random}`).digest('hex');
  
  return `device_${hash.substring(0, 16)}`;
};

/**
 * Auto-detect device information from request headers
 * @param {Object} req - Express request object
 * @returns {Object} - Detected device information
 */
const autoDetectDevice = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  
  // Basic device type detection from user agent
  let deviceType = 'desktop';
  if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
    if (/iPad/.test(userAgent)) {
      deviceType = 'tablet';
    } else {
      deviceType = 'mobile';
    }
  }
  
  // Extract OS information
  let osVersion = 'unknown';
  let manufacturer = 'unknown';
  let model = 'unknown';
  
  if (/Windows/.test(userAgent)) {
    const windowsMatch = userAgent.match(/Windows NT ([\d.]+)/);
    osVersion = windowsMatch ? `Windows ${windowsMatch[1]}` : 'Windows';
    manufacturer = 'Microsoft';
    model = 'Windows PC';
  } else if (/Mac OS X/.test(userAgent)) {
    const macMatch = userAgent.match(/Mac OS X ([\d_]+)/);
    osVersion = macMatch ? `macOS ${macMatch[1].replace(/_/g, '.')}` : 'macOS';
    manufacturer = 'Apple';
    model = 'Mac';
  } else if (/Android/.test(userAgent)) {
    const androidMatch = userAgent.match(/Android ([\d.]+)/);
    osVersion = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    manufacturer = 'Android';
    
    // Try to extract device model from user agent
    const modelMatch = userAgent.match(/;\s*([^)]+)\s*\)/);
    model = modelMatch ? modelMatch[1].trim() : 'Android Device';
  } else if (/iPhone/.test(userAgent)) {
    const iosMatch = userAgent.match(/OS ([\d_]+)/);
    osVersion = iosMatch ? `iOS ${iosMatch[1].replace(/_/g, '.')}` : 'iOS';
    manufacturer = 'Apple';
    model = 'iPhone';
  } else if (/iPad/.test(userAgent)) {
    const iosMatch = userAgent.match(/OS ([\d_]+)/);
    osVersion = iosMatch ? `iPadOS ${iosMatch[1].replace(/_/g, '.')}` : 'iPadOS';
    manufacturer = 'Apple';
    model = 'iPad';
  }
  
  // Extract timezone from headers or use UTC as default
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  
  // Extract locale from accept-language header
  const locale = acceptLanguage.split(',')[0]?.split('-')[0] || 'en';
  
  // Generate a device name
  const deviceName = `${manufacturer} ${model}`.trim();
  
  return {
    device_name: deviceName,
    device_type: deviceType,
    os_version: osVersion,
    app_version: '1.0.0', // Default app version
    manufacturer: manufacturer,
    model: model,
    screen_resolution: 'unknown', // Can't detect from server
    timezone: timezone,
    locale: locale
  };
};

/**
 * Merge client-provided device info with auto-detected info
 * @param {Object} clientDeviceInfo - Device info from client
 * @param {Object} detectedDeviceInfo - Auto-detected device info
 * @returns {Object} - Merged device information
 */
const mergeDeviceInfo = (clientDeviceInfo = {}, detectedDeviceInfo) => {
  return {
    device_name: clientDeviceInfo.device_name || detectedDeviceInfo.device_name,
    device_type: clientDeviceInfo.device_type || detectedDeviceInfo.device_type,
    os_version: clientDeviceInfo.os_version || detectedDeviceInfo.os_version,
    app_version: clientDeviceInfo.app_version || detectedDeviceInfo.app_version,
    manufacturer: clientDeviceInfo.manufacturer || detectedDeviceInfo.manufacturer,
    model: clientDeviceInfo.model || detectedDeviceInfo.model,
    screen_resolution: clientDeviceInfo.screen_resolution || detectedDeviceInfo.screen_resolution,
    timezone: clientDeviceInfo.timezone || detectedDeviceInfo.timezone,
    locale: clientDeviceInfo.locale || detectedDeviceInfo.locale
  };
};

/**
 * Validate device information completeness
 * @param {Object} deviceInfo - Device information to validate
 * @returns {Object} - Validation result
 */
const validateDeviceInfo = (deviceInfo) => {
  const errors = [];
  
  if (!deviceInfo.device_name || deviceInfo.device_name.trim().length === 0) {
    errors.push('Device name is required');
  }
  
  if (!['mobile', 'tablet', 'desktop'].includes(deviceInfo.device_type)) {
    errors.push('Invalid device type');
  }
  
  if (!deviceInfo.os_version || deviceInfo.os_version.trim().length === 0) {
    errors.push('OS version is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

module.exports = {
  generateDeviceId,
  autoDetectDevice,
  mergeDeviceInfo,
  validateDeviceInfo
};