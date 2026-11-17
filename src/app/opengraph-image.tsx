import { SHARE_SIZE, siteShareImage } from "@/lib/share-image";

// The picture shown with any link to the site, unless a page has its own (room links do).
export const alt = "BruinGuessr: an outline of the UCLA campus with a guess pin and the answer flag";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return siteShareImage();
}
