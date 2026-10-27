import RoomsHome from "./rooms-home";

export default async function RoomsPage({ searchParams }: PageProps<"/footer/rooms">) {
  const params = await searchParams;
  return <RoomsHome invite={typeof params.invite === "string" ? params.invite.slice(0, 100) : undefined} />;
}
