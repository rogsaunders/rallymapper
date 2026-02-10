import { Capacitor } from "@capacitor/core";

class DeviceService {
  constructor() {
    this.plugins = {};
    this.initialized = false;
    this.initPromise = null;
  }

  async startSpeechRecognition() {
    throw new Error(
      "❌ device.startSpeechRecognition MUST NOT be used. Use speechController instead.",
    );
  }

  async init() {
    // Prevent multiple initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (Capacitor.isNativePlatform()) {
        console.log("🔌 Loading native plugins...");
        try {
          // Lazy load plugins only on native
          const [geo, fs, share, keepAwake] = await Promise.all([
            import("@capacitor/geolocation"),
            import("@capacitor/filesystem"),
            import("@capacitor/share"),
            import("@capacitor-community/keep-awake").catch(() => null),
          ]);

          this.plugins.Geolocation = geo.Geolocation;
          this.plugins.Filesystem = fs.Filesystem;
          this.plugins.Directory = fs.Directory;
          this.plugins.Encoding = fs.Encoding;
          this.plugins.Share = share.Share;
          if (!this.plugins.Filesystem || !this.plugins.Share) {
            throw new Error(
              "Native plugins not loaded (Filesystem/Share missing)",
            );
          }
          if (keepAwake) {
            this.plugins.KeepAwake = keepAwake.KeepAwake;
          }

          console.log("✅ Native plugins loaded");
          this.initialized = true;
        } catch (error) {
          console.error("❌ Failed to load native plugins:", error);
          console.error("❌ error message:", error?.message);
          console.error("❌ error stack:", error?.stack);
          console.error("❌ error as string:", String(error));
          throw error;
        }
      } else {
        console.log("🌐 Running on web - using browser APIs");
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  // GPS Methods
  async getCurrentPosition() {
    await this.ensureInitialized();

    if (Capacitor.isNativePlatform()) {
      return await this.plugins.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      });
    } else {
      // Web fallback
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              coords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
                altitudeAccuracy: pos.coords.altitudeAccuracy,
                heading: pos.coords.heading,
                speed: pos.coords.speed,
              },
              timestamp: pos.timestamp,
            }),
          reject,
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
          },
        );
      });
    }
  }

  async watchPosition(callback, errorCallback) {
    await this.ensureInitialized();

    if (Capacitor.isNativePlatform()) {
      return await this.plugins.Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          maximumAge: 0,
        },
        callback,
      );
    } else {
      // Web fallback
      return navigator.geolocation.watchPosition(
        (pos) =>
          callback({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              altitudeAccuracy: pos.coords.altitudeAccuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            },
            timestamp: pos.timestamp,
          }),
        errorCallback,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
        },
      );
    }
  }

  clearWatch(watchId) {
    if (Capacitor.isNativePlatform() && this.initialized) {
      this.plugins.Geolocation.clearWatch({ id: watchId });
    } else {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  // File Export Methods
  async exportFile(content, filename, mimeType) {
    await this.ensureInitialized();

    console.log("🔍 EXPORT PLATFORM DEBUG:");
    console.log(
      "  - Capacitor.isNativePlatform():",
      Capacitor.isNativePlatform(),
    );
    console.log("  - Capacitor.getPlatform():", Capacitor.getPlatform());
    console.log("  - this.initialized:", this.initialized);
    console.log("  - Has Filesystem plugin?:", !!this.plugins.Filesystem);
    console.log("  - Has Share plugin?:", !!this.plugins.Share);

    if (!filename || typeof filename !== "string") {
      throw new Error("exportFile: filename must be a non-empty string");
    }

    if (Capacitor.isNativePlatform()) {
      try {
        console.log("📱 Using native iOS export for:", filename);

        // ✅ Support nested paths like "2026-01-24/Stage 2.kml"
        const parts = filename.split("/").filter(Boolean);
        const fileNameOnly = parts.pop(); // last part is file name
        const folderPath = parts.join("/"); // remaining is folder path (may be "")

        // ✅ Ensure parent folder exists (Documents/<folderPath>)
        if (folderPath) {
          try {
            await this.plugins.Filesystem.mkdir({
              path: folderPath,
              directory: this.plugins.Directory.Documents,
              recursive: true,
            });
          } catch (err) {
            // ✅ iOS throws if directory already exists — ignore it
            if (
              !String(err?.errorMessage || err?.message || err).includes(
                "already exists",
              )
            ) {
              throw err;
            }
          }
        }

        const writePath = folderPath
          ? `${folderPath}/${fileNameOnly}`
          : fileNameOnly;

        const result = await this.plugins.Filesystem.writeFile({
          path: writePath,
          data: content,
          directory: this.plugins.Directory.Documents,
          encoding: this.plugins.Encoding.UTF8,
        });

        console.log("✅ File written to iOS Documents:", result.uri);

        await this.plugins.Share.share({
          title: "Route Mapper Export",
          text: `Rally route: ${filename}`,
          url: result.uri,
          dialogTitle: "Export Route",
        });

        console.log("✅ iOS native share completed");
        return { success: true, method: "native_share" };
      } catch (error) {
        console.error("❌ Native export failed:", error?.message || error);
        return { success: false, error: error?.message || String(error) };
      }
    } else {
      console.log("🌐 Using web export for:", filename);
      const { exportFileIPadCompatible } =
        await import("../utils/fileExport.js");
      return exportFileIPadCompatible(content, filename, mimeType);
    }
  }
}

export default new DeviceService();
