"use client";

import { createContext, useContext } from "react";
import type { RoomStatus } from "./room-context";

type RoomContextValue = {
  roomId: string | null;
  participantId: string | null;
  roomStatus: RoomStatus;
  error: string | null;
  createRoom: () => Promise<string>;
  joinRoom: (input: string) => Promise<string>;
};

export const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoom() {
  const room = useContext(RoomContext);
  if (!room) throw new Error("useRoom must be used inside RoomProvider.");
  return room;
}
