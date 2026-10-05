import GameCreator from "./game-creator";

export default async function CreateGamePage({ searchParams }: PageProps<"/create-game">) {
  const params = await searchParams;
  const mode = params.mode === "multiplayer" ? "multiplayer" : "single_player";
  const title = typeof params.title === "string" ? params.title.slice(0, 120) : "My brilliant game";
  return <GameCreator mode={mode} title={title} />;
}
