import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const isWeb = () => !Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'web', 'ios', 'android'

// Helper to conditionally import plugins
export const loadPlugin = async (pluginName) => {
  if (isNative()) {
    return await import(pluginName);
  }
  return null;
};
