import { roomShareImage, SHARE_SIZE } from "@/lib/share-image";
import { normalizeRoomCode } from "@/lib/versus/types";

// The picture for a room link posted in a chat: "Join my game" and the room code.
// The code is already in the link, so showing it gives nothing away. Anything
// that is not shaped like a room code gets the plain versus picture.
export const alt = "Join my BruinGuessr game";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return roomShareImage(normalizeRoomCode(code));
}
