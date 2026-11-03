# CoPlayer — Real-Time Playback Synchronization Specification

## Goal

Extend the existing two-person Firebase room flow so both participants stay in sync while listening to the fixed YouTube playlist.

The app already has:

- anonymous Firebase Authentication;
- Firebase Realtime Database room creation and joining;
- a maximum of two stored room participants;
- `/room/[roomId]` routes;
- a custom mobile player UI backed by the YouTube IFrame Player API;
- a fixed YouTube playlist: `PLIgUDZqlPCvQ`.

The app does **not** currently synchronize playback. Play, pause, seek, previous, next, and track selection are local to each browser.

## Existing Relevant Files

- `src/features/player/youtube-playlist-player.tsx` — custom player UI and YouTube IFrame Player instance.
- `src/features/room/room-service.ts` — Firebase anonymous auth, room creation, joining, and presence.
- `src/features/room/room-screen.tsx` — room route and player host.
- `src/features/room/types.ts` — room schema types and playlist version.
- `src/firebase/client.ts` — Firebase client configuration.

Keep the root `layout.tsx` as a Server Component. Components that call Firebase browser SDK APIs, use the YouTube IFrame API, or maintain playback state must be Client Components (`"use client"`).

## Required User Experience

1. Both users who open the same room see the same playlist and the custom audio-style control surface.
2. When one user presses play/pause, skips, chooses a queue item, or seeks, the other user follows within a reasonable delay (target: under 1.5 seconds on normal connections).
3. A user who joins an already-active room starts at the room’s current track and estimated current position.
4. Do not show a visible YouTube video player. Continue using the official YouTube IFrame Player API as the playback engine behind the custom controls.
5. Do not use scraped `youtubei` or `googlevideo` network endpoints, signed media URLs, or a native `<audio>` element sourced from YouTube.
6. Preserve the existing shadcn/token-based dark theme from `src/app/globals.css`.

## Realtime Database Data Shape

Keep room fields immutable except where noted:

```ts
type PlaybackState = {
  playlistIndex: number;
  videoId: string;
  isPlaying: boolean;
  positionSeconds: number;
  updatedAt: number; // Firebase server timestamp resolved to Unix ms
  revision: number;
  updatedBy: string; // anonymous Firebase UID
};

type Room = {
  createdAt: number;
  expiresAt: number;
  status: "active";
  playlistVersion: "v1";
  participants: Record<string, { joinedAt: number; connected: boolean }>;
  playback: PlaybackState;
};
```

On newly created rooms, initialize playback as:

```ts
{
  playlistIndex: 0,
  videoId: "", // update once the IFrame API exposes the first video ID
  isPlaying: false,
  positionSeconds: 0,
  updatedAt: serverTimestamp(),
  revision: 0,
  updatedBy: creatorUid
}
```

The local frontend playlist is still the source of playlist metadata. Do not copy the full playlist into every room record.

## Firebase Service API

Add a playback service, for example `src/features/player/playback-service.ts`.

It should expose:

```ts
subscribeToPlayback(roomId: string, callback: (state: PlaybackState) => void): Unsubscribe
publishPlayback(roomId: string, uid: string, next: Omit<PlaybackState, "updatedAt" | "revision" | "updatedBy">): Promise<void>
```

Implementation requirements:

- Subscribe using Realtime Database `onValue(ref(database, "rooms/${roomId}/playback"), ...)`.
- Write with a transaction at `rooms/${roomId}/playback`, not a blind overwrite.
- Increment `revision` once for each accepted local user action.
- Set `updatedAt: serverTimestamp()` and `updatedBy: uid` in every accepted write.
- Validate that the room is still active and has the supported `playlistVersion` before publishing.
- Report Firebase errors to the player UI in a concise, retryable form.

## Synchronization Algorithm

### Local action → database

For a local control action:

1. Apply the action immediately to the local YouTube player for responsive UX.
2. Read the player’s current playlist index, video ID, position, and play/pause state.
3. Publish the resulting playback snapshot through `publishPlayback`.
4. Set a local `lastPublishedRevision` / action token so the following database callback is recognized as the local echo.

Supported actions:

- play;
- pause;
- `seekTo` / progress bar seek;
- previous track;
- next track;
- select a queue item;
- YouTube `onStateChange` events for track changes that occur naturally.

Throttle position-only writes. Do not write every 500 ms timer tick. Suggested behavior:

- write immediately for play, pause, seek, track change, and queue selection;
- while playing, publish the current position every 5 seconds at most;
- publish the latest position on tab/page visibility loss when possible, but do not rely on unload alone.

### Database → remote player

For every incoming playback snapshot:

1. Ignore it when `updatedBy` is the local UID and it represents the local action already applied.
2. If `playlistIndex` differs, call `player.playVideoAt(playlistIndex)` or the appropriate playlist API method.
3. Estimate the expected current position:

```ts
expectedPosition = state.positionSeconds;
if (state.isPlaying) {
  expectedPosition += (Date.now() - state.updatedAt) / 1000;
}
```

4. Compare `expectedPosition` with `player.getCurrentTime()`.
5. Call `seekTo(expectedPosition, true)` only when drift exceeds 1.5 seconds, or when the track changed.
6. Call `playVideo()` or `pauseVideo()` to match `isPlaying`.

Use an `isApplyingRemoteState` ref while applying remote updates. Ignore YouTube callbacks caused by those updates so they do not write the state back and create a feedback loop.

### Join behavior

When a participant opens `/room/[roomId]`:

1. Complete existing room admission and anonymous auth.
2. Create/cue the YouTube playlist player.
3. Subscribe to `playback`.
4. Do not publish an initial local playback state.
5. Wait for the player API to be ready, then apply the most recent database playback snapshot using the remote-player procedure above.

## Time and Drift Notes

- Firebase `serverTimestamp()` is authoritative only after it resolves in the database snapshot.
- Browser clocks can differ. The algorithm should correct large drift periodically instead of constantly seeking.
- A 1–2 second tolerance is intentional; constantly correcting tiny differences causes audible glitches.
- A robust future improvement is to calculate Firebase server offset from `/.info/serverTimeOffset` and use `Date.now() + offset` for the expected-position calculation.

## YouTube IFrame API Integration

Keep `enablejsapi: 1`, `listType: "playlist"`, and `list: "PLIgUDZqlPCvQ"` in the player configuration.

The player component needs access to:

```ts
getCurrentTime()
getDuration()
getPlaylist()
getPlaylistIndex()
getVideoData()
playVideo()
pauseVideo()
seekTo(seconds, allowSeekAhead)
playVideoAt(index)
nextVideo()
previousVideo()
```

Use IFrame callbacks such as `onReady` and `onStateChange` to initialize the queue and detect natural track changes.

The component may visually hide the iframe and render only the custom player UI, but it must still use the official embedded player rather than direct media endpoints.

## Database Rules Requirements

The currently used development rules allow every authenticated user to read/write. Replace them before deployment.

Production rules must at least ensure:

- `auth != null` for rooms and presence;
- immutable `createdAt`, `expiresAt`, and `playlistVersion` after room creation;
- no more than two participant keys;
- users can only create/update their own presence node;
- only active, non-expired rooms accept playback writes;
- playback data has valid types and a nonnegative `revision`;
- writes cannot overwrite another room.

Because client-side RTDB rules cannot fully guarantee every multi-step two-person admission invariant, use a trusted Cloud Function for room creation/admission before production if strong guarantees are required.

## Acceptance Tests

Test with one normal browser window and one incognito window first.

1. Create a fresh room; its `playback` node is initialized.
2. Join the same room from incognito; the second user adopts the first user’s current track, play/pause state, and position.
3. Press play in window A; window B starts playing.
4. Pause in B; A pauses.
5. Select a queue item in A; B switches to the same playlist index.
6. Seek in A; B moves to the same approximate position.
7. Let a track naturally finish; both move to the same next track.
8. Refresh B while A plays; B rejoins at the expected position.
9. Verify that repeated remote updates do not cause a write loop or a rapidly increasing `revision`.
10. Verify no visible video controls/player are shown in the custom player UI.

## Out of Scope

- extracting YouTube audio URLs;
- scraping `youtubei` / `googlevideo` requests;
- user login or YouTube login;
- arbitrary playlist editing;
- more than two active participants;
- production-grade room cleanup (use a scheduled trusted job later).
