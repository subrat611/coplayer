"use client";

import { Check, LoaderCircle, Music2, Share2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { YouTubePlaylistPlayer } from "@/features/player/youtube-playlist-player";
import { useRoom } from "./use-room";

export function RoomScreen({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { roomId: activeRoomId, participantId, joinRoom, roomStatus, error } = useRoom();
  const [copied, setCopied] = useState(false);
  const admissionStarted = useRef(false);
  const isCreatorHandoff = roomStatus === "connected" && activeRoomId === roomId;

  useEffect(() => {
    // A newly created room is already authenticated, stored, and present.
    // Shared links and browser reloads have no matching context, so they run
    // the normal admission check here.
    if (isCreatorHandoff || admissionStarted.current) return;
    admissionStarted.current = true;
    void joinRoom(roomId).catch(() => undefined);
  }, [isCreatorHandoff, joinRoom, roomId]);

  async function shareRoom() {
    const url = window.location.href;
    if (navigator.share)
      await navigator.share({ title: "Join my CoPlayer room", url });
    else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  if (roomStatus === "joining" || roomStatus === "idle")
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
        <div className="grid justify-items-center gap-4 text-center">
          <LoaderCircle className="animate-spin text-primary" size={28} />
          <p className="text-sm text-muted-foreground">
            Joining your listening room…
          </p>
        </div>
      </main>
    );
  if (error)
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
        <section className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Room unavailable
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.06em]">
            This room is no longer available.
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {error}
          </p>
          <Button
            className="mt-6 h-12 w-full rounded-xl"
            onClick={() => router.push("/")}
          >
            Back to home
          </Button>
        </section>
      </main>
    );

  return (
    <main className="min-h-svh bg-background p-5 pt-[max(1.5rem,env(safe-area-inset-top))] text-foreground">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-[30rem] flex-col gap-5">
        <header className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Music2 size={20} />
          </span>
          <span className="text-sm font-semibold tracking-[-.04em]">
            co<span className="font-normal text-muted-foreground">player</span>
          </span>
        </header>
        <section className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Room connected</p><h1 className="mt-1 text-3xl font-semibold tracking-[-.07em]">Listen together.</h1></div><span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-xs font-medium text-muted-foreground"><Users size={14} /> 2 people</span></section>
        {participantId && <YouTubePlaylistPlayer roomId={roomId} participantId={participantId} />}
        <Button variant="outline" className="h-12 w-full rounded-xl" onClick={shareRoom}><Share2 size={17} /> {copied ? <><Check size={17} /> Link copied</> : "Invite a friend"}</Button>
      </div>
    </main>
  );
}
