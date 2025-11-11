// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// No pases { input: "./global.css" } a menos que uses Expo Web con CSS.
module.exports = withNativeWind(config);