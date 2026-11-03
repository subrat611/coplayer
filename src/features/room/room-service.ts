import { signInAnonymously, type User } from "firebase/auth";
import { get, onDisconnect, ref, runTransaction, serverTimestamp, set } from "firebase/database";
import { getFirebaseClient } from "@/firebase/client";
import { PLAYLIST_VERSION, ROOM_LIFETIME_MS, type Room } from "./types";

const FIRST_PLAYLIST_VIDEO_ID = "M7lc1UVf-VE";
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
let anonymousSignIn: Promise<User> | null = null;

export class RoomError extends Error {}

function requireFirebase() {
  const client = getFirebaseClient();
  if (!client) throw new RoomError("Firebase is not configured yet. Add the NEXT_PUBLIC_FIREBASE_* values and retry.");
  return client;
}

export async function getAnonymousUser(): Promise<User> {
  const { auth } = requireFirebase();
  if (auth.currentUser) return auth.currentUser;

  // Room-route effects can be invoked twice in React development mode. Keep
  // the anonymous identity creation single-flight so both callers use one UID.
  anonymousSignIn ??= signInAnonymously(auth).then((credential) => credential.user);
  try {
    return await anonymousSignIn;
  } finally {
    anonymousSignIn = null;
  }
}

function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function normalizeRoomInput(input: string) {
  const value = input.trim();
  if (ROOM_ID_PATTERN.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.origin !== window.location.origin) throw new Error();
    const [, room, roomId] = url.pathname.split("/");
    if (room === "room" && roomId && ROOM_ID_PATTERN.test(roomId)) return roomId;
  } catch {
    // A generic error below keeps malformed and unrelated links indistinguishable.
  }

  throw new RoomError("Enter a valid room code or a CoPlayer room link.");
}

async function connectPresence(roomId: string, uid: string) {
  const { database } = requireFirebase();
  const presenceRef = ref(database, `presence/${roomId}/${uid}`);
  await onDisconnect(presenceRef).remove();
  await set(presenceRef, { connectedAt: serverTimestamp() });
}

function isRoomJoinable(room: Room | null) {
  return room && room.status === "active" && room.expiresAt > Date.now() && room.playlistVersion === PLAYLIST_VERSION;
}

export async function createRoom() {
  const { database } = requireFirebase();
  const user = await getAnonymousUser();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const roomId = createRoomId();
    const now = Date.now();
    const room: Room = {
      createdAt: serverTimestamp(),
      expiresAt: now + ROOM_LIFETIME_MS,
      status: "active",
      playlistVersion: PLAYLIST_VERSION,
      participants: { [user.uid]: { joinedAt: serverTimestamp(), connected: true } },
      playback: { playlistIndex: 0, videoId: FIRST_PLAYLIST_VIDEO_ID, isPlaying: false, positionSeconds: 0, updatedAt: serverTimestamp(), revision: 0, updatedBy: user.uid },
    };
    const result = await runTransaction(ref(database, `rooms/${roomId}`), (current) => current ?? room);
    if (result.committed) {
      await connectPresence(roomId, user.uid);
      return roomId;
    }
  }

  throw new RoomError("Could not create a room. Please retry.");
}

export async function joinRoom(input: string) {
  const { database } = requireFirebase();
  const roomId = normalizeRoomInput(input);
  const user = await getAnonymousUser();
  const roomRef = ref(database, `rooms/${roomId}`);

  const snapshot = await get(roomRef);
  const room = snapshot.val() as Room | null;
  if (!isRoomJoinable(room)) throw new RoomError("This room is no longer available.");

  const result = await runTransaction(roomRef, (current: Room | null) => {
    // `get()` has already confirmed this room exists. The first transaction
    // callback may still receive an empty local cache, so seed it from that
    // verified server snapshot rather than aborting before reconciliation.
    const candidate = current ?? room;
    if (!candidate || !isRoomJoinable(candidate)) return;
    if (candidate.participants?.[user.uid]) {
      return { ...candidate, participants: { ...candidate.participants, [user.uid]: { ...candidate.participants[user.uid], connected: true } } };
    }
    if (Object.keys(candidate.participants ?? {}).length >= 2) return;
    return {
      ...candidate,
      participants: { ...candidate.participants, [user.uid]: { joinedAt: serverTimestamp(), connected: true } },
    };
  });

  if (!result.committed) throw new RoomError("This room is full or no longer available.");
  await connectPresence(roomId, user.uid);
  return roomId;
}
