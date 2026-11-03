import { get, onValue, ref, runTransaction, serverTimestamp } from "firebase/database";
import { getFirebaseClient } from "@/firebase/client";
import { PLAYLIST_VERSION, type Room } from "@/features/room/types";

export type PlaybackState = Room["playback"];
export type PlaybackUpdate = Pick<PlaybackState, "playlistIndex" | "videoId" | "isPlaying" | "positionSeconds">;

function getDatabase() {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured.");
  return client.database;
}

export function subscribeToPlayback(roomId: string, callback: (state: PlaybackState | null) => void) {
  return onValue(ref(getDatabase(), `rooms/${roomId}/playback`), (snapshot) => callback(snapshot.val() as PlaybackState | null));
}

export function subscribeToServerOffset(callback: (offset: number) => void) {
  return onValue(ref(getDatabase(), ".info/serverTimeOffset"), (snapshot) => callback(Number(snapshot.val() ?? 0)));
}

export async function publishPlayback(roomId: string, uid: string, update: PlaybackUpdate, subscribedState: PlaybackState | null) {
  const database = getDatabase();
  const roomRef = ref(database, `rooms/${roomId}`);
  const roomSnapshot = await get(roomRef);
  const room = roomSnapshot.val() as Room | null;
  if (!room || room.status !== "active" || room.expiresAt <= Date.now() || room.playlistVersion !== PLAYLIST_VERSION) {
    throw new Error("This room is no longer available for playback.");
  }
  if (room.hostId && room.hostId !== uid) throw new Error("Only the room host can control playback.");

  const result = await runTransaction(ref(database, `rooms/${roomId}/playback`), (current: PlaybackState | null) => {
    // Realtime Database may invoke the first client transaction with an empty
    // local cache even after a successful read. The subscription/current room
    // snapshot is verified server data, so use it until Firebase reconciles.
    const playback = current ?? subscribedState ?? room.playback;
    if (!playback) return;
    return {
      ...playback,
      ...update,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      revision: (playback.revision ?? 0) + 1,
    };
  });
  if (!result.committed) throw new Error("This room is no longer available for playback.");
}
