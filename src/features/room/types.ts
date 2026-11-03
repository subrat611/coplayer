export const PLAYLIST_VERSION = "v1";
export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type Participant = {
  joinedAt: number | object;
  connected: boolean;
};

export type Room = {
  createdAt: number | object;
  expiresAt: number;
  status: "active";
  playlistVersion: typeof PLAYLIST_VERSION;
  participants: Record<string, Participant>;
  playback: {
    playlistIndex: number;
    videoId: string;
    isPlaying: boolean;
    positionSeconds: number;
    updatedAt: number | object;
    revision: number;
    updatedBy: string;
  };
};
