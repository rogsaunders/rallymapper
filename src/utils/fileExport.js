// iPad-compatible file export with multiple fallback methods
export const exportFileIPadCompatible = async (
  content,
  filename,
  mimeType,
  title = "Route Mapper Export",
) => {
  try {
    console.log(`🔍 === STARTING EXPORT: ${filename} ===`);
    console.log(`📄 Content length: ${content.length} characters`);
    console.log(`📄 MIME type: ${mimeType}`);
    console.log(`📄 File size: ${new Blob([content]).size} bytes`);

    const env = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      isIPad: /iPad|iPhone|iPod/.test(navigator.userAgent),
      isPWA: window.navigator.standalone,
      isIOSSafari:
        /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
      canShare: !!navigator.canShare,
      canShareFiles: navigator.canShare
        ? navigator.canShare({ files: [new File([""], "test.txt")] })
        : false,
      downloadSupport: "download" in document.createElement("a"),
      blobSupport: !!window.Blob,
      urlSupport: !!window.URL,
    };

    console.log("🔍 Export Environment:", env);

    const blob = new Blob([content], { type: mimeType });
    console.log(`📄 Blob created: ${blob.size} bytes, type: ${blob.type}`);

    // METHOD 1: Try iOS Share Sheet (Most reliable on iPad)
    if (env.canShare && env.canShareFiles) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        console.log(`📤 Attempting share sheet: ${file.name}`);

        await navigator.share({
          files: [file],
          title: title,
          text: `Rally route export: ${filename}`,
        });

        console.log("✅ Share sheet successful");
        return { success: true, method: "share_sheet" };
      } catch (shareErr) {
        console.log("⚠️ Share sheet failed:", shareErr.message);
      }
    }

    // METHOD 2: Direct download (works in some iPad browsers)
    if (env.downloadSupport && env.urlSupport) {
      try {
        console.log("📥 Attempting direct download");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
        console.log("✅ Direct download triggered");
        return { success: true, method: "direct_download" };
      } catch (downloadErr) {
        console.log("⚠️ Direct download failed:", downloadErr.message);
      }
    }

    // METHOD 3: Open in new window (iPad fallback)
    try {
      console.log("🔗 Attempting new window method");
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");
      if (newWindow) {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        console.log("✅ New window opened");
        return { success: true, method: "new_window" };
      } else {
        throw new Error("Popup blocked");
      }
    } catch (windowErr) {
      console.log("⚠️ New window failed:", windowErr.message);
    }

    // METHOD 4: Data URL (last resort)
    try {
      console.log("📋 Attempting data URL method");
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => {
          const dataUrl = reader.result;
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = filename;
          a.click();
          console.log("✅ Data URL method triggered");
          resolve({ success: true, method: "data_url" });
        };
        reader.readAsDataURL(blob);
      });
    } catch (dataErr) {
      console.log("⚠️ Data URL failed:", dataErr.message);
    }

    throw new Error("All export methods failed");
  } catch (error) {
    console.error(`❌ Export failed for ${filename}:`, error);
    return { success: false, error: error.message };
  }
};
