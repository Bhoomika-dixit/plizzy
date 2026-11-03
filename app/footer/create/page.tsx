import CreateGame from "./create-game";

export default async function CreatePage({ searchParams }: PageProps<"/footer/create">) {
  const params = await searchParams;
  return <CreateGame roomId={typeof params.room === "string" ? params.room : undefined} initialMode={params.mode === "multiplayer" ? "multiplayer" : "single_player"} initialTitle={typeof params.title === "string" ? params.title.slice(0,120) : undefined} initialIdea={typeof params.idea === "string" ? params.idea.slice(0,500) : undefined} />;
}
