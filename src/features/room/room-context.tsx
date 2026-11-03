"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  createRoom as createRoomRecord,
  joinRoom as joinRoomRecord,
  getAnonymousUser,
} from "./room-service";
import { RoomContext } from "./use-room";

export type RoomStatus =
  | "idle"
  | "creating"
  | "joining"
  | "connected"
  | "error";

export function RoomProvider({ children }: { children: ReactNode }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const createRoom = useCallback(async () => {
    setStatus("creating");
    setError(null);
    try {
      const createdRoomId = await createRoomRecord();
      setParticipantId((await getAnonymousUser()).uid);
      setRoomId(createdRoomId);
      setStatus("connected");
      return createdRoomId;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not create a room. Please retry.";
      setError(message);
      setStatus("error");
      throw cause;
    }
  }, []);

  const joinRoom = useCallback(async (input: string) => {
    setStatus("joining");
    setError(null);
    try {
      const joinedRoomId = await joinRoomRecord(input);
      setParticipantId((await getAnonymousUser()).uid);
      setRoomId(joinedRoomId);
      setStatus("connected");
      return joinedRoomId;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "This room is no longer available.";
      setError(message);
      setStatus("error");
      throw cause;
    }
  }, []);

  const value = useMemo(
    () => ({
      roomId,
      participantId,
      roomStatus: status,
      error,
      createRoom,
      joinRoom,
    }),
    [roomId, participantId, status, error, createRoom, joinRoom],
  );
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
