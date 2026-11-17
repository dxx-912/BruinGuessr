import { roomShareImage, SHARE_SIZE } from "@/lib/share-image";

export const alt = "Play BruinGuessr versus: race two to five friends on the same five campus photos";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return roomShareImage(null);
}
