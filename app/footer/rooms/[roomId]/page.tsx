import RoomDetail from "./room-detail";

export default async function RoomPage({ params }: PageProps<"/footer/rooms/[roomId]">) {
  const { roomId } = await params;
  return <RoomDetail roomId={roomId} />;
}
