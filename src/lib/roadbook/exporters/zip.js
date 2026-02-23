import JSZip from "jszip";
import { toStageJson } from "./json";
import { toOpenRallyGpx } from "./gpxOpenRally";

export async function makeStageZip({ meta, startGPS, waypoints, baseName }) {
  const zip = new JSZip();

  const jsonPayload = toStageJson({ meta, startGPS, waypoints });
  zip.file(`${baseName}.json`, JSON.stringify(jsonPayload, null, 2));

  const gpx = toOpenRallyGpx({ meta, startGPS, waypoints });
  zip.file(`${baseName}.gpx`, gpx);

  return zip.generateAsync({ type: "blob" });
}
