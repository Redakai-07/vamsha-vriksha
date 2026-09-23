/**
 * Photographs are resized in the browser before they ever reach IndexedDB.
 * A 4 MB phone photo becomes a ~30 KB avatar, which keeps the local database
 * small, JSON backups portable and offline startup fast.
 */

export const AVATAR_MAX_SIZE = 512;
export const AVATAR_QUALITY = 0.85;

export function isSupportedImage(file: File): boolean {
  return file.type.startsWith("image/");
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  if (typeof document === "undefined") return dataUrl;

  const image = await loadImage(dataUrl);
  const aspect = image.width / image.height;
  const targetWidth = aspect >= 1 ? AVATAR_MAX_SIZE : Math.round(AVATAR_MAX_SIZE * aspect);
  const targetHeight = aspect >= 1 ? Math.round(AVATAR_MAX_SIZE / aspect) : AVATAR_MAX_SIZE;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, targetWidth);
  canvas.height = Math.max(1, targetHeight);
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
  } catch {
    return dataUrl;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode that image"));
    image.src = source;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
