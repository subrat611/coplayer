"use client";

import { LoaderCircle, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { publishPlayback, subscribeToPlayback, subscribeToServerOffset, type PlaybackState } from "./playback-service";

const PLAYLIST_ID = "PLIgUDZqlPCvQ";
const PLAYER_PLAYING = 1;

type PlayerInstance = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState?: () => number;
  getPlaylist?: () => string[];
  getPlaylistIndex?: () => number;
  getVideoData?: () => { video_id: string; title: string; author: string };
  pauseVideo: () => void;
  playVideo: () => void;
  playVideoAt: (index: number) => void;
  previousVideo: () => void;
  nextVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type PlayerEvent = { data?: number; target: PlayerInstance };

declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: object) => PlayerInstance };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type PlaylistItem = { id: string; title: string; artist: string };

function isReadablePlayer(instance: PlayerInstance | null): instance is PlayerInstance {
  return Boolean(instance && typeof instance.getCurrentTime === "function" && typeof instance.getDuration === "function");
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise<NonNullable<typeof window.YT>>((resolve) => {
    const existing = document.getElementById("youtube-iframe-api");
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previousReady?.(); resolve(window.YT!); };
    if (existing) return;
    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
}

async function resolvePlaylistItems(videoIds: string[]) {
  return Promise.all(videoIds.slice(0, 30).map(async (id, index): Promise<PlaylistItem> => {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`);
      if (!response.ok) throw new Error("Metadata unavailable");
      const metadata = await response.json() as { title?: string; author_name?: string };
      return { id, title: metadata.title ?? `Track ${index + 1}`, artist: metadata.author_name ?? "YouTube Music" };
    } catch { return { id, title: `Track ${index + 1}`, artist: "YouTube Music" }; }
  }));
}

function formatTime(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function YouTubePlaylistPlayer({ roomId, participantId, isHost }: { roomId: string; participantId: string; isHost: boolean }) {
  const playerHost = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerInstance | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [remotePlayback, setRemotePlayback] = useState<PlaybackState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteApplying = useRef(false);
  const initialPlaybackApplied = useRef(false);
  const latestPlayback = useRef<PlaybackState | null>(null);
  const serverOffset = useRef(0);
  const lastPublishedAt = useRef(0);
  const isPlayingRef = useRef(false);
  const publishRef = useRef<(instance?: PlayerInstance | null) => void>(() => undefined);
  const activeTrack = items[activeIndex];

  const readPlayback = useCallback((instance: PlayerInstance): { playlistIndex: number; videoId: string; isPlaying: boolean; positionSeconds: number } => ({
    playlistIndex: instance.getPlaylistIndex?.() ?? 0,
    videoId: instance.getVideoData?.().video_id ?? "",
    isPlaying: instance.getPlayerState?.() === PLAYER_PLAYING,
    positionSeconds: Math.max(0, instance.getCurrentTime()),
  }), []);

  const publishCurrentPlayback = useCallback((instance = player.current) => {
    if (!isHost || !isReadablePlayer(instance) || !initialPlaybackApplied.current || remoteApplying.current) return;
    lastPublishedAt.current = Date.now();
    void publishPlayback(roomId, participantId, readPlayback(instance), latestPlayback.current)
      .then(() => setSyncError(null))
      .catch((cause) => { setSyncError(cause instanceof Error ? cause.message : "Could not sync playback."); });
  }, [isHost, participantId, readPlayback, roomId]);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { publishRef.current = publishCurrentPlayback; }, [publishCurrentPlayback]);

  useEffect(() => subscribeToServerOffset((offset) => { serverOffset.current = offset; }), []);

  useEffect(() => subscribeToPlayback(roomId, (state) => { latestPlayback.current = state; setRemotePlayback(state); }), [roomId]);

  useEffect(() => {
    if (!playerReady || !remotePlayback || !player.current) return;
    const instance = player.current;
    const isLocalEcho = initialPlaybackApplied.current && remotePlayback.updatedBy === participantId;
    if (isLocalEcho) return;

    remoteApplying.current = true;
    const timestamp = typeof remotePlayback.updatedAt === "number" ? remotePlayback.updatedAt : Date.now();
    const remoteIndex = Number.isInteger(remotePlayback.playlistIndex) ? remotePlayback.playlistIndex : 0;
    const expectedPosition = Math.max(0, remotePlayback.positionSeconds + (remotePlayback.isPlaying ? ((Date.now() + serverOffset.current - timestamp) / 1000) : 0));
    const trackChanged = instance.getPlaylistIndex?.() !== remoteIndex;
    if (trackChanged) instance.playVideoAt(remoteIndex);
    if (trackChanged || Math.abs(instance.getCurrentTime() - expectedPosition) > 1.5) instance.seekTo(expectedPosition, true);
    if (remotePlayback.isPlaying) instance.playVideo(); else instance.pauseVideo();
    setActiveIndex(remoteIndex);
    setIsPlaying(remotePlayback.isPlaying);
    initialPlaybackApplied.current = true;
    window.setTimeout(() => { remoteApplying.current = false; }, 900);
  }, [participantId, playerReady, remotePlayback]);

  useEffect(() => {
    let cancelled = false;
    const syncPlayerState = (instance: PlayerInstance) => {
      if (cancelled || !isReadablePlayer(instance)) return;
      setProgress(instance.getCurrentTime());
      setDuration(instance.getDuration());
      setActiveIndex(instance.getPlaylistIndex?.() ?? 0);
    };
    void loadYouTubeApi().then((YT) => {
      if (cancelled || !playerHost.current) return;
      player.current = new YT.Player(playerHost.current, {
        width: "100%", height: "100%",
        playerVars: { listType: "playlist", list: PLAYLIST_ID, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: (event: PlayerEvent) => {
            const videoIds = event.target.getPlaylist?.() ?? [];
            void resolvePlaylistItems(videoIds).then((playlist) => { if (!cancelled) setItems(playlist); });
            syncPlayerState(event.target);
            setPlayerReady(true);
            if (!cancelled) setIsLoading(false);
          },
          onStateChange: (event: PlayerEvent) => {
            setIsPlaying(event.data === PLAYER_PLAYING);
            syncPlayerState(event.target);
            window.setTimeout(() => publishRef.current(event.target), 125);
          },
        },
      });
    });
    const timer = window.setInterval(() => {
      if (!player.current) return;
      syncPlayerState(player.current);
      if (isHost && initialPlaybackApplied.current && isPlayingRef.current && Date.now() - lastPublishedAt.current >= 5000) publishRef.current(player.current);
    }, 500);
    return () => { cancelled = true; window.clearInterval(timer); player.current?.destroy(); player.current = null; };
  }, [isHost]);

  const progressPercent = duration ? Math.min((progress / duration) * 100, 100) : 0;
  const thumbnail = activeTrack ? `https://i.ytimg.com/vi/${activeTrack.id}/hqdefault.jpg` : undefined;

  return <section className="grid min-h-0 flex-1 gap-4" aria-label="Shared playlist">
    <div className="min-h-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-primary">Shared queue</p><h2 className="mt-1 text-lg font-semibold tracking-[-.04em]">Playlist</h2></div><span className="text-xs font-medium text-muted-foreground">{items.length || "…"} tracks</span></div>
      <div className="max-h-[15rem] overflow-y-auto p-2">
        {isLoading && <div className="flex items-center gap-3 px-3 py-8 text-sm text-muted-foreground"><LoaderCircle className="animate-spin text-primary" size={18} /> Loading playlist…</div>}
        {!isLoading && items.length === 0 && <div className="px-3 py-8 text-sm leading-6 text-muted-foreground">YouTube could not expose this playlist’s queue. Use the player controls below to start listening.</div>}
        {items.map((item, index) => <button key={item.id} disabled={!isHost} onClick={() => { player.current?.playVideoAt(index); setActiveIndex(index); window.setTimeout(() => publishCurrentPlayback(), 150); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${index === activeIndex ? "bg-accent" : "hover:bg-muted"}`}><span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs ${index === activeIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index === activeIndex && isPlaying ? <Music2 size={13} /> : index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.artist}</span></span></button>)}
      </div>
    </div>

    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-3 shadow-2xl shadow-black/20">
      <div ref={playerHost} className="pointer-events-none absolute inset-0 opacity-0" aria-hidden="true" />
      <div className="relative flex gap-3"><div className="size-[5.25rem] shrink-0 overflow-hidden rounded-2xl bg-muted">{thumbnail ? <img src={thumbnail} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-muted-foreground"><Music2 size={24} /></span>}</div><div className="min-w-0 flex-1 py-1"><p className="truncate text-[.94rem] font-semibold tracking-[-.025em]">{activeTrack?.title ?? "Your shared playlist"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{activeTrack?.artist ?? "YouTube Music"}</p><input aria-label="Seek through the current track" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(progress, duration)} disabled={!isHost} onChange={(event) => { const seconds = Number(event.target.value); player.current?.seekTo(seconds, true); setProgress(seconds); }} onMouseUp={() => publishCurrentPlayback()} onTouchEnd={() => publishCurrentPlayback()} className="mt-3 h-1 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60" /><div className="mt-1 flex justify-between text-[.64rem] text-muted-foreground"><span>{formatTime(progress)}</span><span>{formatTime(duration)}</span></div></div></div>
      <div className="relative mt-2 flex items-center justify-between px-1"><button aria-label="Previous track" disabled={!isHost} onClick={() => { player.current?.previousVideo(); window.setTimeout(() => publishCurrentPlayback(), 150); }} className="grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><SkipBack size={20} fill="currentColor" /></button><button aria-label={isPlaying ? "Pause" : "Play"} disabled={!isHost} onClick={() => { if (isPlaying) player.current?.pauseVideo(); else player.current?.playVideo(); window.setTimeout(() => publishCurrentPlayback(), 100); }} className="grid size-13 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 disabled:cursor-not-allowed disabled:opacity-60"><span>{isPlaying ? <Pause size={23} fill="currentColor" /> : <Play className="ml-0.5" size={23} fill="currentColor" />}</span></button><button aria-label="Next track" disabled={!isHost} onClick={() => { player.current?.nextVideo(); window.setTimeout(() => publishCurrentPlayback(), 150); }} className="grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><SkipForward size={20} fill="currentColor" /></button></div>
      {!isHost && <p className="relative mt-2 text-center text-xs text-muted-foreground">The host controls playback.</p>}
      {syncError && <p role="alert" className="relative mt-2 text-xs text-destructive">{syncError}</p>}
    </div>
  </section>;
}
