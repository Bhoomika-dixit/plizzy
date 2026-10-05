import CreateGame from "./create-game";

export default async function CreatePage({ searchParams }: PageProps<"/footer/create">) {
  const params = await searchParams;
  return <CreateGame roomId={typeof params.room === "string" ? params.room : undefined} />;
}
