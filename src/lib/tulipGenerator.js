export async function generateTulipPngBase64({ cap = 0 }) {
  const size = 180;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Road vertical line
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(size / 2, size - 20);
  ctx.lineTo(size / 2, size / 2);
  ctx.stroke();

  // Rotate arrow by CAP
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((cap * Math.PI) / 180);

  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.lineTo(15, -30);
  ctx.lineTo(5, -30);
  ctx.lineTo(5, 40);
  ctx.lineTo(-5, 40);
  ctx.lineTo(-5, -30);
  ctx.lineTo(-15, -30);
  ctx.closePath();

  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.restore();

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl; // already base64
}
