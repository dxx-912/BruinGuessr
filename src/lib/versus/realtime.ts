"use client";

import { RealtimeClient } from "@supabase/realtime-js";
import { useEffect, useRef } from "react";

let client: RealtimeClient | null | undefined;

/** One Realtime connection for the page, opened the first time a room needs it. */
function realtime(): RealtimeClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    client = url && key ? new RealtimeClient(`${url.replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: key } }) : null;
  } catch {
    client = null;
  }
  return client;
}

/**
 * Calls `onPing` whenever the server says something changed in the room.
 *
 * The message carries no data. It only means "ask the server now": the answer
 * still comes from our own API, which checks who is asking. If Realtime is
 * unreachable nothing breaks, because every versus screen also asks on a timer.
 */
export function useRoomPing(channel: string | null | undefined, onPing: () => void): void {
  const handler = useRef(onPing);
  useEffect(() => {
    handler.current = onPing;
  }, [onPing]);

  useEffect(() => {
    const connection = channel ? realtime() : null;
    if (!channel || !connection) return;
    const subscription = connection
      .channel(channel)
      .on("broadcast", { event: "changed" }, () => handler.current())
      .subscribe();
    return () => {
      void connection.removeChannel(subscription);
    };
  }, [channel]);
}
