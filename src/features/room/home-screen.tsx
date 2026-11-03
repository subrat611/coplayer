"use client";

import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Copy, Link2, LoaderCircle, Music2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRoom } from "./use-room";

export function HomeScreen() {
  const router = useRouter();
  const { createRoom, joinRoom, roomStatus, error } = useRoom();
  const [joinOpen, setJoinOpen] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const busy = roomStatus === "creating" || roomStatus === "joining";

  async function handleCreate() {
    try { router.push(`/room/${await createRoom()}`); } catch { /* Context exposes the retryable message. */ }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { router.push(`/room/${await joinRoom(roomInput)}`); } catch { /* Keep the dialog open to allow a retry. */ }
  }

  return (
    <main className="min-h-svh bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-foreground">
      <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-[30rem] flex-col">
        <header className="flex items-center justify-between"><div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><Music2 size={20} strokeWidth={2.4} /></div><span className="text-sm font-semibold tracking-[-0.04em]">co<span className="font-normal text-muted-foreground">player</span></span></header>
        <section className="my-auto py-14" aria-labelledby="home-title">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Listen together, anywhere</p>
            <h1 id="home-title" className="max-w-[10ch] text-balance text-[clamp(2.8rem,13vw,4.25rem)] font-semibold leading-[.92] tracking-[-0.075em]">Press play. Stay in sync.</h1>
            <p className="mt-6 max-w-[31ch] text-pretty text-[0.98rem] leading-7 text-muted-foreground">Create a private listening room and share the moment with one person.</p>
          </motion.div>
          <motion.div className="mt-10 grid gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}>
            <Button className="h-14 w-full justify-between rounded-2xl px-5 text-[0.96rem] shadow-lg shadow-primary/20" onClick={handleCreate} disabled={busy}>
              <span className="flex items-center gap-3">{roomStatus === "creating" ? <LoaderCircle className="animate-spin" size={19} /> : <Copy size={19} />} {roomStatus === "creating" ? "Creating room…" : "Create a room"}</span><ArrowRight size={19} />
            </Button>
            <Button variant="outline" className="h-14 w-full justify-between rounded-2xl px-5 text-[0.96rem]" onClick={() => setJoinOpen(true)} disabled={busy}>
              <span className="flex items-center gap-3"><Link2 size={19} /> Join with a code or link</span><ArrowRight size={19} />
            </Button>
          </motion.div>
          <AnimatePresence>{error && !joinOpen && <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</motion.p>}</AnimatePresence>
        </section>
        <footer className="flex items-center gap-3 text-sm text-muted-foreground"><span className="grid size-9 place-items-center rounded-full bg-muted"><Users size={16} /></span><p>Made for two. No account needed.</p></footer>
      </div>
      <AnimatePresence>{joinOpen && <motion.div className="fixed inset-0 z-10 flex items-end bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => !busy && setJoinOpen(false)}><motion.section role="dialog" aria-modal="true" aria-labelledby="join-title" className="mx-auto w-full max-w-[30rem] rounded-[1.5rem] border border-border bg-card p-5 shadow-2xl" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: "spring", damping: 27, stiffness: 320 }} onMouseDown={(event) => event.stopPropagation()}><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.13em] text-primary">Join a room</p><h2 id="join-title" className="mt-2 text-2xl font-semibold tracking-[-.05em]">You’re almost in.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Paste the room link or enter the room code shared with you.</p></div><form className="grid gap-3" onSubmit={handleJoin}><label className="sr-only" htmlFor="room-input">Room link or code</label><input id="room-input" autoFocus value={roomInput} onChange={(event) => setRoomInput(event.target.value)} placeholder="Paste link or room code" className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20" disabled={busy} /><AnimatePresence>{error && <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive">{error}</motion.p>}</AnimatePresence><div className="mt-2 grid grid-cols-2 gap-3"><Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={() => setJoinOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" className="h-12 rounded-xl" disabled={busy || !roomInput.trim()}>{roomStatus === "joining" && <LoaderCircle className="animate-spin" size={16} />} {roomStatus === "joining" ? "Joining…" : "Join room"}</Button></div></form></motion.section></motion.div>}</AnimatePresence>
    </main>
  );
}
