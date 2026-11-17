import { roomShareImage, SHARE_SIZE } from "@/lib/share-image";

export const alt = "Play BruinGuessr versus: two to five friends, last one standing wins";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return roomShareImage(null);
}
