import { RoomScreen } from "@/features/room/room-screen";

export default async function RoomPage({ params }: PageProps<"/room/[roomId]">) {
  const { roomId } = await params;
  return <RoomScreen roomId={roomId} />;
}
